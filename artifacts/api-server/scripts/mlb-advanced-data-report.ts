/** Read-only #214 operational report. Usage: report:mlb-advanced-data [cohort] [from] [to]. */
import { and, eq, gte, lte } from "drizzle-orm";
import {
  db, gamesTable, mlbAdvancedFeatureSnapshotsTable, mlbAdvancedResearchEvidenceTable, mlbOosCohortsTable,
} from "@workspace/db";
import { LIVE_FORWARD_CANDIDATE_NEEDS_OOS, MLB_215_READY_FEATURES, MLB_215_UNAVAILABLE_FEATURES, MLB_ADVANCED_FEATURE_REGISTRY, NOT_SUPPORTED, PARTIAL_OR_INCONSISTENT } from "../src/services/mlbAdvancedFeatureRegistry";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const [cohort = "LIVE_SHADOW", from, to] = args;
if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
  throw new Error("Usage: report:mlb-advanced-data [cohort] [YYYY-MM-DD from] [YYYY-MM-DD to]");
}
const dateConditions = [eq(gamesTable.sport, "MLB"), ...(from ? [gte(gamesTable.gameDate, from)] : []), ...(to ? [lte(gamesTable.gameDate, to)] : [])];
const [evidence, snapshots, cohorts] = await Promise.all([
  db.select({
    domain: mlbAdvancedResearchEvidenceTable.domain, provider: mlbAdvancedResearchEvidenceTable.provider,
    quality: mlbAdvancedResearchEvidenceTable.qualityState, reliability: mlbAdvancedResearchEvidenceTable.sampleReliability,
    historical: mlbAdvancedResearchEvidenceTable.historicalAvailability, retrievedAt: mlbAdvancedResearchEvidenceTable.retrievedAt,
    cutoff: mlbAdvancedResearchEvidenceTable.pointInTimeCutoff,
  }).from(mlbAdvancedResearchEvidenceTable).innerJoin(gamesTable, eq(gamesTable.id, mlbAdvancedResearchEvidenceTable.gameId)).where(and(...dateConditions)),
  db.select({
    state: mlbAdvancedFeatureSnapshotsTable.revisionState, cutoff: mlbAdvancedFeatureSnapshotsTable.pointInTimeCutoff,
    start: mlbAdvancedFeatureSnapshotsTable.gameStartTime,
  }).from(mlbAdvancedFeatureSnapshotsTable).innerJoin(gamesTable, eq(gamesTable.id, mlbAdvancedFeatureSnapshotsTable.gameId)).where(and(...dateConditions)),
  db.select({ id: mlbOosCohortsTable.id }).from(mlbOosCohortsTable)
    .innerJoin(gamesTable, eq(gamesTable.id, mlbOosCohortsTable.gameId))
    .where(and(eq(mlbOosCohortsTable.cohort, cohort), ...dateConditions)),
]);
const tally = <T extends string>(values: readonly T[]) => Object.fromEntries([...new Set(values)].sort().map((key) => [key, values.filter((value) => value === key).length]));
const domains = Object.fromEntries([...new Set(evidence.map((row) => row.domain))].sort().map((domain) => {
  const rows = evidence.filter((row) => row.domain === domain);
  return [domain, { records: rows.length, missing: rows.filter((row) => ["MISSING", "UNAVAILABLE", "INVALID"].includes(row.quality)).length }];
}));
const providers = Object.fromEntries([...new Set(evidence.map((row) => row.provider))].sort().map((provider) => {
  const rows = evidence.filter((row) => row.provider === provider);
  const latest = rows.reduce<Date | null>((current, row) => !current || row.retrievedAt > current ? row.retrievedAt : current, null);
  return [provider, { records: rows.length, lastSuccessAt: latest?.toISOString() ?? null, failures: rows.filter((row) => ["MISSING", "UNAVAILABLE", "INVALID"].includes(row.quality)).length }];
}));
console.log(JSON.stringify({
  schemaVersion: "mlb-advanced-data-report-v1", readOnly: true, modelUsage: "CAPTURED_RESEARCH_ONLY",
  cohort, from: from ?? null, to: to ?? null, cohortGames: cohorts.length,
  strictEligibility: {
    READY_FOR_215: MLB_215_READY_FEATURES,
    LIVE_FORWARD_CANDIDATE_NEEDS_OOS,
    PARTIAL_OR_INCONSISTENT,
    NOT_SUPPORTED,
  },
  coverage: { evidenceRecords: evidence.length, snapshots: snapshots.length, finalPregameSnapshots: snapshots.filter((row) => row.state === "FINAL_PREGAME").length, domains },
  missingness: tally(evidence.map((row) => row.quality)), providerHealth: providers,
  pitIntegrity: { snapshotsAtOrAfterStart: snapshots.filter((row) => row.cutoff >= row.start).length, evidenceRetrievedAfterCutoff: evidence.filter((row) => row.retrievedAt > row.cutoff).length },
  sampleReliability: tally(evidence.map((row) => row.reliability)), historicalAvailability: tally(evidence.map((row) => row.historical)),
  liveForwardAvailability: tally(MLB_ADVANCED_FEATURE_REGISTRY.map((feature) => feature.currentLiveAvailability)),
  availableFor215: MLB_215_READY_FEATURES.map((feature) => feature.feature),
  unavailableFor215: MLB_215_UNAVAILABLE_FEATURES.map((feature) => feature.feature),
  registry: MLB_ADVANCED_FEATURE_REGISTRY,
}, null, 2));