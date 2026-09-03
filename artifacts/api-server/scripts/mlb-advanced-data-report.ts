/** Read-only #214 operational report. Usage: report:mlb-advanced-data [cohort] [from] [to]. */
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import {
  db, gamesTable, mlbAdvancedFeatureSnapshotsTable, mlbAdvancedResearchEvidenceTable, mlbOosCohortsTable,
  mlbMarketSnapshotsTable, mlbStarterOutcomesTable, mlbForecastEvaluationsTable, mlbForecastEvidenceTable,
} from "@workspace/db";
import { LIVE_FORWARD_CANDIDATE_NEEDS_OOS, MLB_215_READY_FEATURES, MLB_215_UNAVAILABLE_FEATURES, MLB_ADVANCED_FEATURE_REGISTRY, NOT_SUPPORTED, PARTIAL_OR_INCONSISTENT } from "../src/services/mlbAdvancedFeatureRegistry";
import { distinctGameCount, isLateMarketState, isTrueClosingMarketState, percentage } from "../src/services/mlbAdvancedReportHelpers";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const [cohort = "LIVE_SHADOW", from, to] = args;
if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
  throw new Error("Usage: report:mlb-advanced-data [cohort] [YYYY-MM-DD from] [YYYY-MM-DD to]");
}
const dateConditions = [eq(gamesTable.sport, "MLB"), ...(from ? [gte(gamesTable.gameDate, from)] : []), ...(to ? [lte(gamesTable.gameDate, to)] : [])];
const cohorts = await db.select({ gameId: mlbOosCohortsTable.gameId }).from(mlbOosCohortsTable)
  .innerJoin(gamesTable, eq(gamesTable.id, mlbOosCohortsTable.gameId))
  .where(and(eq(mlbOosCohortsTable.cohort, cohort), ...dateConditions));
const cohortGameIds = [...new Set(cohorts.map((row) => row.gameId))];
const scopedConditions = cohort === "LIVE_SHADOW"
  ? [...dateConditions, inArray(gamesTable.id, cohortGameIds)]
  : dateConditions;
const [evidence, snapshots, markets, starterOutcomes, evaluations] = await Promise.all([
  db.select({
    gameId: mlbAdvancedResearchEvidenceTable.gameId, domain: mlbAdvancedResearchEvidenceTable.domain, provider: mlbAdvancedResearchEvidenceTable.provider,
    quality: mlbAdvancedResearchEvidenceTable.qualityState, reliability: mlbAdvancedResearchEvidenceTable.sampleReliability,
    historical: mlbAdvancedResearchEvidenceTable.historicalAvailability, retrievedAt: mlbAdvancedResearchEvidenceTable.retrievedAt,
    cutoff: mlbAdvancedResearchEvidenceTable.pointInTimeCutoff, values: mlbAdvancedResearchEvidenceTable.values,
  }).from(mlbAdvancedResearchEvidenceTable).innerJoin(gamesTable, eq(gamesTable.id, mlbAdvancedResearchEvidenceTable.gameId)).where(and(...scopedConditions)),
  db.select({
    state: mlbAdvancedFeatureSnapshotsTable.revisionState, cutoff: mlbAdvancedFeatureSnapshotsTable.pointInTimeCutoff,
    start: mlbAdvancedFeatureSnapshotsTable.gameStartTime,
  }).from(mlbAdvancedFeatureSnapshotsTable).innerJoin(gamesTable, eq(gamesTable.id, mlbAdvancedFeatureSnapshotsTable.gameId)).where(and(...scopedConditions)),
  db.select({ gameId: mlbMarketSnapshotsTable.gameId, state: mlbMarketSnapshotsTable.state, quality: mlbMarketSnapshotsTable.qualityState,
    capturedAt: mlbMarketSnapshotsTable.capturedAt }).from(mlbMarketSnapshotsTable).innerJoin(gamesTable, eq(gamesTable.id, mlbMarketSnapshotsTable.gameId)).where(and(...scopedConditions)),
  db.select({ gameId: mlbStarterOutcomesTable.gameId }).from(mlbStarterOutcomesTable).innerJoin(gamesTable, eq(gamesTable.id, mlbStarterOutcomesTable.gameId)).where(and(...scopedConditions)),
  db.select({ gameId: mlbForecastEvaluationsTable.gameId }).from(mlbForecastEvaluationsTable)
    .innerJoin(mlbForecastEvidenceTable, eq(mlbForecastEvidenceTable.id, mlbForecastEvaluationsTable.forecastEvidenceId))
    .innerJoin(gamesTable, eq(gamesTable.id, mlbForecastEvidenceTable.gameId)).where(and(...scopedConditions)),
]);
const tally = <T extends string>(values: readonly T[]) => Object.fromEntries([...new Set(values)].sort().map((key) => [key, values.filter((value) => value === key).length]));
const domains = Object.fromEntries([...new Set(evidence.map((row) => row.domain))].sort().map((domain) => {
  const rows = evidence.filter((row) => row.domain === domain);
  return [domain, { records: rows.length, missing: rows.filter((row) => ["MISSING", "UNAVAILABLE", "INVALID"].includes(row.quality)).length }];
}));
const liveDomains = new Set(evidence.map((row) => row.domain));
const sixCandidateDomains = ["pitcher_conventional", "starter_availability", "lineup", "bullpen_availability", "park", "weather"];
const providers = Object.fromEntries([...new Set(evidence.map((row) => row.provider))].sort().map((provider) => {
  const rows = evidence.filter((row) => row.provider === provider);
  const latest = rows.reduce<Date | null>((current, row) => !current || row.retrievedAt > current ? row.retrievedAt : current, null);
  return [provider, { records: rows.length, lastSuccessAt: latest?.toISOString() ?? null, failures: rows.filter((row) => ["MISSING", "UNAVAILABLE", "INVALID"].includes(row.quality)).length }];
}));
const capturedGameIds = new Set(evidence.map((row) => row.gameId).filter((id): id is string => id != null));
const featureRecords = (domain: string) => evidence.filter((row) => row.domain === domain);
const records = (domain: string) => featureRecords(domain).flatMap((row) => {
  const values = row.values as { records?: unknown[] };
  return Array.isArray(values?.records) ? values.records : [];
}) as Array<Record<string, unknown>>;
const hasConfirmedStarter = records("starter_availability").some((row) => row.confirmationState === "CONFIRMED");
const lineupRecords = records("lineup");
const completeLineups = lineupRecords.filter((row) => Array.isArray(row.players) && row.players.length === 9).length;
const identityRows = evidence.flatMap((row) => {
  const values = row.values as { records?: Array<{ identityState?: unknown }> };
  return values.records?.filter((item) => item.identityState != null) ?? [];
});
console.log(JSON.stringify({
  schemaVersion: "mlb-advanced-data-report-v1", readOnly: true, modelUsage: "CAPTURED_RESEARCH_ONLY",
  cohort, from: from ?? null, to: to ?? null, cohortGames: cohortGameIds.length,
  strictEligibility: {
    READY_FOR_215: MLB_215_READY_FEATURES,
    LIVE_FORWARD_CANDIDATE_NEEDS_OOS,
    PARTIAL_OR_INCONSISTENT,
    NOT_SUPPORTED,
  },
  coverage: { evidenceRecords: evidence.length, snapshots: snapshots.length, finalPregameSnapshots: snapshots.filter((row) => row.state === "FINAL_PREGAME").length, domains,
    candidateDomainCompleteness: Object.fromEntries(sixCandidateDomains.map((domain) => [domain, liveDomains.has(domain)])),
    candidateDomainsCaptured: sixCandidateDomains.filter((domain) => liveDomains.has(domain)).length,
    candidateDomainTarget: sixCandidateDomains.length,
    eligibleGames: cohort === "LIVE_SHADOW" ? cohortGameIds.length : null, capturedGames: capturedGameIds.size,
    capturedGamePctOfEligible: cohort === "LIVE_SHADOW" ? percentage(capturedGameIds.size, cohortGameIds.length) : null,
    confirmedStarterRecords: hasConfirmedStarter ? 1 : 0, completeNinePlayerLineups: completeLineups,
    mappingCoverage: { mapped: identityRows.filter((row) => row.identityState === "MAPPED").length, unmapped: identityRows.filter((row) => row.identityState === "UNMAPPED").length } },
  missingness: tally(evidence.map((row) => row.quality)), providerHealth: providers,
  pitIntegrity: { snapshotsAtOrAfterStart: snapshots.filter((row) => row.cutoff >= row.start).length, evidenceRetrievedAfterCutoff: evidence.filter((row) => row.retrievedAt > row.cutoff).length },
  sampleReliability: tally(evidence.map((row) => row.reliability)), historicalAvailability: tally(evidence.map((row) => row.historical)),
  liveForwardAvailability: tally(MLB_ADVANCED_FEATURE_REGISTRY.map((feature) => feature.currentLiveAvailability)),
  liveOosCounters: { cohort, assignedGames: cohortGameIds.length, finalPregameSnapshots: snapshots.filter((row) => row.state === "FINAL_PREGAME").length,
    evidenceRecords: evidence.length, note: "Counts only persisted rows; no historical backfill is inferred." },
  postgameLinkage: { starterOutcomeGames: distinctGameCount(starterOutcomes),
    evaluatedForecastGames: distinctGameCount(evaluations),
    linkedCapturedGames: [...capturedGameIds].filter((id) => starterOutcomes.some((row) => row.gameId === id) || evaluations.some((row) => row.gameId === id)).length },
  marketCoverage: { observations: markets.length, gamesWithObservation: new Set(markets.map((row) => row.gameId)).size,
    lateObservations: markets.filter((row) => isLateMarketState(row.state)).length,
    trueClosingObservations: markets.filter((row) => isTrueClosingMarketState(row.state)).length,
    closingQuality: tally(markets.filter((row) => isTrueClosingMarketState(row.state)).map((row) => row.quality)),
    lateQuality: tally(markets.filter((row) => row.state !== "EARLY_MARKET").map((row) => row.quality)) },
  availableFor215: MLB_215_READY_FEATURES.map((feature) => feature.feature),
  unavailableFor215: MLB_215_UNAVAILABLE_FEATURES.map((feature) => feature.feature),
  registry: MLB_ADVANCED_FEATURE_REGISTRY,
}, null, 2));