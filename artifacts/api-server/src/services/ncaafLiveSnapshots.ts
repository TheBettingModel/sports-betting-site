import { and, desc, eq, gt, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db, ncaafFootballIntelligenceSnapshotsTable as snapshots } from "@workspace/db";
import { resolveNcaafEventIdentity } from "./ncaafEventIdentity";


/** Select the authoritative snapshot in PostgreSQL, before transferring JSON.
 * The append-only ledger can contain thousands of captures per fixture.
 * Never hydrate that entire population just to discard older versions in JS. */
export function latestNcaafPregameSnapshotsQuery(
  now: Date,
  options: { eventId?: string; start?: Date; end?: Date } = {},
) {
  // Keep full original rows, but partition ESPN aliases by the physical event.
  const physicalEvent = sql<string>`case when ${snapshots.targetProvider} = 'espn'
    and ${snapshots.targetEventId} ~ '^NCAAF-[0-9]+$'
    then substring(${snapshots.targetEventId} from 7) else ${snapshots.targetEventId} end`;
  const filters = [
    eq(snapshots.season, 2026),
    gt(snapshots.kickoffAt, now),
    lte(snapshots.dataCutoffAt, now),
    lt(snapshots.dataCutoffAt, snapshots.kickoffAt),
  ];
  if (options.eventId) {
    const identity = resolveNcaafEventIdentity("espn", options.eventId);
    filters.push(eq(snapshots.targetProvider, "espn"), identity
      ? inArray(snapshots.targetEventId, identity.aliases) : eq(snapshots.targetEventId, options.eventId));
  }
  if (options.start) filters.push(gte(snapshots.kickoffAt, options.start));
  if (options.end) filters.push(lt(snapshots.kickoffAt, options.end));
  return db.selectDistinctOn([snapshots.targetProvider, physicalEvent])
    .from(snapshots)
    .where(and(...filters))
    .orderBy(snapshots.targetProvider, physicalEvent, desc(snapshots.dataCutoffAt), desc(snapshots.id));
}