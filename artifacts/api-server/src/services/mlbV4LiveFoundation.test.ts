import { describe, expect, it } from "vitest";
import {
  assertSportsForecastFirewall, buildDiscovery, buildGameOutcome, buildReadiness,
  classifyStarterAgreement, freezePregameFeatureSnapshot, marketLeakagePathsV4,
  materializeStarterPitState, materializeTeamOffensePitState, materializeBullpenPitState, MLB_V4_CADENCE, MLB_V4_CURRENT_CHAMPION,
  MLB_V4_INPUT_SCHEMA, MLB_V4_LEGACY_INPUT_SCHEMA, MLB_V4_OLD_OOS_STATUS, MLB_V4_OUTPUT_SCHEMA,
  MLB_V4_STARTER_STATE_VERSION, MLB_V4_TEAM_STATE_VERSION, normalizeMlbTeamSide,
  selectLatestBullpenPitVersions,
  pairFeatureOutcome, pureForecastMetrics, runBoundedMlbV4Collection, runMlbV4CollectionAttempt, shouldCollectAt,
  targetLeakagePathsV4, type ComponentState,
} from "./mlbV4LiveFoundation";

const pitch = new Date("2026-09-06T23:00:00Z");
const cutoff = new Date("2026-09-06T22:00:00Z");
const game = (id = 1) => ({
  gamePk: id, gameDate: pitch.toISOString(), status: { abstractGameState: "Preview" },
  teams: {
    home: { team: { id: 10 }, probablePitcher: { id: 100, fullName: "Home Starter" } },
    away: { team: { id: 20 }, probablePitcher: { id: 200, fullName: "Away Starter" } },
  },
});
const state = (id: string, features: unknown = { value: 1 }, sourceCutoff = new Date("2026-09-05T00:00:00Z")): ComponentState => ({
  id, hash: id.repeat(64).slice(0, 64), features, sampleSizes: { games: 10 }, missingness: {}, sourceCutoff,
});
const fullFeature = () => freezePregameFeatureSnapshot({
  gameId: "1", scheduledFirstPitch: pitch, featureCutoff: cutoff,
  homeOffense: state("a"), awayOffense: state("b"), homeStarter: state("c"), awayStarter: state("d"),
  homeBullpen: state("e", { team: "HOME_BP" }), awayBullpen: state("f", { team: "AWAY_BP" }),
  league: state("g"), homeContext: state("h"),
});

describe("Task #232 MLB V4 live foundation", () => {
  it("derives cutoff-safe offense and bullpen aggregates rather than copying prior features", () => {
    const offense = materializeTeamOffensePitState({ cutoff, rows: [
      { completedAt: new Date("2026-09-05T00:00:00Z"), runs: 3, home: true },
      { completedAt: new Date("2026-09-06T21:00:00Z"), runs: 9, home: false },
      { completedAt: new Date("2025-09-06T21:00:00Z"), runs: 4, home: false },
      { completedAt: new Date("2026-09-04T21:00:00Z"), recordedAt: cutoff, runs: 77, home: true },
      { completedAt: cutoff, runs: 99, home: true },
    ] });
    const bullpen = materializeBullpenPitState({ cutoff, rows: [
      { completedAt: new Date("2026-09-06T12:00:00Z"), innings: 3, pitches: 44, relievers: 2, earnedRuns: 1 },
      { completedAt: new Date("2026-09-04T12:00:00Z"), recordedAt: cutoff, innings: 8, pitches: 88, relievers: 8, earnedRuns: 8 },
      { completedAt: cutoff, innings: 9, pitches: 99, relievers: 9, earnedRuns: 9 },
    ] });
    expect((offense.features.rolling.games5 as { runs: number }).runs).toBe(12);
    expect(offense.features.currentSeason.games).toBe(2);
    expect(offense.features.priorSeason.games).toBe(1);
    expect((bullpen.features.workload.days1 as { pitches: number }).pitches).toBe(44);
  });

  it("keeps offense rolling windows in the target season", () => {
    const offense = materializeTeamOffensePitState({ cutoff, rows: [
      { completedAt: new Date("2025-09-01T00:00:00Z"), runs: 40, home: true },
      { completedAt: new Date("2026-09-01T00:00:00Z"), runs: 4, home: false },
    ] });
    expect(offense.features.rolling.games5).toEqual({ games: 1, runs: 4, runsPerGame: 4 });
    expect(offense.features.priorSeason.runs).toBe(40);
  });

  it("normalizes supported side case variants and fails closed on unknown labels", () => {
    expect(normalizeMlbTeamSide("home")).toBe("HOME");
    expect(normalizeMlbTeamSide(" Away ")).toBe("AWAY");
    expect(normalizeMlbTeamSide("neutral")).toBeNull();
    expect(normalizeMlbTeamSide(null)).toBeNull();
  });

  it("propagates missing bullpen values instead of converting them to zero", () => {
    const bullpen = materializeBullpenPitState({ cutoff, rows: [
      { completedAt: new Date("2026-09-05T00:00:00Z"), innings: 3, pitches: null, relievers: 2, earnedRuns: 1 },
      { completedAt: new Date("2026-09-06T00:00:00Z"), innings: null, pitches: 40, relievers: 2, earnedRuns: 0 },
    ] });
    expect(bullpen.features.rolling.games5).toMatchObject({ innings: null, pitches: null, era: null });
  });

  it("selects one latest PIT bullpen version and fails closed on source conflicts", () => {
    const versions = [
      { canonicalGameId: "g1", canonicalTeamId: "t", completedAt: new Date("2026-09-01T00:00:00Z"),
        recordedAt: new Date("2026-09-01T01:00:00Z"), sourceHash: "old", value: 1 },
      { canonicalGameId: "g1", canonicalTeamId: "t", completedAt: new Date("2026-09-01T00:00:00Z"),
        recordedAt: new Date("2026-09-01T02:00:00Z"), sourceHash: "new", value: 2 },
      { canonicalGameId: "g2", canonicalTeamId: "t", completedAt: new Date("2026-09-02T00:00:00Z"),
        recordedAt: new Date("2026-09-02T01:00:00Z"), sourceHash: "a", value: 3 },
      { canonicalGameId: "g2", canonicalTeamId: "t", completedAt: new Date("2026-09-02T00:00:00Z"),
        recordedAt: new Date("2026-09-02T01:00:00Z"), sourceHash: "b", value: 4 },
      { canonicalGameId: "future", canonicalTeamId: "t", completedAt: cutoff,
        recordedAt: cutoff, sourceHash: "future", value: 5 },
    ];
    const first = selectLatestBullpenPitVersions(cutoff, versions);
    const second = selectLatestBullpenPitVersions(cutoff, [...versions].reverse());
    expect(first).toEqual(second);
    expect(first.rows.map((row) => row.value)).toEqual([2]);
    expect(first.conflicts).toEqual(["g2:t"]);
  });
  it("builds immutable run/game discovery identities and doubleheader-safe IDs", () => {
    const one = buildDiscovery("run", game(1), cutoff)!;
    const two = buildDiscovery("run", game(2), cutoff)!;
    expect(one.eligibleForPregameCapture).toBe(true);
    expect(one.discoveryId).not.toBe(two.discoveryId);
    expect(one.artifactHash).toHaveLength(64);
  });

  it("marks post-first-pitch, postponed, and cancelled discovery ineligible", () => {
    expect(buildDiscovery("r", game(), pitch)!.reasonNotEligible).toBe("AT_OR_AFTER_FIRST_PITCH");
    const postponed = { ...game(), status: { abstractGameState: "Postponed" } };
    expect(buildDiscovery("r", postponed, cutoff)!.eligibleForPregameCapture).toBe(false);
  });

  it("materializes chronology-safe rookie and low-sample starter state without invented performance", () => {
    const rookie = materializeStarterPitState({ starterSnapshotId: 1, gameId: "1", teamId: "10", pitcherId: "100", featureCutoff: cutoff, appearances: [] });
    expect(rookie.rookie).toBe(true);
    expect(rookie.role).toBe("UNKNOWN");
    expect(rookie.features.seasonEra).toBeNull();
    const prior = materializeStarterPitState({
      starterSnapshotId: 2, gameId: "1", teamId: "10", pitcherId: "100", featureCutoff: cutoff,
      appearances: [
        { completedAt: new Date("2026-09-01T00:00:00Z"), gameDate: "2026-09-01", starter: true,
          innings: 6, battersFaced: 24, pitchCount: 90, earnedRuns: 2, hits: 5, walks: 1, strikeouts: 7, homeRuns: 1 },
        { completedAt: new Date("2026-09-07T00:00:00Z"), gameDate: "2026-09-07", starter: true,
          innings: 9, battersFaced: 27, pitchCount: 99, earnedRuns: 0, hits: 0, walks: 0, strikeouts: 27, homeRuns: 0 },
      ],
    });
    expect(prior.sampleSizes.starts).toBe(1);
    expect(prior.sourceCutoff! < cutoff).toBe(true);
  });

  it("deduplicates prior pitcher artifacts by canonical game using the latest pre-cutoff artifact", () => {
    const state = materializeStarterPitState({
      starterSnapshotId: 4, gameId: "g", teamId: "t", pitcherId: "p", featureCutoff: cutoff,
      appearances: [
        { canonicalGameId: "prior", completedAt: new Date("2026-09-01T00:00:00Z"),
          recordedAt: new Date("2026-09-01T01:00:00Z"), gameDate: "2026-09-01", starter: true,
          innings: 4, battersFaced: 18, pitchCount: 70, earnedRuns: 3, hits: 5, walks: 2, strikeouts: 4, homeRuns: 1 },
        { canonicalGameId: "prior", completedAt: new Date("2026-09-01T00:00:00Z"),
          recordedAt: new Date("2026-09-01T02:00:00Z"), gameDate: "2026-09-01", starter: true,
          innings: 6, battersFaced: 22, pitchCount: 90, earnedRuns: 1, hits: 4, walks: 1, strikeouts: 7, homeRuns: 0 },
      ],
    });
    expect(state.sampleSizes).toMatchObject({ appearances: 1, starts: 1 });
    expect(state.features.lastStartInnings).toBe(6);
  });

  it("freezes baseline and starter tiers with explicit opposing bullpen mapping", () => {
    const feature = fullFeature();
    expect(feature.schemaVersion).toBe(MLB_V4_INPUT_SCHEMA);
    expect(feature.evidenceTier).toBe("STARTER_CORE");
    expect(feature.features.home.opponentBullpen).toEqual({ team: "AWAY_BP" });
    expect(feature.features.away.opponentBullpen).toEqual({ team: "HOME_BP" });
    expect(feature.artifactHash).toHaveLength(64);
  });

  it("rejects component source chronology at or after feature cutoff", () => {
    expect(() => freezePregameFeatureSnapshot({
      gameId: "1", scheduledFirstPitch: pitch, featureCutoff: cutoff,
      homeOffense: state("a", {}, cutoff),
    })).toThrow(/chronology/);
  });

  it("enforces market and target firewalls recursively", () => {
    expect(marketLeakagePathsV4({ nested: { sportsbook: "x" } })).toEqual(["$.nested.sportsbook"]);
    expect(targetLeakagePathsV4({ nested: { actualStarter: "x" } })).toEqual(["$.nested.actualStarter"]);
    expect(() => assertSportsForecastFirewall({ odds: -110 })).toThrow(/MARKET_FIREWALL/);
    expect(() => assertSportsForecastFirewall({ finalScore: "5-4" })).toThrow(/TARGET_LEAKAGE/);
  });

  it("stores outcomes separately and pairs idempotently by deterministic identity", () => {
    const feature = fullFeature();
    const outcome = buildGameOutcome({ gameId: "1", finalStatus: "Final", homeRuns: 5, awayRuns: 4,
      completedAt: new Date("2026-09-07T03:00:00Z"), source: "MLB_STATS_API", rawPayload: { final: true } });
    const complete = { HOME: "MATCHED", AWAY: "CHANGED" };
    const first = pairFeatureOutcome({ feature, outcome, starterOutcomeIds: ["s1", "s2"], bullpenOutcomeIds: ["b1", "b2"], starterAgreement: complete });
    const second = pairFeatureOutcome({ feature, outcome, starterOutcomeIds: ["s1", "s2"], bullpenOutcomeIds: ["b1", "b2"], starterAgreement: complete });
    expect(first).toEqual(second);
    expect(first.qualityStatus).toBe("COMPLETE");
    expect(pairFeatureOutcome({ feature, outcome, starterOutcomeIds: ["s1"], bullpenOutcomeIds: ["b1", "b2"], starterAgreement: complete }).qualityStatus).toBe("PARTIAL");
    expect((feature.features as Record<string, unknown>).homeRuns).toBeUndefined();
  });

  it("rejects nonfinal outcomes and mismatched feature/outcome games", () => {
    expect(() => buildGameOutcome({ gameId: "1", finalStatus: "In Progress", homeRuns: 1, awayRuns: 0,
      completedAt: pitch, source: "x", rawPayload: {} })).toThrow(/not legitimately final/);
    const outcome = buildGameOutcome({ gameId: "2", finalStatus: "Final", homeRuns: 1, awayRuns: 0,
      completedAt: pitch, source: "x", rawPayload: {} });
    expect(() => pairFeatureOutcome({ feature: fullFeature(), outcome })).toThrow(/different games/);
  });

  it("classifies actual starter agreement without rewriting probable evidence", () => {
    expect(classifyStarterAgreement("100", "100")).toBe("MATCHED");
    expect(classifyStarterAgreement("100", "101")).toBe("CHANGED");
    expect(classifyStarterAgreement("100", "101", true)).toBe("LATE_SCRATCH");
    expect(classifyStarterAgreement(null, "101")).toBe("UNKNOWN");
  });

  it("computes pure run/probability metrics with no tuning side effects", () => {
    const rows = [{ homeExpected: 5, awayExpected: 3, homeWinProbability: .75, homeRuns: 4, awayRuns: 2 }];
    const before = JSON.stringify(rows);
    expect(pureForecastMetrics(rows)).toMatchObject({ totalBias: 2, totalMae: 2, winnerAccuracy: 1 });
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("uses bounded sustainable game-relative cadence", () => {
    expect(shouldCollectAt(new Date(pitch.getTime() - 60 * 60_000), pitch, [])).toBe(60);
    expect(shouldCollectAt(new Date(pitch.getTime() - 60 * 60_000), pitch, [60])).toBeNull();
    expect(MLB_V4_CADENCE.maximumAttemptsPerLogicalRun).toBe(3);
  });

  it("records collection success and append-only duplicate no-op counters", async () => {
    const runs: unknown[] = []; const discoveries: unknown[] = []; const events: Array<{ eventType: string }> = [];
    const result = await runMlbV4CollectionAttempt({
      date: "2026-09-06", attempt: 1, logicalRunId: "logical", now: () => cutoff,
      client: { get: async () => ({ games: [game()] }) },
      repository: {
        appendRunEvent: async (event) => { events.push(event); },
        appendRun: async (r) => { runs.push(r); },
        appendDiscoveries: async (rows) => { discoveries.push(...rows); return rows.length; },
        appendStarterRows: async (_run, rows) => ({ inserted: 0, unchanged: rows.length }),
      },
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(result.counters).toMatchObject({ expected: 2, observed: 2, inserted: 0, unchanged: 2 });
    expect(runs).toHaveLength(1); expect(discoveries).toHaveLength(1);
    expect(events.map((event) => event.eventType)).toEqual(["STARTED", "COMPLETED"]);
  });

  it("does not count discovered games outside the due window as missed slots", async () => {
    const outsideWindow = {
      ...game(999_002),
      gameDate: new Date(cutoff.getTime() + 10 * 60 * 60_000).toISOString(),
    };
    const result = await runMlbV4CollectionAttempt({
      date: "2026-09-06", attempt: 1, logicalRunId: "windowed", now: () => cutoff,
      captureWindowOnly: true,
      client: { get: async () => ({ games: [game(), outsideWindow] }) },
      repository: {
        appendRunEvent: async () => {},
        appendRun: async () => {},
        appendDiscoveries: async (rows) => rows.length,
        appendStarterRows: async (_run, rows) => ({ inserted: rows.length, unchanged: 0 }),
      },
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(result.counters).toMatchObject({ expected: 2, observed: 2, notDue: 2 });
  });

  it("records source, timeout, and rate-limit failures with retry lineage", async () => {
    const runs: unknown[] = [];
    const result = await runMlbV4CollectionAttempt({
      date: "2026-09-06", attempt: 2, logicalRunId: "logical", retryOfRunId: "prior", now: () => cutoff,
      client: { get: async () => { throw new Error("429 rate limit timeout"); } },
      repository: { appendRunEvent: async () => {}, appendRun: async (r) => { runs.push(r); }, appendDiscoveries: async () => 0,
        appendStarterRows: async () => ({ inserted: 0, unchanged: 0 }) },
    });
    expect(result.status).toBe("FAILED");
    expect(result.retryOfRunId).toBe("prior");
    expect(result.counters).toMatchObject({ sourceErrors: 1, timeouts: 1, rateLimits: 1 });
    expect(runs).toHaveLength(1);
  });

  it("refuses attempts outside the retry bound", async () => {
    await expect(runMlbV4CollectionAttempt({
      date: "2026-09-06", attempt: 4, logicalRunId: "x", now: () => cutoff,
      client: { get: async () => ({ games: [] }) },
      repository: { appendRunEvent: async () => {}, appendRun: async () => {}, appendDiscoveries: async () => 0,
        appendStarterRows: async () => ({ inserted: 0, unchanged: 0 }) },
    })).rejects.toThrow(/bound/);
  });

  it("automatically retries a bounded failed collection with append-only lineage", async () => {
    const runs: Array<{ runId: string; retryOfRunId: string | null }> = [];
    let calls = 0;
    const result = await runBoundedMlbV4Collection({
      date: "2026-09-06", logicalRunId: "retry-logical", now: () => cutoff,
      client: { get: async () => {
        calls++;
        if (calls === 1) throw new Error("timeout");
        return { games: [game()] };
      } },
      repository: {
        appendRunEvent: async () => {},
        appendRun: async (run) => { runs.push(run); }, appendDiscoveries: async () => 1,
        appendStarterRows: async (_run, rows) => ({ inserted: rows.length, unchanged: 0 }),
      },
      wait: async () => {},
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(calls).toBe(2);
    expect(runs).toHaveLength(2);
    expect(runs[1]!.retryOfRunId).toBe(runs[0]!.runId);
  });

  it("separates pipeline, evidence, model, and production readiness", () => {
    const readiness = buildReadiness({
      collectionRuns: 1, scheduledGames: 15, capturedGames: 15, bothStarterGames: 15,
      starterStates: 30, featureSnapshots: 15, baselineSnapshots: 15, starterCoreSnapshots: 15, completedPairs: 0,
      starterCorePairs: 0, teamsRepresented: 30, uniqueStarters: 30, repeatStarters: 0,
      pitViolations: 0, marketLeakage: 0, targetLeakage: 0, actualStarterLeakage: 0, sourceFailures: 0, successfulLifecycleCycles: 1,
      lastAttempt: cutoff.toISOString(), lastSuccessfulRun: cutoff.toISOString(), latestArtifactHash: "a".repeat(64),
    }, cutoff);
    expect(readiness.pipelineReady).toBe(true);
    expect(readiness.modelEvidenceReady).toBe(false);
    expect(readiness.modelReady).toBe(false);
    expect(readiness.productionStatus).toBe("MLB_V1_UNCHANGED");
  });

  it("locks contracts, champion, old OOS, and MLB-only isolation", () => {
    expect(MLB_V4_LEGACY_INPUT_SCHEMA).toBe("mlb-v4-model-input-v4");
    expect(MLB_V4_INPUT_SCHEMA).toBe("mlb-v4-model-input-v5");
    expect(MLB_V4_STARTER_STATE_VERSION).toMatch(/-v5$/);
    expect(MLB_V4_TEAM_STATE_VERSION).toMatch(/-v5$/);
    expect(MLB_V4_OUTPUT_SCHEMA).toBe("mlb-v4-model-output-v1");
    expect(MLB_V4_CURRENT_CHAMPION).toBe("tbm-mlb-moneyline-v1");
    expect(MLB_V4_OLD_OOS_STATUS).toBe("HISTORICAL_BENCHMARK_ONLY");
    expect(JSON.stringify(fullFeature())).not.toMatch(/NCAAF|NFL|NBA|WNBA|NHL|Soccer|UFC/);
  });
});