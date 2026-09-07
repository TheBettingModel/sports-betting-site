import { describe, expect, it } from "vitest";
import {
  ACTIONABLE_ODDS_CACHE_MAX_AGE_MS,
  firstValidMoneylineMarket,
  firstValidMoneylineMarketForSport,
  hasValidMoneylineMarket,
  firstValidAmericanOdds,
  getBestLine,
  isActionableOddsCache,
  isPregameCommenceTime,
  isValidAmericanOdds,
  isValidMarketPoint,
  resolveOddsLookup,
  selectActionableMoneylineMarket,
  selectPregameGameOdds,
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

  it("allows a failed-refresh cache only within the actionable freshness window", () => {
    const now = Date.UTC(2026, 7, 22, 18, 0, 0);
    expect(isActionableOddsCache(now - ACTIONABLE_ODDS_CACHE_MAX_AGE_MS, now)).toBe(true);
    expect(isActionableOddsCache(now - ACTIONABLE_ODDS_CACHE_MAX_AGE_MS - 1, now)).toBe(false);
    expect(isActionableOddsCache(now + 1, now)).toBe(false);
  });

  it("never selects a provider entry after the provider market has started", () => {
    const now = Date.UTC(2026, 7, 22, 18, 0, 0);
    const startedMarket = {
      consensusHomeOdds: -120,
      consensusAwayOdds: 100,
      bookmakerOdds: [],
      commenceTime: "2026-08-22T17:59:00.000Z",
    };

    expect(selectPregameGameOdds(
      [startedMarket],
      "2026-08-22T18:30:00.000Z",
      now,
    )).toBeNull();
  });

  it("rejects a future provider market when ESPN's scheduled start has already passed", () => {
    const now = Date.UTC(2026, 7, 22, 18, 0, 0);
    const futureProviderMarket = {
      consensusHomeOdds: -120,
      consensusAwayOdds: 100,
      bookmakerOdds: [],
      commenceTime: "2026-08-22T18:30:00.000Z",
    };

    expect(selectPregameGameOdds(
      [futureProviderMarket],
      "2026-08-22T17:59:00.000Z",
      now,
    )).toBeNull();
  });

  it("does not fall back to ESPN prices when the matching provider event is already live", () => {
    const fallbackMarket = { homeOdds: -120, awayOdds: 100 };

    expect(selectActionableMoneylineMarket(
      "MLB",
      { odds: null, marketBlockedByProviderStart: true },
      fallbackMarket,
    )).toBeUndefined();

    expect(selectActionableMoneylineMarket(
      "MLB",
      { odds: null, marketBlockedByProviderStart: false },
      fallbackMarket,
    )).toEqual(fallbackMarket);
  });

  it("carries a started provider entry through lookup into the ESPN fallback block", () => {
    const now = Date.UTC(2026, 7, 22, 18, 0, 0);
    const lookup = resolveOddsLookup(
      [{
        consensusHomeOdds: -120,
        consensusAwayOdds: 100,
        bookmakerOdds: [],
        commenceTime: "2026-08-22T17:59:00.000Z",
      }],
      "2026-08-22T18:30:00.000Z",
      now,
    );

    expect(lookup).toEqual({ odds: null, marketBlockedByProviderStart: true });
    expect(selectActionableMoneylineMarket(
      "MLB",
      lookup,
      { homeOdds: -120, awayOdds: 100 },
    )).toBeUndefined();
  });

  it("blocks ESPN fallback when a live provider event has no valid normalized moneyline", () => {
    const now = Date.UTC(2026, 7, 22, 18, 0, 0);
    const lookup = resolveOddsLookup(
      undefined,
      "2026-08-22T18:30:00.000Z",
      now,
      ["2026-08-22T17:59:00.000Z"],
    );

    expect(lookup).toEqual({ odds: null, marketBlockedByProviderStart: true });
    expect(selectActionableMoneylineMarket(
      "MLB",
      lookup,
      { homeOdds: -120, awayOdds: 100 },
    )).toBeUndefined();
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

describe("best available line", () => {
  const gameOdds = {
    consensusHomeOdds: -144,
    consensusAwayOdds: 120,
    commenceTime: "2026-08-29T00:00:00.000Z",
    bookmakerOdds: [
      { book: "everygame", homeOdds: -145, awayOdds: 125 },
      { book: "betfair_ex_eu", homeOdds: -132, awayOdds: 124 },
      { book: "betrivers", homeOdds: -148, awayOdds: 123 },
      { book: "fanduel", homeOdds: -144, awayOdds: 122 },
      { book: "draftkings", homeOdds: -143, awayOdds: 119 },
    ],
  };

  it("selects the best recognized US-facing price instead of an offshore or exchange quote", () => {
    expect(getBestLine(gameOdds, false)).toEqual({ book: "betrivers", odds: 123 });
  });

  it("still selects the correct side of each eligible two-way market", () => {
    expect(getBestLine(gameOdds, true)).toEqual({ book: "draftkings", odds: -143 });
  });

  it("omits best-line guidance when only non-actionable books are available", () => {
    expect(getBestLine({
      ...gameOdds,
      bookmakerOdds: [
        { book: "everygame", homeOdds: -145, awayOdds: 125 },
        { book: "betfair_ex_eu", homeOdds: -132, awayOdds: 124 },
      ],
    }, false)).toBeNull();
  });
});