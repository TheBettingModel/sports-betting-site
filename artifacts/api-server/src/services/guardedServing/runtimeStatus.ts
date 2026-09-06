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

async function latestPrediction(modelId: string): Promise<Date | null> {
  const [row] = await db.select({ at: modelPredictionsTable.predictionTimestamp })
    .from(modelPredictionsTable)
    .innerJoin(modelVersionsTable, eq(modelPredictionsTable.modelVersionId, modelVersionsTable.id))
    .where(eq(modelVersionsTable.modelId, modelId))
    .orderBy(desc(modelPredictionsTable.predictionTimestamp)).limit(1);
  return row?.at ?? null;
}

export async function getGuardedServingRuntimeStatus() {
  const mlbIdentity = await getCurrentMlbCandidateIdentity();
  const ncaafIdentity = getCurrentNcaafCandidateIdentity();
  const [
    mlbApproval, ncaafApproval, mlbIncumbentPrediction, ncaafIncumbentPrediction,
    mlbEvidence, ncaafEvidence, official, reviews,
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
  ]);
  const sportStatus = resolveRuntimeSportStatus;
  return {
    generatedAt: new Date().toISOString(),
    automaticRetraining: "DISABLED",
    automaticParameterChanges: "DISABLED",
    automaticPromotion: "DISABLED",
    sports: [
      sportStatus("MLB", guardedServingConfig.mlbMode, MLB_INCUMBENT_ENGINE, mlbIdentity, mlbApproval, mlbIncumbentPrediction, mlbEvidence[0]?.at ?? null),
      sportStatus("NCAAF", guardedServingConfig.ncaafMode, NCAAF_INCUMBENT_ENGINE, ncaafIdentity, ncaafApproval, ncaafIncumbentPrediction, ncaafEvidence[0]?.at ?? null),
    ],
    reviews,
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
  ) {
    const incumbentMode = mode === "v1" || mode === "legacy";
    const candidateHealth = !identity ? "CANDIDATE_INPUT_UNAVAILABLE"
      : !approval?.approved ? "CANDIDATE_UNAPPROVED"
      : !executorAvailable ? "CANDIDATE_RUNTIME_UNAVAILABLE"
      : "CANDIDATE_HEALTHY";
    const fallbackHealth = lastPrediction ? "FALLBACK_HEALTHY" : "SERVING_DEGRADED";
    const resolvedServingState = incumbentMode ? "INCUMBENT_ACTIVE"
      : !executorAvailable ? "STARTUP_BLOCKED"
      : !approval?.approved ? "INCUMBENT_FALLBACK"
      : "CANDIDATE_ACTIVE";
    return ({
    sport,
    configuredMode: mode,
    activePrimaryEngine: resolvedServingState === "CANDIDATE_ACTIVE" ? identity?.modelId ?? incumbent : incumbent,
    candidateEngine: identity?.modelId ?? null,
    candidateVersion: identity?.modelVersion ?? null,
    candidateArtifactHash: identity?.artifactHash ?? null,
    approvalStatus: approval?.state ?? "UNVALIDATED",
    executorAvailable,
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
      ? incumbentMode ? "APPROVED_NOT_ENABLED" : !executorAvailable ? "BLOCKED_BY_RUNTIME" : "ELIGIBLE_BY_APPROVAL"
      : "BLOCKED_BY_APPROVAL",
    });
}