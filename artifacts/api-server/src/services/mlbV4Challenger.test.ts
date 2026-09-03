import { describe, expect, it } from "vitest";
import type { FetchedGame } from "./espn";
import type { MlbDecisionEvidence } from "./mlbDecisionEvidence";
import {
  MLB_V4_CALIBRATION_VERSION,
  MLB_V4_FEATURE_SCHEMA_VERSION,
  MLB_V4_MODEL_ID,
  computeMlbV4Forecast,
  computeMlbV4OutcomeDistribution,
  type MlbV4Input,
} from "./mlbV4Challenger";
import { isDeployableModelIdentity, isPermanentShadowModelId } from "./modelRegistryShared";

function game(overrides: Partial<FetchedGame> = {}): FetchedGame {
  return {
    espnId: "MLB-401816747",
    sport: "MLB",
    league: "mlb",
    gameDate: "2026-08-31",
    commenceTimeISO: "2026-08-31T22:45:00.000Z",
    gameTime: "6:45 PM ET",
    status: "upcoming",
    homeTeamName: "Washington Nationals",
    awayTeamName: "Miami Marlins",
    homeTeamAbbr: "WSH",
    awayTeamAbbr: "MIA",
    homeTeamId: "20",
    awayTeamId: "28",
    homeTeamRecord: "65-74",
    awayTeamRecord: "69-68",
    homeHomeRecord: "31-39",
    homeRoadRecord: "34-35",
    awayHomeRecord: "42-27",
    awayRoadRecord: "27-41",
    neutralSite: false,
    vegasHomeOdds: -100,
    vegasAwayOdds: -112,
    vegasDrawOdds: null,
    vegasSpread: null,
    vegasOverUnder: 8.5,
    homeScore: null,
    awayScore: null,
    ...overrides,
  } as FetchedGame;
}

function evidence(overrides: Partial<MlbDecisionEvidence> = {}): MlbDecisionEvidence {
  const capturedAt = "2026-08-31T22:05:48.947Z";
  const cutoffTimestamp = "2026-08-31T22:45:00.000Z";
  const validSignal = (source: string) => ({
    source,
    capturedAt,
    cutoffTimestamp,
    cacheAgeMs: 2_080_000,
    available: true,
    qualityReasons: [],
  });
  return {
    schemaVersion: "mlb-full-game-evidence-v1",
    capturedAt,
    cutoffTimestamp,
    recommendationBlocked: false,
    confidenceMultiplier: 0.78,
    missingSignals: [],
    qualityReasons: ["home_lineup_unconfirmed", "away_lineup_unconfirmed"],
    signals: {
      market: validSignal("selected validated moneyline market"),
      starters: validSignal("MLB Stats API probable pitchers"),
      bullpen: validSignal("MLB Stats API finalized boxscores"),
      lineups: {
        ...validSignal("MLB Stats API confirmed lineups"),
        available: false,
        qualityReasons: ["home_lineup_unconfirmed", "away_lineup_unconfirmed"],
      },
      weather: validSignal("Open-Meteo venue forecast"),
      teamStats: validSignal("stored MLB team run and form statistics"),
    },
    ...overrides,
  };
}

function historicalInput(): MlbV4Input {
  return {
    homeDbStats: {
      sport: "MLB",
      teamId: "20",
      restDays: 1,
      sampleSize: 20,
      last5WinPct: 0.4,
      last10WinPct: 0.2,
      scoredPerGame: 1.9,
      allowedPerGame: 2.1,
      last5ScoreDiff: 0.8,
      last10ScoreDiff: -0.2,
      pythagoreanWinPct: 0.45433938654962724,
      scoreDifferential: -0.2,
    },
    awayDbStats: {
      sport: "MLB",
      teamId: "28",
      restDays: 1,
      sampleSize: 20,
      last5WinPct: 0.2,
      last10WinPct: 0.3,
      scoredPerGame: 2.25,
      allowedPerGame: 2.35,
      last5ScoreDiff: -0.8,
      last10ScoreDiff: 0.2,
      pythagoreanWinPct: 0.4801160533019196,
      scoreDifferential: -0.1,
    },
    starters: {
      home: {
        fip: 3.769902912621359,
        kPct: 0.2949640287769784,
        name: "Will Dion",
        bbPct: 0.06474820143884892,
        playerId: 702021,
        seasonIp: 34.333333333333336,
        pitchHand: "L",
        recentEra: 3.216666666666667,
        seasonEra: 3.67,
        seasonWhip: 1.14,
        kMinusBbPct: 0.2302158273381295,
        recentIpAvg: 2.222222222222222,
        recentStartCount: 3,
        seasonBattersFaced: 139,
        recentPitchCountAvg: 39.333333333333336,
      },
      away: {
        fip: 3.9210526315789473,
        kPct: 0.18928571428571428,
        name: "Ryan Gusto",
        bbPct: 0.06428571428571428,
        playerId: 687473,
        seasonIp: 63.333333333333336,
        pitchHand: "R",
        recentEra: 4.3500000000000005,
        seasonEra: 3.98,
        seasonWhip: 1.33,
        kMinusBbPct: 0.125,
        recentIpAvg: 4.777777777777779,
        recentStartCount: 3,
        seasonBattersFaced: 280,
        recentPitchCountAvg: 73.66666666666667,
      },
      qualityReasons: [],
    },
    lineups: {
      home: { confirmed: false, batterCount: 0 },
      away: { confirmed: false, batterCount: 0 },
    },
    bullpen: {
      home: {
        teamAbbr: "WSH",
        fatigueLabel: "Tired",
        gamesLast3Days: 3,
        weightedPitches: 122,
      },
      away: {
        teamAbbr: "MIA",
        fatigueLabel: "Tired",
        gamesLast3Days: 3,
        weightedPitches: 135,
      },
    },
    parkFactor: 98,
    weather: {
      isDome: false,
      windSpeedMph: 3.8,
      precipitationMm: 0,
      windDirectionDeg: 357,
      temperatureCelsius: 30.5,
    },
    weatherTotalAdjustment: 0,
    evidence: evidence(),
    market: {
      homeOdds: -100,
      awayOdds: -112,
      pinnacleHomeOdds: -103,
      pinnacleAwayOdds: -105,
      consensusHomeOdds: -100,
      consensusAwayOdds: -112,
    },
  };
}

describe("MLB V4 sports forecasting challenger", () => {
  it("is permanently non-deployable at the shared registry boundary", () => {
    expect(isPermanentShadowModelId(MLB_V4_MODEL_ID)).toBe(true);
    expect(isDeployableModelIdentity({
      modelId: MLB_V4_MODEL_ID,
      sport: "MLB",
      market: "moneyline",
    })).toBe(false);
  });

  it("uses a normalized run distribution and treats equal expected runs symmetrically", () => {
    const distribution = computeMlbV4OutcomeDistribution(4.5, 4.5);
    expect(distribution.homeWinProbability + distribution.awayWinProbability).toBeCloseTo(1, 12);
    expect(distribution.homeWinProbability).toBeCloseTo(0.5, 12);
    expect(distribution.regulationTieProbability).toBeGreaterThan(0);
  });

  it("is deterministic and contains no game-ID probability noise", () => {
    const input = historicalInput();
    const first = computeMlbV4Forecast(game(), input, new Date("2026-08-31T22:05:48.947Z"));
    const second = computeMlbV4Forecast(
      game({ espnId: "COMPLETELY-DIFFERENT-ID" }),
      input,
      new Date("2026-08-31T22:05:48.947Z"),
    );
    expect(second.expectedRuns).toEqual(first.expectedRuns);
    expect(second.probability).toEqual(first.probability);
    expect(second.uncertainty).toEqual(first.uncertainty);
  });

  it("reconstructs the historical WSH-MIA pregame snapshot with explicit missing lineup uncertainty", () => {
    const forecast = computeMlbV4Forecast(
      game(),
      historicalInput(),
      new Date("2026-08-31T22:05:48.947Z"),
    );

    expect(forecast.model.modelId).toBe(MLB_V4_MODEL_ID);
    expect(forecast.model.featureSchemaVersion).toBe(MLB_V4_FEATURE_SCHEMA_VERSION);
    expect(forecast.expectedRuns.away).toBeCloseTo(3.315, 3);
    expect(forecast.expectedRuns.home).toBeCloseTo(3.347, 3);
    expect(forecast.probability.calibratedHome).toBeCloseTo(0.503, 2);
    expect(forecast.probability.calibrationModelVersion).toBe(MLB_V4_CALIBRATION_VERSION);
    expect(forecast.probability.calibrationStatus).toBe("UNFITTED_IDENTITY");
    expect(forecast.dataQuality.lineupQualityState).toBe("MISSING");
    expect(forecast.uncertainty.sources.lineup).toBe(3);
    expect(forecast.contributions.pitchTypeMatchup.state).toBe("NOT_APPLICABLE");
    expect(forecast.contributions.defense.awayRuns).toBe(0);
    expect(forecast.researchPolicy.officialUnits).toBe(0);
    expect(forecast.researchPolicy.publicationStatus).toBe("SHADOW_NOT_OFFICIAL");
  });

  it("increases uncertainty rather than moving probability when inputs disappear", () => {
    const fullInput = historicalInput();
    const full = computeMlbV4Forecast(game(), fullInput);
    const missing = computeMlbV4Forecast(game(), {
      ...fullInput,
      starters: { home: null, away: null },
      lineups: null,
      bullpen: null,
      homeDbStats: undefined,
      awayDbStats: undefined,
      weather: null,
      parkFactor: undefined,
      market: {},
      evidence: evidence({
        missingSignals: ["market_odds", "starting_pitchers", "lineups", "bullpen", "weather"],
      }),
    });

    expect(missing.uncertainty.homeProbabilityPoints).toBeGreaterThan(full.uncertainty.homeProbabilityPoints);
    expect(missing.dataQuality.score).toBeLessThan(full.dataQuality.score);
    expect(missing.researchPolicy.recommendation).toBe("Neutral");
    expect(missing.researchPolicy.blockers).toContain("credible_market_missing");
    expect(missing.featureStates.pitcher.xEra).toBe("NOT_APPLICABLE");
  });
});