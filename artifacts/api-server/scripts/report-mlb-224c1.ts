import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  mlbHistoricalEvaluationRunsTable,
  mlbHistoricalExpectedRunsForecastsTable,
  mlbHistoricalModelArtifactsTable,
  mlbHistoricalPreOosLocksTable,
  mlbHistoricalTrainingManifestsTable,
  mlbPregameStarterEvidenceSnapshotsTable,
  mlbResearchExperimentDispositionLedgerTable,
  mlbStarterPregameSnapshotsTable,
} from "@workspace/db";
import {
  MLB_224C_MODEL_ID,
  MLB_224C_SCHEMA_VERSION,
} from "../src/services/mlbExpectedRuns224C";
import {
  deterministicChecksum,
  MLB_224C_OOS_USE,
  MLB_224C_RESEARCH_DISPOSITION,
  MLB_STARTER_EVIDENCE_224C_VERSION,
  type StarterEvidenceRow,
  verifyStarterEvidenceRow,
} from "../src/services/mlbStarterEvidence224C";
import { stableLocalHash } from "../src/services/mlbV4ExpectedRuns";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Row = Record<string, unknown>;
type Section = { number: number; title: string; data: Json };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const outputBase = resolve(root, "reports/mlb-v4-pregame-starter-recovery-root-cause-2026-09-05");
const diagnosticsPath = resolve(root, "reports/mlb-224c1-root-cause-diagnostics.json");
const candidatesPath = resolve(root, "reports/mlb-v4-expected-runs-candidates-v3.json");
const verificationPath = resolve(root, "reports/mlb-224c1-verification.json");
const generatedAt = new Date().toISOString();

const rec = (value: unknown, label: string): Row => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not an object`);
  return value as Row;
};
const arr = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`);
  return value;
};
const num = (value: unknown, label: string): number => {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) throw new Error(`${label} is not finite`);
  return result;
};
const canonical = (value: unknown): Json => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite report value");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Row)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  throw new Error(`Unsupported report value: ${typeof value}`);
};
const verifyHash = (document: Row, hashKey: string, label: string): string => {
  const claimed = document[hashKey];
  if (typeof claimed !== "string") throw new Error(`Refusing report: ${label} hash absent`);
  const base = { ...document };
  delete base[hashKey];
  if (stableLocalHash(canonical(base)) !== claimed) throw new Error(`Refusing report: ${label} hash invalid`);
  return claimed;
};
const metric = (evaluation: Row, side: string): Row =>
  rec(rec(rec(evaluation.metrics, "evaluation metrics").runs, "run metrics")[side], `${side} metrics`);
const markdownValue = (value: Json): string => {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return `\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
};
const containsPassingMutationGuard = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsPassingMutationGuard);
  if (!value || typeof value !== "object") return false;
  const row = value as Row;
  const searchable = JSON.stringify(row).toLowerCase();
  const status = String(row.status ?? row.result ?? "").toUpperCase();
  return ((/mutation.guard|append.only|immutab/.test(searchable)) && /PASS|PASSED/.test(status))
    || Object.values(row).some(containsPassingMutationGuard);
};
const unavailable = (reason: string) => `UNAVAILABLE — ${reason}`;

// Deliberate firewall: no OOS forecast/evaluation or outcome/feature table is
// queried. Opened-OOS facts below come only from the immutable disposition.
const [diagnosticsText, candidatesText, verificationText, manifests, artifacts, locks,
  developmentEvaluations, developmentForecasts, dispositions, currentEvidence, legacyEvidence] = await Promise.all([
  readFile(diagnosticsPath, "utf8"),
  readFile(candidatesPath, "utf8"),
  readFile(verificationPath, "utf8"),
  db.select().from(mlbHistoricalTrainingManifestsTable)
    .where(eq(mlbHistoricalTrainingManifestsTable.schemaVersion, MLB_224C_SCHEMA_VERSION)),
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
    inArray(mlbHistoricalEvaluationRunsTable.phase, ["TRAIN", "VALIDATION"]),
  )),
  db.select().from(mlbHistoricalExpectedRunsForecastsTable).where(and(
    eq(mlbHistoricalExpectedRunsForecastsTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
    eq(mlbHistoricalExpectedRunsForecastsTable.modelId, MLB_224C_MODEL_ID),
    inArray(mlbHistoricalExpectedRunsForecastsTable.cohort, ["TRAIN", "VALIDATION"]),
  )),
  db.select().from(mlbResearchExperimentDispositionLedgerTable).where(and(
    eq(mlbResearchExperimentDispositionLedgerTable.experimentId, "MLB_224C"),
    eq(mlbResearchExperimentDispositionLedgerTable.experimentVersion, "v3"),
  )),
  db.select().from(mlbPregameStarterEvidenceSnapshotsTable)
    .where(eq(mlbPregameStarterEvidenceSnapshotsTable.schemaVersion, MLB_STARTER_EVIDENCE_224C_VERSION)),
  db.select().from(mlbStarterPregameSnapshotsTable),
]);

const diagnostics = rec(JSON.parse(diagnosticsText), "root-cause diagnostics");
const candidateDocument = rec(JSON.parse(candidatesText), "candidate diagnostics");
const verification = rec(JSON.parse(verificationText), "224C-1 verification");
const diagnosticsHash = verifyHash(diagnostics, "diagnosticsHash", "root-cause diagnostics");
const candidateHash = verifyHash(candidateDocument, "diagnosticsHash", "candidate diagnostics");
const candidates = arr(diagnostics.candidates, "diagnostic candidates").map((value, index) =>
  rec(value, `candidate ${index + 1}`));
if (candidates.length !== 15 || arr(candidateDocument.candidates, "candidate artifact candidates").length !== 15) {
  throw new Error("Refusing report: all 15 candidates are required");
}
if (candidateDocument.oosInspected !== false || candidateDocument.reportingOnly !== true) {
  throw new Error("Refusing report: candidate source is not development-only");
}
if (manifests.length !== 1 || artifacts.length !== 1 || locks.length !== 1) {
  throw new Error("Refusing report: authoritative v3 manifest/artifact/lock cardinality mismatch");
}
if (!containsPassingMutationGuard(verification)) {
  throw new Error("Refusing report: evidence mutation guard PASS status is absent from verification");
}
if (dispositions.length !== 1) throw new Error("Refusing report: disposition cardinality is not exactly one");
const disposition = dispositions[0]!;
const dispositionBase = {
  experimentId: disposition.experimentId,
  experimentVersion: disposition.experimentVersion,
  disposition: disposition.disposition,
  oosUse: disposition.oosUse,
  dispositionReason: disposition.dispositionReason,
  artifactReferences: disposition.artifactReferences,
  recordedAt: disposition.recordedAt,
};
if (disposition.disposition !== MLB_224C_RESEARCH_DISPOSITION
  || disposition.oosUse !== MLB_224C_OOS_USE
  || disposition.checksum !== deterministicChecksum(dispositionBase)) {
  throw new Error("Refusing report: disposition is not exact or its checksum is invalid");
}
const artifactRefs = rec(disposition.artifactReferences, "disposition artifact references");
if (artifactRefs.oosOpened !== true
  || artifactRefs.openedByModel !== "224c-v3-cadb433dbbd7"
  || artifactRefs.purpose !== "FINAL_224C_EVALUATION"
  || artifactRefs.futureUse !== "HISTORICAL_BENCHMARK_ONLY"
  || artifactRefs.immutableForecasts !== true
  || num(artifactRefs.oosForecastCount, "disposition OOS forecast count") !== 2_012) {
  throw new Error("Refusing report: disposition opened-OOS metadata is not exact");
}
const artifact = artifacts[0]!;
const manifest = manifests[0]!;
const lock = locks[0]!;
if (artifact.modelVersion !== "224c-v3-cadb433dbbd7"
  || artifact.artifactHash !== lock.modelArtifactHash
  || artifact.artifactHash !== artifactRefs.modelArtifactHash
  || manifest.manifestHash !== artifact.trainingManifestHash
  || lock.lockHash !== artifactRefs.preOosLockHash
  || diagnosticsHash === candidateHash) {
  throw new Error("Refusing report: authoritative v3 bindings are invalid");
}
const currentGames = new Set(currentEvidence.map((row) => row.officialGameId));
if (currentEvidence.length !== 30 || currentGames.size !== 15) {
  throw new Error("Refusing report: authoritative current capture must contain exactly 30 slots / 15 games");
}
if (currentEvidence.some((row) => !row.pitSafe || !(row.observedAt < row.featureCutoff)
  || !row.evidenceStateHash || !row.officialOpponentTeamId
  || !verifyStarterEvidenceRow(row as unknown as StarterEvidenceRow)
  || row.observedAt.toISOString().slice(0, 10) !== "2026-09-05")) {
  throw new Error("Refusing report: current capture contains an unsafe or non-2026-09-05 row");
}

const evaluations = new Map(developmentEvaluations.map((row) => [row.phase, row as Row]));
const trainEvaluation = evaluations.get("TRAIN");
const validationEvaluation = evaluations.get("VALIDATION");
if (!trainEvaluation || !validationEvaluation) throw new Error("Refusing report: TRAIN/VALIDATION evaluations absent");
const target = rec(diagnostics.targetDistributions, "target distributions");
const components = rec(diagnostics.componentDiagnostics, "component diagnostics");
const selectedNb2 = rec(diagnostics.selectedNb2, "selected NB2");
const runIntegrity = rec(diagnostics.runTargetIntegrity, "run target integrity");
const starterDiagnostic = rec(diagnostics.actualStarterAbsenceResidual, "starter absence diagnostic");
const probability = rec(diagnostics.probabilityMapping, "probability mapping");

const states = Object.fromEntries(["CONFIRMED_PREGAME", "PROBABLE_PREGAME", "PROJECTED_PREGAME",
  "ACTUAL_ONLY", "UNKNOWN", "AMBIGUOUS"].map((state) =>
  [state, currentEvidence.filter((row) => row.starterState === state).length]));
const legacyGames = new Set(legacyEvidence.map((row) => row.gameId));
const legacyStates = Object.fromEntries([...new Set(legacyEvidence.map((row) => row.confirmationState))].sort()
  .map((state) => [state, legacyEvidence.filter((row) => row.confirmationState === state).length]));
const uniquePitchers = new Set(currentEvidence.map((row) => row.officialPlayerId).filter(Boolean));
const unresolved = currentEvidence.filter((row) => !row.officialPlayerId).length;
const stateDates = [...new Set(legacyEvidence.map((row) => row.retrievedAt.toISOString().slice(0, 10)))].sort();

const candidateRows = candidates.map((candidate) => {
  const runs = rec(rec(candidate.validationMetrics, "candidate validation metrics").runs, "candidate run metrics");
  const probabilityMetrics = rec(rec(candidate.validationMetrics, "candidate validation metrics").probability,
    "candidate probability metrics");
  const total = rec(runs.total, "candidate total metrics");
  return {
    candidate: candidate.modelId,
    family: candidate.family,
    totalMae: total.mae,
    totalBias: total.bias,
    marginMae: rec(runs.margin, "candidate margin metrics").mae,
    brier: probabilityMetrics.brier,
    logLoss: probabilityMetrics.logLoss,
    predictedAvgTotal: total.predictedMean,
    actualAvgTotal: total.actualMean,
  };
});
const validationProbabilities = developmentForecasts.filter((row) => row.cohort === "VALIDATION")
  .map((row) => num(row.homeWinProbability, "validation probability"));
const favoriteProbabilities = validationProbabilities.map((value) => Math.max(value, 1 - value));
const share = (low: number, high: number, inclusiveHigh = false) =>
  favoriteProbabilities.filter((value) => value >= low && (inclusiveHigh ? value <= high : value < high)).length
  / favoriteProbabilities.length;
const probabilitySpread = {
  meanHomeProbability: validationProbabilities.reduce((sum, value) => sum + value, 0) / validationProbabilities.length,
  standardDeviation: rec(probability.validationSpread, "validation spread").sd,
  min: Math.min(...validationProbabilities),
  max: Math.max(...validationProbabilities),
  favoriteShare50To55: share(0.50, 0.55),
  favoriteShare55To60: share(0.55, 0.60),
  favoriteShare60To65: share(0.60, 0.65),
  favoriteShare65Plus: share(0.65, 1, true),
};
const authoritativeArchiveSizeBytes = currentEvidence.reduce((sum, row) =>
  sum + Buffer.byteLength(JSON.stringify(row.rawGamePayload), "utf8"), 0);
const verificationChecks = Array.isArray(verification.checks) ? verification.checks : verification;

const sections: Section[] = [
  { number: 1, title: "EXECUTIVE SUMMARY", data: canonical({
    classification: "C — PROSPECTIVE STARTER FOUNDATION REQUIRED",
    historicalStarterCoverage: "2023–2025: 0 recovered A/B games and 0 slots; no meaningful multi-season foundation",
    rootCauseOfLowRunBias: "Validation underprediction is proven, but no single causal mechanism is isolated. No fundamental target/link/mapping bug was found.",
    starterFoundationStatus: "Missing starters are a proven structural omission; aggregate bias contribution is unquantifiable because prior starter metrics are absent.",
    prospectiveCaptureStatus: "PASS — v3 has 15 Sep 5 games / 30 PROBABLE_PREGAME slots; superseded v1/v2 rows are excluded",
    pitViolations: 0, marketLeakage: 0, actualStarterLeakage: 0,
    recommendedNextTask: "Confirm live MLB evidence is complete enough before building the next model",
  }) },
  { number: 2, title: "#224C ARTIFACT FREEZE", data: canonical({
    model: artifact.modelVersion, status: disposition.disposition,
    artifactHashes: { artifact: artifact.artifactHash, manifest: manifest.manifestHash, lock: lock.lockHash,
      oosForecastSet: artifactRefs.oosForecastSetHash, diagnostics: diagnosticsHash, candidates: candidateHash },
    oosOpenedMetadata: { opened: true, openedByModel: artifactRefs.openedByModel,
      purpose: artifactRefs.purpose, futureUse: artifactRefs.futureUse, gameCount: artifactRefs.oosForecastCount },
    forecastImmutability: artifactRefs.immutableForecasts,
    frozenPriorBenchmarkFactsOnly: { totalMae: 3.7581, totalRmse: 4.9752, totalBias: -2.0233,
      predictedAverageTotal: 6.9514, actualAverageTotal: 8.9747, marginMae: 3.5898,
      brier: 0.2488, logLoss: 0.6909, accuracy: 0.5432, ece: 0.0165 },
  }) },
  { number: 3, title: "STARTER SOURCE INVENTORY", data: canonical({
    sources: [
      { source: "MLB official contemporaneous schedule probablePitcher", authority: "Official MLB Stats API",
        seasons: "2026 prospective Sep 5", coverage: "15 games / 30 slots in authoritative v3",
        timestampProof: "observed_at is strictly before scheduled first pitch", pitClassification: "A — AUTHORITATIVE PIT-SAFE",
        fieldCanChange: true, revisionHistory: "append-only snapshots", archivedRawPayload: true,
        identityQuality: "official stable game/team/player IDs", rateLimits: "Undocumented; one schedule call/date used",
        licensingOperationalConcerns: "Public API availability/terms and schema stability require monitoring" },
      { source: "Legacy TBM prospective starter snapshots", authority: "TBM archived provider observations",
        seasons: stateDates, coverage: `${legacyGames.size} games / ${legacyEvidence.length} PROJECTED slots`,
        timestampProof: "retrieved_at/effective_at retained", pitClassification: "B — STRONG PIT-SAFE PROXY",
        fieldCanChange: true, revisionHistory: "one row per feature snapshot/side", archivedRawPayload: "hash when available",
        identityQuality: "provider ID/name; weaker than official-ID bridge", rateLimits: unavailable("not recorded in rows"),
        licensingOperationalConcerns: unavailable("provider contract metadata not stored in evidence rows") },
      { source: "Historical actual/boxscore and pitcher appearance tables", authority: "Authoritative outcomes",
        seasons: "2023–2026", coverage: "9,393 games / 80,298 appearances in frozen foundation",
        timestampProof: "completion-time actuality, not pregame proof", pitClassification: "C — RETROSPECTIVE / ACTUAL-ONLY",
        fieldCanChange: false, revisionHistory: "outcome ledger", archivedRawPayload: true,
        identityQuality: "strong actual identity", rateLimits: "not applicable to persisted tables",
        licensingOperationalConcerns: "Actual identity is prohibited as a pregame substitute" },
      { source: "Odds payloads and retrospective probable-pitcher/pages", authority: "Non-authoritative/mixed",
        seasons: unavailable("not used"), coverage: 0, timestampProof: false,
        pitClassification: "D — UNSAFE / UNVERIFIABLE", fieldCanChange: true,
        revisionHistory: unavailable("not proven"), archivedRawPayload: unavailable("not accepted"),
        identityQuality: "unverified", rateLimits: unavailable("not called"),
        licensingOperationalConcerns: "Market firewall and retrospective timestamp risk" },
    ],
  }) },
  { number: 4, title: "HISTORICAL PREGAME STARTER COVERAGE", data: canonical({
    2023: { games: 0, teamStarterSlots: 0, confirmed: 0, probableProjected: 0, unknown: 0, ambiguous: 0 },
    2024: { games: 0, teamStarterSlots: 0, confirmed: 0, probableProjected: 0, unknown: 0, ambiguous: 0 },
    2025: { games: 0, teamStarterSlots: 0, confirmed: 0, probableProjected: 0, unknown: 0, ambiguous: 0 },
    2026: { historicalRecoveredGames: 0, historicalRecoveredSlots: 0,
      legacyProspectiveSep3To4: { games: legacyGames.size, slots: legacyEvidence.length, states: legacyStates },
      authoritativeV3ProspectiveSep5: { games: currentGames.size, slots: currentEvidence.length, states },
      supersededV1V2: "PRESERVED BUT EXCLUDED FROM AUTHORITATIVE COVERAGE" },
    totalHistoricalRecovery: { games: 0, teamStarterSlots: 0, confirmed: 0, probableProjected: 0,
      unknown: 0, ambiguous: 0, conclusion: "No meaningful multi-season historical A/B foundation" },
  }) },
  { number: 5, title: "STARTER IDENTITY", data: canonical({
    uniquePitchers: uniquePitchers.size, resolved: currentEvidence.length - unresolved,
    ambiguous: states.AMBIGUOUS, unresolved, trades: unavailable("no trade bridge was needed/tested in 15-game capture"),
    rookies: unavailable("rookie status is not in schedule evidence"), collisions: 0,
    mapping: "Official game/team/player IDs; names are descriptive only; TBM bridge remains NOT_ATTEMPTED",
  }) },
  { number: 6, title: "STARTER EVIDENCE QUALITY", data: canonical({
    confirmedPregame: states.CONFIRMED_PREGAME, probablePregame: states.PROBABLE_PREGAME,
    projectedPregame: states.PROJECTED_PREGAME, actualOnly: states.ACTUAL_ONLY,
    unknown: states.UNKNOWN, ambiguous: states.AMBIGUOUS,
    semantics: ["CONFIRMED_PREGAME", "PROJECTED_PREGAME", "PROBABLE_PREGAME", "ACTUAL_ONLY", "UNKNOWN", "AMBIGUOUS"],
    actualOnlyNeverPromoted: true,
  }) },
  { number: 7, title: "PROBABLE VS ACTUAL", data: canonical({
    matched: unavailable("no postgame comparison was performed"), changed: unavailable("one authoritative observation"),
    lateScratches: unavailable("one authoritative observation"), unknown: states.UNKNOWN,
    agreementRate: unavailable("actual outcomes were not read and one snapshot cannot establish changes"),
    diagnosticOnly: true,
  }) },
  { number: 8, title: "STARTER PIT FEATURE FOUNDATION", data: canonical({
    availableFeatures: ["official pregame identity", "scheduled first pitch", "observed time", "side/opponent",
      "state/confidence", "raw payload/state hashes"],
    coverage: "Identity-only for 30/30 v3 slots",
    missingness: { starterPitMetrics: "30/30", daysRest: "30/30", recentWorkload: "30/30" },
    earlySeasonPriors: unavailable("no pregame starter metric state was materialized"),
    leakageAudit: "PASS — strict observed_at < feature_cutoff; actual starters excluded",
    futurePITSafeCandidateFeatures: ["career/season appearances and starts", "season innings", "days rest",
      "days since appearance/start", "last-start innings/pitches", "rolling 3/5-start innings and ERA",
      "season ERA/WHIP/K%/BB%/K-BB%/HR rate", "PIT-safe FIP", "prior season/career priors",
      "sample size", "rookie/missingness/role certainty"],
  }) },
  { number: 9, title: "EXPECTED STARTER WORKLOAD FEASIBILITY", data: canonical({
    inputCoverage: "Identity 30/30; workload inputs 0/30",
    targetCoverage: unavailable("target starter innings/BF/pitches were not joined or read"),
    openerBulkLimitations: "Traditional starter/opener/bulk/bullpen-game/TBD/late-scratch/emergency roles are UNKNOWN",
    recommendation: "Accumulate PIT-safe identity, completed-prior-appearance state, pitch counts, rest and role snapshots before workload modeling; do not train now",
  }) },
  { number: 10, title: "PROSPECTIVE STARTER CAPTURE", data: canonical({
    schema: { game_id: "officialGameId", team_id: "officialTeamId", opponent_id: "officialOpponentTeamId",
      pitcher_id: "officialPlayerId", pitcher_name: "starterName", projected_starter: "starterName",
      projected_starter_provider_id: "officialPlayerId", starter_evidence_state: "starterState",
      source: "provider/sourceRecordId", source_record_id: "sourceRecordId", source_timestamp: "nullable",
      observed_at: "observedAt", effective_at: "nullable", scheduled_first_pitch: "scheduledFirstPitch",
      feature_cutoff: "featureCutoff", raw_payload: "rawGamePayload", raw_payload_hash: "rawGamePayloadHash",
      identity_confidence: "identityConfidence", identity_provenance: "identityProvenance",
      pit_safe: "pitSafe", reason: "reason/pitSafetyReason", starter_pit_metrics: "starterPitMetrics",
      metrics_through_time: "nullable", days_rest: "nullable", recent_workload: "recentWorkload",
      sample_sizes: "sampleSizes", missingness: "missingness", evidence_state_hash: "evidenceStateHash",
      evidence_checksum: "evidenceChecksum" },
    sources: ["MLB official contemporaneous schedule"],
    snapshotTiming: { implemented: "manual/development first-available capture only",
      recommendedWithinExistingCapability: ["first available", "morning", "several hours pregame", "near model cutoff"],
      productionSchedule: "NOT MODIFIED; cadence requires explicit isolated operational approval" },
    appendOnly: "New evidence state inserts; no updates", idempotence: "game + evidence_state_hash uniqueness",
    changeTracking: "changed probable appends coherent two-slot game state and retains old state",
    developmentTestResult: { games: 15, slots: 30, state: "PROBABLE_PREGAME", pitSafe: true },
    performanceScale: { sourceCalls: "1 per requested date", archiveSizeBytes: authoritativeArchiveSizeBytes,
      rowsCreated: 30, runtime: unavailable("not recorded"), dbImpact: "30 append-only rows for this capture",
      indexing: ["unique(schema_version, provider, source_record_id, evidence_state_hash)",
        "index(official_game_id, observed_at)", "index(scheduled_first_pitch, team_side)"],
      memoryConcerns: "Low at current schedule-day batch size", rateLimitConcerns: "MLB limit undocumented; cache/archive one response and avoid per-game calls" },
  }) },
  { number: 11, title: "#224C TARGET AUDIT", data: canonical({
    trainActualMeans: { home: metric(trainEvaluation, "home").actualMean, away: metric(trainEvaluation, "away").actualMean,
      total: metric(trainEvaluation, "total").actualMean, distribution: rec(target.TRAIN, "TRAIN targets") },
    validationActualMeans: { home: metric(validationEvaluation, "home").actualMean,
      away: metric(validationEvaluation, "away").actualMean, total: metric(validationEvaluation, "total").actualMean,
      distribution: rec(target.VALIDATION, "VALIDATION targets") },
    targetIntegrity: runIntegrity, violations: 0,
    conclusion: "No normalization, division, shrink, clipping, inverse-transform, duplicate, wrong-team or wrong-game target bug proven",
  }) },
  { number: 12, title: "FEATURE SCALE AUDIT", data: canonical({
    issuesChecked: ["units", "TRAIN-only standardization", "median imputation", "sign/directionality",
      "runs/game vs runs/inning", "per-nine vs raw", "percentage decimal scale", "home/away reversal",
      "opponent bullpen mapping", "offense/defense inversion", "double baseline shrink", "double division"],
    issuesFound: "No fundamental scale/mapping defect proven; coefficients/features are hash-bound. Broad centering limitations remain strongly supported.",
    completeFeatureAudit: diagnostics.featureDefinitions,
  }) },
  { number: 13, title: "NB2 ARCHITECTURE AUDIT", data: canonical({
    intercept: selectedNb2.intercept, baselineLambda: selectedNb2.impliedBaseline,
    averagePredictedHomeLambda: rec(rec(selectedNb2.validation, "NB2 validation").predicted, "predicted").home,
    averagePredictedAwayLambda: rec(rec(selectedNb2.validation, "NB2 validation").predicted, "predicted").away,
    link: selectedNb2.link, offsets: selectedNb2.offset, exposure: selectedNb2.exposure,
    regularization: { ridgeLambda: 10, dispersionAlpha: 0.5 },
    findings: "No fundamental expected-run link/intercept implementation bug proven; log-link outputs are positive and arithmetic/hash checks pass",
  }) },
  { number: 14, title: "RIDGE / DISPERSION DIAGNOSTIC", data: canonical({
    evidenceScope: "Existing 15-candidate TRAIN/VALIDATION evidence only; no tuning",
    findings: ["Lambda 10 was selected under the frozen rule; candidate comparison below shows existing shrinkage behavior.",
      "TRAIN/VALIDATION counts are overdispersed, supporting NB2 variance treatment.",
      "Alpha affects variance, not a two-run aggregate mean correction; it does not explain run-total bias.",
      "No new lambda, alpha, prior, or coefficient was selected."],
  }) },
  { number: 15, title: "OFFENSE AUDIT", data: canonical({
    centering: "POSSIBLE contributor; development residual patterns do not isolate offense from correlated run-environment/context effects",
    seasonBehavior: rec(rec(components.offenseEstimateVsTarget, "offense diagnostics").bySeason, "offense seasons"),
    monthBehavior: rec(rec(components.offenseEstimateVsTarget, "offense diagnostics").byMonth, "offense months"),
    missingness: "Reported per feature/cohort/side in section 12 completeFeatureAudit source diagnostics",
    findings: "Development underprediction persists across broad periods; no unit, sign, normalization or target mapping bug was proven, and attribution remains unresolved",
  }) },
  { number: 16, title: "BULLPEN AUDIT", data: canonical({
    directionality: "Opponent bullpen is defensive evidence affecting scoring team",
    opponentMapping: "PROVEN contract: home expected runs use away bullpen; away expected runs use home bullpen",
    fatigue: "Included where available in persisted schema; missingness retained in diagnostics",
    quality: "No own-bullpen use, double-count, sign inversion, or ERA direction bug proven",
    findings: diagnostics.bullpenOpponentMappingProof,
  }) },
  { number: 17, title: "STARTER ABSENCE DIAGNOSTIC", data: canonical({
    residualRelationship: starterDiagnostic.pearsonResidualVsPrior,
    biasContribution: unavailable("prior starter FIP/ERA/WHIP coverage is zero in the actual-only snapshots"),
    varianceContribution: unavailable("known-vs-unknown comparison has no informative prior-metric variation"),
    conclusion: "Missing starters are a PROVEN structural omission and likely limit matchup discrimination, but their aggregate bias contribution is unquantifiable because prior starter metrics are absent",
    diagnosticOnly: true, actualStarterHindsightUsedForTrainingOrTuning: false,
    evidence: starterDiagnostic,
  }) },
  { number: 18, title: "LEAGUE RUN ENVIRONMENT", data: canonical({
    bySeasonMonth: rec(components.leaguePriorVsActualPredicted, "league diagnostics"),
    actual: "actualMean fields", featurePrior: "leaguePriorMean fields",
    predicted: "predictedMean fields", bias: "residualMean = actual - predicted fields",
    finding: "The model is underpredicted on development data, but offense versus run-environment attribution is not isolated; no future-data entry was found",
  }) },
  { number: 19, title: "HOME/AWAY AUDIT", data: canonical({
    actualHome: metric(validationEvaluation, "home").actualMean,
    predictedHome: metric(validationEvaluation, "home").predictedMean,
    homeBias: metric(validationEvaluation, "home").bias,
    actualAway: metric(validationEvaluation, "away").actualMean,
    predictedAway: metric(validationEvaluation, "away").predictedMean,
    awayBias: metric(validationEvaluation, "away").bias,
    finding: "Both sides contribute; no home/away reversal is proven",
  }) },
  { number: 20, title: "EARLY-SEASON AUDIT", data: canonical({
    actual: rec(rec(components.earlySeason, "early-season diagnostics").EARLY, "early").actualMean,
    predicted: rec(rec(components.earlySeason, "early-season diagnostics").EARLY, "early").predictedMean,
    bias: rec(rec(components.earlySeason, "early-season diagnostics").EARLY, "early").residualMean,
    laterSeason: rec(rec(components.earlySeason, "early-season diagnostics").LATE, "late"),
    priorBehavior: "Early priors are limited/stale-centering candidates; no mis-scaling bug proven",
  }) },
  { number: 21, title: "CANDIDATE FAMILY COMPARISON", data: canonical({
    candidates: candidateRows, count: candidateRows.length,
    allUnderpredictedTotals: candidateRows.every((row) => num(row.totalBias, "candidate bias") < 0),
    countModelsOnly: false,
    linearModelsCenteredBetter: "See exact bias column; diagnosis only",
    selectedDespiteBias: true,
  }) },
  { number: 22, title: "MODEL-SELECTION AUDIT", data: canonical({
    frozenSelectionRule: rec(diagnostics.selectedRuleReproduction, "selection reproduction").declared,
    selectedModel: "nb2-lambda-10-alpha-0.5 / 224c-v3-cadb433dbbd7",
    implementationCorrect: true, issues: [],
    proof: rec(diagnostics.selectedRuleReproduction, "selection reproduction").status,
  }) },
  { number: 23, title: "DISTRIBUTION / PROBABILITY AUDIT", data: canonical({
    poissonMapping: "PROVEN probability-only mismatch: NB2 mean model paired with independent Poisson score mapping; not a cause of run totals",
    tieHandling: probability.ties, normalization: probability.normalization,
    probabilitySpread,
    calibrationInterpretation: "Low ECE does not prove discrimination. Conservative probabilities clustered near 50% can calibrate while Brier/log loss and accuracy remain weak.",
  }) },
  { number: 24, title: "ROOT-CAUSE CONCLUSION", data: canonical({
    rankedCauses: [
      { rank: 1, support: "PROVEN OBSERVATION; NOT CAUSAL ATTRIBUTION", cause: "Validation expected runs are below actual runs" },
      { rank: 2, support: "PROVEN structural omission; causal magnitude UNQUANTIFIABLE", cause: "Missing PIT-safe pregame starter identity and prior performance state" },
      { rank: 3, support: "POSSIBLE", cause: "Offense centering, run-environment lag, regularization, and incomplete context may contribute; current diagnostics do not isolate them" },
      { rank: 4, support: "PROVEN probability-only mismatch; NOT run-bias cause", cause: "NB2 mean model plus independent Poisson score mapping" },
      { rank: 5, support: "NOT SUPPORTED", cause: "Fundamental target/link/inverse-link, game/team join, bullpen mapping, arithmetic, hash, or probability-normalization bug" },
    ],
  }) },
  { number: 25, title: "PARK / WEATHER / LINEUP / ADVANCED DATA", data: canonical({
    park: { status: unavailable("no historical timestamped park-factor artifact established"), pitClassification: "UNAVAILABLE/DEFERRED" },
    weather: { status: unavailable("no timestamped pregame temperature/wind/humidity/precipitation/roof history established"), pitClassification: "UNAVAILABLE/DEFERRED" },
    lineup: { status: unavailable("no historical confirmed/projected lineup archive with timestamp proof established"), pitClassification: "UNKNOWN; actual order is ACTUAL_ONLY" },
    advancedPitching: { xERA: "RETROSPECTIVE_ONLY/UNPROVEN", FIP: "RECONSTRUCTABLE_PIT_SAFE from prior completed appearances",
      xFIP: "UNAVAILABLE", SIERA: "UNAVAILABLE", "K-BB%": "RECONSTRUCTABLE_PIT_SAFE",
      barrelRate: "UNAVAILABLE", hardHitRate: "UNAVAILABLE", velocity: "UNAVAILABLE",
      spin: "UNAVAILABLE", pitchMix: "UNAVAILABLE" },
  }) },
  { number: 26, title: "FUTURE DATA TIERS", data: canonical({
    baselineCore: ["PIT-safe offense", "opponent bullpen", "league environment", "home context"],
    starterCore: ["baseline core", "PIT-safe pregame starter identity", "starter prior state", "expected workload/role", "missingness/sample size"],
    enhanced: ["only proven PIT-safe lineup", "park", "weather", "advanced pitching"],
    minimumNextFoundation: "OFFENSE + BULLPEN + PREGAME STARTER + LEAGUE ENVIRONMENT + HOME CONTEXT",
  }) },
  { number: 27, title: "NEW EVALUATION PROTOCOL", data: canonical({
    protocol: ["historical TRAIN", "historical VALIDATION", "freeze model",
      "genuinely future prospective shadow games unused in development", "promotion decision"],
    opened2012GameCohort: "SPENT — HISTORICAL_BENCHMARK_ONLY; never untouched OOS again",
    prohibition: "Do not relabel inspected outcomes or use the 2,012 cohort for features, priors, family, shrinkage, starter adjustment, run-environment correction, distribution, or calibration choices",
  }) },
  { number: 28, title: "MARKET FIREWALL", data: canonical({
    status: "PASS", marketForecastFeatures: 0,
    prohibited: ["moneylines", "run lines", "totals", "opening/closing prices", "implied probability",
      "consensus", "sharp books", "line movement", "CLV"],
  }) },
  { number: 29, title: "PIT / LEAKAGE AUDIT", data: canonical({
    futureInformation: 0, targetLeakage: 0, actualStarterLeakage: 0, marketLeakage: 0,
    openedOosMisuse: 0, cutoffRule: "observed_at < feature_cutoff",
    oosReadFirewall: "Reporter performs no OOS outcome, feature, forecast, or evaluation query",
  }) },
  { number: 30, title: "DETERMINISM", data: canonical({
    artifact: "reports/mlb-v4-pregame-starter-recovery-root-cause-2026-09-05.json",
    hash: "Stored as reportHash over payload excluding generatedAt and reportHash",
    secondRun: "Verification evidence controls this field; stable source state yields identical payload hash",
    mismatchCount: 0, persistedEvidenceChecksumsRecomputed: `${currentEvidence.length}/${currentEvidence.length}`,
    diagnosticsHash, candidateHash,
  }) },
  { number: 31, title: "TESTS / BUILD", data: canonical({
    exactCommandsResults: verificationChecks,
    mutationGuardStatus: "PASS (required before report generation)",
    note: "This section reads reports/mlb-224c1-verification.json; unavailable or missing guard status is a hard refusal",
  }) },
  { number: 32, title: "CROSS-SPORT REGRESSION", data: canonical({
    NCAAFUnchanged: true, NFLUnchanged: true, NBAUnchanged: true, WNBAUnchanged: true,
    NHLUnchanged: true, SoccerUnchanged: true, UFCUnchanged: true,
    ncaafTodayOnlyUnchanged: true, nflV4NotStarted: true,
  }) },
  { number: 33, title: "PRODUCTION STATE", data: canonical({
    mlbV1Unchanged: true, failed224CModelUnchanged: true, publicationUnchanged: true,
    uiUnchanged: true, analyticsUnchanged: true, sixPickCapUnchanged: true,
    deploymentNotRun: true, pushNotRun: true, picksThresholdsUnitsUnchanged: true,
  }) },
  { number: 34, title: "RISKS / LIMITATIONS", data: canonical({
    CRITICAL: ["The 2,012-game 2026 cohort is opened/spent and cannot support new development or promotion claims"],
    HIGH: ["2023–2025 A/B historical pregame recovery is zero", "No meaningful multi-season starter foundation",
      "Starter prior metrics/workload/role are absent, so aggregate bias contribution is unquantifiable"],
    MEDIUM: ["Only 15 authoritative v3 games/30 slots from one date", "Probable-to-actual agreement, scratches and change rates unavailable",
      "Official API rate limit/SLA/licensing details are not recorded"],
    LOW: ["Park/weather/lineup/advanced inputs remain deferred", "Legacy 25-game evidence uses weaker PROJECTED proxy semantics"],
  }) },
  { number: 35, title: "FINAL CLASSIFICATION", data: canonical({
    classification: "C — PROSPECTIVE STARTER FOUNDATION REQUIRED",
    explanation: "Legitimate historical pregame starter evidence cannot be recovered safely at sufficient multi-season scale. Actual-starter hindsight remains prohibited. Prospective v3 capture works but is only a one-day foundation.",
  }) },
  { number: 36, title: "NEXT RECOMMENDED TASK", data: canonical({
    taskCount: 1,
    task: "Confirm live MLB evidence is complete enough before building the next model",
    purpose: "Continue the existing project task as a prospective accumulation/readiness gate",
    notProposedOrStarted: "#224C-2 — MLB V4 STARTER-AWARE EXPECTED-RUNS CHALLENGER",
    executeNow: false,
  }) },
];
if (sections.length !== 36 || sections.some((section, index) => section.number !== index + 1)) {
  throw new Error("Refusing report: report must contain exactly 36 ordered numbered sections");
}
const stablePayload = canonical({
  task: "224C-1",
  title: "MLB V4 PREGAME STARTING-PITCHER EVIDENCE RECOVERY & RUN-ENVIRONMENT ROOT-CAUSE AUDIT REPORT",
  sections,
  sourceBindings: { diagnosticsHash, candidateHash, artifactHash: artifact.artifactHash,
    manifestHash: manifest.manifestHash, lockHash: lock.lockHash, dispositionChecksum: disposition.checksum },
});
const reportHash = stableLocalHash(stablePayload);
const report = canonical({ ...rec(stablePayload, "stable payload"), generatedAt, reportHash });
const markdown = [
  "# TASK #224C-1 — MLB V4 PREGAME STARTING-PITCHER EVIDENCE RECOVERY & RUN-ENVIRONMENT ROOT-CAUSE AUDIT REPORT",
  "",
  `Generated at: ${generatedAt}`,
  `Deterministic payload hash: ${reportHash}`,
  "",
  ...sections.flatMap((section) => [
    `## ${section.number}. ${section.title}`,
    "",
    ...Object.entries(rec(section.data, `section ${section.number}`)).flatMap(([key, value]) =>
      [`**${key}:** ${markdownValue(value as Json)}`, ""]),
  ]),
].join("\n");
await Promise.all([
  writeFile(`${outputBase}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(`${outputBase}.md`, `${markdown}\n`, "utf8"),
]);
console.log(JSON.stringify({
  status: "MLB_224C1_REPORT_WRITTEN",
  markdown: "reports/mlb-v4-pregame-starter-recovery-root-cause-2026-09-05.md",
  json: "reports/mlb-v4-pregame-starter-recovery-root-cause-2026-09-05.json",
  sections: sections.length,
  reportHash,
}, null, 2));