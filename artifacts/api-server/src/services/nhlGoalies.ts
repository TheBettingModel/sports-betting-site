/**
 * NHL Starting Goalie Service — NHL Web API (free, no key)
 *
 * Goalie save% and GAA are the single most predictive individual-game
 * variables in hockey — more than team quality for any given game.
 *
 * Approach:
 *   1. Fetch today's NHL schedule
 *   2. For each game, get each team's goalie roster stats (season save%, GAA)
 *   3. Use the goalie with the most starts as the presumed starter
 *   4. Compute a probability advantage for the team with the better goalie
 *
 * Cache TTL: 4 hours (starting goalie often not announced until day-of;
 * using season leader is the best available approximation early in the day)
 *
 * Scale: ±0.07 max probability shift. A league-average save% is ~0.909;
 * an elite goalie at 0.930 vs. a weak one at 0.890 is roughly 6–8pp of
 * win probability per sabermetric/hockey analytics research.
 */

import { logger } from "../lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GoalieStats {
  name: string;
  savePct: number;   // e.g. 0.912
  gaa: number;       // goals against average, e.g. 2.55
  gamesStarted: number;
}

export interface GoalieMatchup {
  home: GoalieStats | null;
  away: GoalieStats | null;
}

// ── NHL team abbreviation map ─────────────────────────────────────────────────
// Maps ESPN abbreviations → NHL API team codes (mostly identical; a few differ)

const ESPN_TO_NHL: Record<string, string> = {
  TB:  "TBL",
  NJ:  "NJD",
  LA:  "LAK",
  CLB: "CBJ",
  SJ:  "SJS",
  // All others match directly (ARI, BOS, BUF, CAR, CGY, CHI, COL, DAL, DET,
  // EDM, FLA, MIN, MTL, NSH, NYI, NYR, OTT, PHI, PIT, SEA, STL, TOR, VAN, VGK, WSH, WPG)
};

function nhlCode(espnAbbr: string): string {
  return ESPN_TO_NHL[espnAbbr] ?? espnAbbr;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  matchup: GoalieMatchup;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>(); // key: "home|away:YYYY-MM-DD"
const TTL_MS = 4 * 60 * 60 * 1000;

// ── NHL API fetch ─────────────────────────────────────────────────────────────

const LEAGUE_AVG_SAVE_PCT = 0.909;
const LEAGUE_AVG_GAA      = 2.70;

interface NhlGoalieRaw {
  playerId: number;
  firstName: { default: string };
  lastName:  { default: string };
  gamesStarted?: number;
  savePercentage?: number;
  goalsAgainstAverage?: number;
}

interface NhlClubStats {
  goalies?: NhlGoalieRaw[];
}

async function fetchTeamGoalieStats(teamCode: string): Promise<GoalieStats | null> {
  // Current season: NHL API uses "now" for the active/most-recent season
  const url = `https://api-web.nhle.com/v1/club-stats/${teamCode}/now`;
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "TheBettingModel/2.0" },
    });
    if (!resp.ok) throw new Error(`NHL API ${resp.status}`);

    const data = (await resp.json()) as NhlClubStats;
    const goalies = data.goalies ?? [];

    // Pick the goalie with the most games started (presumed starter)
    const starter = goalies
      .filter((g) => (g.gamesStarted ?? 0) > 0)
      .sort((a, b) => (b.gamesStarted ?? 0) - (a.gamesStarted ?? 0))[0];

    if (!starter) return null;

    return {
      name: `${starter.firstName?.default ?? ""} ${starter.lastName?.default ?? ""}`.trim(),
      savePct:      starter.savePercentage       ?? LEAGUE_AVG_SAVE_PCT,
      gaa:          starter.goalsAgainstAverage  ?? LEAGUE_AVG_GAA,
      gamesStarted: starter.gamesStarted         ?? 0,
    };
  } catch (err) {
    logger.warn({ err, teamCode }, "NHL goalies: team stat fetch failed");
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get probable starting goalies for an NHL game.
 * Returns null for each side when stats are unavailable (off-season, new team, etc.)
 */
export async function getGoalieMatchup(
  homeAbbr: string,
  awayAbbr: string,
  dateStr: string,
): Promise<GoalieMatchup> {
  const cacheKey = `${homeAbbr}|${awayAbbr}:${dateStr}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.matchup;

  const [home, away] = await Promise.allSettled([
    fetchTeamGoalieStats(nhlCode(homeAbbr)),
    fetchTeamGoalieStats(nhlCode(awayAbbr)),
  ]);

  const matchup: GoalieMatchup = {
    home: home.status === "fulfilled" ? home.value : null,
    away: away.status === "fulfilled" ? away.value : null,
  };

  cache.set(cacheKey, { matchup, fetchedAt: Date.now() });

  logger.debug(
    {
      home: matchup.home?.name,
      homeSv: matchup.home?.savePct,
      away: matchup.away?.name,
      awaySv: matchup.away?.savePct,
    },
    "NHL goalies: matchup loaded",
  );

  return matchup;
}

/**
 * Compute a [-0.07, +0.07] probability advantage for the home team based on
 * the goalie matchup. Positive = home goalie advantage.
 *
 * Formula blends save% (70%) and GAA (30%). Save% is more stable and
 * widely accepted as the primary goalie quality metric.
 */
export function computeGoalieAdvantage(matchup: GoalieMatchup): number {
  const { home, away } = matchup;

  const homeSv  = home?.savePct ?? LEAGUE_AVG_SAVE_PCT;
  const awaySv  = away?.savePct ?? LEAGUE_AVG_SAVE_PCT;
  const homeGaa = home?.gaa     ?? LEAGUE_AVG_GAA;
  const awayGaa = away?.gaa     ?? LEAGUE_AVG_GAA;

  // Save% advantage (positive = home better)
  const svAdvantage  = (homeSv - awaySv) * 3.0;  // each 0.01 sv% ≈ 3% probability shift

  // GAA advantage (positive = home allows fewer goals)
  const gaaAdvantage = (awayGaa - homeGaa) * 0.03; // each 0.1 GAA ≈ 0.3% shift

  const raw = svAdvantage * 0.70 + gaaAdvantage * 0.30;
  return Math.max(-0.07, Math.min(0.07, raw));
}
