/**
 * Learning Engine
 *
 * After each graded game, this module:
 *   1. Updates the rolling EMA accuracy for the sport.
 *   2. Tunes the sport-level confidence multiplier (amplify edges when accurate,
 *      dampen when underperforming).
 *   3. Updates per-factor weights (factorWeights JSONB) so the model gradually
 *      learns which signals are actually predictive for each sport:
 *        - Factors that consistently point in the right direction → weight nudged up
 *        - Factors that consistently point the wrong way → weight nudged down
 *
 * Factor weights are bounded in [0.002, 0.60] to prevent extreme drift.
 * Nudge magnitudes are intentionally small (correct: +0.004, wrong: -0.003)
 * so the weights converge slowly over hundreds of games rather than
 * over-fitting to a short streak.
 */

import { eq, and, isNull } from "drizzle-orm";
import { db, gamesTable, modelWeightsTable } from "@workspace/db";
import type { FactorWeights } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  SPORT_DEFAULT_WEIGHTS,
  computeFactorContributions,
} from "./model";
import type { ComputeOptions } from "./model";
import {
  getWnbaTeamStats,
  getSoccerTeamStats,
  getDbTeamStats,
} from "./teamStats";

/** EMA learning rate for rolling accuracy */
const EMA_ALPHA = 0.15;

/** Weight nudge magnitude — small to prevent over-fitting */
const NUDGE_UP   = 0.004;
const NUDGE_DOWN = 0.003;
const WEIGHT_MIN = 0.002;
const WEIGHT_MAX = 0.60;

function ema(prev: number, next: number): number {
  return prev * (1 - EMA_ALPHA) + next * EMA_ALPHA;
}

function clampWeight(w: number): number {
  return Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, w));
}

/**
 * Fetch team stats for a graded game so we can compute factor contributions.
 * Returns a partial ComputeOptions populated with whichever stats are available.
 */
async function fetchStatsForGame(
  sport: string,
  homeTeamId: string | null,
  awayTeamId: string | null,
): Promise<Pick<ComputeOptions, "homeTeamStats" | "awayTeamStats" | "homeSoccerStats" | "awaySoccerStats" | "homeDbStats" | "awayDbStats">> {
  const hId = homeTeamId ?? "";
  const aId = awayTeamId ?? "";

  if (sport === "WNBA" || sport === "NBA") {
    const [homeTeamStats, awayTeamStats] = await Promise.all([
      getWnbaTeamStats(hId),
      getWnbaTeamStats(aId),
    ]);
    return { homeTeamStats, awayTeamStats };
  }

  if (sport === "Soccer") {
    const [homeSoccerStats, awaySoccerStats] = await Promise.all([
      getSoccerTeamStats(hId),
      getSoccerTeamStats(aId),
    ]);
    return { homeSoccerStats, awaySoccerStats };
  }

  if (["MLB", "NFL", "NHL", "NCAAF", "NCAAB"].includes(sport)) {
    const [homeDbStats, awayDbStats] = await Promise.all([
      getDbTeamStats(hId, sport),
      getDbTeamStats(aId, sport),
    ]);
    return { homeDbStats, awayDbStats };
  }

  return {};
}

/**
 * Update factor weights based on which factors predicted the outcome correctly.
 *
 * For each factor:
 *   contribution > 0  → predicted home win
 *   contribution < 0  → predicted away win
 *   actualHomeWin     → true if home actually won
 *
 * A factor is "correct" if its direction matches the actual outcome.
 */
function nudgeFactorWeights(
  current: FactorWeights,
  contributions: Record<string, number>,
  actualHomeWin: boolean,
): FactorWeights {
  const updated = { ...current };

  for (const [factor, contribution] of Object.entries(contributions)) {
    if (Math.abs(contribution) < 0.001) continue; // factor had no meaningful influence

    const factorPredictedHome = contribution > 0;
    const factorCorrect       = factorPredictedHome === actualHomeWin;

    // Map factor contribution key to the weight key in factorWeights
    const weightKey = factorToWeightKey(factor);
    if (!weightKey || !(weightKey in current)) continue;

    const current_w = current[weightKey] ?? (SPORT_DEFAULT_WEIGHTS["MLB"]?.[weightKey] ?? 0.10);
    updated[weightKey] = clampWeight(
      factorCorrect
        ? current_w + NUDGE_UP
        : current_w - NUDGE_DOWN,
    );
  }

  return updated;
}

/** Maps factor contribution names to weight key names in factorWeights */
function factorToWeightKey(factor: string): string | null {
  const map: Record<string, string> = {
    record:        "recordWeight",
    efg:           "efgWeight",
    to:            "toWeight",
    oreb:          "orebWeight",
    def:           "defWeight",
    form:          "formWeight",
    netRating:     "netRatingWeight",
    rest:          "restWeight",
    pythagorean:   "pythagoreanWeight",
    scoreDiff:     "scoreDiffWeight",
    attackDef:     "attackDefWeight",
    goalDiff:      "goalDiffWeight",
    lastGoalDiff:  "lastGoalDiffWeight",
  };
  return map[factor] ?? null;
}

/**
 * Process all completed games whose outcomes haven't been learned from yet.
 * Updates model_weights accuracy, confidence multiplier, and factor weights.
 */
export async function runLearning(): Promise<void> {
  const unprocessed = await db
    .select()
    .from(gamesTable)
    .where(
      and(eq(gamesTable.status, "final"), isNull(gamesTable.predictionCorrect)),
    );

  if (unprocessed.length === 0) return;

  logger.info({ count: unprocessed.length }, "Learning: processing outcomes");

  for (const game of unprocessed) {
    if (game.homeScore == null || game.awayScore == null) continue;

    const actualHomeWin   = game.homeScore > game.awayScore;
    const predictedHomeWin = game.homeWinPct > 50;
    const correct          = predictedHomeWin === actualHomeWin;

    // Mark outcome on the game row
    await db
      .update(gamesTable)
      .set({ predictionCorrect: correct })
      .where(eq(gamesTable.id, game.id));

    // Fetch current model weights for this sport
    const [existing] = await db
      .select()
      .from(modelWeightsTable)
      .where(eq(modelWeightsTable.sport, game.sport));

    // ── Compute factor contributions for this game ──────────────────────────
    let updatedFactorWeights: FactorWeights | undefined;
    try {
      const currentFw: FactorWeights = existing?.factorWeights ??
        SPORT_DEFAULT_WEIGHTS[game.sport] ??
        SPORT_DEFAULT_WEIGHTS["MLB"]!;

      const statsOpts = await fetchStatsForGame(
        game.sport,
        game.homeTeamId,
        game.awayTeamId,
      );

      const contributions = computeFactorContributions(
        game.sport,
        game.homeTeamRecord,
        game.awayTeamRecord,
        statsOpts,
        currentFw,
      );

      updatedFactorWeights = nudgeFactorWeights(currentFw, contributions, actualHomeWin);

      logger.debug(
        { sport: game.sport, gameId: game.id, correct, contributions, updatedFactorWeights },
        "Learning: factor weights updated",
      );
    } catch (err) {
      logger.warn({ err, gameId: game.id }, "Learning: factor contribution error, skipping weight update");
    }

    if (existing) {
      // ── EMA accuracy update ────────────────────────────────────────────────
      const newAccuracy = ema(existing.accuracyRate, correct ? 1 : 0);

      // ── Confidence multiplier — dampen when struggling, amplify when accurate
      let newMultiplier = existing.confidenceMultiplier;
      if (newAccuracy > 0.58)
        newMultiplier = Math.min(1.3, newMultiplier + 0.02);
      else if (newAccuracy < 0.45)
        newMultiplier = Math.max(0.7, newMultiplier - 0.02);

      // ── Per-rating accuracy ────────────────────────────────────────────────
      const newSbAcc =
        game.valueRating === "Strong Buy"
          ? ema(existing.strongBuyAccuracy, correct ? 1 : 0)
          : existing.strongBuyAccuracy;

      const newBuyAcc =
        game.valueRating === "Buy"
          ? ema(existing.buyAccuracy, correct ? 1 : 0)
          : existing.buyAccuracy;

      await db
        .update(modelWeightsTable)
        .set({
          accuracyRate:       newAccuracy,
          totalPredictions:   existing.totalPredictions + 1,
          correctPredictions: existing.correctPredictions + (correct ? 1 : 0),
          strongBuyAccuracy:  newSbAcc,
          buyAccuracy:        newBuyAcc,
          confidenceMultiplier: newMultiplier,
          factorWeights:      updatedFactorWeights ?? existing.factorWeights,
          lastLearnedAt:      new Date(),
        })
        .where(eq(modelWeightsTable.sport, game.sport));
    } else {
      // Bootstrap first entry for this sport
      await db.insert(modelWeightsTable).values({
        sport:               game.sport,
        accuracyRate:        correct ? 1.0 : 0.0,
        totalPredictions:    1,
        correctPredictions:  correct ? 1 : 0,
        strongBuyAccuracy:
          game.valueRating === "Strong Buy" ? (correct ? 1.0 : 0.0) : 0.5,
        buyAccuracy:
          game.valueRating === "Buy" ? (correct ? 1.0 : 0.0) : 0.5,
        confidenceMultiplier: 1.0,
        // Seed with sport defaults so the learning engine has a starting point
        factorWeights:        updatedFactorWeights ??
                              SPORT_DEFAULT_WEIGHTS[game.sport] ??
                              SPORT_DEFAULT_WEIGHTS["MLB"]!,
        lastLearnedAt:        new Date(),
      });
    }
  }

  logger.info({ count: unprocessed.length }, "Learning: update complete");
}
