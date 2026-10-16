import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { captureNflFinalEvent, conflictingNflFinalIds, prepareNflFinal, reconcileNflFinal,
  type NflFinalInput, type NflFinalStore, type NflFinalTransaction, type NflStoredFinal } from "../../src/services/nflFinalIngestion";
import { classifyNflStoredHistory, selectNflRegularSeasonHistory } from "../../src/services/nflHistoricalSeasonPolicy";
import { record } from "../../src/services/nflHistoricalResultNormalization";
import { finalEvent } from "./result-fixtures";

const url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20260913&limit=100";
const observedAt = "2026-09-14T05:00:00.000Z", later = "2026-09-14T06:00:00.000Z";
const input = (event: unknown = finalEvent(), time = observedAt): NflFinalInput => ({
  espnId: "NFL-900000001", sport: "NFL", homeTeamId: "12", awayTeamId: "7",
  commenceTimeISO: "2026-09-14T00:20:00Z", homeScore: 31, awayScore: 10,
  nflFinalCapture: captureNflFinalEvent(event, url, time),
});

/** In-memory transactional fake. No DB imports/connections, not a DB integration test. */
function fixtureStore(initial: NflStoredFinal | null = null, failAt?: string) {
  let state = structuredClone(initial), writes = 0;
  let queue = Promise.resolve();
  const port: NflFinalStore = {
    async transaction<T>(_id: string, work: (tx: NflFinalTransaction) => Promise<T>) {
      let unlock!: () => void;
      const preceding = queue; queue = new Promise<void>(resolve => { unlock = resolve; });
      await preceding;
      let draft: { -readonly [K in keyof NflStoredFinal]: NflStoredFinal[K] } | null = structuredClone(state);
      let draftWrites = 0;
      const fault = (point: string) => { if (point === failAt) throw new Error(`INTERRUPTED:${point}`); };
      try {
        const result = await work({
          async read() { return structuredClone(draft); },
          async ensureFixture(pending) {
            draft = { game: { id: "NFL-900000001", sport: "NFL", status: "final",
              homeTeamId: "12", awayTeamId: "7", startsAt: new Date("2026-09-14T00:20:00Z"),
              homeScore: pending ? null : 31, awayScore: pending ? null : 10 }, result: null };
            draftWrites++; fault("fixture"); return true;
          },
          async quarantineFixture() {
            draft!.game = { ...draft!.game, status: "final", homeScore: null, awayScore: null };
            draftWrites++;
          },
          async writeGame(homeScore, awayScore) {
            draft!.game = { ...draft!.game, homeScore, awayScore, status: "final" };
            draftWrites++; fault("game");
          },
          async writeResult(homeScore, awayScore, rawResultJson) {
            draft!.result = { homeScore, awayScore, rawResultJson };
            draftWrites++; fault("result");
          },
          async writeQuarantine(rawResultJson) {
            draft!.result = { ...draft!.result!, rawResultJson }; draftWrites++; fault("quarantine");
          },
        });
        state = draft; writes += draftWrites;
        return result;
      } finally { unlock(); }
    },
  };
  return { port, state: () => structuredClone(state), writes: () => writes };
}
function history(s: NflStoredFinal) { return { ...s.game, resultEvidence: s.result?.rawResultJson }; }

describe("NFL ongoing event provenance and phase", () => {
  it("captures a detached parsed event without claiming raw bytes or independence", () => {
    const e = finalEvent(), f = input(e), capture = record(f.nflFinalCapture);
    e.season.type = 1;
    expect(record(record(capture.event).season).type).toBe(2);
    expect(capture.captureType).toBe("STABLE_PARSED_ESPN_EVENT_JSON");
    expect(prepareNflFinal(f, observedAt).decision).toBe("ACCEPTED");
  });
  it("accepts ESPN minute-precision kickoffs without rounding evidence capture timestamps", () => {
    const e = finalEvent({ date: "2026-09-14T00:20Z" });
    const f = { ...input(e), commenceTimeISO: "2026-09-14T00:20Z" };
    expect(prepareNflFinal(f, observedAt).decision).toBe("ACCEPTED");
    expect(prepareNflFinal(f, observedAt).normalized!.kickoff).toBe("2026-09-14T00:20:00.000Z");
    expect(prepareNflFinal(input(e, "2026-09-14T05:00Z"), observedAt).reasons).toContain("CAPTURE_NOT_AVAILABLE");
  });
  it.each([1, 2, 3])("classifies event-level phase %s and keeps PRE/POST out of regular history", async type => {
    const s = fixtureStore();
    await reconcileNflFinal(s.port, input(finalEvent({ seasonType: type })), observedAt);
    const decision = classifyNflStoredHistory(history(s.state()!), observedAt);
    expect(decision.decision).toBe(type === 2 ? "REGULAR_SEASON" : "EXCLUDED");
    expect(selectNflRegularSeasonHistory([history(s.state()!)], observedAt).history).toHaveLength(type === 2 ? 1 : 0);
    const proof = record(record(s.state()!.result!.rawResultJson).tbmNflProviderFinal);
    expect(proof.independentlyVerified).toBe(false);
    expect(proof.verificationStatus).toBe("SINGLE_PROVIDER_OBSERVATION");
  });
  it.each([0, 99])("quarantines unknown phase %s", type => {
    expect(prepareNflFinal(input(finalEvent({ seasonType: type })), observedAt).decision).toBe("QUARANTINED");
  });
  it("does not rescue absent event season metadata from scoreboard metadata", () => {
    const e: Record<string, unknown> = finalEvent(); delete e.season;
    expect(prepareNflFinal(input(e), observedAt).reasons).toContain("UNKNOWN_SEASON_PHASE");
    expect(prepareNflFinal(input(e), observedAt).reasons).toContain("MISSING_SEASON_YEAR");
  });
  it("quarantines conflicting season labels and invalid season years", () => {
    const e = finalEvent() as unknown as Record<string, unknown>;
    e.season = { year: 2026, type: 2, slug: "preseason" };
    expect(prepareNflFinal(input(e), observedAt).reasons).toContain("SEASON_PHASE_CONFLICT");
    e.season = { year: 2025, type: 2 };
    expect(prepareNflFinal(input(e), observedAt).reasons).toContain("SEASON_YEAR_KICKOFF_MISMATCH");
  });
  it.each(["https://example.invalid/scoreboard", url.replace("football/nfl", "football/college-football"),
    url + "&provider=second", url.replace("20260913", "20260231")])("rejects invalid source %s", sourceUrl => {
    const f = input(); f.nflFinalCapture && Object.assign(f.nflFinalCapture, { sourceUrl });
    expect(prepareNflFinal(f, observedAt).reasons).toContain("INVALID_ESPN_SOURCE_URL");
  });
  it("rejects modified captures and oversized/cyclic captures", () => {
    const f = input(); Object.assign(record(f.nflFinalCapture).event!, { id: "900000003" });
    expect(prepareNflFinal(f, observedAt).reasons).toContain("CAPTURE_HASH_MISMATCH");
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(captureNflFinalEvent(cyclic, url, observedAt)).toBeNull();
    expect(captureNflFinalEvent({ value: "x".repeat(256_001) }, url, observedAt)).toBeNull();
  });
  it("rejects a different upstream and scores outside the database integer range", () => {
    const f = input(); Object.assign(record(f.nflFinalCapture), { upstreamProvider: "NFLVERSE" });
    expect(prepareNflFinal(f, observedAt).reasons).toContain("MISSING_ESPN_EVENT_CAPTURE");
    expect(prepareNflFinal({ ...input(finalEvent({ homeScore: 2_147_483_648 })), homeScore: 2_147_483_648 }, observedAt)
      .reasons).toContain("SCORE_OUTSIDE_DATABASE_RANGE");
  });
  it("does not backdate availability or accept a final before kickoff", async () => {
    const s = fixtureStore(); await reconcileNflFinal(s.port, input(), observedAt);
    expect(classifyNflStoredHistory(history(s.state()!), "2026-09-14T04:59:59Z").decision).toBe("QUARANTINED");
    expect(prepareNflFinal(input(), "2026-09-14T04:59:59Z").reasons).toContain("CAPTURE_NOT_AVAILABLE");
    expect(prepareNflFinal(input(finalEvent(), "2026-09-13T23:00:00Z"), observedAt).reasons)
      .toContain("FINAL_OBSERVED_BEFORE_KICKOFF");
  });
  it.each([[0, 10], [31, 0], [9, 9]])("retains legitimate scores %s–%s", async (homeScore, awayScore) => {
    const f = { ...input(finalEvent({ homeScore, awayScore })), homeScore, awayScore };
    const s = fixtureStore(); expect((await reconcileNflFinal(s.port, f, observedAt)).outcome).toBe("INSERTED");
    expect(s.state()!.result!.homeScore).toBe(homeScore);
    expect(s.state()!.result!.awayScore).toBe(awayScore);
  });
  it.each([[0, 0], [31, null], ["31junk", 10], [-1, 10]])("quarantines suspicious/incomplete scores %s–%s", async (homeScore, awayScore) => {
    const f = input(finalEvent({ homeScore, awayScore })), s = fixtureStore();
    expect((await reconcileNflFinal(s.port, f, observedAt)).outcome).toBe("QUARANTINED");
    expect(s.state()!.game.homeScore).toBeNull();
    expect(s.state()!.result).toBeNull();
    expect(() => selectNflRegularSeasonHistory([history(s.state()!)], observedAt))
      .toThrow("NFL_HISTORY_SEASON_EVIDENCE_BLOCKED");
  });
  it("rejects nonfinal status, wrong identity and wrong kickoff", () => {
    const e = finalEvent(); e.status.type.state = "in"; e.status.type.completed = false;
    expect(prepareNflFinal(input(e), observedAt).reasons).toContain("NONFINAL_EVENT");
    expect(prepareNflFinal({ ...input(), homeTeamId: "13" }, observedAt).reasons).toContain("EXPECTED_IDENTITY_MISMATCH");
    expect(prepareNflFinal({ ...input(), commenceTimeISO: "2026-09-15T00:20:00Z" }, observedAt).decision).toBe("QUARANTINED");
  });
});

describe("NFL transactional final reconciliation", () => {
  it("writes scores, result and evidence together and rejects fake independent verification", async () => {
    const s = fixtureStore(); expect((await reconcileNflFinal(s.port, input(), observedAt)).outcome).toBe("INSERTED");
    expect(s.state()!.game.homeScore).toBe(s.state()!.result!.homeScore);
    const row = history(s.state()!), proof = record(record(row.resultEvidence).tbmNflProviderFinal);
    proof.independentlyVerified = true;
    expect(classifyNflStoredHistory(row, observedAt).decision).toBe("QUARANTINED");
  });
  it.each(["fixture", "game", "result"])("rolls back an interruption after %s and resumes cleanly", async point => {
    const s = fixtureStore(null, point);
    await expect(reconcileNflFinal(s.port, input(), observedAt)).rejects.toThrow(`INTERRUPTED:${point}`);
    expect(s.state()).toBeNull(); expect(s.writes()).toBe(0);
    const retry = fixtureStore(s.state()); await reconcileNflFinal(retry.port, input(), later);
    expect(retry.state()!.result!.homeScore).toBe(31);
  });
  it("serializes duplicate requests and preserves the first capture availability", async () => {
    const s = fixtureStore();
    const outcomes = await Promise.all([reconcileNflFinal(s.port, input(), observedAt), reconcileNflFinal(s.port, input(), later)]);
    expect(outcomes.map(o => o.outcome).sort()).toEqual(["DUPLICATE", "INSERTED"]);
    const before = s.state(), count = s.writes();
    const e = { ...finalEvent(), name: "new display label, unchanged final facts" };
    expect((await reconcileNflFinal(s.port, input(e, later), later)).outcome).toBe("DUPLICATE");
    expect(s.writes()).toBe(count); expect(s.state()).toEqual(before);
  });
  it("does not choose a winner among conflicting duplicate observations", async () => {
    const f = input(), other = { ...input(finalEvent({ homeScore: 20 })), homeScore: 20 };
    for (const batch of [[f, other], [other, f]]) {
      const conflicts = conflictingNflFinalIds(batch), s = fixtureStore();
      expect([...conflicts]).toEqual([f.espnId]);
      for (const item of batch) expect((await reconcileNflFinal(s.port, item, observedAt, conflicts.has(item.espnId))).outcome).toBe("QUARANTINED");
      expect(s.state()!.result).toBeNull();
    }
    expect(conflictingNflFinalIds([f, input(finalEvent(), later)]).size).toBe(0);
  });
  it("quarantines conflicting stored scores without changing either score pair", async () => {
    const s = fixtureStore(); await reconcileNflFinal(s.port, input(), observedAt);
    const result = await reconcileNflFinal(s.port, { ...input(finalEvent({ homeScore: 20 }), later), homeScore: 20 }, later);
    expect(result.reasons).toContain("STORED_FINAL_SCORE_CONFLICT");
    expect(s.state()!.game.homeScore).toBe(31); expect(s.state()!.result!.homeScore).toBe(31);
    expect(classifyNflStoredHistory(history(s.state()!), later).decision).toBe("QUARANTINED");
    const count = s.writes();
    await reconcileNflFinal(s.port, { ...input(finalEvent({ homeScore: 20 }), later), homeScore: 20 }, later);
    expect(s.writes()).toBe(count);
    await reconcileNflFinal(s.port, input(), later);
    expect(classifyNflStoredHistory(history(s.state()!), later).decision).toBe("QUARANTINED");
  });
  it("quarantines changed stored identity and phase", async () => {
    const s = fixtureStore(); await reconcileNflFinal(s.port, input(), observedAt);
    const bad = fixtureStore({ ...s.state()!, game: { ...s.state()!.game, homeTeamId: "13" } });
    expect((await reconcileNflFinal(bad.port, input(), later)).reasons).toContain("STORED_FIXTURE_IDENTITY_CONFLICT");
    expect((await reconcileNflFinal(s.port, input(finalEvent({ seasonType: 1 }), later), later)).reasons)
      .toContain("STORED_SEASON_PHASE_CONFLICT");
  });
  it("synchronizes a games-only 0–0 with a matching existing result, preserving unrelated raw keys", async () => {
    const s = fixtureStore(); await reconcileNflFinal(s.port, input(), observedAt);
    const old = s.state()!;
    const repair = fixtureStore({ game: { ...old.game, homeScore: 0, awayScore: 0 },
      result: { ...old.result!, rawResultJson: { originalProviderField: "preserve" } } });
    expect((await reconcileNflFinal(repair.port, input(), later)).outcome).toBe("UPDATED");
    expect(repair.state()!.game.homeScore).toBe(31);
    expect(record(repair.state()!.result!.rawResultJson).originalProviderField).toBe("preserve");
  });
  it("makes an unverified completed fixture block history instead of silently retaining it as live", async () => {
    const s = fixtureStore(); await reconcileNflFinal(s.port, input(), observedAt);
    const pending = fixtureStore({ game: { ...s.state()!.game, status: "live" }, result: null });
    await reconcileNflFinal(pending.port, { ...input(), nflFinalCapture: null }, later);
    expect(pending.state()!.game.status).toBe("final");
    expect(pending.state()!.game.homeScore).toBeNull();
    expect(classifyNflStoredHistory(history(pending.state()!), later).decision).toBe("QUARANTINED");
    await reconcileNflFinal(pending.port, input(), later);
    expect(classifyNflStoredHistory(history(pending.state()!), later).decision).toBe("REGULAR_SEASON");
  });
  it("does not write another sport or accept a wrong sport prefix", async () => {
    const s = fixtureStore(); await reconcileNflFinal(s.port, input(), observedAt);
    const other = fixtureStore({ ...s.state()!, game: { ...s.state()!.game, sport: "NBA" } });
    expect((await reconcileNflFinal(other.port, input(), later)).reasons).toContain("STORED_FIXTURE_WRONG_SPORT");
    expect(other.writes()).toBe(0);
    expect((await reconcileNflFinal(other.port, { ...input(), espnId: "NBA-900000001" }, later)).outcome).toBe("QUARANTINED");
  });
  it("quarantines missing new metadata without revoking an unchanged, already observed final", async () => {
    const s = fixtureStore(); await reconcileNflFinal(s.port, input(), observedAt);
    const e: Record<string, unknown> = finalEvent(); delete e.season;
    expect((await reconcileNflFinal(s.port, input(e, later), later)).outcome).toBe("QUARANTINED");
    expect(classifyNflStoredHistory(history(s.state()!), later).decision).toBe("REGULAR_SEASON");
  });
  it("retains stronger, previously reviewed official facts when a lower-trust feed contradicts them", async () => {
    const s = fixtureStore(); await reconcileNflFinal(s.port, input(), observedAt);
    const old = s.state()!;
    const official = {
      schemaVersion: "nfl-history-integrity-v1", status: "CORROBORATED",
      verificationMethod: "OFFICIAL_NFL_SEASON_METADATA_REVIEW", bundleSha256: "a".repeat(64),
      gameId: old.game.id, homeTeamId: old.game.homeTeamId, awayTeamId: old.game.awayTeamId,
      startsAt: old.game.startsAt!.toISOString(), homeScore: 31, awayScore: 10,
      seasonYear: 2026, seasonPhase: "REGULAR_SEASON", week: 1, evidenceAvailableAt: observedAt,
      phaseSource: { url: "https://www.nfl.com/scores/2026/reg1",
        fixtureUrl: "https://www.nfl.com/games/broncos-at-chiefs-2026-reg-1",
        sha256: "b".repeat(64), capturedAt: observedAt, captureType: "WEB_FETCH_EXTRACTED_MARKDOWN" },
    };
    const reviewed = fixtureStore({ ...old, result: { ...old.result!,
      rawResultJson: { ...record(old.result!.rawResultJson), tbmNflIntegrity: official } } });
    expect((await reconcileNflFinal(reviewed.port, {
      ...input(finalEvent({ homeScore: 20 }), later), homeScore: 20,
    }, later)).outcome).toBe("QUARANTINED");
    expect(reviewed.state()!.result!.homeScore).toBe(31);
    expect(classifyNflStoredHistory(history(reviewed.state()!), later).reason).toBe("CORROBORATED_REGULAR_SEASON");
  });
});

describe("production wiring without importing startup or database services", () => {
  const source = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  it("both provider readers snapshot the raw event, not a reconstructed score or scoreboard season", () => {
    const text = source("src/services/espn.ts");
    expect(text.match(/captureNflFinalEvent\(event, url, capturedAt\)/g)).toHaveLength(2);
    expect(text).not.toContain('sport === "NFL" && data.season?.type');
  });
  it("refresh and recovery use the same NFL-only transaction; blind games-table sync excludes NFL", () => {
    expect(source("src/routes/games.ts")).toContain("persistNflFetchedFinal(game, writeFixture");
    const grading = source("src/services/grading-runner.ts");
    expect(grading).toContain('g.sport !== "NFL" && isActiveProductSport');
    expect(grading).toContain("persistNflFetchedFinal(eg, undefined");
    expect(grading).toContain("persistNflFetchedFinal(observation, undefined");
    expect(grading).toContain(".slice(0, 64)");
    expect(grading).toContain(".slice(0, 8)");
    expect(source("src/services/nflFinalPersistence.ts")).toContain("pg_advisory_xact_lock");
  });
  it("selects a real nullable game kickoff for forecast review candidates without inventing time", () => {
    const review = readFileSync(new URL("../../src/services/forecastReviews.ts", import.meta.url), "utf8");
    expect(review).toContain("gameStartsAt: gamesTable.startsAt");
    expect(review).toContain(".leftJoin(gamesTable, eq(gamesTable.id, modelPredictionsTable.gameId))");
  });
});
