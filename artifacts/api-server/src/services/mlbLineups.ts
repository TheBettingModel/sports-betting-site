/**
 * MLB Confirmed Lineup Service
 *
 * Fetches today's confirmed batting order lineups from the MLB Stats API (free).
 * When a lineup is confirmed (≥9 batters), also fetches:
 *   • Season OPS for each starter (overall quality baseline)
 *   • Platoon splits (OPS vs L and vs R pitching) — selected based on opposing starter's hand
 *   • Career OPS vs the specific opposing pitcher (via enrichLineupMatchup)
 *
 * Signal hierarchy in computeLineupAdvantage:
 *   1. Career vs specific pitcher (most specific; requires ≥3 batters with ≥5 PA history)
 *   2. Platoon OPS vs opposing pitcher's handedness (L/R split)
 *   3. Overall season OPS (baseline fallback)
 *
 * Cache: main lineup cache 30 min; platoon fetched alongside OPS; career data 4 h.
 */

import { logger } from "../lib/logger";
import type { MlbSignalCacheMeta } from "./mlbPitchers";
import type { ProbableStarters } from "./mlbPitchers";
import { getSeasonContext } from "./season";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LineupStatus {
  confirmed: boolean;
  batterCount: number; // 0–9
  /**
   * Average season OPS of the 9 confirmed starters.
   * undefined when lineup is not yet confirmed.
   * League average OPS ≈ 0.720.
   */
  lineupOps?: number;
  /** Average OPS of the 9 starters vs left-handed pitching this season. */
  platoonOpsVsL?: number;
  /** Average OPS of the 9 starters vs right-handed pitching this season. */
  platoonOpsVsR?: number;
  /**
   * Average career OPS of the 9 starters vs the specific opposing pitcher.
   * Only populated after enrichLineupMatchup() and when ≥3 batters have ≥5 career PA vs him.
   */
  careerOpsVsPitcher?: number;
  /** MLB player IDs for the 9 confirmed starters — needed for career vs pitcher lookups. */
  playerIds?: number[];
}

export interface LineupMatchup {
  home: LineupStatus;
  away: LineupStatus;
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

const LEAGUE_AVG_OPS = 0.720; // MLB 2024-2025 league average OPS

// ── Cache (main lineup) ───────────────────────────────────────────────────────

interface CacheEntry {
  data: Map<string, LineupMatchup>;
  fetchedAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;

export function getLineupCacheMeta(dateStr: string): MlbSignalCacheMeta {
  const cached = cache.get(dateStr);
  if (!cached) return { sourceCapturedAt: null, cacheAgeMs: null, stale: true };
  const cacheAgeMs = Math.max(0, Date.now() - cached.fetchedAt);
  return {
    sourceCapturedAt: new Date(cached.fetchedAt).toISOString(),
    cacheAgeMs,
    stale: cacheAgeMs >= CACHE_TTL_MS,
  };
}

// ── MLB Stats API types ───────────────────────────────────────────────────────

interface MlbLineupPlayer {
  id?: number;
  battingOrder?: number;
}

interface MlbLineups {
  homePlayers?: MlbLineupPlayer[];
  awayPlayers?: MlbLineupPlayer[];
}

interface MlbScheduleGame {
  gamePk?: number;
  /** Precise scheduled start from the MLB Stats API, used to distinguish doubleheaders. */
  gameDate?: string;
  teams?: {
    home?: { team?: { id?: number } };
    away?: { team?: { id?: number } };
  };
  lineups?: MlbLineups;
}

interface MlbScheduleResponse {
  dates?: Array<{ games?: MlbScheduleGame[] }>;
}

interface MlbPersonStat {
  ops?: string;
  onBasePct?: string;
  sluggingPct?: string;
}

interface MlbPersonResponse {
  people?: Array<{
    id: number;
    stats?: Array<{
      type: { displayName: string };
      splits?: Array<{ stat: MlbPersonStat }>;
    }>;
  }>;
}

interface MlbVsPlayerSplit {
  opponent?: { id?: number };
  stat?: {
    ops?: string;
    obp?: string;
    slg?: string;
    avg?: string;
    plateAppearances?: number;
    atBats?: number;
    hits?: number;
    homeRuns?: number;
    baseOnBalls?: number;
  };
}

// ── Batter OPS fetch (season) ─────────────────────────────────────────────────

/**
 * Batch-fetch season OPS for a list of player IDs.
 * Single API call — MLB Stats API supports comma-separated personIds.
 */
async function fetchBatterOps(playerIds: number[], season: number): Promise<Map<number, number>> {
  if (playerIds.length === 0) return new Map();

  const url =
    `https://statsapi.mlb.com/api/v1/people` +
    `?personIds=${playerIds.join(",")}` +
    `&hydrate=stats(group=hitting,type=season,season=${season})&gameType=R`;

  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "TheBettingModel/2.0" },
    });
    if (!resp.ok) return new Map();

    const data = (await resp.json()) as MlbPersonResponse;
    const result = new Map<number, number>();

    for (const person of data.people ?? []) {
      const seasonGroup = person.stats?.find((s) => s.type.displayName === "season");
      const stat = seasonGroup?.splits?.[0]?.stat;
      if (!stat) continue;

      let ops: number;
      if (stat.ops) {
        ops = parseFloat(stat.ops);
      } else if (stat.onBasePct && stat.sluggingPct) {
        ops = parseFloat(stat.onBasePct) + parseFloat(stat.sluggingPct);
      } else {
        continue; // no hitting data — will fall back to league average
      }

      if (!isNaN(ops) && ops > 0.200 && ops < 1.500) {
        result.set(person.id, ops);
      }
    }

    return result;
  } catch {
    return new Map();
  }
}

// ── Batter platoon splits (vs L / vs R) ──────────────────────────────────────

/**
 * Batch-fetch platoon OPS for a list of player IDs vs a specific pitcher handedness.
 * Uses MLB Stats API statSplits with sitCodes=vl (vs left) or vr (vs right).
 * Returns undefined for batters with insufficient platoon data (not forced to league avg).
 */
async function fetchBatterPlatoonOps(
  playerIds: number[],
  vsHand: "L" | "R",
  season: number,
): Promise<Map<number, number>> {
  if (playerIds.length === 0) return new Map();
  const sitCode = vsHand === "L" ? "vl" : "vr";

  const url =
    `https://statsapi.mlb.com/api/v1/people` +
    `?personIds=${playerIds.join(",")}` +
    `&hydrate=stats(group=hitting,type=statSplits,sitCodes=${sitCode},season=${season},gameType=R)`;

  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "TheBettingModel/2.0" },
    });
    if (!resp.ok) return new Map();

    const data = (await resp.json()) as MlbPersonResponse;
    const result = new Map<number, number>();

    for (const person of data.people ?? []) {
      // statSplits type may display as "statSplits" or "stat splits" — match either
      const splitGroup = person.stats?.find(
        (s) => s.type.displayName === "statSplits" || s.type.displayName === "stat splits",
      );
      const stat = splitGroup?.splits?.[0]?.stat;
      if (!stat) continue;

      let ops: number;
      if (stat.ops) {
        ops = parseFloat(stat.ops);
      } else if (stat.onBasePct && stat.sluggingPct) {
        ops = parseFloat(stat.onBasePct) + parseFloat(stat.sluggingPct);
      } else {
        continue;
      }

      if (!isNaN(ops) && ops > 0.200 && ops < 1.500) {
        result.set(person.id, ops);
      }
    }

    return result;
  } catch {
    return new Map();
  }
}

// ── Career vs specific pitcher ────────────────────────────────────────────────

/**
 * Per batter–pitcher pair cache.
 * Key: "${batterId}-${pitcherId}" → OPS (or null if PA < 5 or fetch failed).
 * TTL: 4 hours — career splits change at most a few times per week.
 */
interface CareerPairEntry {
  ops: number | null;
  fetchedAt: number;
}
const careerPairCache = new Map<string, CareerPairEntry>();
const CAREER_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * Fetch a single batter's career OPS vs a specific pitcher.
 * Uses the MLB Stats API batter-side vsPlayer endpoint, which is publicly available
 * (unlike the pitcher-side aggregate endpoint which requires auth and returns 0 splits).
 *
 * Caches each batter–pitcher pair for 4 hours.
 * Returns null when PA < 5 (sample too small) or on any API failure.
 */
async function fetchBatterVsPitcherOps(
  batterId: number,
  pitcherId: number,
): Promise<number | null> {
  const key = `${batterId}-${pitcherId}`;
  const cached = careerPairCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CAREER_CACHE_TTL_MS) {
    return cached.ops;
  }

  const url =
    `https://statsapi.mlb.com/api/v1/people/${batterId}/stats` +
    `?stats=vsPlayer&group=hitting&opposingPlayerId=${pitcherId}&gameType=R`;

  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "TheBettingModel/2.0" },
    });
    if (!resp.ok) {
      careerPairCache.set(key, { ops: null, fetchedAt: Date.now() });
      return null;
    }

    const data = (await resp.json()) as {
      stats: Array<{ type: { displayName: string }; splits: MlbVsPlayerSplit[] }>;
    };

    // API may return vsPlayerTotal (aggregated) or vsPlayer (split by season) — prefer total
    const grp =
      data.stats?.find((s) => s.type.displayName === "vsPlayerTotal") ??
      data.stats?.find((s) => s.type.displayName === "vsPlayer");
    const st = grp?.splits?.[0]?.stat;

    let ops: number | null = null;
    if (st) {
      const pa = st.plateAppearances ?? 0;
      if (pa >= 5) {
        if (st.ops) {
          ops = parseFloat(st.ops);
        } else if (st.obp && st.slg) {
          ops = parseFloat(st.obp) + parseFloat(st.slg);
        } else if (st.hits != null && st.atBats != null && st.atBats > 0 && pa > 0) {
          const hr = st.homeRuns ?? 0;
          const bb = st.baseOnBalls ?? 0;
          ops = (st.hits + bb) / pa + (st.hits + 2.5 * hr) / st.atBats;
        }
      }
    }

    if (ops != null && (isNaN(ops) || ops < 0.100 || ops > 2.500)) ops = null;
    careerPairCache.set(key, { ops, fetchedAt: Date.now() });
    return ops;
  } catch {
    careerPairCache.set(key, { ops: null, fetchedAt: Date.now() });
    return null;
  }
}

/**
 * Compute the average career OPS for a lineup vs a specific opposing pitcher.
 * Fetches each batter–pitcher pair in parallel (9 calls max, all cached 4 h).
 * Returns null when fewer than 3 lineup batters have ≥5 career PA vs this pitcher.
 */
async function computeCareerOpsVsPitcher(
  pitcherId: number,
  batterIds: number[],
): Promise<number | null> {
  const opsValues = await Promise.all(
    batterIds.map((id) => fetchBatterVsPitcherOps(id, pitcherId)),
  );
  const valid = opsValues.filter((v): v is number => v != null);
  return valid.length >= 3 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getConfirmedBatters(players: MlbLineupPlayer[]): MlbLineupPlayer[] {
  return players.filter((p) => p.battingOrder != null && p.battingOrder > 0);
}

/** Full-average OPS with league-avg fallback for batters missing data. */
function computeAvgOps(batters: MlbLineupPlayer[], opsMap: Map<number, number>): number {
  if (batters.length === 0) return LEAGUE_AVG_OPS;
  let sum = 0;
  let count = 0;
  for (const b of batters) {
    sum += b.id != null ? (opsMap.get(b.id) ?? LEAGUE_AVG_OPS) : LEAGUE_AVG_OPS;
    count++;
  }
  return count > 0 ? sum / count : LEAGUE_AVG_OPS;
}

/**
 * Average OPS only for batters that have data; returns undefined when fewer than
 * half the lineup has data (avoids polluting platoon signal with league-avg imputation).
 */
function computeAvgOpsIfAvailable(
  batters: MlbLineupPlayer[],
  opsMap: Map<number, number>,
): number | undefined {
  if (batters.length === 0) return undefined;
  let sum = 0;
  let count = 0;
  for (const b of batters) {
    if (b.id != null && opsMap.has(b.id)) {
      sum += opsMap.get(b.id)!;
      count++;
    }
  }
  // Need at least half the lineup to have real platoon data
  return count >= Math.ceil(batters.length / 2) ? sum / count : undefined;
}

/**
 * MLB and ESPN use different game IDs. A matchup plus its precise scheduled start
 * is the stable cross-provider identity, including for same-day doubleheaders.
 */
export function makeLineupGameKey(
  homeAbbr: string,
  awayAbbr: string,
  commenceTimeISO: string,
): string | null {
  const startMs = Date.parse(commenceTimeISO);
  if (!Number.isFinite(startMs)) return null;
  return `${homeAbbr}|${awayAbbr}|${new Date(startMs).toISOString().slice(0, 16)}`;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchLineups(dateStr: string): Promise<Map<string, LineupMatchup>> {
  const [y, m, d] = dateStr.split("-");
  const mlbDate = `${m}/${d}/${y}`;

  const url =
    `https://statsapi.mlb.com/api/v1/schedule` +
    `?sportId=1&date=${mlbDate}&hydrate=lineups,team&gameType=R`;

  const resp = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "TheBettingModel/2.0" },
  });
  if (!resp.ok) throw new Error(`MLB Stats API ${resp.status} (lineup fetch)`);

  const schedule = (await resp.json()) as MlbScheduleResponse;
  const games = schedule.dates?.[0]?.games ?? [];

  // ── First pass: collect confirmed lineup batter IDs ───────────────────────
  const confirmedBatterIds = new Set<number>();
  for (const game of games) {
    const home = getConfirmedBatters(game.lineups?.homePlayers ?? []);
    const away = getConfirmedBatters(game.lineups?.awayPlayers ?? []);
    if (home.length >= 9) for (const b of home) if (b.id) confirmedBatterIds.add(b.id);
    if (away.length >= 9) for (const b of away) if (b.id) confirmedBatterIds.add(b.id);
  }

  // ── Batch-fetch OPS + platoon splits in parallel (three calls, all batters) ─
  const confirmedIds = [...confirmedBatterIds];
  const season = getSeasonContext("MLB", dateStr).startYear;
  const [batterOpsMap, platoonVLMap, platoonVRMap] = await Promise.all([
    confirmedIds.length > 0
      ? fetchBatterOps(confirmedIds, season)
      : Promise.resolve(new Map<number, number>()),
    confirmedIds.length > 0
      ? fetchBatterPlatoonOps(confirmedIds, "L", season)
      : Promise.resolve(new Map<number, number>()),
    confirmedIds.length > 0
      ? fetchBatterPlatoonOps(confirmedIds, "R", season)
      : Promise.resolve(new Map<number, number>()),
  ]);

  // ── Second pass: build result map ────────────────────────────────────────
  const result = new Map<string, LineupMatchup>();

  for (const game of games) {
    const homeId   = game.teams?.home?.team?.id;
    const awayId   = game.teams?.away?.team?.id;
    const homeAbbr = homeId ? (MLB_ID_TO_ESPN[homeId] ?? null) : null;
    const awayAbbr = awayId ? (MLB_ID_TO_ESPN[awayId] ?? null) : null;
    if (!homeAbbr || !awayAbbr) continue;

    const homeBatters = getConfirmedBatters(game.lineups?.homePlayers ?? []);
    const awayBatters = getConfirmedBatters(game.lineups?.awayPlayers ?? []);

    const homeConfirmed = homeBatters.length >= 9;
    const awayConfirmed = awayBatters.length >= 9;

    const homeIds = homeBatters.map((b) => b.id).filter((id): id is number => id != null);
    const awayIds = awayBatters.map((b) => b.id).filter((id): id is number => id != null);

    const gameKey = game.gameDate
      ? makeLineupGameKey(homeAbbr, awayAbbr, game.gameDate)
      : null;
    if (!gameKey) {
      logger.warn({ gamePk: game.gamePk, homeAbbr, awayAbbr }, "MLB lineups: skipped game without valid start time");
      continue;
    }

    result.set(gameKey, {
      home: {
        confirmed:    homeConfirmed,
        batterCount:  homeBatters.length,
        lineupOps:    homeConfirmed ? computeAvgOps(homeBatters, batterOpsMap) : undefined,
        platoonOpsVsL: homeConfirmed ? computeAvgOpsIfAvailable(homeBatters, platoonVLMap) : undefined,
        platoonOpsVsR: homeConfirmed ? computeAvgOpsIfAvailable(homeBatters, platoonVRMap) : undefined,
        playerIds:    homeConfirmed ? homeIds : undefined,
      },
      away: {
        confirmed:    awayConfirmed,
        batterCount:  awayBatters.length,
        lineupOps:    awayConfirmed ? computeAvgOps(awayBatters, batterOpsMap) : undefined,
        platoonOpsVsL: awayConfirmed ? computeAvgOpsIfAvailable(awayBatters, platoonVLMap) : undefined,
        platoonOpsVsR: awayConfirmed ? computeAvgOpsIfAvailable(awayBatters, platoonVRMap) : undefined,
        playerIds:    awayConfirmed ? awayIds : undefined,
      },
    });
  }

  const confirmedCount = [...result.values()].filter((m) => m.home.confirmed && m.away.confirmed).length;
  logger.info(
    {
      date: dateStr,
      games: result.size,
      bothConfirmed: confirmedCount,
      opsEnriched: confirmedBatterIds.size,
      platoonVL: platoonVLMap.size,
      platoonVR: platoonVRMap.size,
    },
    "MLB lineups: fetched",
  );
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

const NOT_CONFIRMED: LineupStatus = { confirmed: false, batterCount: 0 };

export async function getLineupMatchup(
  homeAbbr: string,
  awayAbbr: string,
  dateStr: string,
  commenceTimeISO: string,
): Promise<LineupMatchup> {
  const cached = cache.get(dateStr);
  let lineupMap: Map<string, LineupMatchup>;

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    lineupMap = cached.data;
  } else {
    try {
      lineupMap = await fetchLineups(dateStr);
      cache.set(dateStr, { data: lineupMap, fetchedAt: Date.now() });
    } catch (err) {
      logger.warn({ err, dateStr }, "MLB lineups: fetch failed");
      lineupMap = cached?.data ?? new Map();
    }
  }

  const gameKey = makeLineupGameKey(homeAbbr, awayAbbr, commenceTimeISO);
  if (!gameKey) return { home: NOT_CONFIRMED, away: NOT_CONFIRMED };
  return lineupMap.get(gameKey) ?? { home: NOT_CONFIRMED, away: NOT_CONFIRMED };
}

// ── Career matchup enrichment ─────────────────────────────────────────────────

/** Short-lived cache so the scheduler's per-minute runs don't re-fetch the same data. */
interface EnrichmentCacheEntry {
  data: LineupMatchup;
  fetchedAt: number;
}
const enrichmentCache = new Map<string, EnrichmentCacheEntry>();
const ENRICHMENT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

/**
 * Enrich a LineupMatchup with career vs pitcher data.
 *
 * Must be called AFTER both getLineupMatchup() and getProbablePitchers() return.
 * Uses each pitcher's MLB player ID to look up career batter–pitcher matchup records
 * for the opposing confirmed lineup. Caches results for 30 minutes.
 *
 * @param matchup   Result of getLineupMatchup()
 * @param starters  Result of getProbablePitchers() — provides pitcher IDs
 */
export async function enrichLineupMatchup(
  matchup: LineupMatchup,
  starters: ProbableStarters,
): Promise<LineupMatchup> {
  const homeId = starters.home?.playerId ?? null;
  const awayId = starters.away?.playerId ?? null;

  const cacheKey = [
    homeId ?? "x",
    awayId ?? "x",
    matchup.home.playerIds?.join(",") ?? "",
    matchup.away.playerIds?.join(",") ?? "",
  ].join("|");

  const cached = enrichmentCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < ENRICHMENT_CACHE_TTL_MS) {
    return cached.data;
  }

  // Fetch career OPS for both lineups vs their opposing pitcher in parallel.
  // Home batters face the AWAY pitcher; away batters face the HOME pitcher.
  const [homeCareerVsAwayPitcher, awayCareerVsHomePitcher] = await Promise.all([
    awayId && matchup.home.playerIds?.length
      ? computeCareerOpsVsPitcher(awayId, matchup.home.playerIds)
      : Promise.resolve(null),
    homeId && matchup.away.playerIds?.length
      ? computeCareerOpsVsPitcher(homeId, matchup.away.playerIds)
      : Promise.resolve(null),
  ]);

  if (homeCareerVsAwayPitcher != null || awayCareerVsHomePitcher != null) {
    logger.info(
      { homeCareerOps: homeCareerVsAwayPitcher, awayCareerOps: awayCareerVsHomePitcher },
      "MLB lineups: career vs pitcher enrichment applied",
    );
  }

  const result: LineupMatchup = {
    home: {
      ...matchup.home,
      careerOpsVsPitcher: homeCareerVsAwayPitcher ?? undefined,
    },
    away: {
      ...matchup.away,
      careerOpsVsPitcher: awayCareerVsHomePitcher ?? undefined,
    },
  };

  enrichmentCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  return result;
}

// ── Lineup advantage computation ──────────────────────────────────────────────

/**
 * Select the most informative OPS for a lineup given the opposing pitcher's handedness.
 * Priority: platoon split (if available) > overall OPS > league average.
 */
function selectBestOps(lineup: LineupStatus, vsHand: "L" | "R" | null | undefined): number {
  if (vsHand === "L" && lineup.platoonOpsVsL != null) return lineup.platoonOpsVsL;
  if (vsHand === "R" && lineup.platoonOpsVsR != null) return lineup.platoonOpsVsR;
  return lineup.lineupOps ?? LEAGUE_AVG_OPS;
}

/**
 * Compute a [-0.06, +0.06] lineup quality + matchup advantage for the home team.
 *
 * Requires both lineups to be confirmed; returns 0 when unconfirmed.
 *
 * Signal layers (each falls back to the previous when unavailable):
 *   1. Career OPS vs this specific pitcher (40% blend when ≥3 batters have ≥5 PA history)
 *   2. Platoon OPS vs the pitcher's handedness (L/R split)
 *   3. Overall season OPS (baseline)
 *
 * @param home           Home team lineup status
 * @param away           Away team lineup status
 * @param homeStarterHand Home team starter's handedness — what AWAY batters face
 * @param awayStarterHand Away team starter's handedness — what HOME batters face
 */
export function computeLineupAdvantage(
  home: LineupStatus,
  away: LineupStatus,
  homeStarterHand?: "L" | "R" | null,
  awayStarterHand?: "L" | "R" | null,
): number {
  if (!home.confirmed || !away.confirmed) return 0;
  if (home.lineupOps == null || away.lineupOps == null) return 0;

  // Step 1: base OPS using platoon splits vs the opposing pitcher's handedness
  // Home batters face the AWAY pitcher → select vs awayStarterHand
  // Away batters face the HOME pitcher → select vs homeStarterHand
  const homeBaseOps = selectBestOps(home, awayStarterHand);
  const awayBaseOps = selectBestOps(away, homeStarterHand);

  // Step 2: blend in career matchup data when available
  // 60/40 split — career is most specific but sample sizes can be small
  const homeOps = home.careerOpsVsPitcher != null
    ? homeBaseOps * 0.60 + home.careerOpsVsPitcher * 0.40
    : homeBaseOps;
  const awayOps = away.careerOpsVsPitcher != null
    ? awayBaseOps * 0.60 + away.careerOpsVsPitcher * 0.40
    : awayBaseOps;

  const diff = homeOps - awayOps;
  // Scale: 0.010 OPS × 0.30 = 0.003 win-probability shift per 10-point OPS gap.
  // Cap expanded to ±0.06 (from ±0.04) to allow platoon/career signal full range.
  const raw = diff * 0.30;
  return Math.max(-0.06, Math.min(0.06, raw));
}
