import { randomUUID } from "node:crypto";
import { desc, gt } from "drizzle-orm";
import {
  candidateExecutionAuditsTable, db, guardedServingAuditsTable, mlbV4PregameFeaturesTable,
} from "@workspace/db";
import { guardedServingConfig } from "./config";
import { getCurrentMlbCandidateIdentity, getCurrentNcaafCandidateIdentity } from "./candidateRegistry";
import { resolveExactApproval } from "./approvalRegistry";
import { resolveMlbProductionEngine, resolveNcaafProductionEngine } from "./resolvers";
import { evaluateCandidateWithoutPublishing } from "./nonPublishingCandidateAdapter";
import { logger } from "../../lib/logger";
import type { EligibilitySignals, ExactArtifactIdentity } from "./types";
import { MLB_CANDIDATE_ENGINE } from "./types";
import { candidateExecutorRegistry } from "./executorRegistry";
import {
  executeCurrentNcaafCandidateTwice, ncaafCandidateExecutor,
  registerNcaafCandidateExecutor,
} from "./ncaafCandidateExecutor";
import { resolveNcaafMoneylineBridge } from "./ncaafMoneylineBridge";

function unavailableSignals(): EligibilitySignals {
  return {
    identityResolved: true, inputAvailable: false, inputFresh: false,
    starterOrQbComplete: false, teamStateComplete: false, contextComplete: false,
    pitSafe: false, leakageSafe: false, marketFresh: false,
    runtimeHealth: "CANDIDATE_INPUT_UNAVAILABLE", publicationEligible: false,
    incumbentEligible: true,
  };
}

async function persistAudit(input: {
  sport: "MLB" | "NCAAF";
  gameId: string | null;
  identity: ExactArtifactIdentity;
  mode: string;
  resolution: ReturnType<typeof resolveMlbProductionEngine> | ReturnType<typeof resolveNcaafProductionEngine>;
  disposition: "WOULD_SERVE" | "WOULD_FALLBACK" | "WOULD_PASS";
  snapshotId: string | null;
  marketSnapshotId?: number | null;
  evidence: Record<string, unknown>;
  now: Date;
}) {
  const auditId = randomUUID();
  await db.insert(guardedServingAuditsTable).values({
    auditId,
    dryRun: true,
    sport: input.sport,
    gameId: input.gameId,
    market: input.identity.market,
    configuredMode: input.mode,
    candidateModelId: input.identity.modelId,
    candidateVersion: input.identity.modelVersion,
    candidateArtifactHash: input.identity.artifactHash,
    candidateApprovalState: input.resolution.candidateApproval,
    selectedEngine: input.resolution.selectedEngine,
    resolution: input.resolution.kind,
    reason: input.resolution.reason,
    fallbackUsed: input.resolution.fallbackUsed,
    fallbackFrom: input.resolution.fallbackFrom,
    inputVersion: input.identity.inputContractVersion,
    inputSnapshotId: input.snapshotId,
    marketSnapshotId: input.marketSnapshotId == null ? null : String(input.marketSnapshotId),
    runtimeHealth: input.resolution.candidateHealth,
    publicationDisposition: input.disposition,
    evidence: input.evidence,
    resolvedAt: input.now,
  });
  logger.info({
    event: "guarded_serving_resolution", auditId, dryRun: true,
    sport: input.sport, gameId: input.gameId, market: input.identity.market,
    configuredMode: input.mode, candidate: input.identity.modelId,
    candidateApproval: input.resolution.candidateApproval,
    selectedEngine: input.resolution.selectedEngine,
    fallbackUsed: input.resolution.fallbackUsed,
    fallbackReason: input.resolution.fallbackUsed ? input.resolution.reason : null,
    passReason: input.resolution.kind === "PASS" ? input.resolution.reason : null,
    inputVersion: input.identity.inputContractVersion,
    runtimeHealth: input.resolution.candidateHealth,
  }, "Guarded serving dry-run resolved");
  return auditId;
}

export async function runMlbRealSlateDryRun(now = new Date()) {
  const registryIdentity = await getCurrentMlbCandidateIdentity();
  const [feature] = await db.select().from(mlbV4PregameFeaturesTable)
    .where(gt(mlbV4PregameFeaturesTable.scheduledFirstPitch, now))
    .orderBy(desc(mlbV4PregameFeaturesTable.featureCutoff)).limit(1);
  const identity: ExactArtifactIdentity = registryIdentity ?? {
    sport: "MLB", market: "moneyline", modelFamily: "expected-runs",
    modelId: MLB_CANDIDATE_ENGINE, modelVersion: "UNRESOLVED",
    artifactId: "REGISTRY_RECORD_MISSING",
    artifactHash: "REGISTRY_RECORD_MISSING",
    inputContractVersion: feature?.schemaVersion ?? "model-input-v4",
  };
  const executor = registryIdentity ? candidateExecutorRegistry.resolve(identity) : null;
  const evaluationMode = guardedServingConfig.mlbMode === "v1" ? "v4_guarded" : guardedServingConfig.mlbMode;
  const approval = await resolveExactApproval(identity, evaluationMode === "v4" ? "full" : "guarded");
  const signals = feature && executor ? {
    identityResolved: registryIdentity !== null,
    inputAvailable: true,
    inputFresh: now.getTime() - feature.featureCutoff.getTime() <= 24 * 60 * 60_000,
    starterOrQbComplete: feature.starterCoreEligible,
    teamStateComplete: feature.baselineCoreEligible,
    contextComplete: feature.baselineCoreEligible,
    pitSafe: feature.pitSafe,
    leakageSafe: false,
    marketFresh: false,
    runtimeHealth: "CANDIDATE_HEALTHY" as const,
    publicationEligible: true,
    incumbentEligible: true,
  } : unavailableSignals();
  const resolution = resolveMlbProductionEngine({ mode: evaluationMode, identity, approval, signals });
  const finalResolution: typeof resolution = !feature ? {
    ...resolution, kind: "PASS", reason: "NO_ELIGIBLE_UPCOMING_MLB_SLATE",
    selectedEngine: null, fallbackUsed: false, fallbackFrom: null,
  } : !executor ? {
    ...resolution, kind: "PASS", reason: "MLB_EXACT_EXECUTOR_UNREGISTERED",
    selectedEngine: null, fallbackUsed: false, fallbackFrom: null,
  } : resolution;
  const adapted = null;
  const disposition = finalResolution.fallbackUsed ? "WOULD_FALLBACK" as const : "WOULD_PASS" as const;
  const auditId = await persistAudit({
    sport: "MLB", gameId: feature?.gameId ?? null, identity,
    mode: evaluationMode, resolution: finalResolution, disposition,
    snapshotId: feature?.snapshotId ?? null,
    evidence: {
      source: "model-input-v4", actualConfiguredMode: guardedServingConfig.mlbMode,
      registryRecordFound: Boolean(registryIdentity), featureFound: Boolean(feature),
      executorAvailable: Boolean(executor), candidateExecution: "BLOCKED_EXECUTABLE_ARTIFACT_NOT_PRESENT",
      oldShadowOutputUsed: false, adapterTraversed: false, universalPipelineTraversed: false,
    },
    now,
  });
  return { auditId, sport: "MLB", gameId: feature?.gameId ?? null, disposition, resolution: finalResolution };
}

export async function runNcaafRealSlateDryRun(now = new Date()) {
  registerNcaafCandidateExecutor();
  const identity = getCurrentNcaafCandidateIdentity();
  const evaluationMode = guardedServingConfig.ncaafMode === "legacy" ? "nextgen_guarded" : guardedServingConfig.ncaafMode;
  const approval = await resolveExactApproval(identity, evaluationMode === "nextgen" ? "full" : "guarded");
  const executor = candidateExecutorRegistry.resolve(identity);
  if (!executor || executor !== ncaafCandidateExecutor) {
    throw new Error("Exact NCAAF candidate executor is not registered");
  }
  const { materialized, first, second, health } = await executeCurrentNcaafCandidateTwice(now);
  const candidate = first?.output;
  const bridge = candidate && materialized
    ? await resolveNcaafMoneylineBridge(candidate, now, materialized.input.kickoffAt)
    : null;
  const signals: EligibilitySignals = candidate && first ? {
    identityResolved: true, inputAvailable: true, inputFresh: first.evidence.fresh,
    starterOrQbComplete: candidate.dataQuality !== "INSUFFICIENT",
    teamStateComplete: candidate.dataQuality !== "INSUFFICIENT",
    contextComplete: first.evidence.complete, pitSafe: first.evidence.pitSafe,
      leakageSafe: first.evidence.leakageSafe, marketFresh: bridge?.marketFresh ?? false,
    runtimeHealth: health.status === "HEALTHY" ? "CANDIDATE_HEALTHY" : "CANDIDATE_RUNTIME_FAILURE",
    publicationEligible: first.evidence.complete
      && Boolean(bridge?.publication.technicalReadiness.ready),
    incumbentEligible: true,
  } : unavailableSignals();
  const resolution = resolveNcaafProductionEngine({ mode: evaluationMode, identity, approval, signals });
  const finalResolution: typeof resolution = materialized ? resolution : {
    ...resolution, kind: "PASS", reason: "NO_ELIGIBLE_UPCOMING_NCAAF_SLATE",
    selectedEngine: null, fallbackUsed: false, fallbackFrom: null,
  };
  const verifiedMarketEvidence = bridge?.market && bridge.marketFresh
    && bridge.impliedProbability != null && bridge.edge != null
    ? Object.freeze({
      snapshotId: bridge.market.snapshotId,
      sportsbook: bridge.market.sportsbook,
      source: bridge.market.source,
      providerEventId: bridge.market.providerEventId,
      selection: bridge.market.selection,
      price: bridge.market.price,
      capturedAt: bridge.market.capturedAt,
      modelProbability: bridge.modelProbability,
      impliedProbability: bridge.impliedProbability,
      edge: bridge.edge,
    })
    : undefined;
  const evaluation = candidate
    ? evaluateCandidateWithoutPublishing(
      candidate as unknown as Record<string, unknown>,
      identity,
      finalResolution,
      verifiedMarketEvidence,
    )
    : null;
  const disposition = finalResolution.fallbackUsed ? "WOULD_FALLBACK" as const : "WOULD_PASS" as const;
  if (first && second && candidate && materialized) {
    await db.insert(candidateExecutionAuditsTable).values({
      executionId: randomUUID(), dryRun: true, sport: "NCAAF", gameId: candidate.gameId,
      market: "moneyline", modelFamily: identity.modelFamily, modelId: identity.modelId,
      modelVersion: identity.modelVersion, artifactId: identity.artifactId,
      artifactHash: identity.artifactHash, configurationHash: identity.configurationHash,
      parameterHash: identity.parameterHash, inputContractVersion: identity.inputContractVersion,
      inputSnapshotId: materialized.snapshotId, inputHash: first.evidence.inputHash,
      featureCutoff: new Date(first.evidence.featureCutoff),
      materializedAt: new Date(first.evidence.materializedAt), executedAt: new Date(first.executedAt),
      rawOutput: candidate, outputHash: first.outputHash, secondOutputHash: second.outputHash,
      reproducible: first.outputHash === second.outputHash, executorHealth: health.status,
      pitSafe: first.evidence.pitSafe, leakageSafe: first.evidence.leakageSafe,
      resolverReason: finalResolution.reason, publicationDisposition: disposition,
      evidence: {
        executionCount: 2, comparison: ncaafCandidateExecutor.reproducibility.comparison,
        modelPredictionBridge: bridge, evaluation, officialPersistence: false, boardOutputUsed: false,
      },
    });
  }
  const auditId = await persistAudit({
    sport: "NCAAF", gameId: candidate?.gameId ?? null, identity,
    mode: evaluationMode, resolution: finalResolution, disposition,
    snapshotId: materialized?.snapshotId ?? null,
    marketSnapshotId: bridge?.market?.snapshotId ?? null,
    evidence: {
      source: "ncaaf-authoritative-2026-feature-bridge",
      actualConfiguredMode: guardedServingConfig.ncaafMode, candidateFound: Boolean(candidate),
      freshExecutorCompleted: Boolean(first), reproducible: Boolean(first && second && first.outputHash === second.outputHash),
      inputHash: first?.evidence.inputHash ?? null, outputHash: first?.outputHash ?? null,
       modelPredictionBridgeCreated: Boolean(bridge), marketSnapshotId: bridge?.market?.snapshotId ?? null,
       marketFresh: bridge?.marketFresh ?? false, officialPersistence: false, boardOutputUsed: false,
       adapterStage: bridge?.risk.status ?? evaluation?.stages.adapter ?? "NOT_ATTEMPTED",
       universalStage: bridge?.pod.status ?? evaluation?.stages.universal ?? "NOT_ATTEMPTED",
    },
    now,
  });
  return {
    auditId, sport: "NCAAF", gameId: candidate?.gameId ?? null, disposition, resolution: finalResolution,
    executorHealth: health, execution: first ? {
      inputSnapshotId: first.evidence.snapshotId, inputHash: first.evidence.inputHash,
      outputHash: first.outputHash, secondOutputHash: second?.outputHash,
      reproducible: first.outputHash === second?.outputHash, bridge, evaluation,
    } : null,
  };
}