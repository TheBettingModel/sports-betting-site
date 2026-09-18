import { and, eq, inArray, isNotNull, like } from "drizzle-orm";
import { db, ncaafEvidenceRunsTable, ncaafGameEvidenceTable } from "@workspace/db";
import { fetchSportGamesByDate, type FetchedGame } from "./espn";
import { normalizeEspnGameEvidence, stablePayloadHash } from "./ncaafEvidenceLedger";
import { processInBatches } from "./schedulerRuntime";

type KickoffRow = { season: number; kickoffAt: Date };
type EspnHistoricalInsert = typeof ncaafGameEvidenceTable.$inferInsert;

export interface NcaafEspnHistoricalBackfillStore {
  loadCfbdKickoffs(seasons: readonly number[]): Promise<KickoffRow[]>;
  loadCompletedDates(): Promise<string[]>;
  insert(rows: readonly EspnHistoricalInsert[]): Promise<number>;
  markCompletedDate(date: string, capturedAt: Date, gameCount: number): Promise<void>;
}

export interface NcaafEspnHistoricalBackfillResult {
  requestedSeasons: number[];
  candidateDates: number;
  alreadyCapturedDates: number;
  attemptedDates: number;
  capturedDates: number;
  fetchedGames: number;
  insertedGames: number;
  remainingDates: number;
  failures: Record<string, string>;
}

const HISTORICAL_DATE_RUN_PREFIX = "ncaaf-espn-historical-date-v2:";

export function ncaafEasternDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).replaceAll("-", "");
}

function historicalInsert(game: FetchedGame, capturedAt: Date): EspnHistoricalInsert {
  const evidence = normalizeEspnGameEvidence(game, capturedAt, capturedAt);
  return {
    provider: evidence.provider,
    providerEventId: evidence.providerEventId,
    capturedAt,
    modeledAsOf: capturedAt,
    season: evidence.season,
    kickoffAt: evidence.kickoffAt,
    week: evidence.week,
    gameStatus: evidence.gameStatus,
    homeScore: evidence.homeScore,
    awayScore: evidence.awayScore,
    homeHalftimeScore: evidence.homeHalftimeScore,
    awayHalftimeScore: evidence.awayHalftimeScore,
    isOvertime: evidence.isOvertime,
    venueId: evidence.venueId,
    homeConferenceId: evidence.homeConferenceId,
    awayConferenceId: evidence.awayConferenceId,
    homeProviderTeamId: game.homeTeamId ?? null,
    awayProviderTeamId: game.awayTeamId ?? null,
    homeTeamName: game.homeTeamName,
    awayTeamName: game.awayTeamName,
    neutralSite: evidence.neutralSite,
    missingFields: evidence.missing.fields,
    missingReasons: evidence.missing.reasons,
    payload: evidence.payload,
    payloadHash: stablePayloadHash(evidence.payload),
  };
}

export const dbNcaafEspnHistoricalBackfillStore: NcaafEspnHistoricalBackfillStore = {
  async loadCfbdKickoffs(seasons) {
    return db.select({
      season: ncaafGameEvidenceTable.season,
      kickoffAt: ncaafGameEvidenceTable.kickoffAt,
    }).from(ncaafGameEvidenceTable).where(and(
      eq(ncaafGameEvidenceTable.provider, "college_football_data"),
      inArray(ncaafGameEvidenceTable.season, [...seasons]),
      isNotNull(ncaafGameEvidenceTable.kickoffAt),
    )) as Promise<KickoffRow[]>;
  },
  async loadCompletedDates() {
    const rows = await db.select({ date: ncaafEvidenceRunsTable.requestedFrom })
      .from(ncaafEvidenceRunsTable).where(and(
        like(ncaafEvidenceRunsTable.runKey, `${HISTORICAL_DATE_RUN_PREFIX}%`),
        eq(ncaafEvidenceRunsTable.status, "completed"),
      ));
    return rows.map((row) => row.date.replaceAll("-", ""));
  },
  async insert(rows) {
    let inserted = 0;
    for (let offset = 0; offset < rows.length; offset += 500) {
      const result = await db.insert(ncaafGameEvidenceTable)
        .values([...rows.slice(offset, offset + 500)])
        .onConflictDoNothing()
        .returning({ id: ncaafGameEvidenceTable.id });
      inserted += result.length;
    }
    return inserted;
  },
  async markCompletedDate(date, capturedAt, gameCount) {
    const isoDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    await db.insert(ncaafEvidenceRunsTable).values({
      runKey: `${HISTORICAL_DATE_RUN_PREFIX}${date}`,
      requestedFrom: isoDate,
      requestedTo: isoDate,
      capturedAt,
      completedAt: capturedAt,
      status: "completed",
      providers: { espn: "retrospective_canonical_identity" },
      coverage: { gameCount, empty: gameCount === 0 },
      statusHistory: [{ status: "completed", reason: "historical_date_fetched", at: capturedAt.toISOString() }],
    }).onConflictDoNothing();
  },
};

/**
 * Backfills canonical ESPN schedule/result evidence only for dates already
 * present in CFBD. Captured-at time remains truthful and retrospective; these
 * rows are for exact identity reconciliation, never pregame feature lineage.
 */
export async function backfillNcaafEspnHistoricalGameEvidence(
  input: { seasons: readonly number[]; maxDates?: number; capturedAt?: Date },
  store: NcaafEspnHistoricalBackfillStore = dbNcaafEspnHistoricalBackfillStore,
  fetchByDate: (date: string) => Promise<FetchedGame[]> =
    (date) => fetchSportGamesByDate("NCAAF", date, { throwOnError: true }),
): Promise<NcaafEspnHistoricalBackfillResult> {
  const requestedSeasons = [...new Set(input.seasons)].sort((a, b) => a - b);
  const maxDates = input.maxDates ?? 12;
  if (!requestedSeasons.length) throw new Error("At least one NCAAF season is required");
  if (!Number.isInteger(maxDates) || maxDates < 0) throw new Error("maxDates must be a non-negative integer");
  const capturedAt = input.capturedAt ?? new Date();
  const [cfbdKickoffs, completedDateRows] = await Promise.all([
    store.loadCfbdKickoffs(requestedSeasons),
    store.loadCompletedDates(),
  ]);
  const currentDate = ncaafEasternDateKey(capturedAt);
  const candidateDates = [...new Set(cfbdKickoffs
    .map((row) => ncaafEasternDateKey(row.kickoffAt))
    .filter((date) => date < currentDate))].sort();
  const completedDates = new Set(completedDateRows);
  const pendingDates = candidateDates.filter((date) => !completedDates.has(date)).slice(0, maxDates);
  const failures: Record<string, string> = {};
  let successfulDates = 0;
  let fetchedGames = 0;
  let insertedGames = 0;
  await processInBatches(pendingDates, 4, async (batch) => {
    const results = await Promise.allSettled(batch.map((date) => fetchByDate(date)));
    for (let index = 0; index < results.length; index++) {
      const result = results[index]!;
      const date = batch[index]!;
      if (result.status === "rejected") {
        failures[date] = String(result.reason);
        continue;
      }
      const games = [...new Map(result.value
        .filter((game) => requestedSeasons.includes(normalizeEspnGameEvidence(game, capturedAt, capturedAt).season))
        .map((game) => [game.espnId, game])).values()];
      try {
        const rows = games.map((game) => historicalInsert(game, capturedAt));
        insertedGames += rows.length ? await store.insert(rows) : 0;
        await store.markCompletedDate(date, capturedAt, rows.length);
        fetchedGames += rows.length;
        successfulDates++;
      } catch (error) {
        failures[date] = String(error);
      }
    }
  });
  const alreadyCapturedDates = candidateDates.filter((date) => completedDates.has(date)).length;
  return {
    requestedSeasons,
    candidateDates: candidateDates.length,
    alreadyCapturedDates,
    attemptedDates: pendingDates.length,
    capturedDates: successfulDates,
    fetchedGames,
    insertedGames,
    remainingDates: candidateDates.length - alreadyCapturedDates - successfulDates,
    failures,
  };
}