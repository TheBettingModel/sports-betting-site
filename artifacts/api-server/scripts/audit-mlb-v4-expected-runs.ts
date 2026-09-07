import { and, eq, sql } from "drizzle-orm";
import {
  db,
  mlbHistoricalEvaluationRunsTable,
  mlbHistoricalExpectedRunsForecastsTable,
  mlbHistoricalModelArtifactsTable,
  mlbHistoricalPreOosLocksTable,
  mlbHistoricalTrainingManifestsTable,
  mlbHistoricalGamesTable,
  mlbHistoricalSplitsTable,
} from "@workspace/db";
import { MLB_HISTORICAL_APPEND_ONLY_TABLES } from "../src/services/mlbHistoricalAppendOnly";
import {
  MLB_224C_COUNTS,
  MLB_224C_MODEL_ID,
  MLB_224C_SCHEMA_VERSION,
  MLB_224C_SELECTION_RULE,
  MLB_224C_SPLIT_VERSION,
  assertSealedSplitBinding,
} from "../src/services/mlbExpectedRuns224C";
import { fairAmericanOdds, stableLocalHash } from "../src/services/mlbV4ExpectedRuns";

const [manifests, artifacts, locks, forecasts, evaluations] = await Promise.all([
  db.select().from(mlbHistoricalTrainingManifestsTable)
    .where(eq(mlbHistoricalTrainingManifestsTable.schemaVersion, MLB_224C_SCHEMA_VERSION)),
  db.select().from(mlbHistoricalModelArtifactsTable)
    .where(and(eq(mlbHistoricalModelArtifactsTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
      eq(mlbHistoricalModelArtifactsTable.modelId, MLB_224C_MODEL_ID))),
  db.select().from(mlbHistoricalPreOosLocksTable)
    .where(and(eq(mlbHistoricalPreOosLocksTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
      eq(mlbHistoricalPreOosLocksTable.modelId, MLB_224C_MODEL_ID))),
  db.select().from(mlbHistoricalExpectedRunsForecastsTable)
    .where(and(eq(mlbHistoricalExpectedRunsForecastsTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
      eq(mlbHistoricalExpectedRunsForecastsTable.modelId, MLB_224C_MODEL_ID))),
  db.select().from(mlbHistoricalEvaluationRunsTable)
    .where(and(eq(mlbHistoricalEvaluationRunsTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
      eq(mlbHistoricalEvaluationRunsTable.modelId, MLB_224C_MODEL_ID))),
]);
const violations: Record<string, number> = {
  cardinality: 0, manifest: 0, lock: 0, chronology: 0, hashes: 0, forecasts: 0,
  metrics: 0, oos: 0, leakage: 0, appendOnly: 0, crossSport: 0,
};
const [sealedSplits, splitDates] = await Promise.all([
  db.select().from(mlbHistoricalSplitsTable)
    .where(eq(mlbHistoricalSplitsTable.splitVersion, MLB_224C_SPLIT_VERSION)),
  db.select({
    canonicalGameId: mlbHistoricalGamesTable.canonicalGameId,
    gameDate: mlbHistoricalGamesTable.gameDate,
  }).from(mlbHistoricalGamesTable)
    .where(eq(mlbHistoricalGamesTable.schemaVersion, "mlb-completion-chronology-v3")),
]);
try {
  const dates = new Map(splitDates.map((row) => [row.canonicalGameId, row.gameDate.toISOString()]));
  assertSealedSplitBinding(sealedSplits.map((row) => ({
    canonicalGameId: row.canonicalGameId,
    cohort: row.cohort as "TRAIN" | "VALIDATION" | "LOCKED_OOS",
    assignmentHash: row.assignmentHash,
    immutable: row.immutable,
    schemaVersion: row.schemaVersion,
    foundationChecksum: row.foundationChecksum,
    gameDate: dates.get(row.canonicalGameId) ?? "INVALID",
  })));
} catch {
  violations.manifest++;
}
if (manifests.length !== 1 || artifacts.length !== 1 || locks.length !== 1) violations.cardinality++;
const manifest = manifests[0];
const artifact = artifacts[0];
const lock = locks[0];
if (!manifest || manifest.trainGameCount !== MLB_224C_COUNTS.TRAIN
  || manifest.validationGameCount !== MLB_224C_COUNTS.VALIDATION
  || manifest.oosOriginalGameCount !== MLB_224C_COUNTS.LOCKED_OOS
  || manifest.oosEligibleGameCount !== MLB_224C_COUNTS.LOCKED_OOS
  || manifest.oosExcludedGameCount !== 0 || manifest.oosNewMemberCount !== 0
  || stableLocalHash(manifest.trainGameIds) !== manifest.trainCohortHash
  || stableLocalHash(manifest.validationGameIds) !== manifest.validationCohortHash
  || stableLocalHash(manifest.oosGameIds) !== manifest.oosCohortHash) violations.manifest++;
if (manifest) {
  const train = new Set(manifest.trainGameIds as string[]);
  const validation = new Set(manifest.validationGameIds as string[]);
  const oos = new Set(manifest.oosGameIds as string[]);
  if ([...train].some((id) => validation.has(id) || oos.has(id))
    || [...validation].some((id) => oos.has(id))) violations.manifest++;
}
if (!lock || !artifact || !manifest || lock.trainingManifestHash !== manifest.manifestHash
  || artifact.trainingManifestHash !== manifest.manifestHash
  || lock.modelArtifactHash !== artifact.artifactHash || artifact.frozenAt > lock.lockedAt
  || lock.selectionRuleHash !== stableLocalHash(MLB_224C_SELECTION_RULE)
  || lock.lockHash !== stableLocalHash(lock.lockPayload)
  || lock.featureSchemaHash !== stableLocalHash(lock.featureSchema)
  || lock.configurationHash !== stableLocalHash(lock.configuration)
  || lock.transformsHash !== stableLocalHash(lock.transforms)
  || lock.parameterHash !== stableLocalHash(lock.parameters)
  || lock.calibrationHash !== stableLocalHash(lock.calibration)
  || lock.distributionHash !== stableLocalHash(lock.distribution)) violations.lock++;

const idsByCohort = manifest ? {
  TRAIN: new Set(manifest.trainGameIds as string[]),
  VALIDATION: new Set(manifest.validationGameIds as string[]),
  LOCKED_OOS: new Set(manifest.oosGameIds as string[]),
} : null;
for (const row of forecasts) {
  const cohort = row.cohort as keyof NonNullable<typeof idsByCohort>;
  if (!idsByCohort?.[cohort]?.has(row.canonicalGameId)) violations.forecasts++;
  const home = Number(row.homeExpectedRunsExact), away = Number(row.awayExpectedRunsExact);
  const total = Number(row.projectedTotalExact), margin = Number(row.projectedMarginExact);
  const hp = Number(row.homeWinProbability), ap = Number(row.awayWinProbability);
  if (![home, away, total, margin, hp, ap].every(Number.isFinite)
    || Math.abs(total - home - away) > 1e-9 || Math.abs(margin - home + away) > 1e-9
    || Math.abs(hp + ap - 1) > 1e-12 || hp <= 0 || hp >= 1
    || Math.abs(Number(row.fairHomeMoneyline) - fairAmericanOdds(hp)) > 1e-7
    || Math.abs(Number(row.fairAwayMoneyline) - fairAmericanOdds(ap)) > 1e-7) violations.forecasts++;
  const base = {
    schemaVersion: row.schemaVersion, canonicalGameId: row.canonicalGameId,
    modelId: row.modelId, modelVersion: row.modelVersion, cohort: row.cohort,
    featureSnapshotHash: row.featureSnapshotHash,
    homeExpectedRunsExact: row.homeExpectedRunsExact, awayExpectedRunsExact: row.awayExpectedRunsExact,
    projectedTotalExact: row.projectedTotalExact, projectedMarginExact: row.projectedMarginExact,
    homeWinProbability: row.homeWinProbability, awayWinProbability: row.awayWinProbability,
    fairHomeMoneyline: row.fairHomeMoneyline, fairAwayMoneyline: row.fairAwayMoneyline,
    calibrationVersion: row.calibrationVersion, distributionVersion: row.distributionVersion,
    trainingManifestHash: row.trainingManifestHash, parameterHash: row.parameterHash,
    calibrationHash: row.calibrationHash, distributionHash: row.distributionHash,
  };
  if (stableLocalHash(base) !== row.forecastHash) violations.hashes++;
}
if (manifest) {
  const expectedDevelopment = manifest.trainGameCount + manifest.validationGameCount;
  const development = forecasts.filter((row) => row.cohort !== "LOCKED_OOS");
  const oos = forecasts.filter((row) => row.cohort === "LOCKED_OOS");
  if (development.length !== expectedDevelopment
    || (oos.length !== 0 && oos.length !== manifest.oosOriginalGameCount)) violations.cardinality++;
  if (oos.some((row) => row.forecastGeneratedAt < lock!.lockedAt)) violations.chronology++;
}
for (const evaluation of evaluations) {
  const matching = forecasts.filter((row) => row.cohort === evaluation.cohort)
    .sort((a, b) => a.canonicalGameId.localeCompare(b.canonicalGameId));
  if (matching.length !== evaluation.gameCount
    || stableLocalHash(matching.map((row) => row.forecastHash)) !== evaluation.forecastSetHash) violations.metrics++;
}
const oosRuns = evaluations.filter((row) => row.phase === "LOCKED_OOS");
if (oosRuns.length > 1 || (forecasts.some((row) => row.cohort === "LOCKED_OOS") && oosRuns.length !== 1)) {
  violations.oos++;
}
const forbidden = /starter|pitcher.?identity|moneyline|run.?line|spread|sportsbook|pinnacle|odds|market|consensus|implied.?probability|\bclv\b|actual.?runs|final.?score/i;
if (forbidden.test(JSON.stringify({
  featureSchema: lock?.featureSchema, transforms: lock?.transforms,
  parameters: lock?.parameters,
}))) violations.leakage++;
if (forecasts.some((row) => !row.modelId.startsWith("tbm-mlb-"))) violations.crossSport++;

const guardNames = MLB_HISTORICAL_APPEND_ONLY_TABLES.flatMap((table) =>
  [`${table}_block_row_mutation`, `${table}_block_truncate`]);
const triggerResult = await db.execute(sql<{ tgname: string }>`
  select tgname from pg_trigger
  where not tgisinternal
`);
const actualGuards = new Set(triggerResult.rows.map((row) => row.tgname));
violations.appendOnly = guardNames.filter((name) => !actualGuards.has(name)).length;
const status = Object.values(violations).every((count) => count === 0) ? "PASS" : "FAIL";
console.log(JSON.stringify({
  task: "224C", status, modelVersion: lock?.modelVersion ?? null,
  counts: { manifests: manifests.length, artifacts: artifacts.length, locks: locks.length,
    forecasts: forecasts.length, evaluations: evaluations.length, oosRuns: oosRuns.length },
  violations,
  determinismHash: stableLocalHash({
    manifest: manifest?.manifestHash, artifact: artifact?.artifactHash, lock: lock?.lockHash,
    forecasts: forecasts.map((row) => row.forecastHash).sort(),
    evaluations: evaluations.map((row) => row.checksum).sort(),
  }),
}, null, 2));
if (status === "FAIL") process.exitCode = 1;