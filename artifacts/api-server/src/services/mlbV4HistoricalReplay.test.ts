import { describe, expect, it } from "vitest";
import { probabilityMetrics, runErrorMetrics, selectLatestValidPregameSnapshots } from "./mlbV4HistoricalReplay";

const snapshot = { decision: { availability: {}, inputSignals: {}, dataQuality: { evidence: {
  schemaVersion: "mlb-full-game-evidence-v1", capturedAt: "2026-08-23T12:00:00Z", cutoffTimestamp: "2026-08-24T00:00:00Z",
} } } };
describe("MLB V4 historical replay helpers", () => {
  it("selects the latest valid PIT revision, never a post-start revision", () => {
    const start = new Date("2026-08-24T00:00:00Z");
    const result = selectLatestValidPregameSnapshots([
      { gameId: "a", predictionId: 1, predictionTimestamp: new Date("2026-08-23T20:00:00Z"), gameStartsAt: start, snapshot },
      { gameId: "a", predictionId: 2, predictionTimestamp: new Date("2026-08-23T22:00:00Z"), gameStartsAt: start, snapshot },
      { gameId: "a", predictionId: 3, predictionTimestamp: new Date("2026-08-24T01:00:00Z"), gameStartsAt: start, snapshot },
    ]);
    expect(result.selected.map((row) => row.predictionId)).toEqual([2]);
    expect(result.excluded.point_in_time_integrity_failure).toBe(1);
  });
  it("calculates scoring and probability metrics", () => {
    expect(runErrorMetrics([{ projectedAway: 3, projectedHome: 5, actualAway: 4, actualHome: 3 }]).home?.mae).toBe(2);
    const metrics = probabilityMetrics([{ probability: .7, marketProbability: .6, outcome: 1 }, { probability: .2, marketProbability: .4, outcome: 0 }]);
    expect(metrics.brier).toBeCloseTo(.065);
    expect(metrics.brierSkill).toBeGreaterThan(0);
  });
  it("does not read result fields while validating snapshot eligibility", () => {
    const result = selectLatestValidPregameSnapshots([{ gameId: "a", predictionId: 1, predictionTimestamp: new Date("2026-08-23"), gameStartsAt: new Date("2026-08-24"), snapshot: { ...snapshot, finalHomeScore: 99 } }]);
    expect(result.selected).toHaveLength(1);
  });
});