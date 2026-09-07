import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db, mlbHistoricalArtifactsTable, mlbHistoricalSplitsTable } from "@workspace/db";
import {
  MLB_224C_FEATURE_SCHEMA, MLB_224C_FOUNDATION_ARTIFACT, MLB_224C_SPLIT_FOUNDATION_HASH,
  MLB_224C_SPLIT_SCHEMA_VERSION, MLB_224C_SPLIT_VERSION,
  assertAuthoritativeFoundation, chronologicalWalkForwardFolds, forecastGame, sideRows,
  type DevelopmentGame,
} from "../src/services/mlbExpectedRuns224C";
import {
  MLB_V4_NB2_ALPHAS, MLB_V4_RIDGE_LAMBDAS, fitNb2ExpectedRunsFixed,
  fitPoissonExpectedRunsFixed, fitRidgeExpectedRunsFixed, isNb2OverdispersionJustified,
  probabilityMetrics, reliabilityBuckets, stableLocalHash,
} from "../src/services/mlbV4ExpectedRuns";
import {
  MLB_237_LOGISTIC_LAMBDAS, MLB_237_SELECTION_RULE, fitRegularizedMoneyline, modelHash,
  predictMoneyline, rocAuc, selectMoneylineCandidate, type MoneylineCandidateScore, type MoneylineGameRow,
} from "../src/services/mlbV4Moneyline237";
import { loadCohortGames } from "./mlb-expected-runs-224c-data";

const artifacts = await db.select().from(mlbHistoricalArtifactsTable)
  .where(eq(mlbHistoricalArtifactsTable.artifactKey, MLB_224C_FOUNDATION_ARTIFACT));
if (artifacts.length !== 1) throw new Error("Expected one sealed foundation");
assertAuthoritativeFoundation({
  artifactKey: artifacts[0]!.artifactKey, foundationHash: artifacts[0]!.foundationChecksum,
  replayHash: artifacts[0]!.replayChecksum, sourceManifestHash: artifacts[0]!.sourceManifestHash, status: artifacts[0]!.status,
});
// Explicitly scoped query: LOCKED_OOS is neither selected nor loaded.
const splits = await db.select().from(mlbHistoricalSplitsTable).where(inArray(mlbHistoricalSplitsTable.cohort, ["TRAIN", "VALIDATION"]));
const scoped = splits.filter((s) => s.splitVersion === MLB_224C_SPLIT_VERSION);
const ids = (cohort: "TRAIN" | "VALIDATION") => scoped.filter((s) => s.cohort === cohort)
  .map((s) => s.canonicalGameId).sort();
const trainIds = ids("TRAIN"), validationIds = ids("VALIDATION");
if (trainIds.length !== 4700 || validationIds.length !== 2361 || new Set([...trainIds, ...validationIds]).size !== 7061) {
  throw new Error("TRAIN/VALIDATION sealed membership cardinality or dedupe failure");
}
if (scoped.some((s) => !s.immutable || s.schemaVersion !== MLB_224C_SPLIT_SCHEMA_VERSION
  || s.foundationChecksum !== MLB_224C_SPLIT_FOUNDATION_HASH)) {
  throw new Error("TRAIN/VALIDATION sealed cohort identity mismatch");
}
const [train, validation] = await Promise.all([
  loadCohortGames(db, "TRAIN", trainIds), loadCohortGames(db, "VALIDATION", validationIds),
]);
const rows = (games: readonly DevelopmentGame[]): MoneylineGameRow[] => games.map((g) => ({
  home: g.home, away: g.away, homeWon: (g.homeRuns > g.awayRuns ? 1 : 0),
}));
const training = rows(train), heldout = rows(validation), folds = chronologicalWalkForwardFolds(train);
const prior = training.reduce((s, r) => s + r.homeWon, 0) / training.length;
const naiveRows = heldout.map((r) => ({ probability: prior, outcome: r.homeWon }));
const naive = probabilityMetrics(naiveRows);
const expectedSpecs = [
  ...MLB_V4_RIDGE_LAMBDAS.map((lambda) => ({ family: "ridge" as const, lambda, alpha: null })),
  ...MLB_V4_RIDGE_LAMBDAS.map((lambda) => ({ family: "poisson" as const, lambda, alpha: null })),
  ...(isNb2OverdispersionJustified(sideRows(train)) ? MLB_V4_NB2_ALPHAS.flatMap((alpha) =>
    MLB_V4_RIDGE_LAMBDAS.map((lambda) => ({ family: "nb2" as const, lambda, alpha }))) : []),
];
const fitExpected = (spec: typeof expectedSpecs[number], games: readonly DevelopmentGame[]) =>
  spec.family === "ridge" ? fitRidgeExpectedRunsFixed(sideRows(games), MLB_224C_FEATURE_SCHEMA, spec.lambda)
    : spec.family === "poisson" ? fitPoissonExpectedRunsFixed(sideRows(games), MLB_224C_FEATURE_SCHEMA, spec.lambda)
      : fitNb2ExpectedRunsFixed(sideRows(games), MLB_224C_FEATURE_SCHEMA, spec.lambda, spec.alpha!);
const expectedProbabilityRows = (model: ReturnType<typeof fitExpected>, games: readonly DevelopmentGame[]) => games.map((g) => ({
  probability: forecastGame(model, { distribution: { kind: model.modelFamily === "nb2" ? "nb2" : "poisson", alpha: model.alpha }, calibration: { kind: "identity" } }, g).home_win_probability,
  outcome: (g.homeRuns > g.awayRuns ? 1 : 0) as 0 | 1,
}));
const logisticTrainingGrid = MLB_237_LOGISTIC_LAMBDAS.map((lambda) => {
  try {
    const losses = folds.map((fold) => {
      const model = fitRegularizedMoneyline(rows(fold.train), MLB_224C_FEATURE_SCHEMA, lambda);
      if (!model.converged) throw new Error("TRAIN-fold logistic did not converge");
      return probabilityMetrics(rows(fold.validation).map((r) => ({
        probability: predictMoneyline(model, r, MLB_224C_FEATURE_SCHEMA), outcome: r.homeWon,
      }))).logLoss;
    });
    return { id: `binary-logistic-l2-${lambda}`, family: "binary-logistic", lambda, alpha: null,
      trainingFoldLogLoss: losses.reduce((s, v) => s + v, 0) / losses.length, worstFoldLogLoss: Math.max(...losses) };
  } catch (error) {
    return { id: `binary-logistic-l2-${lambda}`, family: "binary-logistic", lambda, alpha: null,
      trainingFoldLogLoss: Infinity, worstFoldLogLoss: Infinity, error: String(error) };
  }
});
const expectedTrainingGrid = expectedSpecs.map((spec) => {
  try {
    const losses = folds.map((fold) => {
      const model = fitExpected(spec, fold.train);
      if (!model.converged) throw new Error("TRAIN-fold expected-runs model did not converge");
      return probabilityMetrics(expectedProbabilityRows(model, fold.validation)).logLoss;
    });
    return { id: `${spec.family}-runs-${spec.lambda}-${spec.alpha ?? "none"}`, ...spec,
      family: `expected-runs-${spec.family}`,
      trainingFoldLogLoss: losses.reduce((s, v) => s + v, 0) / losses.length, worstFoldLogLoss: Math.max(...losses) };
  } catch (error) {
    return { id: `${spec.family}-runs-${spec.lambda}-${spec.alpha ?? "none"}`, ...spec,
      family: `expected-runs-${spec.family}`,
      trainingFoldLogLoss: Infinity, worstFoldLogLoss: Infinity, error: String(error) };
  }
});
const trainSelected = <T extends { id: string; family: string; trainingFoldLogLoss: number }>(grid: readonly T[]) => {
  const groups = new Map<string, T[]>();
  grid.forEach((row) => groups.set(row.family, [...(groups.get(row.family) ?? []), row]));
  return [...groups.values()].map((family) =>
    [...family].sort((a, b) => a.trainingFoldLogLoss - b.trainingFoldLogLoss || a.id.localeCompare(b.id))[0]!);
};
const trainWinners = trainSelected([...logisticTrainingGrid, ...expectedTrainingGrid]);
// Only the one TRAIN-fold winner per family is ever scored on VALIDATION.
const validationFamilyCandidates: MoneylineCandidateScore[] = trainWinners.map((winner) => {
  try {
    if (winner.family === "binary-logistic") {
      const model = fitRegularizedMoneyline(training, MLB_224C_FEATURE_SCHEMA, winner.lambda);
      const rerun = fitRegularizedMoneyline(training, MLB_224C_FEATURE_SCHEMA, winner.lambda);
      const validationRows = heldout.map((r) => ({
        probability: predictMoneyline(model, r, MLB_224C_FEATURE_SCHEMA), outcome: r.homeWon,
      }));
      return { ...winner, validation: probabilityMetrics(validationRows), validationAuc: rocAuc(validationRows),
        integrityIssues: 0, numericalIssues: model.converged ? 0 : 1,
      deterministic: modelHash(model) === modelHash(rerun), coefficientSimplicity: 0 };
    }
    const spec = expectedSpecs.find((row) => `expected-runs-${row.family}` === winner.family
      && row.lambda === winner.lambda && row.alpha === winner.alpha);
    if (!spec) throw new Error("Missing TRAIN-selected expected-runs specification");
    const model = fitExpected(spec, train), rerun = fitExpected(spec, train);
    const validationRows = expectedProbabilityRows(model, validation);
    return { ...winner, validation: probabilityMetrics(validationRows), validationAuc: rocAuc(validationRows),
      integrityIssues: 0, numericalIssues: model.converged ? 0 : 1,
      deterministic: stableLocalHash(model) === stableLocalHash(rerun),
      coefficientSimplicity: spec.family === "ridge" ? 1 : spec.family === "poisson" ? 2 : 3 };
  } catch (error) {
    return { ...winner, validation: { brier: Infinity, logLoss: Infinity, accuracy: 0, ece: Infinity, reliability: [] },
      integrityIssues: 0, numericalIssues: 1, deterministic: false, coefficientSimplicity: 99,
      error: String(error) };
  }
});
const selected = selectMoneylineCandidate(validationFamilyCandidates, naive);
const projectSide = (side: MoneylineGameRow["home"], schema: typeof MLB_224C_FEATURE_SCHEMA) => ({
  ownOffense: Object.fromEntries(schema.ownOffense.map((name) => [name, side.ownOffense[name]])),
  leagueEnvironment: Object.fromEntries(schema.leagueEnvironment.map((name) => [name, side.leagueEnvironment[name]])),
  opponentBullpen: Object.fromEntries(schema.opponentBullpen.map((name) => [name, side.opponentBullpen[name]])),
});
const projectRows = (source: readonly MoneylineGameRow[], schema: typeof MLB_224C_FEATURE_SCHEMA): MoneylineGameRow[] =>
  source.map((row) => ({
    home: projectSide(row.home, schema),
    away: projectSide(row.away, schema),
    homeWon: row.homeWon,
  }));
const ablation = (name: string, schema: typeof MLB_224C_FEATURE_SCHEMA) => {
  const ablationTraining = projectRows(training, schema);
  const ablationValidation = projectRows(heldout, schema);
  const m = fitRegularizedMoneyline(ablationTraining, schema,
    selected?.family === "binary-logistic" ? selected.lambda : MLB_237_LOGISTIC_LAMBDAS[0]);
  const scoreRows = ablationValidation.map((r) => ({
    probability: predictMoneyline(m, r, schema),
    outcome: r.homeWon,
  }));
  return { name, validation: probabilityMetrics(scoreRows), validationAuc: rocAuc(scoreRows) };
};
const empty = [] as string[];
const ablations = [
  ablation("offense-only", { ownOffense: MLB_224C_FEATURE_SCHEMA.ownOffense, leagueEnvironment: empty, opponentBullpen: empty }),
  ablation("bullpen-only", { ownOffense: empty, leagueEnvironment: empty, opponentBullpen: MLB_224C_FEATURE_SCHEMA.opponentBullpen }),
  ablation("context-only", { ownOffense: empty, leagueEnvironment: MLB_224C_FEATURE_SCHEMA.leagueEnvironment, opponentBullpen: empty }),
];
const selectedLogisticModel = selected?.family === "binary-logistic"
  ? fitRegularizedMoneyline(training, MLB_224C_FEATURE_SCHEMA, selected.lambda) : null;
const selectedExpectedSpec = expectedSpecs.find((spec) => `expected-runs-${spec.family}` === selected?.family
  && `${spec.family}-runs-${spec.lambda}-${spec.alpha ?? "none"}` === selected.id);
const selectedExpectedModel = selectedExpectedSpec ? fitExpected(selectedExpectedSpec, train) : null;
const selectedProbability = (game: DevelopmentGame, row: MoneylineGameRow) => selectedLogisticModel
  ? predictMoneyline(selectedLogisticModel, row, MLB_224C_FEATURE_SCHEMA)
  : selectedExpectedModel ? expectedProbabilityRows(selectedExpectedModel, [game])[0]!.probability : prior;
const selectedProbabilities = selected ? heldout.map((row, index) => selectedProbability(validation[index]!, row)) : [];
const pairedUncertainty = (() => {
  if (!selectedProbabilities.length) return null;
  const clamp = (value: number) => Math.max(1e-15, Math.min(1 - 1e-15, value));
  const summarize = (values: number[]) => {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.length > 1
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
      : 0;
    const standardError = Math.sqrt(variance / values.length);
    return {
      candidateMinusNaiveMean: mean,
      standardError,
      confidenceInterval95: [mean - 1.96 * standardError, mean + 1.96 * standardError],
      interpretation: mean < 0 && mean + 1.96 * standardError < 0
        ? "CANDIDATE_BETTER_AT_APPROXIMATE_95_PERCENT"
        : "DIFFERENCE_NOT_RESOLVED_AT_APPROXIMATE_95_PERCENT",
    };
  };
  const logLossDifferences = selectedProbabilities.map((probability, index) => {
    const outcome = heldout[index]!.homeWon;
    const candidate = -(outcome * Math.log(clamp(probability)) + (1 - outcome) * Math.log(clamp(1 - probability)));
    const baseline = -(outcome * Math.log(clamp(prior)) + (1 - outcome) * Math.log(clamp(1 - prior)));
    return candidate - baseline;
  });
  const brierDifferences = selectedProbabilities.map((probability, index) => {
    const outcome = heldout[index]!.homeWon;
    return (probability - outcome) ** 2 - (prior - outcome) ** 2;
  });
  return {
    method: "paired per-game normal interval; descriptive because games are not guaranteed independent",
    logLoss: summarize(logLossDifferences),
    brier: summarize(brierDifferences),
  };
})();
const foldDiagnostics = selected ? folds.map((fold) => {
  const scoreRows = selectedLogisticModel
    ? (() => {
      const foldModel = fitRegularizedMoneyline(rows(fold.train), MLB_224C_FEATURE_SCHEMA, selectedLogisticModel.lambda);
      return rows(fold.validation).map((row) => ({
        probability: predictMoneyline(foldModel, row, MLB_224C_FEATURE_SCHEMA), outcome: row.homeWon,
      }));
    })()
    : expectedProbabilityRows(fitExpected(selectedExpectedSpec!, fold.train), fold.validation);
  return { id: fold.id, trainCount: fold.train.length, validationCount: fold.validation.length, metrics: probabilityMetrics(scoreRows) };
}) : [];
const report = {
  task: "237", status: selected ? "VALIDATION_GATES_PASSED_RESEARCH_ONLY" : "VALIDATION_GATES_FAILED_STOPPED",
  LOCKED_OOS_NOT_QUERIED: true, freezeEligibility: false,
  cohortHashes: { train: stableLocalHash(trainIds), validation: stableLocalHash(validationIds) },
  researchFeatureManifest: {
    version: "mlb-v4-moneyline-237-flat-38-v1",
    hash: stableLocalHash(MLB_224C_FEATURE_SCHEMA),
    count: Object.values(MLB_224C_FEATURE_SCHEMA).flat().length,
    schema: MLB_224C_FEATURE_SCHEMA,
  },
  selectionRule: MLB_237_SELECTION_RULE, trainNaiveHomeWinPrior: { probability: prior, validation: naive },
  candidateTable: validationFamilyCandidates, selected,
  trainOnlyHyperparameterGrid: [...logisticTrainingGrid, ...expectedTrainingGrid],
  trainOnlyHyperparameterSelection: trainWinners.map((row) => ({
    family: row.family, id: row.id, lambda: row.lambda, alpha: "alpha" in row ? row.alpha : null,
    chronologicalTrainFoldLogLoss: row.trainingFoldLogLoss,
  })),
  validationFamilySelection: { comparedOnlyTrainFoldWinners: true, selectedId: selected?.id ?? null },
  researchCandidateIdentity: selectedLogisticModel ? {
    status: "VALIDATION_SELECTED_UNFROZEN_RESEARCH_ONLY",
    modelId: "tbm-mlb-moneyline-v4-research-237",
    version: "validation-only-binary-logistic-l2-0.1",
    modelHash: modelHash(selectedLogisticModel),
    parameterHash: stableLocalHash({
      intercept: selectedLogisticModel.intercept,
      coefficients: selectedLogisticModel.coefficients,
    }),
    transformHash: stableLocalHash(selectedLogisticModel.transform),
    configurationHash: stableLocalHash({
      family: selected?.family,
      lambda: selected?.lambda,
      calibration: "identity",
      selectionRule: MLB_237_SELECTION_RULE,
    }),
    notAnArtifact: true,
  } : null,
  calibrationRationale: "Identity calibration for every candidate; no VALIDATION-fitted calibration. Any future calibration must be selected from chronological TRAIN out-of-fold predictions only.",
  validationMetrics: selected?.validation ?? null,
  validationPairedUncertaintyVersusNaive: pairedUncertainty,
  temporalFolds: foldDiagnostics,
  seasonDiagnostics: Object.fromEntries([...new Set(validation.map((g) => g.season))].sort().map((season) => [season,
    probabilityMetrics(heldout.map((r, i) => ({ r, game: validation[i]! })).filter(({ game }) => game.season === season)
      .map(({ r, game }) => ({ probability: selectedProbability(game, r), outcome: r.homeWon })))])),
  probabilityDistribution: selectedProbabilities.length ? { min: Math.min(...selectedProbabilities), max: Math.max(...selectedProbabilities), hash: stableLocalHash(selectedProbabilities) } : null,
  calibrationBuckets: selected ? reliabilityBuckets(heldout.map((r, i) => ({ probability: selectedProbability(validation[i]!, r), outcome: r.homeWon }))) : [],
  baselines: {
    naiveTrainingHomeWinPrior: { ...naive, auc: rocAuc(naiveRows) },
    simplePitSafeTeamStrength: (() => {
      const row = ablations.find((entry) => entry.name === "offense-only");
      return row ? { ...row.validation, auc: row.validationAuc } : null;
    })(),
    starterStrength: { status: "UNAVAILABLE", reason: "ZERO_PREGAME_STARTER_IDENTITY_COVERAGE" },
    marketImpliedComparisonOnly: { status: "NOT_IN_SEALED_MODEL_INPUT", usedForTrainingOrSelection: false },
  },
  ablations, leakageAndPit: { sealedCohortIdentity: true, starterIdentityExcluded: true, marketExcluded: true, resultFieldsExcludedFromFeatures: true, pitStatus: "SEALED_PREGAME_FEATURES" },
};
const output = resolve(process.cwd(), "../../reports/mlb-v4-moneyline-237.json");
await mkdir(resolve(output, ".."), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, report: output, selected: report.selected?.id ?? null, validation: report.validationMetrics, LOCKED_OOS_NOT_QUERIED: true }, null, 2));