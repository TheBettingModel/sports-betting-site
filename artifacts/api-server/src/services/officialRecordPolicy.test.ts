import { describe, expect, it } from "vitest";
import {
  isOfficialRecordRecommendation,
  isOfficialRecordPredictionCohort,
  isOfficialRecordSettledResult,
  OFFICIAL_RECORD_RECOMMENDATIONS,
  OFFICIAL_RECORD_SETTLED_RESULTS,
} from "./officialRecordPolicy";

describe("official record policy", () => {
  it("keeps Neutral and Fade outcomes out of both record and ROI inputs", () => {
    const gradedOutcomes = [
      { recommendation: "Strong Buy", unitsWonLost: 1.8 },
      { recommendation: "Buy", unitsWonLost: -1 },
      { recommendation: "Neutral", unitsWonLost: 2.2 },
      { recommendation: "Fade", unitsWonLost: -2 },
    ];

    const recordOutcomes = gradedOutcomes.filter(({ recommendation }) =>
      isOfficialRecordRecommendation(recommendation),
    );
    const roiOutcomes = gradedOutcomes.filter(({ recommendation }) =>
      isOfficialRecordRecommendation(recommendation),
    );

    expect(OFFICIAL_RECORD_RECOMMENDATIONS).toEqual(["Strong Buy", "Buy"]);
    expect(recordOutcomes.map(({ recommendation }) => recommendation)).toEqual([
      "Strong Buy",
      "Buy",
    ]);
    expect(roiOutcomes.reduce((total, outcome) => total + outcome.unitsWonLost, 0)).toBe(0.8);
  });

  it("allows only settled outcomes from official prediction snapshots", () => {
    expect(OFFICIAL_RECORD_SETTLED_RESULTS).toEqual(["win", "loss", "push"]);
    expect(["win", "loss", "push", "void", "postponed", "pending"]
      .filter(isOfficialRecordSettledResult)).toEqual(["win", "loss", "push"]);
    expect([null, "official", "shadow", "research"]
      .filter((cohort) => isOfficialRecordPredictionCohort(cohort))).toEqual([null, "official"]);
    expect(isOfficialRecordPredictionCohort(null)).toBe(true);
    expect(isOfficialRecordPredictionCohort("official", true)).toBe(false);
  });
});