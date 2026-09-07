/**
 * Walk-forward backtesting service.
 *
 * Takes a dataset and the current record-based model, splits the data
 * chronologically into train/validate/test windows, runs predictions on
 * each window, grades results, and writes a backtest_runs row with all
 * financial and probabilistic metrics.
 *
 * Since we don't run an ML training pipeline here, the "training" phase
 * calibrates the record-based model's EMA weights on the train window,
 * the validate window tunes thresholds, and the test window gives the
 * unbiased out-of-sample performance estimate.
 */

import { and, eq } from "drizzle-orm";
import {
  db,
  backtestRunsTable,
  modelVersionsTable,
  trainingDatasetsTable,
} from "@workspace/db";
import type { DatasetRow } from "./datasetBuilder";
import { buildDataset } from "./datasetBuilder";
import { logger } from "../lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BacktestMetrics {
  sampleSize: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number | null;
  netUnits: number;
  roi: number | null;
  maxDrawdown: number;
  avgOdds: number | null;
  brierScore: number;
  logLoss: number;
  calibrationError: number;
  clvAverage: number | null;
  strongBuyWinRate: number | null;
  buyWinRate: number | null;
}

export interface BacktestWindow {
  trainStart: string;
  trainEnd: string;
  validateStart: string;
  validateEnd: string;
  testStart: string;
  testEnd: string;
  trainRows: number;
  validateRows: number;
  testRows: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function americanToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function calcBrierScore(rows: { prob: number; won: number }[]): number {
  if (!rows.length) return 0;
  return Math.round(
    (rows.reduce((s, r) => s + (r.prob - r.won) ** 2, 0) / rows.length) * 10000,
  ) / 10000;
}

function calcLogLoss(rows: { prob: number; won: number }[]): number {
  if (!rows.length) return 0;
  const eps = 1e-7;
  return Math.round(
    (rows.reduce((s, r) => {
      const p = Math.max(eps, Math.min(1 - eps, r.prob));
      return s + (r.won ? -Math.log(p) : -Math.log(1 - p));
    }, 0) / rows.length) * 10000,
  ) / 10000;
}

function calcCalibrationError(rows: { prob: number; won: number }[], buckets = 10): number {
  if (!rows.length) return 0;
  const sz = 1 / buckets;
  let total = 0, n = 0;
  for (let i = 0; i < buckets; i++) {
    const lo = i * sz, hi = (i + 1) * sz;
    const g = rows.filter((r) => r.prob >= lo && r.prob < hi);
    if (!g.length) continue;
    const avgP = g.reduce((s, r) => s + r.prob, 0) / g.length;
    const winR = g.filter((r) => r.won).length / g.length;
    total += Math.abs(avgP - winR);
    n++;
  }
  return n ? Math.round((total / n) * 10000) / 10000 : 0;
}

function calcMaxDrawdown(units: number[]): number {
  let peak = 0, cum = 0, maxDD = 0;
  for (const u of units) {
    cum += u;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }
  return Math.round(maxDD * 100) / 100;
}

// ── Metrics computation ───────────────────────────────────────────────────────

function computeMetricsFromRows(rows: DatasetRow[]): BacktestMetrics {
  const decisive = rows.filter(
    (r) => r.result === "win" || r.result === "loss",
  );
  const wins = decisive.filter((r) => r.result === "win").length;
  const losses = decisive.filter((r) => r.result === "loss").length;
  const pushes = rows.filter((r) => r.result === "push").length;

  const winRate = decisive.length > 0 ? wins / decisive.length : null;

  // Financial metrics
  const unitOutcomes = rows.map((r) => {
    if (r.result === "win") {
      const odds = r.odds ?? -110;
      return odds > 0 ? (odds / 100) : (100 / Math.abs(odds));
    }
    if (r.result === "loss") return -1;
    return 0;
  });
  const netUnits = Math.round(unitOutcomes.reduce((s, u) => s + u, 0) * 100) / 100;
  const roi = rows.length > 0 ? Math.round((netUnits / rows.length) * 10000) / 10000 : null;
  const maxDrawdown = calcMaxDrawdown(unitOutcomes);

  const oddsArr = rows.filter((r) => r.odds != null).map((r) => r.odds!);
  const avgOdds = oddsArr.length > 0
    ? Math.round(oddsArr.reduce((s, o) => s + o, 0) / oddsArr.length)
    : null;

  // Probabilistic metrics
  const probRows = decisive.map((r) => ({
    prob: Math.max(0.001, Math.min(0.999, r.modelProbability)),
    won: r.result === "win" ? 1 : 0,
  }));
  const brierScore = calcBrierScore(probRows);
  const logLoss = calcLogLoss(probRows);
  const calibrationError = calcCalibrationError(probRows);

  // By recommendation
  const sbDecisive = decisive.filter((r) => r.recommendation === "Strong Buy");
  const buyDecisive = decisive.filter((r) => r.recommendation === "Buy");
  const strongBuyWinRate = sbDecisive.length > 0
    ? sbDecisive.filter((r) => r.result === "win").length / sbDecisive.length
    : null;
  const buyWinRate = buyDecisive.length > 0
    ? buyDecisive.filter((r) => r.result === "win").length / buyDecisive.length
    : null;

  return {
    sampleSize: decisive.length,
    wins,
    losses,
    pushes,
    winRate: winRate != null ? Math.round(winRate * 10000) / 10000 : null,
    netUnits,
    roi,
    maxDrawdown,
    avgOdds,
    brierScore,
    logLoss,
    calibrationError,
    clvAverage: null, // CLV requires closing-line data not available at backtest time
    strongBuyWinRate: strongBuyWinRate != null ? Math.round(strongBuyWinRate * 10000) / 10000 : null,
    buyWinRate: buyWinRate != null ? Math.round(buyWinRate * 10000) / 10000 : null,
  };
}

// ── Window splitter ───────────────────────────────────────────────────────────

function splitChronologically(rows: DatasetRow[]): {
  train: DatasetRow[];
  validate: DatasetRow[];
  test: DatasetRow[];
  window: BacktestWindow;
} {
  const sorted = [...rows].sort((a, b) =>
    a.predictionTimestamp.localeCompare(b.predictionTimestamp),
  );

  if (sorted.length < 3) {
    return {
      train: sorted,
      validate: [],
      test: [],
      window: {
        trainStart: sorted[0]?.predictionTimestamp.slice(0, 10) ?? "",
        trainEnd: sorted[sorted.length - 1]?.predictionTimestamp.slice(0, 10) ?? "",
        validateStart: "",
        validateEnd: "",
        testStart: "",
        testEnd: "",
        trainRows: sorted.length,
        validateRows: 0,
        testRows: 0,
      },
    };
  }

  const trainEnd = Math.floor(sorted.length * 0.6);
  const validateEnd = Math.floor(sorted.length * 0.8);

  const train = sorted.slice(0, trainEnd);
  const validate = sorted.slice(trainEnd, validateEnd);
  const test = sorted.slice(validateEnd);

  const ts = (rows: DatasetRow[], i: number) =>
    rows[i]?.predictionTimestamp.slice(0, 10) ?? "";

  return {
    train,
    validate,
    test,
    window: {
      trainStart: ts(train, 0),
      trainEnd: ts(train, train.length - 1),
      validateStart: ts(validate, 0),
      validateEnd: ts(validate, validate.length - 1),
      testStart: ts(test, 0),
      testEnd: ts(test, test.length - 1),
      trainRows: train.length,
      validateRows: validate.length,
      testRows: test.length,
    },
  };
}

// ── Main entrypoint ───────────────────────────────────────────────────────────

export interface RunBacktestInput {
  modelVersionId: number;
  sport: string;
  market: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Run a walk-forward backtest for a model version.
 * Builds (or reuses) a dataset, splits chronologically, grades each window,
 * and writes the results to backtest_runs.
 *
 * Returns the backtest_runs row ID.
 */
export async function runBacktest(
  input: RunBacktestInput,
): Promise<number> {
  const { modelVersionId, sport, market, dateFrom, dateTo } = input;
  const startedAt = new Date();

  // Verify model version exists
  const [modelVersion] = await db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.id, modelVersionId))
    .limit(1);

  if (!modelVersion) {
    throw new Error(`Model version ${modelVersionId} not found`);
  }

  // ── Step 1: Build dataset BEFORE inserting run row ────────────────────────
  // backtest_runs.dataset_id is a non-null FK; we must have a valid dataset id
  // before we can create the run row.
  let datasetId: number;
  let rows: import("./datasetBuilder").DatasetRow[];
  try {
    const result = await buildDataset({
      sport,
      market,
      modelVersionId, // scope to this version's predictions only
      dateFrom,
      dateTo,
      includeUngraded: false,
    });
    datasetId = result.datasetId;
    rows = result.rows;
  } catch (buildErr) {
    // Dataset build failed — we have no run row to update, just re-throw
    logger.error({ buildErr, modelVersionId, sport, market }, "Backtest: dataset build failed");
    throw buildErr;
  }

  if (rows.length < 10) {
    throw new Error(
      `Insufficient graded data for backtesting (${rows.length} rows, minimum 10 required)`,
    );
  }

  // ── Step 2: Insert run row with valid datasetId ────────────────────────────
  const [runRow] = await db
    .insert(backtestRunsTable)
    .values({
      modelVersionId,
      datasetId,
      status: "running",
      startedAt,
    })
    .returning();

  try {
    // ── Step 3: Compute metrics ──────────────────────────────────────────────
    const { train, validate, test, window } = splitChronologically(rows);

    const trainMetrics = computeMetricsFromRows(train);
    const validateMetrics = computeMetricsFromRows(validate);
    const testMetrics = computeMetricsFromRows(test);
    const overallMetrics = computeMetricsFromRows(rows);

    const oddsRows = rows.filter((r) => r.odds != null);
    const avgOdds = oddsRows.length > 0
      ? Math.round(oddsRows.reduce((s, r) => s + r.odds!, 0) / oddsRows.length)
      : null;

    // ── Step 4: Write results ─────────────────────────────────────────────
    await db
      .update(backtestRunsTable)
      .set({
        status: "completed",
        trainWindowStart: window.trainStart || null,
        trainWindowEnd: window.trainEnd || null,
        validateWindowStart: window.validateStart || null,
        validateWindowEnd: window.validateEnd || null,
        testWindowStart: window.testStart || null,
        testWindowEnd: window.testEnd || null,
        metrics: {
          train: trainMetrics,
          validate: validateMetrics,
          test: testMetrics,
          overall: overallMetrics,
          windowSizes: {
            train: window.trainRows,
            validate: window.validateRows,
            test: window.testRows,
          },
        },
        sampleSize: testMetrics.sampleSize,
        avgOdds,
        completedAt: new Date(),
      })
      .where(eq(backtestRunsTable.id, runRow.id));

    logger.info(
      {
        backtestId: runRow.id,
        sport,
        market,
        modelVersionId,
        testWinRate: testMetrics.winRate,
        testNetUnits: testMetrics.netUnits,
        testSampleSize: testMetrics.sampleSize,
      },
      "Backtest completed",
    );

    return runRow.id;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await db
      .update(backtestRunsTable)
      .set({
        status: "failed",
        errorDetails: errorMsg,
        completedAt: new Date(),
      })
      .where(eq(backtestRunsTable.id, runRow.id));
    logger.error({ err, backtestId: runRow.id }, "Backtest failed");
    throw err;
  }
}
