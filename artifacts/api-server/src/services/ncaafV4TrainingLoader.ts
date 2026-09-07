import { and, asc, eq } from "drizzle-orm";
import { db, ncaafCfbdDomainEvidenceTable, ncaafGameEvidenceTable, ncaafHistoricalTrainingRowsTable } from "@workspace/db";
import { NCAAF_V2_TRAINING_ARTIFACT_KEY } from "./ncaafV2TrainingMaterializer";
import type { V4Row } from "./ncaafV4ExpectedScore";

/** Read-only V4 projection.  Week is recovered from raw normalized CFBD games;
 * historical artifact rows themselves are never updated. */
export async function loadNcaafV4TrainingRows(database = db): Promise<V4Row[]> {
  const [rows, domainEvidence] = await Promise.all([database.select({
    eventId: ncaafHistoricalTrainingRowsTable.canonicalEventId, season: ncaafHistoricalTrainingRowsTable.season,
    kickoffAt: ncaafHistoricalTrainingRowsTable.kickoffAt, features: ncaafHistoricalTrainingRowsTable.features,
    targets: ncaafHistoricalTrainingRowsTable.targets, checksum: ncaafHistoricalTrainingRowsTable.checksum,
    quality: ncaafHistoricalTrainingRowsTable.quality,
    providerWeek: ncaafGameEvidenceTable.week,
  }).from(ncaafHistoricalTrainingRowsTable).innerJoin(ncaafGameEvidenceTable, and(
    eq(ncaafHistoricalTrainingRowsTable.canonicalEventId, ncaafGameEvidenceTable.providerEventId),
    eq(ncaafHistoricalTrainingRowsTable.season, ncaafGameEvidenceTable.season),
    eq(ncaafGameEvidenceTable.provider, "college_football_data"),
  )).where(eq(ncaafHistoricalTrainingRowsTable.artifactKey, NCAAF_V2_TRAINING_ARTIFACT_KEY))
    .orderBy(asc(ncaafHistoricalTrainingRowsTable.kickoffAt), asc(ncaafHistoricalTrainingRowsTable.canonicalEventId)),
  database.select({
    id: ncaafCfbdDomainEvidenceTable.id,
    gameId: ncaafCfbdDomainEvidenceTable.cfbdGameId,
    season: ncaafCfbdDomainEvidenceTable.season,
    effectiveAt: ncaafCfbdDomainEvidenceTable.providerEffectiveAt,
  }).from(ncaafCfbdDomainEvidenceTable)]);
  const lineageOrigins = Object.fromEntries(domainEvidence.map((item) => [String(item.id), {
    gameId: item.gameId,
    season: item.season,
    effectiveAt: item.effectiveAt?.toISOString() ?? null,
  }]));
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) { const key = `${row.season}:${row.eventId}`; grouped.set(key, [...(grouped.get(key) ?? []), row]); }
  return [...grouped.values()].map((matches) => {
    const weeks = new Set(matches.map(x => x.providerWeek));
    if (weeks.size !== 1 || !Number.isInteger(matches[0]!.providerWeek) || matches[0]!.providerWeek! < 1) throw new Error(`Missing/conflicting CFBD week for ${matches[0]!.eventId}`);
    const row = matches[0]!;
    const revive = (value: unknown): unknown => Array.isArray(value) ? value.map(revive) : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, (k === "effectiveAt" || k === "capturedAt") && typeof v === "string" ? new Date(v) : revive(v)])) : value;
    return Object.freeze({ stableGameId: row.eventId, season: row.season, kickoffAt: row.kickoffAt.toISOString(), week: row.providerWeek,
      features: revive(row.features) as V4Row["features"], targets: row.targets as V4Row["targets"], checksum: row.checksum,
      lineageOrigins, sourceAudit: row.quality as Record<string, unknown> });
  });
}