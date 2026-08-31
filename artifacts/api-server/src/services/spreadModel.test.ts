import { describe, expect, it } from "vitest";
import {
  choosePrimaryMarket,
  computeSpreadUncertainty,
  calculateSpreadClv,
  buildSpreadSettlement,
  evaluateValidationGate,
  scoreMarketCandidate,
  SPREAD_MARGIN_CONVENTION,
  SPREAD_CONFIGS,
  spreadResidual,
  selectLatestPromotionEligibleCandidate,
  type SpreadCandidate,
} from "./spreadModel";

describe("spread margin sign convention", () => {
  it("permanently uses home-perspective residuals", () => {
    expect(SPREAD_MARGIN_CONVENTION.version).toBe("home-perspective-v1");
    expect(spreadResidual({
      expectedHomeMargin: 4.5,
      homeScore: 27,
      awayScore: 20,
    })).toBe(2.5);
    expect(spreadResidual({
      expectedHomeMargin: -2,
      homeScore: 20,
      awayScore: 24,
    })).toBe(-2);
  });
});

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
    expect(choosePrimaryMarket(null, shadow)).toBeNull();
  });

  it("keeps moneyline official while spread is shadow-only", () => {
    const spread = candidate({ promotionEligible: false, gateStatus: "shadow" });
    const moneyline = {
      market: "moneyline" as const,
      eligible: true,
      expectedValue: 0.06,
      edge: 0.05,
      modelProbability: 0.58,
      uncertainty: 0.3,
      priceQuality: 1,
      marketQuality: 1,
      dataQuality: 1,
    };
    expect(choosePrimaryMarket(moneyline, spread)).toBe("moneyline");
  });

  it("lets the stronger validated spread beat a qualified moneyline", () => {
    const spread = candidate({
      sport: "NCAAF",
      modelKey: "tbm-ncaaf-spread",
      modelVersion: "ncaaf-spread-v1",
      expectedValue: 0.15,
      edge: 0.1,
      uncertainty: computeSpreadUncertainty(SPREAD_CONFIGS.NCAAF.marginStandardDeviation),
    });
    const moneyline = {
      market: "moneyline" as const,
      eligible: true,
      expectedValue: 0.04,
      edge: 0.035,
      modelProbability: 0.62,
      uncertainty: 0.45,
      priceQuality: 1,
      marketQuality: 1,
      dataQuality: 1,
    };
    expect(choosePrimaryMarket(moneyline, spread)).toBe("spread");
  });

  it("keeps NCAAF uncertainty inside the qualification ceiling", () => {
    expect(computeSpreadUncertainty(SPREAD_CONFIGS.NCAAF.marginStandardDeviation)).toBeLessThanOrEqual(0.8);
  });

  it("prefers higher risk-adjusted EV over raw hit rate", () => {
    const favoriteSpread = scoreMarketCandidate({
      market: "spread",
      eligible: true,
      expectedValue: 0.025,
      edge: 0.03,
      modelProbability: 0.68,
      uncertainty: 0.5,
      priceQuality: 0.9,
      marketQuality: 1,
      dataQuality: 1,
      pushProbability: 0.04,
    });
    const underdogMoneyline = scoreMarketCandidate({
      market: "moneyline",
      eligible: true,
      expectedValue: 0.11,
      edge: 0.07,
      modelProbability: 0.43,
      uncertainty: 0.35,
      priceQuality: 1,
      marketQuality: 1,
      dataQuality: 1,
    });
    expect(underdogMoneyline.score).toBeGreaterThan(favoriteSpread.score);
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
    expect(win.actualHomeMargin).toBe(4);
    expect(win.predictedHomeMargin).toBe(6);
    expect(win.residual).toBe(-2);
    expect(win.residualConvention).toBe("home-perspective-v1");

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