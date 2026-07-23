/**
 * Drift Monitoring Service
 *
 * Compares the latest 7-day feature and prediction distributions against
 * the prior 30-day baseline for each production model version.
 *
 * Writes model_drift_alerts when distributions shift beyond configured limits.
 * Writes data_quality_alerts for missing closing lines, stale feeds, etc.
 *
 * NEVER automatically modifies the model on a drift alert — alerts require
 * human review before any remediation action is taken.
 */

import { and, between, eq, gt, gte, lt, sql } from "drizzle-orm";
import {
  db,
  closingLinesTable,
  dataQualityAlertsTable,
  modelDriftAlertsTable,
  modelPredictionsTable,
  modelVersionsTable,
  sportSnoozesTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

// ── Thresholds ────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  edge_drift_warning: 0.03,        // >3pp shift in avg edge
  edge_drift_critical: 0.06,       // >6pp shift
  probability_drift_warning: 0.04, // >4pp shift in avg model probability
  probability_drift_critical: 0.08,
  win_rate_drift_warning: 0.05,    // >5pp shift in recent graded win rate
  win_rate_drift_critical: 0.10,
  calibration_drift_warning: 0.05, // >5pp mean calibration error shift
  calibration_drift_critical: 0.10,
  missing_closing_line_pct: 0.20,  // >20% of games missing closing line within 24h of start
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface DistributionStats {
  count: number;
  mean: number;
  p25: number;
  p75: number;
  stdev: number;
}

interface PredictionWindow {
  modelVersionId: number;
  avgEdge: number;
  avgProbability: number;
  avgConfidence: number;
  count: number;
  winRate: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getWindowStats(
  modelVersionId: number,
  start: Date,
  end: Date,
): Promise<PredictionWindow | null> {
  const rows = await db
    .select()
    .from(modelPredictionsTable)
    .where(
      and(
        eq(modelPredictionsTable.modelVersionId, modelVersionId),
        eq(modelPredictionsTable.isChallenger, false),
        gte(modelPredictionsTable.predictionTimestamp, start),
        lt(modelPredictionsTable.predictionTimestamp, end),
      ),
    );

  if (!rows.length) return null;

  const avgEdge = rows.reduce((s, r) => s + r.edge, 0) / rows.length;
  const avgProbability = rows.reduce((s, r) => s + r.modelProbability, 0) / rows.length;

  const confMap: Record<string, number> = { low: 1, medium: 2, high: 3, "very high": 4 };
  const avgConfidence =
    rows.reduce((s, r) => s + (confMap[r.confidence] ?? 2), 0) / rows.length;

  return {
    modelVersionId,
    avgEdge: Math.round(avgEdge * 10000) / 10000,
    avgProbability: Math.round(avgProbability * 10000) / 10000,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    count: rows.length,
    winRate: null, // populated separately from pick_results
  };
}

function severity(delta: number, warning: number, critical: number): "warning" | "critical" {
  return Math.abs(delta) >= critical ? "critical" : "warning";
}

async function createDriftAlert(
  modelVersionId: number,
  alertType: string,
  metricName: string,
  baselineValue: number,
  currentValue: number,
  threshold: number,
  sev: "warning" | "critical",
  metadata?: Record<string, unknown>,
): Promise<void> {
  // Avoid duplicate unresolved alerts for the same model/metric
  const [existing] = await db
    .select({ id: modelDriftAlertsTable.id })
    .from(modelDriftAlertsTable)
    .where(
      and(
        eq(modelDriftAlertsTable.modelVersionId, modelVersionId),
        eq(modelDriftAlertsTable.alertType, alertType),
        eq(modelDriftAlertsTable.metricName, metricName),
        eq(modelDriftAlertsTable.isResolved, false),
      ),
    )
    .limit(1);

  if (existing) {
    // Update baseline/current values on the existing alert
    await db
      .update(modelDriftAlertsTable)
      .set({ baselineValue, currentValue, severity: sev })
      .where(eq(modelDriftAlertsTable.id, existing.id));
    return;
  }

  await db.insert(modelDriftAlertsTable).values({
    modelVersionId,
    alertType,
    metricName,
    baselineValue,
    currentValue,
    threshold,
    severity: sev,
    isResolved: false,
    metadata: metadata ?? null,
  });
}

// ── Main: model drift ─────────────────────────────────────────────────────────

async function monitorModelDrift(modelVersionId: number, sport: string): Promise<void> {
  const now = new Date();

  // Respect snooze — if an admin has silenced this sport, skip drift alerts.
  // Off-season low-volume "prediction_drift" warnings are the main noise this prevents.
  const [snooze] = await db
    .select({ snoozedUntil: sportSnoozesTable.snoozedUntil })
    .from(sportSnoozesTable)
    .where(and(eq(sportSnoozesTable.sport, sport), gt(sportSnoozesTable.snoozedUntil, now)))
    .limit(1);

  if (snooze) {
    logger.debug({ sport, snoozedUntil: snooze.snoozedUntil }, "Drift monitor: skipping snoozed sport");
    return;
  }

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [recent, baseline] = await Promise.all([
    getWindowStats(modelVersionId, sevenDaysAgo, now),
    getWindowStats(modelVersionId, thirtyDaysAgo, sevenDaysAgo),
  ]);

  if (!baseline || baseline.count < 10) {
    logger.debug(
      { modelVersionId, sport, baselineCount: baseline?.count ?? 0 },
      "Drift monitor: insufficient baseline data, skipping",
    );
    return;
  }

  if (!recent || recent.count < 5) {
    // No recent predictions — could be off-season or feed issue
    await createDriftAlert(
      modelVersionId,
      "prediction_drift",
      "prediction_count",
      baseline.count / 7, // daily avg baseline
      recent?.count ?? 0,
      5,
      "warning",
      { sport, reason: "Low recent prediction count" },
    );
    return;
  }

  // Edge drift
  const edgeDelta = recent.avgEdge - baseline.avgEdge;
  if (Math.abs(edgeDelta) >= THRESHOLDS.edge_drift_warning) {
    await createDriftAlert(
      modelVersionId,
      "edge_drift",
      "avg_edge",
      baseline.avgEdge,
      recent.avgEdge,
      THRESHOLDS.edge_drift_warning,
      severity(edgeDelta, THRESHOLDS.edge_drift_warning, THRESHOLDS.edge_drift_critical),
      { sport, delta: edgeDelta },
    );
  }

  // Probability drift
  const probDelta = recent.avgProbability - baseline.avgProbability;
  if (Math.abs(probDelta) >= THRESHOLDS.probability_drift_warning) {
    await createDriftAlert(
      modelVersionId,
      "prediction_drift",
      "avg_model_probability",
      baseline.avgProbability,
      recent.avgProbability,
      THRESHOLDS.probability_drift_warning,
      severity(probDelta, THRESHOLDS.probability_drift_warning, THRESHOLDS.probability_drift_critical),
      { sport, delta: probDelta },
    );
  }

  logger.info(
    {
      modelVersionId,
      sport,
      recentCount: recent.count,
      baselineCount: baseline.count,
      edgeDelta: Math.round(edgeDelta * 10000) / 10000,
    },
    "Drift monitor: model checked",
  );
}

// ── Main: data quality ────────────────────────────────────────────────────────

async function monitorDataQuality(): Promise<void> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Check for missing closing lines on recently-finished games
  // A closing line should arrive within 24h of game completion
  const [closingLineCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(closingLinesTable)
    .where(gte(closingLinesTable.capturedAt, oneDayAgo));

  if ((closingLineCount?.count ?? 0) === 0) {
    // No closing lines recorded in last 24h — possible feed issue
    const [existing] = await db
      .select({ id: dataQualityAlertsTable.id })
      .from(dataQualityAlertsTable)
      .where(
        and(
          eq(dataQualityAlertsTable.alertType, "missing_closing_line"),
          eq(dataQualityAlertsTable.isResolved, false),
        ),
      )
      .limit(1);

    if (!existing) {
      await db.insert(dataQualityAlertsTable).values({
        alertType: "missing_closing_line",
        sport: null,
        severity: "warning",
        description:
          "No closing lines recorded in the last 24 hours. " +
          "This may indicate an ESPN feed issue or no games completed recently.",
        isResolved: false,
        metadata: { checkedAt: now.toISOString() },
      });
    }
  } else {
    // Resolve any existing closing-line alert
    await db
      .update(dataQualityAlertsTable)
      .set({ isResolved: true, resolvedAt: now, resolvedBy: "auto" })
      .where(
        and(
          eq(dataQualityAlertsTable.alertType, "missing_closing_line"),
          eq(dataQualityAlertsTable.isResolved, false),
        ),
      );
  }
}

// ── Exported orchestrator ─────────────────────────────────────────────────────

/**
 * Run drift monitoring for all production models.
 * Called automatically after each analytics refresh.
 *
 * Never blocks the analytics pipeline — errors are logged but not thrown.
 */
export async function runDriftMonitor(): Promise<{
  modelsDriftChecked: number;
  alertsCreated: number;
}> {
  logger.info("Drift monitor: starting");

  const productionVersions = await db
    .select({ id: modelVersionsTable.id, sport: modelVersionsTable.sport })
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.status, "production"));

  let alertsBefore = 0;
  const [countBefore] = await db
    .select({ c: sql<number>`count(*)` })
    .from(modelDriftAlertsTable)
    .where(eq(modelDriftAlertsTable.isResolved, false));
  alertsBefore = Number(countBefore?.c ?? 0);

  await Promise.allSettled(
    productionVersions.map((v) =>
      monitorModelDrift(v.id, v.sport).catch((err) =>
        logger.error({ err, modelVersionId: v.id }, "Drift monitor: error checking model"),
      ),
    ),
  );

  await monitorDataQuality().catch((err) =>
    logger.error({ err }, "Drift monitor: data quality check failed"),
  );

  const [countAfter] = await db
    .select({ c: sql<number>`count(*)` })
    .from(modelDriftAlertsTable)
    .where(eq(modelDriftAlertsTable.isResolved, false));
  const alertsAfter = Number(countAfter?.c ?? 0);

  logger.info(
    {
      modelsChecked: productionVersions.length,
      newAlerts: alertsAfter - alertsBefore,
    },
    "Drift monitor: complete",
  );

  return {
    modelsDriftChecked: productionVersions.length,
    alertsCreated: Math.max(0, alertsAfter - alertsBefore),
  };
}
