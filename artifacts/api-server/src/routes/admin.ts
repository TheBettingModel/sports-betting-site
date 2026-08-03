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
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { adminLimiter, sessionAuthLimiter } from "../middleware/rateLimiter";
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
  sportSnoozesTable,
  trainingDatasetsTable,
} from "@workspace/db";
import { runBacktest } from "../services/backtesting";
import { transitionModelStatus, rollbackModel } from "../services/modelRegistry";
import { schedulerJobs, getAutomationRuns } from "../services/scheduler";
import { runDriftMonitor } from "../services/driftMonitor";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Auth middleware ───────────────────────────────────────────────────────────

const MASTER_KEY = process.env["MASTER_API_KEY"] ?? "";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

interface Session { expiresAt: Date }
const sessions = new Map<string, Session>();

// ── Brute-force lockout (5-second lockout after 3 failed attempts per IP) ────
const LOCKOUT_WINDOW_MS = 5_000;    // lockout duration
const MAX_ATTEMPTS = 3;             // attempts before lockout

interface FailedAttemptRecord {
  count: number;
  lockedUntil: number | null;
}
const failedAttempts = new Map<string, FailedAttemptRecord>();

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? "unknown";
}

function isLockedOut(ip: string): boolean {
  const record = failedAttempts.get(ip);
  if (!record) return false;
  if (record.lockedUntil && Date.now() < record.lockedUntil) return true;
  return false;
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = failedAttempts.get(ip) ?? { count: 0, lockedUntil: null };
  // Reset if previous lockout has expired
  if (record.lockedUntil && now >= record.lockedUntil) {
    record.count = 0;
    record.lockedUntil = null;
  }
  record.count++;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_WINDOW_MS;
  }
  failedAttempts.set(ip, record);
}

function clearFailedAttempts(ip: string): void {
  failedAttempts.delete(ip);
}

/** Prune expired sessions (called lazily on each auth check). */
function pruneExpiredSessions(): void {
  const now = new Date();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

function isValidSession(token: string): boolean {
  pruneExpiredSessions();
  const session = sessions.get(token);
  return session !== undefined && session.expiresAt > new Date();
}

function requireMasterKey(req: Request, res: Response, next: NextFunction): void {
  if (!MASTER_KEY) {
    res.status(503).json({ error: "Admin access not configured: set MASTER_API_KEY" });
    return;
  }

  // Accept either a session token (preferred) or the raw key (legacy / CLI)
  const sessionToken = req.headers["x-admin-token"] as string | undefined;
  if (sessionToken) {
    if (isValidSession(sessionToken)) { next(); return; }
    res.status(401).json({ error: "Session expired or invalid — please log in again" });
    return;
  }

  const key = req.headers["x-master-key"] as string | undefined;
  if (!key || key !== MASTER_KEY) {
    res.status(401).json({ error: "Unauthorized: valid X-Master-Key or X-Admin-Token header required" });
    return;
  }
  next();
}

// ── Session endpoints (no master-key auth — they ARE the auth flow) ───────────

router.use("/admin", adminLimiter);

/** POST /api/admin/session — exchange the master key for a session token */
router.post("/admin/session", sessionAuthLimiter, (req, res): void => {
  if (!MASTER_KEY) {
    res.status(503).json({ error: "Admin access not configured: set MASTER_API_KEY" });
    return;
  }

  const ip = getClientIp(req);

  // Check lockout before doing anything else
  if (isLockedOut(ip)) {
    res.status(429).json({ error: "Invalid key" });
    return;
  }

    const key = row.sport ?? "Unknown";
  if (!key || key !== MASTER_KEY) {
    recordFailedAttempt(ip);
    res.status(401).json({ error: "Invalid key" });
    return;
  }

  // Successful auth — clear failed attempt counter
  clearFailedAttempts(ip);

  pruneExpiredSessions();
  const token = req.headers["x-admin-token"] as string | undefined;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  sessions.set(token, { expiresAt });

  logger.info({ sessionCount: sessions.size }, "Admin: session created");
  res.status(201).json({ token, expiresAt: expiresAt.toISOString() });
});

/** DELETE /api/admin/session — revoke the current session token */
router.delete("/admin/session", (req, res): void => {
  const token = req.headers["x-admin-token"] as string | undefined;
  if (token) sessions.delete(token);
  res.json({ message: "Logged out" });
});

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
    dqBySportSeverity,
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
    // Per-sport active DQ alert counts + severity — used to overlay the feed health chips
    db
      .select({
        sport: dataQualityAlertsTable.sport,
        severity: dataQualityAlertsTable.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(dataQualityAlertsTable)
      .where(eq(dataQualityAlertsTable.isResolved, false))
      .groupBy(dataQualityAlertsTable.sport, dataQualityAlertsTable.severity),
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

  // ── Per-sport DQ alert summary ────────────────────────────────────────────────
  const SEVERITY_RANK: Record<string, number> = { critical: 3, warning: 2, info: 1 };
  type SportAlertInfo = { worstSeverity: string | null; count: number };
  const sportAlertMap = new Map<string, SportAlertInfo>();
  for (const row of dqBySportSeverity) {
    const key = row.sport ?? "Unknown";
    const existing = sportAlertMap.get(key);
    const rank = SEVERITY_RANK[row.severity] ?? 0;
    const existingRank = SEVERITY_RANK[existing?.worstSeverity ?? ""] ?? -1;
    sportAlertMap.set(key, {
      worstSeverity: rank > existingRank ? row.severity : (existing?.worstSeverity ?? null),
      count: (existing?.count ?? 0) + Number(row.count),
    });
  }

  // ── Feed health: derive per-sport status from the most recent ingestion run ──
  const TRACKED_SPORTS = ["MLB", "NFL", "NHL", "NBA", "WNBA", "NCAAB", "NCAAF", "Soccer", "UFC"];
  const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

  // Find the most recent completed odds-ingestion run that recorded feed data
  const freshestIngestion = recentRuns.find(
    (r) => r.jobName === "odds-ingestion" && r.dataSourceFreshness != null,
  );

  const freshness = freshestIngestion?.dataSourceFreshness as
    | Record<string, number | "error">
    | null
    | undefined;

  const lastChecked = freshestIngestion?.startedAt?.toISOString() ?? null;
  const isStale =
    !freshestIngestion ||
    Date.now() - new Date(freshestIngestion.startedAt).getTime() > STALE_THRESHOLD_MS;

  const feedHealth = TRACKED_SPORTS.map((sport) => {
    const alertInfo = sportAlertMap.get(sport) ?? { worstSeverity: null, count: 0 };
    if (!freshness || isStale) {
      return { sport, status: "stale" as const, gameCount: null, lastChecked: null, alertSeverity: alertInfo.worstSeverity, alertCount: alertInfo.count };
    }
    const val = freshness[sport];
    if (val === undefined) {
      return { sport, status: "stale" as const, gameCount: null, lastChecked, alertSeverity: alertInfo.worstSeverity, alertCount: alertInfo.count };
    }
    if (val === "error") {
      return { sport, status: "error" as const, gameCount: null, lastChecked, alertSeverity: alertInfo.worstSeverity, alertCount: alertInfo.count };
    }
    return {
      sport,
      status: val > 0 ? ("ok" as const) : ("quiet" as const),
      gameCount: val,
      lastChecked,
      alertSeverity: alertInfo.worstSeverity,
      alertCount: alertInfo.count,
    };
  });

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
    feedHealth,
  });
});

// ── Automation history ────────────────────────────────────────────────────────

router.get("/admin/automation", async (req, res): Promise<void> => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 200);
  const jobName = req.query.job as string | undefined;

  const conditions = modelVersionId
    ? [eq(backtestRunsTable.modelVersionId, modelVersionId)]
    : [];

  const runs = await db
    .select()
    .from(backtestRunsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(backtestRunsTable.startedAt))
    .limit(50);

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
  const sport = req.params.sport;

  const { durationHours, snoozedUntil, reason, snoozedBy = "admin" } = req.body ?? {};

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

// ── Reset drift baseline ──────────────────────────────────────────────────────
// Bulk-resolves all active drift alerts (stale after a model overhaul) and
// immediately re-runs the drift monitor so the next comparison uses fresh data.

router.post("/admin/alerts/drift/reset-baseline", async (req, res): Promise<void> => {
  const now = new Date();

  const [snooze] = await db
    .select()
    .from(sportSnoozesTable)
    .where(eq(sportSnoozesTable.sport, sport))
    .limit(1);

  // 1. Count + resolve all unresolved drift alerts
  const unresolvedBefore = await db
    .select({ id: modelDriftAlertsTable.id })
    .from(modelDriftAlertsTable)
    .where(eq(modelDriftAlertsTable.isResolved, false));

  if (unresolvedBefore.length > 0) {
    await db
      .update(modelDriftAlertsTable)
      .set({ isResolved: true, resolvedAt: now, resolvedBy: "admin:baseline-reset" })
      .where(eq(modelDriftAlertsTable.isResolved, false));
  }

  // 2. Re-run drift monitor — it will compare fresh 7-day vs 30-day windows
  const { alertsCreated } = await runDriftMonitor();

  logger.info(
    { resolved: unresolvedBefore.length, newAlerts: alertsCreated },
    "Admin: drift baseline reset",
  );

  res.json({
    resolved: unresolvedBefore.length,
    newAlerts: alertsCreated,
    message: `Resolved ${unresolvedBefore.length} stale alert${unresolvedBefore.length !== 1 ? "s" : ""}. Drift monitor re-ran and raised ${alertsCreated} new alert${alertsCreated !== 1 ? "s" : ""}.`,
  });
});

// ── Resolve alert ─────────────────────────────────────────────────────────────

router.post("/admin/alerts/:type/:id/resolve", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const type = req.params.type; // "drift" or "dq"
  if (isNaN(id)) { res.status(400).json({ error: "Invalid alert id" }); return; }

  const resolvedBy = req.body?.resolvedBy ?? "admin";
  const now = new Date();

  const [snooze] = await db
    .select()
    .from(sportSnoozesTable)
    .where(eq(sportSnoozesTable.sport, sport))
    .limit(1);

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

// ── Sport snoozes ─────────────────────────────────────────────────────────────

/** GET /admin/sports/snoozes — list all active (not yet expired) snoozes */
router.get("/admin/sports/snoozes", async (_req, res): Promise<void> => {
  const now = new Date();
  const snoozes = await db
    .select()
    .from(sportSnoozesTable)
    .where(gt(sportSnoozesTable.snoozedUntil, now));
  res.json({ snoozes });
});

/** POST /admin/sports/:sport/snooze — create or extend a snooze */
router.post("/admin/sports/:sport/snooze", async (req, res): Promise<void> => {
  const sport = req.params.sport;

  const durationHours: number = Number(req.body?.durationHours ?? 168); // default 1 week
  const snoozedBy: string = req.body?.snoozedBy ?? "admin";
  const reason: string | undefined = req.body?.reason;

  if (durationHours <= 0 || durationHours > 8760) {
    res.status(400).json({ error: "durationHours must be between 1 and 8760 (1 year)" });
    return;
  }

  const snoozedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  // Upsert: if a snooze already exists for this sport, extend/replace it
  const [row] = await db
    .insert(sportSnoozesTable)
    .values({ sport, snoozedUntil, snoozedBy, reason: reason ?? null })
    .onConflictDoUpdate({
      target: sportSnoozesTable.sport,
      set: { snoozedUntil, snoozedBy, reason: reason ?? null, createdAt: new Date() },
    })
    .returning();

  logger.info({ sport, snoozedUntil, snoozedBy }, "Admin: sport snoozed");
  res.status(201).json(row);
});

/** DELETE /admin/sports/:sport/snooze — remove a snooze early */
router.delete("/admin/sports/:sport/snooze", async (req, res): Promise<void> => {
  const sport = req.params.sport;
  await db.delete(sportSnoozesTable).where(eq(sportSnoozesTable.sport, sport));
  logger.info({ sport }, "Admin: sport snooze removed");
  res.json({ message: `Snooze for ${sport} removed` });
});

export default router;
