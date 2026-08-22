import { describe, expect, it } from "vitest";
import type { FetchedGame } from "./espn";
import {
  createPredictionDecisionContext,
  isPredictionDecisionEligible,
} from "./snapshot";

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
});