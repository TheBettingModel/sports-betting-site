import { describe, expect, it } from "vitest";
import {
  buildMlbHistoricalCompletionFoundation,
  type CompletionFoundationGame,
} from "./mlbHistoricalCompletionFoundation";
import {
  MLB_HISTORICAL_COMPLETION_RESOLVER_VERSION,
  type HistoricalCompletionEvidence,
} from "./mlbHistoricalChronology";

function evidence(
  id: number,
  start: string,
  completion: string | null,
  overrides: Partial<HistoricalCompletionEvidence> = {},
): HistoricalCompletionEvidence {
  const cutoff = new Date(new Date(start).getTime() - 1).toISOString();
  const base: HistoricalCompletionEvidence = {
    canonicalGameId: `mlbstats:${id}`,
    providerGameId: String(id),
    endpoint: `https://statsapi.mlb.com/api/v1.1/game/${id}/feed/live`,
    retrievedAt: "2026-09-04T12:00:00.000Z",
    scheduledStartTime: start,
    actualStartTime: null,
    firstPlayStartTime: start,
    lastPlayStartTime: completion,
    lastPlayEndTime: completion,
    gameEndTime: null,
    finalStatusTime: null,
    providerFinalSeenAt: "2026-09-04T12:00:00.000Z",
    canonicalCompletionTime: completion,
    completionTimeSource: completion ? "TERMINAL_PLAY_END_TIME" : "NONE",
    completionTimeMethod: completion
      ? "OFFICIAL_FINAL_STATUS_PLUS_TERMINAL_PLAY_END"
      : "UNRESOLVED",
    completionTimeConfidence: completion ? "HIGH_CONFIDENCE_DERIVED" : "UNRESOLVED",
    completionTimePrecision: completion ? "MILLISECOND" : "UNKNOWN",
    featureCutoff: cutoff,
    featureCutoffSource: "OFFICIAL_FIRST_PLAY_START_MINUS_1MS",
    featureCutoffConfidence: "HIGH_CONFIDENCE_DERIVED",
    completionDateEt: completion?.slice(0, 10) ?? null,
    gameStatus: completion ? "Final" : "Suspended",
    statusCode: completion ? "F" : "I",
    finalStatus: completion !== null,
    terminalPlayComplete: completion !== null,
    playCount: 70,
    inningsPlayed: 9,
    postponed: false,
    suspended: completion === null,
    resumed: false,
    crossedMidnightUtc: false,
    quarantineReason: completion ? null : "FINAL_STATUS_NOT_PROVEN",
    evidencePayload: { id, start, completion },
    rawPayloadHash: `raw-${id}`,
    evidenceHash: `evidence-${id}`,
    resolverVersion: MLB_HISTORICAL_COMPLETION_RESOLVER_VERSION,
  };
  return { ...base, ...overrides };
}

function game(
  id: number,
  start: string,
  completion: string | null,
  overrides: Partial<CompletionFoundationGame> = {},
): CompletionFoundationGame {
  return {
    canonicalGameId: `mlbstats:${id}`,
    providerGameId: String(id),
    season: 2024,
    officialGameDate: start.slice(0, 10),
    scheduledFirstPitch: start,
    homeCanonicalTeamId: `mlbstats:team:${id % 2 ? 1 : 3}`,
    awayCanonicalTeamId: `mlbstats:team:${id % 2 ? 2 : 4}`,
    homeRuns: 4,
    awayRuns: 2,
    homeStarterId: `mlbstats:player:${id}1`,
    awayStarterId: `mlbstats:player:${id}2`,
    venueId: "mlbstats:venue:1",
    venueName: "Test Park",
    gameStatus: completion ? "Final" : "Suspended",
    inningsPlayed: 9,
    doubleheaderStatus: "N",
    gameNumber: 1,
    suspended: completion === null,
    resumed: false,
    sourcePayloadHash: `schedule-${id}`,
    evidence: evidence(id, start, completion),
    ...overrides,
  };
}

describe("completion-aware MLB historical foundation", () => {
  it("admits a same-day result only when completion is before the later cutoff", () => {
    const gameOne = game(1, "2024-07-14T17:00:00.000Z", "2024-07-14T20:00:00.000Z");
    const gameTwo = game(2, "2024-07-14T20:30:00.000Z", "2024-07-14T23:30:00.000Z", {
      homeCanonicalTeamId: gameOne.homeCanonicalTeamId,
      awayCanonicalTeamId: "mlbstats:team:5",
      doubleheaderStatus: "S",
      gameNumber: 2,
    });
    const result = buildMlbHistoricalCompletionFoundation(
      [gameOne, gameTwo],
      new Map([[gameOne.canonicalGameId, "TRAIN"], [gameTwo.canonicalGameId, "TRAIN"]]),
    );
    const decision = result.decisions.find((entry) => entry.canonicalGameId === gameTwo.canonicalGameId)!;
    expect(decision.sameDayDecisions).toContainEqual(expect.objectContaining({
      priorGameId: gameOne.canonicalGameId,
      eligible: true,
      reason: "ELIGIBLE_COMPLETED_BEFORE_CUTOFF",
    }));
  });

  it("uses the official MLB date across a UTC date boundary", () => {
    const gameOne = game(3, "2024-07-14T23:00:00.000Z", "2024-07-15T00:30:00.000Z", {
      officialGameDate: "2024-07-14",
    });
    const gameTwo = game(4, "2024-07-15T01:00:00.000Z", "2024-07-15T04:00:00.000Z", {
      officialGameDate: "2024-07-14",
      homeCanonicalTeamId: gameOne.homeCanonicalTeamId,
      awayCanonicalTeamId: "mlbstats:team:5",
      doubleheaderStatus: "S",
      gameNumber: 2,
    });
    const result = buildMlbHistoricalCompletionFoundation(
      [gameOne, gameTwo],
      new Map([[gameOne.canonicalGameId, "TRAIN"], [gameTwo.canonicalGameId, "TRAIN"]]),
    );
    const decision = result.decisions.find((entry) => entry.canonicalGameId === gameTwo.canonicalGameId)!;
    expect(decision.sameDayDecisions).toContainEqual(expect.objectContaining({
      priorGameId: gameOne.canonicalGameId,
      eligible: true,
    }));
  });

  it("denies same-day, suspended, unresolved, and later outcomes", () => {
    const target = game(10, "2024-07-14T20:30:00.000Z", "2024-07-14T23:30:00.000Z");
    const stillRunning = game(11, "2024-07-14T17:00:00.000Z", "2024-07-14T21:00:00.000Z", {
      homeCanonicalTeamId: target.homeCanonicalTeamId,
    });
    const suspended = game(12, "2024-07-14T16:00:00.000Z", null, {
      awayCanonicalTeamId: target.awayCanonicalTeamId,
    });
    const result = buildMlbHistoricalCompletionFoundation(
      [target, stillRunning, suspended],
      new Map([[target.canonicalGameId, "TRAIN"]]),
    );
    const decision = result.decisions.find((entry) => entry.canonicalGameId === target.canonicalGameId)!;
    expect(decision.sameDayDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        priorGameId: stillRunning.canonicalGameId,
        reason: "COMPLETION_NOT_BEFORE_CUTOFF",
      }),
      expect.objectContaining({
        priorGameId: suspended.canonicalGameId,
        reason: "PRIOR_NOT_FINAL",
      }),
    ]));
  });

  it("persists no feature cutoff when official first-play chronology is unresolved", () => {
    const unresolved = game(13, "2024-07-14T20:30:00.000Z", null, {
      evidence: evidence(13, "2024-07-14T20:30:00.000Z", null, {
        firstPlayStartTime: null,
        featureCutoff: null,
        featureCutoffSource: "UNRESOLVED",
        featureCutoffConfidence: "UNRESOLVED",
      }),
    });
    const result = buildMlbHistoricalCompletionFoundation(
      [unresolved],
      new Map([[unresolved.canonicalGameId, "TRAIN"]]),
    );
    expect(result.decisions[0]?.featureCutoff).toBeNull();
    expect(result.rows.every((row) => row.featureCutoff === null)).toBe(true);
    expect(result.rows.every((row) => row.eligibilityState === "PARTIAL_CORE_CANDIDATE")).toBe(true);
  });

  it("never includes the target outcome or a future outcome in its ledger hash basis", () => {
    const earlier = game(21, "2024-06-01T17:00:00.000Z", "2024-06-01T20:00:00.000Z");
    const target = game(22, "2024-06-02T17:00:00.000Z", "2024-06-02T20:00:00.000Z");
    const later = game(23, "2024-06-03T17:00:00.000Z", "2024-06-03T20:00:00.000Z");
    const result = buildMlbHistoricalCompletionFoundation(
      [later, target, earlier],
      new Map([[target.canonicalGameId, "TRAIN"]]),
    );
    const decision = result.decisions.find((entry) => entry.canonicalGameId === target.canonicalGameId)!;
    expect(decision.eligiblePriorGameCount).toBe(1);
    expect(result.rows.find((row) => row.canonicalGameId === target.canonicalGameId)?.pitLineage.priorGameCount)
      .toBe(1);
  });

  it("promotes only chronology-safe original candidates after unchanged sample gates", () => {
    const priors = Array.from({ length: 32 }, (_, index) => {
      const start = new Date(Date.UTC(2024, 3, 1 + index, 17)).toISOString();
      const completion = new Date(new Date(start).getTime() + 3 * 60 * 60 * 1_000).toISOString();
      return game(100 + index, start, completion, {
        homeCanonicalTeamId: index % 2 ? "mlbstats:team:1" : "mlbstats:team:2",
        awayCanonicalTeamId: index % 2 ? "mlbstats:team:2" : "mlbstats:team:1",
      });
    });
    const target = game(200, "2024-06-02T17:00:00.000Z", "2024-06-02T20:00:00.000Z", {
      homeCanonicalTeamId: "mlbstats:team:1",
      awayCanonicalTeamId: "mlbstats:team:2",
    });
    const result = buildMlbHistoricalCompletionFoundation(
      [...priors, target],
      new Map([[target.canonicalGameId, "TRAIN"]]),
    );
    expect(result.rows.filter((row) => row.canonicalGameId === target.canonicalGameId)
      .every((row) => row.eligibilityState === "CORE_ELIGIBLE")).toBe(true);
    expect(result.splits).toHaveLength(1);
  });

  it("preserves locked OOS membership and is deterministic across input order", () => {
    const games = [
      game(301, "2026-05-01T17:00:00.000Z", "2026-05-01T20:00:00.000Z", { season: 2026 }),
      game(302, "2026-05-02T17:00:00.000Z", "2026-05-02T20:00:00.000Z", { season: 2026 }),
    ];
    const splits = new Map<string, "LOCKED_OOS">([
      [games[0]!.canonicalGameId, "LOCKED_OOS"],
      [games[1]!.canonicalGameId, "LOCKED_OOS"],
    ]);
    const first = buildMlbHistoricalCompletionFoundation(games, splits);
    const second = buildMlbHistoricalCompletionFoundation([...games].reverse(), splits);
    expect(first.checksum).toBe(second.checksum);
    expect(first.replayChecksum).toBe(second.replayChecksum);
    expect(first.summary.lockedOosOriginal).toBe(2);
  });

  it("keeps market families and enhanced postgame features outside sports snapshots", () => {
    const result = buildMlbHistoricalCompletionFoundation(
      [game(401, "2024-05-01T17:00:00.000Z", "2024-05-01T20:00:00.000Z")],
      new Map(),
    );
    const serialized = JSON.stringify(result.rows.map((row) => ({
      coreFeatures: row.coreFeatures,
      enhancedFeatures: row.enhancedFeatures,
    })));
    expect(serialized).not.toMatch(/moneyline|spread|sportsbook|closingOdds|americanOdds/);
    expect(result.summary.marketLeakageViolations).toBe(0);
  });
});