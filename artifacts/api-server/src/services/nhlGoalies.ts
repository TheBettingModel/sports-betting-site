/**
 * NHL Goalie + Special Teams Service — NHL Web API (free, no key)
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
import { getSeasonContext } from "./season";

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

async function fetchTeamGoalieStats(teamCode: string, seasonId: string): Promise<GoalieStats | null> {
  const url = `https://api-web.nhle.com/v1/club-stats/${teamCode}/${seasonId}`;
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

  const seasonId = getSeasonContext("NHL", dateStr).seasonId;
  const [home, away] = await Promise.allSettled([
    fetchTeamGoalieStats(nhlCode(homeAbbr), seasonId),
    fetchTeamGoalieStats(nhlCode(awayAbbr), seasonId),
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

// ── NHL Special Teams (Power Play / Penalty Kill) ────────────────────────────
//
// Fetched once per scheduler run from the NHL standings endpoint which contains
// season PP% and PK% for every team. A 5 percentage-point PP% advantage
// (e.g. 22% vs 17%) translates to roughly +2.5 pp win probability.
//
// Scale: ±0.04 max probability shift (PP% delta * 0.40 + PK% delta * 0.20).

export interface NhlTeamSpecialTeams {
  ppPct: number;  // power play %, 0–1 (e.g. 0.220 = 22%)
  pkPct: number;  // penalty kill %, 0–1 (e.g. 0.820 = 82%)
}

const LEAGUE_AVG_PP_PCT = 0.195;
const LEAGUE_AVG_PK_PCT = 0.805;

const stCache = new Map<string, { teams: Record<string, NhlTeamSpecialTeams>; fetchedAt: number }>();
const ST_TTL_MS = 6 * 60 * 60 * 1000; // 6 h — PP/PK changes slowly

interface NhlStandingRecord {
  teamAbbrev?:     { default?: string };
  powerPlayPct?:   number;
  penaltyKillPct?: number;
}
interface NhlStandingsResponse {
  standings?: NhlStandingRecord[];
}

async function fetchAllNhlSpecialTeams(dateStr: string): Promise<Record<string, NhlTeamSpecialTeams>> {
  try {
    const resp = await fetch(`https://api-web.nhle.com/v1/standings/${dateStr}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "TheBettingModel/2.0" },
    });
    if (!resp.ok) throw new Error(`NHL standings ${resp.status}`);
    const data = (await resp.json()) as NhlStandingsResponse;
    const result: Record<string, NhlTeamSpecialTeams> = {};
    for (const row of data.standings ?? []) {
      const abbr = row.teamAbbrev?.default;
      if (!abbr) continue;
      result[abbr] = {
        ppPct: row.powerPlayPct   ?? LEAGUE_AVG_PP_PCT,
        pkPct: row.penaltyKillPct ?? LEAGUE_AVG_PK_PCT,
      };
    }
    return result;
  } catch (err) {
    logger.warn({ err }, "NHL special teams: standings fetch failed");
    return {};
  }
}

/**
 * Returns season PP% and PK% for an NHL team (ESPN abbr → NHL abbr via ESPN_TO_NHL map).
 * Falls back to league averages when data is unavailable.
 */
export async function getNhlTeamSpecialTeams(
  espnAbbr: string,
  modeledGameDate: string | Date = new Date(),
): Promise<NhlTeamSpecialTeams> {
  const cacheKey = getSeasonContext("NHL", modeledGameDate).targetDate;
  const cached = stCache.get(cacheKey);
  let teams: Record<string, NhlTeamSpecialTeams>;

  if (cached && Date.now() - cached.fetchedAt < ST_TTL_MS) {
    teams = cached.teams;
  } else {
    teams = await fetchAllNhlSpecialTeams(cacheKey);
    if (Object.keys(teams).length > 0) {
      stCache.set(cacheKey, { teams, fetchedAt: Date.now() });
    } else if (cached) {
      teams = cached.teams; // stale fallback
    }
  }

  const code = nhlCode(espnAbbr);
  return teams[code] ?? teams[espnAbbr] ?? { ppPct: LEAGUE_AVG_PP_PCT, pkPct: LEAGUE_AVG_PK_PCT };
}

/**
 * Compute a [-0.04, +0.04] probability advantage for the home team based on
 * the season power play % and penalty kill % differential.
 * Positive = home team has the special-teams edge.
 */
export function computeNhlSpecialTeamsAdvantage(
  home: NhlTeamSpecialTeams,
  away: NhlTeamSpecialTeams,
): number {
  const ppAdv = home.ppPct - away.ppPct;
  const pkAdv = home.pkPct - away.pkPct;
  const raw   = ppAdv * 0.40 + pkAdv * 0.20;
  return Math.max(-0.04, Math.min(0.04, raw));
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
