import { describe, expect, it } from "vitest";
import artifactJson from "../../../../model-artifacts/v4/nfl-v4-core.json";
import { createNflV4Engine, type NflV4Artifact } from "../../src/services/nflV4";
import { createNflV4Engine as createLegacy } from "virtual:nfl-legacy-history";
import { routeV4Forecast, V4EngineRegistry } from "../../src/services/v4Platform";
import { requireNflV4History, NflHistoryIntegrityError,
  type NflV4HistoryRow } from "../../src/services/nflV4HistorySafety";
import { classifyNflStoredHistory, selectNflRegularSeasonHistory } from "../../src/services/nflHistoricalSeasonPolicy";

// The engine constructor validates the JSON artifact's exact content hash.
const artifact = artifactJson as unknown as NflV4Artifact;
const seed = artifact.historySeed.asOf;
const target = new Date("2026-10-04T17:00:00Z"), now = new Date("2026-10-03T18:00:00Z");
const event = { id: "900000099", homeTeamId: "12", awayTeamId: "7", startsAt: target };
const row = (patch: Partial<NflV4HistoryRow> = {}): NflV4HistoryRow => ({
  id: "900000001", homeTeamId: "12", awayTeamId: "7", startsAt: new Date("2026-09-14T17:00:00Z"),
  homeScore: 31, awayScore: 10, ...patch,
});
const check = (rows: NflV4HistoryRow[]) => requireNflV4History(rows, seed, target);
const reviewedRow = (phase = "REGULAR_SEASON") => {
  const game = row({ id: "NFL-401872931" });
  return { ...game, resultEvidence: { tbmNflIntegrity: {
    schemaVersion: "nfl-history-integrity-v1", status: "CORROBORATED",
    verificationMethod: "OFFICIAL_NFL_SEASON_METADATA_REVIEW",
    bundleSha256: "a".repeat(64), gameId: game.id,
    homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId,
    startsAt: game.startsAt!.toISOString(), homeScore: game.homeScore, awayScore: game.awayScore,
    seasonYear: 2026, seasonPhase: phase, week: 1, evidenceAvailableAt: "2026-10-01T00:00:00Z",
    phaseSource: { url: `https://www.nfl.com/scores/2026/${phase === "PRESEASON" ? "pre" : phase === "POSTSEASON" ? "post" : "reg"}1`,
      fixtureUrl: `https://www.nfl.com/games/broncos-at-chiefs-2026-${phase === "PRESEASON" ? "pre" : phase === "POSTSEASON" ? "post" : "reg"}-1`,
      sha256: "b".repeat(64), captureType: "WEB_FETCH_EXTRACTED_MARKDOWN", capturedAt: "2026-10-01T00:00:00Z" },
  } } };
};

describe("explicit, source-bound NFL season eligibility", () => {
  it("uses reviewed regular-season history with actual evidence availability", () => {
    const g = reviewedRow(), result = selectNflRegularSeasonHistory([g], now.toISOString());
    expect(result.history).toEqual([{ ...g, verifiedEvidenceAvailableAt: "2026-10-01T00:00:00.000Z" }]);
  });
  it.each(["PRESEASON", "POSTSEASON"])("excludes %s without deleting or reclassifying the source row", phase => {
    const g = reviewedRow(phase), before = JSON.stringify(g);
    const result = selectNflRegularSeasonHistory([g], now.toISOString());
    expect(result.history).toEqual([]);
    expect(result.decisions[0]?.decision).toBe("EXCLUDED");
    expect(JSON.stringify(g)).toBe(before);
  });
  it.each(["UNKNOWN", "", "REG", "2"])("does not guess unknown phase %s from a September kickoff", phase => {
    expect(classifyNflStoredHistory(reviewedRow(phase), now.toISOString()).decision).toBe("QUARANTINED");
  });
  it("does not use retrospective corroboration before its real availability", () => {
    expect(() => selectNflRegularSeasonHistory([reviewedRow()], "2026-09-30T00:00:00Z"))
      .toThrow("NFL_HISTORY_SEASON_EVIDENCE_BLOCKED");
  });
  it.each(["gameId", "homeTeamId", "awayTeamId", "startsAt", "homeScore", "awayScore"])(
    "quarantines changed %s bindings rather than trusting stale metadata", key => {
      const g = reviewedRow();
      Object.assign(g.resultEvidence.tbmNflIntegrity, { [key]: key.includes("Score") ? 99 : "mismatch" });
      expect(classifyNflStoredHistory(g, now.toISOString()).reason).toBe("SEASON_EVIDENCE_ROW_BINDING_MISMATCH");
    });
  it.each(["https://espn.com/games/broncos-at-chiefs-2026-reg-1",
    "https://www.nfl.com/games/broncos-at-chiefs-2026-pre-1",
    "https://www.nfl.com/games/broncos-at-chiefs-2025-reg-1",
    "https://www.nfl.com/games/broncos-at-chiefs-2026-reg-1?unreviewed=1"])(
    "rejects wrong origin, phase, year or unreviewed locator: %s", url => {
      const g = reviewedRow(); g.resultEvidence.tbmNflIntegrity.phaseSource.url = url;
      expect(classifyNflStoredHistory(g, now.toISOString()).reason).toBe("INVALID_SEASON_PROVENANCE");
    });
  it("blocks missing metadata and invalid kickoff without throwing a native date error", () => {
    expect(classifyNflStoredHistory({ ...reviewedRow(), resultEvidence: null }, now.toISOString()).decision)
      .toBe("QUARANTINED");
    expect(classifyNflStoredHistory({ ...reviewedRow(), startsAt: new Date(NaN) }, now.toISOString()).reason)
      .toBe("SEASON_EVIDENCE_ROW_BINDING_MISMATCH");
  });
});
function reasons(rows: NflV4HistoryRow[]) {
  try { check(rows); throw new Error("expected blocked history"); }
  catch (e) {
    expect(e).toBeInstanceOf(NflHistoryIntegrityError);
    return (e as NflHistoryIntegrityError).issues.map(i => i.reason);
  }
}
async function outputs(factory: typeof createNflV4Engine, history: NflV4HistoryRow[]) {
  const engine = factory(artifact);
  const input = await engine.materializeInput({ event, history }, now);
  engine.validateInput(input);
  const output = await engine.predict(input);
  engine.validateOutput(output, input);
  return { input, output };
}
describe("NFL Release 1 structural history safeguards; SYNTHETIC rows, not verified results", () => {
  it.each([[31, 0], [0, 10], [17, 17], [6, 1], [2, 0], [73, 0]])(
    "preserves legitimate scores including shutouts and ties: %i–%i", (homeScore, awayScore) => {
      expect(check([row({ homeScore, awayScore })])).toHaveLength(1);
    });
  it.each([NaN, Infinity, -Infinity, -1, 10.5, Number.MAX_SAFE_INTEGER + 1])(
    "blocks invalid home score %s", homeScore => {
      expect(reasons([row({ homeScore })])).toContain("INVALID_FINAL_SCORE");
    });
  it.each([NaN, Infinity, -1, 0.5])("blocks invalid away score %s", awayScore => {
    expect(reasons([row({ awayScore })])).toContain("INVALID_FINAL_SCORE");
  });
  it.each([{ homeScore: null }, { awayScore: null }, { homeScore: null, awayScore: null }])(
    "blocks incomplete final without silently skipping it: %j", patch => {
      expect(reasons([row(patch)])).toContain("MISSING_FINAL_SCORE");
    });
  it("quarantines suspicious 0–0 rather than inventing KC 31–10", async () => {
    const history = [row({ homeScore: 0, awayScore: 0 })];
    expect(reasons(history)).toEqual(["SUSPICIOUS_ZERO_ZERO_FINAL"]);
    await expect(outputs(createNflV4Engine, history)).rejects.toThrow("NFL_HISTORY_INTEGRITY_BLOCKED");
    expect(history[0]!.homeScore).toBe(0);
    expect((await outputs(createLegacy, history)).output.expectedHomeScore).toBeTypeOf("number");
  });
  it.each([{ id: "" }, { id: " 900000001" }, { homeTeamId: null }, { awayTeamId: "" },
    { homeTeamId: "7" }, { startsAt: null }, { startsAt: new Date(NaN) }])(
    "blocks incomplete or inconsistent identity: %j", patch => {
      expect(() => check([row(patch)])).toThrow("NFL_HISTORY_INTEGRITY_BLOCKED");
    });
  it.each([seed, target.toISOString(), "2026-10-05T17:00:00Z"])(
    "blocks out-of-window supplied rows: %s", start => {
      expect(reasons([row({ startsAt: new Date(start) })])).toContain("OUTSIDE_HISTORY_WINDOW");
    });
  it("deduplicates equal event identities without mutating rows", () => {
    const a = row(), b = row(), before = JSON.stringify([a, b]);
    expect(check([a, b])).toEqual([a]);
    expect(JSON.stringify([a, b])).toBe(before);
  });
  it("accepts the exact NFL namespace used by actual stored game identities", async () => {
    const stored = row({ id: "NFL-401872931" });
    expect(check([stored])).toEqual([stored]);
    expect(await outputs(createNflV4Engine, [stored])).toEqual(await outputs(createLegacy, [stored]));
  });
  it("deduplicates numeric/provider and NFL-namespaced aliases deterministically", () => {
    const raw = row({ id: "401872931" }), stored = row({ id: "NFL-401872931" });
    expect(check([raw, stored])).toEqual([raw]);
    expect(check([stored, raw])).toEqual([raw]);
  });
  it("blocks conflicting scores across aliases of the same provider event", () => {
    expect(reasons([row({ id: "401872931" }), row({ id: "NFL-401872931", homeScore: 24 })]))
      .toContain("CONFLICTING_EVENT_HISTORY");
  });
  it.each(["MLB-401872931", "nfl-401872931", "NFL-0401872931", "NFL-401872931 "])(
    "does not broaden identity admission to malformed or wrong-sport IDs: %s", id => {
      expect(reasons([row({ id })])).toContain("INVALID_EVENT_ID");
    });
  it.each([{ homeScore: 24 }, { awayScore: 13 }, { homeTeamId: "26" },
    { startsAt: new Date("2026-09-15T17:00:00Z") }])(
    "blocks every conflicting version instead of choosing a correction: %j", patch => {
      expect(reasons([row(), row(patch)])).toContain("CONFLICTING_EVENT_HISTORY");
      expect(reasons([row(patch), row()])).toContain("CONFLICTING_EVENT_HISTORY");
    });
  it.each([false, true])("blocks multiple IDs for one fixture, reversed teams=%s", reverse => {
    expect(reasons([row(), row({ id: "900000002",
      ...(reverse ? { homeTeamId: "7", awayTeamId: "12" } : {}) })])).toContain("FIXTURE_EVENT_ID_COLLISION");
  });
  it("rejects the entire batch when an otherwise valid row accompanies a bad final", async () => {
    await expect(outputs(createNflV4Engine, [row(), row({
      id: "900000002", startsAt: new Date("2026-09-21T17:00:00Z"), homeScore: null,
    })])).rejects.toThrow("NFL_HISTORY_INTEGRITY_BLOCKED");
  });
  it("is deterministic across unique-row ordering", () => {
    const a = row(), b = row({ id: "900000002", startsAt: new Date("2026-09-21T17:00:00Z") });
    expect(check([b, a])).toEqual(check([a, b]));
  });
  it("retains existing seed-only behavior without claiming empty history is verified", async () => {
    expect(await outputs(createNflV4Engine, [])).toEqual(await outputs(createLegacy, []));
  });
  it("does not infer preseason status from August kickoff dates without metadata", () => {
    expect(check([row({ startsAt: new Date("2026-08-14T17:00:00Z") })])).toHaveLength(1);
  });
  it("valid unique rows produce byte-equivalent inputs and outputs to the actual production engine", async () => {
    const history = [row(), row({ id: "900000002",
      startsAt: new Date("2026-09-21T17:00:00Z"), homeScore: 0, awayScore: 17 })];
    const before = JSON.stringify(artifact);
    expect(await outputs(createNflV4Engine, history)).toEqual(await outputs(createLegacy, history));
    expect(JSON.stringify(artifact)).toBe(before);
  });
  it("duplicate replay matches single replay, unlike legacy double counting", async () => {
    const single = await outputs(createNflV4Engine, [row()]);
    expect(await outputs(createNflV4Engine, [row(), row()])).toEqual(single);
    expect((await outputs(createLegacy, [row(), row()])).input.featureHash).not.toBe(single.input.featureHash);
  });
  it("legacy silently skipped missing scores; patched engine explicitly blocks", async () => {
    const history = [row({ homeScore: null })];
    expect(await outputs(createLegacy, history)).toEqual(await outputs(createLegacy, []));
    await expect(outputs(createNflV4Engine, history)).rejects.toThrow("NFL_HISTORY_INTEGRITY_BLOCKED");
  });
  it("existing router returns NO_FORECAST on integrity failure, without a legacy fallback", async () => {
    const registry = new V4EngineRegistry();
    const engine = createNflV4Engine(artifact);
    // In-memory evidence only; the real collector's throwing DB mock is NOT invoked.
    registry.register({ ...engine,
      collectEvidence: async () => ({ event, history: [row({ homeScore: null })] }),
      predict: async () => { throw new Error("PREDICT_MUST_NOT_RUN"); },
    });
    expect(await routeV4Forecast(registry, "NFL", event.id, now)).toEqual({
      disposition: "NO_FORECAST", sport: "NFL", gameId: event.id, reason: "NFL_HISTORY_INTEGRITY_BLOCKED",
    });
  });
  it.each([
    { homeScore: null }, { homeScore: 0, awayScore: 0 }, { awayScore: -1 },
    { homeTeamId: null }, { id: "" },
  ])("does not let a replay-ineligible final suppress a valid forecast: %j", async patch => {
    const irrelevant = row({ startsAt: new Date("2026-10-04T10:00:00Z"), ...patch });
    const expected = await outputs(createNflV4Engine, [row()]);
    expect(await outputs(createNflV4Engine, [row(), irrelevant])).toEqual(expected);
  });
  it("excludes finals exactly at the target's twelve-hour boundary before validation", async () => {
    const recent = row({ startsAt: new Date("2026-10-04T05:00:00Z"), homeScore: null });
    expect(await outputs(createNflV4Engine, [recent])).toEqual(await outputs(createLegacy, []));
  });
  it("does not use history whose estimated availability is after prediction time", async () => {
    const futureEvidence = row({ startsAt: new Date("2026-10-03T12:00:00Z") });
    expect(await outputs(createNflV4Engine, [futureEvidence])).toEqual(await outputs(createLegacy, []));
    // The production validator already prevents serving this future evidence,
    // but only after replay: legacy loses the forecast instead of excluding it.
    await expect(outputs(createLegacy, [futureEvidence])).rejects.toThrow("PIT_CHRONOLOGY_INVALID");
  });
  it("admits history available exactly at prediction time but strictly before kickoff", async () => {
    const justAvailable = row({ startsAt: new Date("2026-10-03T06:00:00Z") });
    expect(await outputs(createNflV4Engine, [justAvailable])).toEqual(await outputs(createLegacy, [justAvailable]));
  });
  it.each([seed, "2026-10-05T17:00:00Z"])(
    "ignores definitively out-of-scope rows before score validation: %s", async start => {
      expect(await outputs(createNflV4Engine, [row({ startsAt: new Date(start), homeScore: null })]))
        .toEqual(await outputs(createLegacy, []));
    });
  it("still blocks an invalid eligible final rather than silently replaying a subset", async () => {
    await expect(outputs(createNflV4Engine, [row(), row({
      id: "900000002", startsAt: new Date("2026-10-03T05:59:59Z"), homeScore: null,
    })])).rejects.toThrow("NFL_HISTORY_INTEGRITY_BLOCKED");
  });
  it.each([null, new Date(NaN)])("cannot establish irrelevance from missing/invalid kickoff: %s", async startsAt => {
    await expect(outputs(createNflV4Engine, [row({ startsAt, homeScore: null })]))
      .rejects.toThrow("NFL_HISTORY_INTEGRITY_BLOCKED");
  });
  it("rejects an invalid prediction clock instead of bypassing eligibility", async () => {
    await expect(createNflV4Engine(artifact).materializeInput({ event, history: [row()] }, new Date(NaN)))
      .rejects.toThrow("NFL_HISTORY_CONTEXT_INVALID");
  });
  it("keeps forecast availability through the real router when only recent finals are malformed", async () => {
    const registry = new V4EngineRegistry(), engine = createNflV4Engine(artifact);
    registry.register({ ...engine, collectEvidence: async () => ({
      event, history: [row(), row({ startsAt: new Date("2026-10-04T10:00:00Z"), homeScore: null })],
    }) });
    const result = await routeV4Forecast(registry, "NFL", event.id, now);
    expect(result.disposition).not.toBe("NO_FORECAST");
  });
});
