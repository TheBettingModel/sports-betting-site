import { eq, and, isNull } from "drizzle-orm";
import { db, gamesTable, modelWeightsTable } from "@workspace/db";
import { logger } from "../lib/logger";

/** Exponential moving average learning rate */
const EMA_ALPHA = 0.15;

function ema(prev: number, next: number): number {
  return prev * (1 - EMA_ALPHA) + next * EMA_ALPHA;
}

/**
 * Find completed games whose outcomes haven't been processed yet,
 * update model_weights using exponential moving average, and
 * mark each game's predictionCorrect field.
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

    const predictedHomeWin = game.homeWinPct > 50;
    const actualHomeWin = game.homeScore > game.awayScore;
    const correct = predictedHomeWin === actualHomeWin;

    // Record outcome on the game row
    await db
      .update(gamesTable)
      .set({ predictionCorrect: correct })
      .where(eq(gamesTable.id, game.id));

    const [existing] = await db
      .select()
      .from(modelWeightsTable)
      .where(eq(modelWeightsTable.sport, game.sport));

    if (existing) {
      const newAccuracy = ema(existing.accuracyRate, correct ? 1 : 0);

      // Tune confidence multiplier based on rolling accuracy
      let newMultiplier = existing.confidenceMultiplier;
      if (newAccuracy > 0.58)
        newMultiplier = Math.min(1.3, newMultiplier + 0.02);
      else if (newAccuracy < 0.45)
        newMultiplier = Math.max(0.7, newMultiplier - 0.02);

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
          accuracyRate: newAccuracy,
          totalPredictions: existing.totalPredictions + 1,
          correctPredictions: existing.correctPredictions + (correct ? 1 : 0),
          strongBuyAccuracy: newSbAcc,
          buyAccuracy: newBuyAcc,
          confidenceMultiplier: newMultiplier,
          lastLearnedAt: new Date(),
        })
        .where(eq(modelWeightsTable.sport, game.sport));
    } else {
      // Bootstrap first entry for this sport
      await db.insert(modelWeightsTable).values({
        sport: game.sport,
        accuracyRate: correct ? 1.0 : 0.0,
        totalPredictions: 1,
        correctPredictions: correct ? 1 : 0,
        strongBuyAccuracy:
          game.valueRating === "Strong Buy" ? (correct ? 1.0 : 0.0) : 0.5,
        buyAccuracy:
          game.valueRating === "Buy" ? (correct ? 1.0 : 0.0) : 0.5,
        confidenceMultiplier: 1.0,
        lastLearnedAt: new Date(),
      });
    }
  }

  logger.info({ count: unprocessed.length }, "Learning: update complete");
}
