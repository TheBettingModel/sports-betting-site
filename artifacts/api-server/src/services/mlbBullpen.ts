/**
 * MLB Bullpen Fatigue Service
 *
 * Computes a weighted bullpen fatigue score for each MLB team using the last
 * 3 days of game boxscores from the MLB Stats API (free, no key required).
 *
 * Two-step fetch:
 *   1. Schedule  → /api/v1/schedule (get gamePks for last 3 days)
 *   2. Boxscores → /api/v1/game/{gamePk}/boxscore (parallel, per-game)
 *
 * Fatigue = Σ (relief pitcher pitch counts × recency weight) over last 3 days
 *   yesterday    → weight 1.0  (arm still feeling it)
 *   2 days ago   → weight 0.65 (partial recovery)
 *   3 days ago   → weight 0.35 (mostly recovered)
 *
 * A fresh bullpen (low score) vs. a taxed bullpen (high score) creates a
 * measurable edge in close games where the 6th–9th innings decide the result.
 *
 * Probability adjustment cap: ±0.04 (secondary to starting pitcher at ±0.08).
 * Cache TTL: 6 hours (data is from completed games; won't change after the fact).
 */

import { logger } from "../lib/logger";
import type { MlbSignalCacheMeta } from "./mlbPitchers";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BullpenStatus {
  teamAbbr: string;
  /** Weighted pitch count over last 3 days. 0 = fresh, 200+ = very tired. */
  weightedPitches: number;
  /** Number of games played in last 3 days */
  gamesLast3Days: number;
  /** Summary label */
  fatigueLabel: "Fresh" | "Moderate" | "Tired" | "Exhausted";
}

export interface BullpenMatchup {
  home: BullpenStatus | null;
  away: BullpenStatus | null;
}

// ── MLB Stats API → ESPN abbreviation map ─────────────────────────────────────

const MLB_ID_TO_ESPN: Record<number, string> = {
  109: "ARI", 133: "ATH", 144: "ATL", 110: "BAL", 111: "BOS",
  112: "CHC", 145: "CWS", 113: "CIN", 114: "CLE", 115: "COL",
  116: "DET", 117: "HOU", 118: "KC",  108: "LAA", 119: "LAD",
  146: "MIA", 158: "MIL", 142: "MIN", 121: "NYM", 147: "NYY",
  143: "PHI", 134: "PIT", 135: "SD",  137: "SF",  136: "SEA",
  138: "STL", 139: "TB",  140: "TEX", 141: "TOR", 120: "WSH",
};

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  /** ESPN abbr → BullpenStatus */
  data: Map<string, BullpenStatus>;
  fetchedAt: number;
}
const cache = new Map<string, CacheEntry>(); // key: date string YYYY-MM-DD
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function getBullpenCacheMeta(dateStr: string): MlbSignalCacheMeta {
  const cached = cache.get(dateStr);
  if (!cached) return { sourceCapturedAt: null, cacheAgeMs: null, stale: true };
  const cacheAgeMs = Math.max(0, Date.now() - cached.fetchedAt);
  return {
    sourceCapturedAt: new Date(cached.fetchedAt).toISOString(),
    cacheAgeMs,
    stale: cacheAgeMs >= CACHE_TTL_MS,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fatigueLabel(weighted: number): BullpenStatus["fatigueLabel"] {
  if (weighted < 60)  return "Fresh";
  if (weighted < 120) return "Moderate";
  if (weighted < 200) return "Tired";
  return "Exhausted";
}

function dateOffset(dateStr: string, offsetDays: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function daysBetween(todayStr: string, olderStr: string): number {
  const today = new Date(todayStr + "T12:00:00Z");
  const older  = new Date(olderStr + "T12:00:00Z");
  return Math.round((today.getTime() - older.getTime()) / (1000 * 60 * 60 * 24));
}

// ── MLB Stats API types ───────────────────────────────────────────────────────

interface MlbScheduleGame {
  gamePk: number;
  officialDate: string;
  status?: { abstractGameState?: string };
}
interface MlbIdentityScheduleGame {
  gamePk: number; gameDate?: string; gameNumber?: number;
  teams?: { home?: { team?: { id?: number; abbreviation?: string } }; away?: { team?: { id?: number; abbreviation?: string } } };
}

const identityScheduleCache = new Map<string, { fetchedAt: number; games: MlbIdentityScheduleGame[] }>();
const IDENTITY_CACHE_MS = 15 * 60_000;
export type MlbGamePkResolution = { state: "VALID"; gamePk: number } | { state: "UNAVAILABLE"; reason: string };
/** Fail-closed schedule identity resolver. Doubleheader/time ambiguity is never guessed. */
export async function resolveMlbGamePk(input: {
  gameDate: string; homeAbbr: string; awayAbbr: string; startsAt: Date; homeTeamId?: string | null; awayTeamId?: string | null; gameNumber?: number | null;
}): Promise<MlbGamePkResolution> {
  let cached = identityScheduleCache.get(input.gameDate);
  if (!cached || Date.now() - cached.fetchedAt > IDENTITY_CACHE_MS) {
    try {
      const response = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${input.gameDate}&hydrate=team,linescore`, {
        signal: AbortSignal.timeout(8_000), headers: { "User-Agent": "TheBettingModel/2.0" },
      });
      if (!response.ok) return { state: "UNAVAILABLE", reason: `schedule_http_${response.status}` };
      const payload = await response.json() as { dates?: Array<{ games?: MlbIdentityScheduleGame[] }> };
      cached = { fetchedAt: Date.now(), games: (payload.dates ?? []).flatMap((d) => d.games ?? []) };
      identityScheduleCache.set(input.gameDate, cached);
    } catch (error) {
      return { state: "UNAVAILABLE", reason: error instanceof Error ? `schedule_error:${error.message}` : "schedule_error" };
    }
  }
  const startMs = input.startsAt.getTime();
  const candidates = cached.games.filter((game) => {
    const home = game.teams?.home?.team; const away = game.teams?.away?.team;
    const teamsMatch = home?.abbreviation === input.homeAbbr && away?.abbreviation === input.awayAbbr;
    const idsMatch = input.homeTeamId && input.awayTeamId
      ? String(home?.id) === input.homeTeamId && String(away?.id) === input.awayTeamId : true;
    const startMatch = game.gameDate && Math.abs(new Date(game.gameDate).getTime() - startMs) <= 3 * 60 * 60_000;
    const numberMatch = input.gameNumber == null || game.gameNumber === input.gameNumber;
    return teamsMatch && idsMatch && startMatch && numberMatch;
  });
  return candidates.length === 1 ? { state: "VALID", gamePk: candidates[0]!.gamePk }
    : { state: "UNAVAILABLE", reason: candidates.length ? "ambiguous_schedule_identity" : "schedule_identity_not_found" };
}

export async function fetchMlbResearchBoxscore(gamePk: number): Promise<{ boxscore: MlbBoxscoreResponse | null; error: string | null }> {
  const boxscore = await fetchBoxscore(gamePk);
  return boxscore ? { boxscore, error: null } : { boxscore: null, error: "boxscore_unavailable" };
}

interface MlbScheduleDate {
  date: string;
  games?: MlbScheduleGame[];
}

interface MlbScheduleResponse {
  dates?: MlbScheduleDate[];
}

export interface MlbBoxscorePitching {
  numberOfPitches?: number; inningsPitched?: string; battersFaced?: number; runs?: number; earnedRuns?: number;
  hits?: number; baseOnBalls?: number; strikeOuts?: number; homeRuns?: number;
}
export interface MlbBoxscoreTeam {
  /** Pitcher person IDs in appearance order. First = starter, rest = relievers. */
  pitchers?: number[];
  players?: Record<string, {
    person?: { id?: number; fullName?: string };
    stats?: { pitching?: MlbBoxscorePitching };
  }>;
  team?: { id?: number };
}

export interface MlbBoxscoreResponse {
  teams?: {
    home?: MlbBoxscoreTeam;
    away?: MlbBoxscoreTeam;
  };
}

export interface MlbPitchingActual {
  playerId: number; name: string | null; inningsPitched: number | null; battersFaced: number | null;
  pitchCount: number | null; runsAllowed: number | null; earnedRuns: number | null; hits: number | null;
  walks: number | null; strikeouts: number | null; homeRunsAllowed: number | null;
}
function innings(value: string | undefined): number | null {
  if (!value || !/^\d+(\.[0-2])?$/.test(value)) return null;
  const [whole, thirds] = value.split(".");
  return Number(whole) + (thirds ? Number(thirds) / 3 : 0);
}
/** First listed pitcher is the authoritative starter; later pitchers are bullpen. */
export function parseMlbBoxscorePitching(team: MlbBoxscoreTeam | undefined): { starter: MlbPitchingActual | null; bullpen: MlbPitchingActual[] } {
  if (!team?.pitchers?.length) return { starter: null, bullpen: [] };
  const actual = (id: number): MlbPitchingActual => {
    const player = team.players?.[`ID${id}`]; const p = player?.stats?.pitching;
    return { playerId: player?.person?.id ?? id, name: player?.person?.fullName ?? null,
      inningsPitched: innings(p?.inningsPitched), battersFaced: p?.battersFaced ?? null, pitchCount: p?.numberOfPitches ?? null,
      runsAllowed: p?.runs ?? null, earnedRuns: p?.earnedRuns ?? null, hits: p?.hits ?? null, walks: p?.baseOnBalls ?? null,
      strikeouts: p?.strikeOuts ?? null, homeRunsAllowed: p?.homeRuns ?? null };
  };
  return { starter: actual(team.pitchers[0]!), bullpen: team.pitchers.slice(1).map(actual) };
}

// ── Step 1: Fetch schedule to get gamePks ─────────────────────────────────────

async function fetchGamePks(
  startDate: string,
  endDate: string,
): Promise<{ gamePk: number; officialDate: string }[]> {
  const url =
    `https://statsapi.mlb.com/api/v1/schedule` +
    `?sportId=1&startDate=${startDate}&endDate=${endDate}&gameType=R`;

  const resp = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "TheBettingModel/2.0" },
  });
  if (!resp.ok) throw new Error(`MLB Stats schedule ${resp.status}`);

  const data = (await resp.json()) as MlbScheduleResponse;
  const results: { gamePk: number; officialDate: string }[] = [];

  for (const date of data.dates ?? []) {
    for (const game of date.games ?? []) {
      // Only Final games have complete boxscore data
      if (game.status?.abstractGameState === "Final") {
        results.push({ gamePk: game.gamePk, officialDate: date.date });
      }
    }
  }
  return results;
}

// ── Step 2: Fetch a single game boxscore ──────────────────────────────────────

async function fetchBoxscore(gamePk: number): Promise<MlbBoxscoreResponse | null> {
  try {
    const resp = await fetch(
      `https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`,
      {
        signal: AbortSignal.timeout(8_000),
        headers: { "User-Agent": "TheBettingModel/2.0" },
      },
    );
    if (!resp.ok) return null;
    return (await resp.json()) as MlbBoxscoreResponse;
  } catch {
    return null;
  }
}

// ── Relief pitches from a single boxscore team ────────────────────────────────

function extractReliefPitches(team: MlbBoxscoreTeam): number {
  const pitcherIds = team.pitchers ?? [];
  // First pitcher = starter; everyone after = relievers
  const relieverIds = pitcherIds.slice(1);
  let total = 0;
  for (const id of relieverIds) {
    const player = team.players?.["ID" + id];
    total += player?.stats?.pitching?.numberOfPitches ?? 0;
  }
  return total;
}

// ── Full fetch: schedule → parallel boxscores → fatigue map ──────────────────

async function fetchRecentBoxscores(
  todayStr: string,
): Promise<Map<string, BullpenStatus>> {
  const startDate = dateOffset(todayStr, -3);
  const endDate   = dateOffset(todayStr, -1);

  const games = await fetchGamePks(startDate, endDate);
  if (games.length === 0) {
    logger.warn({ startDate, endDate }, "MLB bullpen: no completed games in window");
    return new Map();
  }

  // Fetch all boxscores in parallel (typically 30–45 games over 3 days)
  const boxscoreResults = await Promise.allSettled(
    games.map(async ({ gamePk, officialDate }) => {
      const bs = await fetchBoxscore(gamePk);
      return { gamePk, officialDate, boxscore: bs };
    }),
  );

  // Accumulate weighted pitch counts per ESPN abbreviation
  const weightedByTeam = new Map<string, number>();
  const gamesCountByTeam = new Map<string, number>();

  for (const result of boxscoreResults) {
    if (result.status !== "fulfilled" || !result.value.boxscore) continue;
    const { officialDate, boxscore } = result.value;

    const daysAgo = daysBetween(todayStr, officialDate);
    const weight =
      daysAgo === 1 ? 1.00 :
      daysAgo === 2 ? 0.65 :
      daysAgo === 3 ? 0.35 : 0;
    if (weight === 0) continue;

    const sides = [boxscore.teams?.home, boxscore.teams?.away] as const;
    for (const team of sides) {
      if (!team) continue;
      const mlbId  = team.team?.id;
      const abbr   = mlbId ? (MLB_ID_TO_ESPN[mlbId] ?? null) : null;
      if (!abbr) continue;

      const reliefPitches = extractReliefPitches(team);
      weightedByTeam.set(abbr, (weightedByTeam.get(abbr) ?? 0) + reliefPitches * weight);
      gamesCountByTeam.set(abbr, (gamesCountByTeam.get(abbr) ?? 0) + 1);
    }
  }

  // Build BullpenStatus map
  const result = new Map<string, BullpenStatus>();
  for (const [abbr, weighted] of weightedByTeam) {
    const rounded = Math.round(weighted);
    result.set(abbr, {
      teamAbbr: abbr,
      weightedPitches: rounded,
      gamesLast3Days: gamesCountByTeam.get(abbr) ?? 0,
      fatigueLabel: fatigueLabel(rounded),
    });
  }

  logger.info(
    {
      startDate,
      endDate,
      gamesProcessed: games.length,
      boxscoresFetched: boxscoreResults.filter(r => r.status === "fulfilled").length,
      teamsTracked: result.size,
    },
    "MLB bullpen: fatigue computed",
  );
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the bullpen matchup for an MLB game.
 * Returns null entries when data is unavailable.
 */
export async function getBullpenMatchup(
  homeAbbr: string,
  awayAbbr: string,
  todayStr: string,
): Promise<BullpenMatchup> {
  const cached = cache.get(todayStr);
  let statusMap: Map<string, BullpenStatus>;

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    statusMap = cached.data;
  } else {
    try {
      statusMap = await fetchRecentBoxscores(todayStr);
      cache.set(todayStr, { data: statusMap, fetchedAt: Date.now() });
    } catch (err) {
      logger.warn({ err, todayStr }, "MLB bullpen: fetch failed, using cached or null");
      statusMap = cached?.data ?? new Map();
    }
  }

  return {
    home: statusMap.get(homeAbbr) ?? null,
    away: statusMap.get(awayAbbr) ?? null,
  };
}

/**
 * Convert a bullpen matchup into a probability adjustment for the home team.
 *
 * Positive  = home bullpen is fresher → home team advantage.
 * Negative  = away bullpen is fresher → away team advantage.
 * Scale: ±0.04 max (secondary to starting pitcher at ±0.08).
 *
 * Also returns a total-line adjustment (tired pens → more expected runs).
 */
export function computeBullpenAdvantage(matchup: BullpenMatchup): {
  probabilityAdj: number;
  totalAdj: number;
} {
  const homeW = matchup.home?.weightedPitches ?? 0;
  const awayW = matchup.away?.weightedPitches ?? 0;

  // Away fatigue - home fatigue: positive = home pen is fresher
  const diff = awayW - homeW;
  const probabilityAdj = Math.max(-0.04, Math.min(0.04, diff / 250));

  // Combined fatigue → higher expected run environment
  const combined = homeW + awayW;
  const totalAdj = Math.max(0, Math.min(1.0, combined / 400));

  return {
    probabilityAdj: Math.round(probabilityAdj * 1000) / 1000,
    totalAdj: Math.round(totalAdj * 10) / 10,
  };
}
