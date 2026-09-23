import { describe, expect, it } from "vitest";
import artifactJson from "../../../../model-artifacts/v4/nfl-v4-core.json";
import {
  createNflV4Engine,
  materializeNflV4,
  nflSeason,
  trainNflV4,
  type NflHistoricalGame,
  type NflV4Artifact,
} from "./nflV4";

const game = (
  id: string,
  start: string,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
): NflHistoricalGame => ({
  gameId: id,
  eventStart: start,
  completedAt: new Date(Date.parse(start) + 12 * 60 * 60 * 1000).toISOString(),
  homeTeamId: home,
  awayTeamId: away,
  homeScore,
  awayScore,
});

const parameters = {
  carryover: .35,
  kFactor: 12,
  homeAdvantageElo: 55,
  scoreRecencyAlpha: .25,
  leaguePointsPrior: 22.5,
};

describe("NFL V4 core", () => {
  it("uses the July NFL season boundary", () => {
    expect(nflSeason("2026-02-08T23:30:00.000Z")).toBe(2025);
    expect(nflSeason("2026-09-10T00:20:00.000Z")).toBe(2026);
  });

  it("uses only outcomes conservatively completed before kickoff", () => {
    const games = [
      game("one", "2025-09-01T17:00:00.000Z", "A", "B", 24, 17),
      game("overlap", "2025-09-01T20:00:00.000Z", "C", "D", 31, 7),
      game("two", "2025-09-08T17:00:00.000Z", "A", "B", 20, 21),
    ];
    const { vectors } = materializeNflV4(games, parameters);
    const vector = vectors.find((value) => value.gameId === "two");
    expect(vector?.sourceEvidenceTimes).toEqual(["2025-09-02T05:00:00.000Z", "2025-09-02T05:00:00.000Z"]);
    expect(vector?.sourceEvidenceTimes).not.toContain("2025-09-02T08:00:00.000Z");
  });

  it("freezes and verifies a deterministic artifact", () => {
    const artifact = artifactJson as unknown as NflV4Artifact;
    expect(() => createNflV4Engine(artifact)).not.toThrow();
    expect(artifact.metrics.validationBrier).toBeLessThan(artifact.metrics.baselineValidationBrier);
    expect(artifact.metrics.oosBrier).toBeLessThan(artifact.metrics.baselineOosBrier);
    expect(artifact.approvalState).toBe("SHADOW");
  });

  it("reproduces training exactly for identical evidence", async () => {
    const artifact = artifactJson as unknown as NflV4Artifact;
    const engine = createNflV4Engine(artifact);
    const seedTeamIds = Object.keys(artifact.historySeed.teams);
    const input = {
      gameId: "deterministic",
      eventStart: "2026-09-20T17:00:00.000Z",
      dataCutoff: artifact.historySeed.asOf,
      predictionTimestamp: "2026-09-20T12:00:00.000Z",
      sourceEvidenceTimes: [artifact.historySeed.asOf],
      featureSnapshotId: "NFL:deterministic:test",
      featureHash: "",
      input: {
        home_elo: artifact.historySeed.teams[seedTeamIds[0]!]!.elo,
        away_elo: artifact.historySeed.teams[seedTeamIds[1]!]!.elo,
        home_points_for: 22,
        home_points_allowed: 21,
        away_points_for: 21,
        away_points_allowed: 22,
        home_rest_days: 14,
        away_rest_days: 14,
        home_season_games: 0,
        away_season_games: 0,
        home_indicator: 1,
      },
    };
    const first = await engine.predict(input);
    const second = await engine.predict(input);
    expect(first).toEqual(second);
    expect(first.homeWinProbability! + first.awayWinProbability!).toBeCloseTo(1, 12);
    expect(first.expectedHomeScore).toBeGreaterThanOrEqual(0);
    expect(first.expectedAwayScore).toBeGreaterThanOrEqual(0);
  });

  it("rejects training on a materially sparse cohort", () => {
    expect(() => trainNflV4([
      game("one", "2025-09-01T17:00:00.000Z", "A", "B", 24, 17),
    ], "2026-09-07T12:00:00.000Z")).toThrow("NFL_COHORT_INSUFFICIENT_OR_UNSTABLE");
  });
});