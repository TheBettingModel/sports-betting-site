import { describe, expect, it } from "vitest";
import { evaluateMlbPromotionGate, isPassingMlbPromotionGate } from "./mlbPromotionGate";

const champion = {
  id: 1,
  sampleSize: 120,
  totalPicks: 120,
  roi: 0.02,
  netUnits: 2,
  maxDrawdown: 4,
  clvAverage: 0.01,
  posClvRate: 0.55,
  brierScore: 0.21,
  calibrationError: 0.04,
  periodStart: "2026-04-01",
  periodEnd: "2026-08-01",
};

function alignedBacktest(id: number, datasetId: number, netUnits: number, maxDrawdown: number) {
  return {
    id,
    datasetId,
    testWindowStart: "2026-07-01",
    testWindowEnd: "2026-08-01",
    sampleSize: 100,
    test: { netUnits, maxDrawdown },
  };
}

describe("MLB promotion gate", () => {
  it("passes only a materially better, stable candidate on an aligned frozen cohort", () => {
    const gate = evaluateMlbPromotionGate({
      champion,
      challenger: {
        ...champion,
        id: 2,
        roi: 0.04,
        netUnits: 5,
        maxDrawdown: 5,
        clvAverage: 0.012,
        posClvRate: 0.56,
        brierScore: 0.208,
        calibrationError: 0.045,
      },
      championBacktest: alignedBacktest(1, 10, 1, 3),
      challengerBacktest: alignedBacktest(2, 10, 2, 4),
    });

    expect(gate.verdict).toBe("passed");
    expect(gate.checks.frozenChronologicalCohort).toBe(true);
    expect(isPassingMlbPromotionGate(gate)).toBe(true);
  });

  it("fails when closing-line evidence or coverage is missing", () => {
    const gate = evaluateMlbPromotionGate({
      champion,
      challenger: {
        ...champion,
        id: 2,
        totalPicks: 80,
        roi: 0.05,
        netUnits: 4,
        clvAverage: null,
        posClvRate: null,
      },
      championBacktest: alignedBacktest(1, 10, 1, 3),
      challengerBacktest: alignedBacktest(2, 10, 2, 4),
    });

    expect(gate.verdict).toBe("failed");
    expect(gate.checks.closingPrice).toBe(false);
    expect(gate.checks.coverage).toBe(false);
  });

  it("rejects a forged passed flag without frozen evidence", () => {
    expect(isPassingMlbPromotionGate({ version: "mlb-moneyline-gate-v1", verdict: "passed" })).toBe(false);
  });
});