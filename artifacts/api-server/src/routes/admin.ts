/**
 * Admin API endpoints.
 *
 * All routes require the X-Master-Key header matching MASTER_API_KEY env var.
 *
 * GET  /api/admin/overview          — KPIs, alert counts, grading status
 * GET  /api/admin/automation        — recent automation run history
 * GET  /api/admin/alerts            — active drift + data-quality alerts
 * GET  /api/admin/publication-decisions — downstream wager decision audit
 * POST /api/admin/alerts/:id/resolve  — resolve an alert
 * GET  /api/admin/backtests         — list backtest runs
 * POST /api/admin/backtests         — trigger a new backtest
 * POST /api/admin/jobs/:name/trigger  — manually trigger a scheduler job
 * POST /api/admin/models/:id/deploy   — promote model to production (alias)
 * POST /api/admin/models/:id/rollback — rollback to previous production
 */

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createHash } from "crypto";
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { adminLimiter, sessionAuthLimiter } from "../middleware/rateLimiter";
import {
  db,
  automationRunsTable,
  backtestRunsTable,
  dataQualityAlertsTable,
  gamesTable,
  modelDriftAlertsTable,
  modelPredictionsTable,
  modelVersionsTable,
  performanceMetricsTable,
  pickResultsTable,
  publishedPicksTable,
  spreadModelConfigsTable,
  spreadPredictionsTable,
  sportSnoozesTable,
  subscribersTable,
  trainingDatasetsTable,
  mlbFeatureSnapshotsTable,
  mlbForecastEvidenceTable,
  mlbOosCohortsTable,
  mlbAdvancedResearchEvidenceTable,
  mlbAdvancedFeatureSnapshotsTable,
  ncaafEvidenceRunsTable,
  ncaafGameEvidenceTable,
  ncaafEntityObservationsTable,
  ncaafMarketObservationsTable,
  ncaafFeatureSnapshotsTable,
  ncaafFootballIntelligenceSnapshotsTable,
  ncaafEvaluationsTable,
  ncaafWalkForwardRunsTable,
  ncaafPromotionDecisionsTable,
  ncaafTeamGamePerformanceTable,
  ncaafPregameCohortAssignmentsTable,
  ncaafCollegeFootballDataEvidenceTable,
  ncaafCfbdDomainEvidenceTable,
  ncaafCfbdGameMappingsTable,
  ncaafCfbdPlayerMappingsTable,
  ncaafCfbdProviderHealthTable,
  ncaafCfbdTeamMappingsTable,
  publishedPickPerformanceClassificationsTable,
} from "@workspace/db";
import { runBacktest } from "../services/backtesting";
import { transitionModelStatus, rollbackModel } from "../services/modelRegistry";
import { schedulerJobs, getAutomationRuns } from "../services/scheduler";
import { runDriftMonitor } from "../services/driftMonitor";
import { logger } from "../lib/logger";
import {
  applyMlbPolicyRevision,
  listMlbPolicyRevisionAudit,
} from "../services/mlbPolicyRevisions";
import {
  listForecastReviews,
  queryForecastMetrics,
  runForecastReviews,
  type ForecastQualification,
  type ForecastSegment,
} from "../services/forecastReviews";
import {
  compareMlbQualificationPolicies,
  DEFAULT_MLB_SHADOW_BUY_THRESHOLD,
  evaluateMlbShadowPolicy,
  summarizeMlbQualificationAudits,
  type GradedMlbDecision,
  type MlbQualificationAudit,
} from "../services/mlbQualificationAudit";
import {
  SPREAD_CONFIGS,
  computeSpreadValidationMetrics,
  choosePrimaryMarket,
  scoreMarketCandidate,
  spreadToMarketSelectionCandidate,
  getLatestSpreadCandidates,
  getLatestSpreadCandidatesForAdmin,
  promoteSpreadModel,
  suspendSpreadModel,
  refreshSpreadValidationMetrics,
  type SpreadSport,
} from "../services/spreadModel";
import {
  appendMarketApprovalDecision,
  deriveApprovalStatus,
  listLatestMarketApprovalDecisions,
  MARKET_APPROVAL_STATUSES,
  getMoneylinePublicationPermissionsForGames,
  type ApprovalLayerResult,
  type MarketApprovalStatus,
} from "../services/marketApproval";
import { LIVE_FORWARD_CANDIDATE_NEEDS_OOS, MLB_215_READY_FEATURES, MLB_215_UNAVAILABLE_FEATURES, NOT_SUPPORTED, PARTIAL_OR_INCONSISTENT } from "../services/mlbAdvancedFeatureRegistry";
import {
  classifyRecommendationPublication,
  summarizeRecommendationPublication,
} from "../services/recommendationPublicationAudit";
import {
  NCAAF_PROVIDER_CAPABILITIES,
  getNcaafReadinessBlockers,
} from "../services/ncaafProviderCapabilities";
import { getNcaafV4ProjectionBoard } from "../services/ncaafV4GameDay";
import {
  parseNcaafV2CoreBackfillCursor,
  runNcaafV2CoreBackfill,
} from "../services/ncaafV2CoreBackfill";
import { getGuardedServingRuntimeStatus } from "../services/guardedServing/runtimeStatus";
import {
  runMlbRealSlateDryRun,
  runNcaafRealSlateDryRun,
} from "../services/guardedServing/dryRun";
import { appendGovernedApprovalDecision } from "../services/guardedServing/approvalRegistry";
import type { ApprovalState, ExactArtifactIdentity } from "../services/guardedServing/types";

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

/**
 * Returns a server-verified administrator principal. Session principals use a
 * one-way token fingerprint so approval identities are distinguishable without
 * persisting or exposing the session secret.
 */
export function getVerifiedAdminPrincipal(req: Request): string | null {
  if (!MASTER_KEY) return null;
  const sessionToken = req.headers["x-admin-token"] as string | undefined;
  if (sessionToken && isValidSession(sessionToken)) {
    const fingerprint = createHash("sha256").update(sessionToken).digest("hex").slice(0, 16);
    return `admin-session:${fingerprint}`;
  }
  const key = req.headers["x-master-key"] as string | undefined;
  return key === MASTER_KEY ? "master-key" : null;
}

function requireMasterKey(req: Request, res: Response, next: NextFunction): void {
  if (!MASTER_KEY) {
    // Fail-closed: a missing MASTER_API_KEY is always a hard error.
    // NODE_ENV may be unset or misconfigured in production, so we never
    // use it as a bypass gate — an absent key is never safe to ignore.
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

  const key = req.headers["x-master-key"] as string | undefined;
  if (!key || key !== MASTER_KEY) {
    recordFailedAttempt(ip);
    res.status(401).json({ error: "Invalid key" });
    return;
  }

  // Successful auth — clear failed attempt counter
  clearFailedAttempts(ip);

  pruneExpiredSessions();
  const token = crypto.randomUUID();
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

/** Actual config, exact approval ledger, evidence, prediction and fallback state. */
router.get("/admin/model-runtime-status", async (req, res): Promise<void> => {
  try {
    res.json(await getGuardedServingRuntimeStatus());
  } catch (error) {
    req.log?.error({ error }, "Guarded model runtime status failed");
    res.status(500).json({ error: "Unable to resolve guarded model runtime status" });
  }
});

/** Auditable real-slate traversal. This endpoint never creates a public pick. */
router.post("/admin/model-runtime-dry-run", async (req, res): Promise<void> => {
  const sport = req.body?.sport;
  if (sport !== "MLB" && sport !== "NCAAF") {
    res.status(400).json({ error: "sport must be MLB or NCAAF" });
    return;
  }
  try {
    res.json(sport === "MLB"
      ? await runMlbRealSlateDryRun()
      : await runNcaafRealSlateDryRun());
  } catch (error) {
    req.log?.error({ error, sport }, "Guarded real-slate dry-run failed");
    res.status(500).json({ error: error instanceof Error ? error.message : "Guarded dry-run failed" });
  }
});

/**
 * Explicit governed action only. Merely configuring a serving mode or meeting
 * review thresholds never calls this endpoint and never changes approval.
 */
router.post("/admin/model-artifact-approvals", async (req, res): Promise<void> => {
  const actor = getVerifiedAdminPrincipal(req);
  const body = req.body as Partial<ExactArtifactIdentity> & {
    state?: ApprovalState; reason?: string; evidenceReference?: string;
  };
  const required = [
    "sport", "market", "modelFamily", "modelId", "modelVersion",
    "artifactId", "artifactHash", "inputContractVersion",
    "state", "reason", "evidenceReference",
  ] as const;
  if (!actor || required.some((key) => typeof body[key] !== "string" || !String(body[key]).trim())) {
    res.status(400).json({ error: "Complete exact artifact identity, state, reason, and evidenceReference are required" });
    return;
  }
  if (!["MLB", "NCAAF", "NFL"].includes(body.sport!)
    || !["UNVALIDATED", "SHADOW_APPROVED", "GUARDED_APPROVED", "FULL_APPROVED", "PRODUCTION_APPROVED", "REVOKED"].includes(body.state!)) {
    res.status(400).json({ error: "Invalid sport or approval state" });
    return;
  }
  try {
    const eventId = await appendGovernedApprovalDecision({
      identity: {
        sport: body.sport as ExactArtifactIdentity["sport"],
        market: body.market!, modelFamily: body.modelFamily!, modelId: body.modelId!,
        modelVersion: body.modelVersion!, artifactId: body.artifactId!,
        artifactHash: body.artifactHash!, inputContractVersion: body.inputContractVersion!,
        inputHash: body.inputHash ?? null, configurationHash: body.configurationHash ?? null,
        parameterHash: body.parameterHash ?? null,
      },
      state: body.state!, governedActor: actor, reason: body.reason!,
      evidenceReference: body.evidenceReference!,
    });
    res.status(201).json({ eventId });
  } catch (error) {
    req.log?.error({ error }, "Governed model artifact approval append failed");
    res.status(500).json({ error: error instanceof Error ? error.message : "Approval append failed" });
  }
});

/** Complete, master-protected current Eastern-day V4 preview. This route has no
 * date override by design and therefore cannot be used to prefetch tomorrow. */
router.get("/admin/ncaaf/v4/today-board", async (req, res): Promise<void> => {
  try {
    res.json(await getNcaafV4ProjectionBoard(undefined));
  } catch (error) {
    req.log?.error({ error }, "NCAAF V4 admin today board failed");
    res.status(500).json({ error: "Unable to build NCAAF V4 projection board" });
  }
});

/**
 * Manual, bounded historical foundation backfill. This route intentionally does
 * not use scheduler jobs or the live NCAAF execution lock.
 */
router.post("/admin/ncaaf/core-backfill", async (req, res): Promise<void> => {
  try {
    const cursor = parseNcaafV2CoreBackfillCursor(req.body?.cursor);
    const dryRun = req.body?.dryRun;
    if (dryRun !== undefined && typeof dryRun !== "boolean") {
      res.status(400).json({ error: "dryRun must be a boolean" });
      return;
    }
    const result = await runNcaafV2CoreBackfill({ cursor, dryRun });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "NCAAF core backfill failed";
    res.status(/cursor|dryRun/i.test(message) ? 400 : 500).json({ error: message });
  }
});

/**
 * Read-only evidence and validation readiness for the isolated NCAAF
 * challenger. This deliberately reports gaps rather than treating missing
 * evidence or legacy published-pick history as V4-ready evidence.
 */
router.get("/admin/ncaaf-readiness", async (_req, res): Promise<void> => {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 30 * 60_000);
  const reasonCounts = (values: unknown[]) => {
    const counts = new Map<string, number>();
    const visit = (value: unknown) => {
      if (typeof value === "string") counts.set(value, (counts.get(value) ?? 0) + 1);
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach(visit);
    };
    values.forEach(visit);
    return [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
      .slice(0, 10);
  };
  const missingDomainCounts = (values: unknown[]) => {
    const counts = new Map<string, number>();
    for (const value of values) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      for (const domain of Object.keys(value as Record<string, unknown>)) {
        counts.set(domain, (counts.get(domain) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
  };
  const [
    legacyRows, featureRows, runRows, gameEvidence, entityEvidence, marketRows,
    evaluations, walkForward, promotions, cohorts, teamPerformance, intelligenceSnapshots, cfbdEvidence,
    cfbdDomains, cfbdTeamMappings, cfbdGameMappings, cfbdPlayerMappings, cfbdHealth,
  ] = await Promise.all([
    db.select({
      pickId: publishedPicksTable.id,
      result: pickResultsTable.result,
      performanceEligible: publishedPickPerformanceClassificationsTable.performanceEligible,
    }).from(publishedPicksTable)
      .leftJoin(pickResultsTable, eq(pickResultsTable.pickId, publishedPicksTable.id))
      .leftJoin(publishedPickPerformanceClassificationsTable,
        eq(publishedPickPerformanceClassificationsTable.publishedPickId, publishedPicksTable.id))
      .where(eq(publishedPicksTable.sport, "NCAAF")),
    db.select({
      id: ncaafFeatureSnapshotsTable.id, quality: ncaafFeatureSnapshotsTable.quality,
      dataCutoffAt: ncaafFeatureSnapshotsTable.dataCutoffAt,
      evidenceMaxModeledAsOf: ncaafFeatureSnapshotsTable.evidenceMaxModeledAsOf,
    }).from(ncaafFeatureSnapshotsTable),
    db.select({
      id: ncaafEvidenceRunsTable.id, runKey: ncaafEvidenceRunsTable.runKey,
      requestedFrom: ncaafEvidenceRunsTable.requestedFrom, requestedTo: ncaafEvidenceRunsTable.requestedTo,
      capturedAt: ncaafEvidenceRunsTable.capturedAt, completedAt: ncaafEvidenceRunsTable.completedAt,
      status: ncaafEvidenceRunsTable.status, providers: ncaafEvidenceRunsTable.providers,
      coverage: ncaafEvidenceRunsTable.coverage, errorDetails: ncaafEvidenceRunsTable.errorDetails,
    }).from(ncaafEvidenceRunsTable).orderBy(desc(ncaafEvidenceRunsTable.capturedAt)).limit(100),
    db.select({
      evidenceStatus: ncaafGameEvidenceTable.evidenceStatus,
      missingReasons: ncaafGameEvidenceTable.missingReasons,
    }).from(ncaafGameEvidenceTable),
    db.select({ missingReasons: ncaafEntityObservationsTable.missingReasons })
      .from(ncaafEntityObservationsTable),
    db.select({
      isMatchedToGame: ncaafMarketObservationsTable.isMatchedToGame,
      marketIdentityStatus: ncaafMarketObservationsTable.marketIdentityStatus,
      marketIdentityReason: ncaafMarketObservationsTable.marketIdentityReason,
      missingReasons: ncaafMarketObservationsTable.missingReasons,
    }).from(ncaafMarketObservationsTable),
    db.select({ exclusionReason: ncaafEvaluationsTable.exclusionReason })
      .from(ncaafEvaluationsTable),
    db.select({ status: ncaafWalkForwardRunsTable.status }).from(ncaafWalkForwardRunsTable),
    db.select({ decision: ncaafPromotionDecisionsTable.decision, reasons: ncaafPromotionDecisionsTable.reasons })
      .from(ncaafPromotionDecisionsTable),
    db.select({
      cohortType: ncaafPregameCohortAssignmentsTable.cohortType,
      targetEventId: ncaafPregameCohortAssignmentsTable.targetEventId,
    }).from(ncaafPregameCohortAssignmentsTable),
    db.select({
      quality: ncaafTeamGamePerformanceTable.quality,
      reliability: ncaafTeamGamePerformanceTable.reliability,
      missingReasons: ncaafTeamGamePerformanceTable.missingReasons,
    }).from(ncaafTeamGamePerformanceTable),
    db.select({
      schemaVersion: ncaafFootballIntelligenceSnapshotsTable.schemaVersion,
      qualityReadiness: ncaafFootballIntelligenceSnapshotsTable.qualityReadiness,
      dataCutoffAt: ncaafFootballIntelligenceSnapshotsTable.dataCutoffAt,
      evidenceMaxCapturedAt: ncaafFootballIntelligenceSnapshotsTable.evidenceMaxCapturedAt,
    }).from(ncaafFootballIntelligenceSnapshotsTable),
    db.select({
      endpoint: ncaafCollegeFootballDataEvidenceTable.endpoint,
      rows: sql<number>`count(*)`,
      lastSuccessfulCapture: sql<Date | null>`max(case when ${ncaafCollegeFootballDataEvidenceTable.evidenceState} = 'observed' then ${ncaafCollegeFootballDataEvidenceTable.capturedAt} end)`,
    }).from(ncaafCollegeFootballDataEvidenceTable)
      .groupBy(ncaafCollegeFootballDataEvidenceTable.endpoint),
    db.select({ domain: ncaafCfbdDomainEvidenceTable.domain, rows: sql<number>`count(*)` })
      .from(ncaafCfbdDomainEvidenceTable).groupBy(ncaafCfbdDomainEvidenceTable.domain),
    db.select({ state: ncaafCfbdTeamMappingsTable.state, rows: sql<number>`count(*)` })
      .from(ncaafCfbdTeamMappingsTable).groupBy(ncaafCfbdTeamMappingsTable.state),
    db.select({ state: ncaafCfbdGameMappingsTable.state, rows: sql<number>`count(*)` })
      .from(ncaafCfbdGameMappingsTable).groupBy(ncaafCfbdGameMappingsTable.state),
    db.select({ state: ncaafCfbdPlayerMappingsTable.state, rows: sql<number>`count(*)` })
      .from(ncaafCfbdPlayerMappingsTable).groupBy(ncaafCfbdPlayerMappingsTable.state),
    db.select({
      endpoint: ncaafCfbdProviderHealthTable.endpoint, calls: sql<number>`count(*)`,
      successful: sql<number>`count(*) filter (where ${ncaafCfbdProviderHealthTable.succeeded} = true)`,
      failed: sql<number>`count(*) filter (where ${ncaafCfbdProviderHealthTable.succeeded} = false)`,
      rateLimited: sql<number>`count(*) filter (where ${ncaafCfbdProviderHealthTable.rateLimited} = true)`,
      timeouts: sql<number>`count(*) filter (where ${ncaafCfbdProviderHealthTable.timeout} = true)`,
    }).from(ncaafCfbdProviderHealthTable).where(gte(ncaafCfbdProviderHealthTable.attemptedAt,
      new Date(now.getUTCFullYear(), now.getUTCMonth(), 1))).groupBy(ncaafCfbdProviderHealthTable.endpoint),
  ]);

  const legacyByPick = new Map<number, { classified: boolean; eligible: boolean; graded: boolean }>();
  for (const row of legacyRows) {
    const current = legacyByPick.get(row.pickId) ?? { classified: false, eligible: true, graded: false };
    current.classified ||= row.performanceEligible != null;
    if (row.performanceEligible === false) current.eligible = false;
    current.graded ||= row.result === "win" || row.result === "loss" || row.result === "push";
    legacyByPick.set(row.pickId, current);
  }
  const featureQuality = featureRows.map((row) => row.quality as Record<string, unknown>);
  const readyFeatures = featureQuality.filter((quality) => quality.status === "ready").length;
  const blockedFeatures = featureQuality.filter((quality) =>
    quality.status === "blocked" || quality.sufficientIndependentEvidence === false).length;
  const unknownFeatures = featureRows.length - readyFeatures - blockedFeatures;
  const featureReasons = reasonCounts(featureQuality.map((quality) => quality.blockedReasons));
  const intelligenceReadiness = intelligenceSnapshots.map((row) =>
    row.qualityReadiness as { state?: string; blockedReasons?: string[] });
  const intelligenceReady = intelligenceReadiness.filter((quality) => quality.state === "READY").length;
  const intelligencePartial = intelligenceReadiness.filter((quality) => quality.state === "PARTIAL").length;
  const intelligenceBlocked = intelligenceReadiness.filter((quality) => quality.state === "BLOCKED").length;
  const pitViolations = featureRows.filter((row) =>
    row.evidenceMaxModeledAsOf != null && row.evidenceMaxModeledAsOf > row.dataCutoffAt).length;
  const activeRuns = runRows.filter((row) => row.status === "running" && row.capturedAt >= staleBefore).length;
  const staleRuns = runRows.filter((row) => row.status === "running" && row.capturedAt < staleBefore).length;
  const finalizedRuns = runRows.length - activeRuns - staleRuns;
  const partialCauses = new Map<string, number>();
  const failedCauses = new Map<string, number>();
  for (const row of runRows) {
    if (typeof row.errorDetails === "string" && row.errorDetails) {
      const err = row.errorDetails.substring(0, 100);
      failedCauses.set(err, (failedCauses.get(err) ?? 0) + 1);
    }
    const coverage = row.coverage as { partialReasons?: string[], statusHistory?: Array<{ status: string; reason?: string }> } | null;
    if (coverage?.partialReasons) {
      for (const reason of coverage.partialReasons) {
        partialCauses.set(reason, (partialCauses.get(reason) ?? 0) + 1);
      }
    }
    if (coverage?.statusHistory) {
      for (const history of coverage.statusHistory) {
        if (history.status === "PARTIAL" && history.reason) {
          partialCauses.set(history.reason, (partialCauses.get(history.reason) ?? 0) + 1);
        } else if (history.status === "FAILED" && history.reason) {
          failedCauses.set(history.reason, (failedCauses.get(history.reason) ?? 0) + 1);
        }
      }
    }
  }

  const marketBreakdown = new Map<string, number>();
  for (const row of marketRows) {
    const key = `${row.marketIdentityStatus}:${row.marketIdentityReason}`;
    marketBreakdown.set(key, (marketBreakdown.get(key) ?? 0) + 1);
  }
  const evaluationExcluded = evaluations.filter((row) => row.exclusionReason != null).length;
  const finalPregame = cohorts.filter((row) => row.cohortType === "FINAL_PREGAME").length;
  const liveShadow = cohorts.filter((row) => row.cohortType === "LIVE_SHADOW").length;
  const capabilityBlockers = getNcaafReadinessBlockers();
  const cfbdEndpointCounts = cfbdEvidence.reduce((counts, row) => {
    counts[row.endpoint] = Number(row.rows);
    return counts;
  }, {} as Record<string, number>);
  const cfbdLastSuccessfulCapture = cfbdEvidence.reduce<Date | null>((latest, row) =>
    !row.lastSuccessfulCapture || latest && latest >= row.lastSuccessfulCapture ? latest : row.lastSuccessfulCapture, null);
  const stateCounts = (rows: Array<{ state: string; rows: number }>) =>
    Object.fromEntries(rows.map((row) => [row.state, Number(row.rows)]));
  const performanceQuality = teamPerformance.filter((row) => row.quality != null);
  const performanceReliability = teamPerformance.filter((row) => row.reliability != null);
  const average = (values: Array<number | null>) => {
    const present = values.filter((value): value is number => value != null && Number.isFinite(value));
    return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
  };
  const engineeringGates = {
    cohortAssignmentsPersisted: finalPregame > 0 && liveShadow > 0,
    providerCapabilitiesComplete: capabilityBlockers.length === 0,
  };
  const evidenceGates = {
    readyFeatureSnapshots: readyFeatures > 0 && blockedFeatures === 0 && unknownFeatures === 0,
    footballIntelligenceSnapshots: intelligenceSnapshots.length > 0 && intelligenceBlocked === 0,
    teamGamePerformance: teamPerformance.length > 0,
    marketIdentityMatched: marketRows.length > 0 && marketRows.every((row) => row.isMatchedToGame),
    noStaleRuns: staleRuns === 0,
    noPointInTimeViolations: pitViolations === 0,
  };
  const engineeringReadyForV4 = Object.values(engineeringGates).every(Boolean);
  const evidenceReadyForV4 = Object.values(evidenceGates).every(Boolean);
  const blockers = [
    ...(blockedFeatures > 0 ? [`${blockedFeatures} feature snapshot(s) are blocked`] : []),
    ...(unknownFeatures > 0 ? [`${unknownFeatures} legacy feature snapshot(s) have unknown readiness and are not counted as blocked or ready`] : []),
    ...(intelligenceBlocked > 0 ? [`${intelligenceBlocked} football-intelligence snapshot(s) are blocked`] : []),
    ...(staleRuns > 0 ? [`${staleRuns} evidence run(s) are stale and still marked running`] : []),
    ...(marketRows.some((row) => !row.isMatchedToGame) ? ["unmatched market evidence remains"] : []),
    ...(pitViolations > 0 ? [`${pitViolations} feature snapshot(s) violate the point-in-time cutoff`] : []),
    ...capabilityBlockers.map((blocker) => `${blocker.provider}:${blocker.capability} is ${blocker.state}/${blocker.pointInTimeState}`),
  ];

  res.json({
    engineeringReadyForV4,
    evidenceReadyForV4,
    readyForV4: engineeringReadyForV4 && evidenceReadyForV4,
    gates: { engineering: engineeringGates, evidence: evidenceGates },
    blockers,
    legacyCohort: {
      total: legacyByPick.size,
      classified: [...legacyByPick.values()].filter((row) => row.classified).length,
      graded: [...legacyByPick.values()].filter((row) => row.graded).length,
      pending: [...legacyByPick.values()].filter((row) => !row.graded).length,
      officialExcluded: [...legacyByPick.values()].filter((row) => row.classified && !row.eligible).length,
    },
    featureSnapshots: {
      total: featureRows.length, ready: readyFeatures, blocked: blockedFeatures,
      unknown: unknownFeatures, topBlockedReasons: featureReasons,
    },
    footballIntelligenceSnapshots: {
      schemaVersion: "ncaaf-football-intelligence-v1",
      total: intelligenceSnapshots.length,
      ready: intelligenceReady,
      partial: intelligencePartial,
      blocked: intelligenceBlocked,
      topBlockedReasons: reasonCounts(intelligenceReadiness.map((quality) => quality.blockedReasons)),
      pointInTimeViolations: intelligenceSnapshots.filter((row) =>
        row.evidenceMaxCapturedAt != null && row.evidenceMaxCapturedAt >= row.dataCutoffAt).length,
    },
    evidenceRuns: {
      active: activeRuns, stale: staleRuns, finalized: finalizedRuns,
      topPartialCauses: [...partialCauses.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      topFailedCauses: [...failedCauses.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      recent: runRows.slice(0, 12).map((row) => {
        const coverage = row.coverage as Record<string, unknown> | null;
        return { ...row, partialReasons: coverage?.partialReasons ?? [], errorDetails: row.errorDetails ?? null };
      }),
    },
    sportsEvidenceCoverage: {
      gameEvidenceRows: gameEvidence.length, entityObservationRows: entityEvidence.length,
      observedGames: gameEvidence.filter((row) => row.evidenceStatus === "observed").length,
      topMissingReasons: reasonCounts([...gameEvidence, ...entityEvidence].map((row) => row.missingReasons)),
    },
    teamGamePerformance: {
      rows: teamPerformance.length,
      quality: { populated: performanceQuality.length, average: average(teamPerformance.map((row) => row.quality)) },
      reliability: { populated: performanceReliability.length, average: average(teamPerformance.map((row) => row.reliability)) },
      missingDomainCoverage: missingDomainCounts(teamPerformance.map((row) => row.missingReasons)),
      topMissingReasons: reasonCounts(teamPerformance.map((row) => row.missingReasons)),
    },
    marketEvidenceCoverage: {
      total: marketRows.length, matched: marketRows.filter((row) => row.isMatchedToGame).length,
      unmatched: marketRows.filter((row) => !row.isMatchedToGame).length,
      byIdentity: [...marketBreakdown.entries()].map(([key, count]) => {
        const [marketIdentityStatus, marketIdentityReason] = key.split(":");
        return { marketIdentityStatus, marketIdentityReason, count };
      }).sort((a, b) => b.count - a.count),
      topMissingReasons: reasonCounts(marketRows.map((row) => row.missingReasons)),
    },
    cohorts: { finalPregame, liveShadow, supported: true },
    providerCapabilities: {
      inventory: NCAAF_PROVIDER_CAPABILITIES, blockers: capabilityBlockers,
      health: {
        college_football_data: {
          credentialConfigured: Boolean(process.env["CFBD_API_KEY"]),
          rawRows: cfbdEvidence.reduce((sum, row) => sum + Number(row.rows), 0),
          lastSuccessfulCapture: cfbdLastSuccessfulCapture?.toISOString() ?? null,
          endpointCounts: cfbdEndpointCounts,
          domainCounts: Object.fromEntries(cfbdDomains.map((row) => [row.domain, Number(row.rows)])),
          mappings: { teams: stateCounts(cfbdTeamMappings), games: stateCounts(cfbdGameMappings), players: stateCounts(cfbdPlayerMappings) },
          usageCurrentMonth: cfbdHealth.map((row) => ({ ...row, calls: Number(row.calls), successful: Number(row.successful), failed: Number(row.failed), rateLimited: Number(row.rateLimited), timeouts: Number(row.timeouts) })),
        },
      },
    },
    pointInTime: { violations: pitViolations },
    validation: {
      evaluations: { total: evaluations.length, excluded: evaluationExcluded, graded: evaluations.length - evaluationExcluded },
      walkForward: { total: walkForward.length, byStatus: Object.fromEntries(walkForward.map((row) => [row.status, (walkForward.filter((item) => item.status === row.status).length)])) },
      promotions: { total: promotions.length, byDecision: Object.fromEntries(promotions.map((row) => [row.decision, promotions.filter((item) => item.decision === row.decision).length])), topReasons: reasonCounts(promotions.map((row) => row.reasons)) },
    },
    dataAsOf: now.toISOString(),
  });
});

/**
 * Read-only downstream publication audit. This is deliberately candidate-level:
 * operators can inspect model opinion, exclusion reason, rank, approved stake,
 * and POTD state without inferring them from subscriber payloads.
 */
router.get("/admin/publication-decisions", async (req, res): Promise<void> => {
  const requestedDate = typeof req.query.date === "string" ? req.query.date : null;
  if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }
  const easternDate = requestedDate ?? new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const decisions = await db
    .select({
      publishedPickId: publishedPicksTable.id,
      predictionId: publishedPicksTable.predictionId,
      gameId: publishedPicksTable.gameId,
      sport: publishedPicksTable.sport,
      market: publishedPicksTable.market,
      selection: publishedPicksTable.selection,
      recommendation: publishedPicksTable.recommendation,
      publicationStatus: publishedPicksTable.publicationStatus,
      publicationReason: publishedPicksTable.publicationReasonCode,
      exclusionReason: publishedPicksTable.exclusionReasonCode,
      isPublic: publishedPicksTable.isPublic,
      isEffective: publishedPicksTable.isEffective,
      isPlayOfDay: publishedPicksTable.isPlayOfDay,
      selectedSideEdge: publishedPicksTable.selectedSideEdge,
      rankScore: publishedPicksTable.rankScore,
      podScore: modelPredictionsTable.podScore,
      globalRank: publishedPicksTable.globalRank,
      requestedUnits: publishedPicksTable.requestedUnits,
      approvedUnits: publishedPicksTable.approvedUnits,
      stakePolicyVersion: publishedPicksTable.stakePolicyVersion,
      stakeReason: publishedPicksTable.stakeReason,
      decisionTimestamp: publishedPicksTable.decisionTimestamp,
      dataCutoff: publishedPicksTable.dataCutoff,
      gameStart: publishedPicksTable.gameStart,
      modelId: modelVersionsTable.modelId,
      modelStatus: modelVersionsTable.status,
      cohort: modelPredictionsTable.cohort,
      isChallenger: modelPredictionsTable.isChallenger,
    })
    .from(publishedPicksTable)
    .innerJoin(
      modelPredictionsTable,
      eq(publishedPicksTable.predictionId, modelPredictionsTable.id),
    )
    .innerJoin(
      modelVersionsTable,
      eq(modelPredictionsTable.modelVersionId, modelVersionsTable.id),
    )
    .where(and(
      eq(publishedPicksTable.isEffective, true),
      sql`DATE(
        COALESCE(${publishedPicksTable.decisionTimestamp}, ${publishedPicksTable.publishedAt})
        AT TIME ZONE 'America/New_York'
      ) = ${easternDate}::date`,
    ))
    .orderBy(
      sql`${publishedPicksTable.globalRank} ASC NULLS LAST`,
      publishedPicksTable.id,
    );

  res.json({ easternDate, dataAsOf: new Date().toISOString(), decisions });
});

/** Per-event read-only evidence audit for the isolated NCAAF challenger. */
router.get("/admin/ncaaf-readiness/:eventId", async (req, res): Promise<void> => {
  const eventId = String(req.params.eventId ?? "").trim();
  if (!eventId) { res.status(400).json({ error: "eventId is required" }); return; }
  const games = await db.select({
    id: ncaafGameEvidenceTable.id, provider: ncaafGameEvidenceTable.provider,
    providerEventId: ncaafGameEvidenceTable.providerEventId, season: ncaafGameEvidenceTable.season,
    week: ncaafGameEvidenceTable.week, kickoffAt: ncaafGameEvidenceTable.kickoffAt,
    homeProviderTeamId: ncaafGameEvidenceTable.homeProviderTeamId,
    awayProviderTeamId: ncaafGameEvidenceTable.awayProviderTeamId,
    homeTeamName: ncaafGameEvidenceTable.homeTeamName, awayTeamName: ncaafGameEvidenceTable.awayTeamName,
    evidenceStatus: ncaafGameEvidenceTable.evidenceStatus,
    missingReasons: ncaafGameEvidenceTable.missingReasons,
    modeledAsOf: ncaafGameEvidenceTable.modeledAsOf, capturedAt: ncaafGameEvidenceTable.capturedAt,
  }).from(ncaafGameEvidenceTable)
    .where(eq(ncaafGameEvidenceTable.providerEventId, eventId))
    .orderBy(desc(ncaafGameEvidenceTable.capturedAt));
  if (!games.length) { res.status(404).json({ error: "NCAAF evidence event not found" }); return; }

  const gameIds = games.map((game) => game.id);
  const [features, cohorts, performance, markets] = await Promise.all([
    db.select({
      id: ncaafFeatureSnapshotsTable.id, schemaVersion: ncaafFeatureSnapshotsTable.schemaVersion,
      modelVersion: ncaafFeatureSnapshotsTable.modelVersion, targetProvider: ncaafFeatureSnapshotsTable.targetProvider,
      targetEventId: ncaafFeatureSnapshotsTable.targetEventId, dataCutoffAt: ncaafFeatureSnapshotsTable.dataCutoffAt,
      evidenceMaxModeledAsOf: ncaafFeatureSnapshotsTable.evidenceMaxModeledAsOf,
      quality: ncaafFeatureSnapshotsTable.quality, createdAt: ncaafFeatureSnapshotsTable.createdAt,
    }).from(ncaafFeatureSnapshotsTable).where(eq(ncaafFeatureSnapshotsTable.targetEventId, eventId))
      .orderBy(desc(ncaafFeatureSnapshotsTable.createdAt)),
    db.select({
      cohortType: ncaafPregameCohortAssignmentsTable.cohortType,
      featureSnapshotId: ncaafPregameCohortAssignmentsTable.featureSnapshotId,
      featureSchemaVersion: ncaafPregameCohortAssignmentsTable.featureSchemaVersion,
      cutoffAt: ncaafPregameCohortAssignmentsTable.cutoffAt,
      assignmentAt: ncaafPregameCohortAssignmentsTable.assignmentAt,
      quality: ncaafPregameCohortAssignmentsTable.quality,
      missingReasons: ncaafPregameCohortAssignmentsTable.missingReasons,
    }).from(ncaafPregameCohortAssignmentsTable)
      .where(eq(ncaafPregameCohortAssignmentsTable.targetEventId, eventId)),
    db.select({
      provider: ncaafTeamGamePerformanceTable.provider,
      providerTeamId: ncaafTeamGamePerformanceTable.providerTeamId,
      quality: ncaafTeamGamePerformanceTable.quality, reliability: ncaafTeamGamePerformanceTable.reliability,
      missingReasons: ncaafTeamGamePerformanceTable.missingReasons,
      capturedAt: ncaafTeamGamePerformanceTable.capturedAt,
    }).from(ncaafTeamGamePerformanceTable)
      .where(eq(ncaafTeamGamePerformanceTable.providerEventId, eventId)),
    db.select({
      provider: ncaafMarketObservationsTable.provider, marketKey: ncaafMarketObservationsTable.marketKey,
      isMatchedToGame: ncaafMarketObservationsTable.isMatchedToGame,
      marketIdentityStatus: ncaafMarketObservationsTable.marketIdentityStatus,
      marketIdentityReason: ncaafMarketObservationsTable.marketIdentityReason,
      missingReasons: ncaafMarketObservationsTable.missingReasons,
      capturedAt: ncaafMarketObservationsTable.capturedAt,
    }).from(ncaafMarketObservationsTable)
      .where(inArray(ncaafMarketObservationsTable.gameEvidenceId, gameIds)),
  ]);
  const featureReady = features.some((feature) => (feature.quality as Record<string, unknown>).status === "ready");
  const pitViolations = features.filter((feature) =>
    feature.evidenceMaxModeledAsOf != null && feature.evidenceMaxModeledAsOf > feature.dataCutoffAt).length;
  const cohortTypes = new Set(cohorts.map((cohort) => cohort.cohortType));
  const marketMatched = markets.length > 0 && markets.every((market) => market.isMatchedToGame);
  const capabilityBlockers = getNcaafReadinessBlockers();
  const evidenceReadyForV4 = featureReady && cohortTypes.has("FINAL_PREGAME")
    && cohortTypes.has("LIVE_SHADOW") && performance.length > 0 && marketMatched && pitViolations === 0;
  const engineeringReadyForV4 = capabilityBlockers.length === 0;
  res.json({
    eventId,
    canonicalIdentity: games[0],
    sportsEvidence: games,
    featureSnapshots: features,
    cohorts,
    teamGamePerformance: {
      rows: performance.length, rowsByQuality: performance,
    },
    marketMatch: {
      total: markets.length, matched: markets.filter((market) => market.isMatchedToGame).length,
      unmatched: markets.filter((market) => !market.isMatchedToGame).length, observations: markets,
    },
    missingReasons: {
      sportsEvidence: games.map((game) => game.missingReasons),
      cohorts: cohorts.map((cohort) => cohort.missingReasons),
      teamGamePerformance: performance.map((row) => row.missingReasons),
      marketEvidence: markets.map((market) => market.missingReasons),
    },
    quality: { featureReady, pointInTimeViolations: pitViolations },
    engineeringReadyForV4,
    evidenceReadyForV4,
    readyForV4: engineeringReadyForV4 && evidenceReadyForV4,
    blockers: capabilityBlockers,
    dataAsOf: new Date().toISOString(),
  });
});

/**
 * List immutable MLB policy revisions with their affected decision counts.
 * This is intentionally admin-only because it exposes model policy controls.
 */
router.get("/admin/mlb-policy-revisions", async (_req, res): Promise<void> => {
  const revisions = await listMlbPolicyRevisionAudit();
  res.json({ revisions, count: revisions.length });
});

/**
 * Research-only collection observability. It intentionally exposes only
 * aggregate evidence metadata and is protected by the admin router.
 */
router.get("/admin/mlb-pit-completeness", async (_req, res): Promise<void> => {
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const [games, features, forecasts, untouched, advancedEvidence, advancedSnapshots] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(gamesTable)
      .where(and(eq(gamesTable.sport, "MLB"), eq(gamesTable.gameDate, date))),
    db.select({
      revisionState: mlbFeatureSnapshotsTable.revisionState,
      completenessPct: mlbFeatureSnapshotsTable.completenessPct,
      quality: mlbFeatureSnapshotsTable.quality,
    }).from(mlbFeatureSnapshotsTable)
      .innerJoin(gamesTable, eq(gamesTable.id, mlbFeatureSnapshotsTable.gameId))
      .where(and(eq(gamesTable.sport, "MLB"), eq(gamesTable.gameDate, date))),
    db.select({ dataQuality: mlbForecastEvidenceTable.dataQuality, uncertainty: mlbForecastEvidenceTable.uncertainty })
      .from(mlbForecastEvidenceTable).innerJoin(gamesTable, eq(gamesTable.id, mlbForecastEvidenceTable.gameId))
      .where(and(eq(gamesTable.sport, "MLB"), eq(gamesTable.gameDate, date))),
    db.select({ count: sql<number>`count(*)::int` }).from(mlbOosCohortsTable)
      .where(eq(mlbOosCohortsTable.cohort, "UNTOUCHED_OOS")),
    db.select({
      domain: mlbAdvancedResearchEvidenceTable.domain, provider: mlbAdvancedResearchEvidenceTable.provider,
      qualityState: mlbAdvancedResearchEvidenceTable.qualityState, sampleReliability: mlbAdvancedResearchEvidenceTable.sampleReliability,
      historicalAvailability: mlbAdvancedResearchEvidenceTable.historicalAvailability, retrievedAt: mlbAdvancedResearchEvidenceTable.retrievedAt,
      pointInTimeCutoff: mlbAdvancedResearchEvidenceTable.pointInTimeCutoff,
    }).from(mlbAdvancedResearchEvidenceTable).innerJoin(gamesTable, eq(gamesTable.id, mlbAdvancedResearchEvidenceTable.gameId))
      .where(and(eq(gamesTable.sport, "MLB"), eq(gamesTable.gameDate, date))),
    db.select({ revisionState: mlbAdvancedFeatureSnapshotsTable.revisionState, pointInTimeCutoff: mlbAdvancedFeatureSnapshotsTable.pointInTimeCutoff, gameStartTime: mlbAdvancedFeatureSnapshotsTable.gameStartTime })
      .from(mlbAdvancedFeatureSnapshotsTable).innerJoin(gamesTable, eq(gamesTable.id, mlbAdvancedFeatureSnapshotsTable.gameId))
      .where(and(eq(gamesTable.sport, "MLB"), eq(gamesTable.gameDate, date))),
  ]);
  const average = (values: Array<number | null>) => {
    const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  };
  const component = (name: string) => features.filter((row) => {
    const quality = row.quality as Record<string, unknown>;
    return quality?.[name] != null;
  }).length;
  const byDomain = Object.fromEntries([...new Set(advancedEvidence.map((row) => row.domain))].map((domain) => {
    const rows = advancedEvidence.filter((row) => row.domain === domain);
    return [domain, { records: rows.length, validPct: rows.length ? rows.filter((r) => r.qualityState === "VALID" || r.qualityState === "CONFIRMED").length / rows.length * 100 : null,
      missingPct: rows.length ? rows.filter((r) => r.qualityState === "MISSING" || r.qualityState === "UNAVAILABLE").length / rows.length * 100 : null }];
  }));
  const providerHealth = Object.fromEntries([...new Set(advancedEvidence.map((row) => row.provider))].map((provider) => {
    const rows = advancedEvidence.filter((row) => row.provider === provider);
    const latest = rows.reduce<Date | null>((current, row) => !current || row.retrievedAt > current ? row.retrievedAt : current, null);
    return [provider, { records: rows.length, lastSuccessAt: latest?.toISOString() ?? null,
      validRecords: rows.filter((r) => r.qualityState === "VALID" || r.qualityState === "CONFIRMED").length,
      failureRecords: rows.filter((r) => r.qualityState === "MISSING" || r.qualityState === "UNAVAILABLE" || r.qualityState === "INVALID").length }];
  }));
  const pitViolations = advancedSnapshots.filter((row) => row.pointInTimeCutoff >= row.gameStartTime).length;
  res.json({
    date, gamesToday: games[0]?.count ?? 0, v4ForecastsGenerated: forecasts.length,
    finalPregameForecastsFrozen: features.filter((row) => row.revisionState === "FINAL_PREGAME").length,
    completeness: {
      averageFeaturePct: average(features.map((row) => row.completenessPct)),
      starterPct: features.length ? component("starterQualityState") / features.length * 100 : null,
      lineupPct: features.length ? component("lineupQualityState") / features.length * 100 : null,
      bullpenPct: features.length ? component("bullpenQualityState") / features.length * 100 : null,
      weatherPct: features.length ? component("weather") / features.length * 100 : null,
      marketPct: features.length ? component("market") / features.length * 100 : null,
      leagueEnvironmentPct: 0, postgameOutcomePct: 0, starterOutcomePct: 0, bullpenOutcomePct: 0, closingMarketPct: 0,
    },
    averageDataQuality: average(forecasts.map((row) => row.dataQuality)),
    averageUncertainty: average(forecasts.map((row) => row.uncertainty)),
    untouchedOosCount: untouched[0]?.count ?? 0,
    advanced: {
      researchOnly: true, evidenceRecords: advancedEvidence.length, snapshots: advancedSnapshots.length,
      finalPregameSnapshots: advancedSnapshots.filter((row) => row.revisionState === "FINAL_PREGAME").length,
      domainCoverage: byDomain, providerHealth, pitViolations,
      sampleReliability: Object.fromEntries(["HIGH", "MEDIUM", "LOW", "VERY_LOW", "UNKNOWN"].map((state) => [state, advancedEvidence.filter((row) => row.sampleReliability === state).length])),
      availableFor215: MLB_215_READY_FEATURES.map((feature) => feature.feature),
      unavailableFor215: MLB_215_UNAVAILABLE_FEATURES.map((feature) => feature.feature),
      strictEligibility: {
        readyFor215: MLB_215_READY_FEATURES.map((feature) => ({ feature: feature.feature, reasons: feature.eligibilityReasons })),
        liveForwardCandidateNeedsOos: LIVE_FORWARD_CANDIDATE_NEEDS_OOS.map((feature) => ({ feature: feature.feature, reasons: feature.eligibilityReasons })),
        partialOrInconsistent: PARTIAL_OR_INCONSISTENT.map((feature) => ({ feature: feature.feature, reasons: feature.eligibilityReasons })),
        notSupported: NOT_SUPPORTED.map((feature) => ({ feature: feature.feature, reasons: feature.eligibilityReasons })),
      },
    },
    limitations: ["No historical backfill is inferred.", "Final freeze and provider outcome ingestion await dedicated provider capture."],
    dataAsOf: new Date().toISOString(),
  });
});

/** Per-game, metadata-only observability for live-forward research collection. */
router.get("/admin/mlb-advanced-research/:gameId", async (req, res): Promise<void> => {
  const gameId = String(req.params.gameId);
  const [game, evidence, snapshots] = await Promise.all([
    db.select({ id: gamesTable.id, sport: gamesTable.sport, startsAt: gamesTable.startsAt, status: gamesTable.status })
      .from(gamesTable).where(eq(gamesTable.id, gameId)).limit(1),
    db.select({ domain: mlbAdvancedResearchEvidenceTable.domain, provider: mlbAdvancedResearchEvidenceTable.provider,
      qualityState: mlbAdvancedResearchEvidenceTable.qualityState, retrievedAt: mlbAdvancedResearchEvidenceTable.retrievedAt,
      pointInTimeCutoff: mlbAdvancedResearchEvidenceTable.pointInTimeCutoff })
      .from(mlbAdvancedResearchEvidenceTable).where(eq(mlbAdvancedResearchEvidenceTable.gameId, gameId)),
    db.select({ id: mlbAdvancedFeatureSnapshotsTable.id, revisionState: mlbAdvancedFeatureSnapshotsTable.revisionState,
      canonicalFeatureSnapshotId: mlbAdvancedFeatureSnapshotsTable.canonicalFeatureSnapshotId,
      pointInTimeCutoff: mlbAdvancedFeatureSnapshotsTable.pointInTimeCutoff, gameStartTime: mlbAdvancedFeatureSnapshotsTable.gameStartTime,
      createdAt: mlbAdvancedFeatureSnapshotsTable.createdAt })
      .from(mlbAdvancedFeatureSnapshotsTable).where(eq(mlbAdvancedFeatureSnapshotsTable.gameId, gameId)),
  ]);
  if (!game[0] || game[0].sport !== "MLB") { res.status(404).json({ error: "MLB game not found" }); return; }
  res.json({
    researchOnly: true, game: game[0], evidence,
    snapshots: snapshots.map((snapshot) => ({ ...snapshot, pitSafe: snapshot.pointInTimeCutoff < snapshot.gameStartTime })),
    coverage: Object.fromEntries(["pitcher_conventional", "starter_availability", "lineup", "bullpen_availability", "park", "weather"]
      .map((domain) => [domain, evidence.filter((row) => row.domain === domain).length])),
  });
});

function parseIsoDate(value: unknown, name: string): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be a real calendar date.`);
  }
  return value;
}

function parseShadowBuyThreshold(value: unknown): number {
  if (value == null || value === "") return DEFAULT_MLB_SHADOW_BUY_THRESHOLD;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 12) {
    throw new Error("shadowBuyThreshold must be greater than 0 and below 12.");
  }
  return parsed;
}

function asMlbQualificationAudit(value: unknown): MlbQualificationAudit | null {
  if (!value || typeof value !== "object") return null;
  const audit = value as Partial<MlbQualificationAudit>;
  return audit.schemaVersion === "mlb-qualification-audit-v1"
    && typeof audit.capturedAt === "string"
    && (audit.selectedSide === "home" || audit.selectedSide === "away")
    && typeof audit.edge === "number"
    && audit.production != null
    ? audit as MlbQualificationAudit
    : null;
}

/**
 * Read-only MLB policy observability. This endpoint intentionally returns
 * audit data and hypothetical shadow classifications only; it never creates
 * predictions, published picks, grading rows, push notifications, or learning
 * inputs. The historical comparison reads immutable prediction/result evidence.
 */
router.get("/admin/mlb-qualification-audit", async (req, res): Promise<void> => {
  try {
    const nyToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const date = parseIsoDate(req.query.date, "date") ?? nyToday;
    const dateFrom = parseIsoDate(req.query.dateFrom, "dateFrom");
    const dateTo = parseIsoDate(req.query.dateTo, "dateTo");
    if (dateFrom && dateTo && dateFrom > dateTo) {
      res.status(400).json({ error: "dateFrom must be on or before dateTo." });
      return;
    }
    const shadowBuyThreshold = parseShadowBuyThreshold(req.query.shadowBuyThreshold);

    const [gameRows, historicalRows] = await Promise.all([
      db
        .select({
          id: gamesTable.id,
          gameDate: gamesTable.gameDate,
          gameTime: gamesTable.gameTime,
          startsAt: gamesTable.startsAt,
          status: gamesTable.status,
          awayTeamAbbr: gamesTable.awayTeamAbbr,
          homeTeamAbbr: gamesTable.homeTeamAbbr,
          audit: gamesTable.mlbDecisionAudit,
        })
        .from(gamesTable)
        .where(and(
          eq(gamesTable.sport, "MLB"),
          eq(gamesTable.gameDate, date),
          eq(gamesTable.status, "upcoming"),
        ))
        .orderBy(gamesTable.startsAt),
      db
        .select({
          gameDate: gamesTable.gameDate,
          predictionTimestamp: modelPredictionsTable.predictionTimestamp,
          selection: modelPredictionsTable.selection,
          odds: modelPredictionsTable.odds,
          modelProbability: modelPredictionsTable.modelProbability,
          recommendation: modelPredictionsTable.recommendation,
          edge: modelPredictionsTable.edge,
          confidence: modelPredictionsTable.confidence,
          result: pickResultsTable.result,
          clv: pickResultsTable.clv,
        })
        .from(modelPredictionsTable)
        .innerJoin(publishedPicksTable, eq(publishedPicksTable.predictionId, modelPredictionsTable.id))
        .innerJoin(pickResultsTable, eq(pickResultsTable.pickId, publishedPicksTable.id))
        .innerJoin(gamesTable, eq(gamesTable.id, modelPredictionsTable.gameId))
        .where(and(
          eq(modelPredictionsTable.sport, "MLB"),
          eq(modelPredictionsTable.market, "moneyline"),
          eq(modelPredictionsTable.isChallenger, false),
          eq(publishedPicksTable.isEffective, true),
          inArray(pickResultsTable.result, ["win", "loss", "push"]),
          ...(dateFrom ? [gte(gamesTable.gameDate, dateFrom)] : []),
          ...(dateTo ? [lte(gamesTable.gameDate, dateTo)] : []),
        ))
        .orderBy(modelPredictionsTable.predictionTimestamp),
    ]);

    const games = gameRows.map((game) => {
      const audit = asMlbQualificationAudit(game.audit);
      return {
        game: {
          id: game.id,
          date: game.gameDate,
          time: game.gameTime,
          startsAt: game.startsAt,
          matchup: `${game.awayTeamAbbr} @ ${game.homeTeamAbbr}`,
        },
        auditStatus: audit ? "available" : "awaiting_refresh",
        audit,
        shadow: audit ? evaluateMlbShadowPolicy(audit, shadowBuyThreshold) : null,
      };
    });

    const gradedRows: GradedMlbDecision[] = historicalRows.flatMap((row): GradedMlbDecision[] => {
      if (
        (row.selection !== "home" && row.selection !== "away")
        || (row.result !== "win" && row.result !== "loss" && row.result !== "push")
      ) {
        return [];
      }
      return [{
        selection: row.selection,
        odds: row.odds,
        modelProbability: row.modelProbability,
        recommendation: row.recommendation,
        edge: row.edge,
        confidence: row.confidence,
        result: row.result,
        clv: row.clv,
      }];
    });

    res.json({
      date,
      shadowPolicy: {
        buyThreshold: shadowBuyThreshold,
        scope: "analytics_only",
        safeguardsPreserved: [
          "strong_buy_threshold",
          "away_threshold_offset",
          "probable_starter_requirement",
          "valid_pregame_market_requirement",
          "favorite_price_cap",
        ],
      },
      refreshSummary: summarizeMlbQualificationAudits(games.map((game) => game.audit)),
      games,
      historicalComparison: {
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        methodology: "Uses only existing, effective immutable MLB moneyline predictions with graded internal results. Games blocked before prediction creation are not estimated.",
        ...compareMlbQualificationPolicies(gradedRows, shadowBuyThreshold),
      },
      dataAsOf: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to build MLB qualification audit";
    res.status(400).json({ error: message });
  }
});

/**
 * Create/apply an auditable policy revision to only future MLB games. Existing
 * snapshots and grades are never updated; revised decisions are new rows.
 */
router.post("/admin/mlb-policy-revisions", async (req, res): Promise<void> => {
  try {
    const { revisionKey, reason, policy } = req.body ?? {};
    if (typeof revisionKey !== "string" || typeof reason !== "string") {
      res.status(400).json({ error: "revisionKey and reason are required" });
      return;
    }
    const actor = getVerifiedAdminPrincipal(req);
    if (!actor) {
      res.status(401).json({ error: "Valid administrator credentials required" });
      return;
    }
    const result = await applyMlbPolicyRevision({ revisionKey, reason, policy, actor });
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to apply MLB policy revision";
    res.status(400).json({ error: message });
  }
});

/**
 * Internal, evidence-based postgame reviews. This endpoint deliberately stays
 * behind the admin session so subscriber-facing API responses never expose
 * model diagnostics.
 */
async function sendOutcomeReviews(
  req: Request,
  res: Response,
  forcedResult?: "win" | "loss",
): Promise<void> {
  const sport = typeof req.query.sport === "string" ? req.query.sport : undefined;
  const requestedResult = forcedResult ?? (
    req.query.result === "win" || req.query.result === "loss"
      ? req.query.result
      : "all"
  );
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(Math.floor(requestedLimit), 100))
    : 30;
  const conditions = [
    requestedResult === "all"
      ? inArray(pickResultsTable.result, ["win", "loss"])
      : eq(pickResultsTable.result, requestedResult),
    isNotNull(pickResultsTable.learningReview),
  ];
  if (sport) conditions.push(eq(publishedPicksTable.sport, sport));

  const reviews = await db
    .select({
      pickId: publishedPicksTable.id,
      sport: publishedPicksTable.sport,
      market: publishedPicksTable.market,
      selection: publishedPicksTable.selection,
      recommendation: publishedPicksTable.recommendation,
      confidence: publishedPicksTable.confidence,
      result: pickResultsTable.result,
      publishedAt: publishedPicksTable.publishedAt,
      modelProbability: modelPredictionsTable.modelProbability,
      finalRating: modelPredictionsTable.finalRating,
      finalScore: pickResultsTable.finalScore,
      clv: pickResultsTable.clv,
      gradedAt: pickResultsTable.gradedAt,
      review: pickResultsTable.learningReview,
    })
    .from(pickResultsTable)
    .innerJoin(publishedPicksTable, eq(pickResultsTable.pickId, publishedPicksTable.id))
    .innerJoin(modelPredictionsTable, eq(publishedPicksTable.predictionId, modelPredictionsTable.id))
    .where(and(...conditions))
    .orderBy(desc(pickResultsTable.gradedAt))
    .limit(limit);

  const patterns = new Map<string, number>();
  for (const row of reviews) {
    const review = row.review as Record<string, unknown> | null;
    const classification = typeof review?.primaryClassification === "string"
      ? review.primaryClassification
      : "unclassified";
    patterns.set(classification, (patterns.get(classification) ?? 0) + 1);
  }

  res.json({
    reviews,
    patterns: [...patterns.entries()]
      .map(([classification, sampleSize]) => ({ classification, sampleSize }))
      .sort((a, b) => b.sampleSize - a.sampleSize),
    dataAsOf: new Date().toISOString(),
    resultFilter: requestedResult,
  });
}

/** GET /api/admin/outcome-reviews — completed win/loss reviews for model analysis. */
router.get("/admin/outcome-reviews", async (req, res): Promise<void> => {
  await sendOutcomeReviews(req, res);
});

/** Backward-compatible loss-only view retained for existing clients. */
router.get("/admin/loss-reviews", async (req, res): Promise<void> => {
  await sendOutcomeReviews(req, res, "loss");
});

/**
 * GET /api/admin/forecast-reviews — auditable reviews for all completed model
 * predictions, including forecast-only rows and explicit exclusions.
 */
router.get("/admin/forecast-reviews", async (req, res): Promise<void> => {
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(Math.floor(requestedLimit), 100))
    : 50;
  const segment = req.query.segment === "published" || req.query.segment === "forecast_only"
    ? req.query.segment as ForecastSegment
    : undefined;
  const qualification = req.query.qualification === "qualified" || req.query.qualification === "passed"
    ? req.query.qualification as ForecastQualification
    : undefined;
  const reviews = await listForecastReviews({
    sport: typeof req.query.sport === "string" ? req.query.sport : undefined,
    market: typeof req.query.market === "string" ? req.query.market : undefined,
    segment,
    qualification,
    result: typeof req.query.result === "string" ? req.query.result : undefined,
    limit,
  });
  res.json({ reviews, count: reviews.length, dataAsOf: new Date().toISOString() });
});

/** GET /api/admin/forecast-metrics — calibration and coverage comparisons. */
router.get("/admin/forecast-metrics", async (req, res): Promise<void> => {
  const metrics = await queryForecastMetrics({
    sport: typeof req.query.sport === "string" ? req.query.sport : undefined,
    market: typeof req.query.market === "string" ? req.query.market : undefined,
  });
  res.json({ metrics, dataAsOf: new Date().toISOString() });
});

/** POST /api/admin/forecast-reviews/refresh — idempotent backfill trigger. */
router.post("/admin/forecast-reviews/refresh", async (_req, res): Promise<void> => {
  const result = await runForecastReviews();
  res.json({ ...result, refreshedAt: new Date().toISOString() });
});

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

  // ── Today's publication distribution by sport ─────────────────────────────────
  // Admin counts must use publication state rather than treating every raw
  // Strong Buy/Buy as published.
  const todayStr = new Date().toISOString().split("T")[0];
  const todayGames = await db
    .select({
      id: gamesTable.id,
      sport: gamesTable.sport,
      valueRating: gamesTable.valueRating,
    })
    .from(gamesTable)
    .where(eq(gamesTable.gameDate, todayStr));
  const todayGameIds = todayGames.map((game) => game.id);
  const [todayPermissions, todayEffectivePicks] = await Promise.all([
    getMoneylinePublicationPermissionsForGames(todayGameIds),
    todayGameIds.length === 0
      ? Promise.resolve([])
      : db.select({
        gameId: publishedPicksTable.gameId,
        recommendation: publishedPicksTable.recommendation,
      }).from(publishedPicksTable).where(and(
        inArray(publishedPicksTable.gameId, todayGameIds),
        eq(publishedPicksTable.isEffective, true),
      )),
  ]);
  const todayEffectiveByGame = new Map(
    todayEffectivePicks.map((pick) => [pick.gameId, pick.recommendation]),
  );

  type PickDistEntry = { suppressedCount: number; publishedCount: number };
  const pickDistMap = new Map<string, PickDistEntry>();
  for (const game of todayGames) {
    if (!pickDistMap.has(game.sport)) {
      pickDistMap.set(game.sport, { suppressedCount: 0, publishedCount: 0 });
    }
    const permission = todayPermissions.get(game.id);
    const state = classifyRecommendationPublication({
      rawRecommendation: game.valueRating,
      approvalStatus: permission?.status ?? "UNVALIDATED",
      approvalReasons: permission?.reasons ?? ["exact_approval_record_missing"],
      effectivePublishedRecommendation: todayEffectiveByGame.get(game.id),
    });
    const entry = pickDistMap.get(game.sport)!;
    if (state.publicationStatus === "PUBLISHED" || state.publicationStatus === "PUBLISHABLE") {
      entry.publishedCount++;
    } else if (state.publicationStatus === "BLOCKED") {
      entry.suppressedCount++;
    }
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
    const pd = pickDistMap.get(sport);
    return {
      sport,
      status: val > 0 ? ("ok" as const) : ("quiet" as const),
      gameCount: val,
      lastChecked,
      alertSeverity: alertInfo.worstSeverity,
      alertCount: alertInfo.count,
      suppressedCount: pd?.suppressedCount ?? null,
      publishedCount: pd?.publishedCount ?? null,
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

router.get("/admin/recommendation-publication-audit", async (req, res): Promise<void> => {
  const nyToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const date = parseIsoDate(req.query.date, "date") ?? nyToday;
  const games = await db
    .select()
    .from(gamesTable)
    .where(and(eq(gamesTable.gameDate, date), eq(gamesTable.status, "upcoming")))
    .orderBy(gamesTable.startsAt);
  const gameIds = games.map((game) => game.id);
  const [permissions, effectivePicks] = await Promise.all([
    getMoneylinePublicationPermissionsForGames(gameIds),
    gameIds.length === 0
      ? Promise.resolve([])
      : db.select({
        gameId: publishedPicksTable.gameId,
        recommendation: publishedPicksTable.recommendation,
      }).from(publishedPicksTable).where(and(
        inArray(publishedPicksTable.gameId, gameIds),
        eq(publishedPicksTable.isEffective, true),
      )),
  ]);
  const effectiveByGame = new Map(effectivePicks.map((pick) => [pick.gameId, pick.recommendation]));
  const rows = games.map((game) => {
    const permission = permissions.get(game.id);
    const state = classifyRecommendationPublication({
      rawRecommendation: game.valueRating,
      approvalStatus: permission?.status ?? "UNVALIDATED",
      approvalReasons: permission?.reasons ?? ["exact_approval_record_missing"],
      effectivePublishedRecommendation: effectiveByGame.get(game.id),
    });
    const selectedHome = game.edge >= 0;
    const modelProbability = selectedHome ? game.homeWinPct : 100 - game.homeWinPct;
    const marketProbability = modelProbability - Math.abs(game.edge);
    return {
      gameId: game.id,
      sport: game.sport,
      matchup: `${game.awayTeamAbbr} @ ${game.homeTeamAbbr}`,
      startsAt: game.startsAt,
      market: "moneyline",
      modelVersion: permission?.modelVersion ?? null,
      modelProbability,
      marketProbability,
      edge: game.edge,
      confidence: game.confidence,
      approvalStatus: permission?.status ?? "UNVALIDATED",
      ...state,
    };
  });
  res.json({
    date,
    summary: summarizeRecommendationPublication(rows),
    rows,
    dataAsOf: new Date().toISOString(),
  });
});

// ── Automation history ────────────────────────────────────────────────────────

router.get("/admin/automation", async (req, res): Promise<void> => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 200);
  const jobName = req.query.job as string | undefined;

  const conditions = jobName
    ? [eq(automationRunsTable.jobName, jobName)]
    : [];

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
  const sport = typeof req.query.sport === "string" ? req.query.sport : undefined;

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

  const performedBy = getVerifiedAdminPrincipal(req);
  if (!performedBy) {
    res.status(401).json({ error: "Authenticated admin principal required" });
    return;
  }
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

  const performedBy = getVerifiedAdminPrincipal(req);
  if (!performedBy) {
    res.status(401).json({ error: "Authenticated admin principal required" });
    return;
  }
  const notes = req.body?.notes;

  const result = await rollbackModel(id, performedBy, true, notes);
  res.json(result);
});

function parseSpreadSport(value: string | undefined): SpreadSport | null {
  return value && Object.prototype.hasOwnProperty.call(SPREAD_CONFIGS, value)
    ? value as SpreadSport
    : null;
}

router.get("/admin/spread-models", async (_req, res): Promise<void> => {
  const persisted = await db.select().from(spreadModelConfigsTable);
  const bySport = new Map(persisted.map((row) => [row.sport, row]));
  const rows = await Promise.all(
    (Object.keys(SPREAD_CONFIGS) as SpreadSport[]).map(async (sport) => ({
      sport,
      config: SPREAD_CONFIGS[sport],
      status: bySport.get(sport)?.status ?? "shadow",
      metrics: await computeSpreadValidationMetrics(sport),
    })),
  );
  res.json({ models: rows });
});

router.get("/admin/market-approvals", async (_req, res): Promise<void> => {
  const approvals = await listLatestMarketApprovalDecisions();
  res.json({ approvals, dataAsOf: new Date().toISOString() });
});

function parseApprovalLayer(value: unknown): ApprovalLayerResult | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.status !== "PASSED" && row.status !== "FAILED" && row.status !== "INSUFFICIENT") return null;
  if (!Array.isArray(row.reasons) || !row.reasons.every((reason) => typeof reason === "string")) return null;
  if (!row.metrics || typeof row.metrics !== "object" || Array.isArray(row.metrics)) return null;
  return {
    status: row.status,
    reasons: row.reasons as string[],
    metrics: row.metrics as ApprovalLayerResult["metrics"],
  };
}

router.post("/admin/market-approvals", async (req, res): Promise<void> => {
  const performedBy = getVerifiedAdminPrincipal(req);
  if (!performedBy) {
    res.status(401).json({ error: "Authenticated admin principal required" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const dataIntegrity = parseApprovalLayer(body.dataIntegrity);
  const predictiveQuality = parseApprovalLayer(body.predictiveQuality);
  const bettingQuality = parseApprovalLayer(body.bettingQuality);
  const requestedStatus = body.status as MarketApprovalStatus;
  const requiredStrings = [
    "sport",
    "market",
    "modelVersion",
    "evaluationVersion",
    "datasetVersion",
    "featureSchemaVersion",
    "reason",
  ] as const;
  if (
    requiredStrings.some((key) => typeof body[key] !== "string" || !(body[key] as string).trim())
    || !MARKET_APPROVAL_STATUSES.includes(requestedStatus)
    || !dataIntegrity
    || !predictiveQuality
    || !bettingQuality
  ) {
    res.status(400).json({ error: "Invalid market approval decision" });
    return;
  }
  const evidenceCutoff = new Date(String(body.evidenceCutoff));
  if (!Number.isFinite(evidenceCutoff.getTime())) {
    res.status(400).json({ error: "A valid evidence cutoff is required" });
    return;
  }
  const derivedStatus = deriveApprovalStatus({
    hasEvaluationEvidence: Number(body.sampleSize ?? 0) > 0,
    dataIntegrity,
    predictiveQuality,
    bettingQuality,
  });
  if (
    requestedStatus === "PRODUCTION_APPROVED"
    && derivedStatus !== "PRODUCTION_APPROVED"
  ) {
    res.status(409).json({
      error: "Production approval requires all three evidence layers to pass",
      derivedStatus,
    });
    return;
  }
  const decision = await appendMarketApprovalDecision({
    sport: String(body.sport),
    market: String(body.market),
    modelVersion: String(body.modelVersion),
    evaluationVersion: String(body.evaluationVersion),
    datasetVersion: String(body.datasetVersion),
    featureSchemaVersion: String(body.featureSchemaVersion),
    trainingWindow: body.trainingWindow ?? null,
    validationWindow: body.validationWindow ?? null,
    outOfSampleWindow: body.outOfSampleWindow ?? null,
    evidenceCutoff,
    evaluationSeasons: Array.isArray(body.evaluationSeasons) ? body.evaluationSeasons : [],
    sampleSize: Number(body.sampleSize ?? 0),
    dataCoverage: body.dataCoverage == null ? null : Number(body.dataCoverage),
    dataIntegrity,
    predictiveQuality,
    bettingQuality,
    status: requestedStatus,
    reason: String(body.reason),
    previousStatus: typeof body.previousStatus === "string" ? body.previousStatus : null,
    evaluationMetadata: {
      ...(body.evaluationMetadata && typeof body.evaluationMetadata === "object"
        ? body.evaluationMetadata as Record<string, unknown>
        : {}),
      performedBy,
    },
  });
  res.status(201).json(decision);
});

router.get("/admin/market-comparisons", async (req, res): Promise<void> => {
  const sport = parseSpreadSport(typeof req.query.sport === "string" ? req.query.sport : "NCAAF");
  if (!sport) {
    res.status(400).json({ error: "Unsupported spread sport" });
    return;
  }
  const games = await db
    .select()
    .from(gamesTable)
    .where(and(eq(gamesTable.sport, sport), eq(gamesTable.status, "upcoming")))
    .orderBy(gamesTable.startsAt)
    .limit(100);
  const gameIds = games.map((game) => game.id);
  const [productionSpreadByGame, auditSpreadByGame, moneylinePermissions] = await Promise.all([
    getLatestSpreadCandidates(gameIds),
    getLatestSpreadCandidatesForAdmin(gameIds),
    getMoneylinePublicationPermissionsForGames(gameIds),
  ]);
  const comparisons = games.map((game) => {
    const moneylinePermission = moneylinePermissions.get(game.id);
    const moneylineQualified = moneylinePermission?.approved === true
      && (game.valueRating === "Strong Buy" || game.valueRating === "Buy");
    const moneylineIsHome = game.edge >= 0;
    const moneylineOdds = moneylineIsHome ? game.vegasHomeOdds : game.vegasAwayOdds;
    const moneylineProbability = (moneylineIsHome ? game.homeWinPct : 100 - game.homeWinPct) / 100;
    const payout = moneylineOdds > 0 ? moneylineOdds / 100 : 100 / Math.abs(moneylineOdds);
    const moneylineExpectedValue = moneylineProbability * payout - (1 - moneylineProbability);
    const spread = auditSpreadByGame.get(game.id) ?? null;
    const spreadCandidate = productionSpreadByGame.get(game.id) ?? null;
    const moneylineSelection = {
      market: "moneyline" as const,
      eligible: moneylineQualified,
      expectedValue: moneylineExpectedValue,
      edge: Math.abs(game.edge) / 100,
      modelProbability: moneylineProbability,
      uncertainty: Math.max(0, Math.min(1, 1 - game.confidenceNum / 100)),
      priceQuality: game.bestLineOdds === moneylineOdds ? 1 : 0.8,
      marketQuality: 1,
      dataQuality: 1,
    };
    const moneylineScore = scoreMarketCandidate(moneylineSelection);
    const spreadScore = spreadCandidate
      ? scoreMarketCandidate(spreadToMarketSelectionCandidate(spreadCandidate))
      : null;
    return {
      game: {
        id: game.id,
        matchup: `${game.awayTeamAbbr} @ ${game.homeTeamAbbr}`,
        startsAt: game.startsAt,
      },
      moneylineCandidate: {
        selection: moneylineIsHome ? "home" : "away",
        teamAbbr: moneylineIsHome ? game.homeTeamAbbr : game.awayTeamAbbr,
        odds: moneylineOdds,
        openingPrice: moneylineIsHome ? game.openingHomeOdds : game.openingAwayOdds,
        currentPrice: moneylineOdds,
        closingPrice: null,
        modelProbability: moneylineProbability,
        fairPrice: moneylineProbability >= 0.5
          ? Math.round(-(moneylineProbability / (1 - moneylineProbability)) * 100)
          : Math.round(((1 - moneylineProbability) / moneylineProbability) * 100),
        edge: Math.abs(game.edge) / 100,
        expectedValue: moneylineExpectedValue,
        noVigProbability: moneylineProbability - Math.abs(game.edge) / 100,
        uncertainty: moneylineSelection.uncertainty,
        confidence: game.confidence,
        recommendation: game.valueRating,
        units: moneylineQualified ? game.units : 0,
        researchRecommendation: game.valueRating,
        researchUnits: game.units,
        approvalStatus: moneylinePermission?.status ?? "UNVALIDATED",
        sportsbook: game.bestLineBook,
        capturedAt: game.updatedAt,
        modelVersion: moneylinePermission?.modelVersion ?? "unknown-moneyline-version",
        state: moneylinePermission?.status ?? "UNVALIDATED",
        gateReasons: moneylinePermission?.reasons ?? ["exact_approval_record_missing"],
      },
      spreadCandidate: spread ? {
        selection: spread.selection,
        teamAbbr: spread.teamAbbr,
        line: spread.line,
        odds: spread.odds,
        opposingLine: spread.opposingLine,
        opposingPrice: spread.opposingOdds,
        modelProbability: spread.modelProbability,
        noVigProbability: spread.noVigProbability,
        fairPrice: spread.fairPrice,
        edge: spread.edge,
        expectedValue: spread.expectedValue,
        pushProbability: spread.pushProbability,
        uncertainty: spread.uncertainty,
        confidence: spread.confidence,
        recommendation: spread.recommendation,
        units: spread.units,
        sportsbook: spread.sportsbook,
        capturedAt: spread.capturedAt,
        modelVersion: spread.modelVersion,
        state: spread.gateStatus,
        gateReasons: spread.gateReasons,
      } : null,
      officialSelectedMarket: choosePrimaryMarket(moneylineSelection, spreadCandidate),
      selectionScores: {
        moneyline: moneylineScore,
        spread: spreadScore,
      },
    };
  });
  res.json({ sport, comparisons, dataAsOf: new Date().toISOString() });
});

router.post("/admin/spread-models/:sport/refresh-validation", async (req, res): Promise<void> => {
  const sport = parseSpreadSport(req.params.sport);
  if (!sport) {
    res.status(400).json({ error: "Unsupported spread sport" });
    return;
  }
  const metrics = await refreshSpreadValidationMetrics(sport);
  res.json({ sport, metrics });
});

router.post("/admin/spread-models/:sport/promote", async (req, res): Promise<void> => {
  const sport = parseSpreadSport(req.params.sport);
  if (!sport) {
    res.status(400).json({ error: "Unsupported spread sport" });
    return;
  }
  const performedBy = getVerifiedAdminPrincipal(req);
  if (!performedBy) {
    res.status(401).json({ error: "Authenticated admin principal required" });
    return;
  }
  try {
    const metrics = await promoteSpreadModel(sport);
    res.json({ sport, status: "production", approvedBy: performedBy, metrics });
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : "Spread promotion gate failed",
    });
  }
});

router.post("/admin/spread-models/:sport/suspend", async (req, res): Promise<void> => {
  const sport = parseSpreadSport(req.params.sport);
  if (!sport) {
    res.status(400).json({ error: "Unsupported spread sport" });
    return;
  }
  const performedBy = getVerifiedAdminPrincipal(req);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!performedBy) {
    res.status(401).json({ error: "Authenticated admin principal required" });
    return;
  }
  if (!reason) {
    res.status(400).json({ error: "Suspension reason is required" });
    return;
  }
  try {
    await suspendSpreadModel(sport, `${reason} (by ${performedBy})`);
    res.json({ sport, status: "SUSPENDED", reason });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : "Spread suspension failed" });
  }
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

// ── Subscriber management ─────────────────────────────────────────────────────

/**
 * POST /admin/subscribers/grant
 * Body: { userId: string, expiresAt?: string (ISO) }
 * Grants or refreshes pro access for a user. Safe to call multiple times.
 */
router.post("/admin/subscribers/grant", async (req, res): Promise<void> => {
  const { userId, expiresAt: expiresAtStr } = req.body as { userId?: string; expiresAt?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const expiresAt = expiresAtStr
    ? new Date(expiresAtStr)
    : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  await db
    .insert(subscribersTable)
    .values({ userId, entitlement: "pro", isActive: true, expiresAt })
    .onConflictDoUpdate({
      target: subscribersTable.userId,
      set: { entitlement: "pro", isActive: true, expiresAt, updatedAt: new Date() },
    });

  logger.info({ userId, expiresAt }, "Admin: pro access granted");
  res.json({ granted: true, userId, expiresAt });
});

/**
 * POST /admin/subscribers/revoke
 * Body: { userId: string }
 * Revokes pro access for a user.
 */
router.post("/admin/subscribers/revoke", async (req, res): Promise<void> => {
  const { userId } = req.body as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  await db
    .insert(subscribersTable)
    .values({ userId, entitlement: "pro", isActive: false })
    .onConflictDoUpdate({
      target: subscribersTable.userId,
      set: { isActive: false, updatedAt: new Date() },
    });

  logger.info({ userId }, "Admin: pro access revoked");
  res.json({ revoked: true, userId });
});

/**
 * GET /admin/subscribers
 * Lists all subscriber records.
 */
router.get("/admin/subscribers", async (_req, res): Promise<void> => {
  const rows = await db.select().from(subscribersTable);
  res.json(rows);
});

export default router;
