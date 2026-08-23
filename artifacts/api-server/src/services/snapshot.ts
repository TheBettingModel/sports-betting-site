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
import {
  hasValidMoneylineMarketForSport,
  isValidAmericanOdds,
  isPregameCommenceTime,
} from "./oddsApi";
import { assessMlbDecisionEvidence, type MlbDecisionEvidence } from "./mlbDecisionEvidence";

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
    evidence?: MlbDecisionEvidence;
  };
}

/** Required evidence for an actionable pregame moneyline decision. */
export function isPredictionDecisionEligible(
  game: FetchedGame,
  decisionContext: PredictionDecisionContext | undefined,
): boolean {
  if (!decisionContext) return false;
  const missing = new Set(decisionContext.dataQuality.missingSignals);
  if (missing.has("market_odds") || missing.has("market_started_or_invalid")) return false;
  // MLB starter quality is a full-game input, not a neutral fallback. Retain the
  // game for display, but do not turn an unannounced/scratched starter into a pick.
  if (game.sport === "MLB" && missing.has("probable_pitchers")) return false;
  return true;
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
  precomputedMlbEvidence?: MlbDecisionEvidence,
): PredictionDecisionContext {
  const factorWeights = effectiveWeights(game.sport, modelWeights?.factorWeights);
  const factorContributions = computeFactorContributions(
    game.sport,
    game.homeTeamRecord,
    game.awayTeamRecord,
    options,
    factorWeights,
  );
  const hasValidMarket = hasValidMoneylineMarketForSport(game.sport, {
    homeOdds: options.realVegasHomeOdds,
    awayOdds: options.realVegasAwayOdds,
    drawOdds: options.realVegasDrawOdds,
  });
  const mlbEvidence = game.sport === "MLB"
    ? precomputedMlbEvidence ?? assessMlbDecisionEvidence(game, options, availability)
    : undefined;
  const missingSignals = [
    !hasValidMarket ? "market_odds" : null,
    !isPregameCommenceTime(game.commenceTimeISO) ? "market_started_or_invalid" : null,
    ...(mlbEvidence?.missingSignals ?? []),
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
      missingSignals: [...new Set(missingSignals)],
      source: "refresh",
      evidence: mlbEvidence,
    },
  };
}

// ── Odds snapshot ─────────────────────────────────────────────────────────────

/**
 * Persist only verified moneyline prices as immutable pregame evidence.
 * Synthetic spread/total values must never be recorded as market history.
 */
async function writeOddsSnapshot(
  game: FetchedGame,
  proj: ProjectionResult,
  capturedAt: Date,
  espnSportsbookId: number,
  marketIds: Record<string, number>,
  decisionContext?: PredictionDecisionContext,
): Promise<void> {
  const mlId = marketIds["moneyline"];
  const marketMissing = decisionContext?.dataQuality.missingSignals.includes("market_odds") ?? true;
  if (!mlId || marketMissing || !hasValidMoneylineMarketForSport(game.sport, {
    homeOdds: proj.vegasHomeOdds,
    awayOdds: proj.vegasAwayOdds,
    drawOdds: game.sport === "Soccer" ? proj.vegasDrawOdds : undefined,
  })) {
    return;
  }

  const rows = [
    { marketId: mlId, selection: "home", price: proj.vegasHomeOdds, line: null as number | null },
    { marketId: mlId, selection: "away", price: proj.vegasAwayOdds, line: null as number | null },
    ...(game.sport === "Soccer"
      ? [{ marketId: mlId, selection: "draw", price: proj.vegasDrawOdds, line: null as number | null }]
      : []),
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
  if (!isPredictionDecisionEligible(game, decisionContext) || !hasValidMoneylineMarketForSport(game.sport, {
    homeOdds: proj.vegasHomeOdds,
    awayOdds: proj.vegasAwayOdds,
    drawOdds: game.sport === "Soccer" ? proj.vegasDrawOdds : undefined,
  })) {
    return null;
  }

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
    schemaVersion: decisionContext ? 3 : 1,
    modelVersion: {
      id: modelVersionId,
      decisionEvidenceVersion: decisionContext?.dataQuality.evidence?.schemaVersion ?? null,
    },
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
    // The explicit pre-insert lookup above preserves the one-original-decision
    // rule. Do not name a conflict target here: policy revisions extend the
    // database identity with policy_revision_id.
    .onConflictDoNothing()
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
  capturedAt: Date,
  marketIds: Record<string, number>,
): Promise<void> {
  if (game.status !== "final") return;

  const mlId = marketIds["moneyline"];
  if (!mlId) return;

  const cutoff = new Date(game.commenceTimeISO).getTime();
  if (!Number.isFinite(cutoff)) return;

  const selections = game.sport === "Soccer"
    ? ["home", "away", "draw"] as const
    : ["home", "away"] as const;
  for (const selection of selections) {
    const [lastPregame] = Number.isFinite(cutoff)
      ? await db
          .select({ price: oddsSnapshotsTable.price, line: oddsSnapshotsTable.line })
          .from(oddsSnapshotsTable)
          .where(
            and(
              eq(oddsSnapshotsTable.gameId, game.espnId),
              eq(oddsSnapshotsTable.marketId, mlId),
              eq(oddsSnapshotsTable.selection, selection),
              eq(oddsSnapshotsTable.isAvailable, true),
              eq(oddsSnapshotsTable.isStale, false),
              eq(oddsSnapshotsTable.marketStatus, "open"),
              lte(oddsSnapshotsTable.capturedAt, new Date(cutoff)),
            ),
          )
          .orderBy(desc(oddsSnapshotsTable.capturedAt))
          .limit(1)
      : [];
    if (!lastPregame || !isValidAmericanOdds(lastPregame.price)) continue;

    await db
      .insert(closingLinesTable)
      .values({
        gameId: game.espnId,
        marketId: mlId,
        selection,
        closingPrice: lastPregame.price,
        closingLine: lastPregame.line,
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
    if (game.status === "upcoming" && isPregameCommenceTime(game.commenceTimeISO)) {
      await writeOddsSnapshot(game, proj, now, espnSportsbookId, marketIds, decisionContext);
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
      await writeClosingLines(game, now, marketIds);
    }
  } catch (err) {
    logger.error({ err, gameId: game.espnId }, "processGameSnapshot error");
  }
}
