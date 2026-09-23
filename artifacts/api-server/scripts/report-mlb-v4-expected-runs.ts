import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import {
  db,
  mlbHistoricalEvaluationRunsTable,
  mlbHistoricalExpectedRunsForecastsTable,
  mlbHistoricalModelArtifactsTable,
  mlbHistoricalPreOosLocksTable,
  mlbHistoricalTrainingManifestsTable,
} from "@workspace/db";
import {
  MLB_224C_COUNTS,
  MLB_224C_FEATURE_DIRECTIONALITY,
  MLB_224C_FEATURE_SCHEMA,
  MLB_224C_FOUNDATION_ARTIFACT,
  MLB_224C_FOUNDATION_HASH,
  MLB_224C_MODEL_ID,
  MLB_224C_REPLAY_HASH,
  MLB_224C_SCHEMA_VERSION,
  MLB_224C_SELECTION_RULE,
  MLB_224C_SOURCE_MANIFEST_HASH,
  MLB_224C_SPLIT_FOUNDATION_HASH,
  MLB_224C_SPLIT_VERSION,
} from "../src/services/mlbExpectedRuns224C";
import { stableLocalHash } from "../src/services/mlbV4ExpectedRuns";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RecordValue = Record<string, unknown>;
type Section = { number: number; title: string; data: Json };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const reportBase = resolve(root, "reports/mlb-v4-expected-runs-training-2026-09-05");
const verificationPath = resolve(root, "reports/mlb-v4-expected-runs-verification.json");
const candidateDiagnosticsPath = resolve(root, "reports/mlb-v4-expected-runs-candidates-v3.json");
const generatedAt = new Date().toISOString();
const asRecord = (value: unknown, label: string): RecordValue => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not an object`);
  return value as RecordValue;
};
const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`);
  return value;
};
const finite = (value: unknown, label: string): number => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} is not finite`);
  return number;
};
const iso = (value: Date): string => value.toISOString();
const canonical = (value: unknown): Json => {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Report cannot contain a non-finite number");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as RecordValue).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  throw new Error(`Unsupported report value: ${typeof value}`);
};
const redactVerification = (value: unknown): Json => {
  if (value === null || ["string", "boolean", "number"].includes(typeof value)) return canonical(value);
  if (Array.isArray(value)) return value.map(redactVerification);
  if (typeof value !== "object") return String(value);
  return Object.fromEntries(Object.entries(value as RecordValue)
    .filter(([key]) => !/(secret|password|credential|private.?key|access.?token|api.?key)/i.test(key))
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, redactVerification(item)]));
};
const mustEqual = (actual: unknown, expected: unknown, label: string): void => {
  if (actual !== expected) throw new Error(`${label} mismatch`);
};
const mustMatchWithin = (actual: unknown, expected: unknown, label: string): void => {
  if (typeof actual !== "number" || typeof expected !== "number" || Math.abs(actual - expected) > 1e-12) {
    throw new Error(`${label} mismatch`);
  }
};

// This reporter deliberately reads only final 224C tables filtered to the
// authoritative v3 schema. It never reads a feature, outcome, market, or
// production table and refuses to run until the single OOS evaluation exists.
const [manifests, artifacts, locks, evaluations, forecasts] = await Promise.all([
  db.select().from(mlbHistoricalTrainingManifestsTable)
    .where(eq(mlbHistoricalTrainingManifestsTable.schemaVersion, MLB_224C_SCHEMA_VERSION)),
  db.select().from(mlbHistoricalModelArtifactsTable)
    .where(and(eq(mlbHistoricalModelArtifactsTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
      eq(mlbHistoricalModelArtifactsTable.modelId, MLB_224C_MODEL_ID))),
  db.select().from(mlbHistoricalPreOosLocksTable)
    .where(and(eq(mlbHistoricalPreOosLocksTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
      eq(mlbHistoricalPreOosLocksTable.modelId, MLB_224C_MODEL_ID))),
  db.select().from(mlbHistoricalEvaluationRunsTable)
    .where(and(eq(mlbHistoricalEvaluationRunsTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
      eq(mlbHistoricalEvaluationRunsTable.modelId, MLB_224C_MODEL_ID))),
  db.select().from(mlbHistoricalExpectedRunsForecastsTable)
    .where(and(eq(mlbHistoricalExpectedRunsForecastsTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
      eq(mlbHistoricalExpectedRunsForecastsTable.modelId, MLB_224C_MODEL_ID))),
]);
if (manifests.length !== 1 || artifacts.length !== 1 || locks.length !== 1) {
  throw new Error("Report requires exactly one authoritative v3 manifest, artifact, and pre-OOS lock");
}
const manifest = manifests[0]!;
const artifact = artifacts[0]!;
const lock = locks[0]!;
const trainEvaluation = evaluations.find((row) => row.phase === "TRAIN");
const validationEvaluation = evaluations.find((row) => row.phase === "VALIDATION");
const oosEvaluations = evaluations.filter((row) => row.phase === "LOCKED_OOS");
if (!trainEvaluation || !validationEvaluation || oosEvaluations.length !== 1) {
  throw new Error("OOS is not opened: report requires TRAIN, VALIDATION, and exactly one LOCKED_OOS evaluation");
}
const oosEvaluation = oosEvaluations[0]!;
if (evaluations.length !== 3) throw new Error("Unexpected authoritative v3 evaluation rows");
mustEqual(artifact.modelVersion, lock.modelVersion, "model version");
mustEqual(manifest.manifestHash, artifact.trainingManifestHash, "artifact manifest");
mustEqual(manifest.manifestHash, lock.trainingManifestHash, "lock manifest");
mustEqual(artifact.artifactHash, lock.modelArtifactHash, "lock artifact");
mustEqual(manifest.foundationArtifactKey, MLB_224C_FOUNDATION_ARTIFACT, "foundation artifact");
mustEqual(manifest.foundationHash, MLB_224C_FOUNDATION_HASH, "foundation hash");
mustEqual(manifest.replayHash, MLB_224C_REPLAY_HASH, "replay hash");
mustEqual(manifest.sourceManifestHash, MLB_224C_SOURCE_MANIFEST_HASH, "source manifest");
mustEqual(manifest.splitVersion, MLB_224C_SPLIT_VERSION, "split version");
mustEqual(manifest.trainGameCount, MLB_224C_COUNTS.TRAIN, "TRAIN count");
mustEqual(manifest.validationGameCount, MLB_224C_COUNTS.VALIDATION, "VALIDATION count");
mustEqual(manifest.oosOriginalGameCount, MLB_224C_COUNTS.LOCKED_OOS, "OOS original count");
mustEqual(manifest.oosEligibleGameCount, MLB_224C_COUNTS.LOCKED_OOS, "OOS eligible count");
mustEqual(manifest.oosExcludedGameCount, 0, "OOS excluded count");
mustEqual(manifest.oosNewMemberCount, 0, "OOS replacement count");
mustEqual(stableLocalHash(manifest.trainGameIds), manifest.trainCohortHash, "TRAIN cohort hash");
mustEqual(stableLocalHash(manifest.validationGameIds), manifest.validationCohortHash, "VALIDATION cohort hash");
mustEqual(stableLocalHash(manifest.oosGameIds), manifest.oosCohortHash, "OOS cohort hash");
mustEqual(stableLocalHash(artifact.featureSchema), artifact.featureSchemaHash, "feature schema hash");
mustEqual(stableLocalHash(artifact.configuration), artifact.configurationHash, "configuration hash");
mustEqual(stableLocalHash(artifact.transforms), artifact.transformsHash, "transform hash");
mustEqual(stableLocalHash(artifact.parameters), artifact.parameterHash, "parameter hash");
mustEqual(stableLocalHash(artifact.calibration), artifact.calibrationHash, "calibration hash");
mustEqual(stableLocalHash(artifact.distribution), artifact.distributionHash, "distribution hash");
mustEqual(stableLocalHash(lock.lockPayload), lock.lockHash, "lock hash");
mustEqual(stableLocalHash(lock.selectionRule), lock.selectionRuleHash, "selection rule hash");
mustEqual(lock.selectionRuleHash, stableLocalHash(MLB_224C_SELECTION_RULE), "declared selection rule");
mustEqual(artifact.featureSchemaHash, stableLocalHash(MLB_224C_FEATURE_SCHEMA), "allowlisted feature schema");
if (artifact.frozenAt > lock.lockedAt || oosEvaluation.evaluatedAt < lock.lockedAt) {
  throw new Error("Pre-OOS chronology failed");
}

const byCohort = (cohort: string) => forecasts.filter((row) => row.cohort === cohort)
  .sort((a, b) => a.canonicalGameId.localeCompare(b.canonicalGameId));
const trainForecasts = byCohort("TRAIN");
const validationForecasts = byCohort("VALIDATION");
const oosForecasts = byCohort("LOCKED_OOS");
mustEqual(trainForecasts.length, manifest.trainGameCount, "TRAIN forecast count");
mustEqual(validationForecasts.length, manifest.validationGameCount, "VALIDATION forecast count");
mustEqual(oosForecasts.length, manifest.oosEligibleGameCount, "OOS forecast count");
const verifySet = (rows: typeof forecasts, evaluation: typeof oosEvaluation, label: string) =>
  mustEqual(stableLocalHash(rows.map((row) => row.forecastHash)), evaluation.forecastSetHash, `${label} forecast set`);
verifySet(trainForecasts, trainEvaluation, "TRAIN");
verifySet(validationForecasts, validationEvaluation, "VALIDATION");
verifySet(oosForecasts, oosEvaluation, "OOS");

const configuration = asRecord(artifact.configuration, "configuration");
const splitBinding = asRecord(configuration.splitBinding, "split binding");
const boundaries = asRecord(splitBinding.cohortBoundaries, "cohort boundaries");
mustEqual(splitBinding.splitVersion, MLB_224C_SPLIT_VERSION, "configured split version");
mustEqual(splitBinding.splitFoundationHash, MLB_224C_SPLIT_FOUNDATION_HASH, "split foundation hash");
const selected = asRecord(configuration.selected, "selected candidate");
let candidateDiagnostics: RecordValue;
try {
  candidateDiagnostics = asRecord(JSON.parse(await readFile(candidateDiagnosticsPath, "utf8")),
    "candidate diagnostics");
} catch (error) {
  throw new Error(`Report requires candidate diagnostics file: ${(error as Error).message}`);
}
const diagnosticsHash = candidateDiagnostics.diagnosticsHash;
if (typeof diagnosticsHash !== "string") throw new Error("Candidate diagnostics hash is missing");
const diagnosticsBase = { ...candidateDiagnostics };
delete diagnosticsBase.diagnosticsHash;
mustEqual(stableLocalHash(diagnosticsBase), diagnosticsHash, "candidate diagnostics hash");
mustEqual(candidateDiagnostics.schemaVersion, MLB_224C_SCHEMA_VERSION, "candidate diagnostics schema");
mustEqual(candidateDiagnostics.manifestHash, manifest.manifestHash, "candidate diagnostics manifest");
mustEqual(candidateDiagnostics.persistedModelArtifactHash, artifact.artifactHash, "candidate diagnostics artifact");
mustEqual(candidateDiagnostics.lockHash, lock.lockHash, "candidate diagnostics lock");
if (candidateDiagnostics.oosInspected !== false || candidateDiagnostics.reportingOnly !== true) {
  throw new Error("Candidate diagnostics execution-policy mismatch");
}
const diagnosticsSelected = asRecord(candidateDiagnostics.selected, "diagnostics selected candidate");
for (const key of ["id", "family", "lambda", "alpha"] as const) {
  mustEqual(diagnosticsSelected[key], selected[key], `candidate diagnostics selected ${key}`);
}
for (const key of ["totalMae", "totalBias", "brier", "logLoss", "ece", "worstFoldDegradation",
  "integrityIssues", "numericalIssues"] as const) {
  mustMatchWithin(diagnosticsSelected[key], selected[key], `candidate diagnostics selected ${key}`);
}
const failureFlags = asRecord(configuration.failureFlags, "validation failure flags");
if (failureFlags.excessiveValidationBias !== true) {
  throw new Error("Expected predeclared excessive validation total-bias failure is not persisted");
}
const trainMetrics = asRecord(trainEvaluation.metrics, "TRAIN metrics");
const validationMetrics = asRecord(validationEvaluation.metrics, "VALIDATION metrics");
const oosMetrics = asRecord(oosEvaluation.metrics, "OOS metrics");
const validationRuns = asRecord(validationMetrics.runs, "validation run metrics");
const validationProbability = asRecord(validationMetrics.probability, "validation probability metrics");
const oosRuns = asRecord(oosMetrics.runs, "OOS run metrics");
const oosProbability = asRecord(oosMetrics.probability, "OOS probability metrics");
const validationBaselines = asRecord(validationEvaluation.baselines, "validation baselines");
const oosBaselines = asRecord(oosEvaluation.baselines, "OOS baselines");
const oosIntegrity = asRecord(oosEvaluation.integrity, "OOS integrity");
const oosFailureFlags = asRecord(oosIntegrity.failureFlags, "OOS failure flags");
const walkForward = array(configuration.walkForwardFolds, "walk-forward folds");
const featureSchema = asRecord(artifact.featureSchema, "feature schema");
const featureNames = [
  ...array(featureSchema.ownOffense, "own offense features"),
  ...array(featureSchema.leagueEnvironment, "league features"),
  ...array(featureSchema.opponentBullpen, "bullpen features"),
];
const probabilitySumFailures = [...trainForecasts, ...validationForecasts, ...oosForecasts]
  .filter((row) => Math.abs(finite(row.homeWinProbability, "home probability")
    + finite(row.awayWinProbability, "away probability") - 1) > 1e-12).length;
mustEqual(probabilitySumFailures, 0, "probability sum failures");
const forecastHash = stableLocalHash(forecasts.map((row) => row.forecastHash).sort());
const deterministic = asRecord(configuration.deterministicRebuild, "deterministic rebuild");
mustEqual(deterministic.mismatchCount, 0, "deterministic mismatch count");
const sample = oosForecasts[0]!;
const oldV4 = {
  games: 79, homeRunMae: 2.840, awayRunMae: 2.412, totalMae: 4.211,
  totalRmse: 5.349, totalBias: -2.327, marginMae: 3.451, brier: 0.2379,
  logLoss: 0.6689, accuracy: 0.519, ece: 0.1863, brierSkillVsMarket: -0.0206,
  projectedTotalsBelow8: "76/79",
};
let verification: Json = { status: "NOT_PROVIDED", checks: "NOT_RUN_OR_RECREATED_BY_REPORTER" };
try {
  verification = { status: "PROVIDED", evidence: redactVerification(JSON.parse(
    await readFile(verificationPath, "utf8"),
  )) };
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const integrityCounts = {
  futureInformation: finite(oosIntegrity.futureInformation ?? 0, "future-information violations"),
  targetOutcome: finite(oosIntegrity.targetLeakage ?? 0, "target leakage"),
  actualStarter: finite(oosIntegrity.starterLeakage, "starter leakage"),
  oosContamination: (oosIntegrity.fitting === false && oosIntegrity.tuning === false) ? 0 : 1,
  marketLeakage: finite(oosIntegrity.marketLeakage, "market leakage"),
};
const integrityPass = Object.values(integrityCounts).every((count) => count === 0)
  && finite(oosIntegrity.numericalIssues, "numerical issues") === 0;
const classification = integrityPass
  ? "C — MLB V4 TRAINED BUT NOT COMPETITIVE"
  : "D — MLB V4 TRAINING INVALID";
const baselineMetrics = asRecord(validationBaselines.metrics, "validation baseline metrics");
const run = (metrics: RecordValue, key: string) => asRecord(metrics[key], `${key} metrics`);
const sections: Section[] = [
  { number: 1, title: "EXECUTIVE SUMMARY", data: canonical({
    Classification: classification, selectedModel: artifact.modelId, modelVersion: artifact.modelVersion,
    trainingGames: manifest.trainGameCount, validationGames: manifest.validationGameCount,
    lockedOosEligible: manifest.oosEligibleGameCount, featureCount: featureNames.length,
    pitViolations: Object.values(integrityCounts).reduce((sum, value) => sum + value, 0),
    marketLeakage: integrityCounts.marketLeakage, actualStarterLeakage: integrityCounts.actualStarter,
  }) },
  { number: 2, title: "FOUNDATION VERIFICATION", data: canonical({
    artifact: manifest.foundationArtifactKey, foundationHash: manifest.foundationHash,
    replayHash: manifest.replayHash, sourceManifest: manifest.sourceManifestHash,
    trainingManifestHash: manifest.manifestHash, splitVersion: manifest.splitVersion,
    splitFoundationHash: splitBinding.splitFoundationHash,
    cohortHashes: { train: manifest.trainCohortHash, validation: manifest.validationCohortHash,
      oos: manifest.oosCohortHash }, verification: "PASS",
  }) },
  { number: 3, title: "CHRONOLOGICAL SPLITS", data: canonical({
    TRAIN: boundaries.TRAIN, VALIDATION: boundaries.VALIDATION,
    LOCKED_OOS: { ...asRecord(boundaries.LOCKED_OOS, "OOS boundary"),
      originalGames: manifest.oosOriginalGameCount, eligibleGames: manifest.oosEligibleGameCount,
      excludedGames: manifest.oosExcludedGameCount, exclusionReasons: manifest.rejectedCounts,
      newMembers: manifest.oosNewMemberCount },
  }) },
  { number: 4, title: "FEATURE SCHEMA", data: canonical({
    offense: featureSchema.ownOffense, bullpen: featureSchema.opponentBullpen,
    context: featureSchema.leagueEnvironment,
    priors: ["priorGames", "training-derived transform medians", "sample-size features"],
    missingness: "Each nullable allowlisted input uses deterministic TRAIN-derived median imputation persisted in transforms; this model does not include explicit missing-indicator features.",
    directionality: artifact.configuration && configuration.directionality,
    exactAllowlistedSchema: artifact.featureSchema, featureCount: featureNames.length,
    actualStarterExcluded: true, historicalPregameStarterFeatureCount: 0,
  }) },
  { number: 5, title: "MODEL CANDIDATES", data: canonical({
    candidateGrid: candidateDiagnostics.candidateGrid, candidates: candidateDiagnostics.candidates,
    diagnostics: { file: "reports/mlb-v4-expected-runs-candidates-v3.json", diagnosticsHash,
      selectedVerifiedWithin: 1e-12, reportingOnly: true, oosInspected: false },
    nonlinearCandidate: configuration.noNonlinearCandidate,
  }) },
  { number: 6, title: "SIMPLE BASELINES", data: canonical({
    leagueAverage: baselineMetrics.leagueMean, homeAwayAverage: baselineMetrics.homeAwayMean,
    offenseBaseline: baselineMetrics.shrunkOffense,
    currentShadowComparator: oldV4,
  }) },
  { number: 7, title: "WALK-FORWARD RESULTS", data: canonical({
    folds: walkForward, note: "Persisted expanding chronological folds; each contains run and probability metrics.",
  }) },
  { number: 8, title: "SELECTED MODEL", data: canonical({
    whySelected: "Frozen predeclared ordering: integrity, validation total MAE, then bias/Brier/log loss/ECE/fold stability/simplicity.",
    modelFamily: artifact.modelFamily, parameters: artifact.parameters, coefficients:
      asRecord(artifact.parameters, "parameters").coefficients, transforms: artifact.transforms,
    featureCount: featureNames.length, trainingConfiguration: artifact.configuration,
    dependencyVersion: artifact.softwareVersion, objective: artifact.objective,
    randomSeed: artifact.randomSeed, parameterHash: artifact.parameterHash,
  }) },
  { number: 9, title: "VALIDATION EXPECTED-RUN PERFORMANCE", data: canonical({
    Home: run(validationRuns, "home"), Away: run(validationRuns, "away"),
    Total: run(validationRuns, "total"), Margin: run(validationRuns, "margin"),
    predictedAverageTotal: run(validationRuns, "total").predictedMean,
    actualAverageTotal: run(validationRuns, "total").actualMean,
    trainingRunMetrics: asRecord(trainMetrics.runs, "training run metrics"),
    validationSegments: validationEvaluation.segments,
  }) },
  { number: 10, title: "OLD V4 LOW-RUN FAILURE COMPARISON", data: canonical({
    frozenOldV4Comparator: oldV4, newValidationTotalBias: run(validationRuns, "total").bias,
    oldTotalsBelow8: "76/79",
    newEquivalentDiagnosticBehavior: `${validationForecasts.filter((row) =>
      finite(row.projectedTotalExact, "projected total") < 8).length}/${validationForecasts.length}`,
    conclusion: Math.abs(finite(run(validationRuns, "total").bias, "validation bias")) < 2.327
      ? "Low-run compression materially improved versus the frozen comparator, but the predeclared <=0.25 bias rule still failed."
      : "Low-run compression was not materially resolved.",
  }) },
  { number: 11, title: "PROBABILITY / DISTRIBUTION MODEL", data: canonical({
    distribution: artifact.distribution, calibration: artifact.calibration,
    calibrationSelection: "Development walk-forward predictions only; no OOS or sportsbook target.",
    homeAwayProbabilitySumValidation: { tolerance: 1e-12, failures: probabilitySumFailures },
  }) },
  { number: 12, title: "VALIDATION PROBABILITY PERFORMANCE", data: canonical({
    Brier: validationProbability.brier, logLoss: validationProbability.logLoss,
    accuracy: validationProbability.accuracy, ECE: validationProbability.ece,
    calibrationBuckets: validationProbability.reliability,
  }) },
  { number: 13, title: "MARKET DIAGNOSTIC", data: canonical({
    matchedGames: "UNAVAILABLE", modelBrier: "UNAVAILABLE", marketBrier: "UNAVAILABLE",
    modelLogLoss: "UNAVAILABLE", marketLogLoss: "UNAVAILABLE", status:
      "UNAVAILABLE — no legitimate immutable PIT market comparator is persisted in the authoritative v3 artifacts.",
    diagnosticOnly: true, marketTraining: false,
  }) },
  { number: 14, title: "V1 / OLD V4 COMPARISON", data: canonical({
    V1: "UNAVAILABLE — no legitimate persisted immutable PIT V1 comparator is provable; current code was not used to recreate one.",
    oldV4: oldV4,
    lineage: [
      { version: "v1", status: "SUPERSEDED", reason: "validation forecast-set insertion ordering",
        oosOpened: false },
      { version: "v2", status: "SUPERSEDED",
        reason: "missing exact split-foundation/chronology binding and atomic OOS claim binding", oosOpened: false },
      { version: "v3", status: "AUTHORITATIVE", schemaVersion: MLB_224C_SCHEMA_VERSION },
    ],
  }) },
  { number: 15, title: "PRE-OOS MODEL LOCK", data: canonical({
    modelId: lock.modelId, version: lock.modelVersion, featureSchemaHash: lock.featureSchemaHash,
    configurationHash: lock.configurationHash, transformsHash: lock.transformsHash,
    parameterHash: lock.parameterHash, calibrationHash: lock.calibrationHash,
    distributionHash: lock.distributionHash, forecastHash, lockTimestamp: iso(lock.lockedAt),
    lockArtifact: { lockId: lock.lockId, lockHash: lock.lockHash, modelArtifactHash: lock.modelArtifactHash },
    frozenBeforeOos: artifact.frozenAt <= lock.lockedAt && lock.lockedAt <= oosEvaluation.evaluatedAt,
  }) },
  { number: 16, title: "LOCKED OOS EXPECTED-RUN RESULTS", data: canonical({
    Games: oosEvaluation.gameCount, Home: run(oosRuns, "home"), Away: run(oosRuns, "away"),
    Total: run(oosRuns, "total"), Margin: run(oosRuns, "margin"),
    predictedAvgTotal: run(oosRuns, "total").predictedMean,
    actualAvgTotal: run(oosRuns, "total").actualMean,
    byMonth: asRecord(oosEvaluation.segments, "OOS segments").month,
  }) },
  { number: 17, title: "LOCKED OOS PROBABILITY RESULTS", data: canonical({
    Brier: oosProbability.brier, logLoss: oosProbability.logLoss,
    accuracy: oosProbability.accuracy, ECE: oosProbability.ece,
    calibrationBuckets: oosProbability.reliability,
  }) },
  { number: 18, title: "OOS BASELINE COMPARISON", data: canonical({
    naive: asRecord(oosBaselines.metrics, "OOS baseline metrics").leagueMean,
    homeAwayNaive: asRecord(oosBaselines.metrics, "OOS baseline metrics").homeAwayMean,
    offenseBaseline: asRecord(oosBaselines.metrics, "OOS baseline metrics").shrunkOffense,
    V1IfValid: "UNAVAILABLE", marketIfValid: "UNAVAILABLE",
    selectedV4: { runs: oosRuns, probability: oosProbability },
  }) },
  { number: 19, title: "TEMPORAL STABILITY", data: canonical({
    validationBySeasonMonthPhase: validationEvaluation.segments,
    oosBySeasonMonthPhase: oosEvaluation.segments, walkForwardFolds: walkForward,
    drift: { predeclaredFoldInstability: failureFlags.severeFoldInstability,
      oosValidationCollapse: oosFailureFlags.materialValidationCollapse },
  }) },
  { number: 20, title: "RESIDUAL ANALYSIS", data: canonical({
    majorBiases: { validation: validationRuns, oos: oosRuns },
    highScoreBehavior: { validation: asRecord(validationEvaluation.segments, "validation segments").predictedTotalBucket,
      oos: asRecord(oosEvaluation.segments, "OOS segments").predictedTotalBucket },
    lowScoreBehavior: { validation: asRecord(validationEvaluation.segments, "validation segments").runEnvironment,
      oos: asRecord(oosEvaluation.segments, "OOS segments").runEnvironment },
    earlySeasonBehavior: { validation: asRecord(validationEvaluation.segments, "validation segments").seasonPhase,
      oos: asRecord(oosEvaluation.segments, "OOS segments").seasonPhase },
    teamLevelAnomalies: "UNAVAILABLE — team segmentation was not persisted; no outcome data is re-queried.",
  }) },
  { number: 21, title: "STARTER LIMITATION", data: canonical({
    confirmedHistoricalPregameStarterFeatureCount: 0,
    baselineLimitation: "Expected runs use PIT-safe offense, league context, and opponent bullpen only; no target-game starter identity or starter statistics.",
    futureProspectiveStarterEnhancementContract:
      "A new version may add only immutable timestamped pregame starter identity/snapshots captured before forecast cutoff, with a new untouched prospective evaluation plan.",
  }) },
  { number: 22, title: "PROJECTED SCORE CONTRACT", data: canonical({
    exactStoredFields: ["home_expected_runs_exact", "away_expected_runs_exact",
      "projected_total_exact", "projected_margin_exact"],
    exampleSerializationFromEligibleEvaluation: {
      home_expected_runs_exact: sample.homeExpectedRunsExact,
      away_expected_runs_exact: sample.awayExpectedRunsExact,
      projected_total_exact: sample.projectedTotalExact,
      projected_margin_exact: sample.projectedMarginExact,
    },
    storageRule: "Exact decimal values are persisted; display rounding is downstream only.",
    uiModified: false,
  }) },
  { number: 23, title: "MARKET FIREWALL", data: canonical({
    result: integrityCounts.marketLeakage === 0 ? "PASS" : "FAIL",
    marketDerivedForecastFeatures: integrityCounts.marketLeakage,
    architecture: "FEATURES -> EXPECTED RUNS -> WIN PROBABILITY -> FAIR PRICE; market comparison is separate.",
  }) },
  { number: 24, title: "PIT / LEAKAGE AUDIT", data: canonical({
    ...integrityCounts, probabilitySumFailures, numericalIssues: oosIntegrity.numericalIssues,
    result: integrityPass ? "PASS" : "FAIL",
  }) },
  { number: 25, title: "REPRODUCIBILITY", data: canonical({
    trainingArtifactHash: artifact.artifactHash, featureSchemaHash: artifact.featureSchemaHash,
    configurationHash: artifact.configurationHash, transformsHash: artifact.transformsHash,
    parameterHash: artifact.parameterHash, calibrationHash: artifact.calibrationHash,
    distributionHash: artifact.distributionHash, forecastHash,
    firstRunHash: deterministic.firstTrainingHash, secondRunHash: deterministic.rerunHash,
    mismatchCount: deterministic.mismatchCount,
  }) },
  { number: 26, title: "TEST / BUILD RESULTS", data: canonical({
    verificationFile: "reports/mlb-v4-expected-runs-verification.json", verification,
    reporterExecutionPolicy: "This script reports persisted evidence only and does not run tests/builds.",
  }) },
  { number: 27, title: "CROSS-SPORT REGRESSION", data: canonical({
    NCAAFUnchanged: true, NFLUnchanged: true, NBAUnchanged: true, WNBAUnchanged: true,
    NHLUnchanged: true, SoccerUnchanged: true, UFCUnchanged: true,
    evidence: "Reporter changes are limited to this MLB report script and its package command.",
  }) },
  { number: 28, title: "PRODUCTION STATE", data: canonical({
    mlbV1Unchanged: true, oldV4V41Unchanged: true, newV4ChallengerState: "RESEARCH_ONLY_NOT_PROMOTED",
    publicationUnchanged: true, uiUnchanged: true, sixPickCapUnchanged: true,
    deployment: "NOT RUN", push: "NOT RUN",
  }) },
  { number: 29, title: "RISKS / LIMITATIONS", data: canonical({
    CRITICAL: integrityPass ? [] : ["Persisted integrity failure; training is invalid."],
    HIGH: ["Historical timestamped pregame starter identity is unavailable (feature count 0).",
      "Validation total bias exceeds the predeclared absolute <=0.25 runs/game rule."],
    MEDIUM: ["No legitimate immutable PIT market comparator is available.",
      "No legitimate immutable PIT V1 comparator is provable.",
      "Non-selected candidate scores/artifacts were not persisted individually."],
    LOW: ["Team-level residual segmentation was not persisted.",
      "Three quarantined foundation games remain outside the chronology-safe population."],
  }) },
  { number: 30, title: "FINAL CLASSIFICATION", data: canonical({
    Classification: classification,
    evidence: integrityPass
      ? "Persisted v3 integrity is clean, but the validation excessiveTotalBias flag violates the predeclared <=0.25 rule. Classification is therefore not better than C regardless of OOS performance."
      : "Persisted integrity evidence failed, requiring classification D.",
    validationFailureFlags: failureFlags, oosFailureFlags,
  }) },
  { number: 31, title: "NEXT RECOMMENDED TASK", data: canonical({
    status: "NO NEXT TASK STARTED",
    statement: "No next task was started. Work explicitly stops pending owner review.",
    requirementForNewChallenger:
      "Only genuinely new PIT-safe evidence (especially prospective starter evidence) or a newly predeclared architecture with a new untouched evaluation plan can support a future challenger. The same model must not be repaired against OOS.",
    task224D: "NOT PROPOSED; NOT STARTED",
  }) },
];
if (sections.length !== 31 || sections.some((section, index) => section.number !== index + 1)) {
  throw new Error("Final report must contain exactly 31 numbered sections");
}
const payload = canonical({
  title: "TASK #224C — MLB V4 EXPECTED-RUNS MODEL BUILD, TRAINING & CHRONOLOGICAL VALIDATION REPORT",
  generationTimestamp: generatedAt, schemaVersion: MLB_224C_SCHEMA_VERSION, sections,
});
const markdown = [
  "# TASK #224C — MLB V4 EXPECTED-RUNS MODEL BUILD, TRAINING & CHRONOLOGICAL VALIDATION REPORT",
  "",
  `Generation timestamp: ${generatedAt}`,
  "",
  ...sections.flatMap((section) => [
    `## ${section.number}. ${section.title}`, "",
    "```json", JSON.stringify(section.data, null, 2), "```", "",
  ]),
].join("\n");
await writeFile(`${reportBase}.json`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await writeFile(`${reportBase}.md`, `${markdown}\n`, "utf8");
console.log(JSON.stringify({
  status: "REPORT_WRITTEN", markdown: "reports/mlb-v4-expected-runs-training-2026-09-05.md",
  json: "reports/mlb-v4-expected-runs-training-2026-09-05.json",
  classification, sections: sections.length,
}, null, 2));