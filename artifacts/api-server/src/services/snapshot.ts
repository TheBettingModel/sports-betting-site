import { and, eq } from "drizzle-orm";
import {
  db,
  closingLinesTable,
  gameResultsTable,
  gamesTable,
  modelPredictionsTable,
  oddsSnapshotsTable,
  publishedPicksTable,
  pickResultsTable,
} from "@workspace/db";
import type { ProjectionResult } from "./model";
import type { FetchedGame } from "./espn";
import { getBootstrapIds } from "./bootstrap";
import { logger } from "../lib/logger";

// ── Odds snapshot ─────────────────────────────────────────────────────────────

/**
 * Persist Vegas odds from the ESPN feed into odds_snapshots.
 * Writes six rows per game: home/away moneyline, home/away spread, over/under.
 */
async function writeOddsSnapshot(
  game: FetchedGame,
  proj: ProjectionResult,
  capturedAt: Date,
  espnSportsbookId: number,
  marketIds: Record<string, number>,
): Promise<void> {
  const mlId = marketIds["moneyline"];
  const spId = marketIds["spread"];
  const totId = marketIds["total"];
  if (!mlId || !spId || !totId) return;

  const rows = [
    { marketId: mlId, selection: "home", price: proj.vegasHomeOdds, line: null as number | null },
    { marketId: mlId, selection: "away", price: proj.vegasAwayOdds, line: null as number | null },
    { marketId: spId, selection: "home", price: -110, line: proj.vegasSpread },
    { marketId: spId, selection: "away", price: -110, line: -proj.vegasSpread },
    { marketId: totId, selection: "over", price: -110, line: proj.vegasTotal },
    { marketId: totId, selection: "under", price: -110, line: proj.vegasTotal },
  ];

  for (const r of rows) {
    await db.insert(oddsSnapshotsTable).values({
      gameId: game.espnId,
      sportsbookId: espnSportsbookId,
      marketId: r.marketId,
      selection: r.selection,
      price: r.price,
      line: r.line,
      capturedAt,
      source: "espn",
      marketStatus: game.status === "final" ? "closed" : "open",
      isAvailable: true,
      isStale: false,
      isBestAvailable: true, // ESPN is currently the only source
    });
  }
}

// ── Immutable prediction snapshot ─────────────────────────────────────────────

/**
 * Write one immutable prediction row per game + model version + market.
 * Returns the new prediction ID, or null if one already exists (idempotent).
 *
 * IMPORTANT: never call this after a game becomes final — snapshots must
 * capture pre-game information only.
 */
async function writePredictionSnapshot(
  game: FetchedGame,
  proj: ProjectionResult,
  modelVersionId: number,
  capturedAt: Date,
): Promise<number | null> {
  // Guard: one prediction per game + model version + market
  const [existing] = await db
    .select({ id: modelPredictionsTable.id })
    .from(modelPredictionsTable)
    .where(
      and(
        eq(modelPredictionsTable.gameId, game.espnId),
        eq(modelPredictionsTable.modelVersionId, modelVersionId),
        eq(modelPredictionsTable.market, "moneyline"),
      ),
    )
    .limit(1);

  if (existing) return null; // Already exists — do not overwrite

  // Build the feature snapshot: exact inputs used by computeProjection
  const featureSnapshot = {
    homeRecord: game.homeTeamRecord,
    awayRecord: game.awayTeamRecord,
    homeTeamAbbr: game.homeTeamAbbr,
    awayTeamAbbr: game.awayTeamAbbr,
    sport: game.sport,
    gameDate: game.gameDate,
    gameId: game.espnId,
    vegasHomeOdds: proj.vegasHomeOdds,
    vegasAwayOdds: proj.vegasAwayOdds,
    vegasSpread: proj.vegasSpread,
    vegasTotal: proj.vegasTotal,
  };

  const pickIsHome = proj.edge >= 0;
  const pickOdds   = pickIsHome ? proj.vegasHomeOdds : proj.vegasAwayOdds;
  const pickProb   = pickIsHome ? proj.homeWinPct / 100 : 1 - proj.homeWinPct / 100;
  const impliedPickProb =
    pickOdds > 0
      ? 100 / (pickOdds + 100)
      : Math.abs(pickOdds) / (Math.abs(pickOdds) + 100);

  const [inserted] = await db
    .insert(modelPredictionsTable)
    .values({
      gameId: game.espnId,
      modelVersionId,
      sport: game.sport,
      market: "moneyline",
      selection: pickIsHome ? "home" : "away",
      odds: pickOdds,
      modelProbability: pickProb,
      impliedProbability: impliedPickProb,
      fairProbability: pickProb,
      edge: proj.edge,
      confidence: proj.confidence,
      recommendation: proj.valueRating,
      units: proj.units > 0 ? proj.units : 1.0,
      podScore: proj.podScore,
      finalRating: proj.finalModelScore,
      marketIntelligenceGrade: proj.finalModelTier,
      sharpSignals: { sharpScore: proj.sharpScore, sharpSignal: proj.sharpSignal },
      featureSnapshot,
      predictionTimestamp: capturedAt,
      dataCutoffTimestamp: capturedAt,
      isChallenger: false,
    })
    .returning({ id: modelPredictionsTable.id });

  return inserted?.id ?? null;
}

// ── Published pick ────────────────────────────────────────────────────────────

/**
 * Create a published pick and a pending pick_results row for tracking.
 * Strong Buy + Buy are marked public; Neutral and Fade are private.
 */
async function publishPick(
  predictionId: number,
  game: FetchedGame,
  proj: ProjectionResult,
  publishedAt: Date,
): Promise<void> {
  const isPublic =
    proj.valueRating === "Strong Buy" || proj.valueRating === "Buy";
  const isPlayOfDay = proj.finalModelTier === "Elite" || proj.podScore >= 50;
  const units = proj.units > 0 ? proj.units : 1.0;
  const pickIsHomePub = proj.edge >= 0;

  const [pick] = await db
    .insert(publishedPicksTable)
    .values({
      predictionId,
      gameId: game.espnId,
      sport: game.sport,
      market: "moneyline",
      selection: pickIsHomePub ? "home" : "away",
      odds: pickIsHomePub ? proj.vegasHomeOdds : proj.vegasAwayOdds,
      units,
      recommendation: proj.valueRating,
      confidence: proj.confidence,
      isPlayOfDay,
      isPublic,
      publishedAt,
    })
    .returning({ id: publishedPicksTable.id });

  if (!pick) return;

  // Seed a pending pick_results row so the grader can find it
  await db.insert(pickResultsTable).values({
    pickId: pick.id,
    result: "pending",
    unitsRisked: units,
    unitsWonLost: 0,
    gradeAudit: [],
  });
}

// ── Game result ───────────────────────────────────────────────────────────────

/**
 * Write final scores to game_results when ESPN marks a game as final.
 * Idempotent — does nothing if a result row already exists.
 */
async function writeGameResult(game: FetchedGame): Promise<void> {
  if (game.status !== "final") return;
  if (game.homeScore == null || game.awayScore == null) return;

  const [existing] = await db
    .select({ id: gameResultsTable.id })
    .from(gameResultsTable)
    .where(eq(gameResultsTable.gameId, game.espnId))
    .limit(1);

  if (!existing) {
    await db.insert(gameResultsTable).values({
      gameId: game.espnId,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      homeTeamWon: game.homeScore > game.awayScore,
      overtimes: 0,
      statusDetail: "Final",
      gradingSource: "espn",
    });
  }

  // Always keep the games table scores current so game cards show final scores.
  await db
    .update(gamesTable)
    .set({ homeScore: game.homeScore, awayScore: game.awayScore })
    .where(eq(gamesTable.id, game.espnId));
}

// ── Closing lines ─────────────────────────────────────────────────────────────

/**
 * Capture the closing Vegas lines when a game goes final.
 * Uses the last known ESPN odds as the proxy for the closing line.
 * The uniqueIndex on (gameId, marketId, selection) makes this idempotent.
 */
async function writeClosingLines(
  game: FetchedGame,
  proj: ProjectionResult,
  capturedAt: Date,
  marketIds: Record<string, number>,
): Promise<void> {
  if (game.status !== "final") return;

  const mlId = marketIds["moneyline"];
  const spId = marketIds["spread"];
  const totId = marketIds["total"];
  if (!mlId || !spId || !totId) return;

  const rows = [
    { marketId: mlId, selection: "home", closingPrice: proj.vegasHomeOdds, closingLine: null as number | null },
    { marketId: mlId, selection: "away", closingPrice: proj.vegasAwayOdds, closingLine: null as number | null },
    { marketId: spId, selection: "home", closingPrice: -110, closingLine: proj.vegasSpread },
    { marketId: spId, selection: "away", closingPrice: -110, closingLine: -proj.vegasSpread },
    { marketId: totId, selection: "over", closingPrice: -110, closingLine: proj.vegasTotal },
    { marketId: totId, selection: "under", closingPrice: -110, closingLine: proj.vegasTotal },
  ];

  for (const r of rows) {
    await db
      .insert(closingLinesTable)
      .values({
        gameId: game.espnId,
        marketId: r.marketId,
        selection: r.selection,
        closingPrice: r.closingPrice,
        closingLine: r.closingLine,
        capturedAt,
      })
      .onConflictDoNothing(); // uniqueIndex on (gameId, marketId, selection)
  }
}

// ── Master pipeline ───────────────────────────────────────────────────────────

/**
 * Run the full snapshot pipeline for one game after its projection is computed.
 *
 * Order:
 * 1. Always write an odds snapshot (timestamped market data).
 * 2. If game is not yet final: write immutable prediction + published pick (once).
 * 3. If game just became final: write game result + closing lines.
 */
export async function processGameSnapshot(
  game: FetchedGame,
  proj: ProjectionResult,
): Promise<void> {
  const { espnSportsbookId, marketIds, modelVersionIds } =
    await getBootstrapIds();
  const now = new Date();
  const modelVersionId = modelVersionIds[game.sport];

  if (!modelVersionId) {
    logger.warn(
      { sport: game.sport },
      "No production model version for sport, skipping snapshot",
    );
    return;
  }

  try {
    // 1. Odds snapshot (every refresh)
    await writeOddsSnapshot(game, proj, now, espnSportsbookId, marketIds);

    // 2. Prediction + pick (once, before game is final)
    if (game.status !== "final") {
      const predictionId = await writePredictionSnapshot(
        game,
        proj,
        modelVersionId,
        now,
      );
      if (predictionId !== null) {
        await publishPick(predictionId, game, proj, now);
      }
    }

    // 3. Result + closing lines (when final)
    if (game.status === "final") {
      await writeGameResult(game);
      await writeClosingLines(game, proj, now, marketIds);
    }
  } catch (err) {
    logger.error({ err, gameId: game.espnId }, "processGameSnapshot error");
  }
}
