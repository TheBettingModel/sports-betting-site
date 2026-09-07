import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  mlbHistoricalArtifactsTable,
  mlbHistoricalExclusionsTable,
  mlbHistoricalGamesTable,
  mlbHistoricalOutcomesTable,
  mlbHistoricalSplitsTable,
  mlbHistoricalTeamGameRowsTable,
} from "@workspace/db";
import { stableHistoricalJson } from "../src/services/mlbHistoricalSource";
import { MLB_HISTORICAL_APPEND_ONLY_TABLES } from "../src/services/mlbHistoricalAppendOnly";

const ARTIFACT_KEY = "mlb-historical-2023-2026-v1";
const SCHEMA_VERSION = "mlb-chronological-team-game-v1";
const SPLIT_VERSION = "mlb-chronological-split-2023-2026-v1";
const SPLIT_RULE = "season<=2024 TRAIN; season=2025 VALIDATION; season>=2026 LOCKED_OOS";

function hash(value: unknown): string {
  return createHash("sha256").update(stableHistoricalJson(value)).digest("hex");
}

const [artifact] = await db.select().from(mlbHistoricalArtifactsTable).where(and(
  eq(mlbHistoricalArtifactsTable.schemaVersion, SCHEMA_VERSION),
  eq(mlbHistoricalArtifactsTable.artifactKey, ARTIFACT_KEY),
)).limit(1);

const rows = await db.select({
  canonicalGameId: mlbHistoricalTeamGameRowsTable.canonicalGameId,
  schemaVersion: mlbHistoricalTeamGameRowsTable.schemaVersion,
  artifactKey: mlbHistoricalTeamGameRowsTable.artifactKey,
  providerGameId: mlbHistoricalTeamGameRowsTable.providerGameId,
  season: mlbHistoricalTeamGameRowsTable.season,
  teamSide: mlbHistoricalTeamGameRowsTable.teamSide,
  canonicalTeamId: mlbHistoricalTeamGameRowsTable.canonicalTeamId,
  opponentCanonicalTeamId: mlbHistoricalTeamGameRowsTable.opponentCanonicalTeamId,
  checksum: mlbHistoricalTeamGameRowsTable.checksum,
  featureCutoff: mlbHistoricalTeamGameRowsTable.featureCutoff,
  scheduledFirstPitch: mlbHistoricalTeamGameRowsTable.scheduledFirstPitch,
  pitLineage: mlbHistoricalTeamGameRowsTable.pitLineage,
  coreFeatures: mlbHistoricalTeamGameRowsTable.coreFeatures,
  enhancedFeatures: mlbHistoricalTeamGameRowsTable.enhancedFeatures,
  eligibilityState: mlbHistoricalTeamGameRowsTable.eligibilityState,
  completionBoundaryState: mlbHistoricalTeamGameRowsTable.completionBoundaryState,
  targets: mlbHistoricalTeamGameRowsTable.targets,
  starterState: mlbHistoricalTeamGameRowsTable.starterState,
  lineupState: mlbHistoricalTeamGameRowsTable.lineupState,
  missingness: mlbHistoricalTeamGameRowsTable.missingness,
  sourceVersions: mlbHistoricalTeamGameRowsTable.sourceVersions,
  sourceHashes: mlbHistoricalTeamGameRowsTable.sourceHashes,
  quality: mlbHistoricalTeamGameRowsTable.quality,
}).from(mlbHistoricalTeamGameRowsTable).where(and(
  eq(mlbHistoricalTeamGameRowsTable.schemaVersion, SCHEMA_VERSION),
  eq(mlbHistoricalTeamGameRowsTable.artifactKey, ARTIFACT_KEY),
)).orderBy(
  asc(mlbHistoricalTeamGameRowsTable.scheduledFirstPitch),
  asc(mlbHistoricalTeamGameRowsTable.providerGameId),
  asc(mlbHistoricalTeamGameRowsTable.teamSide),
);

const replayBasis = rows.map((row) => [row.canonicalGameId, row.teamSide, row.checksum]);
const replayChecksum = createHash("sha256").update(stableHistoricalJson(replayBasis)).digest("hex");
const marketPattern = /moneyline|sportsbook|closingLine|impliedProbability/i;
const invalidCutoffs = rows.filter((row) => row.featureCutoff >= row.scheduledFirstPitch).length;
const marketLeakage = rows.filter((row) =>
  (row.pitLineage as Record<string, unknown>).sportsbookFieldsPresent !== false
  || marketPattern.test(JSON.stringify({ core: row.coreFeatures, enhanced: row.enhancedFeatures }))).length;
const outcomesEmbeddedInFeatures = rows.filter((row) =>
  Object.keys((row.targets ?? {}) as Record<string, unknown>).length > 0).length;
const invalidFeatureHashes = rows.filter((row) => row.checksum !== hash({
  schemaVersion: row.schemaVersion,
  artifactKey: row.artifactKey,
  canonicalGameId: row.canonicalGameId,
  providerGameId: row.providerGameId,
  season: row.season,
  teamSide: row.teamSide,
  canonicalTeamId: row.canonicalTeamId,
  opponentCanonicalTeamId: row.opponentCanonicalTeamId,
  scheduledFirstPitch: row.scheduledFirstPitch.toISOString().replace(".000Z", "Z"),
  featureCutoff: row.featureCutoff.toISOString(),
  starterState: row.starterState,
  lineupState: row.lineupState,
  completionBoundaryState: row.completionBoundaryState,
  eligibilityState: row.eligibilityState,
  coreFeatures: row.coreFeatures,
  enhancedFeatures: row.enhancedFeatures,
  missingness: row.missingness,
  sourceVersions: row.sourceVersions,
  sourceHashes: row.sourceHashes,
  pitLineage: row.pitLineage,
  quality: row.quality,
})).length;
const proxyCompletionBoundaries = rows.filter((row) =>
  row.completionBoundaryState === "NORMAL_GAME_PROXY").length;
const duplicateRows = await db.select({
  duplicateGroups: sql<number>`count(*)`,
}).from(sql`(
  select canonical_game_id, team_side
  from mlb_historical_team_game_rows
  where schema_version = ${SCHEMA_VERSION}
    and artifact_key = ${ARTIFACT_KEY}
  group by canonical_game_id, team_side
  having count(*) > 1
) duplicates`);
const [outcomes] = await db.select({ count: sql<number>`count(*)` }).from(mlbHistoricalOutcomesTable)
  .where(and(
    eq(mlbHistoricalOutcomesTable.schemaVersion, SCHEMA_VERSION),
    eq(mlbHistoricalOutcomesTable.artifactKey, ARTIFACT_KEY),
  ));
const outcomeRows = await db.select({
  canonicalGameId: mlbHistoricalOutcomesTable.canonicalGameId,
  homeRuns: mlbHistoricalOutcomesTable.homeRuns,
  awayRuns: mlbHistoricalOutcomesTable.awayRuns,
  inningsPlayed: mlbHistoricalOutcomesTable.inningsPlayed,
  sourcePayloadHash: mlbHistoricalOutcomesTable.sourcePayloadHash,
  outcomeHash: mlbHistoricalOutcomesTable.outcomeHash,
}).from(mlbHistoricalOutcomesTable).where(and(
    eq(mlbHistoricalOutcomesTable.schemaVersion, SCHEMA_VERSION),
  eq(mlbHistoricalOutcomesTable.artifactKey, ARTIFACT_KEY),
));
const invalidOutcomeHashes = outcomeRows.filter((row) => row.outcomeHash !== hash({
  canonicalGameId: row.canonicalGameId,
  homeRuns: row.homeRuns,
  awayRuns: row.awayRuns,
  inningsPlayed: row.inningsPlayed,
  sourcePayloadHash: row.sourcePayloadHash,
})).length;
const exclusionRows = await db.select({
  evidence: mlbHistoricalExclusionsTable.evidence,
  evidenceHash: mlbHistoricalExclusionsTable.evidenceHash,
}).from(mlbHistoricalExclusionsTable).where(and(
  eq(mlbHistoricalExclusionsTable.schemaVersion, SCHEMA_VERSION),
  eq(mlbHistoricalExclusionsTable.artifactKey, ARTIFACT_KEY),
));
const invalidExclusionHashes = exclusionRows.filter((row) =>
  row.evidenceHash !== hash(row.evidence)).length;
const splitRows = await db.select({
  cohort: mlbHistoricalSplitsTable.cohort,
  canonicalGameId: mlbHistoricalSplitsTable.canonicalGameId,
  foundationChecksum: mlbHistoricalSplitsTable.foundationChecksum,
  assignmentRule: mlbHistoricalSplitsTable.assignmentRule,
  assignmentHash: mlbHistoricalSplitsTable.assignmentHash,
  immutable: mlbHistoricalSplitsTable.immutable,
  season: mlbHistoricalGamesTable.season,
  count: sql<number>`count(*)`,
}).from(mlbHistoricalSplitsTable)
  .innerJoin(
    mlbHistoricalGamesTable,
    and(
      eq(mlbHistoricalGamesTable.schemaVersion, mlbHistoricalSplitsTable.schemaVersion),
      eq(mlbHistoricalGamesTable.canonicalGameId, mlbHistoricalSplitsTable.canonicalGameId),
    ),
  )
  .where(and(
    eq(mlbHistoricalSplitsTable.schemaVersion, SCHEMA_VERSION),
    eq(mlbHistoricalSplitsTable.splitVersion, SPLIT_VERSION),
    eq(mlbHistoricalSplitsTable.foundationChecksum, artifact?.foundationChecksum ?? "__missing__"),
  ))
  .groupBy(
    mlbHistoricalSplitsTable.cohort,
    mlbHistoricalSplitsTable.canonicalGameId,
    mlbHistoricalSplitsTable.foundationChecksum,
    mlbHistoricalSplitsTable.assignmentRule,
    mlbHistoricalSplitsTable.assignmentHash,
    mlbHistoricalSplitsTable.immutable,
    mlbHistoricalGamesTable.season,
  );
const candidateIds = new Set(rows
  .filter((row) => row.eligibilityState === "PARTIAL_CORE_CANDIDATE")
  .map((row) => row.canonicalGameId));
const featureGameSides = new Map<string, Set<string>>();
for (const row of rows) {
  const sides = featureGameSides.get(row.canonicalGameId) ?? new Set<string>();
  sides.add(row.teamSide);
  featureGameSides.set(row.canonicalGameId, sides);
}
const featureGameIds = new Set(featureGameSides.keys());
const featureSideCoverageViolations = [...featureGameSides.values()].filter((sides) =>
  sides.size !== 2 || !sides.has("home") || !sides.has("away")).length;
const outcomeIds = new Set(outcomeRows.map((row) => row.canonicalGameId));
const outcomeCoverageViolations = [...featureGameIds].filter((id) => !outcomeIds.has(id)).length
  + [...outcomeIds].filter((id) => !featureGameIds.has(id)).length;
const splitIds = new Set(splitRows.map((row) => row.canonicalGameId));
const splitCoverageViolations = [...candidateIds].filter((id) => !splitIds.has(id)).length
  + [...splitIds].filter((id) => !candidateIds.has(id)).length;
const splitChecksumViolations = splitRows.filter((row) =>
  row.foundationChecksum !== artifact?.foundationChecksum).length;
const splitAssignmentViolations = splitRows.filter((row) => {
  const expectedCohort = row.season <= 2024 ? "TRAIN" : row.season === 2025 ? "VALIDATION" : "LOCKED_OOS";
  const expectedHash = hash([
    SCHEMA_VERSION,
    row.canonicalGameId,
    expectedCohort,
    SPLIT_RULE,
  ]);
  return !row.immutable
    || row.cohort !== expectedCohort
    || row.assignmentRule !== SPLIT_RULE
    || row.assignmentHash !== expectedHash;
}).length;
const manifestReplayMismatch = artifact?.replayChecksum !== replayChecksum;
const sourceManifestHashMismatch = artifact
  ? artifact.sourceManifestHash !== hash(artifact.sourceManifest)
  : true;
const splitCounts = new Map<string, number>();
for (const row of splitRows) splitCounts.set(row.cohort, (splitCounts.get(row.cohort) ?? 0) + Number(row.count));
const appendOnlyGuardResult = await db.execute(sql<{
  count: number;
}>`select count(*)::int as count
  from pg_trigger
  where not tgisinternal
    and tgname like 'mlb_historical_%_block_%'`);
const appendOnlyGuardCount = Number(appendOnlyGuardResult.rows[0]?.count ?? 0);

const result = {
  schemaVersion: SCHEMA_VERSION,
  games: featureGameIds.size,
  teamGameRows: rows.length,
  outcomes: Number(outcomes?.count ?? 0),
  featureSideCoverageViolations,
  outcomeCoverageViolations,
  invalidOutcomeHashes,
  invalidFeatureHashes,
  invalidExclusionHashes,
  invalidCutoffs,
  marketLeakage,
  outcomesEmbeddedInFeatures,
  proxyCompletionBoundaries,
  duplicateGroups: Number(duplicateRows[0]?.duplicateGroups ?? 0),
  splitCoverageViolations,
  splitChecksumViolations,
  splitAssignmentViolations,
  artifactStatus: artifact?.status ?? "MISSING",
  manifestReplayMismatch,
  sourceManifestHashMismatch,
  appendOnlyGuardCount,
  splitCounts: Object.fromEntries(splitCounts),
  replayChecksum,
  status: invalidCutoffs === 0
    && marketLeakage === 0
    && outcomesEmbeddedInFeatures === 0
    && invalidOutcomeHashes === 0
    && invalidFeatureHashes === 0
    && invalidExclusionHashes === 0
    && featureSideCoverageViolations === 0
    && outcomeCoverageViolations === 0
    && Number(duplicateRows[0]?.duplicateGroups ?? 0) === 0
    && splitCoverageViolations === 0
    && splitChecksumViolations === 0
    && splitAssignmentViolations === 0
    && !manifestReplayMismatch
    && !sourceManifestHashMismatch
    && appendOnlyGuardCount === MLB_HISTORICAL_APPEND_ONLY_TABLES.length * 2
    && artifact?.status === "SEALED_PARTIAL_FOUNDATION"
    ? "PASS_PARTIAL"
    : "FAIL",
};

console.log(JSON.stringify(result, null, 2));
if (result.status === "FAIL") process.exitCode = 1;