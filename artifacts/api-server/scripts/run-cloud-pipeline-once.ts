import { and, asc, desc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import {
  db,
  gamesTable,
  marketsTable,
  ncaafGameEvidenceTable,
  ncaafMarketObservationsTable,
  oddsSnapshotsTable,
} from "@workspace/db";
import { pathToFileURL } from "node:url";
import { captureOddsApiMoneylineSnapshots } from "../src/services/marketSnapshotCapture";
import { getOddsForGameWithStatus, resolveOddsApiKey, type GameOdds } from "../src/services/oddsApi";
import { ACTIVE_PRODUCT_SPORTS } from "../src/services/sportScope";
import { synchronizeSharedAnalyticsFixtures, type FixtureSyncReport } from "../src/services/sharedAnalyticsFixtures";
import { logger } from "../src/lib/logger";
import { schedulerJobs } from "../src/services/scheduler";
import { bootstrapTask241V4Engines } from "../src/services/v4EngineBootstrap241";
import { getTbmReleaseIdentity, type TbmReleaseIdentity } from "../src/lib/releaseIdentity";

export const ANALYTICS_HORIZON_DAYS = 7;
export const NCAAF_ANALYTICS_HORIZON_DAYS = ANALYTICS_HORIZON_DAYS;
export const MAX_ANALYTICS_GAMES_PER_SPORT = 20;
export const MAX_NCAAF_ANALYTICS_GAMES_PER_RUN = 50;
export const MAX_ANALYTICS_PROVIDER_GROUPS_PER_RUN = 4;
export const MAX_ANALYTICS_CANDIDATES_PER_SPORT = 200;
export const MAX_ANALYTICS_CAPTURE_MS = 60_000;
export const MAX_NCAAF_ANALYTICS_CAPTURE_MS = MAX_ANALYTICS_CAPTURE_MS;
const NCAAF_EVIDENCE_REUSE_MAX_AGE_MS = 30 * 60 * 1000;
const NCAAF_ANALYTICS_KICKOFF_TOLERANCE_MS = 180 * 60 * 1000;
const PROVIDER_GROUP_ROTATION_MS = 15 * 60 * 1000;
const GAME_QUEUE_ROTATION_MS = 1_000;

interface PersistedUpcomingGame {
  gameId: string;
  sport: string;
  league: string | null;
  homeTeamName: string;
  awayTeamName: string;
  eventStart: Date;
  latestSnapshotAt: Date | null;
}

interface PersistedNcaafOddsEvidence {
  gameId: string;
  providerEventId: string;
  payload: unknown;
}

interface PersistedAnalyticsInput {
  fixtureSynchronization?: FixtureSyncReport[];
  totalGamesBySport: Record<string, number>;
  games: PersistedUpcomingGame[];
  evidence: PersistedNcaafOddsEvidence[];
}

interface SportAnalyticsCaptureSummary {
  sport: string;
  persistedUpcomingGames: number;
  gamesAttempted: number;
  providerGroupsAttempted: number;
  providerEventsMatched: number;
  unmatchedGames: number;
  snapshotsWritten: number;
  providerQuotesWithoutUsableSnapshots: number;
  omittedGames: number;
}

export interface MarketAnalyticsCaptureSummary {
  fixtureSynchronization?: FixtureSyncReport[];
  status: "SUCCEEDED" | "NO_UPCOMING_GAMES" | "PARTIAL" | "UNAVAILABLE" | "FAILED";
  hasOperationalFailures: boolean;
  horizonDays: number;
  gameLimitPerSport: number;
  ncaafGameLimit: number;
  providerGroupLimit: number;
  candidateLimitPerSport: number;
  timeLimitMs: number;
  providerGroupsAttempted: number;
  providerGroupsDeferred: number;
  additionalOddsApiRequests: number;
  persistedUpcomingGames: number;
  gamesAttempted: number;
  providerEventsMatched: number;
  unmatchedGames: number;
  snapshotsWritten: number;
  providerQuotesWithoutUsableSnapshots: number;
  omittedGamesDueToGameLimit: number;
  omittedGamesDueToProviderLimit: number;
  omittedGamesDueToCandidateLimit: number;
  omittedGamesDueToTimeLimit: number;
  sports: SportAnalyticsCaptureSummary[];
  failures: Array<{ gameId?: string; reason: string }>;
}

interface MarketAnalyticsCaptureDependencies {
  loadPersistedAnalyticsEvidence: (
    capturedSince: Date,
    now: Date,
    horizonDays: number,
    candidateLimitPerSport: number,
  ) => Promise<PersistedAnalyticsInput>;
  capture: typeof captureOddsApiMoneylineSnapshots;
  getOdds: typeof getOddsForGameWithStatus;
  resolveProviderKey: typeof resolveOddsApiKey;
  now: () => Date;
  monotonicNow: () => number;
}

async function loadPersistedAnalyticsEvidence(
  capturedSince: Date,
  now: Date,
  horizonDays: number,
  candidateLimitPerSport: number,
): Promise<PersistedAnalyticsInput> {
  // The projection UI discovers schedules on demand. Analytics must associate
  // those same future fixtures even when no client visits and publication is off.
  const fixtureSynchronization = await synchronizeSharedAnalyticsFixtures(now, horizonDays);
  logger.info({ fixtureSynchronization }, "Shared Analytics fixture synchronization complete");
  const horizonEnd = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  // Evidence insertion is append-only and deduplicates unchanged payloads, so
  // the current cycle may reuse a still-fresh row captured by an earlier tick.
  const evidenceCapturedSince = new Date(
    Math.min(capturedSince.getTime(), now.getTime()) - NCAAF_EVIDENCE_REUSE_MAX_AGE_MS,
  );
  const upcomingFilter = and(
    inArray(gamesTable.sport, [...ACTIVE_PRODUCT_SPORTS]),
    gt(gamesTable.startsAt, now),
    lt(gamesTable.startsAt, horizonEnd),
  );

  const counts = await db.select({
    sport: gamesTable.sport,
    count: sql<number>`count(*)`,
  })
    .from(gamesTable)
    .where(upcomingFilter)
    .groupBy(gamesTable.sport);
  const totalGamesBySport = Object.fromEntries(counts.map((row) => [
    row.sport,
    Number(row.count ?? 0),
  ]));

  if (Object.values(totalGamesBySport).every((count) => count === 0)) {
    return { totalGamesBySport, games: [], evidence: [], fixtureSynchronization };
  }

  // Query each active sport independently so a large NCAAF slate cannot fill
  // a global SQL limit and hide smaller sports from scheduled Analytics capture.
  const gamesBySport = await Promise.all(ACTIVE_PRODUCT_SPORTS.map(async (sport) => {
    const sportGameCount = totalGamesBySport[sport] ?? 0;
    const candidatePageCount = Math.max(1, Math.ceil(sportGameCount / candidateLimitPerSport));
    const candidatePage = Math.floor(now.getTime() / GAME_QUEUE_ROTATION_MS) % candidatePageCount;
    const candidateOffset = candidatePage * candidateLimitPerSport;
    const rows = await db.select({
      gameId: gamesTable.id,
      sport: gamesTable.sport,
      league: gamesTable.league,
      homeTeamName: gamesTable.homeTeamName,
      awayTeamName: gamesTable.awayTeamName,
      eventStart: gamesTable.startsAt,
      latestSnapshotAt: sql<Date | null>`MAX(${oddsSnapshotsTable.capturedAt}) FILTER (WHERE ${marketsTable.id} IS NOT NULL)`
        .mapWith(oddsSnapshotsTable.capturedAt),
    })
      .from(gamesTable)
      .leftJoin(oddsSnapshotsTable, and(
        eq(oddsSnapshotsTable.gameId, gamesTable.id),
        eq(oddsSnapshotsTable.source, "odds-api"),
        eq(oddsSnapshotsTable.isAvailable, true),
        eq(oddsSnapshotsTable.isStale, false),
      ))
      .leftJoin(marketsTable, and(
        eq(marketsTable.id, oddsSnapshotsTable.marketId),
        eq(marketsTable.slug, "moneyline"),
      ))
      .where(and(eq(gamesTable.sport, sport), gt(gamesTable.startsAt, now), lt(gamesTable.startsAt, horizonEnd)))
      .groupBy(
        gamesTable.id,
        gamesTable.sport,
        gamesTable.league,
        gamesTable.homeTeamName,
        gamesTable.awayTeamName,
        gamesTable.startsAt,
      )
      .orderBy(
        sql`MAX(${oddsSnapshotsTable.capturedAt}) FILTER (WHERE ${marketsTable.id} IS NOT NULL) ASC NULLS FIRST`,
        asc(gamesTable.startsAt),
        asc(gamesTable.id),
      )
      .limit(candidateLimitPerSport)
      .offset(candidateOffset);
    return rows.filter(
      (game): game is typeof game & { eventStart: Date } => game.eventStart instanceof Date,
    );
  }));
  const games = gamesBySport.flat();
  const ncaafGames = games.filter((game) => game.sport === "NCAAF");
  const gameIds = ncaafGames.map((game) => game.gameId);
  if (gameIds.length === 0) return { totalGamesBySport, games, evidence: [], fixtureSynchronization };

  // The NCAAF evidence cycle has already fetched and persisted the current
  // Odds API event payloads. Reuse one matched raw event per existing game
  // rather than paying for a second all-event NCAAF request in this cron run.
  const evidence = await db.selectDistinctOn(
    [ncaafMarketObservationsTable.providerEventId],
    {
      gameId: gamesTable.id,
      providerEventId: ncaafMarketObservationsTable.providerEventId,
      payload: ncaafMarketObservationsTable.payload,
    },
  )
    .from(ncaafMarketObservationsTable)
    .innerJoin(
      ncaafGameEvidenceTable,
      eq(ncaafMarketObservationsTable.gameEvidenceId, ncaafGameEvidenceTable.id),
    )
    .innerJoin(
      gamesTable,
      eq(gamesTable.id, ncaafGameEvidenceTable.providerEventId),
    )
    .where(and(
      eq(ncaafGameEvidenceTable.provider, "espn"),
      eq(ncaafMarketObservationsTable.provider, "odds_api"),
      eq(ncaafMarketObservationsTable.marketKey, "h2h"),
      eq(ncaafMarketObservationsTable.observationPhase, "current"),
      eq(ncaafMarketObservationsTable.isMatchedToGame, true),
      gte(ncaafMarketObservationsTable.capturedAt, evidenceCapturedSince),
      inArray(gamesTable.id, gameIds),
    ))
    .orderBy(
      asc(ncaafMarketObservationsTable.providerEventId),
      desc(ncaafMarketObservationsTable.capturedAt),
      desc(ncaafMarketObservationsTable.id),
    );

  return { totalGamesBySport, games, evidence, fixtureSynchronization };
}

interface OddsApiOutcomeEvidence {
  name?: unknown;
  price?: unknown;
}

interface OddsApiMarketEvidence {
  key?: unknown;
  outcomes?: OddsApiOutcomeEvidence[];
}

interface OddsApiBookEvidence {
  key?: unknown;
  last_update?: unknown;
  markets?: OddsApiMarketEvidence[];
}

interface OddsApiEventEvidence {
  id?: unknown;
  home_team?: unknown;
  away_team?: unknown;
  commence_time?: unknown;
  bookmakers?: OddsApiBookEvidence[];
}

interface OddsApiPayload {
  event?: OddsApiEventEvidence;
}

function readOddsApiEvent(payload: unknown): OddsApiEventEvidence | null {
  if (!payload || typeof payload !== "object") return null;
  const event = (payload as OddsApiPayload).event;
  if (!event || typeof event !== "object"
    || typeof event.id !== "string"
    || typeof event.home_team !== "string"
    || typeof event.away_team !== "string"
    || typeof event.commence_time !== "string"
    || !Array.isArray(event.bookmakers)) return null;
  return event;
}

function comparableTeamName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
}

function toGameOdds(event: OddsApiEventEvidence, expectedProviderEventId: string): GameOdds | null {
  if (event.id !== expectedProviderEventId) return null;
  const home = comparableTeamName(event.home_team as string);
  const away = comparableTeamName(event.away_team as string);
  const bookmakerOdds = (event.bookmakers ?? []).flatMap((book) => {
    if (typeof book.key !== "string" || !Array.isArray(book.markets)) return [];
    const moneyline = book.markets.find((market) => market.key === "h2h");
    if (!moneyline || !Array.isArray(moneyline.outcomes)) return [];
    const homeOutcome = moneyline.outcomes.find((outcome) =>
      typeof outcome.name === "string" && comparableTeamName(outcome.name) === home);
    const awayOutcome = moneyline.outcomes.find((outcome) =>
      typeof outcome.name === "string" && comparableTeamName(outcome.name) === away);
    if (typeof homeOutcome?.price !== "number" || typeof awayOutcome?.price !== "number") return [];
    return [{
      book: book.key,
      homeOdds: homeOutcome.price,
      awayOdds: awayOutcome.price,
      ...(typeof book.last_update === "string" ? { lastUpdate: book.last_update } : {}),
    }];
  });
  return {
    providerEventId: expectedProviderEventId,
    commenceTime: event.commence_time as string,
    bookmakerOdds,
  } as GameOdds;
}

const defaultCaptureDependencies: MarketAnalyticsCaptureDependencies = {
  loadPersistedAnalyticsEvidence,
  capture: captureOddsApiMoneylineSnapshots,
  getOdds: getOddsForGameWithStatus,
  resolveProviderKey: resolveOddsApiKey,
  now: () => new Date(),
  monotonicNow: () => performance.now(),
};

function conciseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/([?&]apiKey=)[^&\s]+/gi, "$1[redacted]")
    .slice(0, 240);
}

function compareSnapshotAge(a: PersistedUpcomingGame, b: PersistedUpcomingGame): number {
  if (a.latestSnapshotAt == null && b.latestSnapshotAt != null) return -1;
  if (a.latestSnapshotAt != null && b.latestSnapshotAt == null) return 1;
  if (a.latestSnapshotAt && b.latestSnapshotAt) {
    const ageOrder = a.latestSnapshotAt.getTime() - b.latestSnapshotAt.getTime();
    if (ageOrder !== 0) return ageOrder;
  }
  return a.eventStart.getTime() - b.eventStart.getTime() || a.gameId.localeCompare(b.gameId);
}

function rotateGameQueue(
  games: PersistedUpcomingGame[],
  now: Date,
  workLimit: number,
): PersistedUpcomingGame[] {
  if (games.length <= 1) return games;
  const runSlot = Math.floor(now.getTime() / GAME_QUEUE_ROTATION_MS);
  const offset = (runSlot * workLimit) % games.length;
  return [...games.slice(offset), ...games.slice(0, offset)];
}

interface CaptureQueue {
  mode: "NCAAF_EVIDENCE" | "ODDS_API";
  providerKey?: string;
  games: PersistedUpcomingGame[];
  nextIndex: number;
}

function emptySportSummary(sport: string, persistedUpcomingGames: number): SportAnalyticsCaptureSummary {
  return {
    sport,
    persistedUpcomingGames,
    gamesAttempted: 0,
    providerGroupsAttempted: 0,
    providerEventsMatched: 0,
    unmatchedGames: 0,
    snapshotsWritten: 0,
    providerQuotesWithoutUsableSnapshots: 0,
    omittedGames: 0,
  };
}

/**
 * SHADOW-only Analytics capture. It uses only persisted game rows, reuses
 * current-cycle NCAAF raw evidence, and makes a bounded/rotating set of
 * Odds API requests for other supported sports. Snapshot persistence remains
 * evidence-only and never enters the public-pick publication path.
 */
export async function captureMarketAnalyticsEvidence(
  capturedSince: Date,
  overrides: Partial<MarketAnalyticsCaptureDependencies> = {},
): Promise<MarketAnalyticsCaptureSummary> {
  const dependencies = { ...defaultCaptureDependencies, ...overrides };
  const now = dependencies.now();
  const failures: MarketAnalyticsCaptureSummary["failures"] = [];
  let input: PersistedAnalyticsInput;

  try {
    input = await dependencies.loadPersistedAnalyticsEvidence(
      capturedSince,
      now,
      ANALYTICS_HORIZON_DAYS,
      MAX_ANALYTICS_CANDIDATES_PER_SPORT,
    );
  } catch (error) {
    return {
      status: "FAILED",
      hasOperationalFailures: true,
      horizonDays: ANALYTICS_HORIZON_DAYS,
      gameLimitPerSport: MAX_ANALYTICS_GAMES_PER_SPORT,
      ncaafGameLimit: MAX_NCAAF_ANALYTICS_GAMES_PER_RUN,
      providerGroupLimit: MAX_ANALYTICS_PROVIDER_GROUPS_PER_RUN,
      candidateLimitPerSport: MAX_ANALYTICS_CANDIDATES_PER_SPORT,
      timeLimitMs: MAX_ANALYTICS_CAPTURE_MS,
      providerGroupsAttempted: 0,
      providerGroupsDeferred: 0,
      additionalOddsApiRequests: 0,
      persistedUpcomingGames: 0,
      gamesAttempted: 0,
      providerEventsMatched: 0,
      unmatchedGames: 0,
      snapshotsWritten: 0,
      providerQuotesWithoutUsableSnapshots: 0,
      omittedGamesDueToGameLimit: 0,
      omittedGamesDueToProviderLimit: 0,
      omittedGamesDueToCandidateLimit: 0,
      omittedGamesDueToTimeLimit: 0,
      sports: [],
      failures: [{ reason: `PERSISTED_UPCOMING_GAMES_QUERY_FAILED: ${conciseError(error)}` }],
    };
  }

  const totalGames = Object.values(input.totalGamesBySport).reduce((sum, count) => sum + count, 0);
  // The quote-capture budget excludes bounded fixture synchronization; otherwise
  // a slow schedule fetch could consume the entire budget before the first quote.
  const startedAt = dependencies.monotonicNow();
  let hasOperationalFailures = (input.fixtureSynchronization ?? []).some(row => row.providerFailures.length > 0);
  for (const row of input.fixtureSynchronization ?? []) {
    for (const reason of row.providerFailures) failures.push({ reason: `FIXTURE_SOURCE_FAILED: ${reason}` });
    for (const conflict of row.conflicts) failures.push({
      gameId: conflict.gameId, reason: `FIXTURE_QUARANTINED: ${conflict.reason}`,
    });
  }
  const sportSummaryByName = new Map<string, SportAnalyticsCaptureSummary>(
    ACTIVE_PRODUCT_SPORTS.map((sport) => [
      sport,
      emptySportSummary(sport, input.totalGamesBySport[sport] ?? 0),
    ]),
  );
  const candidatesBySport = new Map<string, PersistedUpcomingGame[]>(
    ACTIVE_PRODUCT_SPORTS.map((sport) => [
      sport,
      input.games.filter((game) => game.sport === sport).sort(compareSnapshotAge),
    ]),
  );
  const candidateLimitOmittedBySport = new Map<string, number>();
  for (const sport of ACTIVE_PRODUCT_SPORTS) {
    candidateLimitOmittedBySport.set(
      sport,
      Math.max(
        0,
        (input.totalGamesBySport[sport] ?? 0) - (candidatesBySport.get(sport)?.length ?? 0),
      ),
    );
  }

  const ncaafCandidates = candidatesBySport.get("NCAAF") ?? [];
  const selectedNcaafGames = rotateGameQueue(
    ncaafCandidates,
    now,
    MAX_NCAAF_ANALYTICS_GAMES_PER_RUN,
  ).slice(0, MAX_NCAAF_ANALYTICS_GAMES_PER_RUN);
  const ncaafOmittedDueToLimit = Math.max(
    0,
    (candidatesBySport.get("NCAAF")?.length ?? 0) - selectedNcaafGames.length,
  );
  const selectedNcaafIds = new Set(selectedNcaafGames.map((game) => game.gameId));
  const evidenceByGame = new Map<string, PersistedNcaafOddsEvidence>();
  for (const observation of input.evidence) {
    if (selectedNcaafIds.has(observation.gameId) && !evidenceByGame.has(observation.gameId)) {
      evidenceByGame.set(observation.gameId, observation);
    }
  }

  const providerGroups = new Map<string, { providerKey: string | null; games: PersistedUpcomingGame[] }>();
  for (const game of input.games) {
    if (game.sport === "NCAAF") continue;
    const providerKey = dependencies.resolveProviderKey(game.sport, game.league);
    const groupKey = providerKey ?? `unsupported:${game.sport}:${game.league ?? "unknown"}`;
    const group = providerGroups.get(groupKey) ?? { providerKey, games: [] };
    group.games.push(game);
    providerGroups.set(groupKey, group);
  }

  const supportedProviderGroups = [...providerGroups.entries()]
    .filter(([, group]) => group.providerKey != null)
    .sort(([left], [right]) => left.localeCompare(right));
  const unsupportedProviderGroups = [...providerGroups.entries()]
    .filter(([, group]) => group.providerKey == null);
  const rotationOffset = supportedProviderGroups.length > 0
    ? (Math.floor(now.getTime() / PROVIDER_GROUP_ROTATION_MS) * MAX_ANALYTICS_PROVIDER_GROUPS_PER_RUN)
      % supportedProviderGroups.length
    : 0;
  const rotatedProviderGroups = [
    ...supportedProviderGroups.slice(rotationOffset),
    ...supportedProviderGroups.slice(0, rotationOffset),
  ];
  const selectedProviderGroups = rotatedProviderGroups.slice(0, MAX_ANALYTICS_PROVIDER_GROUPS_PER_RUN);
  let omittedGamesDueToProviderLimit = 0;
  for (const [providerKey, group] of rotatedProviderGroups.slice(MAX_ANALYTICS_PROVIDER_GROUPS_PER_RUN)) {
    omittedGamesDueToProviderLimit += group.games.length;
    failures.push({
      reason: `PROVIDER_GROUP_WORK_LIMIT_REACHED: ${providerKey} deferred for a later scheduled run`,
    });
  }
  for (const [groupKey, group] of unsupportedProviderGroups) {
    omittedGamesDueToProviderLimit += group.games.length;
    failures.push({
      reason: `UNSUPPORTED_ODDS_API_PROVIDER_KEY: ${groupKey} has ${group.games.length} persisted upcoming games`,
    });
    for (const game of group.games) {
      sportSummaryByName.get(game.sport)!.unmatchedGames++;
      failures.push({ gameId: game.gameId, reason: "NO_SUPPORTED_NAMED_BOOK_PROVIDER_FOR_ACTIVE_SPORT_LEAGUE" });
    }
  }

  const queues: CaptureQueue[] = [];
  if (selectedNcaafGames.length > 0) {
    queues.push({
      mode: "NCAAF_EVIDENCE",
      games: selectedNcaafGames,
      nextIndex: 0,
    });
  }
  let omittedGamesDueToGameLimit = ncaafOmittedDueToLimit;
  const providerCandidateQueuesBySport = new Map<string, Array<{
    providerKey: string;
    games: PersistedUpcomingGame[];
    nextIndex: number;
    selected: PersistedUpcomingGame[];
  }>>();
  for (const [providerKey, group] of selectedProviderGroups) {
    const gamesBySport = new Map<string, PersistedUpcomingGame[]>();
    for (const game of group.games) {
      const sportGames = gamesBySport.get(game.sport) ?? [];
      sportGames.push(game);
      gamesBySport.set(game.sport, sportGames);
    }
    for (const [sport, games] of gamesBySport) {
      const queuesForSport = providerCandidateQueuesBySport.get(sport) ?? [];
      queuesForSport.push({
        providerKey,
        games: rotateGameQueue(games.sort(compareSnapshotAge), now, MAX_ANALYTICS_GAMES_PER_SPORT),
        nextIndex: 0,
        selected: [],
      });
      providerCandidateQueuesBySport.set(sport, queuesForSport);
    }
  }

  const selectedGamesByProviderKey = new Map<string, PersistedUpcomingGame[]>();
  for (const [sport, providerQueues] of providerCandidateQueuesBySport) {
    const candidateCount = providerQueues.reduce((sum, queue) => sum + queue.games.length, 0);
    let selectedCount = 0;
    while (selectedCount < MAX_ANALYTICS_GAMES_PER_SPORT) {
      let progressed = false;
      for (const queue of providerQueues) {
        if (selectedCount >= MAX_ANALYTICS_GAMES_PER_SPORT) break;
        const game = queue.games[queue.nextIndex];
        if (!game) continue;
        queue.nextIndex++;
        queue.selected.push(game);
        selectedCount++;
        progressed = true;
      }
      if (!progressed) break;
    }
    const omitted = candidateCount - selectedCount;
    omittedGamesDueToGameLimit += omitted;
    if (omitted > 0) {
      failures.push({
        reason: `PER_SPORT_GAME_WORK_LIMIT_REACHED: ${sport} deferred ${omitted} games`,
      });
    }
    for (const queue of providerQueues) {
      const games = selectedGamesByProviderKey.get(queue.providerKey) ?? [];
      games.push(...queue.selected);
      selectedGamesByProviderKey.set(queue.providerKey, games);
    }
  }

  for (const [providerKey] of selectedProviderGroups) {
    const selectedGames = selectedGamesByProviderKey.get(providerKey) ?? [];
    if (selectedGames.length > 0) {
      queues.push({
        mode: "ODDS_API",
        providerKey,
        games: selectedGames.sort(compareSnapshotAge),
        nextIndex: 0,
      });
    }
  }

  let gamesAttempted = 0;
  let providerEventsMatched = 0;
  let snapshotsWritten = 0;
  let providerQuotesWithoutUsableSnapshots = 0;
  let omittedGamesDueToTimeLimit = 0;
  const providerGroupsAttempted = new Set<string>();
  const providerFailuresReported = new Set<string>();

  const processGame = async (queue: CaptureQueue, game: PersistedUpcomingGame): Promise<void> => {
    const sportStats = sportSummaryByName.get(game.sport)!;
    gamesAttempted++;
    sportStats.gamesAttempted++;

    let odds: GameOdds | null = null;
    if (queue.mode === "NCAAF_EVIDENCE") {
      const observation = evidenceByGame.get(game.gameId);
      if (!observation) {
        failures.push({ gameId: game.gameId, reason: "NO_MATCHED_FRESH_NCAAF_LEDGER_EVENT_FOR_PERSISTED_GAME" });
        sportStats.unmatchedGames++;
        return;
      }
      const event = readOddsApiEvent(observation.payload);
      if (!event) {
        failures.push({ gameId: game.gameId, reason: "MALFORMED_PERSISTED_NCAAF_ODDS_API_EVENT_PAYLOAD" });
        sportStats.unmatchedGames++;
        return;
      }
      const providerKickoffAt = Date.parse(event.commence_time as string);
      if (!Number.isFinite(providerKickoffAt)
        || providerKickoffAt <= now.getTime()
        || Math.abs(providerKickoffAt - game.eventStart.getTime()) > NCAAF_ANALYTICS_KICKOFF_TOLERANCE_MS) {
        failures.push({
          gameId: game.gameId,
          reason: "NCAAF_PROVIDER_KICKOFF_NOT_FUTURE_OR_OUTSIDE_ESPN_START_TOLERANCE",
        });
        sportStats.unmatchedGames++;
        return;
      }
      odds = toGameOdds(event, observation.providerEventId);
      if (!odds) {
        failures.push({ gameId: game.gameId, reason: "PERSISTED_NCAAF_ODDS_API_EVENT_ID_MISMATCH" });
        sportStats.unmatchedGames++;
        return;
      }
    } else {
      const providerKey = queue.providerKey!;
      if (!providerGroupsAttempted.has(providerKey)) {
        providerGroupsAttempted.add(providerKey);
        sportStats.providerGroupsAttempted++;
      }
      try {
        const lookup = await dependencies.getOdds(
          game.sport,
          game.league,
          game.homeTeamName,
          game.awayTeamName,
          game.eventStart.toISOString(),
        );
        if (lookup.providerUnavailable && !providerFailuresReported.has(providerKey)) {
          providerFailuresReported.add(providerKey);
          hasOperationalFailures = true;
          failures.push({ gameId: game.gameId, reason: "ODDS_API_PROVIDER_UNAVAILABLE" });
        }
        odds = lookup.odds;
        if (!odds) {
          if (!lookup.providerUnavailable) {
            const reason = lookup.marketBlockedByProviderStart
              ? "PROVIDER_EVENT_ALREADY_STARTED_NO_PREGAME_NAMED_BOOK_MARKET"
              : "NO_MATCHED_CURRENT_NAMED_BOOK_ODDS_EVENT";
            failures.push({ gameId: game.gameId, reason });
          }
          sportStats.unmatchedGames++;
          return;
        }
      } catch (error) {
        hasOperationalFailures = true;
        failures.push({ gameId: game.gameId, reason: `ODDS_API_LOOKUP_FAILED: ${conciseError(error)}` });
        sportStats.unmatchedGames++;
        return;
      }
    }

    providerEventsMatched++;
    sportStats.providerEventsMatched++;
    try {
      const rows = await dependencies.capture({
        sport: game.sport,
        gameId: game.gameId,
        eventStart: game.eventStart.toISOString(),
        odds,
        capturedAt: now,
      });
      snapshotsWritten += rows;
      sportStats.snapshotsWritten += rows;
      if (rows === 0) {
        providerQuotesWithoutUsableSnapshots++;
        sportStats.providerQuotesWithoutUsableSnapshots++;
        failures.push({
          gameId: game.gameId,
          reason: "PROVIDER_EVENT_HAD_NO_FRESH_VALID_NAMED_BOOK_MONEYLINE_SNAPSHOTS",
        });
      }
    } catch (error) {
      hasOperationalFailures = true;
      failures.push({
        gameId: game.gameId,
        reason: `MARKET_SNAPSHOT_CAPTURE_FAILED: ${conciseError(error)}`,
      });
    }
  };

  while (queues.some((queue) => queue.nextIndex < queue.games.length)) {
    let progressed = false;
    for (const queue of queues) {
      if (queue.nextIndex >= queue.games.length) continue;
      if (dependencies.monotonicNow() - startedAt >= MAX_ANALYTICS_CAPTURE_MS) {
        omittedGamesDueToTimeLimit = queues.reduce(
          (sum, pending) => sum + pending.games.length - pending.nextIndex,
          0,
        );
        break;
      }
      const game = queue.games[queue.nextIndex++]!;
      progressed = true;
      await processGame(queue, game);
    }
    if (!progressed || omittedGamesDueToTimeLimit > 0) break;
  }

  const omittedGamesDueToCandidateLimit = [...candidateLimitOmittedBySport.values()]
    .reduce((sum, count) => sum + count, 0);
  if (omittedGamesDueToGameLimit > 0) {
    failures.push({ reason: `GAME_WORK_LIMIT_REACHED: ${omittedGamesDueToGameLimit} games deferred` });
  }
  if (omittedGamesDueToProviderLimit > 0) {
    failures.push({ reason: `PROVIDER_REQUEST_LIMIT_REACHED: ${omittedGamesDueToProviderLimit} candidate games deferred` });
  }
  if (omittedGamesDueToCandidateLimit > 0) {
    failures.push({ reason: `CANDIDATE_READ_LIMIT_REACHED: ${omittedGamesDueToCandidateLimit} upcoming games deferred` });
  }
  if (omittedGamesDueToTimeLimit > 0) {
    failures.push({ reason: `TIME_LIMIT_REACHED: ${omittedGamesDueToTimeLimit} selected games deferred` });
  }
  for (const [sport, omitted] of candidateLimitOmittedBySport) {
    if (omitted > 0) failures.push({ reason: `CANDIDATE_SPORT_LIMIT_REACHED: ${sport} omitted ${omitted} rows` });
  }

  const sports = ACTIVE_PRODUCT_SPORTS
    .map((sport) => sportSummaryByName.get(sport)!)
    .filter((summary) => summary.persistedUpcomingGames > 0);
  const unmatchedGames = sports.reduce((sum, summary) => sum + summary.unmatchedGames, 0);
  for (const summary of sports) {
    summary.omittedGames = Math.max(
      0,
      summary.persistedUpcomingGames - summary.gamesAttempted,
    );
  }
  const hasOmittedGames = omittedGamesDueToGameLimit > 0
    || omittedGamesDueToProviderLimit > 0
    || omittedGamesDueToCandidateLimit > 0
    || omittedGamesDueToTimeLimit > 0;
  const hasCoverageGaps = failures.length > 0 || hasOmittedGames;
  const entirelyUnsupported = unsupportedProviderGroups.length > 0
    && providerGroupsAttempted.size === 0
    && gamesAttempted === 0
    && snapshotsWritten === 0;
  const status: MarketAnalyticsCaptureSummary["status"] = hasOperationalFailures
    ? "FAILED"
    : totalGames === 0
      ? "NO_UPCOMING_GAMES"
      : hasCoverageGaps
        ? entirelyUnsupported ? "UNAVAILABLE" : "PARTIAL"
        : "SUCCEEDED";

  return {
    status,
    hasOperationalFailures,
    fixtureSynchronization: input.fixtureSynchronization,
    horizonDays: ANALYTICS_HORIZON_DAYS,
    gameLimitPerSport: MAX_ANALYTICS_GAMES_PER_SPORT,
    ncaafGameLimit: MAX_NCAAF_ANALYTICS_GAMES_PER_RUN,
    providerGroupLimit: MAX_ANALYTICS_PROVIDER_GROUPS_PER_RUN,
    candidateLimitPerSport: MAX_ANALYTICS_CANDIDATES_PER_SPORT,
    timeLimitMs: MAX_ANALYTICS_CAPTURE_MS,
    providerGroupsAttempted: providerGroupsAttempted.size,
    providerGroupsDeferred: Math.max(
      0,
      supportedProviderGroups.length - selectedProviderGroups.length,
    ),
    additionalOddsApiRequests: providerGroupsAttempted.size,
    persistedUpcomingGames: totalGames,
    gamesAttempted,
    providerEventsMatched,
    unmatchedGames,
    snapshotsWritten,
    providerQuotesWithoutUsableSnapshots,
    omittedGamesDueToGameLimit,
    omittedGamesDueToProviderLimit,
    omittedGamesDueToCandidateLimit,
    omittedGamesDueToTimeLimit,
    sports,
    failures,
  };
}

export interface PipelineRuntime {
  publicationEnabled: boolean;
  releaseIdentity: TbmReleaseIdentity;
  bootstrapEngines: () => void;
  mlbV4EvidenceCollection: () => Promise<unknown>;
  ncaafProductionEvidenceCycle: () => Promise<unknown>;
  oddsIngestion: () => Promise<unknown>;
  captureMarketAnalyticsEvidence: (capturedSince: Date) => Promise<MarketAnalyticsCaptureSummary>;
}

export interface PipelineReport {
  mode: "PRODUCTION" | "SHADOW";
  release: TbmReleaseIdentity;
  startedAt: string;
  completedAt: string;
  results: Record<string, unknown>;
  failed: boolean;
}

function failureStatus(error: unknown): { status: "FAILED"; reason: string } {
  return {
    status: "FAILED",
    reason: conciseError(error),
  };
}

function nestedFailureReason(value: unknown, path = "result", depth = 0): string | null {
  if (depth > 6 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const reason = nestedFailureReason(item, `${path}[${index}]`, depth + 1);
      if (reason) return reason;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const status = typeof record["status"] === "string" ? record["status"].toUpperCase() : "";
  if (status === "FAILED" || status === "ERROR" || status === "PARTIAL") {
    return `${path}.status=${status}`;
  }
  if (record["failed"] === true) return `${path}.failed=true`;
  for (const key of ["captureCause", "cfbdCaptureCause"] as const) {
    if (typeof record[key] === "string" && record[key]) return `${path}.${key}=${record[key]}`;
  }
  if (Array.isArray(record["gameFailures"]) && record["gameFailures"].length > 0) {
    return `${path}.gameFailures=${record["gameFailures"].length}`;
  }
  const providerErrors = record["providerErrors"];
  if (providerErrors && typeof providerErrors === "object" && Object.keys(providerErrors).length > 0) {
    return `${path}.providerErrors`;
  }
  for (const [key, child] of Object.entries(record)) {
    const reason = nestedFailureReason(child, `${path}.${key}`, depth + 1);
    if (reason) return reason;
  }
  return null;
}

function jobResultStatus(result: unknown): { status: "SUCCEEDED" | "FAILED"; result: unknown; reason?: string } {
  const nestedReason = nestedFailureReason(result);
  return nestedReason
    ? { status: "FAILED", result, reason: nestedReason }
    : { status: "SUCCEEDED", result };
}

export async function runCloudPipelineOnce(
  runtime: PipelineRuntime,
): Promise<PipelineReport> {
  const startedAt = new Date().toISOString();
  const results: Record<string, unknown> = {};

  try {
    runtime.bootstrapEngines();
  } catch (error) {
    results["bootstrap"] = failureStatus(error);
    return {
      mode: runtime.publicationEnabled ? "PRODUCTION" : "SHADOW",
      release: runtime.releaseIdentity,
      startedAt,
      completedAt: new Date().toISOString(),
      results,
      failed: true,
    };
  }

  let ncaafEvidenceStartedAt: Date | null = null;
  for (const [name, job] of [
    ["mlbV4EvidenceCollection", runtime.mlbV4EvidenceCollection],
    ["ncaafProductionEvidenceCycle", runtime.ncaafProductionEvidenceCycle],
  ] as const) {
    if (name === "ncaafProductionEvidenceCycle") ncaafEvidenceStartedAt = new Date();
    try {
      results[name] = jobResultStatus(await job());
    } catch (error) {
      results[name] = failureStatus(error);
    }
  }

  if (runtime.publicationEnabled) {
    try {
      results["oddsIngestion"] = jobResultStatus(await runtime.oddsIngestion());
    } catch (error) {
      results["oddsIngestion"] = failureStatus(error);
    }
  } else {
    // Keep PUBLICATION_ENABLED=false as a hard boundary. The full ingestion
    // job enters the official V4 orchestrator; this shadow path only converts
    // persisted active-sport evidence into append-only market snapshots.
    try {
      const result = await runtime.captureMarketAnalyticsEvidence(
        ncaafEvidenceStartedAt ?? new Date(),
      );
      results["marketAnalyticsEvidence"] = {
        status: result.hasOperationalFailures ? "FAILED" : result.status,
        result,
      };
    } catch (error) {
      results["marketAnalyticsEvidence"] = failureStatus(error);
    }
  }

  const failed = Object.values(results).some((value) =>
    (value as { status?: string }).status === "FAILED");
  return {
    mode: runtime.publicationEnabled ? "PRODUCTION" : "SHADOW",
    release: runtime.releaseIdentity,
    startedAt,
    completedAt: new Date().toISOString(),
    results,
    failed,
  };
}

async function main(): Promise<void> {
  const report = await runCloudPipelineOnce({
    publicationEnabled: process.env["PUBLICATION_ENABLED"] === "true",
    releaseIdentity: getTbmReleaseIdentity("scheduler"),
    bootstrapEngines: bootstrapTask241V4Engines,
    mlbV4EvidenceCollection: schedulerJobs.mlbV4EvidenceCollection,
    ncaafProductionEvidenceCycle: schedulerJobs.ncaafProductionEvidenceCycle,
    oddsIngestion: schedulerJobs.oddsIngestion,
    captureMarketAnalyticsEvidence,
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(JSON.stringify({
      mode: process.env["PUBLICATION_ENABLED"] === "true" ? "PRODUCTION" : "SHADOW",
      status: "FAILED",
      reason: conciseError(error),
    }, null, 2));
    process.exitCode = 1;
  });
}