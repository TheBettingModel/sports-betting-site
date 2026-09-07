import { describe, expect, it } from "vitest";
import {
  applyMlbFeatureTransform, convolveIndependentScores, fairAmericanOdds,
  fitMlbFeatureTransform, fitNb2ExpectedRuns, fitNb2ExpectedRunsFixed, fitPlattCalibration,
  fitPoissonExpectedRuns, fitPoissonExpectedRunsFixed, fitRidgeExpectedRuns,
  fitRidgeExpectedRunsFixed, flattenMlbSideFeatures, parseExpectedRunsModel, predictExpectedRuns,
  projectedScoreContract, serializeExpectedRunsModel, stableLocalHash, stableSerialize,
  type MlbSideFeatureSchema, type MlbSideFeatureVector, type MlbTrainingRow,
} from "./mlbV4ExpectedRuns";

const schema: MlbSideFeatureSchema = {
  ownOffense: ["rollingRpg", "seasonRpg"],
  leagueEnvironment: ["runsPerTeam"],
  opponentBullpen: ["era", "fatigue"],
};
const feature = (offense: number, bullpenEra: number, missing = false): MlbSideFeatureVector => ({
  ownOffense: { rollingRpg: offense, seasonRpg: missing ? null : offense + .2 },
  leagueEnvironment: { runsPerTeam: 4.5 },
  opponentBullpen: { era: bullpenEra, fatigue: bullpenEra - 3 },
});
const rows: MlbTrainingRow[] = Array.from({ length: 40 }, (_, i) => ({
  features: feature(2.5 + i * .1, 3 + (i % 8) * .2, i % 11 === 0),
  runs: Math.max(0, Math.round(1 + (2.5 + i * .1) * .6 + (i % 8) * .15)),
}));

describe("MLB V4 expected-runs deterministic core", () => {
  it("fits and infers deterministically across transparent families", () => {
    const ridgeA = fitRidgeExpectedRuns(rows, schema);
    const ridgeB = fitRidgeExpectedRuns(rows, schema);
    expect(serializeExpectedRunsModel(ridgeA)).toBe(serializeExpectedRunsModel(ridgeB));
    const poissonA = fitPoissonExpectedRuns(rows, schema);
    const poissonB = fitPoissonExpectedRuns(rows, schema);
    expect(poissonA).toEqual(poissonB);
    for (const model of [ridgeA, poissonA]) {
      const prediction = predictExpectedRuns(model, feature(4.2, 4.1));
      expect(Number.isFinite(prediction)).toBe(true);
      expect(prediction).toBeGreaterThanOrEqual(0);
      expect(model.coefficients).toHaveLength(5);
    }
    const overdispersed = Array.from({ length: 40 }, (_, i) => ({
      features: feature(3 + i / 20, 4),
      runs: i % 2 ? 0 : 12,
    }));
    expect(fitNb2ExpectedRuns(overdispersed, schema).alpha).toBeTypeOf("number");
  });

  it("refits preselected hyperparameters without silently selecting another", () => {
    expect(fitRidgeExpectedRunsFixed(rows, schema, 10).regularization).toBe(10);
    expect(fitPoissonExpectedRunsFixed(rows, schema, 1).regularization).toBe(1);
    const overdispersed = Array.from({ length: 40 }, (_, i) => ({
      features: feature(3 + i / 20, 4), runs: i % 2 ? 0 : 12,
    }));
    const nb = fitNb2ExpectedRunsFixed(overdispersed, schema, 10, .5);
    expect([nb.regularization, nb.alpha]).toEqual([10, .5]);
    expect(() => fitPoissonExpectedRunsFixed(rows, schema, 2 as 0)).toThrow(/unapproved/i);
  });

  it("fits transforms only from supplied training rows", () => {
    const training = [feature(1, 3), feature(3, 5, true), feature(5, 7)];
    const transform = fitMlbFeatureTransform(training, schema);
    expect(transform.medians[1]).toBe(3.2);
    const before = stableSerialize(transform);
    applyMlbFeatureTransform(feature(10000, 10000), schema, transform);
    expect(stableSerialize(transform)).toBe(before);
    expect(transform.means[0]).toBe(3);
  });

  it("strictly allowlists side direction and recursively firewalls leakage", () => {
    expect(() => flattenMlbSideFeatures({
      ...feature(4, 4),
      ownBullpen: { era: 4 },
    } as unknown as MlbSideFeatureVector, schema)).toThrow(/only own offense/i);
    expect(() => flattenMlbSideFeatures({
      ...feature(4, 4),
      ownOffense: { rollingRpg: 4, seasonRpg: 4, nested: { actualStarterEra: 2 } },
    } as unknown as MlbSideFeatureVector, schema)).toThrow(/prohibited/i);
    expect(() => flattenMlbSideFeatures({
      ...feature(4, 4),
      leagueEnvironment: { runsPerTeam: 4.5, closingMoneyline: -120 },
    } as unknown as MlbSideFeatureVector, schema)).toThrow(/prohibited/i);
    expect(() => fitRidgeExpectedRuns([{
      features: feature(4, 4), runs: -1,
    }], schema)).toThrow(/targets/i);
  });

  it("produces normalized no-draw probabilities and fair odds", () => {
    for (const kind of ["poisson", "nb2"] as const) {
      const distribution = convolveIndependentScores(4.7, 4.1, { kind, alpha: .25 });
      const sum = distribution.exactScores.flat().reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 11);
      expect(distribution.homeWinProbability + distribution.awayWinProbability).toBeCloseTo(1, 12);
      expect(distribution.homeWinProbability).toBeGreaterThan(distribution.awayWinProbability);
      expect(distribution.home.omittedTail).toBeLessThanOrEqual(5.1e-13);
    }
    expect(fairAmericanOdds(.5)).toBe(100);
    expect(fairAmericanOdds(.6)).toBeCloseTo(-150);
    expect(fairAmericanOdds(.4)).toBeCloseTo(150);
  });

  it("round-trips models and hashes stable key ordering", () => {
    const model = fitPoissonExpectedRuns(rows, schema);
    const parsed = parseExpectedRunsModel(serializeExpectedRunsModel(model));
    expect(predictExpectedRuns(parsed, feature(4, 4))).toBe(predictExpectedRuns(model, feature(4, 4)));
    expect(stableLocalHash({ b: 2, a: 1 })).toBe(stableLocalHash({ a: 1, b: 2 }));
    expect(stableLocalHash({ a: 1 })).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves offense and opponent-bullpen directionality", () => {
    const directed = Array.from({ length: 60 }, (_, i) => {
      const offense = 2 + (i % 10) * .4;
      const bullpen = 3 + Math.floor(i / 10) * .4;
      return { features: feature(offense, bullpen), runs: Math.round(offense + bullpen / 2) };
    });
    const model = fitPoissonExpectedRuns(directed, schema);
    expect(predictExpectedRuns(model, feature(6, 5))).toBeGreaterThan(predictExpectedRuns(model, feature(2, 5)));
    expect(predictExpectedRuns(model, feature(4, 6))).toBeGreaterThan(predictExpectedRuns(model, feature(4, 3)));
  });

  it("exposes exact scores and deterministic calibration", () => {
    expect(projectedScoreContract(4.38, 2.21)).toEqual({
      home_expected_runs_exact: 4.38,
      away_expected_runs_exact: 2.21,
      projected_total_exact: 6.59,
      projected_margin_exact: 2.17,
    });
    const calibrationRows = [
      { probability: .2, outcome: 0 as const }, { probability: .3, outcome: 0 as const },
      { probability: .7, outcome: 1 as const }, { probability: .8, outcome: 1 as const },
    ];
    expect(fitPlattCalibration(calibrationRows)).toEqual(fitPlattCalibration(calibrationRows));
  });
});