import { describe, expect, it } from "vitest";
import {
  emaForSport,
  LEGACY_MLB_LEARNING_PROFILE,
  learningProfileForSport,
  needsLearningProcessing,
  nextConfidenceMultiplier,
  nudgeWeights,
  PRODUCTION_LEARNING_MODE,
  productionLearningEvidence,
} from "./learningEngine";
import * as productionLearning from "./learning";

describe("production learning freeze", () => {
  it("exposes only the frozen production learner", () => {
    expect(Object.keys(productionLearning).sort()).toEqual([
      "runLearning",
    ]);
    expect(productionLearning.runLearning).toBeDefined();
    expect("runLegacyGameLearning" in productionLearning).toBe(false);
  });

  it("classifies graded evidence as research-only with no production mutation", () => {
    expect(PRODUCTION_LEARNING_MODE).toBe("frozen_research_only");
    expect(productionLearningEvidence({
      modelVersionId: 12,
      cohort: "official",
    })).toEqual({
      mode: "frozen_research_only",
      modelVersionId: 12,
      cohort: "official",
      researchOnly: true,
      productionWeightsUpdated: false,
      productionConfidenceMultiplierUpdated: false,
    });
  });
});

describe("MLB legacy calibration profile", () => {
  it("restores MLB's faster Brier/accuracy EMA without changing other sports", () => {
    expect(emaForSport("MLB", 0.25, 1)).toBeCloseTo(0.3625);
    expect(emaForSport("NBA", 0.25, 1)).toBeCloseTo(0.31);
    expect(learningProfileForSport("MLB")).toBe(LEGACY_MLB_LEARNING_PROFILE);
    expect(learningProfileForSport("NBA").confidenceMode).toBe("calibration-gated");
  });

  it("uses the previous MLB confidence range rather than Brier-gating the sport", () => {
    expect(nextConfidenceMultiplier({
      sport: "MLB",
      current: 1.15,
      accuracy: 0.60,
      brier: 0.50,
      totalPredictions: 40,
    })).toBeCloseTo(1.17);
    expect(nextConfidenceMultiplier({
      sport: "NBA",
      current: 1.15,
      accuracy: 0.60,
      brier: 0.50,
      totalPredictions: 40,
    })).toBeLessThanOrEqual(1);
  });

  it("brings normal MLB performance steadily back toward neutral confidence", () => {
    expect(nextConfidenceMultiplier({
      sport: "MLB",
      current: 0.7,
      accuracy: 0.52,
      brier: 0.5,
      totalPredictions: 40,
    })).toBeCloseTo(0.73);
    expect(nextConfidenceMultiplier({
      sport: "MLB",
      current: 1.3,
      accuracy: 0.52,
      brier: 0.1,
      totalPredictions: 40,
    })).toBeCloseTo(1.27);
    expect(nextConfidenceMultiplier({
      sport: "MLB",
      current: 1,
      accuracy: 0.45,
      brier: 0.5,
      totalPredictions: 40,
    })).toBe(1);
  });

  it("restores MLB's wider Brier-scaled factor adjustment bounds", () => {
    const mlb = nudgeWeights({
      sport: "MLB",
      current: { recordWeight: 0.20 },
      contributions: { record: 1 },
      selection: "home",
      result: "loss",
      modelProbability: 0.90,
      sampleSize: 20,
    });
    const nba = nudgeWeights({
      sport: "NBA",
      current: { recordWeight: 0.30 },
      contributions: { record: 1 },
      selection: "home",
      result: "loss",
      modelProbability: 0.90,
      sampleSize: 20,
    });

    expect(mlb.recordWeight).toBeLessThan(0.194);
    expect(nba.recordWeight).toBeGreaterThan(0.294);
  });
});

describe("learning replay eligibility", () => {
  const currentSnapshot = {
    schemaVersion: 3,
    decision: {
      factorContributions: { pythagorean: 0.1 },
      availability: {},
      dataQuality: { missingSignals: [] },
    },
  };

  it("replays a current snapshot skipped only by the old version gate once", () => {
    expect(needsLearningProcessing({
      learningProcessedAt: new Date("2026-08-26T04:12:26.000Z"),
      learningReview: { status: "insufficient_pregame_evidence" },
      featureSnapshot: currentSnapshot,
    })).toBe(true);

    expect(needsLearningProcessing({
      learningProcessedAt: new Date("2026-08-26T04:12:27.000Z"),
      learningReview: { status: "reviewed" },
      featureSnapshot: currentSnapshot,
    })).toBe(false);
  });

  it("does not replay a genuinely incomplete historical snapshot", () => {
    expect(needsLearningProcessing({
      learningProcessedAt: new Date("2026-08-26T04:12:26.000Z"),
      learningReview: { status: "insufficient_pregame_evidence" },
      featureSnapshot: { schemaVersion: 3, decision: {} },
    })).toBe(false);
  });
});

describe("WNBA evidence-weight learning safeguards", () => {
  it("does not retrain newly introduced WNBA evidence weights before the minimum sample", () => {
    const current = {
      trueShootingWeight: 0.12,
      availabilityWeight: 0.50,
      travelWeight: 0.000006,
    };
    const protectedWeights = nudgeWeights({
      sport: "WNBA",
      current,
      contributions: { trueShooting: .02, availability: .03, travel: .02 },
      selection: "home",
      result: "loss",
      modelProbability: .85,
      sampleSize: 14,
    });
    const learnedWeights = nudgeWeights({
      sport: "WNBA",
      current,
      contributions: { trueShooting: .02, availability: .03, travel: .02 },
      selection: "home",
      result: "loss",
      modelProbability: .85,
      sampleSize: 15,
    });

    expect(protectedWeights.trueShootingWeight).toBe(current.trueShootingWeight);
    expect(protectedWeights.availabilityWeight).toBe(current.availabilityWeight);
    expect(learnedWeights.trueShootingWeight).toBeLessThan(current.trueShootingWeight);
    expect(learnedWeights.availabilityWeight).toBeLessThan(current.availabilityWeight);
  });
});