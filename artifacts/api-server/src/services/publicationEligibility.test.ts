import { describe, expect, it } from "vitest";
import { isActionablePublication } from "./publicationEligibility";

describe("publication eligibility", () => {
  it("permits only positive-unit Buy recommendations", () => {
    expect(isActionablePublication("Buy", 1)).toBe(true);
    expect(isActionablePublication("Strong Buy", 0.25)).toBe(true);
  });

  it("never normalizes non-actionable or zero-unit recommendations into wagers", () => {
    expect(isActionablePublication("Neutral", 1)).toBe(false);
    expect(isActionablePublication("Fade", 1)).toBe(false);
    expect(isActionablePublication("Buy", 0)).toBe(false);
    expect(isActionablePublication("Strong Buy", -1)).toBe(false);
    expect(isActionablePublication("Buy", Number.NaN)).toBe(false);
  });
});