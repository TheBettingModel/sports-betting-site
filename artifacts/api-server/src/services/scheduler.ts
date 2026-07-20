/**
 * Automation Scheduler
 *
 * Uses node-cron to schedule recurring jobs. Each run is logged to
 * automation_runs and is idempotent — if a job is already running it
 * is skipped rather than double-fired.
 *
 * Jobs:
 *   odds-ingestion      — every 30 minutes: fetch ESPN scores/odds
 *   result-grading      — every 60 minutes: grade completed games
 *   analytics-refresh   — daily 06:00 ET: aggregate performance metrics + drift
 *   drift-monitoring    — daily 07:00 ET: standalone drift check
 */

import cron from "node-cron";
import { eq, and, desc } from "drizzle-orm";
import { db, automationRunsTable, modelWeightsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { fetchAllSports } from "./espn";
import { processGameSnapshot } from "./snapshot";
import { runGrading } from "./grading-runner";
import { runAnalytics } from "./analytics";
import { runDriftMonitor } from "./driftMonitor";
import { invalidateBootstrapCache } from "./bootstrap";
import { computeProjection } from "./model";

// ── Active-job guard ──────────────────────────────────────────────────────────

const runningJobs = new Set<string>();

// ── Automation run logging ────────────────────────────────────────────────────

async function startRun(jobName: string): Promise<number> {
  const [row] = await db
    .insert(automationRunsTable)
    .values({
      jobName,
      startedAt: new Date(),
      status: "running",
    })
    .returning();
  return row.id;
}

async function finishRun(
  runId: number,
  status: "completed" | "failed" | "skipped",
  recordsProcessed: number,
  errorDetails?: string,
): Promise<void> {
  await db
    .update(automationRunsTable)
    .set({
      completedAt: new Date(),
      status,
      recordsProcessed,
      errorDetails: errorDetails ?? null,
    })
    .where(eq(automationRunsTable.id, runId));
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

async function runOddsIngestion(): Promise<void> {
  const jobName = "odds-ingestion";
  if (runningJobs.has(jobName)) {
    logger.debug("Scheduler: odds-ingestion already running, skipping");
    return;
  }

  runningJobs.add(jobName);
  const runId = await startRun(jobName);

  try {
    const games = await fetchAllSports();
    const weights = await db.select().from(modelWeightsTable);
    const weightsBySport = Object.fromEntries(weights.map((w) => [w.sport, w]));
    let processed = 0;

    for (const game of games) {
      try {
        const proj = computeProjection(
          game.espnId,
          game.sport,
          game.homeTeamRecord,
          game.awayTeamRecord,
          weightsBySport[game.sport] ?? null,
        );
        await processGameSnapshot(game, proj);
        processed++;
      } catch (err) {
        logger.warn({ err, gameId: game.espnId }, "Scheduler: odds-ingestion game error");
      }
    }

    await finishRun(runId, "completed", processed);
    logger.info({ processed }, "Scheduler: odds-ingestion complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishRun(runId, "failed", 0, msg);
    logger.error({ err }, "Scheduler: odds-ingestion failed");
  } finally {
    runningJobs.delete(jobName);
  }
}

async function runResultGrading(): Promise<void> {
  const jobName = "result-grading";
  if (runningJobs.has(jobName)) {
    logger.debug("Scheduler: result-grading already running, skipping");
    return;
  }

  runningJobs.add(jobName);
  const runId = await startRun(jobName);

  try {
    // First pull fresh game data so finals are up to date
    const games = await fetchAllSports();
    const weights = await db.select().from(modelWeightsTable);
    const weightsBySport = Object.fromEntries(weights.map((w) => [w.sport, w]));
    let snapshots = 0;
    for (const game of games) {
      try {
        const proj = computeProjection(
          game.espnId,
          game.sport,
          game.homeTeamRecord,
          game.awayTeamRecord,
          weightsBySport[game.sport] ?? null,
        );
        await processGameSnapshot(game, proj);
        snapshots++;
      } catch (_) { /* continue */ }
    }

    const graded = await runGrading();

    await finishRun(runId, "completed", graded);
    logger.info({ snapshots, graded }, "Scheduler: result-grading complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishRun(runId, "failed", 0, msg);
    logger.error({ err }, "Scheduler: result-grading failed");
  } finally {
    runningJobs.delete(jobName);
  }
}

async function runAnalyticsRefresh(): Promise<void> {
  const jobName = "analytics-refresh";
  if (runningJobs.has(jobName)) {
    logger.debug("Scheduler: analytics-refresh already running, skipping");
    return;
  }

  runningJobs.add(jobName);
  const runId = await startRun(jobName);

  try {
    const rowsWritten = await runAnalytics();
    await finishRun(runId, "completed", rowsWritten);
    logger.info({ rowsWritten }, "Scheduler: analytics-refresh complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishRun(runId, "failed", 0, msg);
    logger.error({ err }, "Scheduler: analytics-refresh failed");
  } finally {
    runningJobs.delete(jobName);
  }
}

async function runDriftCheck(): Promise<void> {
  const jobName = "drift-monitoring";
  if (runningJobs.has(jobName)) {
    logger.debug("Scheduler: drift-monitoring already running, skipping");
    return;
  }

  runningJobs.add(jobName);
  const runId = await startRun(jobName);

  try {
    const { alertsCreated } = await runDriftMonitor();
    await finishRun(runId, "completed", alertsCreated);
    logger.info({ alertsCreated }, "Scheduler: drift-monitoring complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishRun(runId, "failed", 0, msg);
    logger.error({ err }, "Scheduler: drift-monitoring failed");
  } finally {
    runningJobs.delete(jobName);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start all scheduled jobs. Call once at server startup.
 */
export function startScheduler(): void {
  // Odds ingestion — every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    void runOddsIngestion();
  });

  // Result grading — every hour at :05
  cron.schedule("5 * * * *", () => {
    void runResultGrading();
  });

  // Analytics refresh — daily 6 AM ET (11:00 UTC)
  cron.schedule("0 11 * * *", () => {
    void runAnalyticsRefresh();
  });

  // Drift monitoring — daily 7 AM ET (12:00 UTC)
  cron.schedule("0 12 * * *", () => {
    void runDriftCheck();
  });

  logger.info("Scheduler: all cron jobs registered");
}

/**
 * Expose manual triggers for admin API use.
 */
export const schedulerJobs = {
  oddsIngestion: runOddsIngestion,
  resultGrading: runResultGrading,
  analyticsRefresh: runAnalyticsRefresh,
  driftCheck: runDriftCheck,
};

/**
 * Get recent automation run history.
 */
export async function getAutomationRuns(limit = 50) {
  return db
    .select()
    .from(automationRunsTable)
    .orderBy(desc(automationRunsTable.startedAt))
    .limit(limit);
}
