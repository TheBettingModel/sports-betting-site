/**
 * Team Statistics Service
 *
 * Fetches and caches rich team analytics used by the projection model.
 *
 * ── WNBA ──────────────────────────────────────────────────────────────────
 *   Source:  ESPN team stats API  +  ESPN team schedule API
 *   Metrics: eFG%, TS%, pace, turnover%, assist%, OREB, 3P rate,
 *            steals/blocks, last-5/10 win%, point differential, rest days.
 *   Cache:   In-memory, 4-hour TTL.  A single concurrent refresh promise
 *            ensures we only fire one batch of ESPN calls at a time.
 *
 * ── Soccer ────────────────────────────────────────────────────────────────
 *   Source:  Our own games DB (completed matches we've already stored).
 *   Metrics: Goals per game, goals allowed per game, goal differential,
 *            last-5/10 form rating (W=1, D=0.4, L=0), last-5 goal diff,
 *            rest days since last match.
 *   Cache:   In-memory, 1-hour TTL (DB data changes every 15 min).
 *
 * Both caches return stale data immediately while a background refresh runs,
 * so the model always has something to work with.
 */

import { db, gamesTable } from "@workspace/db";
import { and, desc, eq, or } from "drizzle-orm";
import { logger } from "../lib/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface WnbaTeamStats {
  teamId: string;
  // ── Offensive efficiency ─────────────────────────────────────────────────
  ppg: number;                  // points per game
  efgPercent: number;           // effective FG%  (ESPN shootingEfficiency, 0–1)
  trueShootingPercent: number;  // TS%  = PPG / (2 × (AFGA + 0.44 × AFTA))
  paceApprox: number;           // estimated possessions/game
  turnoverPercent: number;      // turnovers per possession
  assistPercent: number;        // assists per field goal made
  orebPg: number;               // offensive rebounds per game
  threePointRate: number;       // 3PA / FGA  (shot-selection tendency)
  threePointPct: number;        // 3P%  (0–1)
  ftRate: number;               // FTA / FGA  (free-throw generation rate)
  ftPct: number;                // FT%  (0–1)
  // ── Defensive ───────────────────────────────────────────────────────────
  spg: number;                  // steals per game
  bpg: number;                  // blocks per game
  drebPg: number;               // defensive rebounds per game
  // ── Recent form + rest ──────────────────────────────────────────────────
  last5WinPct: number;          // win% in last 5 games  (0–1)
  last10WinPct: number;
  last5PointDiff: number;       // avg point differential, last 5 games
  last10PointDiff: number;
  restDays: number;             // days since last completed game (0–7)
}

export interface SoccerTeamStats {
  teamId: string;
  goalsPerGame: number;           // season avg goals scored
  goalsAllowedPerGame: number;    // season avg goals conceded
  goalDifferential: number;       // GPG − GAPG
  last5Form: number;              // avg form rating last 5 (W=1, D=0.4, L=0)
  last10Form: number;
  last5GoalDiff: number;          // avg goal diff last 5 matches
  restDays: number;               // days since last match (0–14)
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache stores
// ─────────────────────────────────────────────────────────────────────────────

const WNBA_TTL_MS   = 4 * 60 * 60 * 1000; // 4 h
const SOCCER_TTL_MS = 60 * 60 * 1000;     // 1 h

const wnbaCache   = new Map<string, { stats: WnbaTeamStats;   fetchedAt: number }>();
const soccerCache = new Map<string, { stats: SoccerTeamStats; fetchedAt: number }>();

let wnbaRefreshPromise: Promise<void> | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// ESPN team IDs for all 15 current WNBA teams
// ─────────────────────────────────────────────────────────────────────────────

const WNBA_TEAM_IDS = [
  "20",     // ATL Atlanta Dream
  "19",     // CHI Chicago Sky
  "18",     // CON Connecticut Sun
  "3",      // DAL Dallas Wings
  "129689", // GS  Golden State Valkyries
  "5",      // IND Indiana Fever
  "17",     // LV  Las Vegas Aces
  "6",      // LA  Los Angeles Sparks
  "8",      // MIN Minnesota Lynx
  "9",      // NY  New York Liberty
  "11",     // PHX Phoenix Mercury
  "132052", // POR Portland Fire
  "14",     // SEA Seattle Storm
  "131935", // TOR Toronto Tempo
  "16",     // WSH Washington Mystics
];

// ─────────────────────────────────────────────────────────────────────────────
// ESPN helpers
// ─────────────────────────────────────────────────────────────────────────────

interface EspnStatCat {
  name: string;
  stats?: Array<{ name: string; displayValue: string }>;
}

function findStat(cats: EspnStatCat[], catName: string, statName: string): number {
  const cat  = cats.find((c) => c.name === catName);
  const stat = cat?.stats?.find((s) => s.name === statName);
  return parseFloat(stat?.displayValue ?? "0") || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// WNBA: ESPN team stats fetch
// ─────────────────────────────────────────────────────────────────────────────

interface FormResult {
  last5WinPct: number;
  last10WinPct: number;
  last5PointDiff: number;
  last10PointDiff: number;
  restDays: number;
}

async function fetchWnbaTeamForm(teamId: string): Promise<FormResult> {
  const defaults: FormResult = {
    last5WinPct: 0.5, last10WinPct: 0.5,
    last5PointDiff: 0, last10PointDiff: 0,
    restDays: 2,
  };
  try {
    const url  = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${teamId}/schedule?season=2025`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return defaults;

    const data = await resp.json() as { events?: unknown[] };
    const events = (data.events ?? []) as Array<{
      date: string;
      competitions: Array<{
        status: { type: { completed: boolean } };
        competitors: Array<{
          team?: { id?: string };
          score?: string | { displayValue?: string };
          winner?: boolean;
        }>;
      }>;
    }>;

    const getScore = (raw: string | { displayValue?: string } | undefined): number =>
      parseInt(typeof raw === "string" ? raw : (raw?.displayValue ?? "0"), 10) || 0;

    const completed = events
      .filter((e) => e.competitions[0]?.status?.type?.completed)
      .map((e) => {
        const comp   = e.competitions[0]!;
        const myTeam = comp.competitors.find((c) => c.team?.id === teamId);
        const opp    = comp.competitors.find((c) => c.team?.id !== teamId);
        const myScore  = getScore(myTeam?.score);
        const oppScore = getScore(opp?.score);
        // Derive win from score rather than relying on `winner` field
        return {
          date:      e.date,
          myScore,
          oppScore,
          won:       myScore > oppScore,
          pointDiff: myScore - oppScore,
        };
      })
      .filter((g) => g.myScore > 0 || g.oppScore > 0); // skip un-played rows

    if (completed.length === 0) return defaults;

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    const last5  = completed.slice(-5);
    const last10 = completed.slice(-10);

    const last5WinPct    = last5.length  > 0 ? last5.filter((g)  => g.won).length  / last5.length  : 0.5;
    const last10WinPct   = last10.length > 0 ? last10.filter((g) => g.won).length  / last10.length : 0.5;
    const last5PointDiff  = avg(last5.map((g)  => g.pointDiff));
    const last10PointDiff = avg(last10.map((g) => g.pointDiff));

    const lastDate = new Date(completed[completed.length - 1]!.date);
    const today    = new Date();
    const restDays = Math.max(0, Math.min(7,
      Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)),
    ));

    return { last5WinPct, last10WinPct, last5PointDiff, last10PointDiff, restDays };
  } catch {
    return defaults;
  }
}

async function fetchWnbaTeamStatsSingle(teamId: string): Promise<WnbaTeamStats | null> {
  try {
    const url  = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${teamId}/statistics`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;

    const data = await resp.json() as { results?: { stats?: { categories?: EspnStatCat[] } } };
    const cats: EspnStatCat[] = data.results?.stats?.categories ?? [];

    // Raw ESPN values —————————————————————————————————————————————————————————
    const ppg      = findStat(cats, "offensive", "avgPoints");
    const afga     = findStat(cats, "offensive", "avgFieldGoalsAttempted");
    const afta     = findStat(cats, "offensive", "avgFreeThrowsAttempted");
    const afgm     = findStat(cats, "offensive", "avgFieldGoalsMade");
    const a3pa     = findStat(cats, "offensive", "avgThreePointFieldGoalsAttempted");
    const apg      = findStat(cats, "offensive", "avgAssists");
    const topg     = findStat(cats, "offensive", "avgTurnovers");
    const orpg     = findStat(cats, "offensive", "avgOffensiveRebounds");
    // ESPN's shootingEfficiency is already a 0–1 decimal (e.g. 0.55 = 55% eFG%)
    const efg      = findStat(cats, "offensive", "shootingEfficiency");
    // ESPN returns percentage strings for these (e.g. 82.2 not 0.822)
    const ftPct    = findStat(cats, "offensive", "freeThrowPct")    / 100;
    const threePct = findStat(cats, "offensive", "threePointPct")   / 100;
    const spg      = findStat(cats, "defensive", "avgSteals");
    const bpg      = findStat(cats, "defensive", "avgBlocks");
    const drebPg   = findStat(cats, "defensive", "avgDefensiveRebounds");

    // Derived metrics —————————————————————————————————————————————————————————
    const possEst    = Math.max(1, afga + 0.44 * afta + topg - orpg);
    const tsPct      = (afga + afta) > 0 ? ppg / (2 * (afga + 0.44 * afta)) : 0.55;
    const toPct      = topg / possEst;
    const astPct     = afgm > 0 ? apg / afgm : 0.50;
    const threeRate  = afga > 0 ? a3pa / afga : 0.35;
    const ftRate     = afga > 0 ? afta / afga : 0.30;

    const form = await fetchWnbaTeamForm(teamId);

    return {
      teamId,
      ppg,
      efgPercent:           efg,
      trueShootingPercent:  tsPct,
      paceApprox:           possEst,
      turnoverPercent:      toPct,
      assistPercent:        astPct,
      orebPg:               orpg,
      threePointRate:       threeRate,
      threePointPct:        threePct,
      ftRate,
      ftPct,
      spg,
      bpg,
      drebPg,
      ...form,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WNBA: cache management
// ─────────────────────────────────────────────────────────────────────────────

async function refreshAllWnbaStats(): Promise<void> {
  logger.info("TeamStats: refreshing all WNBA team stats");
  const now = Date.now();

  const results = await Promise.allSettled(
    WNBA_TEAM_IDS.map(async (teamId) => {
      const stats = await fetchWnbaTeamStatsSingle(teamId);
      if (stats) wnbaCache.set(teamId, { stats, fetchedAt: now });
    }),
  );

  const ok = results.filter((r) => r.status === "fulfilled").length;
  logger.info({ ok, total: WNBA_TEAM_IDS.length }, "TeamStats: WNBA refresh complete");
}

/**
 * Returns advanced stats for a WNBA team by ESPN numeric team ID.
 * Triggers a full cache refresh (all teams in parallel) on first call
 * or when the cache is expired. Returns stale data immediately if available
 * while a background refresh runs.
 */
export async function getWnbaTeamStats(teamId: string): Promise<WnbaTeamStats | undefined> {
  if (!teamId) return undefined;

  const cached = wnbaCache.get(teamId);
  const fresh  = cached && Date.now() - cached.fetchedAt < WNBA_TTL_MS;

  if (fresh) return cached.stats;

  // Cache miss or stale — start refresh if not already running
  if (!wnbaRefreshPromise) {
    wnbaRefreshPromise = refreshAllWnbaStats().finally(() => {
      wnbaRefreshPromise = null;
    });
  }

  // Return stale data immediately (background refresh will update the cache)
  if (cached) return cached.stats;

  // No data at all — must wait for the refresh
  await wnbaRefreshPromise;
  return wnbaCache.get(teamId)?.stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Soccer: computed from our own DB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns goals-based team stats and recent form for a soccer team.
 * Uses our completed games in the DB — no external API call needed.
 *
 * Automatically caches for 1 hour (refreshes as new game results land).
 */
export async function getSoccerTeamStats(teamId: string): Promise<SoccerTeamStats | undefined> {
  if (!teamId) return undefined;

  const cached = soccerCache.get(teamId);
  if (cached && Date.now() - cached.fetchedAt < SOCCER_TTL_MS) {
    return cached.stats;
  }

  try {
    const rows = await db
      .select({
        gameDate:  gamesTable.gameDate,
        homeTeamId: gamesTable.homeTeamId,
        awayTeamId: gamesTable.awayTeamId,
        homeScore: gamesTable.homeScore,
        awayScore: gamesTable.awayScore,
      })
      .from(gamesTable)
      .where(
        and(
          eq(gamesTable.sport, "Soccer"),
          eq(gamesTable.status, "final"),
          or(
            eq(gamesTable.homeTeamId, teamId),
            eq(gamesTable.awayTeamId, teamId),
          ),
        ),
      )
      .orderBy(desc(gamesTable.gameDate))
      .limit(15);

    if (rows.length === 0) return undefined;

    const games = rows.map((r) => {
      const isHome      = r.homeTeamId === teamId;
      const goalsFor    = isHome ? (r.homeScore ?? 0) : (r.awayScore ?? 0);
      const goalsAgainst = isHome ? (r.awayScore ?? 0) : (r.homeScore ?? 0);
      const diff        = goalsFor - goalsAgainst;
      // W-D-L form rating: win=1.0, draw=0.4, loss=0.0
      const form        = diff > 0 ? 1.0 : diff === 0 ? 0.4 : 0.0;
      return { goalsFor, goalsAgainst, diff, form };
    });

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    const last5  = games.slice(0, 5);
    const last10 = games.slice(0, 10);

    const goalsPerGame        = avg(games.map((g) => g.goalsFor));
    const goalsAllowedPerGame = avg(games.map((g) => g.goalsAgainst));
    const last5Form           = avg(last5.map((g)  => g.form));
    const last10Form          = avg(last10.map((g) => g.form));
    const last5GoalDiff       = avg(last5.map((g)  => g.diff));

    // Rest days based on the most recent match date
    const lastDateStr = rows[0]!.gameDate; // YYYY-MM-DD
    const lastDate    = new Date(lastDateStr + "T12:00:00Z");
    const today       = new Date();
    const restDays    = Math.max(0, Math.min(14,
      Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)),
    ));

    const stats: SoccerTeamStats = {
      teamId,
      goalsPerGame,
      goalsAllowedPerGame,
      goalDifferential:  goalsPerGame - goalsAllowedPerGame,
      last5Form,
      last10Form,
      last5GoalDiff,
      restDays,
    };

    soccerCache.set(teamId, { stats, fetchedAt: Date.now() });
    return stats;
  } catch (err) {
    logger.warn({ err, teamId }, "TeamStats: failed to compute soccer stats from DB");
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Server startup warm-up
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kick off the WNBA stats cache warm-up in the background.
 * Call once from the server's startup sequence; does not block.
 */
export function warmUpTeamStatsCache(): void {
  void refreshAllWnbaStats();
}
