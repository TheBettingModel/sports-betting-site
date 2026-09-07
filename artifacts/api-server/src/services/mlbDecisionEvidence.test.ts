import { describe, expect, it } from "vitest";
import type { FetchedGame } from "./espn";
import { assessMlbDecisionEvidence } from "./mlbDecisionEvidence";

const game: FetchedGame = {
  espnId: "mlb-evidence-game",
  sport: "MLB",
  homeTeamAbbr: "HOM",
  homeTeamName: "Home",
  awayTeamAbbr: "AWY",
  awayTeamName: "Away",
  homeTeamRecord: "60-40",
  awayTeamRecord: "55-45",
  gameTime: "7:00 PM ET",
  gameDate: "2026-08-22",
  commenceTimeISO: new Date(Date.now() + 3_600_000).toISOString(),
  status: "upcoming",
};
const completeStarter = (name: string) => ({
  name,
  playerId: 1,
  pitchHand: "R",
  seasonEra: 3,
  seasonWhip: 1.1,
  fip: 3.1,
  kPct: 0.24,
  bbPct: 0.08,
  kMinusBbPct: 0.16,
  recentEra: 3.2,
  recentIpAvg: 5.5,
  seasonIp: 100,
  seasonBattersFaced: 400,
  recentPitchCountAvg: 90,
  recentStartCount: 3,
});

describe("MLB pregame decision evidence", () => {
  it("blocks publication when a required starter is unavailable and records signal provenance", () => {
    const evidence = assessMlbDecisionEvidence(
      game,
      { realVegasHomeOdds: -120, realVegasAwayOdds: 105 },
      {
        homeStarter: null,
        awayStarter: { name: "Away Starter" },
        homeLineupConfirmed: true,
        awayLineupConfirmed: true,
        homeBullpen: {},
        awayBullpen: {},
        venueWeather: { isDome: false },
      },
    );

    expect(evidence.recommendationBlocked).toBe(true);
    expect(evidence.missingSignals).toContain("probable_pitchers");
    expect(evidence.signals.starters.available).toBe(false);
    expect(evidence.signals.starters.source).toContain("MLB Stats API");
    expect(evidence.signals.starters.cacheAgeMs).toBeNull();
  });

  it("records rejected pitcher stats as the blocking reason instead of a neutral fallback", () => {
    const evidence = assessMlbDecisionEvidence(
      game,
      { realVegasHomeOdds: -120, realVegasAwayOdds: 105 },
      {
        homeStarter: null,
        awayStarter: completeStarter("Away Starter"),
        starterQualityReasons: ["home_starter_stats_identity_mismatch"],
        homeLineupConfirmed: false,
        awayLineupConfirmed: false,
        homeBullpen: null,
        awayBullpen: null,
        venueWeather: null,
      },
    );

    expect(evidence.recommendationBlocked).toBe(true);
    expect(evidence.missingSignals).toContain("probable_pitchers");
    expect(evidence.qualityReasons).toContain("home_starter_stats_identity_mismatch");
  });

  it("clears the required-evidence block when a late published starter completes the pair", () => {
    const sharedAvailability = {
      homeStarter: completeStarter("Home Starter"),
      homeLineupConfirmed: false,
      awayLineupConfirmed: false,
      homeBullpen: null,
      awayBullpen: null,
      venueWeather: null,
    };

    const missingStarter = assessMlbDecisionEvidence(
      game,
      { realVegasHomeOdds: -120, realVegasAwayOdds: 105 },
      { ...sharedAvailability, awayStarter: null },
    );
    const completePair = assessMlbDecisionEvidence(
      game,
      { realVegasHomeOdds: -120, realVegasAwayOdds: 105 },
      { ...sharedAvailability, awayStarter: completeStarter("Late Away Starter") },
    );

    expect(missingStarter.recommendationBlocked).toBe(true);
    expect(missingStarter.missingSignals).toContain("probable_pitchers");
    expect(completePair.recommendationBlocked).toBe(false);
    expect(completePair.missingSignals).not.toContain("probable_pitchers");
  });

  it("compresses confidence rather than treating missing secondary evidence as neutral", () => {
    const evidence = assessMlbDecisionEvidence(
      game,
      { realVegasHomeOdds: -120, realVegasAwayOdds: 105 },
      {
        homeStarter: completeStarter("Home Starter"),
        awayStarter: completeStarter("Away Starter"),
        homeLineupConfirmed: false,
        awayLineupConfirmed: false,
        homeBullpen: null,
        awayBullpen: null,
        venueWeather: null,
      },
    );

    expect(evidence.recommendationBlocked).toBe(false);
    expect(evidence.confidenceMultiplier).toBeLessThan(0.7);
    expect(evidence.qualityReasons).toEqual(expect.arrayContaining([
      "home_lineup_unconfirmed",
      "away_bullpen_unavailable",
      "venue_weather_unavailable_or_partial",
    ]));
  });

  it("treats stale cache evidence as unavailable instead of neutral", () => {
    const evidence = assessMlbDecisionEvidence(
      game,
      { realVegasHomeOdds: -120, realVegasAwayOdds: 105 },
      {
        homeStarter: completeStarter("Home Starter"),
        awayStarter: completeStarter("Away Starter"),
        startersMeta: { sourceCapturedAt: "2026-08-20T00:00:00.000Z", cacheAgeMs: 999999, stale: true },
        homeLineupConfirmed: false,
        awayLineupConfirmed: false,
        homeBullpen: null,
        awayBullpen: null,
        venueWeather: null,
      },
    );

    expect(evidence.recommendationBlocked).toBe(true);
    expect(evidence.qualityReasons).toContain("starter_evidence_stale");
    expect(evidence.signals.starters.cacheAgeMs).toBe(999999);
  });
});