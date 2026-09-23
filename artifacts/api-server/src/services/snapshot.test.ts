import { describe, expect, it } from "vitest";
import type { FetchedGame } from "./espn";
import {
  createPredictionDecisionContext,
  buildImmutablePredictionFeatureSnapshot,
  isPredictionDecisionEligible,
  shouldPublishPrediction,
} from "./snapshot";
import type { ProjectionResult } from "./model";
import type { WnbaGameContext } from "./wnbaContext";

function gameWithStart(commenceTimeISO: string): FetchedGame {
  return {
    espnId: "test-game",
    sport: "MLB",
    homeTeamAbbr: "HOM",
    homeTeamName: "Home",
    awayTeamAbbr: "AWY",
    awayTeamName: "Away",
    homeTeamRecord: "10-5",
    awayTeamRecord: "8-7",
    gameTime: "7:00 PM ET",
    gameDate: "2026-08-22",
    commenceTimeISO,
    status: "upcoming",
  };
}

describe("prediction decision context market gates", () => {
  it("marks a delayed-status game as ineligible once its scheduled start has passed", () => {
    const game = gameWithStart(new Date(Date.now() - 60_000).toISOString());

    const context = createPredictionDecisionContext(
      game,
      null,
      { realVegasHomeOdds: -120, realVegasAwayOdds: 100 },
      {},
    );

    expect(context.dataQuality.missingSignals).toContain("market_started_or_invalid");
    expect(context.dataQuality.missingSignals).not.toContain("market_odds");
  });

  it("marks a Soccer market missing when the draw price is invalid", () => {
    const game = {
      ...gameWithStart(new Date(Date.now() + 60_000).toISOString()),
      sport: "Soccer",
    };

    const context = createPredictionDecisionContext(
      game,
      null,
      { realVegasHomeOdds: 120, realVegasAwayOdds: 210, realVegasDrawOdds: 0 },
      {},
    );

    expect(context.dataQuality.missingSignals).toContain("market_odds");
  });

  it("withholds an MLB prediction when either probable starter is unavailable", () => {
    const game = gameWithStart(new Date(Date.now() + 60_000).toISOString());
    const context = createPredictionDecisionContext(
      game,
      null,
      { realVegasHomeOdds: -120, realVegasAwayOdds: 100 },
      { homeStarter: null, awayStarter: null },
    );

    expect(context.dataQuality.missingSignals).toContain("probable_pitchers");
    expect(isPredictionDecisionEligible(game, context)).toBe(false);
  });

  it("stores immutable MLB signal provenance with the decision context", () => {
    const game = gameWithStart(new Date(Date.now() + 60_000).toISOString());
    const context = createPredictionDecisionContext(
      game,
      null,
      { realVegasHomeOdds: -120, realVegasAwayOdds: 100 },
      {
        homeStarter: { name: "Home Starter" },
        awayStarter: { name: "Away Starter" },
        homeLineupConfirmed: false,
        awayLineupConfirmed: false,
        homeBullpen: null,
        awayBullpen: null,
        venueWeather: null,
      },
    );

    expect(context.dataQuality.evidence?.schemaVersion).toBe("mlb-full-game-evidence-v1");
    expect(context.dataQuality.evidence?.signals.weather.available).toBe(false);
    expect(context.dataQuality.evidence?.confidenceMultiplier).toBeLessThan(1);
  });

  it("records missing independent NCAAF evidence while preserving the Neutral forecast snapshot", () => {
    const game = {
      ...gameWithStart(new Date(Date.now() + 60_000).toISOString()),
      sport: "NCAAF",
      homeTeamRecord: "0-0",
      awayTeamRecord: "0-0",
    };
    const context = createPredictionDecisionContext(
      game,
      null,
      {
        realVegasHomeOdds: -337,
        realVegasAwayOdds: 270,
        ncaafRecommendationBlocked: true,
      },
      {},
    );

    expect(context.inputSignals.ncaafRecommendationBlocked).toBe(true);
    expect(context.dataQuality.missingSignals).toContain("independent_team_evidence");
    expect(isPredictionDecisionEligible(game, context)).toBe(false);
  });

  it("preserves NCAAF feature identity while exact market approval controls publication", () => {
    const game = {
      ...gameWithStart(new Date(Date.now() + 60_000).toISOString()),
      sport: "NCAAF",
    };
    const metadata = {
      snapshotId: 42,
      schemaVersion: "ncaaf-features-v1",
      modelVersion: "ncaaf-market-free-v1",
      configHash: "config-hash",
      inputHash: "input-hash",
      dataCutoffAt: "2026-08-21T00:00:00.000Z",
      sufficientIndependentEvidence: true,
    };
    const context = createPredictionDecisionContext(
      game,
      null,
      {
        ncaafRecommendationBlocked: false,
        ncaafFeatureMetadata: metadata,
      },
      {},
    );
    const projection = {
      vegasHomeOdds: -120,
      vegasAwayOdds: 100,
      vegasSpread: -2.5,
      vegasTotal: 0,
    } as ProjectionResult;
    const snapshot = buildImmutablePredictionFeatureSnapshot(game, projection, 7, context);

    expect(shouldPublishPrediction("NCAAF")).toBe(true);
    expect(shouldPublishPrediction("MLB")).toBe(true);
    expect(isPredictionDecisionEligible(game, context)).toBe(true);
    expect(snapshot.ncaafFeature).toEqual(metadata);
    expect(snapshot.modelVersion).toMatchObject({
      id: 7,
      ncaafFeatureVersion: "ncaaf-features-v1",
      ncaafModelVersion: "ncaaf-market-free-v1",
      ncaafConfigHash: "config-hash",
    });
  });
});

describe("WNBA immutable decision evidence", () => {
  const wnbaGame = (): FetchedGame => ({
    ...gameWithStart(new Date(Date.now() + 60_000).toISOString()),
    sport: "WNBA",
    homeTeamId: "20",
    awayTeamId: "19",
  });
  const wnbaContext = (): WnbaGameContext => ({
    capturedAt: "2026-08-22T00:00:00.000Z",
    sourceSeason: 2026,
    home: {
      availability: { impactScore: 0, keyInjuries: [], evidence: { source: "espn", sourceSeason: 2026, capturedAt: "2026-08-22T00:00:00.000Z", stale: false, missing: [] } },
      schedule: { restDays: null, backToBack: null, gamesLast3Days: null, gamesLast5Days: null, roadTripLength: null, priorVenue: null, priorOpponent: null, travelMiles: null, timezoneShiftHours: null, evidence: { source: "espn-schedule+static-team-location-map", sourceSeason: 2026, capturedAt: "2026-08-22T00:00:00.000Z", stale: false, missing: ["schedule"] } },
    },
    away: {
      availability: { impactScore: 0, keyInjuries: [], evidence: { source: "espn", sourceSeason: 2026, capturedAt: "2026-08-22T00:00:00.000Z", stale: false, missing: [] } },
      schedule: { restDays: null, backToBack: null, gamesLast3Days: null, gamesLast5Days: null, roadTripLength: null, priorVenue: null, priorOpponent: null, travelMiles: null, timezoneShiftHours: null, evidence: { source: "espn-schedule+static-team-location-map", sourceSeason: 2026, capturedAt: "2026-08-22T00:00:00.000Z", stale: false, missing: [] } },
    },
    matchup: {
      pace: { home: null, away: null, missing: true },
      perimeter: { home: null, away: null, missing: true },
      reboundingInteriorProxy: { home: null, away: null, missing: true },
      turnover: { home: null, away: null, missing: true },
      freeThrow: { home: null, away: null, missing: true },
    },
    evidence: { immutable: true, missing: ["matchup.pace"] },
  });

  it("keeps WNBA unknown evidence as missing data without changing market eligibility", () => {
    const game = wnbaGame();
    const context = createPredictionDecisionContext(
      game, null,
      { realVegasHomeOdds: -120, realVegasAwayOdds: 100, injuryAdvantage: 0, wnbaContext: wnbaContext() },
      { wnbaContext: wnbaContext() },
    );
    expect(context.dataQuality.missingSignals).toContain("wnba_matchup.pace");
    expect(context.dataQuality.missingSignals).toContain("wnba_home_schedule.schedule");
    expect(isPredictionDecisionEligible(game, context)).toBe(true);
  });
});