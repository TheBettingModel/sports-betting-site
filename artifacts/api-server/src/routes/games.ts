import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, gamesTable, modelWeightsTable } from "@workspace/db";
import { fetchAllSports } from "../services/espn";
import { computeProjection } from "../services/model";
import { runLearning } from "../services/learning";
import { processGameSnapshot } from "../services/snapshot";
import { runGrading } from "../services/grading-runner";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** In-memory cache: when we last successfully refreshed */
let lastRefreshedAt: Date | null = null;
const STALE_MS = 60 * 60 * 1000; // 1 hour

function isStale(): boolean {
  if (!lastRefreshedAt) return true;
  return Date.now() - lastRefreshedAt.getTime() > STALE_MS;
}

export async function refreshAll(): Promise<{
  gamesUpdated: number;
  sportsRefreshed: string[];
  picksGraded: number;
}> {
  const [fetchedGames, weights] = await Promise.all([
    fetchAllSports(),
    db.select().from(modelWeightsTable),
  ]);

  const weightsBySport = Object.fromEntries(weights.map((w) => [w.sport, w]));

  let upserted = 0;
  const sports = new Set<string>();

  for (const game of fetchedGames) {
    const w = weightsBySport[game.sport] ?? null;
    const proj = computeProjection(
      game.espnId,
      game.sport,
      game.homeTeamRecord,
      game.awayTeamRecord,
      w,
    );

    // Upsert the games table (existing behaviour — unchanged)
    await db
      .insert(gamesTable)
      .values({
        id: game.espnId,
        sport: game.sport,
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
      })
      .onConflictDoUpdate({
        target: gamesTable.id,
        set: {
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
 */
router.get("/games/today", async (req, res): Promise<void> => {
  if (isStale()) {
    try {
      await refreshAll();
    } catch (err) {
      req.log.warn({ err }, "Auto-refresh failed; serving cached data");
    }
  }

  const today = new Date().toISOString().split("T")[0]!;
  const { sport } = req.query;

  const where =
    typeof sport === "string" && sport !== "All"
      ? and(eq(gamesTable.gameDate, today), eq(gamesTable.sport, sport))
      : eq(gamesTable.gameDate, today);

  const games = await db
    .select()
    .from(gamesTable)
    .where(where)
    .orderBy(desc(gamesTable.modelScore));

  res.json({
    games,
    lastUpdated: (lastRefreshedAt ?? new Date()).toISOString(),
    totalGames: games.length,
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
