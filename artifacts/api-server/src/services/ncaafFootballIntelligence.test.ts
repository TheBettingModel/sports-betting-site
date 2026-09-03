import { describe, expect, it } from "vitest";
import {
  buildNcaafFootballIntelligence,
  NCAAF_SCOREBOARD_AVAILABILITY,
  normalizeEspnScoreboardPerformance,
} from "./ncaafFootballIntelligence";
import type { FetchedGame } from "./espn";

const game = (overrides: Partial<FetchedGame> = {}): FetchedGame => ({
  espnId: "event-1", sport: "NCAAF", homeTeamId: "home", awayTeamId: "away",
  homeTeamAbbr: "H", homeTeamName: "Home", awayTeamAbbr: "A", awayTeamName: "Away",
  homeTeamRecord: "1-0", awayTeamRecord: "0-1", gameTime: "Noon ET",
  gameDate: "2025-09-06", commenceTimeISO: "2025-09-06T16:00:00Z", status: "final",
  homeScore: 31, awayScore: 24, week: 2,
  ...overrides,
});

describe("NCAAF scoreboard performance intelligence", () => {
  it("normalizes scoreboard scores and context without manufacturing advanced performance evidence", () => {
    const [home, away] = normalizeEspnScoreboardPerformance(game(), new Date("2025-09-07T00:00:00Z"));
    expect(home).toMatchObject({
      provider: "espn", providerEventId: "event-1", providerTeamId: "home",
      providerOpponentTeamId: "away", pointsFor: 31, pointsAgainst: 24,
      teamLocation: "home", competitionClassification: "UNKNOWN",
    });
    expect(away).toMatchObject({ pointsFor: 24, pointsAgainst: 31, teamLocation: "away" });
    expect(home.derivedMetrics).toBeNull();
    expect(home.possessions).toBeNull();
    expect(home.missingFields).toContain("epaPerPlay");
    expect(NCAAF_SCOREBOARD_AVAILABILITY.driveEvidence.availability).toBe("unsupported");
  });

  it("preserves missing scoreboard values as null, never zero", () => {
    const [home] = normalizeEspnScoreboardPerformance(game({
      homeScore: undefined, awayScore: undefined, homeHalftimeScore: undefined,
    }));
    expect(home.pointsFor).toBeNull();
    expect(home.pointsAgainst).toBeNull();
    expect(home.halftimePointsFor).toBeNull();
    expect(home.pointsFor).not.toBe(0);
    expect(home.missingReasons.pointsFor).toMatch(/omitted/);
  });

  it("uses only chronologically prior opponent results and reports prior-season samples", () => {
    const intelligence = buildNcaafFootballIntelligence("home", 2025, [
      { provider: "espn", providerEventId: "old-away", providerTeamId: "away", providerOpponentTeamId: "x", season: 2025, kickoffAt: new Date("2025-09-01T12:00:00Z"), pointsFor: 21, pointsAgainst: 14, competitionClassification: "UNKNOWN" },
      { provider: "espn", providerEventId: "home-game", providerTeamId: "home", providerOpponentTeamId: "away", season: 2025, kickoffAt: new Date("2025-09-06T12:00:00Z"), pointsFor: 28, pointsAgainst: 14, competitionClassification: "UNKNOWN" },
      { provider: "espn", providerEventId: "prior", providerTeamId: "home", providerOpponentTeamId: "z", season: 2024, kickoffAt: new Date("2024-09-06T12:00:00Z"), pointsFor: 20, pointsAgainst: 17, competitionClassification: "UNKNOWN" },
    ], new Date("2025-09-20T00:00:00Z"));
    expect(intelligence.chronologicalOpponentStrength[0]).toMatchObject({
      providerEventId: "home-game", opponentPriorGames: 1, opponentPriorAverageMargin: 7,
    });
    expect(intelligence.sampleMetadata).toMatchObject({
      currentSeason: { games: 1, scoredGames: 1 }, priorSeason: { games: 1, scoredGames: 1 },
    });
    expect(JSON.stringify(intelligence)).not.toMatch(/probability|recommendation/i);
  });
});