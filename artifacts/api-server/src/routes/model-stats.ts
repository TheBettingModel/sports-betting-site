import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  modelWeightsTable,
  pickResultsTable,
  publishedPicksTable,
} from "@workspace/db";
import { runLearning } from "../services/learning";

const router: IRouter = Router();

/**
 * GET /api/model/stats
 *
 * Returns per-sport performance derived from graded pick_results.
 * Falls back to EMA model_weights accuracy when no graded picks exist yet.
 * The confidenceMultiplier is always sourced from model_weights (used by
 * the prediction engine until the model registry is fully live).
 */
router.get("/model/stats", async (_req, res): Promise<void> => {
  // Keep running the EMA learning pass to maintain confidenceMultiplier
  await runLearning();

  // ── Load graded pick_results ──────────────────────────────────────────────
  const gradedPicks = await db
    .select({
      sport: publishedPicksTable.sport,
      recommendation: publishedPicksTable.recommendation,
      result: pickResultsTable.result,
      clv: pickResultsTable.clv,
    })
    .from(pickResultsTable)
    .innerJoin(
      publishedPicksTable,
      eq(pickResultsTable.pickId, publishedPicksTable.id),
    )
    .where(
      inArray(pickResultsTable.result, ["win", "loss", "push", "void"]),
    );

  // ── Aggregate by sport ────────────────────────────────────────────────────
  interface SportAgg {
    wins: number;
    losses: number;
    pushes: number;
    strongBuyWins: number;
    strongBuyLosses: number;
    buyWins: number;
    buyLosses: number;
    clvSum: number;
    clvCount: number;
  }

  const agg = new Map<string, SportAgg>();

  for (const pick of gradedPicks) {
    if (!agg.has(pick.sport)) {
      agg.set(pick.sport, {
        wins: 0,
        losses: 0,
        pushes: 0,
        strongBuyWins: 0,
        strongBuyLosses: 0,
        buyWins: 0,
        buyLosses: 0,
        clvSum: 0,
        clvCount: 0,
      });
    }
    const s = agg.get(pick.sport)!;

    if (pick.result === "win") s.wins++;
    else if (pick.result === "loss") s.losses++;
    else if (pick.result === "push") s.pushes++;

    if (pick.recommendation === "Strong Buy") {
      if (pick.result === "win") s.strongBuyWins++;
      else if (pick.result === "loss") s.strongBuyLosses++;
    } else if (pick.recommendation === "Buy") {
      if (pick.result === "win") s.buyWins++;
      else if (pick.result === "loss") s.buyLosses++;
    }

    if (pick.clv != null) {
      s.clvSum += pick.clv;
      s.clvCount++;
    }
  }

  // ── Load model_weights for confidenceMultiplier ───────────────────────────
  const weights = await db.select().from(modelWeightsTable);
  const weightsBySport = new Map(weights.map((w) => [w.sport, w]));

  // ── Build response stats ──────────────────────────────────────────────────
  // Only include sports that have at least one graded pick. Sports that exist
  // solely in model_weights with no real pick history (e.g. off-season NCAAB)
  // are excluded so they cannot surface as "Best sport" on the account screen.
  // The confidenceMultiplier from model_weights is still included for any sport
  // that does have picks, so the prediction engine is unaffected.
  const allSports = new Set([
    ...agg.keys(), // only sports with real graded picks
  ]);

  const stats = [...allSports].map((sport) => {
    const s = agg.get(sport);
    const w = weightsBySport.get(sport);

    const totalDecisive = (s?.wins ?? 0) + (s?.losses ?? 0);
    const accuracyRate =
      totalDecisive > 0
        ? (s!.wins / totalDecisive)
        : (w?.accuracyRate ?? 0);

    const sbTotal = (s?.strongBuyWins ?? 0) + (s?.strongBuyLosses ?? 0);
    const strongBuyAccuracy =
      sbTotal > 0
        ? (s!.strongBuyWins / sbTotal)
        : (w?.strongBuyAccuracy ?? 0.5);

    const buyTotal = (s?.buyWins ?? 0) + (s?.buyLosses ?? 0);
    const buyAccuracy =
      buyTotal > 0
        ? (s!.buyWins / buyTotal)
        : (w?.buyAccuracy ?? 0.5);

    const avgClv =
      (s?.clvCount ?? 0) > 0 ? s!.clvSum / s!.clvCount : null;

    return {
      sport,
      // Pick-results derived
      accuracyRate,
      totalPredictions: (s?.wins ?? 0) + (s?.losses ?? 0) + (s?.pushes ?? 0),
      correctPredictions: s?.wins ?? 0,
      strongBuyAccuracy,
      buyAccuracy,
      avgClv,
      // EMA-derived (still used by prediction engine)
      confidenceMultiplier: w?.confidenceMultiplier ?? 1.0,
      lastLearnedAt: w?.lastLearnedAt?.toISOString() ?? null,
    };
  });

  // ── Overall totals ────────────────────────────────────────────────────────
  const totalWins = stats.reduce((s, x) => s + x.correctPredictions, 0);
  const totalPredictions = stats.reduce((s, x) => s + x.totalPredictions, 0);
  const overallAccuracy =
    totalPredictions > 0 ? totalWins / totalPredictions : 0;

  res.json({
    stats,
    overallAccuracy,
    totalPredictions,
    dataAsOf: new Date().toISOString(),
  });
});

export default router;
