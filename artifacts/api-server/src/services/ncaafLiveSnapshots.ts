import { and, desc, eq, gt, gte, lt, lte } from "drizzle-orm";
import { db, ncaafFootballIntelligenceSnapshotsTable as snapshots } from "@workspace/db";

/** Select the authoritative snapshot in PostgreSQL, before transferring JSON.
 * The append-only ledger can contain thousands of captures per fixture.
 * Never hydrate that entire population just to discard older versions in JS. */
export function latestNcaafPregameSnapshotsQuery(
  now: Date,
  options: { eventId?: string; start?: Date; end?: Date } = {},
) {
  const filters = [
    eq(snapshots.season, 2026),
    gt(snapshots.kickoffAt, now),
    lte(snapshots.dataCutoffAt, now),
    lt(snapshots.dataCutoffAt, snapshots.kickoffAt),
  ];
  if (options.eventId) {
    filters.push(eq(snapshots.targetProvider, "espn"), eq(snapshots.targetEventId, options.eventId));
  }
  if (options.start) filters.push(gte(snapshots.kickoffAt, options.start));
  if (options.end) filters.push(lt(snapshots.kickoffAt, options.end));
  return db.selectDistinctOn([snapshots.targetProvider, snapshots.targetEventId])
    .from(snapshots)
    .where(and(...filters))
    .orderBy(snapshots.targetProvider, snapshots.targetEventId, desc(snapshots.dataCutoffAt), desc(snapshots.id));
}