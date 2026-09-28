import { and, asc, eq, gt, inArray, isNotNull, lt } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import { db, gamesTable } from "@workspace/db";
import { fetchAllSportsDetailed, type FetchedGame, type SportFetchResult } from "../src/services/espn";
import {
  captureOddsApiMoneylineSnapshots,
} from "../src/services/marketSnapshotCapture";
import {
  getOddsForGameWithStatus,
  resolveOddsApiKey,
  type OddsLookupResult,
} from "../src/services/oddsApi";
import { ACTIVE_PRODUCT_SPORTS, isActiveProductSport } from "../src/services/sportScope";

export const PREVIEW_ANALYTICS_HORIZON_DAYS = 7;
export const PREVIEW_ANALYTICS_GAMES_PER_SPORT = 20;
export const PREVIEW_ANALYTICS_PROVIDER_GROUPS_PER_RUN = 4;
export const PREVIEW_ANALYTICS_TIME_LIMIT_MS = 60_000;
const PROVIDER_GROUP_ROTATION_MS = 15 * 60 * 1000;
const ODDS_API_REQUEST_TIMEOUT_MS = 12_000;

export interface PreviewAnalyticsGame {
  gameId: string;
  sport: string;
  league: string | null;
  homeTeamName: string;
  awayTeamName: string;
  startsAt: Date;
}

export interface PreviewAnalyticsSportSummary {
  sport: string;
  persistedPregameGames: number;
  scoreboardGames: number;
  scoreboardError?: string;
  providerGroupsAttempted: number;
  gamesAttempted: number;
  providerEventsMatched: number;
  unmatchedGames: number;
  snapshotRowsAttempted: number;
  skippedGames: number;
  unavailable: string[];
  failures: string[];
}

export interface PreviewAnalyticsCaptureSummary {
  mode: "DEVELOPMENT_PREVIEW_ONLY";
  status: "SUCCEEDED" | "PARTIAL" | "UNAVAILABLE" | "NO_UPCOMING_GAMES" | "FAILED";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  horizonDays: number;
  gameLimitPerSport: number;
  providerGroupLimit: number;
  providerGroupsAttempted: number;
  providerGroupsDeferred: number;
  timeLimitMs: number;
  persistedPregameGames: number;
  gamesAttempted: number;
  providerEventsMatched: number;
  unmatchedGames: number;
  snapshotRowsAttempted: number;
  skippedGames: number;
  unavailable: string[];
  sports: PreviewAnalyticsSportSummary[];
  failures: string[];
}

interface PreviewCaptureDependencies {
  now: () => Date;
  monotonicNow: () => number;
  fetchSports: () => Promise<SportFetchResult[]>;
  loadPersistedGames: (now: Date, horizonEnd: Date) => Promise<PreviewAnalyticsGame[]>;
  resolveProviderKey: (sport: string, league: string | null) => string | null;
  getOdds: (
    sport: string,
    league: string | null,
    homeTeamName: string,
    awayTeamName: string,
    startsAt: string,
  ) => Promise<OddsLookupResult>;
  capture: typeof captureOddsApiMoneylineSnapshots;
  nodeEnv: string | undefined;
  publicationEnabled: boolean;
}

const defaultDependencies: PreviewCaptureDependencies = {
  now: () => new Date(),
  monotonicNow: () => performance.now(),
  fetchSports: fetchAllSportsDetailed,
  loadPersistedGames: loadPersistedGames,
  resolveProviderKey: resolveOddsApiKey,
  getOdds: getOddsForGameWithStatus,
  capture: captureOddsApiMoneylineSnapshots,
  nodeEnv: process.env["NODE_ENV"],
  publicationEnabled: process.env["PUBLICATION_ENABLED"] === "true",
};

async function loadPersistedGames(now: Date, horizonEnd: Date): Promise<PreviewAnalyticsGame[]> {
  const rows = await db.select({
    gameId: gamesTable.id,
    sport: gamesTable.sport,
    league: gamesTable.league,
    homeTeamName: gamesTable.homeTeamName,
    awayTeamName: gamesTable.awayTeamName,
    startsAt: gamesTable.startsAt,
  })
    .from(gamesTable)
    .where(and(
      inArray(gamesTable.sport, [...ACTIVE_PRODUCT_SPORTS]),
      eq(gamesTable.status, "upcoming"),
      isNotNull(gamesTable.startsAt),
      gt(gamesTable.startsAt, now),
      lt(gamesTable.startsAt, horizonEnd),
    ))
    .orderBy(asc(gamesTable.startsAt), asc(gamesTable.sport), asc(gamesTable.id));
  return rows.flatMap((game) => game.startsAt
    ? [{ ...game, startsAt: game.startsAt }]
    : []);
}

function conciseError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/([?&]apiKey=)[^&\s]+/gi, "$1[redacted]")
    .slice(0, 240);
}

function rotated<T>(items: readonly T[], offset: number): T[] {
  if (items.length < 2) return [...items];
  const start = offset % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function easternDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function earliestStart(groups: ReadonlyMap<string, PreviewAnalyticsGame[]>): number {
  return Math.min(...[...groups.values()].flatMap((games) =>
    games.map((game) => game.startsAt.getTime()),
  ));
}

function gamesForCapture(
  games: readonly PreviewAnalyticsGame[],
  limit: number,
  now: Date,
  rotationSlot: number,
): PreviewAnalyticsGame[] {
  const byStart = (a: PreviewAnalyticsGame, b: PreviewAnalyticsGame) => (
    a.startsAt.getTime() - b.startsAt.getTime() || a.gameId.localeCompare(b.gameId)
  );
  const gamesByEasternDate = new Map<string, PreviewAnalyticsGame[]>();
  for (const game of games) {
    const date = easternDate(game.startsAt);
    const dateGames = gamesByEasternDate.get(date) ?? [];
    dateGames.push(game);
    gamesByEasternDate.set(date, dateGames);
  }
  let remaining = limit;
  const selected: PreviewAnalyticsGame[] = [];
  for (const date of [...gamesByEasternDate.keys()].sort()) {
    if (remaining === 0) break;
    const dateGames = gamesByEasternDate.get(date)!.sort(byStart);
    const offset = (rotationSlot * remaining) % Math.max(dateGames.length, 1);
    const dateSelection = rotated(dateGames, offset)
      .slice(0, remaining)
      .sort(byStart);
    selected.push(...dateSelection);
    remaining -= dateSelection.length;
  }
  return selected;
}

function scoreboardByGame(results: readonly SportFetchResult[]): {
  games: Map<string, FetchedGame>;
  failedSports: Map<string, string>;
} {
  const games = new Map<string, FetchedGame>();
  const failedSports = new Map<string, string>();
  for (const result of results) {
    if (result.fetchStatus === "error") {
      failedSports.set(result.sport, result.errorMessage ?? "ESPN scoreboard fetch failed");
      continue;
    }
    for (const game of result.games) games.set(game.espnId, game);
  }
  return { games, failedSports };
}

function newSportSummary(sport: string): PreviewAnalyticsSportSummary {
  return {
    sport,
    persistedPregameGames: 0,
    scoreboardGames: 0,
    providerGroupsAttempted: 0,
    gamesAttempted: 0,
    providerEventsMatched: 0,
    unmatchedGames: 0,
    snapshotRowsAttempted: 0,
    skippedGames: 0,
    unavailable: [],
    failures: [],
  };
}

/**
 * Capture named-book evidence from a separate development-preview process.
 * It only reads persisted upcoming games and writes through the append-only
 * odds snapshot service; it never invokes picks, forecasts, or publication.
 */
export async function runPreviewMarketEvidenceCapture(
  overrides: Partial<PreviewCaptureDependencies> = {},
): Promise<PreviewAnalyticsCaptureSummary> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const startedAt = dependencies.now();
  const startClock = dependencies.monotonicNow();
  const groupSlot = Math.floor(startedAt.getTime() / PROVIDER_GROUP_ROTATION_MS);
  const horizonEnd = new Date(
    startedAt.getTime() + PREVIEW_ANALYTICS_HORIZON_DAYS * 24 * 60 * 60 * 1000,
  );
  const failures: string[] = [];
  const sports = new Map<string, PreviewAnalyticsSportSummary>(
    ACTIVE_PRODUCT_SPORTS.map((sport) => [sport, newSportSummary(sport)]),
  );
  let persistedPregameGames = 0;
  let gamesAttempted = 0;
  let providerEventsMatched = 0;
  let unmatchedGames = 0;
  let snapshotRowsAttempted = 0;
  let skippedGames = 0;
  let providerGroupsAttempted = 0;
  let providerGroupsDeferred = 0;
  const unavailable = new Map<string, string>();
  let status: PreviewAnalyticsCaptureSummary["status"] = "SUCCEEDED";

  const summarize = (): PreviewAnalyticsCaptureSummary => {
    const durationMs = Math.max(0, dependencies.monotonicNow() - startClock);
    return {
      mode: "DEVELOPMENT_PREVIEW_ONLY",
      status,
      startedAt: startedAt.toISOString(),
      completedAt: dependencies.now().toISOString(),
      durationMs,
      horizonDays: PREVIEW_ANALYTICS_HORIZON_DAYS,
      gameLimitPerSport: PREVIEW_ANALYTICS_GAMES_PER_SPORT,
      providerGroupLimit: PREVIEW_ANALYTICS_PROVIDER_GROUPS_PER_RUN,
      providerGroupsAttempted,
      providerGroupsDeferred,
      timeLimitMs: PREVIEW_ANALYTICS_TIME_LIMIT_MS,
      persistedPregameGames,
      gamesAttempted,
      providerEventsMatched,
      unmatchedGames,
      snapshotRowsAttempted,
      skippedGames,
      unavailable: [...unavailable.values()],
      sports: [...sports.values()].filter((summary) => (
        summary.persistedPregameGames > 0 || summary.scoreboardError
        || summary.unavailable.length > 0 || summary.failures.length > 0
      )),
      failures,
    };
  };

  if (dependencies.nodeEnv !== "development") {
    status = "FAILED";
    failures.push("NODE_ENV must be exactly development");
    return summarize();
  }
  if (dependencies.publicationEnabled) {
    status = "FAILED";
    failures.push("PUBLICATION_ENABLED=true is not allowed for preview evidence capture");
    return summarize();
  }

  let scoreboard: ReturnType<typeof scoreboardByGame>;
  try {
    const results = await dependencies.fetchSports();
    scoreboard = scoreboardByGame(results);
    for (const [sport, message] of scoreboard.failedSports) {
      const summary = sports.get(sport);
      if (summary) {
        summary.scoreboardError = conciseError(message);
        summary.failures.push(`ESPN scoreboard failed: ${summary.scoreboardError}`);
        failures.push(`${sport} ESPN scoreboard failed: ${summary.scoreboardError}`);
      }
    }
  } catch (error) {
    status = "FAILED";
    failures.push(`ESPN scoreboard request failed: ${conciseError(error)}`);
    return summarize();
  }

  let persistedGames: PreviewAnalyticsGame[];
  try {
    persistedGames = await dependencies.loadPersistedGames(startedAt, horizonEnd);
  } catch (error) {
    status = "FAILED";
    failures.push(`Persisted upcoming-game query failed: ${conciseError(error)}`);
    return summarize();
  }

  const upcomingBySport = new Map<string, PreviewAnalyticsGame[]>();
  for (const game of persistedGames) {
    if (!isActiveProductSport(game.sport)
      || !(game.startsAt instanceof Date)
      || game.startsAt <= startedAt
      || game.startsAt >= horizonEnd) {
      skippedGames++;
      continue;
    }
    const scoreboardGame = scoreboard.games.get(game.gameId);
    if (scoreboardGame && scoreboardGame.status !== "upcoming") {
      skippedGames++;
      continue;
    }
    const summary = sports.get(game.sport);
    if (!summary) {
      skippedGames++;
      continue;
    }
    summary.persistedPregameGames++;
    const group = upcomingBySport.get(game.sport) ?? [];
    group.push(game);
    upcomingBySport.set(game.sport, group);
  }
  persistedPregameGames = [...upcomingBySport.values()]
    .reduce((total, games) => total + games.length, 0);

  const groupedGames = new Map<string, Map<string, PreviewAnalyticsGame[]>>();
  for (const [sport, games] of upcomingBySport) {
    for (const game of games) {
      const providerKey = dependencies.resolveProviderKey(sport, game.league);
      if (!providerKey) {
        skippedGames++;
        const groupKey = `${sport}/${game.league ?? "default"}`;
        const notice = `${groupKey} is unavailable: no Odds API provider key is configured`;
        if (!unavailable.has(groupKey)) {
          unavailable.set(groupKey, notice);
          sports.get(sport)?.unavailable.push(notice);
        }
        continue;
      }
      const group = groupedGames.get(providerKey) ?? new Map<string, PreviewAnalyticsGame[]>();
      const sportGames = group.get(sport) ?? [];
      sportGames.push(game);
      group.set(sport, sportGames);
      groupedGames.set(providerKey, group);
    }
  }

  const allProviderGroups = [...groupedGames.entries()];
  const ncaafTodayGroup = allProviderGroups.find(([, sportsByName]) => (
    sportsByName.get("NCAAF")?.some((game) => easternDate(game.startsAt) === easternDate(startedAt))
  ));
  const remainingGroups = allProviderGroups
    .filter(([key]) => key !== ncaafTodayGroup?.[0])
    .sort(([, a], [, b]) => earliestStart(a) - earliestStart(b));
  const todayGroups = remainingGroups.filter(([, groups]) => (
    [...groups.values()].some((games) => games.some((game) => easternDate(game.startsAt) === easternDate(startedAt)))
  ));
  const futureGroupsByDate = new Map<string, Array<[string, Map<string, PreviewAnalyticsGame[]>]>>();
  for (const entry of remainingGroups.filter(([key]) => (
    !todayGroups.some(([todayKey]) => todayKey === key)
  ))) {
    const date = easternDate(new Date(earliestStart(entry[1])));
    const groupsOnDate = futureGroupsByDate.get(date) ?? [];
    groupsOnDate.push(entry);
    futureGroupsByDate.set(date, groupsOnDate);
  }
  const rotatedFutureGroups = [...futureGroupsByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, groups]) => rotated(groups, groupSlot));
  const additionalSlots = Math.max(
    0,
    PREVIEW_ANALYTICS_PROVIDER_GROUPS_PER_RUN - (ncaafTodayGroup ? 1 : 0),
  );
  const rotatedTodayGroups = rotated(todayGroups, groupSlot);
  const selectedTodayGroups = rotatedTodayGroups.slice(0, additionalSlots);
  const remainingSlots = Math.max(0, additionalSlots - selectedTodayGroups.length);
  const selectedFutureGroups = rotatedFutureGroups.slice(0, remainingSlots);
  const selectedGroups = [
    ...(ncaafTodayGroup ? [ncaafTodayGroup] : []),
    ...selectedTodayGroups,
    ...selectedFutureGroups,
  ];
  const providerGroups = [
    ...(ncaafTodayGroup ? [ncaafTodayGroup] : []),
    ...rotatedTodayGroups,
    ...rotatedFutureGroups,
  ];
  providerGroupsDeferred = Math.max(0, providerGroups.length - selectedGroups.length);
  if (providerGroupsDeferred > 0) status = "PARTIAL";
  const requiredGroups = new Set(selectedGroups.map(([key]) => key));
  for (const [key] of providerGroups) {
    if (!requiredGroups.has(key)) {
      const deferredSports = [...(groupedGames.get(key)?.keys() ?? [])];
      for (const sport of deferredSports) {
        sports.get(sport)?.failures.push(`Provider group ${key} deferred by per-run request budget`);
      }
    }
  }

  const processedGroups = new Set<string>();
  for (const [groupIndex, [providerKey, sportGroups]] of selectedGroups.entries()) {
    const elapsedMs = dependencies.monotonicNow() - startClock;
    const timeLeftMs = PREVIEW_ANALYTICS_TIME_LIMIT_MS - elapsedMs;
    if (timeLeftMs <= ODDS_API_REQUEST_TIMEOUT_MS) {
      for (const [, deferredSportGroups] of selectedGroups.slice(groupIndex)) {
        for (const [sport, deferredGames] of deferredSportGroups) {
          sports.get(sport)!.skippedGames += deferredGames.length;
          sports.get(sport)!.failures.push("Deferred to preserve the 60-second cooperative capture bound");
          skippedGames += deferredGames.length;
        }
      }
      providerGroupsDeferred += selectedGroups.length - groupIndex;
      status = "PARTIAL";
      break;
    }
    if (dependencies.monotonicNow() - startClock >= PREVIEW_ANALYTICS_TIME_LIMIT_MS) {
      for (const [sport] of sportGroups) sports.get(sport)!.skippedGames += sportGroups.get(sport)!.length;
      skippedGames += [...sportGroups.values()].reduce((count, games) => count + games.length, 0);
      providerGroupsDeferred += selectedGroups.length - processedGroups.size;
      status = "PARTIAL";
      break;
    }
    processedGroups.add(providerKey);
    providerGroupsAttempted++;
    for (const [sport, games] of sportGroups) {
      const sportSummary = sports.get(sport)!;
      sportSummary.providerGroupsAttempted++;
      const remainingSportCapacity = Math.max(
        0,
        PREVIEW_ANALYTICS_GAMES_PER_SPORT - sportSummary.gamesAttempted,
      );
      const selectedGames = gamesForCapture(games, remainingSportCapacity, startedAt, groupSlot);
      const omitted = games.length - selectedGames.length;
      sportSummary.skippedGames += omitted;
      skippedGames += omitted;

      for (const game of selectedGames) {
        if (dependencies.monotonicNow() - startClock >= PREVIEW_ANALYTICS_TIME_LIMIT_MS) {
          const remaining = selectedGames.length - selectedGames.indexOf(game);
          sportSummary.skippedGames += remaining;
          skippedGames += remaining;
          status = "PARTIAL";
          sportSummary.failures.push("Cooperative 60-second capture limit reached");
          break;
        }
        gamesAttempted++;
        sportSummary.gamesAttempted++;
        try {
          const lookup = await dependencies.getOdds(
            game.sport,
            game.league,
            game.homeTeamName,
            game.awayTeamName,
            game.startsAt.toISOString(),
          );
          if (lookup.providerUnavailable) {
            sportSummary.failures.push(`Odds API unavailable for provider group ${providerKey}`);
            status = "PARTIAL";
            continue;
          }
          if (!lookup.odds?.providerEventId) {
            unmatchedGames++;
            sportSummary.unmatchedGames++;
            continue;
          }
          providerEventsMatched++;
          sportSummary.providerEventsMatched++;
          const rows = await dependencies.capture({
            sport: game.sport,
            gameId: game.gameId,
            eventStart: game.startsAt.toISOString(),
            odds: lookup.odds,
            capturedAt: dependencies.now(),
          });
          snapshotRowsAttempted += rows;
          sportSummary.snapshotRowsAttempted += rows;
          if (rows === 0) {
            sportSummary.failures.push("Provider event had no fresh valid named-book moneyline quotes");
            status = "PARTIAL";
          }
        } catch (error) {
          const message = conciseError(error);
          sportSummary.failures.push(message);
          failures.push(`${game.sport} ${game.gameId}: ${message}`);
          status = "PARTIAL";
        }
      }
    }
  }

  if (failures.length > 0) status = "PARTIAL";
  if (persistedPregameGames === 0 && failures.length === 0) status = "NO_UPCOMING_GAMES";
  else if (providerGroupsAttempted === 0 && status === "SUCCEEDED") status = "UNAVAILABLE";
  return summarize();
}

async function main(): Promise<void> {
  const summary = await runPreviewMarketEvidenceCapture();
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status === "FAILED") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(JSON.stringify({
      mode: "DEVELOPMENT_PREVIEW_ONLY",
      status: "FAILED",
      reason: conciseError(error),
    }, null, 2));
    process.exitCode = 1;
  });
}