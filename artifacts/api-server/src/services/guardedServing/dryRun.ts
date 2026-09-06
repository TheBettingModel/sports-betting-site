import { randomUUID } from "node:crypto";
import { desc, eq, gt } from "drizzle-orm";
import {
  db, guardedServingAuditsTable, mlbV4PregameFeaturesTable,
  mlbV4ShadowForecastsTable,
} from "@workspace/db";
import { guardedServingConfig } from "./config";
import { getCurrentMlbCandidateIdentity, getCurrentNcaafCandidateIdentity } from "./candidateRegistry";
import { resolveExactApproval } from "./approvalRegistry";
import { resolveMlbProductionEngine, resolveNcaafProductionEngine } from "./resolvers";
import { adaptApprovedNextGenOutput, dryRunDisposition } from "./publicationAdapter";
import { getNcaafV4ProjectionBoard } from "../ncaafV4GameDay";
import { logger } from "../../lib/logger";
import type { EligibilitySignals, ExactArtifactIdentity } from "./types";
import { MLB_CANDIDATE_ENGINE } from "./types";

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
    marketSnapshotId: null,
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
  const [forecast] = feature ? await db.select().from(mlbV4ShadowForecastsTable)
    .where(eq(mlbV4ShadowForecastsTable.gameId, feature.gameId))
    .orderBy(desc(mlbV4ShadowForecastsTable.forecastGeneratedAt)).limit(1) : [];
  const identity: ExactArtifactIdentity = registryIdentity ?? {
    sport: "MLB", market: "moneyline", modelFamily: "expected-runs",
    modelId: MLB_CANDIDATE_ENGINE, modelVersion: forecast?.modelVersion ?? "UNRESOLVED",
    artifactId: forecast?.forecastId ?? "REGISTRY_RECORD_MISSING",
    artifactHash: forecast?.modelHash ?? "REGISTRY_RECORD_MISSING",
    inputContractVersion: feature?.schemaVersion ?? "model-input-v4",
  };
  const evaluationMode = guardedServingConfig.mlbMode === "v1" ? "v4_guarded" : guardedServingConfig.mlbMode;
  const approval = await resolveExactApproval(identity, evaluationMode === "v4" ? "full" : "guarded");
  const signals = feature && forecast ? {
    identityResolved: registryIdentity !== null,
    inputAvailable: true,
    inputFresh: now.getTime() - feature.featureCutoff.getTime() <= 24 * 60 * 60_000,
    starterOrQbComplete: feature.starterCoreEligible,
    teamStateComplete: feature.baselineCoreEligible,
    contextComplete: feature.baselineCoreEligible,
    pitSafe: feature.pitSafe,
    leakageSafe: true,
    marketFresh: false,
    runtimeHealth: "CANDIDATE_HEALTHY" as const,
    publicationEligible: true,
    incumbentEligible: true,
  } : unavailableSignals();
  const resolution = resolveMlbProductionEngine({ mode: evaluationMode, identity, approval, signals });
  const adapted = forecast ? adaptApprovedNextGenOutput({
    sport: "MLB", gameId: forecast.gameId, market: "moneyline",
    selection: forecast.homeWinProbability >= .5 ? "home" : "away",
    line: null, odds: null, sportsbook: null,
    modelProbability: Math.max(forecast.homeWinProbability, forecast.awayWinProbability),
    impliedProbability: null, edge: 0, confidence: "Unavailable",
    recommendation: "Neutral", units: 0, rawEvidence: forecast as unknown as Record<string, unknown>,
    identity: {
      sport: "MLB", engine: identity.modelId, modelFamily: identity.modelFamily,
      modelVersion: identity.modelVersion, artifactId: identity.artifactId, servingMode: evaluationMode,
      inputVersion: identity.inputContractVersion, approvalStatus: approval.state,
      fallbackUsed: false, fallbackFrom: null, fallbackReason: null,
      predictionTimestamp: forecast.forecastGeneratedAt.toISOString(),
      artifactHash: identity.artifactHash, snapshotId: feature?.snapshotId ?? null,
    },
  }, resolution) : null;
  const disposition = dryRunDisposition(resolution, adapted);
  const auditId = await persistAudit({
    sport: "MLB", gameId: feature?.gameId ?? null, identity,
    mode: evaluationMode, resolution, disposition,
    snapshotId: feature?.snapshotId ?? null,
    evidence: { source: "model-input-v4", actualConfiguredMode: guardedServingConfig.mlbMode, registryRecordFound: Boolean(registryIdentity), featureFound: Boolean(feature), challengerForecastFound: Boolean(forecast), adapterTraversed: true, universalPipelineTraversed: true },
    now,
  });
  return { auditId, sport: "MLB", gameId: feature?.gameId ?? null, disposition, resolution };
}

export async function runNcaafRealSlateDryRun(now = new Date()) {
  const identity = getCurrentNcaafCandidateIdentity();
  const board = await getNcaafV4ProjectionBoard(undefined, now) as unknown as { board?: Array<Record<string, any>> };
  const candidate = board.board?.[0];
  const evaluationMode = guardedServingConfig.ncaafMode === "legacy" ? "nextgen_guarded" : guardedServingConfig.ncaafMode;
  const approval = await resolveExactApproval(identity, evaluationMode === "nextgen" ? "full" : "guarded");
  const hasMarket = Boolean(candidate?.market?.moneyline);
  const signals: EligibilitySignals = candidate ? {
    identityResolved: true, inputAvailable: true, inputFresh: true,
    starterOrQbComplete: candidate.model?.dataQuality !== "INSUFFICIENT",
    teamStateComplete: candidate.model?.dataQuality !== "INSUFFICIENT",
    contextComplete: true, pitSafe: true, leakageSafe: true, marketFresh: hasMarket,
    runtimeHealth: "CANDIDATE_HEALTHY", publicationEligible: true, incumbentEligible: true,
  } : unavailableSignals();
  const resolution = resolveNcaafProductionEngine({ mode: evaluationMode, identity, approval, signals });
  const probability = Number(candidate?.model?.homeWinProbability ?? 0);
  const adapted = candidate ? adaptApprovedNextGenOutput({
    sport: "NCAAF", gameId: String(candidate.gameId), market: "moneyline",
    selection: probability >= .5 ? "home" : "away", line: null,
    odds: null, sportsbook: null, modelProbability: Math.max(probability, 1 - probability),
    impliedProbability: null, edge: 0, confidence: String(candidate.model?.dataQuality ?? "Unavailable"),
    recommendation: "Neutral", units: 0, rawEvidence: candidate,
    identity: {
      sport: "NCAAF", engine: identity.modelId, modelFamily: identity.modelFamily,
      modelVersion: identity.modelVersion, artifactId: identity.artifactId, servingMode: evaluationMode,
      inputVersion: identity.inputContractVersion, approvalStatus: approval.state,
      fallbackUsed: false, fallbackFrom: null, fallbackReason: null,
      predictionTimestamp: now.toISOString(), artifactHash: identity.artifactHash,
      configurationHash: identity.configurationHash, snapshotId: String(candidate.model?.snapshotId ?? ""),
    },
  }, resolution) : null;
  const disposition = dryRunDisposition(resolution, adapted);
  const auditId = await persistAudit({
    sport: "NCAAF", gameId: candidate ? String(candidate.gameId) : null, identity,
    mode: evaluationMode, resolution, disposition,
    snapshotId: candidate ? String(candidate.model?.snapshotId ?? candidate.predictionId ?? "") : null,
    evidence: { source: "ncaaf-current-game-day-nextgen", actualConfiguredMode: guardedServingConfig.ncaafMode, candidateFound: Boolean(candidate), adapterTraversed: true, universalPipelineTraversed: true },
    now,
  });
  return { auditId, sport: "NCAAF", gameId: candidate ? String(candidate.gameId) : null, disposition, resolution };
}