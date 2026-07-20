import { Router, type IRouter } from "express";
import { db, modelWeightsTable } from "@workspace/db";
import { runLearning } from "../services/learning";

const router: IRouter = Router();

/**
 * GET /api/model/stats
 * Returns per-sport learning accuracy and confidence multipliers.
 * Runs a learning pass first so stats are always up to date.
 */
router.get("/model/stats", async (_req, res): Promise<void> => {
  await runLearning();

  const weights = await db.select().from(modelWeightsTable);

  const totalPredictions = weights.reduce(
    (s, w) => s + w.totalPredictions,
    0,
  );
  const correctPredictions = weights.reduce(
    (s, w) => s + w.correctPredictions,
    0,
  );
  const overallAccuracy =
    totalPredictions > 0 ? correctPredictions / totalPredictions : 0;

  res.json({
    stats: weights.map((w) => ({
      sport: w.sport,
      accuracyRate: w.accuracyRate,
      totalPredictions: w.totalPredictions,
      correctPredictions: w.correctPredictions,
      strongBuyAccuracy: w.strongBuyAccuracy,
      buyAccuracy: w.buyAccuracy,
      confidenceMultiplier: w.confidenceMultiplier,
      lastLearnedAt: w.lastLearnedAt?.toISOString() ?? null,
    })),
    overallAccuracy,
    totalPredictions,
    dataAsOf: new Date().toISOString(),
  });
});

export default router;
