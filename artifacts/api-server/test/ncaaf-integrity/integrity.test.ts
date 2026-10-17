import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  captureNcaafSource, classifyNcaafPhase, normalizeNcaafFinalEvidence, verifyNcaafFinalEvidence,
  ncaafIntegrityHash, assessNcaafHistoricalEligibility, type NcaafIdentity, type NcaafIdentityBinding, type NcaafSourceCapture,
} from "../../src/services/ncaafHistoricalIntegrity";
import {
  conflictingNcaafFinalIds, prepareNcaafFinal, reconcileNcaafFinal,
  type NcaafFinalInput, type NcaafFinalStore, type NcaafStoredFinal,
} from "../../src/services/ncaafFinalIngestion";
import { planNcaafHistoricalCoverage } from "../../src/services/ncaafHistoricalCoverage";
import { expectedBlock, assertSafeImport } from "../nfl-offline/guard.mjs";

// Entirely synthetic regression fixtures, NOT acquired independent evidence.
const kickoff = "2026-08-29T23:00:00.000Z", captured = "2026-08-30T04:00:00.000Z", asOf = "2026-08-30T12:00:00.000Z";
const identity: NcaafIdentity = { gameId: "NCAAF-401862693", homeTeamId: "2439", awayTeamId: "235", kickoffAt: kickoff };
const url = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=20260829&limit=100";
function event(options: { home?: unknown; away?: unknown; year?: number; phase?: unknown; completed?: boolean; state?: string; name?: string } = {}) {
  return {
    id: "401862693", date: kickoff, season: { year: options.year ?? 2026, type: options.phase ?? 2 },
    status: { type: { completed: options.completed ?? true, state: options.state ?? "post", name: options.name ?? "STATUS_FINAL" } },
    competitions: [{ date: kickoff, competitors: [
      { homeAway: "home", team: { id: "2439" }, score: Object.hasOwn(options, "home") ? options.home : "21" },
      { homeAway: "away", team: { id: "235" }, score: Object.hasOwn(options, "away") ? options.away : "27" },
    ] }],
  };
}
const capture = (e: unknown = event(), sourceUrl = url, capturedAt = captured) =>
  captureNcaafSource("ESPN", e, sourceUrl, capturedAt)!;
const input = (e = event()): NcaafFinalInput => ({
  sport: "NCAAF", espnId: identity.gameId, homeTeamId: identity.homeTeamId, awayTeamId: identity.awayTeamId,
  commenceTimeISO: kickoff, homeScore: Number(e.competitions[0]!.competitors[0]!.score),
  awayScore: Number(e.competitions[0]!.competitors[1]!.score), ncaafFinalCapture: capture(e),
});
const binding: NcaafIdentityBinding = {
  canonical: identity, sourceEventId: "9001", sourceHomeTeamId: "8001", sourceAwayTeamId: "8002",
  mappingEvidenceHash: "a".repeat(64),
};
function reference(provider: "CFBD" | "NCAA_OFFICIAL", overrides: Record<string, unknown> = {}): NcaafSourceCapture {
  const cfbd = provider === "CFBD";
  const payload = cfbd ? {
    id: 9001, homeId: 8001, awayId: 8002, startDate: kickoff, completed: true,
    season: 2026, seasonType: "regular", homePoints: 21, awayPoints: 27, ...overrides,
  } : {
    sport: "NCAAF", id: 9001, homeTeamId: 8001, awayTeamId: 8002, kickoffAt: kickoff, completed: true,
    season: 2026, seasonType: "regular", homeScore: 21, awayScore: 27, ...overrides,
  };
  return captureNcaafSource(provider, payload, cfbd ? "https://api.collegefootballdata.com/games?year=2026"
    : "https://stats.ncaa.org/contests/9001", captured, binding)!;
}
function stored(homeScore = 21, awayScore = 27, withResult = true): NcaafStoredFinal {
  return {
    game: { id: identity.gameId, sport: "NCAAF", status: "final", homeTeamId: identity.homeTeamId,
      awayTeamId: identity.awayTeamId, startsAt: new Date(kickoff), homeScore, awayScore },
    result: withResult ? { homeScore: 21, awayScore: 27, rawResultJson: { originalProviderFact: "preserve-me" } } : null,
  };
}
/** Fake transaction port: exercises real reconciler, not PostgreSQL guarantees. */
function memoryStore(initial: NcaafStoredFinal | null) {
  let value = structuredClone(initial), gate = Promise.resolve(), writes = 0, failResult = false;
  const store: NcaafFinalStore = {
    async transaction(_id, work) {
      const prior = gate;
      let release!: () => void;
      gate = new Promise<void>(r => { release = r; });
      await prior;
      const backup = structuredClone(value), oldWrites = writes;
      try {
        return await work({
          read: async () => structuredClone(value),
          ensureFixture: async pending => {
            value = stored(21, 27, false);
            value.game.status = pending ? "final" : "upcoming";
            if (pending) { value.game.homeScore = null; value.game.awayScore = null; }
            writes++; return true;
          },
          writeGame: async (home, away) => {
            value!.game.status = "final"; value!.game.homeScore = home; value!.game.awayScore = away; writes++;
          },
          writeResult: async (home, away, raw) => {
            if (failResult) throw new Error("SYNTHETIC_RESULT_WRITE_FAILURE");
            value!.result = { homeScore: home, awayScore: away, rawResultJson: raw }; writes++;
          },
        });
      } catch (error) { value = backup; writes = oldWrites; throw error; }
      finally { release(); }
    },
  };
  return { store, value: () => structuredClone(value), writes: () => writes, failResult: (v: boolean) => { failResult = v; } };
}

describe("NCAA-only final normalization", () => {
  it("accepts an explicit completed result and canonicalizes timestamps", () => {
    const result = normalizeNcaafFinalEvidence(identity, capture(), asOf);
    expect(result.decision).toBe("ACCEPTED");
    expect(result.fact).toMatchObject({ season: 2026, phase: "REGULAR_SEASON", homeScore: 21, awayScore: 27 });
  });
  it.each([0, "0"])("accepts a legitimate shutout %s", home => {
    expect(normalizeNcaafFinalEvidence(identity, capture(event({ home })), asOf).decision).toBe("ACCEPTED");
  });
  it.each([undefined, null, "", " ", "-1", -1, 1.5, "1.5", NaN, Infinity, true, {}, [], "abc", 2_147_483_648])(
    "rejects incomplete/non-integer/out-of-range score %j", home => {
      expect(normalizeNcaafFinalEvidence(identity, capture(event({ home })), asOf).decision).not.toBe("ACCEPTED");
    },
  );
  it("quarantines 0–0 rather than interpreting it as a shutout", () => {
    expect(normalizeNcaafFinalEvidence(identity, capture(event({ home: 0, away: 0 })), asOf).reasons)
      .toContain("SUSPICIOUS_ZERO_ZERO_FINAL");
  });
  it("quarantines modern NCAA tied finals", () => {
    expect(normalizeNcaafFinalEvidence(identity, capture(event({ home: 27 })), asOf).reasons).toContain("MODERN_NCAAF_TIED_FINAL");
  });
  it.each([
    { completed: false }, { state: "in" }, { name: "STATUS_POSTPONED" }, { name: "STATUS_CANCELED" },
  ])("requires explicit compatible completion status %j", options => {
    expect(normalizeNcaafFinalEvidence(identity, capture(event(options)), asOf).reasons).toContain("NOT_A_VERIFIED_COMPLETED_GAME");
  });
  it.each(["NFL-401862693", "MLB-401862693", "401862693", "NCAAF-0"])("rejects another sport/noncanonical identity %s", gameId => {
    expect(normalizeNcaafFinalEvidence({ ...identity, gameId }, capture(), asOf).decision).toBe("REJECTED");
  });
  it("rejects reversed team assignments", () => {
    expect(normalizeNcaafFinalEvidence({ ...identity, homeTeamId: "235", awayTeamId: "2439" }, capture(), asOf).reasons)
      .toContain("EVENT_OR_TEAM_IDENTITY_MISMATCH");
  });
  it("rejects the wrong event", () => {
    expect(normalizeNcaafFinalEvidence(identity, capture({ ...event(), id: "999" }), asOf).decision).toBe("REJECTED");
  });
  it("rejects a different kickoff", () => {
    expect(normalizeNcaafFinalEvidence({ ...identity, kickoffAt: "2026-08-30T00:00:00Z" }, capture(), asOf).decision).toBe("REJECTED");
  });
  it("rejects ambiguous competitions", () => {
    const e = event(); e.competitions.push(e.competitions[0]!);
    expect(normalizeNcaafFinalEvidence(identity, capture(e), asOf).reasons).toContain("AMBIGUOUS_COMPETITION");
  });
  it("rejects duplicate home/away slots", () => {
    const e = event(); e.competitions[0]!.competitors[1]!.homeAway = "home";
    expect(normalizeNcaafFinalEvidence(identity, capture(e), asOf).reasons).toContain("AMBIGUOUS_TEAMS");
  });
  it.each([kickoff, "2026-08-29T20:00:00Z", "2026-08-31T00:00:00Z", "invalid", "2026-08-30T04:00:00"])(
    "quarantines unsafe capture time %s", time => {
      expect(normalizeNcaafFinalEvidence(identity, capture(event(), url, time), asOf).reasons).toContain("UNSAFE_EVIDENCE_TIME");
    },
  );
  it("rejects tampered payloads", () => {
    const c = capture(); expect(normalizeNcaafFinalEvidence(identity, { ...c, payloadHash: "0".repeat(64) }, asOf).reasons)
      .toContain("SOURCE_HASH_MISMATCH");
  });
  it.each([
    url.replace("college-football", "nfl"), url.replace("https:", "http:"), url.replace("site.api.espn.com", "attacker.invalid"),
    url + "&token=x", url + "#fragment", url.replace("20260829", "20260231"),
    url.replace("site.api.espn.com", "user:pass@site.api.espn.com"),
  ])("rejects wrong-sport/invalid source URL %s", source => {
    expect(normalizeNcaafFinalEvidence(identity, capture(event(), source), asOf).decision).toBe("REJECTED");
  });
  it("preserves a snapshot instead of mutable caller payload", () => {
    const e = event(), c = capture(e); e.id = "999";
    expect(normalizeNcaafFinalEvidence(identity, c, asOf).decision).toBe("ACCEPTED");
  });
  it("rejects oversized/cyclic captures", () => {
    expect(captureNcaafSource("ESPN", { huge: "x".repeat(256_001) }, url, captured)).toBeNull();
    const cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
    expect(captureNcaafSource("ESPN", cyclic, url, captured)).toBeNull();
  });
});

describe("NCAA season classification and independent provenance", () => {
  it.each([
    [2, null, null, "REGULAR_SEASON"], ["regular", null, null, "REGULAR_SEASON"],
    [3, null, null, "POSTSEASON"], ["postseason", null, "Bowl", "BOWL"],
    ["postseason", { competition: "cfp" }, "Rose Bowl", "CFP"],
    ["regular", { competition: "cfp" }, null, "UNKNOWN"],
    [1, null, null, "EXHIBITION"], ["exhibition", null, null, "EXHIBITION"],
    [undefined, null, null, "UNKNOWN"], ["2", null, null, "UNKNOWN"],
  ])("classifies %j as %s", (phase, playoff, bowl, expected) => {
    expect(classifyNcaafPhase(phase, playoff, bowl)).toBe(expected);
  });
  it("quarantines an exhibition final", () => {
    expect(normalizeNcaafFinalEvidence(identity, capture(event({ phase: 1 })), asOf).reasons).toContain("EXHIBITION_EXCLUDED");
  });
  it("does not borrow the scoreboard's/global phase", () => {
    const e: Record<string, unknown> = event(); delete e.season;
    expect(normalizeNcaafFinalEvidence(identity, capture(e), asOf).reasons).toContain("SEASON_KICKOFF_MISMATCH");
  });
  it("keeps an NCAA postseason final eligible rather than applying NFL exclusion", () => {
    expect(normalizeNcaafFinalEvidence(identity, capture(event({ phase: 3 })), asOf).fact?.phase).toBe("POSTSEASON");
  });
  it("keeps January postseason assigned to the prior season", () => {
    const start = "2027-01-15T23:00:00.000Z", after = "2027-01-16T12:00:00.000Z", e = event({ phase: 3 });
    e.date = start; e.competitions[0]!.date = start;
    const c = capture(e, url.replace("20260829", "20270115"), after);
    expect(normalizeNcaafFinalEvidence({ ...identity, kickoffAt: start }, c, after).fact?.season).toBe(2026);
  });
  it.each([2025, 2027])("rejects a contradictory season year %s", year => {
    expect(normalizeNcaafFinalEvidence(identity, capture(event({ year })), asOf).reasons).toContain("SEASON_KICKOFF_MISMATCH");
  });
  it("quarantines missing reference evidence", () => {
    expect(verifyNcaafFinalEvidence(identity, [], asOf).decision).toBe("QUARANTINED");
  });
  it("does not count duplicate ESPN observations as independent", () => {
    expect(verifyNcaafFinalEvidence(identity, [capture(), capture()], asOf).verification).toBe("SINGLE_UPSTREAM");
  });
  it("does not assume CFBD and ESPN have independent upstream outcomes", () => {
    expect(verifyNcaafFinalEvidence(identity, [capture(), reference("CFBD")], asOf).verification).toBe("SINGLE_UPSTREAM");
  });
  it("accepts supplied mapped NCAA official evidence as an independent family", () => {
    expect(verifyNcaafFinalEvidence(identity, [capture(), reference("NCAA_OFFICIAL")], asOf).verification)
      .toBe("INDEPENDENTLY_CORROBORATED");
  });
  it("quarantines a conflicting score even with two agreeing duplicate records", () => {
    expect(verifyNcaafFinalEvidence(identity, [capture(), capture(), reference("NCAA_OFFICIAL", { homeScore: 20 })], asOf).reasons)
      .toContain("CONFLICTING_SOURCE_FINALS");
  });
  it("requires an explicit source-to-canonical binding rather than equal numeric IDs", () => {
    const c = reference("CFBD"); delete (c as { binding?: unknown }).binding;
    expect(normalizeNcaafFinalEvidence(identity, c, asOf).reasons).toContain("VERIFIED_SOURCE_IDENTITY_BINDING_REQUIRED");
  });
  it("handles wrapped CFBD game payloads", () => {
    const c = reference("CFBD");
    const wrapped = captureNcaafSource("CFBD", { game: c.payload }, c.sourceUrl, captured, binding)!;
    expect(normalizeNcaafFinalEvidence(identity, wrapped, asOf).decision).toBe("ACCEPTED");
  });
  it("rejects regular/postseason disagreements", () => {
    expect(verifyNcaafFinalEvidence(identity, [capture(), reference("NCAA_OFFICIAL", { seasonType: "postseason" })], asOf).reasons)
      .toContain("CONFLICTING_SOURCE_FINALS");
  });
  it("uses the last required source's actual capture time, never an earlier observation", () => {
    const r = reference("NCAA_OFFICIAL");
    const later = { ...r, capturedAt: "2026-08-30T05:00:00Z" };
    const evidence = verifyNcaafFinalEvidence(identity, [capture(), later], asOf);
    expect(evidence.fact!.capturedAt).toBe("2026-08-30T05:00:00.000Z");
    expect(assessNcaafHistoricalEligibility(evidence, {
      targetKickoffAt: "2026-08-30T04:30:00Z", allowedSeasons: [2026], homeClassification: "fbs", awayClassification: "fbs",
    }).eligible).toBe(false);
  });
  it("admits corroborated FBS history only into an explicit later-game context", () => {
    const evidence = verifyNcaafFinalEvidence(identity, [capture(), reference("NCAA_OFFICIAL")], asOf);
    const context = { targetKickoffAt: "2026-09-05T20:00:00Z", allowedSeasons: [2026],
      homeClassification: "fbs", awayClassification: "fbs" };
    expect(assessNcaafHistoricalEligibility(evidence, context).eligible).toBe(true);
    expect(assessNcaafHistoricalEligibility(evidence, { ...context, awayClassification: "fcs" }).eligible).toBe(false);
    expect(assessNcaafHistoricalEligibility(evidence, { ...context, allowedSeasons: [2025] }).eligible).toBe(false);
    expect(assessNcaafHistoricalEligibility(verifyNcaafFinalEvidence(identity, [capture()], asOf), context).eligible).toBe(false);
  });
});

describe("actual NCAA reconciler through an isolated transaction port", () => {
  it("fixes the synthetic Memphis–UNLV stale 0–0 fixture when its result matches source evidence", async () => {
    const s = memoryStore(stored(0, 0));
    expect((await reconcileNcaafFinal(s.store, input(), asOf)).outcome).toBe("UPDATED");
    expect(s.value()!.game).toMatchObject({ homeScore: 21, awayScore: 27, status: "final" });
    expect(s.value()!.result!.rawResultJson).toMatchObject({ originalProviderFact: "preserve-me" });
  });
  it("fixes a nonzero stale fixture without changing an already matching result", async () => {
    const s = memoryStore(stored(14, 10));
    await reconcileNcaafFinal(s.store, input(), asOf);
    expect(s.value()!.game.homeScore).toBe(21); expect(s.value()!.result!.awayScore).toBe(27);
  });
  it("adds a missing result only from a bound provider final", async () => {
    const s = memoryStore(stored(21, 27, false));
    expect((await reconcileNcaafFinal(s.store, input(), asOf)).outcome).toBe("INSERTED");
  });
  it("never creates a result from games-table scores alone", async () => {
    const s = memoryStore(stored(21, 27, false));
    const i = { ...input(), ncaafFinalCapture: undefined };
    expect((await reconcileNcaafFinal(s.store, i, asOf)).outcome).toBe("QUARANTINED");
    expect(s.writes()).toBe(0); expect(s.value()!.result).toBeNull();
  });
  it("quarantines a conflicting stored result without independent corroboration", async () => {
    const v = stored(); v.result!.homeScore = 30; const s = memoryStore(v);
    expect((await reconcileNcaafFinal(s.store, input(), asOf)).reasons).toContain("STORED_FINAL_CONFLICT_REQUIRES_INDEPENDENT_EVIDENCE");
    expect(s.writes()).toBe(0);
  });
  it("does not let CFBD's unknown upstream authorize replacement", async () => {
    const v = stored(); v.result!.homeScore = 30; const s = memoryStore(v);
    expect((await reconcileNcaafFinal(s.store, input(), asOf, { references: [reference("CFBD")] })).outcome).toBe("QUARANTINED");
  });
  it("can prepare a corroborated correction with old scores and evidence preserved", async () => {
    const v = stored(30, 27); v.result!.homeScore = 30; const s = memoryStore(v);
    expect((await reconcileNcaafFinal(s.store, input(), asOf, { references: [reference("NCAA_OFFICIAL")] })).outcome).toBe("UPDATED");
    expect(s.value()!.result!.rawResultJson).toMatchObject({
      originalProviderFact: "preserve-me", tbmNcaafIntegrity: {
        verification: "INDEPENDENTLY_CORROBORATED", previous: { result: { homeScore: 30 } },
      },
    });
  });
  it("does not authorize a conflicting final without a result merely because its fixture says final", async () => {
    const s = memoryStore(stored(0, 0, false));
    expect((await reconcileNcaafFinal(s.store, input(), asOf)).outcome).toBe("QUARANTINED");
  });
  it("rolls back both records after a simulated interrupted result write and safely retries", async () => {
    const before = stored(0, 0), s = memoryStore(before); s.failResult(true);
    await expect(reconcileNcaafFinal(s.store, input(), asOf)).rejects.toThrow("SYNTHETIC_RESULT_WRITE_FAILURE");
    expect(s.value()).toEqual(before); expect(s.writes()).toBe(0);
    s.failResult(false); expect((await reconcileNcaafFinal(s.store, input(), asOf)).outcome).toBe("UPDATED");
  });
  it("is idempotent across concurrent callers through the locked transaction port", async () => {
    const s = memoryStore(stored(0, 0));
    const results = await Promise.all(Array.from({ length: 4 }, () => reconcileNcaafFinal(s.store, input(), asOf)));
    expect(results.filter(r => r.outcome === "UPDATED")).toHaveLength(1);
    expect(results.filter(r => r.outcome === "DUPLICATE")).toHaveLength(3);
    expect(s.writes()).toBe(2);
  });
  it("never downgrades independently corroborated provenance with a later single-source poll", async () => {
    const s = memoryStore(stored());
    await reconcileNcaafFinal(s.store, input(), asOf, { references: [reference("NCAA_OFFICIAL")] });
    const before = s.value();
    expect((await reconcileNcaafFinal(s.store, input(), "2026-08-31T12:00:00Z")).outcome).toBe("DUPLICATE");
    expect(s.value()).toEqual(before);
  });
  it("preserves stronger proof when repairing a subsequently stale fixture", async () => {
    const v = stored(0, 0);
    v.result!.rawResultJson = { tbmNcaafIntegrity: {
      schemaVersion: "ncaaf-final-integrity-v1", season: 2026, phase: "REGULAR_SEASON",
      verification: "INDEPENDENTLY_CORROBORATED", evidenceHashes: ["strong-proof"], availableAt: captured,
    } };
    const s = memoryStore(v);
    await reconcileNcaafFinal(s.store, input(), asOf);
    expect(s.value()!.result!.rawResultJson).toMatchObject({ tbmNcaafIntegrity: {
      verification: "INDEPENDENTLY_CORROBORATED", availableAt: captured,
    } });
  });
  it("quarantines regular-season observations conflicting with existing postseason proof", async () => {
    const v = stored();
    v.result!.rawResultJson = { tbmNcaafIntegrity: { season: 2026, phase: "POSTSEASON" } };
    const s = memoryStore(v);
    expect((await reconcileNcaafFinal(s.store, input(), asOf)).reasons).toContain("STORED_SEASON_PHASE_CONFLICT");
    expect(s.writes()).toBe(0);
  });
  it("rejects another sport before opening a transaction", async () => {
    const store: NcaafFinalStore = { transaction: () => { throw new Error("SHOULD_NOT_OPEN"); } };
    expect((await reconcileNcaafFinal(store, { ...input(), sport: "NFL" }, asOf)).outcome).toBe("QUARANTINED");
  });
  it("does not write a stored fixture belonging to another sport", async () => {
    const v = stored(); v.game.sport = "NFL"; const s = memoryStore(v);
    expect((await reconcileNcaafFinal(s.store, input(), asOf)).reasons).toContain("STORED_FIXTURE_WRONG_SPORT");
    expect(s.writes()).toBe(0);
  });
  it("quarantines stored team identity mismatches without any writes", async () => {
    const v = stored(); v.game.homeTeamId = "999"; const s = memoryStore(v);
    expect((await reconcileNcaafFinal(s.store, input(), asOf)).reasons).toContain("STORED_FIXTURE_IDENTITY_CONFLICT");
    expect(s.writes()).toBe(0);
  });
  it("creates only a NULL-score pending fixture for an invalid new final", async () => {
    const s = memoryStore(null);
    expect((await reconcileNcaafFinal(s.store, input(event({ home: 0, away: 0 })), asOf)).outcome).toBe("QUARANTINED");
    expect(s.value()!.game.homeScore).toBeNull(); expect(s.value()!.result).toBeNull();
  });
  it("creates a new bound fixture and result together", async () => {
    const s = memoryStore(null);
    expect((await reconcileNcaafFinal(s.store, input(), asOf)).outcome).toBe("INSERTED");
    expect(s.value()!.result!.awayScore).toBe(27);
  });
  it("rejects fetched score values detached from captured evidence", () => {
    expect(prepareNcaafFinal({ ...input(), homeScore: 99 }, asOf).reasons).toContain("FETCHED_SCORE_BINDING_MISMATCH");
  });
  it("preflights conflicting duplicates before any writes", async () => {
    const first = input(), other = input(event({ home: 20 }));
    expect([...conflictingNcaafFinalIds([first, other])]).toEqual([identity.gameId]);
    const s = memoryStore(stored());
    expect((await reconcileNcaafFinal(s.store, first, asOf, { batchConflict: true })).outcome).toBe("QUARANTINED");
    expect(s.writes()).toBe(0);
  });
  it("does not mark equivalent repeated observations or other sports as conflicts", () => {
    const first = input(), newer = { ...first, ncaafFinalCapture: capture(event(), url, "2026-08-30T05:00:00Z") };
    expect(conflictingNcaafFinalIds([first, newer, { ...first, sport: "NFL", homeScore: 99 }]).size).toBe(0);
  });
});

describe("bounded offline NCAA coverage and safety wiring", () => {
  const fact = normalizeNcaafFinalEvidence(identity, capture(), asOf).fact!;
  const bounds = { from: "2026-08-29T00:00:00Z", to: "2026-08-30T00:00:00Z", asOf };
  it("detects missing fixtures without executing recovery", () => {
    const report = planNcaafHistoricalCoverage([fact], [], bounds);
    expect(report.scope).toBe("SUPPLIED_CORPUS_ONLY"); expect(report.missing).toBe(1);
    expect(report.recoveryCandidates[0]!.gameId).toBe(identity.gameId);
  });
  it("reports coverage separately from duplicate and conflicting identities", () => {
    expect(planNcaafHistoricalCoverage([fact], [identity], bounds).covered).toBe(1);
    expect(planNcaafHistoricalCoverage([fact], [identity, identity], bounds).rows[0]!.status).toBe("DUPLICATE_KNOWN_EVENT");
    expect(planNcaafHistoricalCoverage([fact], [{ ...identity, homeTeamId: "999" }], bounds).quarantined).toBe(1);
  });
  it("does not choose among conflicting expected schedule records", () => {
    const report = planNcaafHistoricalCoverage([fact, { ...fact, homeScore: 20 }], [], bounds);
    expect(report.quarantined).toBe(1); expect(report.recoveryCandidates).toHaveLength(0);
  });
  it("excludes exhibitions/unknown phase but retains NCAA postseason", () => {
    expect(planNcaafHistoricalCoverage([{ ...fact, phase: "EXHIBITION" }], [], bounds).expected).toBe(0);
    expect(planNcaafHistoricalCoverage([{ ...fact, phase: "UNKNOWN" }], [], bounds).expected).toBe(0);
    expect(planNcaafHistoricalCoverage([{ ...fact, phase: "BOWL" }], [], bounds).expected).toBe(1);
  });
  it("caps recovery candidates at the explicitly requested bound", () => {
    const report = planNcaafHistoricalCoverage(Array.from({ length: 70 }, (_, i) => ({
      ...fact, identity: { ...identity, gameId: `NCAAF-${500000000 + i}` },
    })), [], { ...bounds, limit: 10 });
    expect(report.recoveryCandidates).toHaveLength(10); expect(report.remainingCandidates).toBe(60);
  });
  it.each([{ limit: 0 }, { limit: 65 }, { to: "2026-10-30T00:00:00Z" }, { from: "2026-01-01T00:00:00Z" }])(
    "rejects unbounded/future recovery windows %j", override => {
      expect(() => planNcaafHistoricalCoverage([fact], [], { ...bounds, ...override })).toThrow("INVALID_NCAAF_RECOVERY_BOUNDS");
    },
  );
  it("has no ambient database credentials in the test process", () => {
    expect(process.env.DATABASE_URL).toBeUndefined(); expect(process.env.RENDER_API_KEY).toBeUndefined();
    expect(process.env.PGPASSWORD).toBeUndefined(); expect(process.env.SCHEDULER_ENABLED).toBe("false");
  });
  it("blocks network and startup imports even if a caller tries", () => {
    expect(() => expectedBlock(() => fetch("https://example.invalid"))).toThrow("OFFLINE_BLOCKED");
    expect(() => assertSafeImport("/project/src/app.ts")).toThrow("FORBIDDEN_IMPORT");
    expect(() => assertSafeImport("/project/src/services/scheduler.ts")).toThrow("FORBIDDEN_IMPORT");
    expect(() => assertSafeImport("pg")).toThrow("FORBIDDEN_IMPORT");
  });
  it("uses a separate NCAA SQL lock and never updates grading timestamps", () => {
    const source = readFileSync(resolve("src/services/ncaafFinalPersistence.ts"), "utf8");
    expect(source).toContain('pg_advisory_xact_lock(hashtext(${"ncaaf-final:" + id}))');
    expect(source).toContain('eq(gamesTable.sport, "NCAAF")');
    expect(source).not.toContain("gradedAt:"); expect(source).not.toContain('from "./nfl');
  });
  it("routes only NCAA finals to the independent writer and excludes the blind sync fallback", () => {
    const route = readFileSync(resolve("src/routes/games.ts"), "utf8");
    const grading = readFileSync(resolve("src/services/grading-runner.ts"), "utf8");
    expect(route).toContain('game.sport === "NCAAF" && game.status === "final"');
    expect(grading).toContain('.filter(g => g.sport !== "NCAAF")');
    expect(grading).toContain('fetchSportGamesByDate("NCAAF"');
    expect(grading).toContain("slice(0, 64)"); expect(grading).toContain("slice(0, 8)");
    expect(grading).toContain('proofVersion: sql<string | null>');
  });
  it("does not import NFL model or integrity rules into NCAA validation", () => {
    for (const file of ["ncaafHistoricalIntegrity.ts", "ncaafFinalIngestion.ts", "ncaafFinalPersistence.ts", "ncaafHistoricalCoverage.ts"]) {
      expect(readFileSync(resolve("src/services", file), "utf8")).not.toMatch(/from\s+["'][^"']*nfl/i);
    }
  });
  it("uses stable payload hashes independent of key insertion order", () => {
    expect(ncaafIntegrityHash({ b: 1, a: 2 })).toBe(ncaafIntegrityHash({ a: 2, b: 1 }));
  });
});
