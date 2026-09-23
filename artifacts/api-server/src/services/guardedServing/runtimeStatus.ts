import { desc, eq } from "drizzle-orm";
import {
  db, mlbV4CollectionRunsTable, modelPredictionsTable, modelVersionsTable,
  ncaafV4GameDayPredictionsTable, officialPredictionIdentityTable,
} from "@workspace/db";
import { guardedServingConfig } from "./config";
import { getCurrentMlbCandidateIdentity, getCurrentNcaafCandidateIdentity } from "./candidateRegistry";
import { resolveExactApproval } from "./approvalRegistry";
import {
  MLB_INCUMBENT_ENGINE, NCAAF_INCUMBENT_ENGINE,
} from "./types";
import { evaluateCurrentCandidates } from "./currentReviews";
import type { ExactApproval, ExactArtifactIdentity } from "./types";
import { candidateExecutorRegistry } from "./executorRegistry";
import { registerNcaafCandidateExecutor } from "./ncaafCandidateExecutor";
import {
  evaluateTechnicalCutoverReadiness, inspectGuardedPersistenceReadiness,
} from "./technicalReadiness";

async function latestPrediction(modelId: string): Promise<Date | null> {
  const [row] = await db.select({ at: modelPredictionsTable.predictionTimestamp })
    .from(modelPredictionsTable)
    .innerJoin(modelVersionsTable, eq(modelPredictionsTable.modelVersionId, modelVersionsTable.id))
    .where(eq(modelVersionsTable.modelId, modelId))
    .orderBy(desc(modelPredictionsTable.predictionTimestamp)).limit(1);
  return row?.at ?? null;
}

export async function getGuardedServingRuntimeStatus() {
  registerNcaafCandidateExecutor();
  const mlbIdentity = await getCurrentMlbCandidateIdentity();
  const ncaafIdentity = getCurrentNcaafCandidateIdentity();
  const mlbExecutor = mlbIdentity ? candidateExecutorRegistry.resolve(mlbIdentity) : null;
  const ncaafExecutor = candidateExecutorRegistry.resolve(ncaafIdentity);
  const [mlbExecutorHealth, ncaafExecutorHealth] = await Promise.all([
    mlbExecutor?.health() ?? null, ncaafExecutor?.health() ?? null,
  ]);
  const [
    mlbApproval, ncaafApproval, mlbIncumbentPrediction, ncaafIncumbentPrediction,
    mlbEvidence, ncaafEvidence, official, reviews, persistence,
  ] = await Promise.all([
    mlbIdentity ? resolveExactApproval(mlbIdentity, guardedServingConfig.mlbMode === "v4" ? "full" : "guarded") : null,
    resolveExactApproval(ncaafIdentity, guardedServingConfig.ncaafMode === "nextgen" ? "full" : "guarded"),
    latestPrediction(MLB_INCUMBENT_ENGINE),
    latestPrediction(NCAAF_INCUMBENT_ENGINE),
    db.select({ at: mlbV4CollectionRunsTable.completedAt }).from(mlbV4CollectionRunsTable)
      .orderBy(desc(mlbV4CollectionRunsTable.completedAt)).limit(1),
    db.select({ at: ncaafV4GameDayPredictionsTable.createdAt }).from(ncaafV4GameDayPredictionsTable)
      .orderBy(desc(ncaafV4GameDayPredictionsTable.createdAt)).limit(1),
    db.select().from(officialPredictionIdentityTable)
      .orderBy(desc(officialPredictionIdentityTable.predictionTimestamp)).limit(1),
    evaluateCurrentCandidates(),
    inspectGuardedPersistenceReadiness(),
  ]);
  const sportStatus = resolveRuntimeSportStatus;
  const mlbBridgeReady = false;
  const ncaafBridgeReady = false;
  const mlbDryRun = persistence.latestDryRunResolutions.mlb;
  const ncaafDryRun = persistence.latestDryRunResolutions.ncaaf;
  const resolverObserved = (audit: typeof mlbDryRun) => Boolean(audit?.dryRun && audit.resolution);
  const safeDispositionObserved = (audit: typeof mlbDryRun) => Boolean(
    audit && (audit.fallbackUsed || audit.resolution === "PASS"),
  );
  const readiness = evaluateTechnicalCutoverReadiness({
    executors: { mlb: Boolean(mlbExecutor), ncaaf: Boolean(ncaafExecutor) },
    executorHealth: { mlb: mlbExecutorHealth?.status === "HEALTHY", ncaaf: ncaafExecutorHealth?.status === "HEALTHY" },
    reproducibility: {
      mlb: Boolean(persistence.latestSafeExecutions.mlb?.safe),
      ncaaf: Boolean(persistence.latestSafeExecutions.ncaaf?.safe),
    },
    freshInference: {
      mlb: Boolean(persistence.latestSafeExecutions.mlb?.safe),
      ncaaf: Boolean(persistence.latestSafeExecutions.ncaaf?.safe),
    },
    bridges: { mlb: mlbBridgeReady, ncaaf: ncaafBridgeReady },
    guardedResolver: resolverObserved(mlbDryRun) && resolverObserved(ncaafDryRun),
    fallback: safeDispositionObserved(mlbDryRun) && safeDispositionObserved(ncaafDryRun),
    killSwitch: guardedServingConfig.mlbMode === "v1" && guardedServingConfig.ncaafMode === "legacy",
    dryRunSeparation: Boolean(mlbDryRun?.dryRun && ncaafDryRun?.dryRun),
    observability: {
      mlbExecutorAudit: Boolean(persistence.latestSafeExecutions.mlb?.safe),
      ncaafExecutorAudit: Boolean(persistence.latestSafeExecutions.ncaaf?.safe),
      mlbResolverObserved: resolverObserved(mlbDryRun),
      ncaafResolverObserved: resolverObserved(ncaafDryRun),
      mlbSafeDispositionObserved: safeDispositionObserved(mlbDryRun),
      ncaafSafeDispositionObserved: safeDispositionObserved(ncaafDryRun),
      appendOnlyMutationRejectionVerified: persistence.appendOnlyMutationRejectionVerified,
      officialHistoryIntegrity: persistence.officialHistoryIntegrity.orphanedPredictionIdentities === 0
        && persistence.officialHistoryIntegrity.orphanedLifecycleEvents === 0
        && persistence.officialHistoryIntegrity.identitiesWithoutLifecycle === 0,
    },
    schema: persistence.schema,
    approval: { mlb: Boolean(mlbApproval?.approved), ncaaf: Boolean(ncaafApproval?.approved) },
    officialIdentityCount: persistence.counts.officialIdentity,
    officialLifecycleCount: persistence.counts.officialLifecycle,
  });
  return {
    generatedAt: new Date().toISOString(),
    automaticRetraining: "DISABLED",
    automaticParameterChanges: "DISABLED",
    automaticPromotion: "DISABLED",
    sports: [
      sportStatus("MLB", guardedServingConfig.mlbMode, MLB_INCUMBENT_ENGINE, mlbIdentity, mlbApproval, mlbIncumbentPrediction, mlbEvidence[0]?.at ?? null, Boolean(mlbExecutor), mlbExecutorHealth, mlbExecutor?.identity.supportedMarkets, mlbBridgeReady),
      sportStatus("NCAAF", guardedServingConfig.ncaafMode, NCAAF_INCUMBENT_ENGINE, ncaafIdentity, ncaafApproval, ncaafIncumbentPrediction, ncaafEvidence[0]?.at ?? null, Boolean(ncaafExecutor), ncaafExecutorHealth, ncaafExecutor?.identity.supportedMarkets, ncaafBridgeReady),
    ],
    reviews,
    technicalReadiness: {
      ...readiness,
      guardedPersistence: persistence,
    },
    latestOfficialPrediction: official[0] ? {
      predictionId: official[0].predictionId,
      sport: official[0].sport,
      engine: official[0].engine,
      modelVersion: official[0].modelVersion,
      publicationStatus: official[0].publicationStatus,
      predictionTimestamp: official[0].predictionTimestamp.toISOString(),
    } : null,
  };
}

/** Pure status resolver: no approval row can make an unregistered executor active. */
export function resolveRuntimeSportStatus(
    sport: "MLB" | "NCAAF",
    mode: string,
    incumbent: string,
    identity: ExactArtifactIdentity | null,
    approval: ExactApproval | null,
    lastPrediction: Date | null,
    lastEvidence: Date | null,
    executorAvailable = false,
    executorHealth: { status: "HEALTHY" | "UNHEALTHY"; reproducibilityReady: boolean; reason: string; checkedAt: string } | null = null,
    supportedMarkets?: Readonly<Record<string, string>>,
    officialBridgeReady = false,
  ) {
    const incumbentMode = mode === "v1" || mode === "legacy";
    const candidateHealth = !identity ? "CANDIDATE_INPUT_UNAVAILABLE"
      : !approval?.approved ? "CANDIDATE_UNAPPROVED"
      : !executorAvailable ? "CANDIDATE_RUNTIME_UNAVAILABLE"
      : "CANDIDATE_HEALTHY";
    const fallbackHealth = lastPrediction ? "FALLBACK_HEALTHY" : "SERVING_DEGRADED";
    const resolvedServingState = incumbentMode ? "INCUMBENT_ACTIVE"
      : !executorAvailable ? "STARTUP_BLOCKED"
      : !approval?.approved || !officialBridgeReady ? "INCUMBENT_FALLBACK"
      : "CANDIDATE_ACTIVE";
    return ({
    sport,
    configuredMode: mode,
    activePrimaryEngine: resolvedServingState === "CANDIDATE_ACTIVE" ? identity?.modelId ?? incumbent : incumbent,
    candidateEngine: identity?.modelId ?? null,
    candidateVersion: identity?.modelVersion ?? null,
    candidateArtifactHash: identity?.artifactHash ?? null,
    candidateArtifactId: identity?.artifactId ?? null,
    approvalStatus: approval?.state ?? "UNVALIDATED",
    executorAvailable,
    executorHealth: executorHealth?.status ?? "UNAVAILABLE",
    executorHealthReason: executorHealth?.reason ?? "EXACT_EXECUTOR_NOT_REGISTERED",
    reproducibilityReady: executorHealth?.reproducibilityReady ?? false,
    officialBridgeReady,
    officialBridgeStatus: officialBridgeReady ? "READY" : "BLOCKED",
    supportedMarkets: supportedMarkets ?? {},
    resolvedServingState,
    approvedMarkets: approval?.approved && identity ? [identity.market] : [],
    inputContract: identity?.inputContractVersion ?? null,
    lastSuccessfulPrediction: lastPrediction?.toISOString() ?? null,
    lastSuccessfulEvidenceCollection: lastEvidence?.toISOString() ?? null,
    fallbackEngine: incumbent,
    fallbackHealth,
    runtimeHealth: candidateHealth,
    healthStatuses: [
      lastPrediction ? "INCUMBENT_HEALTHY" : "SERVING_DEGRADED",
      candidateHealth,
      fallbackHealth,
    ],
    publicationStatus: approval?.approved
      ? incumbentMode ? "APPROVED_NOT_ENABLED" : !executorAvailable ? "BLOCKED_BY_RUNTIME" : !officialBridgeReady ? "BLOCKED_BY_OFFICIAL_BRIDGE" : "ELIGIBLE_BY_APPROVAL"
      : "BLOCKED_BY_APPROVAL",
    });
}