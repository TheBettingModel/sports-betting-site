import { describe, expect, it } from "vitest";
import {
  choosePrimaryMarket,
  selectLatestPromotionEligibleCandidate,
  type SpreadCandidate,
} from "./spreadModel";

function candidate(
  overrides: Partial<SpreadCandidate> = {},
): SpreadCandidate {
  return {
    gameId: "game-1",
    sport: "NFL",
    modelKey: "tbm-nfl-spread",
    modelVersion: "nfl-spread-v1",
    selection: "home",
    teamAbbr: "HOME",
    sportsbook: "draftkings",
    line: -3.5,
    odds: -110,
    opposingLine: 3.5,
    opposingOdds: -110,
    expectedHomeMargin: 6,
    marginStandardDeviation: 13.5,
    modelProbability: 0.57,
    noVigProbability: 0.5,
    fairPrice: -133,
    edge: 0.07,
    expectedValue: 0.09,
    pushProbability: 0,
    uncertainty: 0.65,
    confidence: "Medium",
    recommendation: "Buy",
    units: 1,
    priceQualified: true,
    promotionEligible: true,
    gateStatus: "production",
    gateReasons: [],
    featureSnapshot: {},
    capturedAt: new Date("2026-08-29T18:00:00Z"),
    ...overrides,
  };
}

describe("spread publication isolation", () => {
  it("keeps shadow candidates out of public selection", () => {
    const shadow = candidate({
      promotionEligible: false,
      gateStatus: "shadow",
      units: 0,
    });
    expect(selectLatestPromotionEligibleCandidate([shadow])).toBeNull();
    expect(choosePrimaryMarket(false, shadow)).toBeNull();
  });

  it("uses a promoted spread only after moneyline fails", () => {
    const spread = candidate();
    expect(choosePrimaryMarket(true, spread)).toBe("moneyline");
    expect(choosePrimaryMarket(false, spread)).toBe("spread");
  });

  it("never falls back to an older promoted price when the latest capture fails", () => {
    const older = candidate({ capturedAt: new Date("2026-08-29T18:00:00Z") });
    const latest = candidate({
      capturedAt: new Date("2026-08-29T18:30:00Z"),
      priceQualified: false,
      promotionEligible: false,
      recommendation: "Neutral",
      units: 0,
    });
    expect(selectLatestPromotionEligibleCandidate([older, latest])).toBeNull();
  });

  it("chooses the best eligible side within one latest capture", () => {
    const capturedAt = new Date("2026-08-29T18:30:00Z");
    const home = candidate({ capturedAt, expectedValue: 0.06, edge: 0.05 });
    const away = candidate({
      capturedAt,
      selection: "away",
      expectedValue: 0.11,
      edge: 0.08,
      line: 3.5,
    });
    expect(selectLatestPromotionEligibleCandidate([home, away])?.selection).toBe("away");
  });
});