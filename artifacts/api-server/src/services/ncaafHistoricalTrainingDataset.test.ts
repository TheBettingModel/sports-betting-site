import { describe, expect, it } from "vitest";
import { buildNcaafHistoricalTrainingDataset } from "./ncaafHistoricalTrainingDataset";

describe("NCAAF historical training dataset", () => {
  const game = { canonicalProvider: "espn", canonicalEventId: "1", season: 2024, week: 1,
    kickoffAt: new Date("2024-09-01T18:00:00Z"), homeCanonicalTeamId: "10", awayCanonicalTeamId: "20",
    homeClassification: "FBS", awayClassification: "FBS", completed: true, homeScore: 24, awayScore: 17 };
  it("emits one deterministic PIT-safe canonical FBS game row", () => {
    const result = buildNcaafHistoricalTrainingDataset([{ ...game, evidence: [
      { source: "cfbd", sourceId: "prior", pitClass: "B", effectiveAt: new Date("2024-08-31T00:00:00Z"), capturedAt: new Date("2024-08-31T00:00:00Z"), values: {} },
      { source: "cfbd", sourceId: "transfer", pitClass: "D", effectiveAt: new Date("2024-08-01T00:00:00Z"), capturedAt: new Date("2024-08-01T00:00:00Z"), values: {} },
    ] }]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.targets).toEqual({ homeWin: 1, homeMargin: 7, totalPoints: 41 });
    expect(result.rows[0]?.pitLineage).toHaveLength(1);
    expect(result.report.pitClassesExcluded.D).toBe(1);
  });
  it("excludes incomplete, non-FBS, noncanonical, and out-of-bound games", () => {
    const result = buildNcaafHistoricalTrainingDataset([
      { ...game, canonicalEventId: "fcs", awayClassification: "FCS" },
      { ...game, canonicalEventId: "future", season: 2027 },
      { ...game, canonicalEventId: "missing", homeCanonicalTeamId: null },
    ]);
    expect(result.rows).toHaveLength(0);
    expect(result.report.excluded).toMatchObject({ non_fbs_matchup: 1, season_out_of_bounds: 1, noncanonical_identity: 1 });
  });
});