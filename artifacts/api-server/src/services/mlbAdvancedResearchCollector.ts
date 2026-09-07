/**
 * #214B live-forward collector.  It only reads immutable #213 rows already
 * captured before first pitch; it never calls a provider or model code.
 */
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  db, gamesTable, mlbBullpenPregameSnapshotsTable, mlbContextSnapshotsTable,
  mlbFeatureSnapshotsTable, mlbLineupRevisionsTable, mlbStarterPregameSnapshotsTable,
  mlbLeagueRunEnvironmentTable, mlbAdvancedFeatureSnapshotsTable, providerMappingsTable, playersTable,
} from "@workspace/db";
import { captureAdvancedFeatureSnapshot, captureAdvancedResearchEvidence, type AdvancedDomain, type HistoricalAvailability } from "./mlbAdvancedData";
import { assignMlbCohort } from "./mlbPointInTime";

export const LIVE_FORWARD_ADVANCED_CANDIDATES = [
  ["starter_conventional", "pitcher_conventional", "PARTIAL_HISTORICAL_PIT"],
  ["probable_starter_identity", "starter_availability", "PARTIAL_HISTORICAL_PIT"],
  ["lineup_identity_order", "lineup", "PARTIAL_HISTORICAL_PIT"],
  ["bullpen_workload_availability", "bullpen_availability", "PARTIAL_HISTORICAL_PIT"],
  ["park_run_factor", "park", "FULL_HISTORICAL_PIT"],
  ["weather_context", "weather", "NO_RELIABLE_HISTORY"],
] as const;

type Candidate = typeof LIVE_FORWARD_ADVANCED_CANDIDATES[number];
export interface AdvancedCollectionResult { snapshotId: number | null; gameId: string; captured: string[]; skipped: string[] }

function safeSourceTime(retrievedAt: Date, cutoff: Date): boolean {
  return retrievedAt <= cutoff;
}
export function providerIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return ids;
  if (Array.isArray(value)) { value.forEach((item) => providerIds(item, ids)); return ids; }
  const row = value as Record<string, unknown>;
  for (const key of ["providerPlayerId", "playerId"]) if (row[key] != null) ids.add(String(row[key]));
  Object.values(row).forEach((item) => providerIds(item, ids));
  return ids;
}
export function removeNamesAndAttachMappings(value: unknown, mappings: Map<string, number>): unknown {
  if (Array.isArray(value)) return value.map((item) => removeNamesAndAttachMappings(item, mappings));
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>; const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(row)) {
    if (/name/i.test(key)) continue;
    out[key] = removeNamesAndAttachMappings(item, mappings);
  }
  const providerId = row.providerPlayerId ?? row.playerId;
  if (providerId != null) {
    const canonicalPlayerId = mappings.get(String(providerId)) ?? null;
    out.canonicalPlayerId = canonicalPlayerId;
    out.identityState = canonicalPlayerId == null ? "UNMAPPED" : "MAPPED";
  }
  return out;
}
export function isLiveForwardCollectionWindow(createdAt: Date, cutoff: Date, gameStart: Date, now: Date): boolean {
  return createdAt >= new Date(now.getTime() - 2 * 60 * 60_000) && cutoff < now && gameStart >= now && cutoff < gameStart;
}

/** Collect a single exact canonical revision. No inferred/latest revision lookup. */
export async function collectAdvancedResearchForCanonicalSnapshot(canonicalSnapshotId: number): Promise<AdvancedCollectionResult> {
  const [base] = await db.select().from(mlbFeatureSnapshotsTable)
    .where(eq(mlbFeatureSnapshotsTable.id, canonicalSnapshotId)).limit(1);
  if (!base) throw new Error("canonical #213 snapshot not found");
  if (base.revisionState !== "FINAL_PREGAME") throw new Error("only exact #213 FINAL_PREGAME snapshots are eligible");
  if (!(base.pointInTimeCutoff < base.gameStartTime)) throw new Error("canonical #213 snapshot is not PIT-safe");

  const [starters, lineups, bullpens, contexts, league] = await Promise.all([
    db.select().from(mlbStarterPregameSnapshotsTable).where(eq(mlbStarterPregameSnapshotsTable.featureSnapshotId, base.id)),
    db.select().from(mlbLineupRevisionsTable).where(eq(mlbLineupRevisionsTable.featureSnapshotId, base.id)),
    db.select().from(mlbBullpenPregameSnapshotsTable).where(eq(mlbBullpenPregameSnapshotsTable.featureSnapshotId, base.id)),
    db.select().from(mlbContextSnapshotsTable).where(eq(mlbContextSnapshotsTable.featureSnapshotId, base.id)),
    db.select().from(mlbLeagueRunEnvironmentTable).where(and(eq(mlbLeagueRunEnvironmentTable.targetGameId, base.gameId),
      lte(mlbLeagueRunEnvironmentTable.cutoffAt, base.pointInTimeCutoff))).orderBy(desc(mlbLeagueRunEnvironmentTable.cutoffAt)).limit(1),
  ]);
  const ids = [...providerIds(starters), ...providerIds(lineups), ...providerIds(bullpens)];
  const mappings = new Map<string, number>();
  if (ids.length) {
    const mapped = await db.select({ providerId: providerMappingsTable.providerId, canonicalPlayerId: playersTable.id })
      .from(providerMappingsTable).innerJoin(playersTable, eq(playersTable.id, providerMappingsTable.tbmEntityId))
      .where(and(eq(providerMappingsTable.provider, "mlb_stats_api"), eq(providerMappingsTable.entityType, "player"),
        eq(providerMappingsTable.tbmEntityType, "player"), inArray(providerMappingsTable.providerId, ids)));
    mapped.forEach((row) => mappings.set(row.providerId, row.canonicalPlayerId));
  }
  const payloads: Partial<Record<Candidate[0], unknown>> = {
    starter_conventional: starters.map(({ metrics, projectedInnings, projectedRunsAllowed, teamSide, providerPlayerId, confirmationState, handedness }) =>
      removeNamesAndAttachMappings({ teamSide, providerPlayerId, confirmationState, handedness, metrics, projectedInnings, projectedRunsAllowed }, mappings)),
    probable_starter_identity: starters.map(({ teamSide, providerPlayerId, confirmationState, handedness }) =>
      removeNamesAndAttachMappings({ teamSide, providerPlayerId, confirmationState, handedness }, mappings)),
    lineup_identity_order: lineups.map(({ teamSide, lineupState, lineupCompletenessPct, players, confirmedAt }) =>
      removeNamesAndAttachMappings({ teamSide, lineupState, lineupCompletenessPct, players, confirmedAt }, mappings)),
    bullpen_workload_availability: bullpens.map(({ teamSide, weightedPitches, fatigueState, relievers, unsupportedFeatures }) =>
      removeNamesAndAttachMappings({ teamSide, weightedPitches, fatigueState, relievers, unsupportedFeatures }, mappings)),
    park_run_factor: contexts.map(({ venue, parkId, parkFactor, parkFactorVersion, parkQualityState, parkFallbackUsed }) =>
      ({ venue, parkId, parkFactor, parkFactorVersion, parkQualityState, parkFallbackUsed })),
    weather_context: contexts.map(({ weather, weatherQualityState, context }) => ({ weather, weatherQualityState, context })),
  };
  const domainRows: Record<string, Array<{ retrievedAt: Date }>> = {
    starter_conventional: starters, probable_starter_identity: starters, lineup_identity_order: lineups,
    bullpen_workload_availability: bullpens, park_run_factor: contexts, weather_context: contexts,
  };
  const captured: string[] = []; const skipped: string[] = []; const hashes: Record<string, string> = {};
  for (const [feature, domain, history] of LIVE_FORWARD_ADVANCED_CANDIDATES) {
    const values = payloads[feature];
    if (!values || (Array.isArray(values) && values.length === 0)) { skipped.push(`${feature}:missing`); continue; }
    // Child rows have their own retrieved timestamp. Never carry a late child into this revision.
    if (domainRows[feature].some((row) => !safeSourceTime(row.retrievedAt, base.pointInTimeCutoff))) { skipped.push(`${feature}:late_source`); continue; }
    const hash = await captureAdvancedResearchEvidence({
      domain: domain as AdvancedDomain, provider: "canonical_213_provider_backed", providerRecordId: String(base.id),
      gameId: base.gameId, retrievedAt: base.pointInTimeCutoff, effectiveAt: base.pointInTimeCutoff,
      statThroughAt: base.pointInTimeCutoff, cutoff: base.pointInTimeCutoff, gameStart: base.gameStartTime,
      qualityState: "VALID", historicalAvailability: history as HistoricalAvailability,
      values: { feature, canonicalFeatureSnapshotId: base.id, records: values }, rawPayload: { feature, canonicalSnapshotId: base.id, values },
    });
    hashes[feature] = hash; captured.push(feature);
  }
  const leagueRow = league[0];
  if (leagueRow) {
    const hash = await captureAdvancedResearchEvidence({
      domain: "league_environment", provider: "internal_pit_ledger", providerRecordId: String(leagueRow.id), gameId: base.gameId,
      retrievedAt: leagueRow.cutoffAt, statThroughAt: leagueRow.cutoffAt, cutoff: base.pointInTimeCutoff, gameStart: base.gameStartTime,
      qualityState: leagueRow.qualityState, historicalAvailability: "FULL_HISTORICAL_PIT",
      values: { runsPerTeamGame: leagueRow.runsPerTeamGame, homeRunsPerGame: leagueRow.homeRunsPerGame, awayRunsPerGame: leagueRow.awayRunsPerGame, sampleGames: leagueRow.sampleGames, leagueEnvironmentId: leagueRow.id },
      rawPayload: { leagueEnvironmentId: leagueRow.id, inputHash: leagueRow.inputHash },
    }); hashes.league_run_environment = hash; captured.push("league_run_environment");
  } else skipped.push("league_run_environment:missing");
  if (!captured.length) return { snapshotId: null, gameId: base.gameId, captured, skipped };
  const domainStatuses = Object.fromEntries([...LIVE_FORWARD_ADVANCED_CANDIDATES.map(([feature]) => feature), "league_run_environment"]
    .map((feature) => [feature, captured.includes(feature) ? "PRESENT" : skipped.some((entry) => entry === `${feature}:late_source`) ? "STALE" : "MISSING"]));
  const identityTotal = ids.length;
  const snapshotId = await captureAdvancedFeatureSnapshot({
    gameId: base.gameId, canonicalFeatureSnapshotId: base.id, revisionState: "FINAL_PREGAME",
    cutoff: base.pointInTimeCutoff, gameStart: base.gameStartTime, evidenceHashes: hashes,
    features: { collectionMode: "LIVE_FORWARD_CANONICAL_DERIVED", domainStatuses, captured, skipped,
      identityCoverage: { providerIdsObserved: identityTotal, canonicalIdsMapped: mappings.size, unmapped: Math.max(0, identityTotal - mappings.size) } },
    quality: { canonicalSnapshotId: base.id, providerCalls: 0 }, sampleReliability: {},
    leakageMetadata: { exactCanonicalSnapshotId: base.id, finalPregameOnly: true, postgameExcluded: true },
  });
  return { snapshotId, gameId: base.gameId, captured, skipped };
}

/** Bounded scheduler entrypoint: only newly-created, still-pregame MLB finals. */
export async function collectLiveForwardAdvancedResearch(now = new Date(), limit = 20): Promise<AdvancedCollectionResult[]> {
  const rows = await db.select({ id: mlbFeatureSnapshotsTable.id }).from(mlbFeatureSnapshotsTable)
    .innerJoin(gamesTable, eq(gamesTable.id, mlbFeatureSnapshotsTable.gameId))
    .where(and(eq(gamesTable.sport, "MLB"), eq(mlbFeatureSnapshotsTable.revisionState, "FINAL_PREGAME"),
      lte(mlbFeatureSnapshotsTable.pointInTimeCutoff, now), gte(mlbFeatureSnapshotsTable.gameStartTime, now)))
    .orderBy(desc(mlbFeatureSnapshotsTable.gameStartTime)).limit(Math.max(1, Math.min(limit * 4, 80)));
  const existing = rows.length ? await db.select({ canonicalFeatureSnapshotId: mlbAdvancedFeatureSnapshotsTable.canonicalFeatureSnapshotId })
    .from(mlbAdvancedFeatureSnapshotsTable).where(inArray(mlbAdvancedFeatureSnapshotsTable.canonicalFeatureSnapshotId, rows.map((row) => row.id))) : [];
  const collected = new Set(existing.map((row) => row.canonicalFeatureSnapshotId));
  const results: AdvancedCollectionResult[] = [];
  for (const row of rows.filter((row) => !collected.has(row.id)).slice(0, Math.max(1, Math.min(limit, 20)))) {
    const result = await collectAdvancedResearchForCanonicalSnapshot(row.id);
    // Assignment happens only for rows discovered inside the live pregame window;
    // historical/manual collection can never manufacture LIVE_SHADOW membership.
    if (result.snapshotId != null) await assignMlbCohort(result.gameId, "LIVE_SHADOW", "214B live-forward FINAL_PREGAME collector");
    results.push(result);
  }
  return results;
}