import { and, eq } from "drizzle-orm";
import {
  db,
  mlbHistoricalArtifactsTable,
  mlbHistoricalEvaluationRunsTable,
  mlbHistoricalExpectedRunsForecastsTable,
  mlbHistoricalModelArtifactsTable,
  mlbHistoricalPreOosLocksTable,
  mlbHistoricalGamesTable,
  mlbHistoricalSplitsTable,
  mlbHistoricalTrainingManifestsTable,
} from "@workspace/db";
import {
  MLB_224C_FEATURE_DIRECTIONALITY,
  MLB_224C_FEATURE_SCHEMA,
  MLB_224C_FOUNDATION_ARTIFACT,
  MLB_224C_MODEL_ID,
  MLB_224C_SCHEMA_VERSION,
  MLB_224C_SELECTION_RULE,
  MLB_224C_SPLIT_VERSION,
  assertSealedSplitBinding,
  assertAuthoritativeFoundation,
  buildTrainingManifest,
  chooseCalibration,
  chronologicalWalkForwardFolds,
  evaluateForecasts,
  forecastGame,
  selectCandidate,
  sideRows,
  type CandidateScore,
  type DevelopmentGame,
  type DistributionChoice,
  type FrozenMapping,
} from "../src/services/mlbExpectedRuns224C";
import {
  MLB_V4_NB2_ALPHAS,
  MLB_V4_RIDGE_LAMBDAS,
  fitNb2ExpectedRunsFixed,
  fitPoissonExpectedRunsFixed,
  fitRidgeExpectedRunsFixed,
  fitSimpleRunBaselines,
  isNb2OverdispersionJustified,
  probabilityMetrics,
  runMetrics,
  stableLocalHash,
} from "../src/services/mlbV4ExpectedRuns";
import { loadCohortGames } from "./mlb-expected-runs-224c-data";

const artifacts = await db.select().from(mlbHistoricalArtifactsTable)
  .where(eq(mlbHistoricalArtifactsTable.artifactKey, MLB_224C_FOUNDATION_ARTIFACT));
if (artifacts.length !== 1) throw new Error("Expected exactly one authoritative v5 foundation");
const foundation = artifacts[0]!;
assertAuthoritativeFoundation({
  artifactKey: foundation.artifactKey, foundationHash: foundation.foundationChecksum,
  replayHash: foundation.replayChecksum, sourceManifestHash: foundation.sourceManifestHash,
  status: foundation.status,
});

// Membership metadata is safe to load here. No OOS feature or outcome table is queried.
const splits = await db.select().from(mlbHistoricalSplitsTable)
  .where(eq(mlbHistoricalSplitsTable.splitVersion, MLB_224C_SPLIT_VERSION));
const splitDates = await db.select({
  canonicalGameId: mlbHistoricalGamesTable.canonicalGameId,
  gameDate: mlbHistoricalGamesTable.gameDate,
}).from(mlbHistoricalGamesTable)
  .where(eq(mlbHistoricalGamesTable.schemaVersion, "mlb-completion-chronology-v3"));
const gameDates = new Map(splitDates.map((row) => [row.canonicalGameId, row.gameDate.toISOString()]));
const boundSplits = splits.map((row) => ({
  canonicalGameId: row.canonicalGameId,
  cohort: row.cohort as "TRAIN" | "VALIDATION" | "LOCKED_OOS",
  assignmentHash: row.assignmentHash,
  immutable: row.immutable,
  schemaVersion: row.schemaVersion,
  foundationChecksum: row.foundationChecksum,
  gameDate: gameDates.get(row.canonicalGameId) ?? "INVALID",
}));
const cohortBoundaries = assertSealedSplitBinding(boundSplits);
const manifest = buildTrainingManifest(boundSplits, {});

const existingLocks = await db.select().from(mlbHistoricalPreOosLocksTable)
  .where(and(eq(mlbHistoricalPreOosLocksTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
    eq(mlbHistoricalPreOosLocksTable.trainingManifestHash, manifest.manifestHash)));
if (existingLocks.length) {
  if (existingLocks.length !== 1) throw new Error("Duplicate pre-OOS lock");
  const lock = existingLocks[0]!;
  const [storedManifest, storedModel, forecasts, evaluations] = await Promise.all([
    db.select().from(mlbHistoricalTrainingManifestsTable)
      .where(eq(mlbHistoricalTrainingManifestsTable.manifestHash, manifest.manifestHash)),
    db.select().from(mlbHistoricalModelArtifactsTable)
      .where(eq(mlbHistoricalModelArtifactsTable.artifactHash, lock.modelArtifactHash)),
    db.select().from(mlbHistoricalExpectedRunsForecastsTable)
      .where(and(eq(mlbHistoricalExpectedRunsForecastsTable.modelId, lock.modelId),
        eq(mlbHistoricalExpectedRunsForecastsTable.modelVersion, lock.modelVersion))),
    db.select().from(mlbHistoricalEvaluationRunsTable)
      .where(and(eq(mlbHistoricalEvaluationRunsTable.modelId, lock.modelId),
        eq(mlbHistoricalEvaluationRunsTable.modelVersion, lock.modelVersion))),
  ]);
  if (storedManifest.length !== 1 || storedModel.length !== 1
    || forecasts.length !== manifest.trainGameCount + manifest.validationGameCount
    || evaluations.filter((row) => row.phase === "TRAIN" || row.phase === "VALIDATION").length !== 2
    || stableLocalHash(storedManifest[0]!.trainGameIds) !== manifest.trainCohortHash
    || stableLocalHash(storedManifest[0]!.validationGameIds) !== manifest.validationCohortHash
    || stableLocalHash(storedManifest[0]!.oosGameIds) !== manifest.oosCohortHash) {
    throw new Error("Existing 224C persistence is not exactly complete and immutable");
  }
  console.log(JSON.stringify({ status: "VERIFIED_EXISTING_EXACT", modelVersion: lock.modelVersion,
    manifestHash: manifest.manifestHash }, null, 2));
  process.exit(0);
}

const [train, validation] = await Promise.all([
  loadCohortGames(db, "TRAIN", manifest.trainGameIds),
  loadCohortGames(db, "VALIDATION", manifest.validationGameIds),
]);
const trainRows = sideRows(train);
const folds = chronologicalWalkForwardFolds(train);
const specs: { family: CandidateScore["family"]; lambda: 0 | 1 | 10; alpha: .1 | .25 | .5 | null }[] = [
  ...MLB_V4_RIDGE_LAMBDAS.map((lambda) => ({ family: "ridge-linear" as const, lambda, alpha: null })),
  ...MLB_V4_RIDGE_LAMBDAS.map((lambda) => ({ family: "poisson" as const, lambda, alpha: null })),
];
if (isNb2OverdispersionJustified(trainRows)) {
  specs.push(...MLB_V4_NB2_ALPHAS.flatMap((alpha) =>
    MLB_V4_RIDGE_LAMBDAS.map((lambda) => ({ family: "nb2" as const, lambda, alpha }))));
}
const fit = (spec: typeof specs[number], games: readonly DevelopmentGame[]) => {
  const rows = sideRows(games);
  if (spec.family === "ridge-linear") return fitRidgeExpectedRunsFixed(rows, MLB_224C_FEATURE_SCHEMA, spec.lambda);
  if (spec.family === "poisson") return fitPoissonExpectedRunsFixed(rows, MLB_224C_FEATURE_SCHEMA, spec.lambda);
  return fitNb2ExpectedRunsFixed(rows, MLB_224C_FEATURE_SCHEMA, spec.lambda, spec.alpha!);
};
const identityMapping: FrozenMapping = {
  distribution: { kind: "poisson", alpha: null }, calibration: { kind: "identity" },
};
const candidates: CandidateScore[] = specs.map((spec) => {
  try {
    const model = fit(spec, train);
    const validationForecasts = validation.map((game) => forecastGame(model, identityMapping, game));
    const aggregate = evaluateForecasts(validation, validationForecasts);
    const foldMae = folds.map((fold) => {
      const foldModel = fit(spec, fold.train);
      return evaluateForecasts(fold.validation,
        fold.validation.map((game) => forecastGame(foldModel, identityMapping, game))).runs.total.mae;
    });
    return {
      id: `${spec.family}-lambda-${spec.lambda}-alpha-${spec.alpha ?? "none"}`, ...spec,
      totalMae: aggregate.runs.total.mae, totalBias: aggregate.runs.total.bias,
      brier: aggregate.probability.brier, logLoss: aggregate.probability.logLoss,
      ece: aggregate.probability.ece,
      worstFoldDegradation: Math.max(...foldMae.map((mae) => mae - aggregate.runs.total.mae)),
      integrityIssues: 0, numericalIssues: model.converged ? 0 : 1,
    };
  } catch {
    return {
      id: `${spec.family}-lambda-${spec.lambda}-alpha-${spec.alpha ?? "none"}`, ...spec,
      totalMae: Infinity, totalBias: Infinity, brier: Infinity, logLoss: Infinity,
      ece: Infinity, worstFoldDegradation: Infinity, integrityIssues: 0, numericalIssues: 1,
    };
  }
});
const selected = selectCandidate(candidates);

// Calibration training uses only predictions made out-of-fold in chronological development.
const foldExpectedModels = folds.map((fold) => ({ fold, model: fit(selected, fold.train) }));
const selectedFoldReports = foldExpectedModels.map(({ fold, model }) => ({
  id: fold.id,
  metrics: evaluateForecasts(fold.validation,
    fold.validation.map((game) => forecastGame(model, identityMapping, game))),
}));
const developmentCalibrationRows = (distribution: DistributionChoice) => foldExpectedModels.flatMap(({ fold, model }) => {
  return fold.validation.map((game) => {
    const raw = forecastGame(model, {
      distribution, calibration: { kind: "identity" },
    }, game).home_win_probability;
    return { probability: raw, outcome: (game.homeRuns > game.awayRuns ? 1 : 0) as 0 | 1 };
  });
});
const developmentModel = fit(selected, train);
const distributionChoices: DistributionChoice[] = [{ kind: "poisson", alpha: null }];
if (isNb2OverdispersionJustified(trainRows)) {
  distributionChoices.push(...MLB_V4_NB2_ALPHAS.map((alpha) => ({ kind: "nb2" as const, alpha })));
}
const mappingScores = distributionChoices.map((distribution) => {
  const calibration = chooseCalibration(developmentCalibrationRows(distribution));
  const mapping = { distribution, calibration } as FrozenMapping;
  const rows = validation.map((game) => {
    const probability = forecastGame(developmentModel, mapping, game).home_win_probability;
    return { probability, outcome: (game.homeRuns > game.awayRuns ? 1 : 0) as 0 | 1 };
  });
  return { distribution, calibration, metrics: probabilityMetrics(rows) };
}).sort((a, b) => a.metrics.brier - b.metrics.brier || a.metrics.logLoss - b.metrics.logLoss
  || a.metrics.ece - b.metrics.ece
  || (a.calibration.kind === "identity" ? 0 : 1) - (b.calibration.kind === "identity" ? 0 : 1)
  || (a.distribution.kind === "poisson" ? 0 : 1) - (b.distribution.kind === "poisson" ? 0 : 1));
const mapping: FrozenMapping = {
  distribution: mappingScores[0]!.distribution, calibration: mappingScores[0]!.calibration,
};

// Keep the TRAIN-only fitted parameters so VALIDATION remains a genuine holdout.
// Validation selects the immutable configuration and mapping, but never refits coefficients.
const finalModel = developmentModel;
if (!finalModel.converged) throw new Error("Selected TRAIN-only model did not converge");
const rerunModel = fit(selected, train);
const firstTrainingHash = stableLocalHash(finalModel);
const rerunHash = stableLocalHash(rerunModel);
const rerunForecasts = validation.map((game) => forecastGame(rerunModel, mapping, game));
const firstValidationForecasts = validation.map((game) => forecastGame(finalModel, mapping, game));
const mismatchCount = firstValidationForecasts.reduce((count, forecast, index) =>
  count + (stableLocalHash(forecast) === stableLocalHash(rerunForecasts[index]) ? 0 : 1), 0)
  + (firstTrainingHash === rerunHash ? 0 : 1);
if (mismatchCount !== 0) throw new Error("Selected model deterministic rebuild mismatch");
const finalForecasts = [...train, ...validation].map((game) => forecastGame(finalModel, mapping, game));
const trainForecasts = finalForecasts.slice(0, train.length);
const validationForecasts = finalForecasts.slice(train.length);
const trainMetrics = evaluateForecasts(train, trainForecasts);
const validationMetrics = evaluateForecasts(validation, validationForecasts);
const baseline = fitSimpleRunBaselines(train.map((g) => ({ homeRuns: g.homeRuns, awayRuns: g.awayRuns })));
const baselineMetric = (predict: (game: DevelopmentGame) => { home: number; away: number }) =>
  runMetrics(validation.map((game) => {
    const predicted = predict(game);
    return { predictedHome: predicted.home, predictedAway: predicted.away,
      actualHome: game.homeRuns, actualAway: game.awayRuns };
  }));
const baselineMetrics = {
  leagueMean: baselineMetric(() => ({ home: baseline.league, away: baseline.league })),
  homeAwayMean: baselineMetric(() => ({ home: baseline.homeAway.home, away: baseline.homeAway.away })),
  shrunkOffense: baselineMetric((game) => {
    const prediction = (side: "home" | "away") => {
      const features = game[side].ownOffense;
      const games = typeof features.seasonGames === "number" ? features.seasonGames : 0;
      const rate = typeof features.seasonRunsPerGame === "number" ? features.seasonRunsPerGame : 0;
      return baseline.shrunkOffense(rate * games, games, 20, side);
    };
    return { home: prediction("home"), away: prediction("away") };
  }),
};
const baselineTotalMae = baselineMetrics.homeAwayMean.total.mae;
const failureFlags = {
  insufficientBaselineImprovement: baselineTotalMae - selected.totalMae < .02,
  excessiveValidationBias: Math.abs(selected.totalBias) > .25,
  severeFoldInstability: selected.worstFoldDegradation > .50,
  numericalIssues: selected.numericalIssues > 0,
};

const featureSchemaHash = stableLocalHash(MLB_224C_FEATURE_SCHEMA);
const configuration = {
  supersedes: {
    schemaVersion: "mlb-v4-expected-runs-training-v2",
    reason: "adds exact split-foundation/chronology binding and atomic OOS claim",
    oosOpened: false,
  },
  splitBinding: {
    splitVersion: MLB_224C_SPLIT_VERSION,
    splitFoundationHash: boundSplits[0]!.foundationChecksum,
    cohortBoundaries,
  },
  selected, candidateGrid: { ridge: [0, 1, 10], poisson: [0, 1, 10],
    nb2: isNb2OverdispersionJustified(trainRows) ? [.1, .25, .5] : [] },
  noNonlinearCandidate: "No justified deterministic dependency is installed",
  deterministicRebuild: { firstTrainingHash, rerunHash, mismatchCount },
  directionality: MLB_224C_FEATURE_DIRECTIONALITY, walkForwardFolds: folds.map((f) => ({
    id: f.id, trainCount: f.train.length, validationCount: f.validation.length,
    trainEnd: f.train.at(-1)?.date, validationStart: f.validation[0]?.date,
    metrics: selectedFoldReports.find((report) => report.id === f.id)!.metrics,
  })), failureFlags,
};
const transforms = finalModel.transform;
const parameters = {
  intercept: finalModel.intercept, coefficients: finalModel.coefficients,
  regularization: finalModel.regularization, alpha: finalModel.alpha,
  trainingRows: finalModel.trainingRows, iterations: finalModel.iterations, converged: finalModel.converged,
};
const distribution = { ...mapping.distribution, version: "independent-count-full-game-tie-split-v1" };
const calibrationArtifact = { ...mapping.calibration, version: `${mapping.calibration.kind}-v1` };
const hashes = {
  featureSchemaHash, configurationHash: stableLocalHash(configuration),
  transformsHash: stableLocalHash(transforms), parameterHash: stableLocalHash(parameters),
  calibrationHash: stableLocalHash(calibrationArtifact), distributionHash: stableLocalHash(distribution),
  selectionRuleHash: stableLocalHash(MLB_224C_SELECTION_RULE),
};
const artifactPayload = {
  schemaVersion: MLB_224C_SCHEMA_VERSION,
  modelId: MLB_224C_MODEL_ID, modelFamily: finalModel.modelFamily,
  trainingManifestHash: manifest.manifestHash, ...hashes,
};
const artifactHash = stableLocalHash(artifactPayload);
const modelVersion = `224c-v3-${artifactHash.slice(0, 12)}`;
const lockPayload = {
  modelId: MLB_224C_MODEL_ID, modelVersion, artifactHash,
  trainingManifestHash: manifest.manifestHash, ...hashes, oosCohortHash: manifest.oosCohortHash,
  oosCount: manifest.oosOriginalGameCount, failureFlags,
};
const lockHash = stableLocalHash(lockPayload);
const now = new Date();
const forecastRows = [...train, ...validation].map((game, index) => {
  const forecast = finalForecasts[index]!;
  const base = {
    schemaVersion: MLB_224C_SCHEMA_VERSION, canonicalGameId: game.gameId,
    modelId: MLB_224C_MODEL_ID, modelVersion, cohort: game.cohort,
    featureSnapshotHash: game.featureSnapshotHash,
    homeExpectedRunsExact: forecast.home_expected_runs_exact.toFixed(10),
    awayExpectedRunsExact: forecast.away_expected_runs_exact.toFixed(10),
    projectedTotalExact: forecast.projected_total_exact.toFixed(10),
    projectedMarginExact: forecast.projected_margin_exact.toFixed(10),
    homeWinProbability: forecast.home_win_probability.toFixed(15),
    awayWinProbability: forecast.away_win_probability.toFixed(15),
    fairHomeMoneyline: forecast.fair_home_moneyline.toFixed(10),
    fairAwayMoneyline: forecast.fair_away_moneyline.toFixed(10),
    calibrationVersion: calibrationArtifact.version, distributionVersion: distribution.version,
    trainingManifestHash: manifest.manifestHash, parameterHash: hashes.parameterHash,
    calibrationHash: hashes.calibrationHash, distributionHash: hashes.distributionHash,
  };
  return { ...base, forecastGeneratedAt: now, forecastCutoff: new Date(game.forecastCutoff),
    forecastHash: stableLocalHash(base) };
});
const evaluationRow = (phase: "TRAIN" | "VALIDATION", games: DevelopmentGame[],
  metrics: ReturnType<typeof evaluateForecasts>, forecasts: typeof forecastRows) => {
  const base = {
    schemaVersion: MLB_224C_SCHEMA_VERSION, evaluationRunId: `224c-${phase.toLowerCase()}-v1`,
    modelId: MLB_224C_MODEL_ID, modelVersion, phase, cohort: phase, foldIdentity: "PRIMARY_CHRONOLOGICAL",
    gameCount: games.length, trainingManifestHash: manifest.manifestHash, modelArtifactHash: artifactHash,
    forecastSetHash: stableLocalHash([...forecasts]
      .sort((a, b) => a.canonicalGameId.localeCompare(b.canonicalGameId))
      .map((row) => row.forecastHash)),
    metrics: { runs: metrics.runs, probability: metrics.probability },
    segments: metrics.segments,
    baselines: { metrics: baselineMetrics, leagueMean: baseline.league, homeAway: baseline.homeAway,
      shrunkOffensePriorGames: 20, validationHomeAwayTotalMae: baselineTotalMae },
    integrity: { oosRead: false, starterLeakage: 0, marketLeakage: 0, targetLeakage: 0,
      numericalIssues: 0, failureFlags },
  };
  return { ...base, checksum: stableLocalHash(base), evaluatedAt: now };
};

await db.transaction(async (tx) => {
  await tx.insert(mlbHistoricalTrainingManifestsTable).values({
    schemaVersion: MLB_224C_SCHEMA_VERSION, ...manifest, sealedAt: now,
  });
  await tx.insert(mlbHistoricalModelArtifactsTable).values({
    schemaVersion: MLB_224C_SCHEMA_VERSION, artifactId: `224c-${artifactHash.slice(0, 16)}`,
    modelId: MLB_224C_MODEL_ID, modelVersion, modelState: "FROZEN_PRE_OOS",
    modelFamily: finalModel.modelFamily, objective: finalModel.objective,
    softwareVersion: "mlb-expected-runs-core-v1", randomSeed: null,
    trainingManifestHash: manifest.manifestHash, featureSchema: MLB_224C_FEATURE_SCHEMA,
    featureSchemaHash, configuration, configurationHash: hashes.configurationHash,
    transforms, transformsHash: hashes.transformsHash, parameters, parameterHash: hashes.parameterHash,
    calibration: calibrationArtifact, calibrationHash: hashes.calibrationHash,
    distribution, distributionHash: hashes.distributionHash, artifactHash, frozenAt: now,
  });
  await tx.insert(mlbHistoricalPreOosLocksTable).values({
    schemaVersion: MLB_224C_SCHEMA_VERSION, lockId: `224c-lock-${lockHash.slice(0, 16)}`,
    modelId: MLB_224C_MODEL_ID, modelVersion, modelState: "FROZEN_PRE_OOS",
    modelFamily: finalModel.modelFamily, modelArtifactHash: artifactHash,
    trainingManifestHash: manifest.manifestHash, featureSchema: MLB_224C_FEATURE_SCHEMA,
    featureSchemaHash, configuration, configurationHash: hashes.configurationHash,
    transforms, transformsHash: hashes.transformsHash, parameters, parameterHash: hashes.parameterHash,
    calibration: calibrationArtifact, calibrationHash: hashes.calibrationHash,
    distribution, distributionHash: hashes.distributionHash,
    selectionRule: MLB_224C_SELECTION_RULE, selectionRuleHash: hashes.selectionRuleHash,
    lockPayload, lockHash, lockedAt: now,
  });
  for (let offset = 0; offset < forecastRows.length; offset += 500) {
    await tx.insert(mlbHistoricalExpectedRunsForecastsTable).values(forecastRows.slice(offset, offset + 500));
  }
  await tx.insert(mlbHistoricalEvaluationRunsTable).values([
    evaluationRow("TRAIN", train, trainMetrics, forecastRows.slice(0, train.length)),
    evaluationRow("VALIDATION", validation, validationMetrics, forecastRows.slice(train.length)),
  ]);
});
console.log(JSON.stringify({ status: "FROZEN_PRE_OOS", modelVersion, artifactHash, lockHash,
  manifestHash: manifest.manifestHash, selected, failureFlags }, null, 2));