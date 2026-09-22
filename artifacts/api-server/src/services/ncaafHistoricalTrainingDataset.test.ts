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
  it("uses only completed earlier outcomes and never the target outcome", () => {
    const prior = { ...game, canonicalEventId: "prior", kickoffAt: new Date("2024-09-01T12:00:00Z"), homeScore: 10, awayScore: 20 };
    const target = { ...game, canonicalEventId: "target", kickoffAt: new Date("2024-09-01T20:00:00Z"), homeScore: 31, awayScore: 7 };
    const result = buildNcaafHistoricalTrainingDataset([target, prior]);
    const row = result.rows.find((item) => item.canonicalEventId === "target");
    expect(row?.features.rolling.home).toMatchObject({ priorGameCount: 1, averagePointsFor: 10, averagePointsAgainst: 20, averageMargin: -10, recentForm: [-10] });
    expect(row?.features.rolling.away.priorGameCount).toBe(1);
    expect(row?.features.rolling.home.averagePointsFor).not.toBe(31);
  });
  it("excludes a same-day prior game until its conservative completion time", () => {
    const prior = { ...game, canonicalEventId: "prior", kickoffAt: new Date("2024-09-01T12:00:00Z"), homeScore: 10, awayScore: 20 };
    const target = { ...game, canonicalEventId: "target", kickoffAt: new Date("2024-09-01T17:00:00Z"), homeScore: 31, awayScore: 7 };
    const result = buildNcaafHistoricalTrainingDataset([prior, target]);
    expect(result.rows.find((item) => item.canonicalEventId === "target")).toBeUndefined();
    expect(result.report.excluded.no_eligible_pregame_lineage).toBe(2);
  });
  it("includes completed history without unrelated A/B lineage", () => {
    const prior = { ...game, canonicalEventId: "prior", kickoffAt: new Date("2024-09-01T10:00:00Z"), homeScore: 10, awayScore: 20 };
    const target = { ...game, canonicalEventId: "target", kickoffAt: new Date("2024-09-02T20:00:00Z"), homeScore: 31, awayScore: 7 };
    const result = buildNcaafHistoricalTrainingDataset([prior, target]);
    expect(result.rows.map((item) => item.canonicalEventId)).toEqual(["target"]);
    expect(result.rows[0]?.pitLineage).toEqual([]);
    expect(result.rows[0]?.features.rolling.home.priorGameCount).toBe(1);
  });
  it("deduplicates canonical games while retaining strict A/B gating", () => {
    const duplicate = { ...game, canonicalEventId: "1" };
    const result = buildNcaafHistoricalTrainingDataset([
      { ...game, evidence: [{ source: "cfbd", sourceId: "late", pitClass: "B", effectiveAt: new Date("2024-09-01T19:00:00Z"), capturedAt: new Date("2024-09-01T19:00:00Z"), values: {} }] },
      duplicate,
    ]);
    expect(result.rows).toHaveLength(0);
    expect(result.report.pitClassesExcluded.B).toBe(1);
    expect(result.report.excluded.duplicate_canonical_game).toBe(1);
  });
});