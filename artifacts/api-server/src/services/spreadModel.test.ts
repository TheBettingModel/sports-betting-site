import { describe, expect, it } from "vitest";
import {
  choosePrimaryMarket,
  calculateSpreadClv,
  buildSpreadSettlement,
  evaluateValidationGate,
  SPREAD_CONFIGS,
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

  it("credits a better captured line when the market closes harder", () => {
    const home = candidate({ line: -3.5, odds: -110 });
    expect(calculateSpreadClv(home, -4.5, -110)).toBeGreaterThan(0);
    const away = candidate({ selection: "away", line: 3.5, odds: -110 });
    expect(calculateSpreadClv(away, 2.5, -110)).toBeGreaterThan(0);
  });

  it("settles exact recommended lines with win and push handling", () => {
    const win = buildSpreadSettlement({
      selection: "home",
      recommendedLine: -3.5,
      recommendedPrice: -110,
      expectedHomeMargin: 6,
      marginStandardDeviation: 13.5,
      closingLine: -4.5,
      closingPrice: -110,
      homeScore: 24,
      awayScore: 20,
    });
    expect(win.result).toBe("win");
    expect(win.closingLine).toBe(-4.5);
    expect(win.unitsWonLost).toBeGreaterThan(0);

    const push = buildSpreadSettlement({
      selection: "away",
      recommendedLine: 3,
      recommendedPrice: -110,
      expectedHomeMargin: 3,
      marginStandardDeviation: 13.5,
      closingLine: 2.5,
      closingPrice: -105,
      homeScore: 24,
      awayScore: 21,
    });
    expect(push.result).toBe("push");
    expect(push.unitsWonLost).toBe(0);
  });

  it("cannot promote until every independent validation threshold passes", () => {
    const policy = SPREAD_CONFIGS.NFL.gatePolicy;
    expect(evaluateValidationGate("NFL", "production", {
      sampleSize: policy.minSampleSize - 1,
      calibrationError: 0,
      brierScore: 0,
      logLoss: 0,
      roi: 1,
      clv: 1,
      maxDrawdown: 0,
      coverage: 1,
      dataQualityRate: 1,
    }, policy).eligible).toBe(false);
    expect(evaluateValidationGate("NFL", "production", {
      sampleSize: policy.minSampleSize,
      calibrationError: policy.maxCalibrationError,
      brierScore: policy.maxBrierScore,
      logLoss: policy.maxLogLoss,
      roi: policy.minRoi,
      clv: policy.minClv,
      maxDrawdown: policy.maxDrawdown,
      coverage: policy.minCoverage,
      dataQualityRate: policy.minDataQualityRate,
    }, policy).eligible).toBe(true);
  });
});