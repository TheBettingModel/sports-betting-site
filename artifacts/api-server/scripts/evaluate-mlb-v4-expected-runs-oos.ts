import { and, eq } from "drizzle-orm";
import {
  db,
  mlbHistoricalEvaluationRunsTable,
  mlbHistoricalExpectedRunsForecastsTable,
  mlbHistoricalModelArtifactsTable,
  mlbHistoricalPreOosLocksTable,
  mlbHistoricalTrainingManifestsTable,
  pool,
} from "@workspace/db";
import {
  MLB_224C_COUNTS,
  MLB_224C_MODEL_ID,
  MLB_224C_SCHEMA_VERSION,
  MLB_224C_SELECTION_RULE,
  evaluateForecasts,
  forecastGame,
  type FrozenMapping,
} from "../src/services/mlbExpectedRuns224C";
import {
  fitSimpleRunBaselines,
  runMetrics,
  stableLocalHash,
  type ExpectedRunsModel,
} from "../src/services/mlbV4ExpectedRuns";
import { loadCohortGames } from "./mlb-expected-runs-224c-data";

async function evaluateLockedOos(): Promise<void> {
const locks = await db.select().from(mlbHistoricalPreOosLocksTable)
  .where(and(eq(mlbHistoricalPreOosLocksTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
    eq(mlbHistoricalPreOosLocksTable.modelId, MLB_224C_MODEL_ID)));
if (locks.length !== 1) throw new Error("OOS evaluator requires exactly one persisted pre-OOS lock");
const lock = locks[0]!;
const [manifests, artifacts, priorEvaluations, priorForecasts, validationEvaluations] = await Promise.all([
  db.select().from(mlbHistoricalTrainingManifestsTable)
    .where(eq(mlbHistoricalTrainingManifestsTable.manifestHash, lock.trainingManifestHash)),
  db.select().from(mlbHistoricalModelArtifactsTable)
    .where(eq(mlbHistoricalModelArtifactsTable.artifactHash, lock.modelArtifactHash)),
  db.select().from(mlbHistoricalEvaluationRunsTable)
    .where(and(eq(mlbHistoricalEvaluationRunsTable.modelId, lock.modelId),
      eq(mlbHistoricalEvaluationRunsTable.modelVersion, lock.modelVersion),
      eq(mlbHistoricalEvaluationRunsTable.phase, "LOCKED_OOS"))),
  db.select().from(mlbHistoricalExpectedRunsForecastsTable)
    .where(and(eq(mlbHistoricalExpectedRunsForecastsTable.modelId, lock.modelId),
      eq(mlbHistoricalExpectedRunsForecastsTable.modelVersion, lock.modelVersion),
      eq(mlbHistoricalExpectedRunsForecastsTable.cohort, "LOCKED_OOS"))),
  db.select().from(mlbHistoricalEvaluationRunsTable)
    .where(and(eq(mlbHistoricalEvaluationRunsTable.modelId, lock.modelId),
      eq(mlbHistoricalEvaluationRunsTable.modelVersion, lock.modelVersion),
      eq(mlbHistoricalEvaluationRunsTable.phase, "VALIDATION"))),
]);
if (manifests.length !== 1 || artifacts.length !== 1 || validationEvaluations.length !== 1) {
  throw new Error("Locked manifest/model/validation artifact missing");
}
const manifest = manifests[0]!;
const artifact = artifacts[0]!;
if (lock.lockedAt > new Date() || artifact.frozenAt > lock.lockedAt
  || lock.modelState !== "FROZEN_PRE_OOS"
  || lock.selectionRuleHash !== stableLocalHash(MLB_224C_SELECTION_RULE)
  || lock.featureSchemaHash !== stableLocalHash(lock.featureSchema)
  || lock.configurationHash !== stableLocalHash(lock.configuration)
  || lock.transformsHash !== stableLocalHash(lock.transforms)
  || lock.parameterHash !== stableLocalHash(lock.parameters)
  || lock.calibrationHash !== stableLocalHash(lock.calibration)
  || lock.distributionHash !== stableLocalHash(lock.distribution)
  || manifest.oosOriginalGameCount !== MLB_224C_COUNTS.LOCKED_OOS
  || manifest.oosEligibleGameCount !== MLB_224C_COUNTS.LOCKED_OOS
  || manifest.oosExcludedGameCount !== 0 || manifest.oosNewMemberCount !== 0
  || stableLocalHash(manifest.oosGameIds) !== manifest.oosCohortHash) {
  throw new Error("Pre-OOS lock or sealed OOS membership failed verification");
}

if (priorEvaluations.length || priorForecasts.length) {
  if (priorEvaluations.length !== 1 || priorForecasts.length !== MLB_224C_COUNTS.LOCKED_OOS
    || priorEvaluations[0]!.gameCount !== MLB_224C_COUNTS.LOCKED_OOS
    || priorEvaluations[0]!.forecastSetHash !== stableLocalHash(
      priorForecasts.sort((a, b) => a.canonicalGameId.localeCompare(b.canonicalGameId))
        .map((row) => row.forecastHash))) {
    throw new Error("Prior OOS opening is partial or not exactly verifiable");
  }
  console.log(JSON.stringify({ status: "VERIFIED_EXISTING_OOS_EXACT", modelVersion: lock.modelVersion,
    gameCount: priorForecasts.length }, null, 2));
  return;
}

// The sole OOS feature/outcome read occurs only after every immutable lock check above.
const oosIds = manifest.oosGameIds as string[];
const games = await loadCohortGames(db, "LOCKED_OOS", oosIds);
if (games.length !== MLB_224C_COUNTS.LOCKED_OOS) throw new Error("OOS exclusions/replacements are forbidden");
const parameters = lock.parameters as {
  intercept: number; coefficients: number[]; regularization: number; alpha: number | null;
  trainingRows: number; iterations: number; converged: boolean;
};
const model: ExpectedRunsModel = {
  modelFamily: lock.modelFamily as ExpectedRunsModel["modelFamily"],
  featureSchema: lock.featureSchema as ExpectedRunsModel["featureSchema"],
  transform: lock.transforms as ExpectedRunsModel["transform"],
  ...parameters, objective: artifact.objective,
};
const calibration = lock.calibration as FrozenMapping["calibration"] & { version: string };
const distribution = lock.distribution as FrozenMapping["distribution"] & { version: string };
const mapping: FrozenMapping = { calibration, distribution };
const forecasts = games.map((game) => forecastGame(model, mapping, game));
const metrics = evaluateForecasts(games, forecasts);
const validationEvaluation = validationEvaluations[0]!;
const frozenBaselines = validationEvaluation.baselines as {
  leagueMean: number;
  homeAway: { home: number; away: number };
  shrunkOffensePriorGames: number;
};
if (!Number.isFinite(frozenBaselines.leagueMean)
  || !Number.isFinite(frozenBaselines.homeAway?.home)
  || !Number.isFinite(frozenBaselines.homeAway?.away)
  || !Number.isFinite(frozenBaselines.shrunkOffensePriorGames)) {
  throw new Error("Frozen development baseline parameters are invalid");
}
const baselineMetric = (predict: (game: typeof games[number]) => { home: number; away: number }) =>
  runMetrics(games.map((game) => {
    const predicted = predict(game);
    return {
      predictedHome: predicted.home, predictedAway: predicted.away,
      actualHome: game.homeRuns, actualAway: game.awayRuns,
    };
  }));
const baselineHelper = fitSimpleRunBaselines([{ homeRuns: frozenBaselines.homeAway.home,
  awayRuns: frozenBaselines.homeAway.away }]);
const baselineMetrics = {
  leagueMean: baselineMetric(() => ({ home: frozenBaselines.leagueMean, away: frozenBaselines.leagueMean })),
  homeAwayMean: baselineMetric(() => ({
    home: frozenBaselines.homeAway.home, away: frozenBaselines.homeAway.away,
  })),
  shrunkOffense: baselineMetric((game) => {
    const prediction = (side: "home" | "away") => {
      const features = game[side].ownOffense;
      const count = typeof features.seasonGames === "number" ? features.seasonGames : 0;
      const rate = typeof features.seasonRunsPerGame === "number" ? features.seasonRunsPerGame : 0;
      return baselineHelper.shrunkOffense(rate * count, count,
        frozenBaselines.shrunkOffensePriorGames, side);
    };
    return { home: prediction("home"), away: prediction("away") };
  }),
};
const validationMetrics = validationEvaluation.metrics as {
  runs: { total: { mae: number } };
};
const oosFailureFlags = {
  baselineRegression: metrics.runs.total.mae > baselineMetrics.homeAwayMean.total.mae,
  excessiveTotalBias: Math.abs(metrics.runs.total.bias) > .25,
  materialValidationCollapse: metrics.runs.total.mae - validationMetrics.runs.total.mae > .50,
  numericalIssues: 0,
};
const now = new Date();
const rows = games.map((game, i) => {
  const forecast = forecasts[i]!;
  const base = {
    schemaVersion: MLB_224C_SCHEMA_VERSION, canonicalGameId: game.gameId,
    modelId: lock.modelId, modelVersion: lock.modelVersion, cohort: "LOCKED_OOS",
    featureSnapshotHash: game.featureSnapshotHash,
    homeExpectedRunsExact: forecast.home_expected_runs_exact.toFixed(10),
    awayExpectedRunsExact: forecast.away_expected_runs_exact.toFixed(10),
    projectedTotalExact: forecast.projected_total_exact.toFixed(10),
    projectedMarginExact: forecast.projected_margin_exact.toFixed(10),
    homeWinProbability: forecast.home_win_probability.toFixed(15),
    awayWinProbability: forecast.away_win_probability.toFixed(15),
    fairHomeMoneyline: forecast.fair_home_moneyline.toFixed(10),
    fairAwayMoneyline: forecast.fair_away_moneyline.toFixed(10),
    calibrationVersion: calibration.version, distributionVersion: distribution.version,
    trainingManifestHash: lock.trainingManifestHash, parameterHash: lock.parameterHash,
    calibrationHash: lock.calibrationHash, distributionHash: lock.distributionHash,
  };
  return { ...base, forecastGeneratedAt: now, forecastCutoff: new Date(game.forecastCutoff),
    forecastHash: stableLocalHash(base) };
}).sort((a, b) => a.canonicalGameId.localeCompare(b.canonicalGameId));
const evaluationBase = {
  schemaVersion: MLB_224C_SCHEMA_VERSION, evaluationRunId: "224c-locked-oos-once-v3",
  modelId: lock.modelId, modelVersion: lock.modelVersion, phase: "LOCKED_OOS",
  cohort: "LOCKED_OOS", foldIdentity: "SEALED_2026_OOS", gameCount: games.length,
  trainingManifestHash: lock.trainingManifestHash, modelArtifactHash: lock.modelArtifactHash,
  forecastSetHash: stableLocalHash(rows.map((row) => row.forecastHash)),
  metrics: { runs: metrics.runs, probability: metrics.probability },
  segments: metrics.segments,
  baselines: { parameters: frozenBaselines, metrics: baselineMetrics },
  integrity: {
    openedOnce: true, original: MLB_224C_COUNTS.LOCKED_OOS, eligible: games.length,
    excluded: 0, replacements: 0, fitting: false, tuning: false,
    starterLeakage: 0, marketLeakage: 0, probabilitySumFailures: 0, numericalIssues: 0,
    failureFlags: oosFailureFlags,
  },
};
await db.transaction(async (tx) => {
  for (let offset = 0; offset < rows.length; offset += 500) {
    await tx.insert(mlbHistoricalExpectedRunsForecastsTable).values(rows.slice(offset, offset + 500));
  }
  await tx.insert(mlbHistoricalEvaluationRunsTable).values({
    ...evaluationBase, checksum: stableLocalHash(evaluationBase), evaluatedAt: now,
  });
});
console.log(JSON.stringify({ status: "LOCKED_OOS_OPENED_ONCE", modelVersion: lock.modelVersion,
  gameCount: games.length, metrics }, null, 2));
}

// A session-scoped advisory lock is acquired before any OOS existence check or
// feature/outcome read. Concurrent evaluators serialize here; the second sees
// the immutable completed run and exits without opening OOS again.
const claim = await pool.connect();
try {
  await claim.query("SELECT pg_advisory_lock(hashtext($1))", ["mlb-224c-locked-oos-open-once"]);
  await evaluateLockedOos();
} finally {
  await claim.query("SELECT pg_advisory_unlock(hashtext($1))", ["mlb-224c-locked-oos-open-once"])
    .catch(() => undefined);
  claim.release();
}