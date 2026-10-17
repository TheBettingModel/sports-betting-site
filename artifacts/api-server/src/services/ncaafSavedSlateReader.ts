import { and, asc, desc, eq, inArray, lt, lte } from "drizzle-orm";
import { db, gamesTable, v4ForecastVersionsTable as snapshots } from "@workspace/db";
import { canonicalV4EngineRegistry } from "./v4Platform";
import { classifyDiscoveredEvent } from "./v4FullSlate";
import { buildSavedNcaafCoverage } from "./ncaafSavedSlate";

/** Serving is read-only and bounded by the requested slate, not ledger history.
 * The existing scheduled capture remains responsible for making projections.
 * Missing evidence must never prevent the rest of a large slate from loading.
 */
export async function readSavedNcaafSlate(sportDate: string, now: Date) {
  const fixtures = await db.select({
    gameId: gamesTable.id, sport: gamesTable.sport, eventStart: gamesTable.startsAt,
    homeParticipantId: gamesTable.homeTeamId, awayParticipantId: gamesTable.awayTeamId,
    homeParticipantName: gamesTable.homeTeamName, awayParticipantName: gamesTable.awayTeamName,
  }).from(gamesTable).where(and(
    eq(gamesTable.sport, "NCAAF"), eq(gamesTable.gameDate, sportDate),
  )).orderBy(asc(gamesTable.startsAt), asc(gamesTable.id));
  const events = fixtures.flatMap(row => {
    const event = classifyDiscoveredEvent(row);
    return event ? [event] : [];
  });
  const engine = canonicalV4EngineRegistry.get("NCAAF");
  const identity = engine?.approvalState === "SUSPENDED" ? undefined : engine?.identity;
  const rows = events.length && identity ? await db.selectDistinctOn([snapshots.gameId], {
    gameId: snapshots.gameId, predictionId: snapshots.predictionId,
    eventStart: snapshots.eventStart, predictedAt: snapshots.predictedAt,
    dataCutoff: snapshots.dataCutoff, featureSnapshotId: snapshots.featureSnapshotId,
    featureHash: snapshots.featureHash, forecastHash: snapshots.forecastHash,
    forecastPayload: snapshots.forecastPayload,
  }).from(snapshots).innerJoin(gamesTable, and(
    eq(gamesTable.id, snapshots.gameId), eq(gamesTable.startsAt, snapshots.eventStart),
  )).where(and(
    eq(snapshots.sport, "NCAAF"),
    inArray(snapshots.gameId, events.map(event => event.gameId)),
    eq(snapshots.modelId, identity.modelId), eq(snapshots.modelVersion, identity.modelVersion),
    eq(snapshots.artifactHash, identity.artifactHash),
    eq(snapshots.contractHash, identity.contractHash),
    eq(snapshots.configurationHash, identity.configurationHash),
    eq(snapshots.parameterHash, identity.parameterHash),
    lt(snapshots.predictedAt, snapshots.eventStart),
    lte(snapshots.predictedAt, now), lte(snapshots.dataCutoff, snapshots.predictedAt),
  )).orderBy(snapshots.gameId, desc(snapshots.predictedAt), desc(snapshots.id)) : [];
  return { events, coverage: buildSavedNcaafCoverage({ events, rows, identity, sportDate, now }) };
}
