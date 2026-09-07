import { describe, expect, it } from "vitest";
import type { ProjectionResult } from "./model";
import type { MlbDecisionEvidence } from "./mlbDecisionEvidence";
import {
  compareMlbQualificationPolicies,
  createMlbQualificationAudit,
  evaluateMlbShadowPolicy,
  summarizeMlbQualificationAudits,
} from "./mlbQualificationAudit";

function projection(overrides: Partial<ProjectionResult> = {}): ProjectionResult {
  return {
    homeWinPct: 60,
    confidence: "High",
    projectedSpread: -2,
    projectedTotal: 8.5,
    valueRating: "Buy",
    modelScore: 70,
    edge: 8,
    vegasSpread: -1.5,
    vegasTotal: 8.5,
    vegasHomeOdds: 110,
    vegasAwayOdds: -130,
    vegasDrawOdds: 0,
    confidenceNum: 70,
    units: 1,
    priceAdjustment: 0,
    sharpScore: 0,
    sharpSignal: "No Signal",
    finalModelScore: 70,
    finalModelTier: "Playable",
    finalModelStars: 3,
    podScore: 0,
    ...overrides,
  };
}

function evidence(overrides: Partial<MlbDecisionEvidence> = {}): MlbDecisionEvidence {
  return {
    schemaVersion: "mlb-full-game-evidence-v1",
    capturedAt: "2026-08-24T12:00:00.000Z",
    cutoffTimestamp: "2026-08-24T23:00:00.000Z",
    recommendationBlocked: false,
    confidenceMultiplier: 1,
    missingSignals: [],
    qualityReasons: [],
    signals: {},
    ...overrides,
  };
}

describe("MLB qualification audit", () => {
  it("captures the real no-vig fair probability and all current home-side gates", () => {
    const audit = createMlbQualificationAudit(projection(), evidence());

    expect(audit.selectedSide).toBe("home");
    expect(audit.verifiedMarket.valid).toBe(true);
    expect(audit.verifiedMarket.selectedFairProbability).toBeCloseTo(0.4573, 3);
    expect(audit.modelProbability).toBe(0.6);
    expect(audit.edge).toBe(8);
    expect(audit.effectiveBuyThreshold).toBe(7);
    expect(audit.production.primaryBlocker).toBe("none");
  });

  it("reports a required probable-starter block before evaluating edge", () => {
    const audit = createMlbQualificationAudit(
      projection({ edge: 14, valueRating: "Neutral" }),
      evidence({
        recommendationBlocked: true,
        missingSignals: ["probable_pitchers"],
        qualityReasons: [
          "one_or_both_probable_starters_missing_or_partial",
          "recommendation_blocked_by_required_pregame_evidence",
        ],
      }),
    );

    expect(audit.requiredEvidence.blocked).toBe(true);
    expect(audit.requiredEvidence.missingSignals).toEqual(["probable_pitchers"]);
    expect(audit.production.primaryBlocker).toBe("required_evidence");
    expect(audit.secondarySignalQualityReasons).toContain(
      "one_or_both_probable_starters_missing_or_partial",
    );
  });

  it("never labels fallback odds as a verified market when source evidence is invalid", () => {
    const audit = createMlbQualificationAudit(
      projection({ edge: 14, valueRating: "Neutral" }),
      evidence({
        recommendationBlocked: true,
        missingSignals: ["market_odds"],
        signals: {
          market: {
            source: "selected validated moneyline market",
            capturedAt: "2026-08-24T12:00:00.000Z",
            cutoffTimestamp: "2026-08-24T23:00:00.000Z",
            cacheAgeMs: null,
            available: false,
            qualityReasons: ["missing_or_invalid_two_way_moneyline"],
          },
        },
      }),
    );

    expect(audit.verifiedMarket.valid).toBe(false);
    expect(audit.verifiedMarket.selectedFairProbability).toBeNull();
    expect(audit.priceCap.evaluated).toBe(false);
    expect(audit.priceCap.passed).toBeNull();
    expect(audit.production.primaryBlocker).toBe("required_evidence");
  });

  it("preserves the away-side offset and favorite price ceiling in shadow analysis", () => {
    const awayAudit = createMlbQualificationAudit(
      projection({
        edge: -8,
        homeWinPct: 42,
        valueRating: "Neutral",
        vegasHomeOdds: 120,
        vegasAwayOdds: -140,
      }),
      evidence(),
    );
    const cappedAudit = createMlbQualificationAudit(
      projection({
        edge: 14,
        valueRating: "Neutral",
        vegasHomeOdds: -160,
        vegasAwayOdds: 140,
      }),
      evidence(),
    );

    expect(awayAudit.effectiveBuyThreshold).toBe(10);
    expect(awayAudit.production.primaryBlocker).toBe("edge_threshold");
    expect(evaluateMlbShadowPolicy(awayAudit, 5).recommendation).toBe("Buy");

    expect(cappedAudit.priceCap.applies).toBe(true);
    expect(cappedAudit.production.primaryBlocker).toBe("favorite_price_cap");
    expect(evaluateMlbShadowPolicy(cappedAudit, 5).recommendation).toBe("Neutral");
  });

  it("never promotes a shadow-only Buy into the production result", () => {
    const productionProjection = projection({ edge: 6, valueRating: "Neutral", units: 0, podScore: 0 });
    const audit = createMlbQualificationAudit(productionProjection, evidence());
    const shadow = evaluateMlbShadowPolicy(audit, 5);

    expect(shadow.recommendation).toBe("Buy");
    expect(productionProjection.valueRating).toBe("Neutral");
    expect(productionProjection.units).toBe(0);
    expect(shadow).not.toHaveProperty("units");
    expect(shadow).not.toHaveProperty("isPublic");
  });

  it("counts each primary gate once and retains secondary quality reasons", () => {
    const dataBlocked = createMlbQualificationAudit(
      projection({ edge: 15, valueRating: "Neutral" }),
      evidence({ recommendationBlocked: true, missingSignals: ["market_odds"], qualityReasons: ["market_started_or_invalid"] }),
    );
    const edgeBlocked = createMlbQualificationAudit(projection({ edge: 3, valueRating: "Neutral" }), evidence());
    const qualified = createMlbQualificationAudit(projection({ edge: 8, valueRating: "Buy" }), evidence());
    const summary = summarizeMlbQualificationAudits([dataBlocked, edgeBlocked, qualified, null]);

    expect(summary).toMatchObject({
      totalGames: 4,
      auditUnavailable: 1,
      requiredEvidenceBlocked: 1,
      edgeThresholdFailed: 1,
      favoritePriceCapFailed: 0,
      qualifiedBeforePublicationCap: 1,
    });
    expect(summary.secondaryQualityReasonCounts.market_started_or_invalid).toBe(1);
  });
});

describe("MLB shadow-policy historical comparison", () => {
  it("keeps production and shadow samples separate and marks missing CLV unavailable", () => {
    const comparison = compareMlbQualificationPolicies([
      {
        selection: "home",
        odds: 110,
        modelProbability: 0.6,
        recommendation: "Buy",
        edge: 8,
        confidence: "High",
        result: "win",
        clv: null,
      },
      {
        selection: "away",
        odds: 120,
        modelProbability: 0.55,
        recommendation: "Neutral",
        edge: -9,
        confidence: "Medium",
        result: "loss",
        clv: null,
      },
    ], 5);

    expect(comparison.production.selectedCount).toBe(1);
    expect(comparison.shadow.selectedCount).toBe(2);
    expect(comparison.production.unavailableMetrics).toContain("no_closing_line_value_available");
    expect(comparison.shadow.roi).toBeCloseTo(0.05, 4);
  });

  it("does not estimate financial metrics when an immutable decision lacks odds", () => {
    const comparison = compareMlbQualificationPolicies([
      {
        selection: "home",
        odds: null,
        modelProbability: 0.6,
        recommendation: "Buy",
        edge: 8,
        confidence: "High",
        result: "win",
        clv: null,
      },
    ]);

    expect(comparison.production.roi).toBeNull();
    expect(comparison.production.maxDrawdown).toBeNull();
    expect(comparison.production.unavailableMetrics).toContain(
      "incomplete_odds_for_financial_metrics",
    );
  });
});