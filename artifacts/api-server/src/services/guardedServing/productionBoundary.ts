import { randomUUID } from "node:crypto";
import { candidateExecutionAuditsTable, db, guardedServingAuditsTable } from "@workspace/db";
import type { FetchedGame } from "../espn";
import type { ProjectionResult } from "../model";
import type { PredictionDecisionContext } from "../snapshot";
import { isPredictionDecisionEligible } from "../snapshot";
import { guardedServingConfig } from "./config";
import { getCurrentMlbCandidateIdentity, getCurrentNcaafCandidateIdentity } from "./candidateRegistry";
import { resolveExactApproval } from "./approvalRegistry";
import { resolveMlbProductionEngine, resolveNcaafProductionEngine } from "./resolvers";
import { logger } from "../../lib/logger";
import type { EligibilitySignals, ExactArtifactIdentity, MlbResolution, NcaafResolution } from "./types";
import { MLB_CANDIDATE_ENGINE } from "./types";
import { candidateExecutorRegistry } from "./executorRegistry";
import { registerNcaafCandidateExecutor } from "./ncaafCandidateExecutor";
import { executeCurrentNcaafCandidateTwice, ncaafCandidateExecutor } from "./ncaafCandidateExecutor";
import { resolveNcaafMoneylineBridge, type NcaafMoneylineBridge } from "./ncaafMoneylineBridge";

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

async function audit(game: FetchedGame, identity: ExactArtifactIdentity, mode: string, resolution: MlbResolution | NcaafResolution, evidence: Record<string, unknown>, marketSnapshotId: number | null = null) {
  const auditId = randomUUID();
  await db.insert(guardedServingAuditsTable).values({
    auditId, dryRun: false, sport: game.sport, gameId: game.espnId, market: identity.market,
    configuredMode: mode, candidateModelId: identity.modelId, candidateVersion: identity.modelVersion,
    candidateArtifactHash: identity.artifactHash, candidateApprovalState: resolution.candidateApproval,
    selectedEngine: resolution.selectedEngine, resolution: resolution.kind, reason: resolution.reason,
    fallbackUsed: resolution.fallbackUsed, fallbackFrom: resolution.fallbackFrom,
    inputVersion: identity.inputContractVersion, inputSnapshotId: null,
    marketSnapshotId: marketSnapshotId == null ? null : String(marketSnapshotId),
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
    teamStateComplete: eligible, contextComplete: Boolean(context),
    pitSafe: eligible && Boolean(context) && !missing.has("pit_failure"),
    leakageSafe: eligible && Boolean(context) && !missing.has("leakage_failure"),
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
): Promise<ProductionBoundaryResult> {
  registerNcaafCandidateExecutor();
  if ((game.sport === "MLB" && guardedServingConfig.mlbMode === "v1")
    || (game.sport === "NCAAF" && guardedServingConfig.ncaafMode === "legacy")
    || (game.sport !== "MLB" && game.sport !== "NCAAF")) {
    return { disposition: "INCUMBENT", projection: incumbentProjection, resolution: null };
  }
  const mlb = game.sport === "MLB";
  const registered = mlb ? await getCurrentMlbCandidateIdentity() : getCurrentNcaafCandidateIdentity();
  const identity = registered ?? unresolvedMlbIdentity();
  const executor = registered ? candidateExecutorRegistry.resolve(identity) : null;
  const mode = mlb ? guardedServingConfig.mlbMode : guardedServingConfig.ncaafMode;
  const approval = await resolveExactApproval(identity, mode === "v4" || mode === "nextgen" ? "full" : "guarded");
  let execution: Awaited<ReturnType<typeof ncaafCandidateExecutor.execute>> | null = null;
  let executionSecond: Awaited<ReturnType<typeof ncaafCandidateExecutor.execute>> | null = null;
  let executionMaterialized: { snapshotId: string } | null = null;
  let executionHealth: "HEALTHY" | "UNHEALTHY" | null = null;
  let executionFailure: string | null = null;
  let moneylineBridge: NcaafMoneylineBridge | null = null;
  // Guarded NCAAF evaluates fresh evidence before resolution. It is audit-only:
  // no model_predictions, official identity, picks, notifications, analytics, or results are written.
  if (!mlb && executor === ncaafCandidateExecutor) {
    try {
      const shared = await executeCurrentNcaafCandidateTwice(new Date(), game.espnId);
        executionMaterialized = shared.materialized;
      executionHealth = shared.health.status;
      if (!shared.materialized) executionFailure = "NO_EXACT_ELIGIBLE_NCAAF_INPUT";
      else {
        execution = shared.first;
        executionSecond = shared.second;
        moneylineBridge = await resolveNcaafMoneylineBridge(
          shared.first.output, new Date(), shared.materialized.input.kickoffAt,
        );
      }
    } catch (error) {
      executionFailure = error instanceof Error ? error.message : "NCAAF_EXECUTION_FAILURE";
    }
  }
  const baseSignals = signals(game, decisionContext, executor);
  const availability = {
    ...baseSignals, identityResolved: registered !== null,
    ...(execution ? {
      inputAvailable: true, inputFresh: execution.evidence.fresh, contextComplete: execution.evidence.complete,
      pitSafe: execution.evidence.pitSafe, leakageSafe: execution.evidence.leakageSafe,
      starterOrQbComplete: execution.output.dataQuality !== "INSUFFICIENT",
      teamStateComplete: execution.output.dataQuality !== "INSUFFICIENT",
      marketFresh: moneylineBridge?.marketFresh ?? false,
      publicationEligible: Boolean(moneylineBridge?.publication.technicalReadiness.ready),
      runtimeHealth: executionHealth === "HEALTHY" ? "CANDIDATE_HEALTHY" as const : "CANDIDATE_RUNTIME_FAILURE" as const,
    } : executionFailure ? {
      inputAvailable: false, inputFresh: false, pitSafe: false, leakageSafe: false,
      runtimeHealth: "CANDIDATE_INPUT_UNAVAILABLE" as const,
    } : {}),
  };
  const resolution = mlb
    ? resolveMlbProductionEngine({ mode: mode as "v4_guarded" | "v4", identity, approval, signals: availability })
    : resolveNcaafProductionEngine({ mode: mode as "nextgen_guarded" | "nextgen", identity, approval, signals: availability });
  if (execution && executionSecond) {
    await db.insert(candidateExecutionAuditsTable).values({
      executionId: randomUUID(), dryRun: false, sport: "NCAAF", gameId: execution.output.gameId,
      market: "moneyline", modelFamily: identity.modelFamily, modelId: identity.modelId,
      modelVersion: identity.modelVersion, artifactId: identity.artifactId, artifactHash: identity.artifactHash,
      configurationHash: identity.configurationHash, parameterHash: identity.parameterHash,
      inputContractVersion: identity.inputContractVersion, inputSnapshotId: execution.evidence.snapshotId,
      inputHash: execution.evidence.inputHash, featureCutoff: new Date(execution.evidence.featureCutoff),
      materializedAt: new Date(execution.evidence.materializedAt), executedAt: new Date(execution.executedAt),
      rawOutput: execution.output, outputHash: execution.outputHash, secondOutputHash: executionSecond.outputHash,
      reproducible: execution.outputHash === executionSecond.outputHash, executorHealth: executionHealth ?? "UNHEALTHY",
      pitSafe: execution.evidence.pitSafe, leakageSafe: execution.evidence.leakageSafe,
      resolverReason: resolution.reason,
      publicationDisposition: resolution.kind === "PASS" ? "SUPPRESSED_PASS" : resolution.fallbackUsed ? "INCUMBENT_FALLBACK" : "OFFICIAL_BRIDGE_BLOCKED",
      evidence: {
        source: "central-boundary-fresh-ncaaf-executor", executionStatus: "COMPLETED",
        executionCount: 2, snapshotId: executionMaterialized?.snapshotId ?? execution.evidence.snapshotId,
        officialPersistence: false,
         moneylineBridge,
      },
    });
  }
  if ((resolution.kind === "V4_GUARDED" || resolution.kind === "V4_FULL" || resolution.kind === "NEXTGEN_GUARDED" || resolution.kind === "NEXTGEN_FULL") && executor) {
    // Executors return raw sports semantics, never an incumbent-writer object.
    // Official candidate persistence remains approval- and adapter-gated and
    // must be supplied by a versioned bridge rather than a route injection.
    await audit(game, identity, mode, resolution, {
      source: "central-production-prediction-boundary-v2", exactRegistryPresent: true,
      executorAvailable: true, candidateExecution: execution ? "COMPLETED" : executionFailure ? "FAILED" : "NOT_ATTEMPTED",
      inputSnapshotId: execution?.evidence.snapshotId ?? null,
      outputHash: execution?.outputHash ?? null, secondOutputHash: executionSecond?.outputHash ?? null,
      reproducible: Boolean(execution && executionSecond && execution.outputHash === executionSecond.outputHash),
      blocker: "EXACT_OFFICIAL_PUBLICATION_BRIDGE_UNAVAILABLE",
       moneylineBridge,
      publicPickOrNotificationCreatedByBoundary: false,
     }, moneylineBridge?.market?.snapshotId ?? null);
    return { disposition: "FALLBACK", projection: incumbentProjection, resolution };
  }
  await audit(game, identity, mode, resolution, {
    source: "central-production-prediction-boundary-v2",
    exactRegistryPresent: registered !== null, executorAvailable: Boolean(executor),
    candidateExecution: execution ? "COMPLETED" : executionFailure ? "FAILED" : executor ? "NOT_ATTEMPTED_EXACT_INPUT_UNAVAILABLE" : "NOT_ATTEMPTED_EXACT_EXECUTOR_UNAVAILABLE",
    inputSnapshotId: execution?.evidence.snapshotId ?? null,
    outputHash: execution?.outputHash ?? null, secondOutputHash: executionSecond?.outputHash ?? null,
    reproducible: Boolean(execution && executionSecond && execution.outputHash === executionSecond.outputHash),
    executionFailure,
    moneylineBridge,
    publicPickOrNotificationCreatedByBoundary: false,
   }, moneylineBridge?.market?.snapshotId ?? null);
  return resolution.kind === "PASS"
    ? { disposition: "PASS", projection: null, resolution }
    : { disposition: "FALLBACK", projection: incumbentProjection, resolution };
}