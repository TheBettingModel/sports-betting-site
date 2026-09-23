import { and, eq } from "drizzle-orm";
import {
  db,
  mlbHistoricalEvaluationRunsTable,
  mlbHistoricalExpectedRunsForecastsTable,
  mlbHistoricalModelArtifactsTable,
  mlbHistoricalPreOosLocksTable,
  mlbResearchExperimentDispositionLedgerTable,
} from "@workspace/db";
import {
  MLB_224C_MODEL_ID,
  MLB_224C_SCHEMA_VERSION,
} from "../src/services/mlbExpectedRuns224C";
import {
  failed224CResearchDisposition,
  MLB_224C_OOS_USE,
  MLB_224C_RESEARCH_DISPOSITION,
} from "../src/services/mlbStarterEvidence224C";

const [artifacts, locks, evaluations, forecasts] = await Promise.all([
  db.select().from(mlbHistoricalModelArtifactsTable).where(and(
    eq(mlbHistoricalModelArtifactsTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
    eq(mlbHistoricalModelArtifactsTable.modelId, MLB_224C_MODEL_ID),
  )),
  db.select().from(mlbHistoricalPreOosLocksTable).where(and(
    eq(mlbHistoricalPreOosLocksTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
    eq(mlbHistoricalPreOosLocksTable.modelId, MLB_224C_MODEL_ID),
  )),
  db.select().from(mlbHistoricalEvaluationRunsTable).where(and(
    eq(mlbHistoricalEvaluationRunsTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
    eq(mlbHistoricalEvaluationRunsTable.modelId, MLB_224C_MODEL_ID),
    eq(mlbHistoricalEvaluationRunsTable.phase, "LOCKED_OOS"),
  )),
  db.select({
    forecastHash: mlbHistoricalExpectedRunsForecastsTable.forecastHash,
  }).from(mlbHistoricalExpectedRunsForecastsTable).where(and(
    eq(mlbHistoricalExpectedRunsForecastsTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
    eq(mlbHistoricalExpectedRunsForecastsTable.modelId, MLB_224C_MODEL_ID),
    eq(mlbHistoricalExpectedRunsForecastsTable.cohort, "LOCKED_OOS"),
  )),
]);

if (artifacts.length !== 1 || locks.length !== 1 || evaluations.length !== 1 || forecasts.length !== 2_012) {
  throw new Error("Refusing to freeze #224C research state: authoritative v3 artifact cardinality mismatch");
}
const artifact = artifacts[0]!;
const lock = locks[0]!;
const evaluation = evaluations[0]!;
if (artifact.modelVersion !== "224c-v3-cadb433dbbd7"
  || artifact.artifactHash !== lock.modelArtifactHash
  || evaluation.modelVersion !== artifact.modelVersion
  || evaluation.gameCount !== 2_012) {
  throw new Error("Refusing to freeze #224C research state: authoritative v3 binding mismatch");
}

const disposition = failed224CResearchDisposition(evaluation.evaluatedAt, {
  modelId: artifact.modelId,
  modelVersion: artifact.modelVersion,
  schemaVersion: MLB_224C_SCHEMA_VERSION,
  modelArtifactHash: artifact.artifactHash,
  trainingManifestHash: artifact.trainingManifestHash,
  preOosLockHash: lock.lockHash,
  oosEvaluationRunId: evaluation.evaluationRunId,
  oosForecastSetHash: evaluation.forecastSetHash,
  oosForecastCount: forecasts.length,
  oosOpened: true,
  openedByModel: artifact.modelVersion,
  purpose: "FINAL_224C_EVALUATION",
  futureUse: MLB_224C_OOS_USE,
  immutableForecasts: true,
});
await db.insert(mlbResearchExperimentDispositionLedgerTable)
  .values(disposition)
  .onConflictDoNothing();

console.log(JSON.stringify({
  status: MLB_224C_RESEARCH_DISPOSITION,
  oosUse: MLB_224C_OOS_USE,
  modelVersion: artifact.modelVersion,
  checksum: disposition.checksum,
}, null, 2));