import { describe, expect, it } from "vitest";
import { summarizeNcaafV4Health, type HealthGameRow } from "./ncaafV4HealthReport";

const now = new Date("2026-09-05T18:00:00.000Z");
const row = (overrides: Partial<HealthGameRow> = {}): HealthGameRow => ({
  eventId: "1", kickoffAt: new Date("2026-09-05T19:00:00.000Z"), gameStatus: "upcoming",
  evidenceStatus: "observed", evidenceCapturedAt: new Date("2026-09-05T17:30:00.000Z"),
  featureCreatedAt: now, featureValid: true, intelligenceCreatedAt: now,
  intelligenceValid: true, forecastPredictedAt: now, forecastValid: true,
  homeFbs: true, awayFbs: true, ...overrides,
});

describe("NCAAF V4 seven-day health aggregation", () => {
  it("fails closed when FBS eligibility is not proven", () => {
    const report = summarizeNcaafV4Health([row({ homeFbs: null, awayFbs: true })], now, ["2026-09-05"]);
    expect(report.days[0]).toMatchObject({
      scheduledGames: 1, fbsVsFbsGames: 0, eligibilityProvableGames: 0, unavailable: 1,
    });
    expect(report.days[0]?.unavailableReasons.FBS_ELIGIBILITY_UNPROVABLE).toBe(1);
  });

  it("separates frozen, awaiting-final, and final games", () => {
    const report = summarizeNcaafV4Health([
      row({ eventId: "started", kickoffAt: new Date("2026-09-05T17:00:00.000Z") }),
      row({ eventId: "final", kickoffAt: new Date("2026-09-05T16:00:00.000Z"), gameStatus: "final" }),
      row({ eventId: "future", kickoffAt: new Date("2026-09-06T19:00:00.000Z") }),
    ], now, ["2026-09-05", "2026-09-06"]);
    expect(report.totals).toMatchObject({ kickoffFrozenGames: 2, awaitingFinalGames: 1, gradedFinalGames: 1 });
  });
});