import { describe, expect, it } from "vitest";
import {
  classifyForecastEligibility,
  gradeForecastOutcome,
  summarizeForecastRows,
} from "./forecastReviews";

const validSnapshot = {
  schemaVersion: 3,
  gameStartsAt: "2026-08-25T18:00:00.000Z",
  decision: {
    factorContributions: { record: 0.1 },
    availability: {},
    dataQuality: {},
  },
  vegasSpread: -3.5,
  vegasTotal: 8.5,
};

describe("forecast review grading", () => {
  it("grades binary, spread, total, and soccer draw outcomes", () => {
    expect(gradeForecastOutcome({
      sport: "MLB",
      market: "moneyline",
      selection: "home",
      snapshot: validSnapshot,
      homeScore: 4,
      awayScore: 2,
    })).toBe("win");
    expect(gradeForecastOutcome({
      sport: "NBA",
      market: "spread",
      selection: "home",
      snapshot: validSnapshot,
      homeScore: 100,
      awayScore: 97,
    })).toBe("loss");
    expect(gradeForecastOutcome({
      sport: "MLB",
      market: "total",
      selection: "over",
      snapshot: validSnapshot,
      homeScore: 4,
      awayScore: 4,
    })).toBe("loss");
    expect(gradeForecastOutcome({
      sport: "Soccer",
      market: "moneyline",
      selection: "draw",
      snapshot: validSnapshot,
      homeScore: 1,
      awayScore: 1,
    })).toBe("win");
  });

  it("grades binary ties and spread pushes without inventing a win", () => {
    expect(gradeForecastOutcome({
      sport: "MLB",
      market: "moneyline",
      selection: "home",
      snapshot: validSnapshot,
      homeScore: 2,
      awayScore: 2,
    })).toBe("push");
    expect(gradeForecastOutcome({
      sport: "NBA",
      market: "spread",
      selection: "home",
      snapshot: validSnapshot,
      homeScore: 100,
      awayScore: 96.5,
    })).toBe("push");
  });
});

describe("forecast eligibility", () => {
  it("excludes challengers, incomplete snapshots, and post-start records", () => {
    const before = new Date("2026-08-25T17:00:00.000Z");
    const start = new Date("2026-08-25T18:00:00.000Z");
    expect(classifyForecastEligibility({
      snapshot: validSnapshot,
      isChallenger: true,
      predictionTimestamp: before,
      sport: "MLB",
      market: "moneyline",
      selection: "home",
    }).exclusionReason).toBe("challenger_snapshot");
    expect(classifyForecastEligibility({
      snapshot: { schemaVersion: 3 },
      isChallenger: false,
      predictionTimestamp: before,
      sport: "MLB",
      market: "moneyline",
      selection: "home",
    }).exclusionReason).toBe("invalid_or_incomplete_snapshot");
    expect(classifyForecastEligibility({
      snapshot: validSnapshot,
      isChallenger: false,
      predictionTimestamp: start,
      sport: "MLB",
      market: "moneyline",
      selection: "home",
    }).exclusionReason).toBe("post_start_snapshot");
  });

  it("accepts a valid pregame snapshot and requires a stored line", () => {
    expect(classifyForecastEligibility({
      snapshot: validSnapshot,
      isChallenger: false,
      predictionTimestamp: new Date("2026-08-25T17:00:00.000Z"),
      sport: "NBA",
      market: "spread",
      selection: "home",
    }).status).toBe("graded");
    expect(classifyForecastEligibility({
      snapshot: { ...validSnapshot, vegasTotal: undefined },
      isChallenger: false,
      predictionTimestamp: new Date("2026-08-25T17:00:00.000Z"),
      sport: "MLB",
      market: "total",
      selection: "over",
    }).exclusionReason).toBe("missing_market_line");
  });

  it("grades only the permanently shadow-only MLB V4 challenger", () => {
    const before = new Date("2026-08-25T17:00:00.000Z");
    expect(classifyForecastEligibility({
      snapshot: {
        ...validSnapshot,
        modelId: "tbm-mlb-moneyline-v4",
        cohort: "shadow",
        shadowOnly: true,
      },
      isChallenger: true,
      predictionTimestamp: before,
      sport: "MLB",
      market: "moneyline",
      selection: "home",
    }).status).toBe("graded");
    expect(classifyForecastEligibility({
      snapshot: {
        ...validSnapshot,
        modelId: "other-challenger",
        cohort: "shadow",
        shadowOnly: true,
      },
      isChallenger: true,
      predictionTimestamp: before,
      sport: "MLB",
      market: "moneyline",
      selection: "home",
    }).exclusionReason).toBe("challenger_snapshot");
  });

  it("accepts a complete schema-v5 material revision", () => {
    expect(classifyForecastEligibility({
      snapshot: { ...validSnapshot, schemaVersion: 5 },
      isChallenger: false,
      predictionTimestamp: new Date("2026-08-25T17:00:00.000Z"),
      sport: "MLB",
      market: "moneyline",
      selection: "home",
    }).status).toBe("graded");
  });

  it("excludes missing start evidence and malformed selections", () => {
    expect(classifyForecastEligibility({
      snapshot: { ...validSnapshot, gameStartsAt: undefined },
      isChallenger: false,
      predictionTimestamp: new Date("2026-08-25T17:00:00.000Z"),
      sport: "MLB",
      market: "moneyline",
      selection: "home",
    }).exclusionReason).toBe("missing_game_start_evidence");
    expect(classifyForecastEligibility({
      snapshot: validSnapshot,
      isChallenger: false,
      predictionTimestamp: new Date("2026-08-25T17:00:00.000Z"),
      sport: "Soccer",
      market: "moneyline",
      selection: "over",
    }).exclusionReason).toBe("invalid_selection");
  });
});

describe("forecast metrics", () => {
  it("separates published qualified picks from passed forecasts", () => {
    const metrics = summarizeForecastRows([
      {
        reviewStatus: "graded", result: "win", segment: "published",
        qualificationStatus: "qualified", sport: "MLB", market: "moneyline",
        modelProbability: 0.7, unitsWonLost: 0.9, units: 1,
      },
      {
        reviewStatus: "graded", result: "loss", segment: "forecast_only",
        qualificationStatus: "passed", sport: "MLB", market: "moneyline",
        modelProbability: 0.55, unitsWonLost: -1, units: 1,
      },
      {
        reviewStatus: "excluded", result: null, segment: "forecast_only",
        qualificationStatus: "passed", sport: "MLB", market: "moneyline",
        modelProbability: 0.5, unitsWonLost: null, units: 1,
      },
    ]);
    expect(metrics.all.gradedCount).toBe(2);
    expect(metrics.published.winRate).toBe(1);
    expect(metrics.forecastOnly.excludedCount).toBe(1);
    expect(metrics.qualified.sampleSize).toBe(1);
    expect(metrics.passed.sampleSize).toBe(1);
  });
});