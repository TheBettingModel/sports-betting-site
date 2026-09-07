import { describe, expect, it } from "vitest";
import { isDeployableModelIdentity, isPermanentShadowModelId } from "./modelRegistryShared";
import {
  computeMlbV41Forecast,
  MLB_V41_CONFIGURATION_HASH,
  MLB_V41_MODEL_ID,
} from "./mlbV41RunModel";
import { computeMlbV4Forecast, type MlbV4Input } from "./mlbV4Challenger";
import type { FetchedGame } from "./espn";

const game = { espnId: "test", sport: "MLB", commenceTimeISO: "2026-09-03T19:00:00.000Z" } as FetchedGame;
const input = {
  homeDbStats: { scoredPerGame: 6, allowedPerGame: 1, sampleSize: 20 },
  awayDbStats: { scoredPerGame: 3, allowedPerGame: 9, sampleSize: 20 },
  starters: { home: null, away: null },
  lineups: null, bullpen: null, weather: null, weatherTotalAdjustment: 0,
  evidence: {
    schemaVersion: "mlb-full-game-evidence-v1",
    capturedAt: "2026-09-03T12:00:00.000Z",
    cutoffTimestamp: "2026-09-03T19:00:00.000Z",
    recommendationBlocked: false,
    confidenceMultiplier: 1,
    missingSignals: [],
    qualityReasons: [],
    signals: {},
  }, market: {},
} as unknown as MlbV4Input;

describe("MLB V4.1 research run model", () => {
  it("is exactly output-equivalent to V4 and derives its audit from V4 contributions", () => {
    const timestamp = new Date("2026-09-03T12:00:00.000Z");
    const v4Before = computeMlbV4Forecast(game, input, timestamp);
    const forecast = computeMlbV41Forecast(game, input, timestamp);
    const v4After = computeMlbV4Forecast(game, input, timestamp);
    expect(forecast.expectedRuns).toEqual(v4Before.expectedRuns);
    expect(forecast.probability).toEqual(v4Before.probability);
    expect(v4After).toEqual(v4Before);
    expect(forecast.decomposition.home.offensiveAdjustment)
      .toBe(v4Before.contributions.teamOffense.homeRuns);
    expect(forecast.sourceV4.outputEquivalent).toBe(true);
  });

  it("is permanently shadow-only and cannot produce official activity", () => {
    const forecast = computeMlbV41Forecast(game, input);
    expect(isPermanentShadowModelId(MLB_V41_MODEL_ID)).toBe(true);
    expect(isDeployableModelIdentity({ modelId: MLB_V41_MODEL_ID, sport: "MLB", market: "moneyline" })).toBe(false);
    expect(forecast.researchPolicy).toMatchObject({
      officialPick: false, officialUnits: 0, notifications: false,
      publicationStatus: "SHADOW_NOT_PUBLISHABLE",
    });
    expect(forecast.model.configurationHash).toBe(MLB_V41_CONFIGURATION_HASH);
  });
});