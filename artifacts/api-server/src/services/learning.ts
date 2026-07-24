/**
 * Learning Engine
 *
 * After each graded game, this module:
 *   1. Updates the rolling EMA accuracy for the sport (binary correct/wrong).
 *   2. Updates a Brier score (probabilistic calibration quality — lower is better).
 *   3. Tunes the sport-level confidence multiplier.
 *   4. Updates per-factor weights with two improvements over the baseline:
 *        a. Magnitude weighting — factors that dominated the prediction
 *           update more than those that barely contributed.
 *        b. Brier scaling — a confident wrong prediction triggers a larger
 *           weight penalty; a confident correct one triggers a smaller reward
 *           (the model already knows what it's doing).
 *   5. Tracks per-tier accuracy (Elite / Strong / Playable).
 *
 * Factor weights are bounded in [0.002, 0.60] to prevent extreme drift.
 * Base nudge magnitudes are intentionally small so weights converge over
 * hundreds of games rather than over-fitting to short streaks.
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

/** EMA learning rate for rolling accuracy and Brier score */
const EMA_ALPHA = 0.15;

/** Base nudge magnitudes — scaled further by magnitude and Brier factors */
const NUDGE_UP   = 0.004;
const NUDGE_DOWN = 0.003;
const WEIGHT_MIN = 0.002;
const WEIGHT_MAX = 0.60;

/** Brier score random baseline — a 50/50 coin-flip gives exactly 0.25 */
const BRIER_RANDOM = 0.25;

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
 * Update factor weights using two improvements over the flat baseline nudge:
 *
 * 1. Magnitude weighting
 *    Each factor's nudge is scaled by its share of the total prediction
 *    magnitude. A factor that drove 40% of the overall call updates 4× more
 *    than one that drove 10%. This prevents small, noisy factors from
 *    accumulating weight through random variance.
 *
 * 2. Brier scaling
 *    The Brier score ((modelProb − outcome)²) measures how "wrong" the
 *    overall prediction was, weighted by confidence:
 *      · Confident + wrong → brierScore near 1 → learningScale up to 2×
 *        (model urgently needs to re-weight the factors that misled it)
 *      · Confident + correct → brierScore near 0 → learningScale down to 0.5×
 *        (model already has good signal; smaller reward to prevent over-fitting)
 *      · Uncertain (near 50%) → brierScale ≈ 1× (neutral update either way)
 */
function nudgeFactorWeights(
  current: FactorWeights,
  contributions: Record<string, number>,
  actualHomeWin: boolean,
  modelProb: number,
): FactorWeights {
  const updated = { ...current };
  const actualOutcome = actualHomeWin ? 1.0 : 0.0;

  // Brier score: 0 = perfect, 1 = worst. Random baseline = 0.25.
  const brierScore = (modelProb - actualOutcome) ** 2;
  // learningScale: [0.5 when confident+correct] → [2.0 when confident+wrong]
  const learningScale = Math.max(0.5, Math.min(2.0, brierScore / BRIER_RANDOM));

  // Total contribution magnitude — used to normalise per-factor share
  const totalMag = Object.values(contributions).reduce((s, c) => s + Math.abs(c), 0);
  if (totalMag < 0.001) return updated; // no meaningful factors fired

  for (const [factor, contribution] of Object.entries(contributions)) {
    if (Math.abs(contribution) < 0.001) continue;

    const factorPredictedHome = contribution > 0;
    const factorCorrect       = factorPredictedHome === actualHomeWin;
    const weightKey           = factorToWeightKey(factor);
    if (!weightKey || !(weightKey in current)) continue;

    // Magnitude share: what fraction of the total call did this factor drive?
    // Clamped to [0.25, 2.0] so no single factor gets a 0× or extreme nudge.
    const magnitudeRatio = Math.abs(contribution) / totalMag;
    const factorScale    = Math.max(0.25, Math.min(2.0, magnitudeRatio * 5));

    const currentW = current[weightKey] ?? 0.10;

    if (factorCorrect) {
      // Inverse Brier: confident+correct → smaller reward (less to learn).
      // Uncertain+correct → larger reward (factor deserves more credit).
      const scale = factorScale * Math.max(0.25, 2.0 - learningScale);
      updated[weightKey] = clampWeight(currentW + NUDGE_UP * scale);
    } else {
      // Confident+wrong → larger penalty; uncertain+wrong → smaller penalty.
      const scale = factorScale * learningScale;
      updated[weightKey] = clampWeight(currentW - NUDGE_DOWN * scale);
    }
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
 * Updates model_weights with:
 *   - Binary accuracy EMA (for the confidence multiplier and user-facing display)
 *   - Brier score EMA (probabilistic calibration quality)
 *   - Per-factor weights (magnitude + Brier scaled)
 *   - Per-tier accuracy (Elite / Strong / Playable)
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

    const actualHomeWin    = game.homeScore > game.awayScore;
    const predictedHomeWin = game.homeWinPct > 50;
    const correct          = predictedHomeWin === actualHomeWin;

    // Calibrated model probability and Brier score for this game
    const modelProb  = game.homeWinPct / 100;
    const brierScore = (modelProb - (actualHomeWin ? 1.0 : 0.0)) ** 2;

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

    // ── Compute magnitude + Brier-scaled factor weights ──────────────────────
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

      updatedFactorWeights = nudgeFactorWeights(
        currentFw,
        contributions,
        actualHomeWin,
        modelProb,
      );

      logger.debug(
        { sport: game.sport, gameId: game.id, correct, brierScore: brierScore.toFixed(4), contributions, updatedFactorWeights },
        "Learning: factor weights updated",
      );
    } catch (err) {
      logger.warn({ err, gameId: game.id }, "Learning: factor contribution error, skipping weight update");
    }

    // ── Determine which tier this game belongs to ─────────────────────────────
    // finalModelTier was added in Phase 1; games before that default to "Watchlist"
    const tier = game.finalModelTier ?? "Watchlist";

    if (existing) {
      // ── EMA binary accuracy (confidence multiplier + user display) ───────────
      const newAccuracy = ema(existing.accuracyRate, correct ? 1 : 0);

      // ── EMA Brier score (probabilistic calibration quality) ──────────────────
      // Lower is better. Random = 0.25. A well-calibrated model trends toward ~0.20.
      const newBrierScore = ema(existing.brierScore ?? BRIER_RANDOM, brierScore);

      // ── Confidence multiplier — dampen when struggling, amplify when accurate ─
      let newMultiplier = existing.confidenceMultiplier;
      if (newAccuracy > 0.58)
        newMultiplier = Math.min(1.3, newMultiplier + 0.02);
      else if (newAccuracy < 0.45)
        newMultiplier = Math.max(0.7, newMultiplier - 0.02);

      // ── Legacy per-rating accuracy (Strong Buy / Buy) ────────────────────────
      const newSbAcc =
        game.valueRating === "Strong Buy"
          ? ema(existing.strongBuyAccuracy, correct ? 1 : 0)
          : existing.strongBuyAccuracy;

      const newBuyAcc =
        game.valueRating === "Buy"
          ? ema(existing.buyAccuracy, correct ? 1 : 0)
          : existing.buyAccuracy;

      // ── Per-tier accuracy (Elite / Strong / Playable) ────────────────────────
      const newEliteAcc =
        tier === "Elite"
          ? ema(existing.eliteAccuracy ?? 0.5, correct ? 1 : 0)
          : (existing.eliteAccuracy ?? 0.5);

      const newStrongAcc =
        tier === "Strong"
          ? ema(existing.strongAccuracy ?? 0.5, correct ? 1 : 0)
          : (existing.strongAccuracy ?? 0.5);

      const newPlayableAcc =
        tier === "Playable"
          ? ema(existing.playableAccuracy ?? 0.5, correct ? 1 : 0)
          : (existing.playableAccuracy ?? 0.5);

      await db
        .update(modelWeightsTable)
        .set({
          accuracyRate:         newAccuracy,
          brierScore:           newBrierScore,
          totalPredictions:     existing.totalPredictions + 1,
          correctPredictions:   existing.correctPredictions + (correct ? 1 : 0),
          strongBuyAccuracy:    newSbAcc,
          buyAccuracy:          newBuyAcc,
          eliteAccuracy:        newEliteAcc,
          strongAccuracy:       newStrongAcc,
          playableAccuracy:     newPlayableAcc,
          confidenceMultiplier: newMultiplier,
          factorWeights:        updatedFactorWeights ?? existing.factorWeights,
          lastLearnedAt:        new Date(),
        })
        .where(eq(modelWeightsTable.sport, game.sport));
    } else {
      // Bootstrap first entry for this sport
      await db.insert(modelWeightsTable).values({
        sport:                game.sport,
        accuracyRate:         correct ? 1.0 : 0.0,
        brierScore:           brierScore,
        totalPredictions:     1,
        correctPredictions:   correct ? 1 : 0,
        strongBuyAccuracy:
          game.valueRating === "Strong Buy" ? (correct ? 1.0 : 0.0) : 0.5,
        buyAccuracy:
          game.valueRating === "Buy" ? (correct ? 1.0 : 0.0) : 0.5,
        eliteAccuracy:   tier === "Elite"    ? (correct ? 1.0 : 0.0) : 0.5,
        strongAccuracy:  tier === "Strong"   ? (correct ? 1.0 : 0.0) : 0.5,
        playableAccuracy: tier === "Playable" ? (correct ? 1.0 : 0.0) : 0.5,
        confidenceMultiplier: 1.0,
        factorWeights:        updatedFactorWeights ??
                              SPORT_DEFAULT_WEIGHTS[game.sport] ??
                              SPORT_DEFAULT_WEIGHTS["MLB"]!,
        lastLearnedAt:        new Date(),
      });
    }
  }

  logger.info({ count: unprocessed.length }, "Learning: update complete");
}
