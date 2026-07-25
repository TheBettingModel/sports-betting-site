/**
 * MLB Confirmed Lineup Service
 *
 * Fetches today's confirmed batting order lineups from the MLB Stats API (free).
 * Lineups are typically posted 1–3 hours before first pitch. Before that, the
 * API returns empty arrays — this service gracefully returns null in that case.
 *
 * Primary use: display "Lineup Confirmed" / "Lineup TBD" on game cards so
 * users know whether the model's batting-order context is locked in.
 *
 * Cache TTL: 30 minutes — lineups can change up until ~15 minutes before game.
 */

import { logger } from "../lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LineupStatus {
  confirmed: boolean;
  batterCount: number; // 0–9
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

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  /** "homeAbbr|awayAbbr" → LineupMatchup */
  data: Map<string, LineupMatchup>;
  fetchedAt: number;
}
const cache = new Map<string, CacheEntry>(); // key: YYYY-MM-DD
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — refresh as lineups come in

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

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchLineups(dateStr: string): Promise<Map<string, LineupMatchup>> {
  // Convert YYYY-MM-DD to MM/DD/YYYY for the MLB Stats API date param
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
  const result = new Map<string, LineupMatchup>();

  for (const game of games) {
    const homeId = game.teams?.home?.team?.id;
    const awayId  = game.teams?.away?.team?.id;

    const homeAbbr = homeId ? (MLB_ID_TO_ESPN[homeId] ?? null) : null;
    const awayAbbr = awayId ? (MLB_ID_TO_ESPN[awayId] ?? null) : null;
    if (!homeAbbr || !awayAbbr) continue;

    const homeBatters = (game.lineups?.homePlayers ?? []).filter(
      (p) => p.battingOrder != null && p.battingOrder > 0,
    );
    const awayBatters = (game.lineups?.awayPlayers ?? []).filter(
      (p) => p.battingOrder != null && p.battingOrder > 0,
    );

    result.set(`${homeAbbr}|${awayAbbr}`, {
      home: { confirmed: homeBatters.length >= 9, batterCount: homeBatters.length },
      away: { confirmed: awayBatters.length >= 9, batterCount: awayBatters.length },
    });
  }

  const confirmedCount = [...result.values()].filter(
    (m) => m.home.confirmed && m.away.confirmed,
  ).length;

  logger.info(
    { date: dateStr, games: result.size, bothConfirmed: confirmedCount },
    "MLB lineups: fetched",
  );
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

const NOT_CONFIRMED: LineupStatus = { confirmed: false, batterCount: 0 };

/**
 * Get lineup confirmation status for an MLB game.
 * Returns `confirmed: false` for both teams when lineups aren't posted yet.
 */
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

  return (
    lineupMap.get(`${homeAbbr}|${awayAbbr}`) ?? { home: NOT_CONFIRMED, away: NOT_CONFIRMED }
  );
}
