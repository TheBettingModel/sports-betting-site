import { describe, expect, it } from "vitest";
import { buildOutcomeReview, isDecisionSnapshot } from "./lossReview";

const completeSnapshot = {
  schemaVersion: 2,
  decision: {
    factorContributions: { record: 0.06, form: -0.02 },
    availability: { homeStarter: { name: "Starter A" }, awayStarter: { name: "Starter B" } },
    dataQuality: { missingSignals: [] },
  },
};

describe("loss review diagnostics", () => {
  it("accepts current decision snapshots while rejecting incomplete evidence", () => {
    expect(isDecisionSnapshot(completeSnapshot)).toBe(true);
    expect(isDecisionSnapshot({ ...completeSnapshot, schemaVersion: 3 })).toBe(true);
    expect(isDecisionSnapshot({ ...completeSnapshot, schemaVersion: 4 })).toBe(true);
    expect(isDecisionSnapshot({ ...completeSnapshot, schemaVersion: 5 })).toBe(true);
    expect(isDecisionSnapshot({ ...completeSnapshot, schemaVersion: 1 })).toBe(false);
    expect(isDecisionSnapshot({ schemaVersion: 3 })).toBe(false);
    expect(isDecisionSnapshot({ schemaVersion: 3, decision: {} })).toBe(false);
    expect(isDecisionSnapshot({ schemaVersion: 3, decision: null })).toBe(false);
  });

  it("uses only saved pregame evidence and records adverse market movement", () => {
    const original = structuredClone(completeSnapshot);
    const review = buildOutcomeReview({
      snapshot: completeSnapshot,
      selection: "home",
      result: "loss",
      modelProbability: 0.68,
      impliedProbability: 0.56,
      clv: -0.03,
      currentAvailability: completeSnapshot.decision.availability,
    });

    expect(isDecisionSnapshot(completeSnapshot)).toBe(true);
    expect(review.status).toBe("reviewed");
    expect(review.flags).toContain("market_moved_against_pick");
    expect(review.evidence.factorEvidence).toHaveLength(2);
    expect(completeSnapshot).toEqual(original);
  });

  it("does not reconstruct old picks from later game data", () => {
    const review = buildOutcomeReview({
      snapshot: { homeRecord: "60-50", vegasHomeOdds: -110 },
      selection: "home",
      result: "loss",
      modelProbability: 0.7,
      impliedProbability: 0.52,
      clv: null,
      currentAvailability: { homeStarter: { name: "Different starter" } },
    });

    expect(review.status).toBe("insufficient_pregame_evidence");
    expect(review.flags).toContain("historical_snapshot_missing_decision_evidence");
    expect(review.evidence.factorEvidence).toEqual([]);
  });

  it("labels a positive-closing-line loss as variance, not a causal claim", () => {
    const review = buildOutcomeReview({
      snapshot: completeSnapshot,
      selection: "away",
      result: "loss",
      modelProbability: 0.6,
      impliedProbability: 0.5,
      clv: 0.04,
      currentAvailability: completeSnapshot.decision.availability,
    });

    expect(review.flags).toContain("high_variance_outcome");
    expect(review.summary).toContain("beat the recorded closing price");
    expect(review.summary).not.toContain("caused");
  });

  it("flags incomplete and changed availability evidence separately", () => {
    const snapshot = {
      schemaVersion: 2,
      decision: {
        factorContributions: { record: 0.03 },
        availability: { homeLineupConfirmed: false, awayLineupConfirmed: false },
        dataQuality: { missingSignals: ["probable_pitchers"] },
      },
    };
    const review = buildOutcomeReview({
      snapshot,
      selection: "home",
      result: "loss",
      modelProbability: 0.63,
      impliedProbability: 0.55,
      clv: null,
      currentAvailability: { homeLineupConfirmed: true, awayLineupConfirmed: false },
    });

    expect(review.flags).toContain("missing_or_stale_pregame_data");
    expect(review.flags).toContain("availability_changed_after_snapshot");
  });

  it("creates a safe calibration follow-up for a high-confidence loss", () => {
    const review = buildOutcomeReview({
      snapshot: completeSnapshot,
      selection: "home",
      result: "loss",
      modelProbability: 0.74,
      impliedProbability: 0.58,
      clv: null,
      currentAvailability: completeSnapshot.decision.availability,
    });

    expect(review.flags).toContain("high_confidence_miss");
    expect(review.evidence.calibrationError).toBeCloseTo(0.74);
    expect(review.improvementActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ area: "calibration", priority: "high" }),
    ]));
  });
});