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
import { eq, and, desc, ne, gte } from "drizzle-orm";
import { db, automationRunsTable, dataQualityAlertsTable, modelWeightsTable, publishedPicksTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { fetchAllSports, fetchAllSportsDetailed } from "./espn";
import { processGameSnapshot } from "./snapshot";
import { runGrading } from "./grading-runner";
import { runAnalytics } from "./analytics";
import { runDriftMonitor } from "./driftMonitor";
import { invalidateBootstrapCache } from "./bootstrap";
import { computeProjection } from "./model";
import { getWnbaTeamStats, getSoccerTeamStats, warmUpTeamStatsCache } from "./teamStats";
import { sendStrongBuyNotification } from "./pushNotifications";
import { reconcileSubscriberStatus } from "./subscriberReconciliation";

// Track the last date we sent a Strong Buy notification so we only fire once per day
let lastNotificationDate: string | null = null;

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
  dataSourceFreshness?: Record<string, unknown>,
): Promise<void> {
  await db
    .update(automationRunsTable)
    .set({
      completedAt: new Date(),
      status,
      recordsProcessed,
      errorDetails: errorDetails ?? null,
      dataSourceFreshness: dataSourceFreshness ?? null,
    })
    .where(eq(automationRunsTable.id, runId));
}

/**
 * Check if any sport has returned 0 games for the last CONSECUTIVE_ZERO_THRESHOLD
 * completed odds-ingestion runs. If so, create a data_quality_alerts row (once per
 * sport — de-duped against existing unresolved alerts).
 */
const CONSECUTIVE_ZERO_THRESHOLD = 3;

async function checkAndRaiseSportAlerts(
  currentRunId: number,
  currentSportCounts: Record<string, number | "error">,
): Promise<void> {
  // Pull the last N-1 completed odds-ingestion runs, explicitly excluding the
  // current run (which was just written by finishRun). The current run contributes
  // consecutiveZeros = 1 as the starting count below.
  const recentRuns = await db
    .select({ dataSourceFreshness: automationRunsTable.dataSourceFreshness })
    .from(automationRunsTable)
    .where(
      and(
        eq(automationRunsTable.jobName, "odds-ingestion"),
        eq(automationRunsTable.status, "completed"),
        ne(automationRunsTable.id, currentRunId),
      ),
    )
    .orderBy(desc(automationRunsTable.startedAt))
    .limit(CONSECUTIVE_ZERO_THRESHOLD - 1); // previous N-1 runs; current run is the Nth

  const sports = Object.keys(currentSportCounts);

  for (const sport of sports) {
    const currentCount = currentSportCounts[sport];
    // Only flag "ok but 0 games" — not error statuses
    if (currentCount !== 0) continue;

    // Check prior runs for this sport
    let consecutiveZeros = 1; // current run counted as 1
    for (const run of recentRuns) {
      const freshness = run.dataSourceFreshness as Record<string, unknown> | null;
      if (!freshness) break; // older run without freshness data — stop streak
      const prev = freshness[sport];
      if (prev === 0 || prev === "zero") {
        consecutiveZeros++;
      } else {
        break; // streak broken
      }
    }

    if (consecutiveZeros < CONSECUTIVE_ZERO_THRESHOLD) continue;

    // Check for an existing unresolved alert for this sport + type
    const [existing] = await db
      .select({ id: dataQualityAlertsTable.id })
      .from(dataQualityAlertsTable)
      .where(
        and(
          eq(dataQualityAlertsTable.alertType, "zero_games_feed"),
          eq(dataQualityAlertsTable.sport, sport),
          eq(dataQualityAlertsTable.isResolved, false),
        ),
      )
      .limit(1);

    if (existing) continue; // already alerted

    await db.insert(dataQualityAlertsTable).values({
      alertType: "zero_games_feed",
      sport,
      severity: "warning",
      description: `ESPN returned 0 games for ${sport} in the last ${CONSECUTIVE_ZERO_THRESHOLD} consecutive odds-ingestion runs. Sport may be in off-season or the feed may be broken.`,
      metadata: {
        consecutiveZeroRuns: consecutiveZeros,
        threshold: CONSECUTIVE_ZERO_THRESHOLD,
      },
    });

    logger.warn(
      { sport, consecutiveZeros },
      "Scheduler: data quality alert raised for zero-game sport",
    );
  }
}

/**
 * Auto-resolve any unresolved `zero_games_feed` alerts for sports that returned
 * >0 games in this ingestion run. This cleans up stale off-season alerts once a
 * sport's season resumes.
 */
async function autoResolveSportAlerts(
  currentSportCounts: Record<string, number | "error">,
): Promise<void> {
  const activeSports = Object.entries(currentSportCounts)
    .filter(([, count]) => typeof count === "number" && count > 0)
    .map(([sport]) => sport);

  if (activeSports.length === 0) return;

  const now = new Date();
  let resolved = 0;

  for (const sport of activeSports) {
    const result = await db
      .update(dataQualityAlertsTable)
      .set({
        isResolved: true,
        resolvedAt: now,
        resolvedBy: "scheduler:auto",
      })
      .where(
        and(
          eq(dataQualityAlertsTable.alertType, "zero_games_feed"),
          eq(dataQualityAlertsTable.sport, sport),
          eq(dataQualityAlertsTable.isResolved, false),
        ),
      )
      .returning({ id: dataQualityAlertsTable.id });

    if (result.length > 0) {
      resolved += result.length;
      logger.info(
        { sport, resolvedIds: result.map((r) => r.id) },
        "Scheduler: auto-resolved zero_games_feed alert — games returned for sport",
      );
    }
  }

  if (resolved > 0) {
    logger.info({ resolved }, "Scheduler: auto-resolved stale zero_games_feed alerts");
  }
}

// ── Push notification helper ──────────────────────────────────────────────────

/**
 * Query for Strong Buy picks published today and send a push notification
 * to Pro subscribers. Fires at most once per calendar day (UTC) to avoid
 * re-notifying on every 30-minute odds-ingestion run.
 */
async function maybeSendStrongBuyNotification(): Promise<void> {
  const todayUtc = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  if (lastNotificationDate === todayUtc) {
    return; // already sent today
  }

  // Find all Strong Buy picks published today
  const startOfDay = new Date(`${todayUtc}T00:00:00.000Z`);
  const strongBuys = await db
    .select({
      id: publishedPicksTable.id,
      gameId: publishedPicksTable.gameId,
      sport: publishedPicksTable.sport,
    })
    .from(publishedPicksTable)
    .where(
      and(
        eq(publishedPicksTable.recommendation, "Strong Buy"),
        gte(publishedPicksTable.publishedAt, startOfDay),
      ),
    );

  if (strongBuys.length === 0) return;

  // Build a simple summary for the notification body
  const sportCounts: Record<string, number> = {};
  for (const pick of strongBuys) {
    sportCounts[pick.sport] = (sportCounts[pick.sport] ?? 0) + 1;
  }
  const topSport = Object.entries(sportCounts).sort(([, a], [, b]) => b - a)[0];
  const topPick = topSport
    ? `${topSport[1]} in ${topSport[0]}${Object.keys(sportCounts).length > 1 ? ` + ${Object.keys(sportCounts).length - 1} more sport${Object.keys(sportCounts).length > 2 ? "s" : ""}` : ""}`
    : undefined;

  try {
    await sendStrongBuyNotification(strongBuys.length, topPick);
    lastNotificationDate = todayUtc; // mark sent for today
  } catch (err) {
    logger.error({ err }, "Scheduler: failed to send Strong Buy push notification");
    // Don't set lastNotificationDate so we retry on the next run
  }
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
    const sportResults = await fetchAllSportsDetailed();
    const weights = await db.select().from(modelWeightsTable);
    const weightsBySport = Object.fromEntries(weights.map((w) => [w.sport, w]));

    // Per-sport counts stored in dataSourceFreshness:
    //   number  → games fetched (0 = off-season / no games)
    //   "error" → ESPN fetch failed for that sport
    const sportCounts: Record<string, number | "error"> = {};
    let processed = 0;

    for (const { sport, games, fetchStatus } of sportResults) {
      if (fetchStatus === "error") {
        sportCounts[sport] = "error";
        continue;
      }

      // Accumulate counts so Soccer sub-leagues (EPL, La Liga, etc.) all
      // contribute to the same "Soccer" entry rather than overwriting it.
      const existing = sportCounts[sport];
      sportCounts[sport] = typeof existing === "number" ? existing + games.length : games.length;

      for (const game of games) {
        try {
          // Fetch advanced team analytics for WNBA/NBA and Soccer.
          // Results are cached (WNBA: 4h, Soccer: 1h) so subsequent calls
          // within the same run are instant after the first batch fetch.
          const [homeTeamStats, awayTeamStats, homeSoccerStats, awaySoccerStats] =
            await Promise.all([
              (game.sport === "WNBA" || game.sport === "NBA")
                ? getWnbaTeamStats(game.homeTeamId ?? "")
                : Promise.resolve(undefined),
              (game.sport === "WNBA" || game.sport === "NBA")
                ? getWnbaTeamStats(game.awayTeamId ?? "")
                : Promise.resolve(undefined),
              game.sport === "Soccer"
                ? getSoccerTeamStats(game.homeTeamId ?? "")
                : Promise.resolve(undefined),
              game.sport === "Soccer"
                ? getSoccerTeamStats(game.awayTeamId ?? "")
                : Promise.resolve(undefined),
            ]);

          const proj = computeProjection(
            game.espnId,
            game.sport,
            game.homeTeamRecord,
            game.awayTeamRecord,
            weightsBySport[game.sport] ?? null,
            {
              homeHomeRecord:   game.homeHomeRecord,
              homeRoadRecord:   game.homeRoadRecord,
              awayHomeRecord:   game.awayHomeRecord,
              awayRoadRecord:   game.awayRoadRecord,
              realVegasHomeOdds: game.vegasHomeOdds,
              realVegasAwayOdds: game.vegasAwayOdds,
              realVegasDrawOdds: game.vegasDrawOdds,
              realVegasOverUnder: game.vegasOverUnder,
              homeTeamStats,
              awayTeamStats,
              homeSoccerStats,
              awaySoccerStats,
            },
          );
          await processGameSnapshot(game, proj);
          processed++;
        } catch (err) {
          logger.warn({ err, gameId: game.espnId }, "Scheduler: odds-ingestion game error");
        }
      }
    }

    const zeroSports = Object.entries(sportCounts)
      .filter(([, v]) => v === 0)
      .map(([s]) => s);
    const errorSports = Object.entries(sportCounts)
      .filter(([, v]) => v === "error")
      .map(([s]) => s);

    if (zeroSports.length > 0) {
      logger.info({ zeroSports }, "Scheduler: sports with 0 games this run");
    }
    if (errorSports.length > 0) {
      logger.warn({ errorSports }, "Scheduler: sports with ESPN fetch errors");
    }

    await finishRun(runId, "completed", processed, undefined, sportCounts);

    // Auto-resolve any stale zero_games_feed alerts for sports that returned games.
    await autoResolveSportAlerts(sportCounts);

    // Check for data quality issues after recording this run's counts.
    // Pass runId so the query excludes the just-written row and avoids double-counting.
    await checkAndRaiseSportAlerts(runId, sportCounts);

    // Send push notifications for Strong Buy picks — once per calendar day only.
    await maybeSendStrongBuyNotification();

    logger.info({ processed, sportCounts }, "Scheduler: odds-ingestion complete");
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
        const [homeTeamStats, awayTeamStats, homeSoccerStats, awaySoccerStats] =
          await Promise.all([
            (game.sport === "WNBA" || game.sport === "NBA")
              ? getWnbaTeamStats(game.homeTeamId ?? "")
              : Promise.resolve(undefined),
            (game.sport === "WNBA" || game.sport === "NBA")
              ? getWnbaTeamStats(game.awayTeamId ?? "")
              : Promise.resolve(undefined),
            game.sport === "Soccer"
              ? getSoccerTeamStats(game.homeTeamId ?? "")
              : Promise.resolve(undefined),
            game.sport === "Soccer"
              ? getSoccerTeamStats(game.awayTeamId ?? "")
              : Promise.resolve(undefined),
          ]);

        const proj = computeProjection(
          game.espnId,
          game.sport,
          game.homeTeamRecord,
          game.awayTeamRecord,
          weightsBySport[game.sport] ?? null,
          {
            homeHomeRecord:    game.homeHomeRecord,
            homeRoadRecord:    game.homeRoadRecord,
            awayHomeRecord:    game.awayHomeRecord,
            awayRoadRecord:    game.awayRoadRecord,
            realVegasHomeOdds: game.vegasHomeOdds,
            realVegasAwayOdds: game.vegasAwayOdds,
            realVegasDrawOdds: game.vegasDrawOdds,
            realVegasOverUnder: game.vegasOverUnder,
            homeTeamStats,
            awayTeamStats,
            homeSoccerStats,
            awaySoccerStats,
          },
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

async function runSubscriberReconciliation(): Promise<void> {
  const jobName = "subscriber-reconciliation";
  if (runningJobs.has(jobName)) {
    logger.debug("Scheduler: subscriber-reconciliation already running, skipping");
    return;
  }

  runningJobs.add(jobName);
  const runId = await startRun(jobName);

  try {
    const { checked, revoked, errors } = await reconcileSubscriberStatus();
    await finishRun(runId, "completed", revoked, errors > 0 ? `${errors} API errors` : undefined);
    logger.info({ checked, revoked, errors }, "Scheduler: subscriber-reconciliation complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishRun(runId, "failed", 0, msg);
    logger.error({ err }, "Scheduler: subscriber-reconciliation failed");
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
  // Odds ingestion — every 15 minutes
  cron.schedule("*/15 * * * *", () => {
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

  // Subscriber reconciliation — hourly at :15, catches missed expiration webhooks
  cron.schedule("15 * * * *", () => {
    void runSubscriberReconciliation();
  });

  // Warm up team stats cache in the background so the first game refresh
  // has advanced analytics immediately available.
  warmUpTeamStatsCache();

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
  subscriberReconciliation: runSubscriberReconciliation,
};

/**
 * Exported for testing only. Do not call directly in production code.
 * @internal
 */
export {
  checkAndRaiseSportAlerts as _checkAndRaiseSportAlerts,
  autoResolveSportAlerts as _autoResolveSportAlerts,
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
