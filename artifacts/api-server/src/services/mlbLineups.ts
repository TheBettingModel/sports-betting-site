/**
 * MLB Confirmed Lineup Service
 *
 * Fetches today's confirmed batting order lineups from the MLB Stats API (free).
 * When a lineup is confirmed (≥9 batters), also fetches season OPS for each
 * starter and computes a lineup quality score. This feeds directly into the
 * model so a full-strength lineup is treated differently from a replacement-heavy one.
 *
 * Lineup confirmation: typically posted 1–3 hours before first pitch.
 * Cache TTL: 30 minutes — lineups can change up until ~15 min before game.
 */

import { logger } from "../lib/logger";

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

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  data: Map<string, LineupMatchup>;
  fetchedAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;

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

// ── Batter OPS fetch ──────────────────────────────────────────────────────────

/**
 * Batch-fetch season OPS for a list of player IDs.
 * Single API call — MLB Stats API supports comma-separated personIds.
 */
async function fetchBatterOps(playerIds: number[]): Promise<Map<number, number>> {
  if (playerIds.length === 0) return new Map();

  const url =
    `https://statsapi.mlb.com/api/v1/people` +
    `?personIds=${playerIds.join(",")}` +
    `&hydrate=stats(group=hitting,type=season,season=2026)&gameType=R`;

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function getConfirmedBatters(players: MlbLineupPlayer[]): MlbLineupPlayer[] {
  return players.filter((p) => p.battingOrder != null && p.battingOrder > 0);
}

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

  // ── Batch-fetch OPS for all confirmed batters (one API call) ──────────────
  const batterOpsMap = confirmedBatterIds.size > 0
    ? await fetchBatterOps([...confirmedBatterIds])
    : new Map<number, number>();

  // ── Second pass: build result map with OPS enrichment ────────────────────
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

    result.set(`${homeAbbr}|${awayAbbr}`, {
      home: {
        confirmed:  homeConfirmed,
        batterCount: homeBatters.length,
        lineupOps:  homeConfirmed ? computeAvgOps(homeBatters, batterOpsMap) : undefined,
      },
      away: {
        confirmed:  awayConfirmed,
        batterCount: awayBatters.length,
        lineupOps:  awayConfirmed ? computeAvgOps(awayBatters, batterOpsMap) : undefined,
      },
    });
  }

  const confirmedCount = [...result.values()].filter((m) => m.home.confirmed && m.away.confirmed).length;
  logger.info(
    { date: dateStr, games: result.size, bothConfirmed: confirmedCount, opsEnriched: confirmedBatterIds.size },
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

  return lineupMap.get(`${homeAbbr}|${awayAbbr}`) ?? { home: NOT_CONFIRMED, away: NOT_CONFIRMED };
}

/**
 * Compute a [-0.04, +0.04] lineup quality advantage for the home team.
 *
 * Requires both lineups to be confirmed. Returns 0 when lineups are unconfirmed
 * (model falls back to team-average quality signals).
 *
 * Each 0.010 OPS gap across 9 starters ≈ 0.003 win probability shift.
 * A .780 vs .700 OPS differential (strong vs. replacement lineup) ≈ +2.4pp.
 */
export function computeLineupAdvantage(home: LineupStatus, away: LineupStatus): number {
  if (!home.confirmed || !away.confirmed) return 0;
  if (home.lineupOps == null || away.lineupOps == null) return 0;

  const diff = home.lineupOps - away.lineupOps;
  // Scale: 0.010 OPS × 0.30 = 0.003 probability shift per 10-point OPS gap
  const raw  = diff * 0.30;
  return Math.max(-0.04, Math.min(0.04, raw));
}
