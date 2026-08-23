import { describe, expect, it } from "vitest";
import {
  emaForSport,
  LEGACY_MLB_LEARNING_PROFILE,
  learningProfileForSport,
  nextConfidenceMultiplier,
  nudgeWeights,
} from "./learningEngine";

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