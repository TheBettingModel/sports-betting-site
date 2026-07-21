/**
 * Admin API endpoints.
 *
 * All routes require the X-Master-Key header matching MASTER_API_KEY env var.
 *
 * GET  /api/admin/overview          — KPIs, alert counts, grading status
 * GET  /api/admin/automation        — recent automation run history
 * GET  /api/admin/alerts            — active drift + data-quality alerts
 * POST /api/admin/alerts/:id/resolve  — resolve an alert
 * GET  /api/admin/backtests         — list backtest runs
 * POST /api/admin/backtests         — trigger a new backtest
 * POST /api/admin/jobs/:name/trigger  — manually trigger a scheduler job
 * POST /api/admin/models/:id/deploy   — promote model to production (alias)
 * POST /api/admin/models/:id/rollback — rollback to previous production
 */

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  automationRunsTable,
  backtestRunsTable,
  dataQualityAlertsTable,
  modelDriftAlertsTable,
  modelVersionsTable,
  performanceMetricsTable,
  pickResultsTable,
  publishedPicksTable,
  trainingDatasetsTable,
} from "@workspace/db";
import { runBacktest } from "../services/backtesting";
import { transitionModelStatus, rollbackModel } from "../services/modelRegistry";
import { schedulerJobs, getAutomationRuns } from "../services/scheduler";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Auth middleware ───────────────────────────────────────────────────────────

const MASTER_KEY = process.env["MASTER_API_KEY"] ?? "";

function requireMasterKey(req: Request, res: Response, next: NextFunction): void {
  if (!MASTER_KEY) {
    // No key configured — lock everything down rather than fail open.
    res.status(503).json({ error: "Admin access not configured: set MASTER_API_KEY" });
    return;
  }
  const key = req.headers["x-master-key"] as string | undefined;
  if (!key || key !== MASTER_KEY) {
    res.status(401).json({ error: "Unauthorized: valid X-Master-Key header required" });
    return;
  }
  next();
}

router.use("/admin", requireMasterKey);

// ── Overview ──────────────────────────────────────────────────────────────────

router.get("/admin/overview", async (_req, res): Promise<void> => {
  const [
    productionModels,
    challengerModels,
    activeDriftAlerts,
    activeDQAlerts,
    pendingPicks,
    recentRuns,
  ] = await Promise.all([
    db.select().from(modelVersionsTable).where(eq(modelVersionsTable.status, "production")),
    db.select().from(modelVersionsTable).where(eq(modelVersionsTable.status, "challenger")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(modelDriftAlertsTable)
      .where(eq(modelDriftAlertsTable.isResolved, false)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(dataQualityAlertsTable)
      .where(eq(dataQualityAlertsTable.isResolved, false)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(pickResultsTable)
      .where(eq(pickResultsTable.result, "pending")),
    db
      .select()
      .from(automationRunsTable)
      .orderBy(desc(automationRunsTable.startedAt))
      .limit(10),
  ]);

  // Aggregate overall performance across all production models
  const overallMetrics = await db
    .select()
    .from(performanceMetricsTable)
    .where(
      and(
        isNull(performanceMetricsTable.sport),
        isNull(performanceMetricsTable.market),
        isNull(performanceMetricsTable.recommendation),
      ),
    )
    .orderBy(desc(performanceMetricsTable.computedAt))
    .limit(20);

  const totalSample = overallMetrics.reduce((s, m) => s + m.sampleSize, 0);
  const avgROI =
    overallMetrics.filter((m) => m.roi != null).length > 0
      ? overallMetrics.filter((m) => m.roi != null).reduce((s, m) => s + m.roi!, 0) /
        overallMetrics.filter((m) => m.roi != null).length
      : null;
  const avgWinRate =
    overallMetrics.filter((m) => m.winRate != null).length > 0
      ? overallMetrics.filter((m) => m.winRate != null).reduce((s, m) => s + m.winRate!, 0) /
        overallMetrics.filter((m) => m.winRate != null).length
      : null;

  const lastRun = recentRuns[0] ?? null;
  const automationHealth =
    !lastRun
      ? "unknown"
      : lastRun.status === "completed"
        ? "healthy"
        : lastRun.status === "failed"
          ? "degraded"
          : "running";

  res.json({
    production: {
      modelCount: productionModels.length,
      models: productionModels.map((m) => ({
        id: m.id,
        modelId: m.modelId,
        sport: m.sport,
        market: m.market,
        deployedAt: m.deployedAt,
      })),
    },
    challengers: {
      count: challengerModels.length,
      models: challengerModels.map((m) => ({
        id: m.id,
        modelId: m.modelId,
        sport: m.sport,
        market: m.market,
      })),
    },
    alerts: {
      driftAlerts: Number(activeDriftAlerts[0]?.count ?? 0),
      dataQualityAlerts: Number(activeDQAlerts[0]?.count ?? 0),
      total:
        Number(activeDriftAlerts[0]?.count ?? 0) +
        Number(activeDQAlerts[0]?.count ?? 0),
    },
    grading: {
      pendingPicks: Number(pendingPicks[0]?.count ?? 0),
    },
    performance: {
      totalGradedPicks: totalSample,
      avgROI: avgROI != null ? Math.round(avgROI * 10000) / 10000 : null,
      avgWinRate: avgWinRate != null ? Math.round(avgWinRate * 10000) / 10000 : null,
    },
    automation: {
      health: automationHealth,
      lastRun: lastRun
        ? {
            jobName: lastRun.jobName,
            status: lastRun.status,
            startedAt: lastRun.startedAt,
            completedAt: lastRun.completedAt,
          }
        : null,
    },
  });
});

// ── Automation history ────────────────────────────────────────────────────────

router.get("/admin/automation", async (req, res): Promise<void> => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 200);
  const jobName = req.query.job as string | undefined;

  const conditions = jobName ? [eq(automationRunsTable.jobName, jobName)] : [];

  const runs = await db
    .select()
    .from(automationRunsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(automationRunsTable.startedAt))
    .limit(limit);

  // Group by job name for summary
  const summary: Record<string, { last: Date | null; successRate: number; count: number }> = {};
  for (const run of runs) {
    if (!summary[run.jobName]) {
      summary[run.jobName] = { last: null, successRate: 0, count: 0 };
    }
    const s = summary[run.jobName]!;
    s.count++;
    if (!s.last || run.startedAt > s.last) s.last = run.startedAt;
  }
  for (const [name, s] of Object.entries(summary)) {
    const jobRuns = runs.filter((r) => r.jobName === name);
    const completed = jobRuns.filter((r) => r.status === "completed").length;
    s.successRate = jobRuns.length ? completed / jobRuns.length : 0;
  }

  res.json({ runs, summary, count: runs.length });
});

// ── Alerts ────────────────────────────────────────────────────────────────────

router.get("/admin/alerts", async (req, res): Promise<void> => {
  const resolvedParam = req.query.resolved as string | undefined;
  // "all" returns both resolved and active; "true"/"false" filter accordingly
  const resolvedAll = resolvedParam === "all";
  const resolved = resolvedParam === "true";
  const sport = req.query.sport as string | undefined;

  const [driftAlerts, dqAlerts] = await Promise.all([
    db
      .select()
      .from(modelDriftAlertsTable)
      .where(resolvedAll ? undefined : eq(modelDriftAlertsTable.isResolved, resolved))
      .orderBy(desc(modelDriftAlertsTable.createdAt))
      .limit(200),
    db
      .select()
      .from(dataQualityAlertsTable)
      .where(
        and(
          resolvedAll ? undefined : eq(dataQualityAlertsTable.isResolved, resolved),
          sport ? eq(dataQualityAlertsTable.sport, sport) : undefined,
        ),
      )
      .orderBy(desc(dataQualityAlertsTable.createdAt))
      .limit(200),
  ]);

  const activeCount = resolvedAll
    ? driftAlerts.filter((a) => !a.isResolved).length + dqAlerts.filter((a) => !a.isResolved).length
    : resolved
      ? 0
      : driftAlerts.length + dqAlerts.length;

  res.json({
    drift: { alerts: driftAlerts, count: driftAlerts.length },
    dataQuality: { alerts: dqAlerts, count: dqAlerts.length },
    totalActive: activeCount,
  });
});

// ── Resolve alert ─────────────────────────────────────────────────────────────

router.post("/admin/alerts/:type/:id/resolve", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const type = req.params.type; // "drift" or "dq"
  if (isNaN(id)) { res.status(400).json({ error: "Invalid alert id" }); return; }

  const resolvedBy = req.body?.resolvedBy ?? "admin";
  const now = new Date();

  if (type === "drift") {
    await db
      .update(modelDriftAlertsTable)
      .set({ isResolved: true, resolvedAt: now, resolvedBy })
      .where(eq(modelDriftAlertsTable.id, id));
  } else {
    await db
      .update(dataQualityAlertsTable)
      .set({ isResolved: true, resolvedAt: now, resolvedBy })
      .where(eq(dataQualityAlertsTable.id, id));
  }

  res.json({ resolved: true, resolvedAt: now });
});

// ── Backtests ─────────────────────────────────────────────────────────────────

router.get("/admin/backtests", async (req, res): Promise<void> => {
  const modelVersionId = req.query.modelVersionId
    ? parseInt(req.query.modelVersionId as string, 10)
    : undefined;

  const conditions = modelVersionId
    ? [eq(backtestRunsTable.modelVersionId, modelVersionId)]
    : [];

  const runs = await db
    .select()
    .from(backtestRunsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(backtestRunsTable.startedAt))
    .limit(50);

  res.json({ runs, count: runs.length });
});

router.post("/admin/backtests", async (req, res): Promise<void> => {
  const { modelVersionId, sport, market, dateFrom, dateTo } = req.body ?? {};
  if (!modelVersionId || !sport || !market) {
    res.status(400).json({ error: "modelVersionId, sport, and market are required" });
    return;
  }

  const backtestId = await runBacktest({
    modelVersionId: parseInt(modelVersionId, 10),
    sport,
    market,
    dateFrom,
    dateTo,
  });

  const [run] = await db
    .select()
    .from(backtestRunsTable)
    .where(eq(backtestRunsTable.id, backtestId))
    .limit(1);

  res.status(201).json(run);
});

// ── Manual job trigger ────────────────────────────────────────────────────────

const JOB_MAP: Record<string, (() => Promise<void>) | undefined> = {
  "odds-ingestion": schedulerJobs.oddsIngestion,
  "result-grading": schedulerJobs.resultGrading,
  "analytics-refresh": schedulerJobs.analyticsRefresh,
  "drift-monitoring": schedulerJobs.driftCheck,
};

router.post("/admin/jobs/:name/trigger", async (req, res): Promise<void> => {
  const name = req.params.name;
  const job = JOB_MAP[name];
  if (!job) {
    res
      .status(404)
      .json({
        error: `Unknown job "${name}". Valid jobs: ${Object.keys(JOB_MAP).join(", ")}`,
      });
    return;
  }

  // Fire and forget — return immediately; job writes its own automation_run row
  void job().catch((err) => logger.error({ err, job: name }, "Admin-triggered job failed"));

  res.json({ message: `Job "${name}" triggered`, startedAt: new Date() });
});

// ── Model deploy (admin alias for status transition) ──────────────────────────

router.post("/admin/models/:id/deploy", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid model version id" }); return; }

  const performedBy = req.body?.performedBy ?? "admin";
  const notes = req.body?.notes;

  const version = await transitionModelStatus(id, {
    newStatus: "production",
    performedBy,
    masterApproved: true,
    approvedBy: performedBy,
    notes,
  });

  res.json(version);
});

// ── Model rollback ────────────────────────────────────────────────────────────

router.post("/admin/models/:id/rollback", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid model version id" }); return; }

  const performedBy = req.body?.performedBy ?? "admin";
  const notes = req.body?.notes;

  const result = await rollbackModel(id, performedBy, true, notes);
  res.json(result);
});

export default router;
