/**
 * Calibration service.
 *
 * Bins model_predictions by probability bucket and calculates actual win rates
 * to assess how well the model's stated confidence matches reality.
 *
 * Calibration data is computed on-demand (no pre-storage needed — the dataset
 * is small enough to compute in <100ms for any realistic model version).
 */

import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  modelPredictionsTable,
  pickResultsTable,
  publishedPicksTable,
} from "@workspace/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalibrationBucket {
  /** Lower bound of this probability bucket (inclusive), e.g. 0.5 */
  lo: number;
  /** Upper bound (exclusive), e.g. 0.6 */
  hi: number;
  /** Label for display, e.g. "50–60%" */
  label: string;
  /** Number of picks in this bucket */
  count: number;
  /** Average predicted probability inside this bucket */
  avgPredicted: number;
  /** Actual win rate inside this bucket */
  actualWinRate: number;
  /** Absolute calibration error for this bucket */
  error: number;
}

export interface CalibrationResult {
  modelVersionId: number;
  sport: string | null;
  market: string | null;
  sampleSize: number;
  buckets: CalibrationBucket[];
  /** Mean Brier score across all decisive picks */
  brierScore: number;
  /** Mean log loss across all decisive picks */
  logLoss: number;
  /** Mean absolute calibration error across non-empty buckets */
  meanCalibrationError: number;
  computedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function brierScore(picks: { prob: number; won: number }[]): number {
  if (picks.length === 0) return 0;
  const sum = picks.reduce((acc, p) => acc + (p.prob - p.won) ** 2, 0);
  return Math.round((sum / picks.length) * 10000) / 10000;
}

function logLoss(picks: { prob: number; won: number }[]): number {
  if (picks.length === 0) return 0;
  const eps = 1e-7;
  const sum = picks.reduce((acc, p) => {
    const prob = Math.max(eps, Math.min(1 - eps, p.prob));
    return acc + (p.won === 1 ? -Math.log(prob) : -Math.log(1 - prob));
  }, 0);
  return Math.round((sum / picks.length) * 10000) / 10000;
}

const BUCKET_COUNT = 10;

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Compute calibration curves for a model version, optionally filtered by
 * sport and market. Returns bucket data ready for charting.
 */
export async function computeCalibration(
  modelVersionId: number,
  sport?: string,
  market?: string,
): Promise<CalibrationResult> {
  const conditions = [
    eq(modelPredictionsTable.modelVersionId, modelVersionId),
    inArray(pickResultsTable.result, ["win", "loss"]), // decisive only
  ];

  if (sport) conditions.push(eq(modelPredictionsTable.sport, sport));
  if (market) conditions.push(eq(modelPredictionsTable.market, market));

  const rows = await db
    .select({
      modelProbability: modelPredictionsTable.modelProbability,
      result: pickResultsTable.result,
    })
    .from(modelPredictionsTable)
    .innerJoin(
      publishedPicksTable,
      eq(publishedPicksTable.predictionId, modelPredictionsTable.id),
    )
    .innerJoin(
      pickResultsTable,
      eq(pickResultsTable.pickId, publishedPicksTable.id),
    )
    .where(and(...conditions));

  const probPicks = rows.map((r) => ({
    prob: Math.max(0.001, Math.min(0.999, r.modelProbability)),
    won: r.result === "win" ? 1 : 0,
  }));

  // Build probability buckets
  const buckets: CalibrationBucket[] = [];
  for (let i = 0; i < BUCKET_COUNT; i++) {
    const lo = i / BUCKET_COUNT;
    const hi = (i + 1) / BUCKET_COUNT;
    const label = `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`;

    const group = probPicks.filter(
      (p) => p.prob >= lo && (i === BUCKET_COUNT - 1 ? p.prob <= hi : p.prob < hi),
    );

    if (group.length === 0) {
      buckets.push({ lo, hi, label, count: 0, avgPredicted: (lo + hi) / 2, actualWinRate: 0, error: 0 });
      continue;
    }

    const avgPredicted =
      group.reduce((s, p) => s + p.prob, 0) / group.length;
    const actualWinRate = group.filter((p) => p.won === 1).length / group.length;
    const error = Math.abs(avgPredicted - actualWinRate);

    buckets.push({
      lo,
      hi,
      label,
      count: group.length,
      avgPredicted: Math.round(avgPredicted * 10000) / 10000,
      actualWinRate: Math.round(actualWinRate * 10000) / 10000,
      error: Math.round(error * 10000) / 10000,
    });
  }

  const nonEmpty = buckets.filter((b) => b.count > 0);
  const meanCalibrationError =
    nonEmpty.length > 0
      ? Math.round(
          (nonEmpty.reduce((s, b) => s + b.error, 0) / nonEmpty.length) * 10000,
        ) / 10000
      : 0;

  return {
    modelVersionId,
    sport: sport ?? null,
    market: market ?? null,
    sampleSize: probPicks.length,
    buckets,
    brierScore: brierScore(probPicks),
    logLoss: logLoss(probPicks),
    meanCalibrationError,
    computedAt: new Date().toISOString(),
  };
}
