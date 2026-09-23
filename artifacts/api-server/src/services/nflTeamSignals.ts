/**
 * NFL Team Situational Signals
 *
 * Provides two purely structural adjustments that require no real-time API calls:
 *
 *  1. Divisional matchup flag — division games historically play 3-4 points
 *     tighter because teams know each other well (coaches, tendencies, personnel).
 *     We apply a slight edge compression so the model doesn't over-project in
 *     these predictably close games.
 *
 *  2. Dome/outdoor mismatch — teams that play their home games in a dome have
 *     a measurable disadvantage when forced to play outdoors (cold, wind, rain).
 *     The inverse is also true: an outdoor team traveling to a dome gains no
 *     meaningful advantage (they can still play in controlled conditions).
 *     We only penalise the dome team going outdoors (–3 pp away, +3 pp home).
 *
 *  3. Turnover differential — season turnover margin (takeaways − giveaways)
 *     fetched from the ESPN NFL team stats API. TO margin is the single
 *     strongest per-game NFL predictor; teams with +3 or better win ~75% of
 *     games. Applied as a ±3 pp probability adjustment.
 *     Falls back gracefully when ESPN data is unavailable.
 */

import { logger } from "../lib/logger";
import { getSeasonContext } from "./season";

// ── NFL Division mapping ───────────────────────────────────────────────────────
// Keyed by ESPN team abbreviation (matches what espn.ts returns in homeTeamAbbr)

const NFL_DIVISION: Record<string, string> = {
  // AFC East
  BUF: "AFC East", MIA: "AFC East", NE: "AFC East", NYJ: "AFC East",
  // AFC North
  BAL: "AFC North", CIN: "AFC North", CLE: "AFC North", PIT: "AFC North",
  // AFC South
  HOU: "AFC South", IND: "AFC South", JAX: "AFC South", TEN: "AFC South",
  // AFC West
  DEN: "AFC West", KC: "AFC West", LV: "AFC West", LAC: "AFC West",
  // NFC East
  DAL: "NFC East", NYG: "NFC East", PHI: "NFC East", WSH: "NFC East",
  // NFC North
  CHI: "NFC North", DET: "NFC North", GB: "NFC North", MIN: "NFC North",
  // NFC South
  ATL: "NFC South", CAR: "NFC South", NO: "NFC South", TB: "NFC South",
  // NFC West
  ARI: "NFC West", LAR: "NFC West", SF: "NFC West", SEA: "NFC West",
};

// ── Dome/retractable-roof stadiums ────────────────────────────────────────────
// These teams' home games are played in a controlled-climate environment.
// When they play outdoors, their win probability takes a small hit.

const DOME_TEAMS = new Set([
  "ATL",  // Mercedes-Benz Stadium (retractable)
  "NO",   // Caesars Superdome (fixed)
  "DAL",  // AT&T Stadium (retractable)
  "HOU",  // NRG Stadium (retractable)
  "IND",  // Lucas Oil Stadium (retractable)
  "MIN",  // U.S. Bank Stadium (fixed)
  "DET",  // Ford Field (fixed)
  "LV",   // Allegiant Stadium (fixed)
  "ARI",  // State Farm Stadium (retractable)
]);

// ── NFL team ESPN IDs for turnover stats ──────────────────────────────────────
// Used to fetch per-team turnover margin from ESPN's team stats endpoint.

const NFL_ESPN_IDS: Record<string, string> = {
  ARI: "22", ATL: "1",  BAL: "33", BUF: "2",  CAR: "29", CHI: "3",
  CIN: "4",  CLE: "5",  DAL: "6",  DEN: "7",  DET: "8",  GB:  "9",
  HOU: "34", IND: "11", JAX: "30", KC:  "12", LAC: "24", LAR: "14",
  LV:  "13", MIA: "15", MIN: "16", NE:  "17", NO:  "18", NYG: "19",
  NYJ: "20", PHI: "21", PIT: "23", SEA: "26", SF:  "25", TB:  "27",
  TEN: "10", WSH: "28",
};

// ── Turnover cache ────────────────────────────────────────────────────────────

interface ToStats {
  takeaways: number;   // defensive turnovers (INT + fumble recoveries)
  giveaways: number;   // offensive turnovers (INT thrown + fumbles lost)
  margin: number;      // takeaways − giveaways
}

interface ToCacheEntry {
  stats: ToStats;
  fetchedAt: number;
}

const toCache = new Map<string, ToCacheEntry>();
const TO_TTL_MS = 4 * 60 * 60 * 1000; // 4 h

async function fetchNflTurnoverStats(abbr: string, modeledGameDate: string | Date): Promise<ToStats | null> {
  const espnId = NFL_ESPN_IDS[abbr];
  if (!espnId) return null;

  const season = getSeasonContext("NFL", modeledGameDate);
  const cacheKey = `${season.startYear}:${abbr}`;
  const cached = toCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TO_TTL_MS) return cached.stats;

  try {
    const url  = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${espnId}/statistics?season=${season.startYear}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!resp.ok) throw new Error(`ESPN NFL stats ${resp.status}`);

    const data = await resp.json() as {
      results?: {
        stats?: {
          categories?: Array<{
            name: string;
            stats?: Array<{ name: string; displayValue: string }>;
          }>;
        };
      };
    };

    const cats = data.results?.stats?.categories ?? [];
    const findStat = (catName: string, statName: string): number => {
      const cat  = cats.find((c) => c.name === catName);
      const stat = cat?.stats?.find((s) => s.name === statName);
      return parseFloat(stat?.displayValue ?? "0") || 0;
    };

    // ESPN NFL categories: "turnovers" → defensiveTurnovers / offensiveTurnovers
    const takeaways = findStat("turnovers", "defensiveTurnovers");
    const giveaways = findStat("turnovers", "offensiveTurnovers");
    const margin    = takeaways - giveaways;

    const stats: ToStats = { takeaways, giveaways, margin };
    toCache.set(cacheKey, { stats, fetchedAt: Date.now() });
    return stats;
  } catch (err) {
    logger.debug({ err, abbr }, "NFL turnover stats: fetch failed (using 0)");
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface NflSituationalSignals {
  /** True when both teams are in the same division */
  isDivisional: boolean;
  /**
   * Probability adjustment from dome/outdoor mismatch.
   * Positive = home team benefits (away dome team going outdoors).
   * Negative = home team penalised (home dome team hosting outdoor opponent — no effect).
   * Range: [-0.03, +0.03]. 0 when no dome mismatch.
   */
  domeMismatch: number;
  /**
   * Probability adjustment from season turnover margin differential.
   * Positive = home team has better TO margin.
   * Range: [-0.03, +0.03]. 0 when data unavailable.
   */
  turnoverAdvantage: number;
}

export async function computeNflSituationalSignals(
  homeAbbr: string,
  awayAbbr: string,
  modeledGameDate: string | Date = new Date(),
): Promise<NflSituationalSignals> {
  // 1. Divisional flag
  const isDivisional =
    !!NFL_DIVISION[homeAbbr] &&
    NFL_DIVISION[homeAbbr] === NFL_DIVISION[awayAbbr];

  // 2. Dome mismatch
  //    Scenario A: away team is dome team, game is at an outdoor venue → away penalty (+home)
  //    Scenario B: home team is dome team, game is at their own dome → no mismatch
  //    Scenario C: home dome team traveling (road game) → captured elsewhere (away records)
  const homeIsDome = DOME_TEAMS.has(homeAbbr);
  const awayIsDome = DOME_TEAMS.has(awayAbbr);
  let domeMismatch = 0;
  if (awayIsDome && !homeIsDome) {
    // Away dome team playing at an outdoor stadium — hurts the away team
    domeMismatch = 0.03;  // +3 pp home advantage
  } else if (homeIsDome && !awayIsDome) {
    // Home dome team hosting — no penalty (they're in their environment)
    domeMismatch = 0;
  }

  // 3. Turnover differential
  let turnoverAdvantage = 0;
  try {
    const [homeTO, awayTO] = await Promise.all([
    fetchNflTurnoverStats(homeAbbr, modeledGameDate),
    fetchNflTurnoverStats(awayAbbr, modeledGameDate),
    ]);
    if (homeTO && awayTO) {
      const marginDiff = homeTO.margin - awayTO.margin;
      // Scale: ±10 TO margin difference → ±3 pp shift; cap at ±0.03
      turnoverAdvantage = Math.max(-0.03, Math.min(0.03, marginDiff * 0.003));
    }
  } catch {
    // Fail silently — turnover data is supplemental, not load-bearing
  }

  return { isDivisional, domeMismatch, turnoverAdvantage };
}
