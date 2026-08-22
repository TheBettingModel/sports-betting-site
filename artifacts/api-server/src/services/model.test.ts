import { describe, expect, it } from "vitest";
import { computeProjection, removeVig2 } from "./model";

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
  });

  it("never gives a blocked neutral play an elite-looking score or POD ranking", () => {
    const projection = computeProjection(
      "heavy-chalk-neutral",
      "MLB",
      "100-0",
      "0-100",
      null,
      { realVegasHomeOdds: -200, realVegasAwayOdds: 170 },
    );

    expect(projection.valueRating).toBe("Neutral");
    expect(projection.finalModelScore).toBeLessThanOrEqual(59);
    expect(projection.finalModelTier).not.toBe("Elite");
    expect(projection.podScore).toBe(0);
    expect(projection.units).toBe(0);
  });
});