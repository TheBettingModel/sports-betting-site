/**
 * Analytics computation service.
 *
 * Computes the 14 core performance metrics for arbitrary dimension slices and
 * stores pre-aggregated rows in `performance_metrics`. Rows are replaced on
 * each run (delete-then-insert per model version + period, inside a
 * transaction) so the table always reflects the latest graded data.
 *
 * Financial metrics: record, units, ROI, max drawdown, avg odds.
 * Probabilistic metrics: win rate, CLV, Brier score, log loss,
 *                        calibration error, accuracy.
 */

import { and, eq, sql } from "drizzle-orm";
import {
  db,
  gamesTable,
  modelPredictionsTable,
  modelVersionsTable,
  performanceMetricsTable,
  pickResultsTable,
  publishedPicksTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { refreshMoneylineApprovalDecisions } from "./marketApproval";
import { officialPublicRecordSqlConditions } from "./officialRecordPolicy";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawPick {
  modelVersionId: number;
  sport: string;
  market: string;
  recommendation: string;
  confidence: string;
  odds: number | null;
  isPlayOfDay: boolean;
  result: string;
  unitsRisked: number;
  unitsWonLost: number;
  clv: number | null;
  modelProbability: number;
  edge: number;
  // sorted by graded_at for drawdown calculation
  gradedAt: Date | null;
}

export function gradedEvidencePeriod(
  picks: readonly { gradedAt: Date | null }[],
  fallback = new Date(),
): { periodStart: string; periodEnd: string } {
  const gradedDates = picks
    .flatMap((pick) => pick.gradedAt ? [pick.gradedAt.toISOString().split("T")[0]!] : [])
    .sort();
  const fallbackDate = fallback.toISOString().split("T")[0]!;
  return {
    periodStart: gradedDates[0] ?? fallbackDate,
    periodEnd: gradedDates.at(-1) ?? fallbackDate,
  };
}

interface MetricSlice {
  sport: string | null;
  league?: string | null;
  market: string | null;
  recommendation: string | null;
  confidence: string | null;
  oddsBucket: string | null;
  edgeBucket: string | null;
  isPlayOfDay: boolean | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function oddsToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function oddsBucketOf(odds: number | null): string {
  if (odds == null) return "unknown";
  if (odds <= -300) return "-300+";
  if (odds <= -200) return "-299 to -200";
  if (odds <= -150) return "-199 to -150";
  if (odds <= -110) return "-149 to -110";
  if (odds < 0) return "-109 to -101";
  if (odds <= 110) return "+100 to +110";
  if (odds <= 150) return "+111 to +150";
  if (odds <= 200) return "+151 to +200";
  return "+201+";
}

function edgeBucketOf(edge: number): string {
  const abs = Math.abs(edge);
  if (abs < 2) return "0–2%";
  if (abs < 5) return "2–5%";
  if (abs < 10) return "5–10%";
  return "10%+";
}

function computeMaxDrawdown(sortedUnits: number[]): number {
  let peak = 0;
  let cumulative = 0;
  let maxDD = 0;
  for (const u of sortedUnits) {
    cumulative += u;
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > maxDD) maxDD = dd;
  }
  return Math.round(maxDD * 100) / 100;
}

function computeBrierScore(
  picks: { prob: number; won: number }[],
): number {
  if (picks.length === 0) return 0;
  const sum = picks.reduce((acc, p) => acc + (p.prob - p.won) ** 2, 0);
  return Math.round((sum / picks.length) * 10000) / 10000;
}

function computeLogLoss(picks: { prob: number; won: number }[]): number {
  if (picks.length === 0) return 0;
  const eps = 1e-7;
  const sum = picks.reduce((acc, p) => {
    const prob = Math.max(eps, Math.min(1 - eps, p.prob));
    return acc + (p.won === 1 ? -Math.log(prob) : -Math.log(1 - prob));
  }, 0);
  return Math.round((sum / picks.length) * 10000) / 10000;
}

function computeCalibrationError(
  picks: { prob: number; won: number }[],
  buckets = 10,
): number {
  if (picks.length === 0) return 0;
  const bucketSize = 1 / buckets;
  let totalError = 0;
  let bucketCount = 0;

  for (let i = 0; i < buckets; i++) {
    const lo = i * bucketSize;
    const hi = (i + 1) * bucketSize;
    const group = picks.filter((p) => p.prob >= lo && p.prob < hi);
    if (group.length === 0) continue;
    const avgProb = group.reduce((s, p) => s + p.prob, 0) / group.length;
    const actualWinRate = group.filter((p) => p.won === 1).length / group.length;
    totalError += Math.abs(avgProb - actualWinRate);
    bucketCount++;
  }

  return bucketCount > 0
    ? Math.round((totalError / bucketCount) * 10000) / 10000
    : 0;
}

// ── Core aggregation ──────────────────────────────────────────────────────────

function aggregateMetrics(
  picks: RawPick[],
  modelVersionId: number,
  slice: MetricSlice,
  periodStart: string,
  periodEnd: string,
) {
  const decisive = picks.filter((p) =>
    p.result === "win" || p.result === "loss",
  );
  const wins = picks.filter((p) => p.result === "win").length;
  const losses = picks.filter((p) => p.result === "loss").length;
  const pushes = picks.filter((p) => p.result === "push").length;
  const voids = picks.filter((p) => p.result === "void").length;
  const total = picks.length;
  const sample = decisive.length;

  if (total === 0) return null;

  const unitsWon = picks
    .filter((p) => p.unitsWonLost > 0)
    .reduce((s, p) => s + p.unitsWonLost, 0);
  const unitsLost = picks
    .filter((p) => p.unitsWonLost < 0)
    .reduce((s, p) => s + Math.abs(p.unitsWonLost), 0);
  const netUnits =
    Math.round(picks.reduce((s, p) => s + p.unitsWonLost, 0) * 100) / 100;
  const totalRisked = picks.reduce((s, p) => s + p.unitsRisked, 0);
  const roi = totalRisked > 0 ? netUnits / totalRisked : null;

  const oddsArr = picks
    .filter((p) => p.odds != null)
    .map((p) => p.odds!);
  const avgOdds =
    oddsArr.length > 0
      ? Math.round(oddsArr.reduce((s, o) => s + o, 0) / oddsArr.length)
      : null;

  // Sort picks by gradedAt for drawdown calculation
  const sortedUnits = [...picks]
    .sort((a, b) => (a.gradedAt?.getTime() ?? 0) - (b.gradedAt?.getTime() ?? 0))
    .map((p) => p.unitsWonLost);
  const maxDrawdown = computeMaxDrawdown(sortedUnits);

  const winRate = sample > 0 ? wins / sample : null;

  const clvPicks = picks.filter((p) => p.clv != null);
  const clvAverage =
    clvPicks.length > 0
      ? Math.round(
          (clvPicks.reduce((s, p) => s + p.clv!, 0) / clvPicks.length) * 100,
        ) / 100
      : null;
  const posClvRate =
    clvPicks.length > 0
      ? clvPicks.filter((p) => p.clv! > 0).length / clvPicks.length
      : null;

  const probPicks = decisive.map((p) => ({
    prob: Math.max(0.001, Math.min(0.999, p.modelProbability)),
    won: p.result === "win" ? 1 : 0,
  }));
  const brierScore = computeBrierScore(probPicks);
  const logLoss = computeLogLoss(probPicks);
  const calibrationError = computeCalibrationError(probPicks);
  const accuracy = sample > 0 ? wins / sample : null;

  const now = new Date();
  return {
    modelVersionId,
    computedAt: now,
    periodStart,
    periodEnd,
    sport: slice.sport ?? null,
    market: slice.market ?? null,
    recommendation: slice.recommendation ?? null,
    confidenceBucket: slice.confidence ?? null,
    oddsBucket: slice.oddsBucket ?? null,
    edgeBucket: slice.edgeBucket ?? null,
    isPlayOfDay: slice.isPlayOfDay ?? null,
    wins,
    losses,
    pushes,
    voids,
    totalPicks: total,
    sampleSize: sample,
    unitsWon: Math.round(unitsWon * 100) / 100,
    unitsLost: Math.round(unitsLost * 100) / 100,
    netUnits,
    roi: roi != null ? Math.round(roi * 10000) / 10000 : null,
    maxDrawdown,
    avgOdds,
    winRate: winRate != null ? Math.round(winRate * 10000) / 10000 : null,
    clvAverage,
    posClvRate:
      posClvRate != null ? Math.round(posClvRate * 10000) / 10000 : null,
    brierScore,
    logLoss,
    accuracy: accuracy != null ? Math.round(accuracy * 10000) / 10000 : null,
    calibrationError,
    createdAt: now,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Load all graded picks and compute metrics for every meaningful dimension
 * slice. Replaces existing performance_metrics rows for each model version.
 */
export async function runAnalytics(): Promise<number> {
  // ── 1. Load all graded picks with probabilities ───────────────────────────
  const rows = await db
    .select({
      modelVersionId: modelPredictionsTable.modelVersionId,
      sport: publishedPicksTable.sport,
      market: publishedPicksTable.market,
      recommendation: publishedPicksTable.recommendation,
      confidence: publishedPicksTable.confidence,
      odds: publishedPicksTable.odds,
      isPlayOfDay: publishedPicksTable.isPlayOfDay,
      result: pickResultsTable.result,
      unitsRisked: pickResultsTable.unitsRisked,
      unitsWonLost: pickResultsTable.unitsWonLost,
      clv: pickResultsTable.clv,
      gradedAt: pickResultsTable.gradedAt,
      modelProbability: modelPredictionsTable.modelProbability,
      edge: modelPredictionsTable.edge,
    })
    .from(pickResultsTable)
    .innerJoin(
      publishedPicksTable,
      eq(pickResultsTable.pickId, publishedPicksTable.id),
    )
    .innerJoin(
      modelPredictionsTable,
      eq(publishedPicksTable.predictionId, modelPredictionsTable.id),
    )
    .innerJoin(
      modelVersionsTable,
      eq(modelPredictionsTable.modelVersionId, modelVersionsTable.id),
    )
    .innerJoin(gamesTable, eq(publishedPicksTable.gameId, gamesTable.id))
    .where(
      and(
        ...officialPublicRecordSqlConditions(`${new Date().getFullYear()}-09-11`),
      ),
    );

  if (rows.length === 0) {
    const approvalDecisions = await refreshMoneylineApprovalDecisions();
    logger.info(
      { approvalDecisions },
      "Analytics: lifecycle sweep completed without new graded rows",
    );
    return 0;
  }

  // ── 2. Group by model version ─────────────────────────────────────────────
  const byVersion = new Map<number, RawPick[]>();
  for (const r of rows) {
    if (!byVersion.has(r.modelVersionId))
      byVersion.set(r.modelVersionId, []);
    byVersion.get(r.modelVersionId)!.push(r as RawPick);
  }

  // ── 3. For each version, compute dimension slices ─────────────────────────
  const toInsert: (ReturnType<typeof aggregateMetrics> & object)[] = [];

  for (const [modelVersionId, picks] of byVersion) {
    const { periodStart, periodEnd } = gradedEvidencePeriod(picks);
    const emit = (slice: MetricSlice, subset: RawPick[]) => {
      const row = aggregateMetrics(
        subset,
        modelVersionId,
        slice,
        periodStart,
        periodEnd,
      );
      if (row) toInsert.push(row);
    };

    // Overall
    emit({ sport: null, market: null, recommendation: null, confidence: null, oddsBucket: null, edgeBucket: null, isPlayOfDay: null }, picks);

    // By sport
    const sports = [...new Set(picks.map((p) => p.sport))];
    for (const sport of sports) {
      const sub = picks.filter((p) => p.sport === sport);
      emit({ sport, market: null, recommendation: null, confidence: null, oddsBucket: null, edgeBucket: null, isPlayOfDay: null }, sub);

      // Sport × recommendation
      const recs = [...new Set(sub.map((p) => p.recommendation))];
      for (const rec of recs) {
        emit({ sport, market: null, recommendation: rec, confidence: null, oddsBucket: null, edgeBucket: null, isPlayOfDay: null }, sub.filter((p) => p.recommendation === rec));
      }
    }

    // By market
    const markets = [...new Set(picks.map((p) => p.market))];
    for (const market of markets) {
      emit({ sport: null, market, recommendation: null, confidence: null, oddsBucket: null, edgeBucket: null, isPlayOfDay: null }, picks.filter((p) => p.market === market));
    }

    // By recommendation
    const recs = [...new Set(picks.map((p) => p.recommendation))];
    for (const rec of recs) {
      emit({ sport: null, market: null, recommendation: rec, confidence: null, oddsBucket: null, edgeBucket: null, isPlayOfDay: null }, picks.filter((p) => p.recommendation === rec));
    }

    // By confidence bucket
    for (const conf of ["High", "Medium", "Low"]) {
      const sub = picks.filter((p) => p.confidence === conf);
      if (sub.length > 0) emit({ sport: null, market: null, recommendation: null, confidence: conf, oddsBucket: null, edgeBucket: null, isPlayOfDay: null }, sub);
    }

    // By odds bucket
    const oddsBuckets = [...new Set(picks.map((p) => oddsBucketOf(p.odds)))];
    for (const ob of oddsBuckets) {
      const sub = picks.filter((p) => oddsBucketOf(p.odds) === ob);
      emit({ sport: null, market: null, recommendation: null, confidence: null, oddsBucket: ob, edgeBucket: null, isPlayOfDay: null }, sub);
    }

    // By edge bucket
    const edgeBuckets = [...new Set(picks.map((p) => edgeBucketOf(p.edge)))];
    for (const eb of edgeBuckets) {
      const sub = picks.filter((p) => edgeBucketOf(p.edge) === eb);
      emit({ sport: null, market: null, recommendation: null, confidence: null, oddsBucket: null, edgeBucket: eb, isPlayOfDay: null }, sub);
    }

    // By isPlayOfDay
    for (const pod of [true, false]) {
      const sub = picks.filter((p) => p.isPlayOfDay === pod);
      if (sub.length > 0)
        emit({ sport: null, market: null, recommendation: null, confidence: null, oddsBucket: null, edgeBucket: null, isPlayOfDay: pod }, sub);
    }
  }

  if (toInsert.length === 0) return 0;

  // ── 4. Replace existing rows (delete + insert per version) ─────────────────
  const affectedVersionIds = [...byVersion.keys()];

  await db.transaction(async (tx) => {
    for (const vid of affectedVersionIds) {
      await tx
        .delete(performanceMetricsTable)
        .where(eq(performanceMetricsTable.modelVersionId, vid));
    }
    // Insert in batches of 100
    for (let i = 0; i < toInsert.length; i += 100) {
      await tx
        .insert(performanceMetricsTable)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .values(toInsert.slice(i, i + 100) as any);
    }
  });

  logger.info(
    { versions: affectedVersionIds.length, rows: toInsert.length },
    "Analytics: metrics computed and stored",
  );
  const approvalDecisions = await refreshMoneylineApprovalDecisions();
  logger.info(
    { approvalDecisions, modelVersionIds: affectedVersionIds },
    "Analytics: automatic moneyline approval evaluations recorded",
  );
  return toInsert.length;
}

/**
 * Query pre-computed performance metrics with optional filters.
 * Filters are AND-combined; omitting a filter means "all values".
 */
export async function queryMetrics(filters: {
  modelVersionId?: number;
  sport?: string;
  market?: string;
  recommendation?: string;
  confidence?: string;
  oddsBucket?: string;
  edgeBucket?: string;
  isPlayOfDay?: boolean;
}) {
  const conditions = [];

  if (filters.modelVersionId != null)
    conditions.push(eq(performanceMetricsTable.modelVersionId, filters.modelVersionId));
  if (filters.sport !== undefined)
    conditions.push(
      filters.sport === "" || filters.sport === null
        ? sql`${performanceMetricsTable.sport} IS NULL`
        : eq(performanceMetricsTable.sport, filters.sport),
    );
  if (filters.market !== undefined)
    conditions.push(eq(performanceMetricsTable.market, filters.market));
  if (filters.recommendation !== undefined)
    conditions.push(eq(performanceMetricsTable.recommendation, filters.recommendation));
  if (filters.confidence !== undefined)
    conditions.push(eq(performanceMetricsTable.confidenceBucket, filters.confidence));
  if (filters.oddsBucket !== undefined)
    conditions.push(eq(performanceMetricsTable.oddsBucket, filters.oddsBucket));
  if (filters.edgeBucket !== undefined)
    conditions.push(eq(performanceMetricsTable.edgeBucket, filters.edgeBucket));
  if (filters.isPlayOfDay !== undefined)
    conditions.push(eq(performanceMetricsTable.isPlayOfDay, filters.isPlayOfDay));

  return db
    .select()
    .from(performanceMetricsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(performanceMetricsTable.computedAt);
}
