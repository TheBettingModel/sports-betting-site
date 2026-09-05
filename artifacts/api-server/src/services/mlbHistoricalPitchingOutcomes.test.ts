import { describe, expect, it } from "vitest";
import {
  mlbInningsToDecimal,
  parseMlbStatsApiPitchingOutcomes,
} from "./mlbHistoricalPitchingOutcomes";

const boxscore = {
  teams: {
    away: {
      pitchers: [101, 102, 103],
      players: {
        ID101: {
          person: { id: 101, fullName: "Away Starter", pitchHand: { code: "R" } },
          stats: { pitching: {
            inningsPitched: "5.2", battersFaced: 23, runs: 2, earnedRuns: 2,
            hits: 5, baseOnBalls: 1, strikeOuts: 7, homeRuns: 1,
            hitBatsmen: 1, numberOfPitches: 91, strikes: 61,
          } },
        },
        ID102: {
          person: { id: 102, fullName: "Away Relief", pitchHand: { code: "L" } },
          stats: { pitching: {
            inningsPitched: "1.1", battersFaced: 5, runs: 0, earnedRuns: 0,
            hits: 1, baseOnBalls: 0, strikeOuts: 2, homeRuns: 0,
            hitBatsmen: 1, numberOfPitches: 18, strikes: 12,
          } },
        },
        ID103: { person: { id: 103, fullName: "Listed But Unused" }, stats: {} },
      },
    },
    home: {
      pitchers: [201, 202],
      players: {
        ID201: {
          person: { id: 201, fullName: "Home Starter" },
          stats: { pitching: {
            inningsPitched: "6.0", battersFaced: 24, runs: 1, earnedRuns: 1,
            hits: 4, baseOnBalls: 2, strikeOuts: 6, homeRuns: 0,
            hitBatsmen: 0, numberOfPitches: 88, strikes: 55,
          } },
        },
        ID202: {
          person: { id: 202, fullName: "Home Relief" },
          stats: { pitching: {
            inningsPitched: "1.0", battersFaced: 4, runs: 0, earnedRuns: 0,
            hits: 0, baseOnBalls: 1, strikeOuts: 1, homeRuns: 0,
            hitBatsmen: 0, numberOfPitches: 15, strikes: 9,
          } },
        },
      },
    },
  },
};

describe("MLB StatsAPI pitching outcome parser", () => {
  it("parses exact boxscore team/player/pitching shapes and excludes the actual first pitcher from bullpen", () => {
    const parsed = parseMlbStatsApiPitchingOutcomes(boxscore, {
      gameId: "g1", season: 2025, completionTime: "2025-06-01T22:00:00.000Z",
      homeTeamId: "mlb-team:2", awayTeamId: "mlb-team:1",
    });
    expect(parsed.appearances).toHaveLength(4);
    expect(parsed.appearances[0]).toMatchObject({
      canonicalPitcherId: "mlb:101", teamId: "mlb-team:1", appearanceOrder: 1,
      starterFlagActual: true, inningsPitched: 5 + 2 / 3, battersFaced: 23,
      runsAllowed: 2, earnedRuns: 2, hitsAllowed: 5, walks: 1,
      hitBatters: 1, strikeouts: 7, homeRunsAllowed: 1, pitchCount: 91, strikes: 61, throws: "R",
    });
    expect(parsed.appearances[1]).toMatchObject({
      canonicalPitcherId: "mlb:102", appearanceOrder: 2, starterFlagActual: false,
    });
    expect(parsed.bullpens[0]).toMatchObject({
      teamId: "mlb-team:1", bullpenInnings: 1 + 1 / 3, bullpenBattersFaced: 5,
      bullpenRuns: 0, bullpenEarnedRuns: 0, bullpenHits: 1, bullpenWalks: 0,
      bullpenHitBatters: 1, bullpenStrikeouts: 2, bullpenHomeRuns: 0, bullpenPitchCount: 18,
      bullpenStrikes: 12, relieversUsed: 1,
    });
  });

  it("uses deterministic canonical MLB identity and baseball innings conversion", () => {
    expect(mlbInningsToDecimal("0.1")).toBeCloseTo(1 / 3);
    expect(mlbInningsToDecimal("9.2")).toBeCloseTo(9 + 2 / 3);
    expect(mlbInningsToDecimal("7")).toBe(7);
    expect(mlbInningsToDecimal("7.0")).toBe(7);
    expect(mlbInningsToDecimal("2.3")).toBeNull();
    expect(mlbInningsToDecimal("1.25")).toBeNull();
    const input = {
      gameId: "g1", season: 2025, completionTime: "2025-06-01T22:00:00Z",
      homeTeamId: "h", awayTeamId: "a",
    };
    expect(parseMlbStatsApiPitchingOutcomes(boxscore, input))
      .toEqual(parseMlbStatsApiPitchingOutcomes(structuredClone(boxscore), input));
  });

  it("requires sealed completion evidence", () => {
    expect(() => parseMlbStatsApiPitchingOutcomes(boxscore, {
      gameId: "g", season: 2025, completionTime: "unknown", homeTeamId: "h", awayTeamId: "a",
    })).toThrow(/sealed completion/);
  });
});