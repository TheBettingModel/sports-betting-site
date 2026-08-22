import { describe, expect, it } from "vitest";
import {
  firstValidMoneylineMarket,
  firstValidMoneylineMarketForSport,
  hasValidMoneylineMarket,
  firstValidAmericanOdds,
  isPregameCommenceTime,
  isValidAmericanOdds,
  isValidMarketPoint,
} from "./oddsApi";

describe("American odds validation", () => {
  it("rejects an absent zero value from an upstream feed", () => {
    expect(isValidAmericanOdds(0)).toBe(false);
    expect(isValidAmericanOdds(null)).toBe(false);
    expect(isValidAmericanOdds(undefined)).toBe(false);
  });

  it("rejects malformed and implausible pregame prices", () => {
    expect(isValidAmericanOdds(1)).toBe(false);
    expect(isValidAmericanOdds(-1)).toBe(false);
    expect(isValidAmericanOdds(-9_900)).toBe(false);
    expect(isValidAmericanOdds(3_300)).toBe(false);
    expect(isValidAmericanOdds(-160)).toBe(true);
    expect(isValidAmericanOdds(125)).toBe(true);
  });

  it("does not treat a started market as pregame pricing", () => {
    const now = Date.UTC(2026, 7, 22, 18, 0, 0);
    expect(isPregameCommenceTime("2026-08-22T18:05:00.000Z", now)).toBe(true);
    expect(isPregameCommenceTime("2026-08-22T17:59:59.000Z", now)).toBe(false);
    expect(isPregameCommenceTime("not-a-date", now)).toBe(false);
  });

  it("keeps a stored valid moneyline when the new response is empty", () => {
    expect(firstValidAmericanOdds(0, null, -127)).toBe(-127);
  });

  it("always prefers a fresh valid market over an older stored line", () => {
    expect(firstValidAmericanOdds(-118, -127)).toBe(-118);
  });

  it("requires both sides of the same moneyline market", () => {
    expect(hasValidMoneylineMarket({ homeOdds: -125, awayOdds: 105 })).toBe(true);
    expect(hasValidMoneylineMarket({ homeOdds: -125, awayOdds: 0 })).toBe(false);

    const selected = firstValidMoneylineMarket(
      { homeOdds: -125, awayOdds: 0 },
      { homeOdds: -118, awayOdds: 102 },
    );
    expect(selected).toEqual({ homeOdds: -118, awayOdds: 102 });
  });

  it("requires all three Soccer outcomes from a single valid market", () => {
    const selected = firstValidMoneylineMarketForSport(
      "Soccer",
      { homeOdds: 125, awayOdds: 220, drawOdds: 0 },
      { homeOdds: 135, awayOdds: 210, drawOdds: 230 },
    );
    expect(selected).toEqual({ homeOdds: 135, awayOdds: 210, drawOdds: 230 });
    expect(firstValidMoneylineMarketForSport(
      "Soccer",
      { homeOdds: 125, awayOdds: 220 },
    )).toBeUndefined();
  });

  it("rejects malformed spread and total points", () => {
    expect(isValidMarketPoint(-1.5, "spread")).toBe(true);
    expect(isValidMarketPoint(Number.POSITIVE_INFINITY, "spread")).toBe(false);
    expect(isValidMarketPoint(120, "spread")).toBe(false);
    expect(isValidMarketPoint(8.5, "total")).toBe(true);
    expect(isValidMarketPoint(0, "total")).toBe(false);
    expect(isValidMarketPoint(999, "total")).toBe(false);
  });
});