import { describe, expect, it } from "vitest";
import { firstValidAmericanOdds, isValidAmericanOdds } from "./oddsApi";

describe("American odds validation", () => {
  it("rejects an absent zero value from an upstream feed", () => {
    expect(isValidAmericanOdds(0)).toBe(false);
    expect(isValidAmericanOdds(null)).toBe(false);
    expect(isValidAmericanOdds(undefined)).toBe(false);
  });

  it("keeps a stored valid moneyline when the new response is empty", () => {
    expect(firstValidAmericanOdds(0, null, -127)).toBe(-127);
  });

  it("always prefers a fresh valid market over an older stored line", () => {
    expect(firstValidAmericanOdds(-118, -127)).toBe(-118);
  });
});