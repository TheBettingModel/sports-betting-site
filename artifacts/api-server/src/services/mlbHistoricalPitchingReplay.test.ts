import { describe, expect, it } from "vitest";
import type { ParsedMlbPitchingOutcomes } from "./mlbHistoricalPitchingOutcomes";
import {
  MLB_BULLPEN_FATIGUE_PITCH_THRESHOLDS,
  MLB_PIT_FIP_CONSTANT,
  MLB_PIT_FIP_FORMULA,
  replayMlbPitchingPit,
  type MlbPitchingReplayGame,
  type PregameStarterEvidence,
} from "./mlbHistoricalPitchingReplay";

function game(
  gameId: string, cutoff: string, completion: string | null,
  homeTeamId = "B", awayTeamId = "A",
  extras: Partial<MlbPitchingReplayGame> = {},
): MlbPitchingReplayGame {
  return {
    gameId, season: 2025, baseballDate: cutoff.slice(0, 10),
    homeTeamId, awayTeamId, featureCutoff: cutoff,
    canonicalCompletionTime: completion, finalStatus: true, quarantineReason: null, ...extras,
  };
}

function outcomes(
  gameId: string, completion: string, awayTeam = "A", homeTeam = "B",
  awayPitcher = "mlb:1", awayReliever = "mlb:2", awayPitches = 20,
): ParsedMlbPitchingOutcomes {
  const appearance = (
    teamId: string, opponentId: string, id: string, starter: boolean, order: number, pitches: number,
  ) => ({
    gameId, canonicalPitcherId: id, providerPitcherId: id.slice(4), pitcherName: id,
    teamId, opponentId, season: 2025, appearanceOrder: order, starterFlagActual: starter,
    inningsPitched: starter ? 6 : 1, battersFaced: starter ? 24 : 4,
    runsAllowed: starter ? 2 : 0, earnedRuns: starter ? 2 : 0, hitsAllowed: starter ? 5 : 1,
    walks: starter ? 2 : 0, hitBatters: starter ? 1 : 0,
    strikeouts: starter ? 6 : 1, homeRunsAllowed: starter ? 1 : 0,
    pitchCount: pitches, strikes: Math.floor(pitches * 0.65), throws: "R" as const,
    appearanceCompletionTime: completion,
    source: "mlb-statsapi-boxscore-pitching-v1" as const, sourceHash: `hash-${gameId}`,
  });
  const away = [
    appearance(awayTeam, homeTeam, awayPitcher, true, 1, 90),
    appearance(awayTeam, homeTeam, awayReliever, false, 2, awayPitches),
  ];
  const home = [
    appearance(homeTeam, awayTeam, `mlb:h-${gameId}`, true, 1, 85),
    appearance(homeTeam, awayTeam, `mlb:hr-${gameId}`, false, 2, 15),
  ];
  return {
    appearances: [...away, ...home],
    bullpens: [
      {
        gameId, teamId: awayTeam, opponentId: homeTeam, season: 2025,
        bullpenInnings: 1, bullpenBattersFaced: 4, bullpenRuns: 0, bullpenEarnedRuns: 0,
        bullpenHits: 1, bullpenWalks: 0, bullpenStrikeouts: 1, bullpenHomeRuns: 0,
        bullpenHitBatters: 0,
        bullpenPitchCount: awayPitches, bullpenStrikes: 13, relieversUsed: 1,
        appearanceCompletionTime: completion, sourceHash: `hash-${gameId}`,
      },
      {
        gameId, teamId: homeTeam, opponentId: awayTeam, season: 2025,
        bullpenInnings: 1, bullpenBattersFaced: 4, bullpenRuns: 0, bullpenEarnedRuns: 0,
        bullpenHits: 1, bullpenWalks: 0, bullpenStrikeouts: 1, bullpenHomeRuns: 0,
        bullpenHitBatters: 0,
        bullpenPitchCount: 15, bullpenStrikes: 10, relieversUsed: 1,
        appearanceCompletionTime: completion, sourceHash: `hash-${gameId}`,
      },
    ],
    sourceHash: `hash-${gameId}`,
  };
}

const prior = game("prior", "2025-06-01T18:00:00Z", "2025-06-01T21:00:00Z");
const target = game("target", "2025-06-02T18:00:00Z", "2025-06-02T21:00:00Z");
const future = game("future", "2025-06-03T18:00:00Z", "2025-06-03T21:00:00Z");
const evidence: PregameStarterEvidence[] = [{
  gameId: "target", teamId: "A", pitcherId: "mlb:1",
  state: "CONFIRMED_PREGAME", observedAt: "2025-06-02T17:00:00Z",
}];

describe("deterministic MLB pitcher and bullpen PIT replay", () => {
  it("freezes target before target/future outcomes and requires separate pregame starter evidence", () => {
    const replay = replayMlbPitchingPit(
      [future, target, prior],
      [outcomes("future", future.canonicalCompletionTime!), outcomes("target", target.canonicalCompletionTime!),
        outcomes("prior", prior.canonicalCompletionTime!)],
    );
    const row = replay.snapshots.find((entry) => entry.gameId === "target" && entry.teamId === "A")!;
    expect(row.sourceGameIds).toEqual(["prior"]);
    expect(row.starterIdentityState).toBe("ACTUAL_ONLY");
    expect(row.pregameStarterId).toBeNull();
    expect(row.pitcher.career.appearances).toBe(0);
    expect(row.pitcher.career.innings).toBeNull();
    expect(row.pitcher.recent3.hitBatters).toBeNull();
    expect(row.bullpen.season.appearances).toBe(1);

    const proven = replayMlbPitchingPit([prior, target], [
      outcomes("prior", prior.canonicalCompletionTime!), outcomes("target", target.canonicalCompletionTime!),
    ], evidence).snapshots.find((entry) => entry.gameId === "target" && entry.teamId === "A")!;
    expect(proven.starterIdentityState).toBe("CONFIRMED_PREGAME");
    expect(proven.pitcher.career.appearances).toBe(1);
    expect(proven.pitcher.lastStartPitchCount).toBe(90);
    expect(proven.pitcher.lastStartInnings).toBe(6);
  });

  it("follows a traded player but keeps bullpen history with the team", () => {
    const tradeTarget = game("trade", "2025-06-02T18:00:00Z", "2025-06-02T21:00:00Z", "B", "C");
    const row = replayMlbPitchingPit([prior, tradeTarget], [outcomes("prior", prior.canonicalCompletionTime!)], [{
      gameId: "trade", teamId: "C", pitcherId: "mlb:1",
      state: "PROJECTED_PREGAME", observedAt: "2025-06-02T10:00:00Z",
    }]).snapshots.find((entry) => entry.gameId === "trade" && entry.teamId === "C")!;
    expect(row.pitcher.career.appearances).toBe(1);
    expect(row.bullpen.season.appearances).toBe(0);
  });

  it("uses strict completion chronology for doubleheaders and suspended/quarantined games", () => {
    const game2 = game("dh2", "2025-06-01T20:00:00Z", "2025-06-01T23:00:00Z");
    const lateGame1 = game("dh1", "2025-06-01T16:00:00Z", "2025-06-01T20:00:00Z");
    const suspended = game("suspended", "2025-05-30T18:00:00Z", null, "B", "A", {
      finalStatus: false, quarantineReason: "SUSPENDED",
    });
    const row = replayMlbPitchingPit([lateGame1, game2, suspended], [
      outcomes("dh1", "2025-06-01T20:00:00Z"),
      outcomes("suspended", "2025-06-02T22:00:00Z"),
    ]).snapshots.find((entry) => entry.gameId === "dh2" && entry.teamId === "A")!;
    expect(row.sourceGameIds).toEqual([]);
    expect(row.bullpen.pitchesLast1d).toBe(0);
  });

  it("requires a league prior when the archive cannot distinguish a rookie from pre-archive history", () => {
    const row = replayMlbPitchingPit([target], [outcomes("target", target.canonicalCompletionTime!)], [{
      gameId: "target", teamId: "A", pitcherId: "mlb:rookie",
      state: "PROJECTED_PREGAME", observedAt: "2025-06-02T12:00:00Z",
    }]).snapshots.find((entry) => entry.teamId === "A")!;
    expect(row.pitcher.priorType).toBe("LEAGUE_PRIOR_REQUIRED");
    expect(row.missingness.starterSmallSample).toBe(true);
    expect(row.bullpen.season.appearances).toBe(0);
    expect(row.missingness.bullpenIdentityIncomplete).toBe(true);
  });

  it("computes fixed, descriptive PIT FIP only from complete prior components", () => {
    const complete = replayMlbPitchingPit([prior, target], [
      outcomes("prior", prior.canonicalCompletionTime!),
    ], evidence).snapshots.find((entry) => entry.gameId === "target" && entry.teamId === "A")!;
    expect(MLB_PIT_FIP_CONSTANT).toBe(3.10);
    expect(MLB_PIT_FIP_FORMULA).toBe("(13*HR + 3*(BB+HBP) - 2*K)/IP + 3.10");
    expect(complete.pitcher.season.hitBatters).toBe(1);
    expect(complete.bullpen.season.hitBatters).toBe(0);
    expect(complete.pitcher.season.fip)
      .toBeCloseTo((13 * 1 + 3 * (2 + 1) - 2 * 6) / 6 + 3.10);
    expect(complete.bullpen.season.fip).toBeCloseTo(1.10);
    expect(complete.missingness.pitcherFipUnavailable).toBe(false);
    expect(complete.missingness.bullpenFipUnavailable).toBe(false);

    const incomplete = outcomes("prior", prior.canonicalCompletionTime!);
    incomplete.appearances[0].hitBatters = null;
    incomplete.bullpens[0].bullpenHitBatters = null;
    const missing = replayMlbPitchingPit([prior, target], [incomplete], evidence)
      .snapshots.find((entry) => entry.gameId === "target" && entry.teamId === "A")!;
    expect(missing.pitcher.season.fip).toBeNull();
    expect(missing.bullpen.season.fip).toBeNull();
    expect(missing.missingness.pitcherFipUnavailable).toBe(true);
    expect(missing.missingness.bullpenFipUnavailable).toBe(true);
  });

  it("exports fixed fatigue thresholds for audit citation", () => {
    expect(MLB_BULLPEN_FATIGUE_PITCH_THRESHOLDS).toEqual({
      WORKED_MIN: 40, TIRED_MIN: 80, VERY_TIRED_MIN: 120,
    });
  });

  it("counts reliever consecutive-day usage by adjacent baseball dates, not completion dates", () => {
    const june1 = game("june1", "2025-06-02T03:00:00Z", "2025-06-02T02:00:00Z", "B", "A", {
      baseballDate: "2025-06-01",
    });
    const june2 = game("june2", "2025-06-03T03:00:00Z", "2025-06-03T02:00:00Z", "B", "A", {
      baseballDate: "2025-06-02",
    });
    const june3 = game("june3", "2025-06-04T03:00:00Z", "2025-06-04T02:00:00Z", "B", "A", {
      baseballDate: "2025-06-03",
    });
    const june4 = game("june4", "2025-06-04T18:00:00Z", "2025-06-04T21:00:00Z", "B", "A", {
      baseballDate: "2025-06-04",
    });
    const gapped = replayMlbPitchingPit([june1, june3, june4], [
      outcomes("june1", june1.canonicalCompletionTime!),
      outcomes("june3", june3.canonicalCompletionTime!),
    ]).snapshots.find((entry) => entry.gameId === "june4" && entry.teamId === "A")!;
    expect(gapped.bullpen.backToBackRelievers).toBe(0);
    expect(gapped.bullpen.threeDayRelievers).toBe(0);

    const consecutive = replayMlbPitchingPit([june1, june2, june3, june4], [
      outcomes("june1", june1.canonicalCompletionTime!),
      outcomes("june2", june2.canonicalCompletionTime!),
      outcomes("june3", june3.canonicalCompletionTime!),
    ]).snapshots.find((entry) => entry.gameId === "june4" && entry.teamId === "A")!;
    expect(consecutive.bullpen.backToBackRelievers).toBe(1);
    expect(consecutive.bullpen.threeDayRelievers).toBe(1);
  });

  it("is independent of input order and rejects all market contamination", () => {
    const first = replayMlbPitchingPit([target, prior], [
      outcomes("target", target.canonicalCompletionTime!), outcomes("prior", prior.canonicalCompletionTime!),
    ], evidence);
    const second = replayMlbPitchingPit([prior, target], [
      outcomes("prior", prior.canonicalCompletionTime!), outcomes("target", target.canonicalCompletionTime!),
    ], evidence);
    expect(first.checksum).toBe(second.checksum);
    expect(first.snapshots).toEqual(second.snapshots);
    expect(() => replayMlbPitchingPit([
      { ...target, moneyline: -120 } as MlbPitchingReplayGame,
    ], [])).toThrow(/Market field prohibited/);
  });
});