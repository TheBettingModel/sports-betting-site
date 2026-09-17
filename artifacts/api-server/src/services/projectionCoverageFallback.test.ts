import { describe, expect, it } from "vitest";
import { buildProjectionCoverageFallback } from "./projectionCoverageFallback";

describe("projection coverage fallback", () => {
  it("creates a display-only projected score without recommendation fields", () => {
    const forecast = buildProjectionCoverageFallback({
      gameId: "ncaaf-1",
      sport: "NCAAF",
      eventStart: "2026-09-19T19:30:00.000Z",
      now: new Date("2026-09-17T12:00:00.000Z"),
      homeRecord: "2-0",
      awayRecord: "1-1",
    });

    expect(forecast.expectedTotal).toBeGreaterThan(0);
    expect(forecast.expectedHomeScore).toBeGreaterThanOrEqual(0);
    expect(forecast.expectedAwayScore).toBeGreaterThanOrEqual(0);
    expect(forecast.homeWinProbability! + forecast.awayWinProbability!).toBeCloseTo(1);
    expect(forecast.qualityFlags).toContain("NOT_A_RECOMMENDATION");
    expect(forecast.evidenceTier).toBe("RECORD_BASELINE");
  });

  it("prefers the richer daily projection already stored for the game", () => {
    const forecast = buildProjectionCoverageFallback({
      gameId: "mlb-1",
      sport: "MLB",
      eventStart: "2026-09-17T23:10:00.000Z",
      now: new Date("2026-09-17T12:00:00.000Z"),
      homeRecord: "80-70",
      awayRecord: "70-80",
      persistedHomeWinPct: 60,
      persistedSpread: -2,
      persistedTotal: 9,
    });

    expect(forecast).toMatchObject({
      homeWinProbability: 0.6,
      awayWinProbability: 0.4,
      expectedHomeScore: 5.5,
      expectedAwayScore: 3.5,
      expectedMargin: 2,
      expectedTotal: 9,
      evidenceTier: "ESTABLISHED_DAILY_MODEL",
    });
  });

  it("refuses to create a new forecast after kickoff", () => {
    expect(() => buildProjectionCoverageFallback({
      gameId: "started",
      sport: "NFL",
      eventStart: "2026-09-17T12:00:00.000Z",
      now: new Date("2026-09-17T12:00:00.000Z"),
      homeRecord: "1-0",
      awayRecord: "1-0",
    })).toThrow("POST_START_COVERAGE_FORECAST_REJECTED");
  });

  it("keeps the prediction identity stable across repeated refreshes of identical inputs", () => {
    const input = {
      gameId: "mlb-stable",
      sport: "MLB" as const,
      eventStart: "2026-09-17T23:10:00.000Z",
      homeRecord: "80-70",
      awayRecord: "70-80",
      persistedHomeWinPct: 60,
      persistedSpread: -2,
      persistedTotal: 9,
    };
    const first = buildProjectionCoverageFallback({
      ...input,
      now: new Date("2026-09-17T12:00:00.000Z"),
    });
    const refreshed = buildProjectionCoverageFallback({
      ...input,
      now: new Date("2026-09-17T12:15:00.000Z"),
    });

    expect(refreshed.predictionId).toBe(first.predictionId);
  });
});