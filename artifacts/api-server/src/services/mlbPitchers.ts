/**
 * MLB Starting Pitcher Service
 *
 * Fetches today's probable starters from the MLB Stats API (free, no key).
 * For each pitcher computes:
 *   - Season ERA and WHIP
 *   - "Recent ERA" — ERA over last 3 starts (more predictive than season average)
 *   - Recent innings pitched (proxy for stamina/effectiveness)
 *
 * Cache TTL: 4 hours. Probable pitchers announced by morning; day-of changes
 * (scratches) are rare and typically announced hours before game time.
 *
 * The model uses the pitcher advantage score to adjust win probability in the
 * MLB runs model. A Cy Young-caliber starter vs. a #5 starter is the single
 * biggest single-game variable in baseball.
 */

import { logger } from "../lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PitcherStats {
  name: string;
  /** Season ERA (earned run average). League average ≈ 4.20 */
  seasonEra: number;
  /** Season WHIP. League average ≈ 1.25 */
  seasonWhip: number;
  /** ERA computed over the last 3 starts — more predictive than full season */
  recentEra: number;
  /** Average innings pitched over last 3 starts (arm length / stamina proxy) */
  recentIpAvg: number;
}

export interface ProbableStarters {
  home: PitcherStats | null;
  away: PitcherStats | null;
}

// ── MLB Stats API team ID → ESPN abbreviation ─────────────────────────────────
// The schedule endpoint returns team objects with id + name but NOT abbreviation.
// IDs are permanent (unlike abbreviations which can change with rebranding).
// MLB abbreviations diverge from ESPN for a few teams (e.g. MLB "AZ" → ESPN "ARI").
const MLB_ID_TO_ESPN: Record<number, string> = {
  109: "ARI",  // Arizona Diamondbacks (MLB: AZ)
  133: "ATH",  // Athletics
  144: "ATL",
  110: "BAL",
  111: "BOS",
  112: "CHC",
  145: "CWS",
  113: "CIN",
  114: "CLE",  // Cleveland Guardians
  115: "COL",
  116: "DET",
  117: "HOU",
  118: "KC",
  108: "LAA",
  119: "LAD",
  146: "MIA",
  158: "MIL",
  142: "MIN",
  121: "NYM",
  147: "NYY",
  143: "PHI",
  134: "PIT",
  135: "SD",
  137: "SF",
  136: "SEA",
  138: "STL",
  139: "TB",
  140: "TEX",
  141: "TOR",
  120: "WSH",
};

// ── Pitcher stat fetch ────────────────────────────────────────────────────────

const LEAGUE_AVG_ERA  = 4.20;
const LEAGUE_AVG_WHIP = 1.25;

interface MlbGameLogSplit {
  date: string;
  stat: {
    era: string;
    whip: string;
    inningsPitched: string;
    numberOfPitches?: number;
  };
}

interface MlbStatGroup {
  type: { displayName: string };
  splits: MlbGameLogSplit[];
}

async function fetchPitcherStats(pitcherId: number, name: string): Promise<PitcherStats> {
  const url =
    `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats` +
    `?stats=season,gameLog&group=pitching&season=2026&gameType=R`;

  const resp = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: { "User-Agent": "TheBettingModel/2.0" },
  });
  if (!resp.ok) throw new Error(`MLB Stats API ${resp.status} for pitcher ${pitcherId}`);

  const data = (await resp.json()) as { stats: MlbStatGroup[] };

  // Season aggregate — MLB Stats API returns type.displayName === "season"
  const seasonGroup = data.stats.find((s) => s.type.displayName === "season");
  const seasonSplit  = seasonGroup?.splits?.[0]?.stat;
  // Fall back to most-recent game log entry (cumulative ERA at that date) if season group missing
  const latestLog = (data.stats.find((s) => s.type.displayName === "gameLog")?.splits ?? [])[0]?.stat;
  const seasonEra  = seasonSplit?.era  ? parseFloat(seasonSplit.era)  :
                     latestLog?.era    ? parseFloat(latestLog.era)    : LEAGUE_AVG_ERA;
  const seasonWhip = seasonSplit?.whip ? parseFloat(seasonSplit.whip) :
                     latestLog?.whip   ? parseFloat(latestLog.whip)   : LEAGUE_AVG_WHIP;

  // Game log — last 3 starts
  const gameLogGroup = data.stats.find((s) => s.type.displayName === "gameLog");
  const lastStarts   = (gameLogGroup?.splits ?? []).slice(0, 3);

  let recentEraSum = 0;
  let recentIpSum  = 0;
  let count = 0;

  for (const start of lastStarts) {
    const era = parseFloat(start.stat.era ?? "0");
    const ip  = parseFloat(start.stat.inningsPitched ?? "0");
    if (!isNaN(era)) recentEraSum += era;
    if (!isNaN(ip))  recentIpSum  += ip;
    count++;
  }

  const recentEra   = count > 0 ? recentEraSum / count : seasonEra;
  const recentIpAvg = count > 0 ? recentIpSum  / count : 5.0;

  return { name, seasonEra, seasonWhip, recentEra, recentIpAvg };
}

// ── Schedule fetch + cache ────────────────────────────────────────────────────

interface CacheEntry {
  data: Map<string, ProbableStarters>; // key: "homeAbbr|awayAbbr"
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>(); // key: date string YYYY-MM-DD
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface MlbTeam {
  team: { id?: number; name?: string };
  probablePitcher?: { id: number; fullName: string };
}

interface MlbGame {
  teams: { home: MlbTeam; away: MlbTeam };
}

interface MlbSchedule {
  dates?: Array<{ games: MlbGame[] }>;
}

async function fetchSchedule(dateStr: string): Promise<Map<string, ProbableStarters>> {
  const url =
    `https://statsapi.mlb.com/api/v1/schedule` +
    `?sportId=1&date=${dateStr}&hydrate=probablePitcher,team&gameType=R`;

  const resp = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "TheBettingModel/2.0" },
  });
  if (!resp.ok) throw new Error(`MLB schedule API ${resp.status}`);

  const schedule = (await resp.json()) as MlbSchedule;
  const games    = schedule.dates?.[0]?.games ?? [];

  // Collect unique pitcher IDs to fetch in parallel
  const pitcherIds = new Set<number>();
  for (const g of games) {
    if (g.teams.home.probablePitcher?.id) pitcherIds.add(g.teams.home.probablePitcher.id);
    if (g.teams.away.probablePitcher?.id) pitcherIds.add(g.teams.away.probablePitcher.id);
  }

  // Fetch all pitcher stats in parallel (with graceful per-pitcher error handling)
  const statsByPitcherId = new Map<number, PitcherStats>();
  await Promise.allSettled(
    [...pitcherIds].map(async (id) => {
      try {
        const pitcher = games
          .flatMap((g) => [g.teams.home.probablePitcher, g.teams.away.probablePitcher])
          .find((p) => p?.id === id);
        const stats = await fetchPitcherStats(id, pitcher?.fullName ?? "Unknown");
        statsByPitcherId.set(id, stats);
      } catch (err) {
        logger.warn({ err, pitcherId: id }, "MLB pitchers: stat fetch failed for one pitcher");
      }
    }),
  );

  // Build lookup map keyed by "homeAbbr|awayAbbr" (using MLB abbreviations)
  const result = new Map<string, ProbableStarters>();

  for (const g of games) {
    const homeId = g.teams.home.team?.id;
    const awayId = g.teams.away.team?.id;
    const homeAbbr = homeId ? (MLB_ID_TO_ESPN[homeId] ?? "") : "";
    const awayAbbr = awayId ? (MLB_ID_TO_ESPN[awayId] ?? "") : "";
    if (!homeAbbr || !awayAbbr) continue;

    const homeP = g.teams.home.probablePitcher;
    const awayP = g.teams.away.probablePitcher;

    const starters: ProbableStarters = {
      home: homeP ? (statsByPitcherId.get(homeP.id) ?? { name: homeP.fullName, seasonEra: LEAGUE_AVG_ERA, seasonWhip: LEAGUE_AVG_WHIP, recentEra: LEAGUE_AVG_ERA, recentIpAvg: 5.0 }) : null,
      away: awayP ? (statsByPitcherId.get(awayP.id) ?? { name: awayP.fullName, seasonEra: LEAGUE_AVG_ERA, seasonWhip: LEAGUE_AVG_WHIP, recentEra: LEAGUE_AVG_ERA, recentIpAvg: 5.0 }) : null,
    };

    result.set(`${homeAbbr}|${awayAbbr}`, starters);
  }

  logger.info(
    { date: dateStr, games: result.size, pitchersFound: statsByPitcherId.size },
    "MLB pitchers: schedule loaded",
  );
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get probable starters for an MLB game.
 * @param homeAbbr ESPN team abbreviation for the home team (e.g. "NYM")
 * @param awayAbbr ESPN team abbreviation for the away team (e.g. "LAD")
 * @param dateStr  Game date in YYYY-MM-DD format (Eastern)
 */
export async function getProbablePitchers(
  homeAbbr: string,
  awayAbbr: string,
  dateStr: string,
): Promise<ProbableStarters> {
  const cached = cache.get(dateStr);
  let scheduleMap: Map<string, ProbableStarters>;

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    scheduleMap = cached.data;
  } else {
    try {
      scheduleMap = await fetchSchedule(dateStr);
      cache.set(dateStr, { data: scheduleMap, fetchedAt: Date.now() });
    } catch (err) {
      logger.error({ err, dateStr }, "MLB pitchers: schedule fetch failed");
      scheduleMap = cached?.data ?? new Map();
    }
  }

  return scheduleMap.get(`${homeAbbr}|${awayAbbr}`) ?? { home: null, away: null };
}

/**
 * Compute a [-1, +1] pitcher advantage score for the home team.
 *
 * Positive = home pitcher advantage, Negative = away pitcher advantage.
 * Used to adjust win probability in the MLB runs model.
 *
 * Blends season ERA (30%) and recent ERA (70%) — recent form is more
 * predictive for an individual game than season totals.
 *
 * Scale: ±0.08 max probability shift (an elite vs. replacement starter
 * swings win probability by roughly 6–8 percentage points per sabermetrics
 * research, which aligns with this cap).
 */
export function computePitcherAdvantage(starters: ProbableStarters): number {
  const { home, away } = starters;

  // Default to league average for unknown pitchers
  const homeEra    = home?.seasonEra  ?? LEAGUE_AVG_ERA;
  const awayEra    = away?.seasonEra  ?? LEAGUE_AVG_ERA;
  const homeRecent = home?.recentEra  ?? homeEra;
  const awayRecent = away?.recentEra  ?? awayEra;

  // Positive diff = away has higher (worse) ERA = home pitcher advantage
  const seasonDiff = awayEra    - homeEra;
  const recentDiff = awayRecent - homeRecent;

  // Weighted blend: recent form weighted 70%, season 30%
  const blended = seasonDiff * 0.30 + recentDiff * 0.70;

  // Scale: each ERA point of difference ≈ 0.025 win probability shift
  const raw = blended * 0.025;

  // Cap at ±0.08
  return Math.max(-0.08, Math.min(0.08, raw));
}
