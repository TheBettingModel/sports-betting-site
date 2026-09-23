import { Router, type IRouter } from "express";
import { eq, isNotNull, and, gte, sql } from "drizzle-orm";
import {
  db,
  gamesTable,
  modelPredictionsTable,
  modelVersionsTable,
  modelWeightsTable,
  pickResultsTable,
  publishedPicksTable,
} from "@workspace/db";
import { runLearning } from "../services/learning";
import { officialPublicRecordSqlConditions } from "../services/officialRecordPolicy";

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
    .innerJoin(gamesTable, eq(publishedPicksTable.gameId, gamesTable.id))
    .innerJoin(
      modelPredictionsTable,
      eq(publishedPicksTable.predictionId, modelPredictionsTable.id),
    )
    .innerJoin(
      modelVersionsTable,
      eq(modelPredictionsTable.modelVersionId, modelVersionsTable.id),
    )
    .where(
      and(...officialPublicRecordSqlConditions(`${new Date().getFullYear()}-09-11`)),
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
      // EMA-derived calibration quality (lower Brier = better)
      brierScore: w?.brierScore ?? 0.25,
      // Per-tier accuracy (Elite / Strong / Playable)
      eliteAccuracy: w?.eliteAccuracy ?? null,
      strongAccuracy: w?.strongAccuracy ?? null,
      playableAccuracy: w?.playableAccuracy ?? null,
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

/**
 * GET /api/model-stats/history
 *
 * Returns per-sport weekly win/loss/push totals for the last 8 weeks.
 * Includes an "ALL" aggregation across all sports.
 * Only graded picks (result IS NOT NULL and not 'pending') are included.
 */
router.get("/model-stats/history", async (_req, res): Promise<void> => {
  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);

  // Raw graded picks in the last 8 weeks
  const rows = await db
    .select({
      sport: publishedPicksTable.sport,
      result: pickResultsTable.result,
      unitsWonLost: pickResultsTable.unitsWonLost,
      // Truncate gradedAt to week (ISO week start = Monday)
      week: sql<string>`to_char(date_trunc('week', ${pickResultsTable.gradedAt}), 'YYYY-MM-DD')`,
    })
    .from(pickResultsTable)
    .innerJoin(
      publishedPicksTable,
      eq(pickResultsTable.pickId, publishedPicksTable.id),
    )
    .innerJoin(gamesTable, eq(publishedPicksTable.gameId, gamesTable.id))
    .innerJoin(
      modelPredictionsTable,
      eq(publishedPicksTable.predictionId, modelPredictionsTable.id),
    )
    .innerJoin(
      modelVersionsTable,
      eq(modelPredictionsTable.modelVersionId, modelVersionsTable.id),
    )
    .where(
      and(
        isNotNull(pickResultsTable.gradedAt),
        isNotNull(pickResultsTable.result),
        ...officialPublicRecordSqlConditions(`${new Date().getFullYear()}-09-11`),
        gte(pickResultsTable.gradedAt, eightWeeksAgo),
      ),
    );

  // Aggregate by sport + week
  interface WeekAgg {
    wins: number;
    losses: number;
    pushes: number;
    unitsWon: number;
  }

  // key: "sport::week"
  const aggMap = new Map<string, WeekAgg>();
  const weeks = new Set<string>();
  const sports = new Set<string>();

  for (const row of rows) {
    if (!row.week) continue;
    weeks.add(row.week);
    sports.add(row.sport);

    for (const sportKey of [row.sport, "ALL"]) {
      const key = `${sportKey}::${row.week}`;
      if (!aggMap.has(key)) {
        aggMap.set(key, { wins: 0, losses: 0, pushes: 0, unitsWon: 0 });
      }
      const agg = aggMap.get(key)!;
      if (row.result === "win") agg.wins++;
      else if (row.result === "loss") agg.losses++;
      else if (row.result === "push") agg.pushes++;
      agg.unitsWon += row.unitsWonLost ?? 0;
    }
  }

  // Build response array
  const history: Array<{
    week: string;
    sport: string;
    wins: number;
    losses: number;
    pushes: number;
    unitsWon: number;
    totalPicks: number;
  }> = [];

  const allSports = [...sports, "ALL"];

  for (const week of [...weeks].sort()) {
    for (const sport of allSports) {
      const key = `${sport}::${week}`;
      const agg = aggMap.get(key);
      if (!agg) continue;
      history.push({
        week,
        sport,
        wins: agg.wins,
        losses: agg.losses,
        pushes: agg.pushes,
        unitsWon: Math.round(agg.unitsWon * 100) / 100,
        totalPicks: agg.wins + agg.losses + agg.pushes,
      });
    }
  }

  res.json({ history });
});

export default router;
