import { randomUUID } from "node:crypto";
import { db, guardedServingAuditsTable } from "@workspace/db";
import type { FetchedGame } from "../espn";
import type { ProjectionResult } from "../model";
import type { PredictionDecisionContext } from "../snapshot";
import { isPredictionDecisionEligible } from "../snapshot";
import { guardedServingConfig } from "./config";
import { getCurrentMlbCandidateIdentity, getCurrentNcaafCandidateIdentity } from "./candidateRegistry";
import { resolveExactApproval } from "./approvalRegistry";
import { resolveMlbProductionEngine, resolveNcaafProductionEngine } from "./resolvers";
import { adaptApprovedNextGenOutput, type NextGenPublicationInput } from "./publicationAdapter";
import { persistOfficialPredictionIdentity } from "./persistence";
import { logger } from "../../lib/logger";
import type { EligibilitySignals, ExactArtifactIdentity, MlbResolution, NcaafResolution } from "./types";
import { MLB_CANDIDATE_ENGINE } from "./types";

/** A candidate must write its own immutable prediction before this boundary can publish its identity. */
export interface GuardedCandidateExecutor<TInput, TOutput> {
  readonly modelId: string;
  readonly inputContractVersion: string;
  execute(input: TInput): Promise<TOutput>;
}
export interface CandidateExecution {
  predictionId: number;
  projection: ProjectionResult;
  adapterInput: NextGenPublicationInput;
}
export type ProductionBoundaryResult =
  | { disposition: "INCUMBENT"; projection: ProjectionResult; resolution: null }
  | { disposition: "FALLBACK"; projection: ProjectionResult; resolution: MlbResolution | NcaafResolution }
  | { disposition: "CANDIDATE"; projection: ProjectionResult; resolution: MlbResolution | NcaafResolution }
  | { disposition: "PASS"; projection: null; resolution: MlbResolution | NcaafResolution };

/** Candidate-owned predictions must never enter the incumbent snapshot writer. */
export function shouldRunIncumbentSnapshot(result: ProductionBoundaryResult): result is Extract<ProductionBoundaryResult, { disposition: "INCUMBENT" | "FALLBACK" }> {
  return result.disposition === "INCUMBENT" || result.disposition === "FALLBACK";
}

const unresolvedMlbIdentity = (): ExactArtifactIdentity => ({
  sport: "MLB", market: "moneyline", modelFamily: "expected-runs", modelId: MLB_CANDIDATE_ENGINE,
  modelVersion: "UNRESOLVED", artifactId: "REGISTRY_RECORD_MISSING",
  artifactHash: "REGISTRY_RECORD_MISSING", inputContractVersion: "model-input-v4",
});

async function audit(game: FetchedGame, identity: ExactArtifactIdentity, mode: string, resolution: MlbResolution | NcaafResolution, evidence: Record<string, unknown>) {
  const auditId = randomUUID();
  await db.insert(guardedServingAuditsTable).values({
    auditId, dryRun: false, sport: game.sport, gameId: game.espnId, market: identity.market,
    configuredMode: mode, candidateModelId: identity.modelId, candidateVersion: identity.modelVersion,
    candidateArtifactHash: identity.artifactHash, candidateApprovalState: resolution.candidateApproval,
    selectedEngine: resolution.selectedEngine, resolution: resolution.kind, reason: resolution.reason,
    fallbackUsed: resolution.fallbackUsed, fallbackFrom: resolution.fallbackFrom,
    inputVersion: identity.inputContractVersion, inputSnapshotId: null, marketSnapshotId: null,
    runtimeHealth: resolution.candidateHealth,
    publicationDisposition: resolution.kind === "PASS" ? "SUPPRESSED_PASS" : resolution.fallbackUsed ? "INCUMBENT_FALLBACK" : "CANDIDATE",
    evidence, resolvedAt: new Date(),
  });
  logger.info({ event: "guarded_serving_resolution", auditId, dryRun: false, sport: game.sport,
    gameId: game.espnId, configuredMode: mode, candidate: identity.modelId,
    candidateApproval: resolution.candidateApproval, selectedEngine: resolution.selectedEngine,
    fallbackUsed: resolution.fallbackUsed, fallbackReason: resolution.fallbackUsed ? resolution.reason : null,
    passReason: resolution.kind === "PASS" ? resolution.reason : null,
  }, "Guarded serving production boundary resolved");
}

function signals(game: FetchedGame, context: PredictionDecisionContext | undefined, executor: unknown): EligibilitySignals {
  const missing = new Set(context?.dataQuality.missingSignals ?? ["decision_context_missing"]);
  const eligible = isPredictionDecisionEligible(game, context);
  return {
    identityResolved: true, inputAvailable: eligible, inputFresh: ![...missing].some((x) => x.includes("stale")),
    starterOrQbComplete: game.sport === "NCAAF" ? !missing.has("independent_team_evidence") : !missing.has("probable_pitchers"),
    teamStateComplete: eligible, contextComplete: Boolean(context), pitSafe: true, leakageSafe: true,
    marketFresh: !missing.has("market_odds") && !missing.has("market_started_or_invalid"),
    runtimeHealth: executor ? "CANDIDATE_HEALTHY" : "CANDIDATE_RUNTIME_FAILURE",
    publicationEligible: eligible, incumbentEligible: eligible,
  };
}

/**
 * Sole serving selection seam used by both scheduler and games refresh.
 * Default incumbent modes return the exact incumbent object and perform no new
 * DB work. Existing V4 shadow computation is deliberately not an executor: it
 * consumes MlbV4Input, not authoritative model-input-v4 snapshots.
 */
export async function resolveProductionPredictionBoundary(
  game: FetchedGame, incumbentProjection: ProjectionResult, decisionContext?: PredictionDecisionContext,
  executor?: GuardedCandidateExecutor<{ game: FetchedGame; decisionContext?: PredictionDecisionContext }, CandidateExecution>,
): Promise<ProductionBoundaryResult> {
  if ((game.sport === "MLB" && guardedServingConfig.mlbMode === "v1")
    || (game.sport === "NCAAF" && guardedServingConfig.ncaafMode === "legacy")
    || (game.sport !== "MLB" && game.sport !== "NCAAF")) {
    return { disposition: "INCUMBENT", projection: incumbentProjection, resolution: null };
  }
  const mlb = game.sport === "MLB";
  const registered = mlb ? await getCurrentMlbCandidateIdentity() : getCurrentNcaafCandidateIdentity();
  const identity = registered ?? unresolvedMlbIdentity();
  const mode = mlb ? guardedServingConfig.mlbMode : guardedServingConfig.ncaafMode;
  const approval = await resolveExactApproval(identity, mode === "v4" || mode === "nextgen" ? "full" : "guarded");
  const availability = { ...signals(game, decisionContext, executor), identityResolved: registered !== null };
  const resolution = mlb
    ? resolveMlbProductionEngine({ mode: mode as "v4_guarded" | "v4", identity, approval, signals: availability })
    : resolveNcaafProductionEngine({ mode: mode as "nextgen_guarded" | "nextgen", identity, approval, signals: availability });
  if ((resolution.kind === "V4_GUARDED" || resolution.kind === "V4_FULL" || resolution.kind === "NEXTGEN_GUARDED" || resolution.kind === "NEXTGEN_FULL") && executor) {
    if (executor.modelId !== identity.modelId || executor.inputContractVersion !== identity.inputContractVersion) throw new Error("Authentic candidate executor identity/input contract does not match exact approved artifact");
    const executed = await executor.execute({ game, decisionContext });
    const publication = adaptApprovedNextGenOutput(executed.adapterInput, resolution);
    if (!publication) throw new Error("Exact approved candidate executor returned output that cannot be adapted for publication");
    await persistOfficialPredictionIdentity(executed.predictionId, publication, "ELIGIBLE");
    await audit(game, identity, mode, resolution, { source: "central-production-prediction-boundary-v1", exactRegistryPresent: true, executorAvailable: true, candidateExecution: "AUTHENTIC_TYPED_EXECUTOR_COMPLETED", publicPickOrNotificationCreatedByBoundary: false });
    return { disposition: "CANDIDATE", projection: executed.projection, resolution };
  }
  await audit(game, identity, mode, resolution, { source: "central-production-prediction-boundary-v1", exactRegistryPresent: registered !== null, executorAvailable: false, candidateExecution: "NOT_ATTEMPTED_WITHOUT_AUTHENTIC_TYPED_EXECUTOR", publicPickOrNotificationCreatedByBoundary: false });
  return resolution.kind === "PASS"
    ? { disposition: "PASS", projection: null, resolution }
    : { disposition: "FALLBACK", projection: incumbentProjection, resolution };
}