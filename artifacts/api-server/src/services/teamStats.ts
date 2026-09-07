/**
 * Team Statistics Service
 *
 * Fetches and caches rich team analytics used by the projection model.
 *
 * ── WNBA / NBA ────────────────────────────────────────────────────────────────
 *   Source:  ESPN team stats API  +  ESPN team schedule API
 *   Metrics: eFG%, TS%, pace, turnover%, assist%, OREB, 3P rate,
 *            steals/blocks, last-5/10 win%, point differential, rest days.
 *   Cache:   In-memory, 4-hour TTL.  A single concurrent refresh promise
 *            ensures we only fire one batch of ESPN calls at a time.
 *
 * ── Soccer ────────────────────────────────────────────────────────────────────
 *   Source:  Our own games DB (completed matches we've already stored).
 *   Metrics: Goals per game, goals allowed per game, goal differential,
 *            last-5/10 form rating (W=1, D=0.4, L=0), last-5 goal diff,
 *            rest days since last match.
 *   Cache:   In-memory, 1-hour TTL (DB data changes every 15 min).
 *
 * ── MLB / NFL / NHL / NCAAF / NCAAB ─────────────────────────────────────────
 *   Source:  Our own games DB — runs/points/goals scored & allowed per game,
 *            Pythagorean win%, last-5/10 form, score differential, rest days.
 *   Cache:   In-memory, 1-hour TTL per sport.
 *
 * All caches return stale data immediately while a background refresh runs,
 * so the model always has something to work with.
 */

import { db, gamesTable } from "@workspace/db";
import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getSeasonContext } from "./season";

// ─────────────────────────────────────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface WnbaTeamStats {
  teamId: string;
  /** Provenance is optional only so the legacy NBA caller can retain this shared shape. */
  evidence?: {
    source: "espn";
    sourceSeason: number;
    capturedAt: string;
    stale: boolean;
    missing: string[];
  };
  // ── Offensive efficiency ─────────────────────────────────────────────────
  ppg: number;                  // points per game
  efgPercent: number;           // effective FG%  (ESPN shootingEfficiency, 0–1)
  trueShootingPercent: number;  // TS%  = PPG / (2 × (AFGA + 0.44 × AFTA))
  paceApprox: number;           // estimated possessions/game
  /** Per-100-possession ratings. Undefined means ESPN did not provide the inputs. */
  offensiveRating?: number;
  defensiveRating?: number;
  netRating?: number;
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

/**
 * Generic DB-sourced team stats for MLB, NFL, NHL, NCAAF, NCAAB.
 * Computed from completed game scores already stored in our games table.
 */
export interface DbTeamStats {
  teamId: string;
  sport: string;
  scoredPerGame: number;       // avg runs/points/goals scored
  allowedPerGame: number;      // avg runs/points/goals allowed
  scoreDifferential: number;   // scoredPerGame − allowedPerGame
  pythagoreanWinPct: number;   // RS^exp / (RS^exp + RA^exp) — better than W/L record
  last5WinPct: number;         // win% in last 5 games
  last10WinPct: number;
  last5ScoreDiff: number;      // avg score differential, last 5 games
  last10ScoreDiff: number;
  restDays: number;            // days since last completed game (capped at 14)
  sampleSize: number;          // number of completed games used
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache stores
// ─────────────────────────────────────────────────────────────────────────────

const WNBA_TTL_MS   = 4 * 60 * 60 * 1000; // 4 h — ESPN batch refresh
const SOCCER_TTL_MS = 60 * 60 * 1000;     // 1 h — DB data refreshes every 15 min
const DB_STATS_TTL_MS = 60 * 60 * 1000;   // 1 h — same as soccer

const wnbaCache   = new Map<string, { stats: WnbaTeamStats;   fetchedAt: number }>();
const soccerCache = new Map<string, { stats: SoccerTeamStats; fetchedAt: number }>();
// Key: `${sport}:${teamId}`
const dbStatsCache = new Map<string, { stats: DbTeamStats;    fetchedAt: number }>();

const wnbaRefreshPromises = new Map<string, Promise<void>>();

// ─────────────────────────────────────────────────────────────────────────────
// Pythagorean exponents per sport (empirically derived)
// ─────────────────────────────────────────────────────────────────────────────

const PYTHAG_EXP: Record<string, number> = {
  MLB:   1.83, // Bill James original; best fit for 9-inning runs
  NFL:   2.37, // Daryl Morey / pro football reference
  NHL:   2.00, // goal-based; standard
  NCAAF: 2.37, // similar to NFL
  NCAAB: 10.25, // high-scoring environment; Pomeroy exponent
  UFC:   2.00, // fallback — rarely used (no team scores)
};

// ─────────────────────────────────────────────────────────────────────────────
// Minimum completed-game sample required before DB stats are trusted.
// Below this threshold getDbTeamStats() returns undefined and the model
// falls back to season W/L records — preventing single-game outliers
// (e.g. a 0-run game) from pushing Pythagorean to 0% or 100%.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_SAMPLE_SIZES: Record<string, number> = {
  MLB:   8,  // 162-game season — need ~5% of season for stable run averages
  NFL:   3,  // 17-game season  — any 3 games = meaningful data
  NHL:   8,  // 82-game season
  NCAAF: 4,  // ~12-game season — need quarter of season
  NCAAB: 6,  // 30-game season
  UFC:   5,  // fight-level — accumulate at least 5 bouts
};

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
  stats?: Array<{ name: string; displayValue?: string; value?: number; perGameValue?: number }>;
}

function findStat(cats: EspnStatCat[], catName: string, statName: string): number {
  const cat  = cats.find((c) => c.name === catName);
  const stat = cat?.stats?.find((s) => s.name === statName);
  const value = stat?.perGameValue ?? stat?.value ?? Number(stat?.displayValue);
  return Number.isFinite(value) ? value : 0;
}

function findFirstStat(cats: EspnStatCat[], candidates: Array<[string, string]>): number | undefined {
  for (const [category, stat] of candidates) {
    const cat = cats.find((item) => item.name === category);
    const value = cat?.stats?.find((item) => item.name === stat);
    if (value) {
      const parsed = value.perGameValue ?? value.value ?? Number(value.displayValue);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

/** WNBA regular seasons span summer. In Jan–Mar, the most recently completed season is active. */
export function getActiveWnbaSeason(now = new Date()): number {
  return getSeasonContext("WNBA", now).startYear;
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
  missing?: string[];
}

async function fetchWnbaTeamForm(teamId: string, season: number, targetDate: string): Promise<FormResult> {
  const defaults: FormResult = {
    last5WinPct: 0.5, last10WinPct: 0.5,
    last5PointDiff: 0, last10PointDiff: 0,
    restDays: 2,
    missing: ["schedule"],
  };
  try {
    const url  = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${teamId}/schedule?season=${season}`;
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
      .filter((e) => e.competitions[0]?.status?.type?.completed && e.date.slice(0, 10) <= targetDate)
      .map((e) => {
        const comp   = e.competitions[0]!;
        const myTeam = comp.competitors.find((c) => c.team?.id === teamId);
        const opp    = comp.competitors.find((c) => c.team?.id !== teamId);
        const myScore  = getScore(myTeam?.score);
        const oppScore = getScore(opp?.score);
        return {
          date:      e.date,
          myScore,
          oppScore,
          won:       myScore > oppScore,
          pointDiff: myScore - oppScore,
        };
      })
      .filter((g) => g.myScore > 0 || g.oppScore > 0);

    if (completed.length === 0) return { ...defaults, missing: ["completedGames"] };

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    const last5  = completed.slice(-5);
    const last10 = completed.slice(-10);

    const last5WinPct    = last5.length  > 0 ? last5.filter((g)  => g.won).length  / last5.length  : 0.5;
    const last10WinPct   = last10.length > 0 ? last10.filter((g) => g.won).length  / last10.length : 0.5;
    const last5PointDiff  = avg(last5.map((g)  => g.pointDiff));
    const last10PointDiff = avg(last10.map((g) => g.pointDiff));

    const lastDate = new Date(completed[completed.length - 1]!.date);
    const today    = new Date(`${targetDate}T12:00:00Z`);
    const restDays = Math.max(0, Math.min(7,
      Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)),
    ));

    return { last5WinPct, last10WinPct, last5PointDiff, last10PointDiff, restDays, missing: [] };
  } catch {
    return defaults;
  }
}

async function fetchWnbaTeamStatsSingle(
  teamId: string,
  sourceSeason: number,
  targetDate: string,
): Promise<WnbaTeamStats | null> {
  try {
    const capturedAt = new Date().toISOString();
    const url  = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${teamId}/statistics?season=${sourceSeason}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;

    const data = await resp.json() as { results?: { stats?: { categories?: EspnStatCat[] } } };
    const cats: EspnStatCat[] = data.results?.stats?.categories ?? [];

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
    // ESPN returns percentage strings for these (e.g. 82.2, not 0.822)
    const ftPct    = findStat(cats, "offensive", "freeThrowPct")    / 100;
    const threePct = findStat(cats, "offensive", "threePointPct")   / 100;
    const spg      = findStat(cats, "defensive", "avgSteals");
    const bpg      = findStat(cats, "defensive", "avgBlocks");
    const drebPg   = findStat(cats, "defensive", "avgDefensiveRebounds");
    // ESPN does not guarantee these names. Never substitute an invented defensive rating.
    const opponentPpg = findFirstStat(cats, [
      ["defensive", "avgPointsAllowed"],
      ["defensive", "avgOpponentPoints"],
      ["defensive", "opponentPointsPerGame"],
    ]);

    const possEst    = Math.max(1, afga + 0.44 * afta + topg - orpg);
    const tsPct      = (afga + afta) > 0 ? ppg / (2 * (afga + 0.44 * afta)) : 0.55;
    const toPct      = topg / possEst;
    const astPct     = afgm > 0 ? apg / afgm : 0.50;
    const threeRate  = afga > 0 ? a3pa / afga : 0.35;
    const ftRate     = afga > 0 ? afta / afga : 0.30;

    const form = await fetchWnbaTeamForm(teamId, sourceSeason, targetDate);
    const missing: string[] = [...(form.missing ?? [])];
    if (ppg <= 0) missing.push("avgPoints");
    if (efg <= 0) missing.push("shootingEfficiency");
    if (topg <= 0) missing.push("avgTurnovers");
    if (orpg <= 0) missing.push("avgOffensiveRebounds");
    if (spg <= 0) missing.push("avgSteals");
    if (bpg <= 0) missing.push("avgBlocks");
    if (drebPg <= 0) missing.push("avgDefensiveRebounds");
    if (a3pa <= 0) missing.push("avgThreePointFieldGoalsAttempted");
    if (threePct <= 0) missing.push("threePointPct");
    if (afta <= 0) missing.push("avgFreeThrowsAttempted");
    if (opponentPpg === undefined) missing.push("opponentPointsPerGame");
    if (afga <= 0) missing.push("fieldGoalAttempts");
    const offensiveRating = possEst > 0 && ppg > 0 ? (ppg / possEst) * 100 : undefined;
    const defensiveRating = opponentPpg !== undefined && possEst > 0
      ? (opponentPpg / possEst) * 100
      : undefined;

    return {
      teamId,
      evidence: { source: "espn", sourceSeason, capturedAt, stale: false, missing },
      ppg,
      efgPercent:           efg,
      trueShootingPercent:  tsPct,
      paceApprox:           possEst,
      offensiveRating,
      defensiveRating,
      netRating: offensiveRating !== undefined && defensiveRating !== undefined
        ? offensiveRating - defensiveRating
        : undefined,
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
      last5WinPct: form.last5WinPct,
      last10WinPct: form.last10WinPct,
      last5PointDiff: form.last5PointDiff,
      last10PointDiff: form.last10PointDiff,
      restDays: form.restDays,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WNBA: cache management
// ─────────────────────────────────────────────────────────────────────────────

async function refreshAllWnbaStats(sourceSeason: number, targetDate: string): Promise<void> {
  logger.info({ sourceSeason, targetDate }, "TeamStats: refreshing all WNBA team stats");
  const now = Date.now();

  const results = await Promise.allSettled(
    WNBA_TEAM_IDS.map(async (teamId) => {
      const stats = await fetchWnbaTeamStatsSingle(teamId, sourceSeason, targetDate);
      if (stats) wnbaCache.set(`${sourceSeason}:${targetDate}:${teamId}`, { stats, fetchedAt: now });
    }),
  );

  const ok = results.filter((r) => r.status === "fulfilled").length;
  logger.info({ ok, total: WNBA_TEAM_IDS.length }, "TeamStats: WNBA refresh complete");
}

/**
 * Returns advanced stats for a WNBA/NBA team by ESPN numeric team ID.
 * Triggers a full cache refresh on first call or when the cache is expired.
 * Returns stale data immediately if available while a background refresh runs.
 */
export async function getWnbaTeamStats(
  teamId: string,
  modeledGameDate: string | Date = new Date(),
): Promise<WnbaTeamStats | undefined> {
  if (!teamId) return undefined;

  const season = getSeasonContext("WNBA", modeledGameDate);
  const cacheKey = `${season.startYear}:${season.targetDate}:${teamId}`;
  const cached = wnbaCache.get(cacheKey);
  const fresh  = cached && Date.now() - cached.fetchedAt < WNBA_TTL_MS;

  if (fresh) return cached.stats;

  if (!wnbaRefreshPromises.has(cacheKey)) {
    const refresh = refreshAllWnbaStats(season.startYear, season.targetDate).finally(() => {
      wnbaRefreshPromises.delete(cacheKey);
    });
    wnbaRefreshPromises.set(cacheKey, refresh);
  }

  // Do not mutate the cached snapshot: callers may retain it as evidence.
  if (cached) {
    return cached.stats.evidence
      ? { ...cached.stats, evidence: { ...cached.stats.evidence, stale: true } }
      : cached.stats;
  }

  await wnbaRefreshPromises.get(cacheKey);
  return wnbaCache.get(cacheKey)?.stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Soccer: computed from our own DB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns goals-based team stats and recent form for a soccer team.
 * Uses completed games in our DB — no external API needed.
 * Cached for 1 hour.
 */
export async function getSoccerTeamStats(
  teamId: string,
  modeledGameDate: string | Date = new Date(),
  league?: string | null,
): Promise<SoccerTeamStats | undefined> {
  if (!teamId) return undefined;

  const season = getSeasonContext("Soccer", modeledGameDate, league);
  const cacheKey = `${league ?? "unknown"}:${season.startYear}:${season.targetDate}:${teamId}`;
  const cached = soccerCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < SOCCER_TTL_MS) {
    return cached.stats;
  }

  try {
    const rows = await db
      .select({
        gameDate:   gamesTable.gameDate,
        homeTeamId: gamesTable.homeTeamId,
        awayTeamId: gamesTable.awayTeamId,
        homeScore:  gamesTable.homeScore,
        awayScore:  gamesTable.awayScore,
      })
      .from(gamesTable)
      .where(
        and(
          eq(gamesTable.sport, "Soccer"),
          ...(league ? [eq(gamesTable.league, league)] : []),
          eq(gamesTable.status, "final"),
          gte(gamesTable.gameDate, season.startDate),
          lte(gamesTable.gameDate, season.targetDate),
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
      const isHome       = r.homeTeamId === teamId;
      const goalsFor     = isHome ? (r.homeScore ?? 0) : (r.awayScore ?? 0);
      const goalsAgainst = isHome ? (r.awayScore ?? 0) : (r.homeScore ?? 0);
      const diff         = goalsFor - goalsAgainst;
      const form         = diff > 0 ? 1.0 : diff === 0 ? 0.4 : 0.0;
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

    const lastDateStr = rows[0]!.gameDate;
    const lastDate    = new Date(lastDateStr + "T12:00:00Z");
    const today       = new Date(`${season.targetDate}T12:00:00Z`);
    const restDays    = Math.max(0, Math.min(14,
      Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)),
    ));

    const stats: SoccerTeamStats = {
      teamId,
      goalsPerGame,
      goalsAllowedPerGame,
      goalDifferential: goalsPerGame - goalsAllowedPerGame,
      last5Form,
      last10Form,
      last5GoalDiff,
      restDays,
    };

    soccerCache.set(cacheKey, { stats, fetchedAt: Date.now() });
    return stats;
  } catch (err) {
    logger.warn({ err, teamId }, "TeamStats: failed to compute soccer stats from DB");
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic DB stats: MLB / NFL / NHL / NCAAF / NCAAB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns runs/points/goals-based team stats for any sport that stores
 * completed game scores in our games table (MLB, NFL, NHL, NCAAF, NCAAB).
 *
 * Metrics computed:
 *  - Pythagorean win% — much more predictive than raw W/L record
 *  - Last-5/10 form, score differential
 *  - Rest days since last game
 *
 * Cached per (sport, teamId) for 1 hour.
 */
export async function getDbTeamStats(
  teamId: string,
  sport: string,
  modeledGameDate: string | Date = new Date(),
  league?: string | null,
): Promise<DbTeamStats | undefined> {
  if (!teamId || !sport) return undefined;

  const season = getSeasonContext(sport, modeledGameDate, league);
  const cacheKey = `${sport}:${league ?? ""}:${season.startYear}:${season.targetDate}:${teamId}`;
  const cached = dbStatsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < DB_STATS_TTL_MS) {
    return cached.stats;
  }

  try {
    const rows = await db
      .select({
        gameDate:   gamesTable.gameDate,
        homeTeamId: gamesTable.homeTeamId,
        awayTeamId: gamesTable.awayTeamId,
        homeScore:  gamesTable.homeScore,
        awayScore:  gamesTable.awayScore,
      })
      .from(gamesTable)
      .where(
        and(
          eq(gamesTable.sport, sport),
          ...(league ? [eq(gamesTable.league, league)] : []),
          eq(gamesTable.status, "final"),
          gte(gamesTable.gameDate, season.startDate),
          lte(gamesTable.gameDate, season.targetDate),
          or(
            eq(gamesTable.homeTeamId, teamId),
            eq(gamesTable.awayTeamId, teamId),
          ),
        ),
      )
      .orderBy(desc(gamesTable.gameDate))
      .limit(20);

    if (rows.length === 0) return undefined;

    const games = rows
      .filter((r) => r.homeScore != null && r.awayScore != null)
      .map((r) => {
        const isHome      = r.homeTeamId === teamId;
        const scored      = isHome ? (r.homeScore ?? 0) : (r.awayScore ?? 0);
        const allowed     = isHome ? (r.awayScore ?? 0) : (r.homeScore ?? 0);
        const diff        = scored - allowed;
        const won         = diff > 0;
        return { scored, allowed, diff, won, gameDate: r.gameDate };
      });

    if (games.length === 0) return undefined;

    // Require a minimum sample before trusting DB-derived stats.
    // A single outlier game (e.g. a 0-run shutout) can send Pythagorean
    // to 0% and wipe out meaningful win-rate signal. Return undefined so
    // the model falls back to the season W/L record instead.
    const minSample = MIN_SAMPLE_SIZES[sport] ?? 5;
    if (games.length < minSample) {
      logger.debug(
        { teamId, sport, have: games.length, need: minSample },
        "TeamStats: insufficient sample for DB stats, skipping",
      );
      return undefined;
    }

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    const last5  = games.slice(0, 5);
    const last10 = games.slice(0, 10);

    const scoredPerGame  = avg(games.map((g) => g.scored));
    const allowedPerGame = avg(games.map((g) => g.allowed));

    // Pythagorean win percentage — RS^exp / (RS^exp + RA^exp)
    const exp = PYTHAG_EXP[sport] ?? 2.0;
    const rse = Math.pow(Math.max(scoredPerGame, 0.01), exp);
    const rae = Math.pow(Math.max(allowedPerGame, 0.01), exp);
    const pythagoreanWinPct = rse / (rse + rae);

    const last5WinPct    = last5.length  > 0 ? last5.filter((g)  => g.won).length  / last5.length  : 0.5;
    const last10WinPct   = last10.length > 0 ? last10.filter((g) => g.won).length  / last10.length : 0.5;
    const last5ScoreDiff  = avg(last5.map((g)  => g.diff));
    const last10ScoreDiff = avg(last10.map((g) => g.diff));

    // Rest days — use most recent game's date (rows sorted desc)
    const lastDateStr = games[0]!.gameDate;
    const lastDate    = new Date((lastDateStr ?? "") + "T12:00:00Z");
    const today       = new Date(`${season.targetDate}T12:00:00Z`);
    const restDays    = Math.max(0, Math.min(14,
      Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)),
    ));

    const stats: DbTeamStats = {
      teamId,
      sport,
      scoredPerGame,
      allowedPerGame,
      scoreDifferential: scoredPerGame - allowedPerGame,
      pythagoreanWinPct,
      last5WinPct,
      last10WinPct,
      last5ScoreDiff,
      last10ScoreDiff,
      restDays,
      sampleSize: games.length,
    };

    dbStatsCache.set(cacheKey, { stats, fetchedAt: Date.now() });
    return stats;
  } catch (err) {
    logger.warn({ err, teamId, sport }, "TeamStats: failed to compute DB team stats");
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NBA: ESPN team stats (same WnbaTeamStats shape, different endpoint)
// ─────────────────────────────────────────────────────────────────────────────

const NBA_TTL_MS = 4 * 60 * 60 * 1000; // 4 h — same cadence as WNBA
const nbaCache = new Map<string, { stats: WnbaTeamStats; fetchedAt: number }>();
const nbaRefreshPromises = new Map<string, Promise<void>>();

async function fetchNbaTeamForm(teamId: string, season: number, targetDate: string): Promise<FormResult> {
  const defaults: FormResult = {
    last5WinPct: 0.5, last10WinPct: 0.5,
    last5PointDiff: 0, last10PointDiff: 0,
    restDays: 2,
  };
  try {
    const url  = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule?season=${season}`;
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
      .filter((e) => e.competitions[0]?.status?.type?.completed && e.date.slice(0, 10) <= targetDate)
      .map((e) => {
        const comp   = e.competitions[0]!;
        const myTeam = comp.competitors.find((c) => c.team?.id === teamId);
        const opp    = comp.competitors.find((c) => c.team?.id !== teamId);
        const myScore  = getScore(myTeam?.score);
        const oppScore = getScore(opp?.score);
        return {
          date: e.date,
          myScore,
          oppScore,
          won: myScore > oppScore,
          pointDiff: myScore - oppScore,
        };
      })
      .filter((g) => g.myScore > 0 || g.oppScore > 0);

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
    const today    = new Date(`${targetDate}T12:00:00Z`);
    const restDays = Math.max(0, Math.min(7,
      Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)),
    ));

    return { last5WinPct, last10WinPct, last5PointDiff, last10PointDiff, restDays };
  } catch {
    return defaults;
  }
}

async function fetchNbaTeamStatsSingle(teamId: string, season: number, targetDate: string): Promise<WnbaTeamStats | null> {
  try {
    const url  = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/statistics?season=${season}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;

    const data = await resp.json() as { results?: { stats?: { categories?: EspnStatCat[] } } };
    const cats: EspnStatCat[] = data.results?.stats?.categories ?? [];

    const ppg      = findStat(cats, "offensive", "avgPoints");
    const afga     = findStat(cats, "offensive", "avgFieldGoalsAttempted");
    const afta     = findStat(cats, "offensive", "avgFreeThrowsAttempted");
    const afgm     = findStat(cats, "offensive", "avgFieldGoalsMade");
    const a3pa     = findStat(cats, "offensive", "avgThreePointFieldGoalsAttempted");
    const apg      = findStat(cats, "offensive", "avgAssists");
    const topg     = findStat(cats, "offensive", "avgTurnovers");
    const orpg     = findStat(cats, "offensive", "avgOffensiveRebounds");
    const efg      = findStat(cats, "offensive", "shootingEfficiency");
    const ftPct    = findStat(cats, "offensive", "freeThrowPct")    / 100;
    const threePct = findStat(cats, "offensive", "threePointPct")   / 100;
    const spg      = findStat(cats, "defensive", "avgSteals");
    const bpg      = findStat(cats, "defensive", "avgBlocks");
    const drebPg   = findStat(cats, "defensive", "avgDefensiveRebounds");

    const possEst   = Math.max(1, afga + 0.44 * afta + topg - orpg);
    const tsPct     = (afga + afta) > 0 ? ppg / (2 * (afga + 0.44 * afta)) : 0.55;
    const toPct     = topg / possEst;
    const astPct    = afgm > 0 ? apg / afgm : 0.50;
    const threeRate = afga > 0 ? a3pa / afga : 0.35;
    const ftRate    = afga > 0 ? afta / afga : 0.30;

    const form = await fetchNbaTeamForm(teamId, season, targetDate);

    return {
      teamId,
      evidence: { source: "espn", sourceSeason: season, capturedAt: new Date().toISOString(), stale: false, missing: [] },
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

async function refreshAllNbaStats(teamIds: string[], season: number, targetDate: string): Promise<void> {
  if (teamIds.length === 0) return;
  logger.info({ count: teamIds.length }, "TeamStats: refreshing NBA team stats");
  const now = Date.now();

  await Promise.allSettled(
    teamIds.map(async (teamId) => {
      const stats = await fetchNbaTeamStatsSingle(teamId, season, targetDate);
      if (stats) nbaCache.set(`${season}:${targetDate}:${teamId}`, { stats, fetchedAt: now });
    }),
  );
}

/**
 * Returns advanced stats for an NBA team by ESPN numeric team ID.
 * Uses the same WnbaTeamStats shape so the basketball model works for both leagues.
 * Results are cached for 4 hours; a background refresh fires when the cache expires.
 */
export async function getNbaTeamStats(
  teamId: string,
  modeledGameDate: string | Date = new Date(),
): Promise<WnbaTeamStats | undefined> {
  if (!teamId) return undefined;

  const season = getSeasonContext("NBA", modeledGameDate);
  const cacheKey = `${season.startYear}:${season.targetDate}:${teamId}`;
  const cached = nbaCache.get(cacheKey);
  const fresh  = cached && Date.now() - cached.fetchedAt < NBA_TTL_MS;

  if (fresh) return cached.stats;

  // Background refresh: collect all currently-tracked NBA team IDs
  if (!nbaRefreshPromises.has(cacheKey)) {
    const allIds = [teamId];
    const refresh = refreshAllNbaStats(allIds, season.startYear, season.targetDate).finally(() => {
      nbaRefreshPromises.delete(cacheKey);
    });
    nbaRefreshPromises.set(cacheKey, refresh);
  }

  if (cached) return cached.stats; // return stale while refreshing

  await nbaRefreshPromises.get(cacheKey);
  return nbaCache.get(cacheKey)?.stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Server startup warm-up
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kick off the WNBA stats cache warm-up in the background.
 * Call once from the server's startup sequence; does not block.
 */
export function warmUpTeamStatsCache(): void {
  const season = getSeasonContext("WNBA", new Date());
  void refreshAllWnbaStats(season.startYear, season.targetDate);
}
