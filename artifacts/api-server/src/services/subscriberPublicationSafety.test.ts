import { describe, expect, it } from "vitest";
import { isExactPublishedMarketActionable } from "./subscriberPublicationSafety";

describe("subscriber publication safety", () => {
  it("allows only an exact public one-unit market decision", () => {
    expect(isExactPublishedMarketActionable({
      isPublic: true,
      publicationStatus: "PUBLISHED",
      approvedUnits: 1,
      publishedSelection: "away",
      candidateSelection: "away",
    })).toBe(true);
  });

  it.each([
    { isPublic: false, publicationStatus: "PUBLISHED", approvedUnits: 1, publishedSelection: "away", candidateSelection: "away" },
    { isPublic: true, publicationStatus: "SAFETY_BLOCKED", approvedUnits: 1, publishedSelection: "away", candidateSelection: "away" },
    { isPublic: true, publicationStatus: "PUBLISHED", approvedUnits: 0, publishedSelection: "away", candidateSelection: "away" },
    { isPublic: true, publicationStatus: "PUBLISHED", approvedUnits: 2, publishedSelection: "away", candidateSelection: "away" },
    { isPublic: true, publicationStatus: "PUBLISHED", approvedUnits: 1, publishedSelection: "home", candidateSelection: "away" },
  ])("keeps non-public, non-1u, and side-mismatched spread opinions non-actionable", (input) => {
    expect(isExactPublishedMarketActionable(input)).toBe(false);
  });
});