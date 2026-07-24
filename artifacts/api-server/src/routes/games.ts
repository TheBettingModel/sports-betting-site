import { Router, type IRouter } from "express";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { db, gamesTable, modelWeightsTable } from "@workspace/db";
import { fetchAllSports } from "../services/espn";
import { computeProjection } from "../services/model";
import { getOddsForGame, getBestLine, displayBookName } from "../services/oddsApi";
import { getProbablePitchers, computePitcherAdvantage } from "../services/mlbPitchers";
import { getWnbaTeamStats, getSoccerTeamStats, getDbTeamStats } from "../services/teamStats";
import { runLearning } from "../services/learning";
import { processGameSnapshot } from "../services/snapshot";
import { runGrading } from "../services/grading-runner";
import { logger } from "../lib/logger";
import { resolveSubscriberStatus, rejectInvalidToken } from "../middleware/requireSubscriber";

type AnyGame = Record<string, unknown>;

/** Number of full picks shown to non-subscribers */
const FREE_PICKS = 2;

/**
 * Returns the game with premium model fields zeroed out and `isLocked: true`.
 * Fields are kept as valid numbers (not null) so clients don't crash on
 * numeric rendering — they should hide/replace locked rows using `isLocked`.
 */
function lockGame(game: AnyGame): AnyGame {
  return {
    ...game,
    // Zero out model projection fields
    homeWinPct: 50,
    confidence: "Low",
    projectedSpread: 0,
    projectedTotal: 0,
    valueRating: "Neutral",
    modelScore: 0,
    edge: 0,
    vegasSpread: 0,
    vegasTotal: 0,
    vegasHomeOdds: 0,
    vegasAwayOdds: 0,
    // Signal to the client that this game is gated
    isLocked: true,
  };
}

const router: IRouter = Router();

/** In-memory cache: when we last successfully refreshed */
let lastRefreshedAt: Date | null = null;
const STALE_MS = 60 * 60 * 1000; // 1 hour

function isStale(): boolean {
  if (!lastRefreshedAt) return true;
  return Date.now() - lastRefreshedAt.getTime() > STALE_MS;
}

/** Convert American moneyline to raw implied probability (vig-inclusive). */
function impliedProbFromOdds(american: number): number {
  return american < 0
    ? Math.abs(american) / (Math.abs(american) + 100)
    : 100 / (american + 100);
}

export async function refreshAll(): Promise<{
  gamesUpdated: number;
  sportsRefreshed: string[];
  picksGraded: number;
}> {
  // Also fetch existing game rows so we can preserve opening odds and detect line movement
  const todayDateStr = new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD

  const [fetchedGames, weights, existingRows] = await Promise.all([
    fetchAllSports(),
    db.select().from(modelWeightsTable),
    db.select({
      id: gamesTable.id,
      openingHomeOdds: gamesTable.openingHomeOdds,
      openingAwayOdds: gamesTable.openingAwayOdds,
    }).from(gamesTable).where(eq(gamesTable.gameDate, todayDateStr)),
  ]);

  const existingByGameId = new Map(existingRows.map((r) => [r.id, r]));

  const weightsBySport = Object.fromEntries(weights.map((w) => [w.sport, w]));

  let upserted = 0;
  const sports = new Set<string>();

  for (const game of fetchedGames) {
    const w = weightsBySport[game.sport] ?? null;

    const DB_SPORTS = new Set(["MLB", "NFL", "NHL", "NCAAF", "NCAAB"]);

    // Fetch advanced team analytics (all cached after first call per run).
    // WNBA/NBA: ESPN stats (4h TTL). Soccer: DB goals (1h TTL).
    // MLB/NFL/NHL/NCAAF/NCAAB: DB runs/points (1h TTL).
    const [homeTeamStats, awayTeamStats, homeSoccerStats, awaySoccerStats, homeDbStats, awayDbStats] =
      await Promise.all([
        (game.sport === "WNBA" || game.sport === "NBA")
          ? getWnbaTeamStats(game.homeTeamId ?? "")
          : Promise.resolve(undefined),
        (game.sport === "WNBA" || game.sport === "NBA")
          ? getWnbaTeamStats(game.awayTeamId ?? "")
          : Promise.resolve(undefined),
        game.sport === "Soccer"
          ? getSoccerTeamStats(game.homeTeamId ?? "")
          : Promise.resolve(undefined),
        game.sport === "Soccer"
          ? getSoccerTeamStats(game.awayTeamId ?? "")
          : Promise.resolve(undefined),
        DB_SPORTS.has(game.sport)
          ? getDbTeamStats(game.homeTeamId ?? "", game.sport)
          : Promise.resolve(undefined),
        DB_SPORTS.has(game.sport)
          ? getDbTeamStats(game.awayTeamId ?? "", game.sport)
          : Promise.resolve(undefined),
      ]);

    // ── Phase 2a: multi-book odds (30-min cache) ──────────────────────────────
    // Replaces ESPN's single-book moneyline with a consensus price and adds
    // Pinnacle's line for the sharp-money divergence signal.
    const gameOdds = await getOddsForGame(
      game.sport,
      game.league ?? null,
      game.homeTeamName,
      game.awayTeamName,
    );

    // ── Phase 2b: MLB probable starters (4-hour cache) ────────────────────────
    const starters = game.sport === "MLB"
      ? await getProbablePitchers(game.homeTeamAbbr, game.awayTeamAbbr, game.gameDate)
      : { home: null, away: null };
    const pitcherAdvantage = game.sport === "MLB"
      ? computePitcherAdvantage(starters)
      : undefined;

    // ── Phase 2c: line movement ───────────────────────────────────────────────
    const existingRow = existingByGameId.get(game.espnId);
    const currentHomeOdds = gameOdds?.consensusHomeOdds ?? game.vegasHomeOdds ?? null;
    const currentAwayOdds = gameOdds?.consensusAwayOdds ?? game.vegasAwayOdds ?? null;
    // Opening odds: preserved from first observation; falls back to current on first insert.
    const openingHomeOdds = existingRow?.openingHomeOdds ?? currentHomeOdds;
    const openingAwayOdds = existingRow?.openingAwayOdds ?? currentAwayOdds;
    // Did the home team's implied probability increase since opening?
    const lineMovedTowardHome: boolean | undefined =
      existingRow?.openingHomeOdds != null && currentHomeOdds != null
        ? impliedProbFromOdds(currentHomeOdds) > impliedProbFromOdds(existingRow.openingHomeOdds)
        : undefined;

    const proj = computeProjection(
      game.espnId,
      game.sport,
      game.homeTeamRecord,
      game.awayTeamRecord,
      w,
      {
        homeHomeRecord:    game.homeHomeRecord,
        homeRoadRecord:    game.homeRoadRecord,
        awayHomeRecord:    game.awayHomeRecord,
        awayRoadRecord:    game.awayRoadRecord,
        // Consensus odds preferred over ESPN single book
        realVegasHomeOdds: gameOdds?.consensusHomeOdds ?? game.vegasHomeOdds,
        realVegasAwayOdds: gameOdds?.consensusAwayOdds ?? game.vegasAwayOdds,
        realVegasDrawOdds: gameOdds?.consensusDrawOdds ?? game.vegasDrawOdds,
        realVegasOverUnder: gameOdds?.total ?? game.vegasOverUnder,
        // Phase 2 signals
        pinnacleHomeOdds:  gameOdds?.pinnacleHomeOdds,
        pinnacleAwayOdds:  gameOdds?.pinnacleAwayOdds,
        consensusHomeOdds: gameOdds?.consensusHomeOdds,
        consensusAwayOdds: gameOdds?.consensusAwayOdds,
        lineMovedTowardHome,
        pitcherAdvantage,
        homeTeamStats,
        awayTeamStats,
        homeSoccerStats,
        awaySoccerStats,
        homeDbStats,
        awayDbStats,
      },
    );

    // ── Phase 2d: best available line ──────────────────────────────────────────
    const pickIsHome = proj.edge >= 0;
    const bestLine = getBestLine(gameOdds ?? null, pickIsHome);

    await db
      .insert(gamesTable)
      .values({
        id: game.espnId,
        sport: game.sport,
        league: game.league ?? null,
        homeTeamId: game.homeTeamId ?? null,
        awayTeamId: game.awayTeamId ?? null,
        homeTeamLogo: game.homeTeamLogo ?? null,
        awayTeamLogo: game.awayTeamLogo ?? null,
        homeTeamAbbr: game.homeTeamAbbr,
        homeTeamName: game.homeTeamName,
        homeTeamRecord: game.homeTeamRecord,
        awayTeamAbbr: game.awayTeamAbbr,
        awayTeamName: game.awayTeamName,
        awayTeamRecord: game.awayTeamRecord,
        gameTime: game.gameTime,
        gameDate: game.gameDate,
        status: game.status,
        homeScore: game.homeScore ?? null,
        awayScore: game.awayScore ?? null,
        ...proj,
        // Phase 2: set once — opening odds preserved on conflict (not in set block)
        openingHomeOdds: openingHomeOdds ?? null,
        openingAwayOdds: openingAwayOdds ?? null,
        // Phase 2: always refreshed
        homeStarterName:     starters.home?.name ?? null,
        homeStarterEra:      starters.home?.seasonEra ?? null,
        homeStarterWhip:     starters.home?.seasonWhip ?? null,
        homeStarterRecentEra: starters.home?.recentEra ?? null,
        awayStarterName:     starters.away?.name ?? null,
        awayStarterEra:      starters.away?.seasonEra ?? null,
        awayStarterWhip:     starters.away?.seasonWhip ?? null,
        awayStarterRecentEra: starters.away?.recentEra ?? null,
        bestLineBook: bestLine ? displayBookName(bestLine.book) : null,
        bestLineOdds: bestLine?.odds ?? null,
      })
      .onConflictDoUpdate({
        target: gamesTable.id,
        set: {
          league: game.league ?? null,
          homeTeamId: game.homeTeamId ?? null,
          awayTeamId: game.awayTeamId ?? null,
          homeTeamLogo: game.homeTeamLogo ?? null,
          awayTeamLogo: game.awayTeamLogo ?? null,
          gameDate: game.gameDate,
          gameTime: game.gameTime,
          status: game.status,
          homeScore: game.homeScore ?? null,
          awayScore: game.awayScore ?? null,
          homeTeamRecord: game.homeTeamRecord,
          awayTeamRecord: game.awayTeamRecord,
          homeWinPct: proj.homeWinPct,
          confidence: proj.confidence,
          projectedSpread: proj.projectedSpread,
          projectedTotal: proj.projectedTotal,
          valueRating: proj.valueRating,
          modelScore: proj.modelScore,
          edge: proj.edge,
          vegasSpread: proj.vegasSpread,
          vegasTotal: proj.vegasTotal,
          vegasHomeOdds: proj.vegasHomeOdds,
          vegasAwayOdds: proj.vegasAwayOdds,
          vegasDrawOdds: proj.vegasDrawOdds,
          // Phase 1
          confidenceNum: proj.confidenceNum,
          units: proj.units,
          priceAdjustment: proj.priceAdjustment,
          sharpScore: proj.sharpScore,
          sharpSignal: proj.sharpSignal,
          finalModelScore: proj.finalModelScore,
          finalModelTier: proj.finalModelTier,
          finalModelStars: proj.finalModelStars,
          podScore: proj.podScore,
          // Phase 2: opening odds — use COALESCE to set once on first sighting;
          // if the row already has a non-null value, preserve it.
          openingHomeOdds: sql`COALESCE(${gamesTable.openingHomeOdds}, EXCLUDED.opening_home_odds)`,
          openingAwayOdds: sql`COALESCE(${gamesTable.openingAwayOdds}, EXCLUDED.opening_away_odds)`,
          // Phase 2: always refreshed
          homeStarterName:     starters.home?.name ?? null,
          homeStarterEra:      starters.home?.seasonEra ?? null,
          homeStarterWhip:     starters.home?.seasonWhip ?? null,
          homeStarterRecentEra: starters.home?.recentEra ?? null,
          awayStarterName:     starters.away?.name ?? null,
          awayStarterEra:      starters.away?.seasonEra ?? null,
          awayStarterWhip:     starters.away?.seasonWhip ?? null,
          awayStarterRecentEra: starters.away?.recentEra ?? null,
          bestLineBook: bestLine ? displayBookName(bestLine.book) : null,
          bestLineOdds: bestLine?.odds ?? null,
        },
      });

    // Snapshot pipeline: odds, predictions, results, closing lines
    await processGameSnapshot(game, proj);

    upserted++;
    sports.add(game.sport);
  }

  // EMA learning pass (keeps confidenceMultiplier up to date)
  await runLearning();

  // Grade any picks that now have a completed game result
  const picksGraded = await runGrading();

  lastRefreshedAt = new Date();
  logger.info(
    { upserted, sports: [...sports], picksGraded },
    "Games refresh complete",
  );
  return { gamesUpdated: upserted, sportsRefreshed: [...sports], picksGraded };
}

/**
 * GET /api/games/today
 * Auto-refreshes from ESPN when data is stale (>1 hr old).
 * Optional ?sport=NFL query param for server-side filtering.
 *
 * Subscriber gating:
 *   - Pro subscribers receive full model projections for all games.
 *   - Non-subscribers receive full data for only the top FREE_PICKS games
 *     across today's ENTIRE slate (sorted by modelScore descending).
 *     The free quota is global — not per-sport — so repeatedly querying
 *     with ?sport= cannot be used to extract additional premium picks.
 */
router.get("/games/today", resolveSubscriberStatus, rejectInvalidToken, async (req, res): Promise<void> => {
  if (isStale()) {
    try {
      await refreshAll();
    } catch (err) {
      req.log.warn({ err }, "Auto-refresh failed; serving cached data");
    }
  }

  // Use US Eastern time for the "sports day" — games at 8 PM ET fall on the
  // same calendar day as the afternoon slate, even though they're UTC+1 day.
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2");
  const { sport } = req.query;
  const isSubscribed = req.subscriberStatus?.isSubscribed === true;

  if (isSubscribed) {
    // Subscribers: apply sport filter directly — no locking needed
    const where =
      typeof sport === "string" && sport !== "All"
        ? and(eq(gamesTable.gameDate, today), eq(gamesTable.sport, sport), inArray(gamesTable.status, ["upcoming", "live", "final"]))
        : and(eq(gamesTable.gameDate, today), inArray(gamesTable.status, ["upcoming", "live", "final"]));

    const games = await db
      .select()
      .from(gamesTable)
      .where(where)
      .orderBy(desc(gamesTable.modelScore));

    res.json({
      games,
      lastUpdated: (lastRefreshedAt ?? new Date()).toISOString(),
      totalGames: games.length,
      isSubscribed: true,
    });
    return;
  }

  // Non-subscribers: always fetch the FULL day's slate first to establish
  // global lock positions, then filter by sport for the final response.
  // This prevents the ?sport= bypass: the free quota is consumed from the
  // global ranked list regardless of the sport filter in the request.
  const allTodayGames = await db
    .select()
    .from(gamesTable)
    .where(and(eq(gamesTable.gameDate, today), inArray(gamesTable.status, ["upcoming", "live", "final"])))
    .orderBy(desc(gamesTable.modelScore));

  // Build a set of game IDs that are free (top FREE_PICKS by modelScore)
  const freeGameIds = new Set(
    allTodayGames.slice(0, FREE_PICKS).map((g) => g.id),
  );

  // Apply lock state across the full slate, then sport-filter for the response
  const gatedAll = (allTodayGames as AnyGame[]).map((game) => {
    const isFree = freeGameIds.has(game["id"] as string);
    return isFree ? { ...game, isLocked: false } : lockGame(game);
  });

  const filtered =
    typeof sport === "string" && sport !== "All"
      ? gatedAll.filter((g) => g["sport"] === sport)
      : gatedAll;

  res.json({
    games: filtered,
    lastUpdated: (lastRefreshedAt ?? new Date()).toISOString(),
    totalGames: filtered.length,
    isSubscribed: false,
  });
});

/**
 * POST /api/games/refresh
 * Manually trigger an ESPN pull + model update + grading pass.
 */
router.post("/games/refresh", async (req, res): Promise<void> => {
  const result = await refreshAll();
  res.json({ message: "Refresh complete", ...result });
});

export default router;
