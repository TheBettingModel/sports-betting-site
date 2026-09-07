import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db, mlbV4ContextStatesTable, mlbV4PregameFeaturesTable, mlbV4ShadowForecastsTable,
  mlbV4StarterStatesTable, mlbV4TeamStatesTable,
} from "@workspace/db";
import { MLB_V4_INPUT_SCHEMA, type EvidenceTier } from "../src/services/mlbV4LiveFoundation";
import {
  MLB_V4_FEATURE_DEFINITIONS, MLB_V4_HISTORICAL_ADAPTER_HASH, MLB_V4_INPUT_CONTRACT,
  MLB_V4_LIVE_ADAPTER_HASH, MLB_V4_NORMALIZATION_HASH,
  adaptLiveMlbV4Input, type LiveContractInput,
} from "../src/services/mlbV4InputContract238";

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const iso = (value: Date | null): string | null => value ? value.toISOString() : null;
const stableHash = (value: unknown): string => createHash("sha256")
  .update(JSON.stringify(value, (_key, child) => {
    if (!child || typeof child !== "object" || Array.isArray(child)) return child;
    return Object.fromEntries(Object.entries(child as Json).sort(([a], [b]) => a.localeCompare(b)));
  }))
  .digest("hex");

const [snapshots, teamStates, starterStates, contextStates, forecasts] = await Promise.all([
  db.select().from(mlbV4PregameFeaturesTable)
    .where(eq(mlbV4PregameFeaturesTable.schemaVersion, MLB_V4_INPUT_SCHEMA)),
  db.select({
    stateId: mlbV4TeamStatesTable.stateId,
    sourceCutoff: mlbV4TeamStatesTable.sourceCutoff,
  }).from(mlbV4TeamStatesTable),
  db.select({
    stateId: mlbV4StarterStatesTable.stateId,
    sourceCutoff: mlbV4StarterStatesTable.sourceCutoff,
  }).from(mlbV4StarterStatesTable),
  db.select({
    stateId: mlbV4ContextStatesTable.stateId,
    sourceCutoff: mlbV4ContextStatesTable.sourceCutoff,
  }).from(mlbV4ContextStatesTable),
  db.select({ featureSnapshotId: mlbV4ShadowForecastsTable.featureSnapshotId })
    .from(mlbV4ShadowForecastsTable),
]);

const sourceCutoffByComponent = new Map<string, string | null>([
  ...teamStates, ...starterStates, ...contextStates,
].map((row) => [row.stateId, iso(row.sourceCutoff)]));
const forecasted = new Set(forecasts.map((row) => row.featureSnapshotId));
const missingByFeature = new Map<string, number>();
const errors: Array<{ snapshotId: string; error: string }> = [];
const vectorHashes: string[] = [];
let deterministicReplays = 0;
let sourceCutoffViolations = 0;
let fullVectorEligible = 0;
let snapshotsWithoutPersistedPredictionTime = 0;
let homeSplitCasingDefects = 0;
let bullpenMultiVersionAmplificationCandidates = 0;
let incompleteComponentProvenance = 0;

for (const row of snapshots) {
  const componentIds = Array.isArray(row.componentIds)
    ? row.componentIds.filter((value): value is string => typeof value === "string")
    : [];
  const sourceEvidenceTimes = componentIds
    .map((id) => sourceCutoffByComponent.get(id))
    .filter((value): value is string => Boolean(value));
  const unknownComponentIds = componentIds.filter((id) => !sourceCutoffByComponent.has(id));
  const sourceEvidenceComplete = componentIds.length > 0 && unknownComponentIds.length === 0;
  if (!sourceEvidenceComplete) incompleteComponentProvenance += 1;
  if (sourceEvidenceTimes.some((value) => Date.parse(value) > row.featureCutoff.getTime())) {
    sourceCutoffViolations += 1;
  }
  if (!forecasted.has(row.snapshotId)) snapshotsWithoutPersistedPredictionTime += 1;

  const features = object(row.features);
  const homeOffense = object(object(features.home).offense);
  const currentSeasonHome = object(homeOffense.currentSeasonHome);
  const currentSeasonAway = object(homeOffense.currentSeasonAway);
  if (currentSeasonHome.games === 0
    && typeof currentSeasonAway.games === "number" && currentSeasonAway.games > 0) {
    homeSplitCasingDefects += 1;
  }
  const sampleValues = Object.values(object(row.sampleSizes)).map(object);
  if (sampleValues.some((sample) =>
    typeof sample.eligibleBullpenGames === "number" && sample.eligibleBullpenGames > 1_000)) {
    bullpenMultiVersionAmplificationCandidates += 1;
  }

  const input: LiveContractInput = {
    gameId: row.gameId,
    scheduledFirstPitch: row.scheduledFirstPitch.toISOString(),
    featureCutoff: row.featureCutoff.toISOString(),
    predictionTime: row.featureCutoff.toISOString(),
    sourceEvidenceTimes,
    sourceEvidenceComplete: sourceEvidenceComplete as true,
    evidenceTier: row.evidenceTier as EvidenceTier,
    schemaVersion: MLB_V4_INPUT_SCHEMA,
    pitSafe: row.pitSafe as true,
    features: row.features as LiveContractInput["features"],
  };
  try {
    const first = adaptLiveMlbV4Input(input);
    const second = adaptLiveMlbV4Input(input);
    if (first.adapterHash === second.adapterHash && first.vectorHash === second.vectorHash) {
      deterministicReplays += 1;
    }
    if (first.fullVectorEligible) fullVectorEligible += 1;
    for (const feature of first.missingFeatures) {
      missingByFeature.set(feature, (missingByFeature.get(feature) ?? 0) + 1);
    }
    vectorHashes.push(first.vectorHash);
  } catch (error) {
    errors.push({ snapshotId: row.snapshotId, error: error instanceof Error ? error.message : String(error) });
  }
}

const semanticKeys = new Map<string, Set<string>>();
for (const row of snapshots) {
  const key = `${row.gameId}\u0000${row.featureCutoff.toISOString()}`;
  const hashes = semanticKeys.get(key) ?? new Set<string>();
  hashes.add(row.artifactHash);
  semanticKeys.set(key, hashes);
}

console.log(JSON.stringify({
  audit: "mlb-v4-input-contract-238-read-only",
  generatedFromEnvironment: "development",
  contractId: MLB_V4_INPUT_CONTRACT.contractId,
  contractHash: MLB_V4_INPUT_CONTRACT.contractHash,
  normalizationHash: MLB_V4_NORMALIZATION_HASH,
  historicalAdapterHash: MLB_V4_HISTORICAL_ADAPTER_HASH,
  liveAdapterHash: MLB_V4_LIVE_ADAPTER_HASH,
  snapshotSchema: MLB_V4_INPUT_SCHEMA,
  snapshots: snapshots.length,
  games: new Set(snapshots.map((row) => row.gameId)).size,
  evidenceTiers: Object.fromEntries([...new Set(snapshots.map((row) => row.evidenceTier))]
    .sort().map((tier) => [tier, snapshots.filter((row) => row.evidenceTier === tier).length])),
  baselineCoreEligible: snapshots.filter((row) => row.baselineCoreEligible).length,
  starterCoreEligible: snapshots.filter((row) => row.starterCoreEligible).length,
  enhancedEligible: snapshots.filter((row) => row.enhancedEligible).length,
  adapterSuccesses: snapshots.length - errors.length,
  adapterErrors: errors,
  deterministicReplays,
  duplicateSemanticKeysWithDifferentHashes: [...semanticKeys.values()].filter((hashes) => hashes.size > 1).length,
  sourceCutoffViolations,
  incompleteComponentProvenance,
  fullVectorEligible,
  invalidCanonicalVectors: snapshots.length - fullVectorEligible,
  snapshotsWithoutPersistedPredictionTime,
  homeSplitCasingDefects,
  bullpenMultiVersionAmplificationCandidates,
  missingByFeature: Object.fromEntries([...missingByFeature.entries()].sort(([a], [b]) => a.localeCompare(b))),
  statusCounts: Object.fromEntries(
    ["PASS", "PARTIAL", "FAIL", "NOT_AVAILABLE", "PROSPECTIVE_ONLY"]
      .map((status) => [status, MLB_V4_FEATURE_DEFINITIONS.filter((feature) => feature.status === status).length]),
  ),
  canonicalVectorSetHash: stableHash([...vectorHashes].sort()),
}, null, 2));