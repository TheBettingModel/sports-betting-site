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
import { eq, and, desc, ne, gte, gt, lt, sql } from "drizzle-orm";
import {
  db,
  automationRunsTable,
  dataQualityAlertsTable,
  modelPredictionsTable,
  modelVersionsTable,
  modelWeightsTable,
  publishedPicksTable,
  sportSnoozesTable,
  pushTokensTable,
  gamesTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { fetchAllSports, fetchAllSportsDetailed } from "./espn";
import { createPredictionDecisionContext, processGameSnapshot, publishDownstreamCandidates } from "./snapshot";
import { assessMlbDecisionEvidence } from "./mlbDecisionEvidence";
import { writeMlbV4ShadowPrediction } from "./mlbV4Challenger";
import { resolveProductionPredictionBoundary, shouldRunIncumbentSnapshot } from "./guardedServing/productionBoundary";
import { runGrading, recoverStaleGames, syncGameResults } from "./grading-runner";
import { runForecastReviews } from "./forecastReviews";
import { runAnalytics } from "./analytics";
import { runLearning } from "./learning";
import { checkPendingPushReceipts } from "./pushReceipts";
import { runDriftMonitor } from "./driftMonitor";
import { invalidateBootstrapCache } from "./bootstrap";
import { computeProjection, type ComputeOptions } from "./model";
import { getWnbaTeamStats, getSoccerTeamStats, getDbTeamStats, getNbaTeamStats, warmUpTeamStatsCache } from "./teamStats";
import { getOddsForGameWithStatus, selectActionableMoneylineMarket } from "./oddsApi";
import { getProbablePitchers, computePitcherAdvantage, getProbablePitcherCacheMeta } from "./mlbPitchers";
import { getBullpenMatchup, computeBullpenAdvantage, getBullpenCacheMeta } from "./mlbBullpen";
import { getLineupMatchup, computeLineupAdvantage, enrichLineupMatchup, getLineupCacheMeta } from "./mlbLineups";
import { getParkFactor } from "./mlbParkFactors";
import { getVenueWeather, computeWeatherEffect, getVenueWeatherCacheMeta } from "./weatherService";
import { getGoalieMatchup, computeGoalieAdvantage, getNhlTeamSpecialTeams, computeNhlSpecialTeamsAdvantage } from "./nhlGoalies";
import { getTeamInjuryImpact, computeInjuryAdvantage } from "./nflInjuries";
import { computeWnbaInjuryAdvantage } from "./wnbaInjuries";
import { getWnbaGameContext } from "./wnbaContext";
import { computeNflSituationalSignals } from "./nflTeamSignals";
import { sendStrongBuyNotification } from "./pushNotifications";
import { isPerformanceEligiblePublishedPickSql } from "./legacyNcaafIntegrity";
import { reconcileSubscriberStatus } from "./subscriberReconciliation";
import {
  bootstrapMissingNcaafPerformanceEvidence,
  runNcaafProductionEvidenceCycle,
} from "./ncaafProductionEvidenceCycle";
import { materializeNcaafHistoricalTrainingRows } from "./ncaafHistoricalTrainingMaterializer";
import { createNcaafFeatureSnapshot } from "./ncaafFeatures";
import { ncaafSeasonForDate } from "./ncaafEvidenceLedger";
import { runNcaafValidationCycle } from "./ncaafValidation";
import { refreshAllSpreadApprovalLifecycles } from "./spreadModel";
import { collectLiveForwardAdvancedResearch } from "./mlbAdvancedResearchCollector";
import { captureMlbResearchMarketObservation } from "./mlbPointInTime";
import {
  logSchedulerMemory,
  SingleFlightGroup,
} from "./schedulerRuntime";
import { runScheduledMlbV4EvidenceCollection } from "./mlbV4LiveRuntime";
import { runNflV4ProspectiveCollection } from "./nflV4Prospective";

// Track the current effective Strong Buy set so an unchanged 30-minute refresh
// does not re-notify, while a newly effective revision can alert immediately.
let lastStrongBuyNotificationSignature: string | null = null;

// ── Active-job guard ──────────────────────────────────────────────────────────

const runningJobs = new Set<string>();
const heavyJobs = new SingleFlightGroup();
// MLB V4 evidence is isolated from all-sport heavy work so game-relative
// windows are not skipped behind unrelated jobs.
const mlbV4EvidenceJobs = new SingleFlightGroup();
const nflV4EvidenceJobs = new SingleFlightGroup();

function claimHeavyJob(jobName: string): number | null {
  const claim = heavyJobs.acquire(jobName);
  if (!claim.acquired) {
    logSchedulerMemory(logger, {
      jobName,
      phase: "skipped",
      blockedBy: claim.blockedBy,
    });
    return null;
  }
  runningJobs.add(jobName);
  const startedAt = performance.now();
  logSchedulerMemory(logger, { jobName, phase: "start", startedAt });
  return startedAt;
}

function releaseHeavyJob(jobName: string, startedAt: number): void {
  runningJobs.delete(jobName);
  heavyJobs.release(jobName);
  logSchedulerMemory(logger, { jobName, phase: "end", startedAt });
}

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

    // Check if this sport is currently snoozed (admin marked it as off-season)
    const alertNow = new Date();
    const [snooze] = await db
      .select({ id: sportSnoozesTable.id, snoozedUntil: sportSnoozesTable.snoozedUntil })
      .from(sportSnoozesTable)
      .where(
        and(
          eq(sportSnoozesTable.sport, sport),
          gt(sportSnoozesTable.snoozedUntil, alertNow),
        ),
      )
      .limit(1);

    if (snooze) {
      // Insert the alert immediately resolved so history is preserved
      await db.insert(dataQualityAlertsTable).values({
        alertType: "zero_games_feed",
        sport,
        severity: "warning",
        description: `ESPN returned 0 games for ${sport} in the last ${CONSECUTIVE_ZERO_THRESHOLD} consecutive odds-ingestion runs (sport is snoozed until ${snooze.snoozedUntil.toISOString().slice(0, 10)}).`,
        isResolved: true,
        resolvedAt: alertNow,
        resolvedBy: `snooze:${sport}`,
        metadata: {
          consecutiveZeroRuns: consecutiveZeros,
          threshold: CONSECUTIVE_ZERO_THRESHOLD,
          snoozedUntil: snooze.snoozedUntil.toISOString(),
        },
      });

      logger.info(
        { sport, consecutiveZeros, snoozedUntil: snooze.snoozedUntil },
        "Scheduler: zero-game alert auto-resolved (sport is snoozed)",
      );
      continue;
    }

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
 * Auto-resolve any unresolved `zero_games_feed` or `feed_fetch_error` alerts
 * for sports that returned >0 games in this ingestion run. This cleans up
 * stale off-season alerts once a sport's season resumes, and clears fetch-error
 * alerts once the ESPN API recovers.
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
    for (const alertType of ["zero_games_feed", "feed_fetch_error"] as const) {
      const result = await db
        .update(dataQualityAlertsTable)
        .set({
          isResolved: true,
          resolvedAt: now,
          resolvedBy: "scheduler:auto",
        })
        .where(
          and(
            eq(dataQualityAlertsTable.alertType, alertType),
            eq(dataQualityAlertsTable.sport, sport),
            eq(dataQualityAlertsTable.isResolved, false),
          ),
        )
        .returning({ id: dataQualityAlertsTable.id });

      if (result.length > 0) {
        resolved += result.length;
        logger.info(
          { sport, alertType, resolvedIds: result.map((r) => r.id) },
          "Scheduler: auto-resolved alert — sport returned games",
        );
      }
    }
  }

  if (resolved > 0) {
    logger.info({ resolved }, "Scheduler: auto-resolved stale data-quality alerts");
  }
}

/**
 * Raise a `feed_fetch_error` data-quality alert when ESPN fails to return data
 * for a sport across CONSECUTIVE_ERROR_THRESHOLD consecutive runs. Each run
 * already applies 3 internal retries before marking a sport as "error", so
 * two consecutive error runs means the ESPN API is genuinely struggling.
 */
const CONSECUTIVE_ERROR_THRESHOLD = 2;

async function checkAndRaiseFetchErrorAlerts(
  currentRunId: number,
  currentSportCounts: Record<string, number | "error">,
): Promise<void> {
  const errorSports = Object.entries(currentSportCounts)
    .filter(([, count]) => count === "error")
    .map(([sport]) => sport);

  if (errorSports.length === 0) return;

  // Pull recent completed runs to check for consecutive errors
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
    .limit(CONSECUTIVE_ERROR_THRESHOLD - 1);

  const now = new Date();

  for (const sport of errorSports) {
    let consecutiveErrors = 1; // current run is the first error

    for (const run of recentRuns) {
      const freshness = run.dataSourceFreshness as Record<string, unknown> | null;
      if (!freshness) break;
      if (freshness[sport] === "error") {
        consecutiveErrors++;
      } else {
        break;
      }
    }

    if (consecutiveErrors < CONSECUTIVE_ERROR_THRESHOLD) continue;

    // Respect snooze: if admin has silenced this sport, skip the alert
    const [snooze] = await db
      .select({ snoozedUntil: sportSnoozesTable.snoozedUntil })
      .from(sportSnoozesTable)
      .where(
        and(
          eq(sportSnoozesTable.sport, sport),
          gt(sportSnoozesTable.snoozedUntil, now),
        ),
      )
      .limit(1);

    if (snooze) {
      logger.info(
        { sport, snoozedUntil: snooze.snoozedUntil },
        "Scheduler: skipping feed_fetch_error alert — sport is snoozed",
      );
      continue;
    }

    // Check for an existing unresolved alert before raising a duplicate
    const [existing] = await db
      .select({ id: dataQualityAlertsTable.id })
      .from(dataQualityAlertsTable)
      .where(
        and(
          eq(dataQualityAlertsTable.alertType, "feed_fetch_error"),
          eq(dataQualityAlertsTable.sport, sport),
          eq(dataQualityAlertsTable.isResolved, false),
        ),
      )
      .limit(1);

    if (existing) continue;

    await db.insert(dataQualityAlertsTable).values({
      alertType: "feed_fetch_error",
      sport,
      severity: "critical",
      description:
        `ESPN API returned a fetch error for ${sport} in the last ${consecutiveErrors} consecutive ` +
        `odds-ingestion runs (each run already applied 3 retries). The feed may be down or the endpoint URL has changed.`,
      metadata: {
        consecutiveErrorRuns: consecutiveErrors,
        threshold: CONSECUTIVE_ERROR_THRESHOLD,
      },
    });

    logger.error(
      { sport, consecutiveErrors },
      "Scheduler: critical data-quality alert raised — ESPN feed_fetch_error",
    );
  }
}

// ── Push notification helper ──────────────────────────────────────────────────

/**
 * Query the current effective Strong Buy picks published today and notify Pro
 * subscribers only when that set changes. This lets a pregame data revision
 * notify promptly without re-notifying on unchanged ingestion runs.
 */
async function maybeSendStrongBuyNotification(): Promise<void> {
  const todayEastern = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Find all effective Strong Buy picks on today's Eastern slate.
  const strongBuys = await db
    .select({
      id: publishedPicksTable.id,
      gameId: publishedPicksTable.gameId,
      sport: publishedPicksTable.sport,
    })
    .from(publishedPicksTable)
    .innerJoin(modelPredictionsTable, eq(modelPredictionsTable.id, publishedPicksTable.predictionId))
    .innerJoin(modelVersionsTable, eq(modelVersionsTable.id, modelPredictionsTable.modelVersionId))
    .innerJoin(gamesTable, eq(gamesTable.id, publishedPicksTable.gameId))
    .where(
      and(
        eq(publishedPicksTable.recommendation, "Strong Buy"),
        sql`COALESCE(
          DATE(${gamesTable.startsAt} AT TIME ZONE 'America/New_York'),
          ${gamesTable.gameDate}
        ) = ${todayEastern}`,
        eq(publishedPicksTable.isEffective, true),
        eq(publishedPicksTable.isPublic, true),
        eq(publishedPicksTable.publicationStatus, "PUBLISHED"),
        eq(publishedPicksTable.approvedUnits, 1),
        eq(modelVersionsTable.status, "production"),
        eq(modelPredictionsTable.cohort, "official"),
        eq(modelPredictionsTable.isChallenger, false),
        isPerformanceEligiblePublishedPickSql(publishedPicksTable.id),
      ),
    );

  if (strongBuys.length === 0) {
    lastStrongBuyNotificationSignature = null;
    return;
  }
  const signature = strongBuys.map((pick) => pick.id).sort((a, b) => a - b).join(",");
  if (signature === lastStrongBuyNotificationSignature) return;

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
    lastStrongBuyNotificationSignature = signature;
  } catch (err) {
    logger.error({ err }, "Scheduler: failed to send Strong Buy push notification");
    // Don't update the signature so we retry on the next run.
  }
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

async function runOddsIngestion(): Promise<void> {
  const jobName = "odds-ingestion";
  const startedAt = claimHeavyJob(jobName);
  if (startedAt === null) return;
  let runId: number | null = null;

  try {
    runId = await startRun(jobName);
    const sportResults = await fetchAllSportsDetailed();
    const weights = await db.select().from(modelWeightsTable);
    const weightsBySport = Object.fromEntries(weights.map((w) => [w.sport, w]));

    // Pre-fetch existing game rows so we can detect line movement (opening vs current odds)
    const todayDateStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const existingRows = await db.select({
      id:              gamesTable.id,
      openingHomeOdds: gamesTable.openingHomeOdds,
      openingAwayOdds: gamesTable.openingAwayOdds,
    }).from(gamesTable).where(eq(gamesTable.gameDate, todayDateStr));
    const existingByGameId = new Map(existingRows.map((r) => [r.id, r]));

    /** Convert American moneyline to vig-inclusive implied probability */
    const impliedProb = (odds: number) =>
      odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);

    // Per-sport counts stored in dataSourceFreshness:
    //   number  → games fetched (0 = off-season / no games)
    //   "error" → ESPN fetch failed for that sport
    const sportCounts: Record<string, number | "error"> = {};
    let processed = 0;
    const newlyProducedPredictionIds: number[] = [];

    for (const { sport, games, fetchStatus } of sportResults) {
      if (fetchStatus === "error") {
        sportCounts[sport] = "error";
        continue;
      }

      // Accumulate counts so Soccer sub-leagues (EPL, La Liga, etc.) all
      // contribute to the same "Soccer" entry rather than overwriting it.
      const existing = sportCounts[sport];
      sportCounts[sport] = typeof existing === "number" ? existing + games.length : games.length;

      const DB_SPORTS = new Set(["MLB", "NFL", "NHL", "NCAAF", "NCAAB"]);

      for (const game of games) {
        try {
          const wnbaContext = game.sport === "WNBA" && game.homeTeamId && game.awayTeamId
            ? await getWnbaGameContext({
                homeTeamId: game.homeTeamId,
                awayTeamId: game.awayTeamId,
                gameTime: game.commenceTimeISO,
              })
            : undefined;
          // Fetch advanced team analytics (all cached after first call per run).
          // WNBA: ESPN WNBA stats (4h TTL). NBA: ESPN NBA stats (4h TTL).
          // Soccer: DB goals (1h TTL). MLB/NFL/NHL/NCAAF/NCAAB: DB runs/points (1h TTL).
          const [homeTeamStats, awayTeamStats, homeSoccerStats, awaySoccerStats, homeDbStats, awayDbStats] =
            await Promise.all([
              game.sport === "WNBA"
                ? Promise.resolve(wnbaContext?.home.stats)
                : game.sport === "NBA"
                ? getNbaTeamStats(game.homeTeamId ?? "", game.gameDate)
                : Promise.resolve(undefined),
              game.sport === "WNBA"
                ? Promise.resolve(wnbaContext?.away.stats)
                : game.sport === "NBA"
                ? getNbaTeamStats(game.awayTeamId ?? "", game.gameDate)
                : Promise.resolve(undefined),
              game.sport === "Soccer"
                ? getSoccerTeamStats(game.homeTeamId ?? "", game.gameDate, game.league)
                : Promise.resolve(undefined),
              game.sport === "Soccer"
                ? getSoccerTeamStats(game.awayTeamId ?? "", game.gameDate, game.league)
                : Promise.resolve(undefined),
              DB_SPORTS.has(game.sport)
                ? getDbTeamStats(game.homeTeamId ?? "", game.sport, game.gameDate, game.league)
                : Promise.resolve(undefined),
              DB_SPORTS.has(game.sport)
                ? getDbTeamStats(game.awayTeamId ?? "", game.sport, game.gameDate, game.league)
                : Promise.resolve(undefined),
            ]);

          // ── Phase 2: multi-book odds + pitcher + line movement ─────────────
          const oddsLookup = await getOddsForGameWithStatus(
            game.sport, game.league ?? null, game.homeTeamName, game.awayTeamName, game.commenceTimeISO,
          );
          const gameOdds = oddsLookup.odds;
          const starters = game.sport === "MLB"
            ? await getProbablePitchers(
                game.homeTeamAbbr,
                game.awayTeamAbbr,
                game.gameDate,
                game.commenceTimeISO,
              )
            : { home: null, away: null };
          const pitcherAdvantage = game.sport === "MLB" ? computePitcherAdvantage(starters) : undefined;

          // Line movement: did the home team's implied probability increase since opening?
          const existingRow = existingByGameId.get(game.espnId);
          const espnMarket = {
            homeOdds: game.vegasHomeOdds,
            awayOdds: game.vegasAwayOdds,
            drawOdds: game.vegasDrawOdds,
          };
          const currentMarket = selectActionableMoneylineMarket(
            game.sport,
            oddsLookup,
            espnMarket,
          );
          const currentHomeOdds = currentMarket?.homeOdds;
          const currentAwayOdds = currentMarket?.awayOdds;
          const currentDrawOdds = currentMarket?.drawOdds ?? undefined;
          const lineMovedTowardHome: boolean | undefined =
            existingRow?.openingHomeOdds != null && currentHomeOdds != null
              ? impliedProb(currentHomeOdds) > impliedProb(existingRow.openingHomeOdds)
              : undefined;

          // ── Phase 3: external signals (each service caches; no redundant calls) ──
          const venueWeather = (game.sport === "MLB" || game.sport === "NFL")
            ? await getVenueWeather(game.sport, game.homeTeamAbbr, game.gameDate, game.gameTime ?? "7:00 PM ET")
            : null;
          const weatherEffect = venueWeather && !venueWeather.isDome
            ? computeWeatherEffect(venueWeather, game.sport)
            : null;

          const goalieMatchup = game.sport === "NHL"
            ? await getGoalieMatchup(game.homeTeamAbbr, game.awayTeamAbbr, game.gameDate)
            : null;
          const goalieAdvantage = game.sport === "NHL" && goalieMatchup
            ? computeGoalieAdvantage(goalieMatchup)
            : undefined;

          const [homeNhlST, awayNhlST] = game.sport === "NHL"
            ? await Promise.all([
                getNhlTeamSpecialTeams(game.homeTeamAbbr, game.gameDate),
                getNhlTeamSpecialTeams(game.awayTeamAbbr, game.gameDate),
              ])
            : [null, null] as [null, null];

          const [homeInjury, awayInjury] = game.sport === "NFL"
            ? await Promise.all([
                getTeamInjuryImpact(game.homeTeamAbbr),
                getTeamInjuryImpact(game.awayTeamAbbr),
              ])
            : [null, null] as [null, null];
          const [homeWnbaInj, awayWnbaInj] = game.sport === "WNBA"
            ? [wnbaContext?.home.availability ?? null, wnbaContext?.away.availability ?? null]
            : [null, null] as [null, null];
          const injuryAdvantage =
            game.sport === "NFL"   && homeInjury  && awayInjury
              ? computeInjuryAdvantage(homeInjury, awayInjury)
              : game.sport === "WNBA" && homeWnbaInj && awayWnbaInj
              ? computeWnbaInjuryAdvantage(homeWnbaInj, awayWnbaInj)
              : undefined;

          const bullpenMatchup = game.sport === "MLB"
            ? await getBullpenMatchup(game.homeTeamAbbr, game.awayTeamAbbr, game.gameDate)
            : null;
          const bullpenEffect = game.sport === "MLB" && bullpenMatchup
            ? computeBullpenAdvantage(bullpenMatchup)
            : null;

          const lineupMatchup = game.sport === "MLB"
            ? await getLineupMatchup(
                game.homeTeamAbbr,
                game.awayTeamAbbr,
                game.gameDate,
                game.commenceTimeISO,
              )
            : null;
          // Enrich with career batter–pitcher matchup data (cached 30 min)
          const enrichedLineup = game.sport === "MLB" && lineupMatchup
            ? await enrichLineupMatchup(lineupMatchup, starters)
            : null;
          const lineupAdvantage = game.sport === "MLB" && enrichedLineup
            ? computeLineupAdvantage(
                enrichedLineup.home,
                enrichedLineup.away,
                starters.home?.pitchHand ?? null, // what AWAY batters face
                starters.away?.pitchHand ?? null, // what HOME batters face
              )
            : undefined;
          const parkFactor = game.sport === "MLB"
            ? getParkFactor(game.homeTeamAbbr)
            : undefined;

          const nflSignals = game.sport === "NFL"
            ? await computeNflSituationalSignals(game.homeTeamAbbr, game.awayTeamAbbr, game.gameDate)
            : null;
          const mlbAvailability = {
            homeStarter: starters.home ?? null,
            awayStarter: starters.away ?? null,
            starterQualityReasons: starters.qualityReasons ?? [],
            homeLineupConfirmed: enrichedLineup?.home.confirmed ?? false,
            awayLineupConfirmed: enrichedLineup?.away.confirmed ?? false,
            homeLineup: enrichedLineup?.home ?? null,
            awayLineup: enrichedLineup?.away ?? null,
            homeBullpen: bullpenMatchup?.home ?? null,
            awayBullpen: bullpenMatchup?.away ?? null,
            venueWeather,
            startersMeta: getProbablePitcherCacheMeta(game.gameDate),
            bullpenMeta: getBullpenCacheMeta(game.gameDate),
            lineupsMeta: getLineupCacheMeta(game.gameDate),
            weatherMeta: getVenueWeatherCacheMeta(
              game.sport,
              game.homeTeamAbbr,
              game.gameDate,
              game.gameTime ?? "7:00 PM ET",
            ),
          };
          const mlbEvidence = game.sport === "MLB"
            ? assessMlbDecisionEvidence(game, {
                realVegasHomeOdds: currentHomeOdds,
                realVegasAwayOdds: currentAwayOdds,
                homeDbStats,
                awayDbStats,
              }, mlbAvailability)
            : null;
          // Forecast consumption remains on its existing ingestion path. Cohort
          // and football-intelligence production work is owned by the dedicated
          // NCAAF cycle, which is not subject to this job's heavy lock.
          const ncaafSnapshotAt = new Date();
          const ncaafKickoffAt = new Date(game.commenceTimeISO);
          const ncaafFeature = game.sport === "NCAAF" && ncaafKickoffAt > ncaafSnapshotAt
            ? await createNcaafFeatureSnapshot({
                provider: "espn", eventId: game.espnId, season: ncaafSeasonForDate(game.gameDate),
                kickoffAt: ncaafKickoffAt, homeTeamId: game.homeTeamId ?? null,
                awayTeamId: game.awayTeamId ?? null, homeTeamName: game.homeTeamName,
                awayTeamName: game.awayTeamName, neutralSite: game.neutralSite,
              }, ncaafSnapshotAt)
            : null;
          const ncaafRecommendationBlocked =
            game.sport === "NCAAF" && ncaafFeature?.snapshot.forecast.status !== "ready";

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
              // Consensus odds preferred over ESPN single book
              realVegasHomeOdds: currentHomeOdds,
              realVegasAwayOdds: currentAwayOdds,
              realVegasDrawOdds: currentDrawOdds,
              realVegasOverUnder: gameOdds?.total ?? game.vegasOverUnder,
              // Phase 2 signals
              pinnacleHomeOdds:  gameOdds?.pinnacleHomeOdds,
              pinnacleAwayOdds:  gameOdds?.pinnacleAwayOdds,
              consensusHomeOdds: gameOdds?.consensusHomeOdds,
              consensusAwayOdds: gameOdds?.consensusAwayOdds,
              lineMovedTowardHome,
              pitcherAdvantage,
              // Phase 3 signals
              goalieAdvantage,
              injuryAdvantage,
              bullpenAdvantage:       bullpenEffect?.probabilityAdj,
              bullpenTotalAdjustment: bullpenEffect?.totalAdj,
              lineupAdvantage,
              parkFactor,
              weatherTotalAdjustment: (weatherEffect?.totalAdjustment ?? 0) + (bullpenEffect?.totalAdj ?? 0),
              weatherWindMph:   venueWeather?.windSpeedMph,
              weatherPrecipMm:  venueWeather?.precipitationMm,
              // NHL special teams
              nhlHomeSpecialTeams: homeNhlST ?? undefined,
              nhlAwaySpecialTeams: awayNhlST ?? undefined,
              // NFL situational
              nflIsDivisional:      nflSignals?.isDivisional,
              nflDomeMismatch:      nflSignals?.domeMismatch,
              nflTurnoverAdvantage: nflSignals?.turnoverAdvantage,
              homeTeamStats,
              awayTeamStats,
              homeSoccerStats,
              awaySoccerStats,
              homeDbStats,
              awayDbStats,
              wnbaContext,
              mlbEvidenceMultiplier: mlbEvidence?.confidenceMultiplier,
              mlbRecommendationBlocked: mlbEvidence?.recommendationBlocked,
              ncaafRecommendationBlocked,
              ncaafFeatureSnapshot: ncaafFeature?.snapshot,
              ncaafFeatureMetadata: ncaafFeature ? {
                snapshotId: ncaafFeature.id,
                schemaVersion: ncaafFeature.snapshot.schemaVersion,
                modelVersion: ncaafFeature.snapshot.modelVersion,
                configHash: ncaafFeature.snapshot.configHash,
                inputHash: ncaafFeature.inputHash,
                dataCutoffAt: ncaafFeature.snapshot.cutoff,
                sufficientIndependentEvidence: ncaafFeature.snapshot.quality.sufficientIndependentEvidence,
              } : undefined,
            },
          );
          const decisionContext = createPredictionDecisionContext(
            game,
            weightsBySport[game.sport] ?? null,
            {
              homeHomeRecord: game.homeHomeRecord,
              homeRoadRecord: game.homeRoadRecord,
              awayHomeRecord: game.awayHomeRecord,
              awayRoadRecord: game.awayRoadRecord,
              realVegasHomeOdds: currentHomeOdds,
              realVegasAwayOdds: currentAwayOdds,
              realVegasDrawOdds: currentDrawOdds,
              realVegasOverUnder: gameOdds?.total ?? game.vegasOverUnder,
              pinnacleHomeOdds: gameOdds?.pinnacleHomeOdds,
              pinnacleAwayOdds: gameOdds?.pinnacleAwayOdds,
              consensusHomeOdds: gameOdds?.consensusHomeOdds,
              consensusAwayOdds: gameOdds?.consensusAwayOdds,
              lineMovedTowardHome,
              pitcherAdvantage,
              goalieAdvantage,
              injuryAdvantage,
              bullpenAdvantage: bullpenEffect?.probabilityAdj,
              bullpenTotalAdjustment: bullpenEffect?.totalAdj,
              lineupAdvantage,
              parkFactor,
              weatherTotalAdjustment: (weatherEffect?.totalAdjustment ?? 0) + (bullpenEffect?.totalAdj ?? 0),
              weatherWindMph: venueWeather?.windSpeedMph,
              weatherPrecipMm: venueWeather?.precipitationMm,
              nhlHomeSpecialTeams: homeNhlST ?? undefined,
              nhlAwaySpecialTeams: awayNhlST ?? undefined,
              nflIsDivisional: nflSignals?.isDivisional,
              nflDomeMismatch: nflSignals?.domeMismatch,
              nflTurnoverAdvantage: nflSignals?.turnoverAdvantage,
              homeTeamStats,
              awayTeamStats,
              homeSoccerStats,
              awaySoccerStats,
              homeDbStats,
              awayDbStats,
              mlbEvidenceMultiplier: mlbEvidence?.confidenceMultiplier,
              mlbRecommendationBlocked: mlbEvidence?.recommendationBlocked,
              ncaafRecommendationBlocked,
              ncaafFeatureSnapshot: ncaafFeature?.snapshot,
              ncaafFeatureMetadata: ncaafFeature ? {
                snapshotId: ncaafFeature.id,
                schemaVersion: ncaafFeature.snapshot.schemaVersion,
                modelVersion: ncaafFeature.snapshot.modelVersion,
                configHash: ncaafFeature.snapshot.configHash,
                inputHash: ncaafFeature.inputHash,
                dataCutoffAt: ncaafFeature.snapshot.cutoff,
                sufficientIndependentEvidence: ncaafFeature.snapshot.quality.sufficientIndependentEvidence,
              } : undefined,
            },
            {
              ...mlbAvailability,
              homeGoalie: goalieMatchup?.home ?? null,
              awayGoalie: goalieMatchup?.away ?? null,
              homeInjuries: game.sport === "NFL" ? homeInjury?.keyInjuries ?? [] :
                game.sport === "WNBA" ? homeWnbaInj?.keyInjuries ?? [] : [],
              awayInjuries: game.sport === "NFL" ? awayInjury?.keyInjuries ?? [] :
                game.sport === "WNBA" ? awayWnbaInj?.keyInjuries ?? [] : [],
              wnbaContext,
            },
            mlbEvidence ?? undefined,
            ncaafFeature ? {
              snapshotId: ncaafFeature.id,
              schemaVersion: ncaafFeature.snapshot.schemaVersion,
              modelVersion: ncaafFeature.snapshot.modelVersion,
              configHash: ncaafFeature.snapshot.configHash,
              inputHash: ncaafFeature.inputHash,
              dataCutoffAt: ncaafFeature.snapshot.cutoff,
              sufficientIndependentEvidence: ncaafFeature.snapshot.quality.sufficientIndependentEvidence,
            } : undefined,
          );
          const servingBoundary = await resolveProductionPredictionBoundary(game, proj, decisionContext);
          if (shouldRunIncumbentSnapshot(servingBoundary)) {
            const predictionId = await processGameSnapshot(game, servingBoundary.projection, decisionContext, {
              odds: gameOdds,
              homeTeamStats,
              awayTeamStats,
              homeDbStats,
              awayDbStats,
            }, true);
            if (predictionId != null) newlyProducedPredictionIds.push(predictionId);
          }
          if (game.sport === "MLB" && mlbEvidence) {
            try {
              await writeMlbV4ShadowPrediction(game, {
                homeDbStats,
                awayDbStats,
                starters,
                lineups: enrichedLineup,
                bullpen: bullpenMatchup,
                parkFactor,
                weather: venueWeather,
                weatherTotalAdjustment: weatherEffect?.totalAdjustment ?? 0,
                evidence: mlbEvidence,
                market: {
                  homeOdds: currentMarket?.homeOdds,
                  awayOdds: currentMarket?.awayOdds,
                  pinnacleHomeOdds: gameOdds?.pinnacleHomeOdds,
                  pinnacleAwayOdds: gameOdds?.pinnacleAwayOdds,
                  consensusHomeOdds: gameOdds?.consensusHomeOdds,
                  consensusAwayOdds: gameOdds?.consensusAwayOdds,
                },
              });
            } catch (err) {
              logger.error(
                { err, gameId: game.espnId },
                "Scheduler: MLB V4 shadow write failed (non-fatal)",
              );
            }
          }
          processed++;
        } catch (err) {
          logger.warn({ err, gameId: game.espnId }, "Scheduler: odds-ingestion game error");
        }
      }
    }

    // All sports have now contributed their incumbent candidates.  Apply the
    // deterministic policy once, rather than allowing ESPN/provider order to
    // consume the daily public capacity.
    if (newlyProducedPredictionIds.length > 0) {
      await publishDownstreamCandidates(newlyProducedPredictionIds);
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

    // Auto-resolve any stale alerts for sports that returned games.
    await autoResolveSportAlerts(sportCounts);

    // Check for data quality issues after recording this run's counts.
    // Pass runId so the query excludes the just-written row and avoids double-counting.
    await checkAndRaiseSportAlerts(runId, sportCounts);

    // Raise critical alerts for sports where ESPN fetch is consistently failing.
    await checkAndRaiseFetchErrorAlerts(runId, sportCounts);

    // Notify when the current effective Strong Buy set changes.
    await maybeSendStrongBuyNotification();

    logger.info({ processed, sportCounts }, "Scheduler: odds-ingestion complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (runId !== null) await finishRun(runId, "failed", 0, msg);
    logger.error({ err }, "Scheduler: odds-ingestion failed");
  } finally {
    releaseHeavyJob(jobName, startedAt);
  }
}

async function runResultGrading(): Promise<void> {
  const jobName = "result-grading";
  const startedAt = claimHeavyJob(jobName);
  if (startedAt === null) return;
  let runId: number | null = null;

  try {
    runId = await startRun(jobName);
    // First pull fresh game data so finals are up to date
    const games = await fetchAllSports();
    const weights = await db.select().from(modelWeightsTable);
    const weightsBySport = Object.fromEntries(weights.map((w) => [w.sport, w]));
    const DB_SPORTS_GRADING = new Set(["MLB", "NFL", "NHL", "NCAAF", "NCAAB"]);
    let snapshots = 0;
    for (const game of games) {
      try {
        const wnbaContext = game.sport === "WNBA" && game.homeTeamId && game.awayTeamId
          ? await getWnbaGameContext({
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              gameTime: game.commenceTimeISO,
            })
          : undefined;
        const [homeTeamStats, awayTeamStats, homeSoccerStats, awaySoccerStats, homeDbStats, awayDbStats] =
          await Promise.all([
            game.sport === "WNBA"
              ? Promise.resolve(wnbaContext?.home.stats)
              : game.sport === "NBA"
              ? getNbaTeamStats(game.homeTeamId ?? "", game.gameDate)
              : Promise.resolve(undefined),
            game.sport === "WNBA"
              ? Promise.resolve(wnbaContext?.away.stats)
              : game.sport === "NBA"
              ? getNbaTeamStats(game.awayTeamId ?? "", game.gameDate)
              : Promise.resolve(undefined),
            game.sport === "Soccer"
              ? getSoccerTeamStats(game.homeTeamId ?? "", game.gameDate, game.league)
              : Promise.resolve(undefined),
            game.sport === "Soccer"
              ? getSoccerTeamStats(game.awayTeamId ?? "", game.gameDate, game.league)
              : Promise.resolve(undefined),
            DB_SPORTS_GRADING.has(game.sport)
              ? getDbTeamStats(game.homeTeamId ?? "", game.sport, game.gameDate, game.league)
              : Promise.resolve(undefined),
            DB_SPORTS_GRADING.has(game.sport)
              ? getDbTeamStats(game.awayTeamId ?? "", game.sport, game.gameDate, game.league)
              : Promise.resolve(undefined),
          ]);

        // Phase 2 + 3 signals (all services cache internally; no extra HTTP overhead)
        const oddsLookup = await getOddsForGameWithStatus(
          game.sport, game.league ?? null, game.homeTeamName, game.awayTeamName, game.commenceTimeISO,
        );
        const gameOdds = oddsLookup.odds;
        const starters = game.sport === "MLB"
          ? await getProbablePitchers(
              game.homeTeamAbbr,
              game.awayTeamAbbr,
              game.gameDate,
              game.commenceTimeISO,
            )
          : { home: null, away: null };
        const pitcherAdvantage = game.sport === "MLB" ? computePitcherAdvantage(starters) : undefined;

        const venueWeather = (game.sport === "MLB" || game.sport === "NFL")
          ? await getVenueWeather(game.sport, game.homeTeamAbbr, game.gameDate, game.gameTime ?? "7:00 PM ET")
          : null;
        const weatherEffect = venueWeather && !venueWeather.isDome
          ? computeWeatherEffect(venueWeather, game.sport)
          : null;

        const goalieMatchup = game.sport === "NHL"
          ? await getGoalieMatchup(game.homeTeamAbbr, game.awayTeamAbbr, game.gameDate)
          : null;
        const goalieAdvantage = game.sport === "NHL" && goalieMatchup
          ? computeGoalieAdvantage(goalieMatchup)
          : undefined;

        const [homeNhlST, awayNhlST] = game.sport === "NHL"
          ? await Promise.all([
              getNhlTeamSpecialTeams(game.homeTeamAbbr, game.gameDate),
              getNhlTeamSpecialTeams(game.awayTeamAbbr, game.gameDate),
            ])
          : [null, null] as [null, null];

        const [homeInjury, awayInjury] = game.sport === "NFL"
          ? await Promise.all([
              getTeamInjuryImpact(game.homeTeamAbbr),
              getTeamInjuryImpact(game.awayTeamAbbr),
            ])
          : [null, null] as [null, null];
        const [homeWnbaInj, awayWnbaInj] = game.sport === "WNBA"
          ? [wnbaContext?.home.availability ?? null, wnbaContext?.away.availability ?? null]
          : [null, null] as [null, null];
        const injuryAdvantage =
          game.sport === "NFL"  && homeInjury  && awayInjury
            ? computeInjuryAdvantage(homeInjury, awayInjury)
            : game.sport === "WNBA" && homeWnbaInj && awayWnbaInj
            ? computeWnbaInjuryAdvantage(homeWnbaInj, awayWnbaInj)
            : undefined;

        const bullpenMatchup = game.sport === "MLB"
          ? await getBullpenMatchup(game.homeTeamAbbr, game.awayTeamAbbr, game.gameDate)
          : null;
        const bullpenEffect = game.sport === "MLB" && bullpenMatchup
          ? computeBullpenAdvantage(bullpenMatchup)
          : null;

        const lineupMatchup = game.sport === "MLB"
          ? await getLineupMatchup(
              game.homeTeamAbbr,
              game.awayTeamAbbr,
              game.gameDate,
              game.commenceTimeISO,
            )
          : null;
        const enrichedLineup = game.sport === "MLB" && lineupMatchup
          ? await enrichLineupMatchup(lineupMatchup, starters)
          : null;
        const lineupAdvantage = game.sport === "MLB" && enrichedLineup
          ? computeLineupAdvantage(
              enrichedLineup.home,
              enrichedLineup.away,
              starters.home?.pitchHand ?? null,
              starters.away?.pitchHand ?? null,
            )
          : undefined;
        const parkFactor = game.sport === "MLB"
          ? getParkFactor(game.homeTeamAbbr)
          : undefined;

        const nflSignals = game.sport === "NFL"
          ? await computeNflSituationalSignals(game.homeTeamAbbr, game.awayTeamAbbr, game.gameDate)
          : null;

        const espnMarket = {
          homeOdds: game.vegasHomeOdds,
          awayOdds: game.vegasAwayOdds,
          drawOdds: game.vegasDrawOdds,
        };
        const currentMarket = selectActionableMoneylineMarket(
          game.sport,
          oddsLookup,
          espnMarket,
        );

        const projectionOptions: ComputeOptions = {
          homeHomeRecord:    game.homeHomeRecord,
          homeRoadRecord:    game.homeRoadRecord,
          awayHomeRecord:    game.awayHomeRecord,
          awayRoadRecord:    game.awayRoadRecord,
          realVegasHomeOdds: currentMarket?.homeOdds,
          realVegasAwayOdds: currentMarket?.awayOdds,
          realVegasDrawOdds: currentMarket?.drawOdds ?? undefined,
          realVegasOverUnder: gameOdds?.total ?? game.vegasOverUnder,
          pinnacleHomeOdds:  gameOdds?.pinnacleHomeOdds,
          pinnacleAwayOdds:  gameOdds?.pinnacleAwayOdds,
          consensusHomeOdds: gameOdds?.consensusHomeOdds,
          consensusAwayOdds: gameOdds?.consensusAwayOdds,
          pitcherAdvantage,
          goalieAdvantage,
          injuryAdvantage,
          bullpenAdvantage:       bullpenEffect?.probabilityAdj,
          bullpenTotalAdjustment: bullpenEffect?.totalAdj,
          lineupAdvantage,
          parkFactor,
          weatherTotalAdjustment: (weatherEffect?.totalAdjustment ?? 0) + (bullpenEffect?.totalAdj ?? 0),
          weatherWindMph:   venueWeather?.windSpeedMph,
          weatherPrecipMm:  venueWeather?.precipitationMm,
          nhlHomeSpecialTeams: homeNhlST ?? undefined,
          nhlAwaySpecialTeams: awayNhlST ?? undefined,
          nflIsDivisional:      nflSignals?.isDivisional,
          nflDomeMismatch:      nflSignals?.domeMismatch,
          nflTurnoverAdvantage: nflSignals?.turnoverAdvantage,
          homeTeamStats,
          awayTeamStats,
          homeSoccerStats,
          awaySoccerStats,
          homeDbStats,
          awayDbStats,
          wnbaContext,
        };
        if (game.sport === "NCAAF" && new Date(game.commenceTimeISO) > new Date()) {
          const ncaafFeature = await createNcaafFeatureSnapshot({
            provider: "espn",
            eventId: game.espnId,
            season: ncaafSeasonForDate(game.gameDate),
            kickoffAt: new Date(game.commenceTimeISO),
            homeTeamId: game.homeTeamId ?? null,
            awayTeamId: game.awayTeamId ?? null,
            homeTeamName: game.homeTeamName,
            awayTeamName: game.awayTeamName,
            neutralSite: game.neutralSite,
          }, new Date());
          projectionOptions.ncaafFeatureSnapshot = ncaafFeature.snapshot;
          projectionOptions.ncaafRecommendationBlocked = ncaafFeature.snapshot.forecast.status !== "ready";
          projectionOptions.ncaafFeatureMetadata = {
            snapshotId: ncaafFeature.id,
            schemaVersion: ncaafFeature.snapshot.schemaVersion,
            modelVersion: ncaafFeature.snapshot.modelVersion,
            configHash: ncaafFeature.snapshot.configHash,
            inputHash: ncaafFeature.inputHash,
            dataCutoffAt: ncaafFeature.snapshot.cutoff,
            sufficientIndependentEvidence: ncaafFeature.snapshot.quality.sufficientIndependentEvidence,
          };
        }
        const mlbAvailability = {
          homeStarter: starters.home ?? null,
          awayStarter: starters.away ?? null,
          starterQualityReasons: starters.qualityReasons ?? [],
          homeLineupConfirmed: enrichedLineup?.home.confirmed ?? false,
          awayLineupConfirmed: enrichedLineup?.away.confirmed ?? false,
          homeLineup: enrichedLineup?.home ?? null,
          awayLineup: enrichedLineup?.away ?? null,
          homeBullpen: bullpenMatchup?.home ?? null,
          awayBullpen: bullpenMatchup?.away ?? null,
          venueWeather,
          startersMeta: getProbablePitcherCacheMeta(game.gameDate),
          bullpenMeta: getBullpenCacheMeta(game.gameDate),
          lineupsMeta: getLineupCacheMeta(game.gameDate),
          weatherMeta: getVenueWeatherCacheMeta(
            game.sport,
            game.homeTeamAbbr,
            game.gameDate,
            game.gameTime ?? "7:00 PM ET",
          ),
        };
        let mlbEvidence;
        if (game.sport === "MLB") {
          mlbEvidence = assessMlbDecisionEvidence(game, projectionOptions, mlbAvailability);
          projectionOptions.mlbEvidenceMultiplier = mlbEvidence.confidenceMultiplier;
          projectionOptions.mlbRecommendationBlocked = mlbEvidence.recommendationBlocked;
        }

        const proj = computeProjection(
          game.espnId,
          game.sport,
          game.homeTeamRecord,
          game.awayTeamRecord,
          weightsBySport[game.sport] ?? null,
          projectionOptions,
        );
        const decisionContext = createPredictionDecisionContext(
          game,
          weightsBySport[game.sport] ?? null,
          projectionOptions,
          {
            ...mlbAvailability,
            homeGoalie: goalieMatchup?.home ?? null,
            awayGoalie: goalieMatchup?.away ?? null,
            homeInjuries: game.sport === "NFL" ? homeInjury?.keyInjuries ?? [] :
              game.sport === "WNBA" ? homeWnbaInj?.keyInjuries ?? [] : [],
            awayInjuries: game.sport === "NFL" ? awayInjury?.keyInjuries ?? [] :
              game.sport === "WNBA" ? awayWnbaInj?.keyInjuries ?? [] : [],
            wnbaContext,
          },
          mlbEvidence,
          projectionOptions.ncaafFeatureMetadata,
        );
        const servingBoundary = await resolveProductionPredictionBoundary(game, proj, decisionContext);
        if (shouldRunIncumbentSnapshot(servingBoundary)) {
          await processGameSnapshot(game, servingBoundary.projection, decisionContext, {
            odds: gameOdds,
            homeTeamStats,
            awayTeamStats,
            homeDbStats,
            awayDbStats,
          });
        }
        // Separate, append-only market research capture.  Reuses the odds
        // observation already fetched above; it has no sports-feature or model
        // consumer and makes no additional provider request.
        if (game.sport === "MLB" && currentMarket?.homeOdds != null && currentMarket?.awayOdds != null) {
          const capturedAt = new Date();
          const gameStart = new Date(game.commenceTimeISO);
          if (Number.isFinite(gameStart.getTime()) && capturedAt < gameStart) {
            const minutes = (gameStart.getTime() - capturedAt.getTime()) / 60_000;
            const state = minutes <= 15 ? "T_MINUS_15" : minutes <= 30 ? "T_MINUS_30"
              : minutes <= 60 ? "T_MINUS_60" : minutes <= 120 ? "T_MINUS_120" : "EARLY_MARKET";
            await captureMlbResearchMarketObservation({
              gameId: game.espnId, gameStart, capturedAt, state, sportsbook: "existing_odds_lookup",
              homeOdds: currentMarket.homeOdds, awayOdds: currentMarket.awayOdds, source: "existing_scheduler_odds_observation",
            });
          }
        }
        if (game.sport === "MLB" && mlbEvidence) {
          try {
            await writeMlbV4ShadowPrediction(game, {
              homeDbStats,
              awayDbStats,
              starters,
              lineups: enrichedLineup,
              bullpen: bullpenMatchup,
              parkFactor,
              weather: venueWeather,
              weatherTotalAdjustment: weatherEffect?.totalAdjustment ?? 0,
              evidence: mlbEvidence,
              market: {
                homeOdds: currentMarket?.homeOdds,
                awayOdds: currentMarket?.awayOdds,
                pinnacleHomeOdds: gameOdds?.pinnacleHomeOdds,
                pinnacleAwayOdds: gameOdds?.pinnacleAwayOdds,
                consensusHomeOdds: gameOdds?.consensusHomeOdds,
                consensusAwayOdds: gameOdds?.consensusAwayOdds,
              },
            });
          } catch (err) {
            logger.error(
              { err, gameId: game.espnId },
              "Scheduler: MLB V4 shadow write failed (non-fatal)",
            );
          }
        }
        snapshots++;
      } catch (_) { /* continue */ }
    }

    // Sync game_results from games already marked "final" (primary grading path)
    await syncGameResults();

    // Recover any games stuck in non-final status from past dates
    const recovered = await recoverStaleGames();
    if (recovered > 0) {
      logger.info({ recovered }, "Scheduler: stale games recovered");
    }

    const graded = await runGrading();
    await runLearning();
    const forecastReviews = await runForecastReviews();
    // Challenger validation is isolated and non-fatal. It reads immutable NCAAF
    // ledgers only and never writes publication, grading, or learning records.
    try {
      const ncaafValidation = await runNcaafValidationCycle();
      logger.info(ncaafValidation, "Scheduler: NCAAF validation cycle completed");
    } catch (err) {
      logger.error({ err }, "Scheduler: NCAAF validation cycle failed (non-fatal)");
    }

    await finishRun(runId, "completed", graded + forecastReviews.inserted);
    logger.info({ snapshots, recovered, graded, forecastReviews }, "Scheduler: result-grading complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (runId !== null) await finishRun(runId, "failed", 0, msg);
    logger.error({ err }, "Scheduler: result-grading failed");
  } finally {
    releaseHeavyJob(jobName, startedAt);
  }
}

async function runAnalyticsRefresh(): Promise<void> {
  const jobName = "analytics-refresh";
  const startedAt = claimHeavyJob(jobName);
  if (startedAt === null) return;
  let runId: number | null = null;

  try {
    runId = await startRun(jobName);
    const rowsWritten = await runAnalytics();
    const spreadLifecycles = await refreshAllSpreadApprovalLifecycles();
    await finishRun(runId, "completed", rowsWritten + spreadLifecycles);
    logger.info(
      { rowsWritten, spreadLifecycles },
      "Scheduler: analytics and market lifecycle refresh complete",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (runId !== null) await finishRun(runId, "failed", 0, msg);
    logger.error({ err }, "Scheduler: analytics-refresh failed");
  } finally {
    releaseHeavyJob(jobName, startedAt);
  }
}

export async function runStartupCatchUp(): Promise<void> {
  const jobName = "startup-catch-up";
  const startedAt = claimHeavyJob(jobName);
  if (startedAt === null) return;
  let runId: number | null = null;
  try {
    runId = await startRun(jobName);
    const recovered = await recoverStaleGames();
    const synced = await syncGameResults();
    const graded = await runGrading();
    await runLearning();
    const forecastReviews = await runForecastReviews();
    await finishRun(
      runId,
      "completed",
      recovered + synced + graded + forecastReviews.inserted,
    );
    logger.info(
      { recovered, synced, graded, forecastReviews },
      "Startup catch-up completed",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (runId !== null) await finishRun(runId, "failed", 0, msg);
    logger.warn({ err }, "Startup catch-up failed — non-fatal");
  } finally {
    releaseHeavyJob(jobName, startedAt);
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

async function runPushReceiptCheck(): Promise<void> {
  const jobName = "push-receipt-check";
  if (runningJobs.has(jobName)) {
    logger.debug("Scheduler: push-receipt-check already running, skipping");
    return;
  }

  runningJobs.add(jobName);
  try {
    await checkPendingPushReceipts();
  } catch (err) {
    logger.warn({ err }, "Scheduler: push-receipt-check failed — non-fatal");
  } finally {
    runningJobs.delete(jobName);
  }
}

/**
 * Prune push tokens that have been inactive for more than 30 days.
 * This keeps the push_tokens table clean and avoids re-querying permanently
 * dead tokens on every future send cycle.
 */
async function runPushTokenCleanup(): Promise<void> {
  const jobName = "push-token-cleanup";
  if (runningJobs.has(jobName)) {
    logger.debug("Scheduler: push-token-cleanup already running, skipping");
    return;
  }

  runningJobs.add(jobName);
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await db
      .delete(pushTokensTable)
      .where(
        and(
          eq(pushTokensTable.isActive, false),
          lt(pushTokensTable.updatedAt, thirtyDaysAgo),
        ),
      )
      .returning({ id: pushTokensTable.id });

    logger.info(
      { pruned: result.length },
      "Scheduler: pruned stale inactive push tokens (>30 days)",
    );
  } catch (err) {
    logger.warn({ err }, "Scheduler: push-token-cleanup failed — non-fatal");
  } finally {
    runningJobs.delete(jobName);
  }
}

/** Research-only #214B capture; bounded to new, still-pregame #213 FINAL rows. */
async function runMlbAdvancedResearchCapture(): Promise<void> {
  const jobName = "mlb-advanced-research-capture";
  const startedAt = claimHeavyJob(jobName);
  if (startedAt === null) return;
  let runId: number | null = null;
  try {
    runId = await startRun(jobName);
    const results = await collectLiveForwardAdvancedResearch();
    await finishRun(runId, "completed", results.length, undefined, {
      mode: "LIVE_FORWARD_ONLY", providerCalls: 0,
      snapshotsCreated: results.filter((r) => r.snapshotId != null).length,
      candidateEvidenceCaptured: results.reduce((n, r) => n + r.captured.length, 0),
      skipped: results.flatMap((r) => r.skipped).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (runId !== null) await finishRun(runId, "failed", 0, message);
    logger.warn({ err }, "Scheduler: MLB advanced research capture failed — non-fatal");
  } finally {
    releaseHeavyJob(jobName, startedAt);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start all scheduled jobs. Call once at server startup.
 */
export function startScheduler(): void {
  // NFL V4 prospective forecasts are append-only, shadow-only, and isolated
  // from official pick generation and the shared heavy-job lock.
  cron.schedule("7,37 * * * *", () => {
    const jobName = "nfl-v4-evidence-tick";
    const claim = nflV4EvidenceJobs.acquire(jobName);
    if (!claim.acquired) return;
    void runNflV4ProspectiveCollection().catch((err) =>
      logger.warn({ err }, "Scheduler: NFL V4 evidence tick failed — non-fatal"))
      .finally(() => nflV4EvidenceJobs.release(jobName));
  }, { timezone: "America/New_York" });
  // One MLB-only schedule request per 30-minute tick. The runtime captures only
  // 720/360/180/60/30-minute due windows; discovery/final pairing still runs.
  cron.schedule("*/30 * * * *", () => {
    const jobName = "mlb-v4-evidence-tick";
    const claim = mlbV4EvidenceJobs.acquire(jobName);
    if (!claim.acquired) return;
    void runScheduledMlbV4EvidenceCollection().catch((err) =>
      logger.warn({ err }, "Scheduler: MLB V4 evidence tick failed — recorded/non-fatal"))
      .finally(() => mlbV4EvidenceJobs.release(jobName));
  }, { timezone: "America/New_York" });
  // Odds ingestion — every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    void runOddsIngestion();
  });
  // Independent from the all-sport heavy-job lock; NCAAF must not miss its
  // pregame evidence window when MLB research is running.
  cron.schedule("2,17,32,47 * * * *", () => {
    void runNcaafProductionEvidenceCycle();
  });
  // No provider fan-out: consumes only newly persisted #213 FINAL_PREGAME rows.
  cron.schedule("*/5 * * * *", () => {
    void runMlbAdvancedResearchCapture();
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

  // Push receipt checker — every 30 minutes, offset by 5 to avoid colliding with odds ingestion
  cron.schedule("5,35 * * * *", () => {
    void runPushReceiptCheck();
  });

  // Push token cleanup — daily at 3 AM Eastern time (DST-aware), prunes tokens inactive >30 days
  cron.schedule("0 3 * * *", () => {
    void runPushTokenCleanup();
  }, { timezone: "America/New_York" });

  // Warm up team stats cache in the background so the first game refresh
  // has advanced analytics immediately available.
  warmUpTeamStatsCache();
  // Start prospective evidence work immediately. Historical performance
  // repair can issue many date captures, so it must never hold the critical
  // FINAL_PREGAME capture/assignment path behind its completion.
  void runNcaafProductionEvidenceCycle();
  void runNflV4ProspectiveCollection()
    .catch((err) => logger.warn({ err }, "Scheduler: NFL V4 startup evidence capture failed — non-fatal"));
  // One bounded, non-blocking catch-up after registration repairs missing
  // completed-game performance evidence. It is intentionally independent of
  // the prospective cycle above.
  void bootstrapMissingNcaafPerformanceEvidence()
    .then(async (bootstrap) => {
      logger.info(bootstrap, "Scheduler: NCAAF completed-game bootstrap finished");
      const historical = await materializeNcaafHistoricalTrainingRows();
      logger.info(historical, "Scheduler: NCAAF PIT-safe historical training rows materialized");
    })
    .catch((err) => logger.error({ err }, "Scheduler: NCAAF startup evidence catch-up failed"));

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
  mlbAdvancedResearchCapture: runMlbAdvancedResearchCapture,
  mlbV4EvidenceCollection: runScheduledMlbV4EvidenceCollection,
  ncaafProductionEvidenceCycle: runNcaafProductionEvidenceCycle,
  ncaafPerformanceBootstrap: bootstrapMissingNcaafPerformanceEvidence,
  ncaafHistoricalTrainingMaterialization: materializeNcaafHistoricalTrainingRows,
  nflV4ProspectiveCollection: runNflV4ProspectiveCollection,
};

/**
 * Exported for testing only. Do not call directly in production code.
 * @internal
 */
export {
  checkAndRaiseSportAlerts as _checkAndRaiseSportAlerts,
  autoResolveSportAlerts as _autoResolveSportAlerts,
  checkAndRaiseFetchErrorAlerts as _checkAndRaiseFetchErrorAlerts,
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
