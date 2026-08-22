import { describe, expect, it } from "vitest";
import {
  firstValidAmericanOdds,
  isPregameCommenceTime,
  isValidAmericanOdds,
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
});