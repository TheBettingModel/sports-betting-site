import { describe, expect, it } from "vitest";
import { MLB_224C_FEATURE_SCHEMA } from "./mlbExpectedRuns224C";
import {
  fitMoneylineTransform, fitRegularizedMoneyline, gameFeatures, modelHash, predictMoneyline,
  rocAuc, selectMoneylineCandidate,
} from "./mlbV4Moneyline237";
import { probabilityMetrics } from "./mlbV4ExpectedRuns";

const side = (value: number, missing = false) => ({
  ownOffense: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.ownOffense.map((k) => [k, missing ? null : value])),
  leagueEnvironment: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.leagueEnvironment.map((k) => [k, missing ? null : value])),
  opponentBullpen: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.opponentBullpen.map((k) => [k, missing ? null : value])),
});
const data = Array.from({ length: 20 }, (_, i) => ({
  home: side(i % 2 ? 2 : 0, i === 0), away: side(i % 2 ? 0 : 2), homeWon: (i % 2) as 0 | 1,
}));
describe("MLB task 237 moneyline logistic", () => {
  it("uses TRAIN-only transform values and supports missing values", () => {
    const transform = fitMoneylineTransform(data, MLB_224C_FEATURE_SCHEMA);
    const mediansBeforeScoring = [...transform.sideTransform.medians];
    const heldOut = { ...data[0]!, home: side(999999), away: side(-999999) };
    expect(gameFeatures(heldOut, MLB_224C_FEATURE_SCHEMA, transform)).toHaveLength(38);
    expect(transform.sideTransform.medians).toEqual(mediansBeforeScoring);
    expect(transform.sideTransform.means).toEqual(
      fitMoneylineTransform(data, MLB_224C_FEATURE_SCHEMA).sideTransform.means);
    expect(gameFeatures(data[0]!, MLB_224C_FEATURE_SCHEMA, transform)).toHaveLength(38);
  });
  it("is deterministic and returns bounded probabilities", () => {
    const one = fitRegularizedMoneyline(data, MLB_224C_FEATURE_SCHEMA, .1);
    const two = fitRegularizedMoneyline(data, MLB_224C_FEATURE_SCHEMA, .1);
    expect(modelHash(one)).toBe(modelHash(two));
    expect(one.converged).toBe(true);
    data.forEach((row) => expect(predictMoneyline(one, row, MLB_224C_FEATURE_SCHEMA)).toBeGreaterThan(0));
    data.forEach((row) => expect(predictMoneyline(one, row, MLB_224C_FEATURE_SCHEMA)).toBeLessThan(1));
  });
  it("rejects invalid outcomes and allowlist violations", () => {
    expect(() => fitRegularizedMoneyline([{ ...data[0]!, homeWon: 2 as 0 | 1 }], MLB_224C_FEATURE_SCHEMA, .1)).toThrow(/binary/);
    const invalid = { ...data[0]!, home: { ...data[0]!.home, ownOffense: { ...data[0]!.home.ownOffense, marketOdds: 1 } } };
    expect(() => fitRegularizedMoneyline([invalid], MLB_224C_FEATURE_SCHEMA, .1)).toThrow();
  });
  it("computes deterministic rank AUC with tie handling", () => {
    expect(rocAuc([{ probability: .1, outcome: 0 }, { probability: .9, outcome: 1 }])).toBe(1);
    expect(rocAuc([{ probability: .9, outcome: 0 }, { probability: .1, outcome: 1 }])).toBe(0);
    expect(rocAuc([{ probability: .5, outcome: 0 }, { probability: .5, outcome: 1 }])).toBe(.5);
    expect(() => rocAuc([{ probability: .5, outcome: 1 }])).toThrow(/both outcome classes/);
  });
  it("enforces every predeclared selection gate", () => {
    const naive = probabilityMetrics([{ probability: .5, outcome: 1 }, { probability: .5, outcome: 0 }]);
    const calibratedRows = [
      ...Array.from({ length: 4 }, () => ({ probability: .4, outcome: 1 as const })),
      ...Array.from({ length: 6 }, () => ({ probability: .4, outcome: 0 as const })),
      { probability: .5, outcome: 1 as const }, { probability: .5, outcome: 0 as const },
    ];
    const candidate = { id: "ok", family: "binary-logistic", lambda: .1,
      validation: probabilityMetrics(calibratedRows),
      integrityIssues: 0, numericalIssues: 0, deterministic: true, worstFoldLogLoss: .6 };
    expect(selectMoneylineCandidate([candidate], naive)?.id).toBe("ok");
    expect(selectMoneylineCandidate([{ ...candidate, integrityIssues: 1 }], naive)).toBeNull();
    expect(selectMoneylineCandidate([{ ...candidate, numericalIssues: 1 }], naive)).toBeNull();
    expect(selectMoneylineCandidate([{ ...candidate, deterministic: false }], naive)).toBeNull();
    expect(selectMoneylineCandidate([{ ...candidate, validation: { ...candidate.validation, logLoss: naive.logLoss } }], naive)).toBeNull();
    expect(selectMoneylineCandidate([{ ...candidate, validation: { ...candidate.validation, brier: naive.brier } }], naive)).toBeNull();
    expect(selectMoneylineCandidate([{ ...candidate, validation: { ...candidate.validation, ece: .06 } }], naive)).toBeNull();
    expect(selectMoneylineCandidate([{ ...candidate, worstFoldLogLoss: naive.logLoss + .11 }], naive)).toBeNull();
  });
});