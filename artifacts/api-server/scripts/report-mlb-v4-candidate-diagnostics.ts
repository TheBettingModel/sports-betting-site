import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import {
  db,
  mlbHistoricalModelArtifactsTable,
  mlbHistoricalPreOosLocksTable,
  mlbHistoricalTrainingManifestsTable,
} from "@workspace/db";
import {
  MLB_224C_FEATURE_SCHEMA,
  MLB_224C_MODEL_ID,
  MLB_224C_SCHEMA_VERSION,
  chronologicalWalkForwardFolds,
  evaluateForecasts,
  forecastGame,
  selectCandidate,
  sideRows,
  type CandidateScore,
  type DevelopmentGame,
  type FrozenMapping,
} from "../src/services/mlbExpectedRuns224C";
import {
  MLB_V4_NB2_ALPHAS,
  MLB_V4_RIDGE_LAMBDAS,
  fitNb2ExpectedRunsFixed,
  fitPoissonExpectedRunsFixed,
  fitRidgeExpectedRunsFixed,
  isNb2OverdispersionJustified,
  stableLocalHash,
} from "../src/services/mlbV4ExpectedRuns";
import { loadCohortGames } from "./mlb-expected-runs-224c-data";

type Spec = { family: CandidateScore["family"]; lambda: 0 | 1 | 10; alpha: .1 | .25 | .5 | null };
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const outputPath = resolve(root, "reports/mlb-v4-expected-runs-candidates-v3.json");
const identityPoisson: FrozenMapping = {
  distribution: { kind: "poisson", alpha: null },
  calibration: { kind: "identity" },
};
const candidateId = (spec: Spec) => `${spec.family}-lambda-${spec.lambda}-alpha-${spec.alpha ?? "none"}`;
const fit = (spec: Spec, games: readonly DevelopmentGame[]) => {
  const rows = sideRows(games);
  if (spec.family === "ridge-linear") return fitRidgeExpectedRunsFixed(rows, MLB_224C_FEATURE_SCHEMA, spec.lambda);
  if (spec.family === "poisson") return fitPoissonExpectedRunsFixed(rows, MLB_224C_FEATURE_SCHEMA, spec.lambda);
  return fitNb2ExpectedRunsFixed(rows, MLB_224C_FEATURE_SCHEMA, spec.lambda, spec.alpha!);
};
const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not an object`);
  return value as Record<string, unknown>;
};
const sameNumber = (left: unknown, right: unknown, label: string) => {
  if (typeof left !== "number" || typeof right !== "number" || Math.abs(left - right) > 1e-12) {
    throw new Error(`Persisted selected ${label} mismatch`);
  }
};

// This reporting-only script reads the immutable v3 manifest/lock and loads
// development cohorts only. It intentionally has no LOCKED_OOS load path.
const [manifests, locks, artifacts] = await Promise.all([
  db.select().from(mlbHistoricalTrainingManifestsTable)
    .where(eq(mlbHistoricalTrainingManifestsTable.schemaVersion, MLB_224C_SCHEMA_VERSION)),
  db.select().from(mlbHistoricalPreOosLocksTable)
    .where(and(eq(mlbHistoricalPreOosLocksTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
      eq(mlbHistoricalPreOosLocksTable.modelId, MLB_224C_MODEL_ID))),
  db.select().from(mlbHistoricalModelArtifactsTable)
    .where(and(eq(mlbHistoricalModelArtifactsTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
      eq(mlbHistoricalModelArtifactsTable.modelId, MLB_224C_MODEL_ID))),
]);
if (manifests.length !== 1 || locks.length !== 1 || artifacts.length !== 1) {
  throw new Error("Candidate diagnostics requires exactly one v3 manifest, lock, and model artifact");
}
const manifest = manifests[0]!;
const lock = locks[0]!;
const artifact = artifacts[0]!;
if (manifest.manifestHash !== lock.trainingManifestHash || artifact.artifactHash !== lock.modelArtifactHash
  || artifact.trainingManifestHash !== manifest.manifestHash) {
  throw new Error("Candidate diagnostics v3 manifest/lock/artifact binding mismatch");
}
const [train, validation] = await Promise.all([
  loadCohortGames(db, "TRAIN", manifest.trainGameIds),
  loadCohortGames(db, "VALIDATION", manifest.validationGameIds),
]);
const trainRows = sideRows(train);
const nb2Included = isNb2OverdispersionJustified(trainRows);
const specs: Spec[] = [
  ...MLB_V4_RIDGE_LAMBDAS.map((lambda) => ({ family: "ridge-linear" as const, lambda, alpha: null })),
  ...MLB_V4_RIDGE_LAMBDAS.map((lambda) => ({ family: "poisson" as const, lambda, alpha: null })),
  ...(nb2Included ? MLB_V4_NB2_ALPHAS.flatMap((alpha) =>
    MLB_V4_RIDGE_LAMBDAS.map((lambda) => ({ family: "nb2" as const, lambda, alpha }))) : []),
];
const folds = chronologicalWalkForwardFolds(train);
const scored: CandidateScore[] = [];
const candidates = specs.map((spec) => {
  const id = candidateId(spec);
  try {
    const model = fit(spec, train);
    const trainMetrics = evaluateForecasts(train, train.map((game) => forecastGame(model, identityPoisson, game)));
    const validationMetrics = evaluateForecasts(validation,
      validation.map((game) => forecastGame(model, identityPoisson, game)));
    const foldReports = folds.map((fold) => {
      const foldModel = fit(spec, fold.train);
      const metrics = evaluateForecasts(fold.validation,
        fold.validation.map((game) => forecastGame(foldModel, identityPoisson, game)));
      return { id: fold.id, trainingRows: foldModel.trainingRows, validationRows: fold.validation.length,
        converged: foldModel.converged, metrics };
    });
    const foldMae = foldReports.map((fold) => fold.metrics.runs.total.mae);
    const score: CandidateScore = {
      id, ...spec, totalMae: validationMetrics.runs.total.mae, totalBias: validationMetrics.runs.total.bias,
      brier: validationMetrics.probability.brier, logLoss: validationMetrics.probability.logLoss,
      ece: validationMetrics.probability.ece,
      worstFoldDegradation: Math.max(...foldMae.map((mae) => mae - validationMetrics.runs.total.mae)),
      integrityIssues: 0, numericalIssues: model.converged ? 0 : 1,
    };
    scored.push(score);
    return {
      modelId: id, family: spec.family, fixedHyperparameters: { lambda: spec.lambda, alpha: spec.alpha },
      probabilityMapping: identityPoisson, trainingRows: model.trainingRows, converged: model.converged,
      modelArtifactHash: stableLocalHash(model), error: null, score, trainMetrics, validationMetrics,
      folds: foldReports, stability: { worstFoldDegradation: score.worstFoldDegradation, foldTotalMae: foldMae },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const score: CandidateScore = {
      id, ...spec, totalMae: Number.MAX_VALUE, totalBias: Number.MAX_VALUE, brier: Number.MAX_VALUE,
      logLoss: Number.MAX_VALUE, ece: Number.MAX_VALUE, worstFoldDegradation: Number.MAX_VALUE,
      integrityIssues: 0, numericalIssues: 1,
    };
    scored.push(score);
    return {
      modelId: id, family: spec.family, fixedHyperparameters: { lambda: spec.lambda, alpha: spec.alpha },
      probabilityMapping: identityPoisson, trainingRows: null, converged: false, modelArtifactHash: null,
      error: message, score, trainMetrics: null, validationMetrics: null, folds: [],
      stability: { worstFoldDegradation: null, foldTotalMae: [] },
    };
  }
});
const selected = selectCandidate(scored);
const persistedConfiguration = asRecord(artifact.configuration, "persisted configuration");
const persistedSelected = asRecord(persistedConfiguration.selected, "persisted selected candidate");
if (persistedSelected.id !== selected.id || persistedSelected.family !== selected.family
  || persistedSelected.lambda !== selected.lambda || persistedSelected.alpha !== selected.alpha) {
  throw new Error("Persisted selected candidate ID/hyperparameters mismatch");
}
for (const key of ["totalMae", "totalBias", "brier", "logLoss", "ece", "worstFoldDegradation",
  "integrityIssues", "numericalIssues"] as const) sameNumber(persistedSelected[key], selected[key], key);

const base = {
  schemaVersion: MLB_224C_SCHEMA_VERSION,
  reportingOnly: true,
  oosInspected: false,
  manifestHash: manifest.manifestHash,
  persistedModelArtifactHash: artifact.artifactHash,
  lockHash: lock.lockHash,
  candidateGrid: { ridge: [...MLB_V4_RIDGE_LAMBDAS], poisson: [...MLB_V4_RIDGE_LAMBDAS],
    nb2: nb2Included ? [...MLB_V4_NB2_ALPHAS] : [], nb2OverdispersionJustified: nb2Included },
  probabilityMapping: identityPoisson,
  selected,
  candidates,
};
const diagnostics = { ...base, diagnosticsHash: stableLocalHash(base) };
await writeFile(outputPath, `${JSON.stringify(diagnostics as Json, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "CANDIDATE_DIAGNOSTICS_WRITTEN", output: "reports/mlb-v4-expected-runs-candidates-v3.json",
  diagnosticsHash: diagnostics.diagnosticsHash, selected: diagnostics.selected }, null, 2));