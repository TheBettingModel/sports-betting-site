import { describe, expect, it } from "vitest";
import { computeProjection, removeVig2 } from "./model";
import { selectActionableMoneylineMarket } from "./oddsApi";

describe("two-way market edge safeguards", () => {
  it("removes vig before comparing a model to the home or away market", () => {
    const fair = removeVig2(-120, 100);

    expect(fair.home).toBeCloseTo(0.521739, 5);
    expect(fair.away).toBeCloseTo(0.478261, 5);
    expect(fair.home + fair.away).toBeCloseTo(1, 10);
  });

  it("falls back instead of using implausible market prices", () => {
    const projection = computeProjection(
      "invalid-odds-game",
      "MLB",
      "50-50",
      "50-50",
      null,
      { realVegasHomeOdds: -9_900, realVegasAwayOdds: 3_300 },
    );

    expect(Math.abs(projection.vegasHomeOdds)).toBeLessThanOrEqual(2_000);
    expect(Math.abs(projection.vegasAwayOdds)).toBeLessThanOrEqual(2_000);
    expect(projection.valueRating).toBe("Neutral");
    expect(projection.podScore).toBe(0);
    expect(projection.units).toBe(0);
  });

  it("never publishes a recommendation from a one-sided market", () => {
    const projection = computeProjection(
      "one-sided-odds-game",
      "MLB",
      "100-0",
      "0-100",
      null,
      { realVegasHomeOdds: 130, realVegasAwayOdds: 0 },
    );

    expect(projection.valueRating).toBe("Neutral");
    expect(projection.finalModelScore).toBeLessThanOrEqual(59);
    expect(projection.podScore).toBe(0);
    expect(projection.units).toBe(0);
  });

  it("keeps a conflicting live provider event from being revived by ESPN fallback odds", () => {
    const market = selectActionableMoneylineMarket(
      "MLB",
      { odds: null, marketBlockedByProviderStart: true },
      { homeOdds: -120, awayOdds: 100 },
    );
    const projection = computeProjection(
      "provider-start-conflict",
      "MLB",
      "60-40",
      "40-60",
      null,
      {
        realVegasHomeOdds: market?.homeOdds,
        realVegasAwayOdds: market?.awayOdds,
      },
    );

    expect(market).toBeUndefined();
    expect(projection.valueRating).toBe("Neutral");
    expect(projection.units).toBe(0);
    expect(projection.podScore).toBe(0);
  });

  it("blocks MLB favorites at the approved -160 ceiling", () => {
    const projection = computeProjection(
      "extreme-heavy-chalk-neutral",
      "MLB",
      "100-0",
      "0-100",
      null,
      { realVegasHomeOdds: -160, realVegasAwayOdds: 140 },
    );

    expect(projection.valueRating).toBe("Neutral");
    expect(projection.units).toBe(0);
  });

  it("compresses MLB confidence for incomplete secondary evidence and blocks required evidence failures", () => {
    const fullEvidence = computeProjection(
      "mlb-evidence-compression",
      "MLB",
      "100-0",
      "0-100",
      null,
      { realVegasHomeOdds: 120, realVegasAwayOdds: -140, mlbEvidenceMultiplier: 1 },
    );
    const compressed = computeProjection(
      "mlb-evidence-compression",
      "MLB",
      "100-0",
      "0-100",
      null,
      { realVegasHomeOdds: 120, realVegasAwayOdds: -140, mlbEvidenceMultiplier: 0.6 },
    );
    const blocked = computeProjection(
      "mlb-evidence-blocked",
      "MLB",
      "100-0",
      "0-100",
      null,
      {
        realVegasHomeOdds: 120,
        realVegasAwayOdds: -140,
        mlbRecommendationBlocked: true,
      },
    );

    expect(Math.abs(compressed.homeWinPct - 50)).toBeLessThan(
      Math.abs(fullEvidence.homeWinPct - 50),
    );
    expect(blocked.valueRating).toBe("Neutral");
    expect(blocked.units).toBe(0);
    expect(blocked.podScore).toBe(0);
  });
});

describe("three-way market edge safeguards", () => {
  it("never publishes a recommendation from an incomplete Soccer market", () => {
    const projection = computeProjection(
      "incomplete-soccer-odds",
      "Soccer",
      "20-4-2",
      "5-6-15",
      null,
      { realVegasHomeOdds: 125, realVegasAwayOdds: 220, realVegasDrawOdds: 0 },
    );

    expect(projection.valueRating).toBe("Neutral");
    expect(projection.finalModelScore).toBeLessThanOrEqual(59);
    expect(projection.podScore).toBe(0);
    expect(projection.units).toBe(0);
  });
});