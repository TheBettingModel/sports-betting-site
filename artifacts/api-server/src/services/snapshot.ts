import { and, desc, eq, lte, sql } from "drizzle-orm";
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
import type { ModelWeights } from "@workspace/db";
import {
  computeFactorContributions,
  effectiveWeights,
  removeVig2,
  type ComputeOptions,
  type ProjectionResult,
} from "./model";
import type { FetchedGame } from "./espn";
import { getBootstrapIds } from "./bootstrap";
import { logger } from "../lib/logger";

export interface PredictionDecisionContext {
  factorWeights: Record<string, number>;
  factorContributions: Record<string, number>;
  confidenceMultiplier: number;
  inputSignals: Record<string, unknown>;
  availability: Record<string, unknown>;
  dataQuality: {
    capturedAt: string;
    missingSignals: string[];
    source: "refresh";
  };
}

/**
 * Capture reproducible pregame evidence next to every new prediction. The
 * context is constructed before the mutable games row is upserted, so later
 * score, odds, lineup, and injury refreshes cannot rewrite the decision.
 */
export function createPredictionDecisionContext(
  game: FetchedGame,
  modelWeights: ModelWeights | null,
  options: ComputeOptions,
  availability: Record<string, unknown>,
): PredictionDecisionContext {
  const factorWeights = effectiveWeights(game.sport, modelWeights?.factorWeights);
  const factorContributions = computeFactorContributions(
    game.sport,
    game.homeTeamRecord,
    game.awayTeamRecord,
    options,
    factorWeights,
  );
  const missingSignals = [
    options.realVegasHomeOdds == null || options.realVegasAwayOdds == null ? "market_odds" : null,
    game.sport === "MLB" && options.pitcherAdvantage == null ? "probable_pitchers" : null,
    game.sport === "NHL" && options.goalieAdvantage == null ? "goalie_confirmation" : null,
    game.sport === "NFL" && options.injuryAdvantage == null ? "injury_report" : null,
    game.sport === "WNBA" && options.injuryAdvantage == null ? "player_availability" : null,
  ].filter((signal): signal is string => signal !== null);

  return {
    factorWeights,
    factorContributions,
    confidenceMultiplier: modelWeights?.confidenceMultiplier ?? 1,
    inputSignals: options as Record<string, unknown>,
    availability,
    dataQuality: {
      capturedAt: new Date().toISOString(),
      missingSignals,
      source: "refresh",
    },
  };
}

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
  decisionContext?: PredictionDecisionContext,
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
    schemaVersion: decisionContext ? 2 : 1,
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
    ...(decisionContext ? {
      decision: {
        factorWeights: decisionContext.factorWeights,
        factorContributions: decisionContext.factorContributions,
        confidenceMultiplier: decisionContext.confidenceMultiplier,
        inputSignals: decisionContext.inputSignals,
        availability: decisionContext.availability,
        dataQuality: decisionContext.dataQuality,
      },
    } : {}),
  };

  const pickIsHome = proj.edge >= 0;
  const pickOdds   = pickIsHome ? proj.vegasHomeOdds : proj.vegasAwayOdds;
  const pickProb   = pickIsHome ? proj.homeWinPct / 100 : 1 - proj.homeWinPct / 100;
  const impliedPickProb =
    pickOdds > 0
      ? 100 / (pickOdds + 100)
      : Math.abs(pickOdds) / (Math.abs(pickOdds) + 100);
  const fairMarket = removeVig2(proj.vegasHomeOdds, proj.vegasAwayOdds);
  const fairPickProbability = pickIsHome ? fairMarket.home : fairMarket.away;

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
      fairProbability: fairPickProbability,
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
/** Maximum public picks surfaced to subscribers per calendar day (ET). */
const MAX_PUBLIC_PICKS_PER_DAY = 6;

async function publishPick(
  predictionId: number,
  game: FetchedGame,
  proj: ProjectionResult,
  publishedAt: Date,
): Promise<void> {
  let isPublic =
    proj.valueRating === "Strong Buy" || proj.valueRating === "Buy";

  // Enforce the daily cap — if we've already reached MAX_PUBLIC_PICKS_PER_DAY
  // for today, demote this pick to private so subscribers aren't overwhelmed.
  // Picks are processed in ESPN order; the model thresholds are the primary
  // quality gate and the cap is a safety ceiling.
  if (isPublic) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(publishedPicksTable)
      .where(
        and(
          sql`DATE(published_at AT TIME ZONE 'America/New_York') = CURRENT_DATE`,
          eq(publishedPicksTable.isPublic, true),
        ),
      );
    if (count >= MAX_PUBLIC_PICKS_PER_DAY) {
      isPublic = false;
    }
  }

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

  const fallbackRows = [
    { marketId: mlId, selection: "home", closingPrice: proj.vegasHomeOdds, closingLine: null as number | null },
    { marketId: mlId, selection: "away", closingPrice: proj.vegasAwayOdds, closingLine: null as number | null },
    { marketId: spId, selection: "home", closingPrice: -110, closingLine: proj.vegasSpread },
    { marketId: spId, selection: "away", closingPrice: -110, closingLine: -proj.vegasSpread },
    { marketId: totId, selection: "over", closingPrice: -110, closingLine: proj.vegasTotal },
    { marketId: totId, selection: "under", closingPrice: -110, closingLine: proj.vegasTotal },
  ];

  const cutoff = new Date(game.commenceTimeISO).getTime();
  for (const r of fallbackRows) {
    const [lastPregame] = Number.isFinite(cutoff)
      ? await db
          .select({ price: oddsSnapshotsTable.price, line: oddsSnapshotsTable.line })
          .from(oddsSnapshotsTable)
          .where(
            and(
              eq(oddsSnapshotsTable.gameId, game.espnId),
              eq(oddsSnapshotsTable.marketId, r.marketId),
              eq(oddsSnapshotsTable.selection, r.selection),
              lte(oddsSnapshotsTable.capturedAt, new Date(cutoff)),
            ),
          )
          .orderBy(desc(oddsSnapshotsTable.capturedAt))
          .limit(1)
      : [];
    const closingPrice = lastPregame?.price ?? r.closingPrice;
    const closingLine = lastPregame?.line ?? r.closingLine;

    await db
      .insert(closingLinesTable)
      .values({
        gameId: game.espnId,
        marketId: r.marketId,
        selection: r.selection,
        closingPrice,
        closingLine,
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
  decisionContext?: PredictionDecisionContext,
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
    // 1. Capture and publish only while the game is genuinely upcoming.
    // Live/post-start provider prices must never become a new "pregame" model
    // decision or overwrite the market evidence used for later learning.
    if (game.status === "upcoming") {
      await writeOddsSnapshot(game, proj, now, espnSportsbookId, marketIds);
      const predictionId = await writePredictionSnapshot(
        game,
        proj,
        modelVersionId,
        now,
        decisionContext,
      );
      if (predictionId !== null) {
        await publishPick(predictionId, game, proj, now);
      }
    }

    // 2. Result + closing lines (when final). Closing price is sourced from
    // the final valid pregame snapshot rather than the current final/live feed.
    if (game.status === "final") {
      await writeGameResult(game);
      await writeClosingLines(game, proj, now, marketIds);
    }
  } catch (err) {
    logger.error({ err, gameId: game.espnId }, "processGameSnapshot error");
  }
}
