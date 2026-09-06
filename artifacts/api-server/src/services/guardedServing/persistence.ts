import { randomUUID } from "node:crypto";
import {
  db, marketsTable, modelPredictionsTable, modelVersionsTable, oddsSnapshotsTable,
  officialPredictionIdentityTable, officialPredictionLifecycleTable, sportsbooksTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { AdaptedPublication } from "./publicationAdapter";
import { getCurrentMlbCandidateIdentity, getCurrentNcaafCandidateIdentity } from "./candidateRegistry";
import { acquireExactApprovalDecisionLock, resolveExactApproval } from "./approvalRegistry";
import { guardedServingConfig } from "./config";
import type { ApprovalState, ExactArtifactIdentity } from "./types";

export type PredictionLifecycleState =
  | "GENERATED" | "ELIGIBLE" | "PUBLISHED" | "WITHDRAWN"
  | "INVALIDATED" | "REPLACED" | "GRADED";

export interface OfficialPredictionBinding {
  gameId: string;
  sport: string;
  market: string;
  selection: string;
  odds: number | null;
  sportsbookId: number | null;
  sportsbook: string | null;
  modelProbability: number;
  impliedProbability: number | null;
  edge: number;
  confidence: string;
  recommendation: string;
  units: number;
  podScore: number | null;
  finalRating: number | null;
  marketIntelligenceGrade: string | null;
  predictionTimestamp: Date;
  dataCutoffTimestamp: Date;
  cohort: string | null;
  isChallenger: boolean;
  modelId: string;
  candidateModelVersion: string | null;
  candidateArtifactId: string | null;
  candidateArtifactHash: string | null;
  candidateConfigurationHash: string | null;
  candidateParameterHash: string | null;
  candidateInputContractVersion: string | null;
}

export interface OfficialMarketBinding {
  id: number;
  gameId: string;
  market: string;
  selection: string;
  odds: number;
  sportsbookId: number | null;
  sportsbook: string | null;
  source: string;
  providerEventId: string | null;
  capturedAt: Date;
  isAvailable: boolean;
  isStale: boolean;
  marketStatus: string;
  group: ReadonlyArray<{ selection: string; odds: number; isAvailable: boolean; isStale: boolean; marketStatus: string }>;
}

function sameNumber(actual: number | null, expected: number | null): boolean {
  if (actual == null || expected == null) return actual === expected;
  return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= 1e-6;
}

function validAmericanOdds(price: number): boolean {
  return Number.isInteger(price) && price !== 0 && (price <= -100 || price >= 100);
}

/**
 * Pure, fail-closed gate for the dormant official writer. The caller's claimed
 * approval is not an input to the decision; only the server-resolved ledger
 * state and canonical candidate identity are authoritative.
 */
export function validateOfficialPersistenceContext(input: {
  publication: AdaptedPublication;
  canonical: ExactArtifactIdentity;
  configuredMode: string;
  approval: { state: ApprovalState; approved: boolean };
  prediction: OfficialPredictionBinding | null;
  market: OfficialMarketBinding | null;
  now: Date;
}): "guarded" | "full" {
  const { publication, canonical, configuredMode, approval, prediction, market, now } = input;
  const identity = publication.identity;
  const guardedMode = canonical.sport === "MLB" ? "v4_guarded" : "nextgen_guarded";
  const fullMode = canonical.sport === "MLB" ? "v4" : "nextgen";
  const required = configuredMode === guardedMode ? "guarded"
    : configuredMode === fullMode ? "full" : null;
  if (!required || identity.servingMode !== configuredMode
    || publication.sport !== canonical.sport || publication.market !== canonical.market
    || identity.engine !== canonical.modelId || identity.modelFamily !== canonical.modelFamily
    || identity.modelVersion !== canonical.modelVersion || identity.artifactId !== canonical.artifactId
    || identity.artifactHash !== canonical.artifactHash || identity.inputVersion !== canonical.inputContractVersion
    || identity.configurationHash !== canonical.configurationHash
    || identity.parameterHash !== canonical.parameterHash
    || identity.fallbackUsed || identity.fallbackFrom != null || identity.fallbackReason != null
    || !identity.snapshotId?.trim() || !identity.marketSnapshotId?.trim()) {
    throw new Error("Official prediction persistence identity or configured mode mismatch");
  }
  const acceptedStates = required === "guarded"
    ? ["GUARDED_APPROVED", "FULL_APPROVED", "PRODUCTION_APPROVED"]
    : ["FULL_APPROVED", "PRODUCTION_APPROVED"];
  if (!approval.approved || !acceptedStates.includes(approval.state)) {
    throw new Error("Official prediction persistence requires exact production approval");
  }
  const requiredUniversal = [
    publication.universal.marketIntelligence,
    publication.universal.finalRating,
    publication.universal.podScore,
    publication.universal.sportsbookComparison,
    publication.universal.sharpBookAnalysis,
    publication.universal.lineShopping,
    publication.universal.marketIntelligenceGrade,
    publication.universal.finalModelTier,
    publication.universal.finalRecommendation,
  ];
  if (requiredUniversal.some(stage => stage.status !== "AVAILABLE" || stage.value == null)
    || publication.universal.finalRecommendation.value !== publication.recommendation
    || publication.line !== null || publication.odds == null || publication.sportsbook == null
    || publication.impliedProbability == null) {
    throw new Error("Official prediction persistence requires the complete production rating pipeline");
  }
  const predictionAt = new Date(identity.predictionTimestamp);
  if (!prediction || !Number.isFinite(predictionAt.getTime())
    || prediction.gameId !== publication.gameId || prediction.sport !== publication.sport
    || prediction.market !== publication.market || prediction.selection !== publication.selection
    || prediction.odds !== publication.odds || prediction.sportsbook !== publication.sportsbook
    || !sameNumber(prediction.modelProbability, publication.modelProbability)
    || !sameNumber(prediction.impliedProbability, publication.impliedProbability)
    || !sameNumber(prediction.edge, publication.edge) || prediction.confidence !== publication.confidence
    || prediction.recommendation !== publication.recommendation || !sameNumber(prediction.units, publication.units)
    || !sameNumber(prediction.finalRating, publication.universal.finalRating.value)
    || !sameNumber(prediction.podScore, publication.universal.podScore.value)
    || prediction.marketIntelligenceGrade !== publication.universal.marketIntelligenceGrade.value
    || prediction.predictionTimestamp.getTime() !== predictionAt.getTime()
    || prediction.dataCutoffTimestamp > prediction.predictionTimestamp
    || prediction.modelId !== canonical.modelId || prediction.cohort !== "official" || prediction.isChallenger
    || prediction.candidateModelVersion !== canonical.modelVersion
    || prediction.candidateArtifactId !== canonical.artifactId
    || prediction.candidateArtifactHash !== canonical.artifactHash
    || prediction.candidateConfigurationHash !== (canonical.configurationHash ?? null)
    || prediction.candidateParameterHash !== (canonical.parameterHash ?? null)
    || prediction.candidateInputContractVersion !== canonical.inputContractVersion) {
    throw new Error("Official prediction persistence model prediction binding mismatch");
  }
  if (!market || String(market.id) !== identity.marketSnapshotId
    || market.gameId !== publication.gameId || market.market !== publication.market
    || market.selection !== publication.selection || market.odds !== publication.odds
    || market.sportsbookId !== prediction.sportsbookId || market.sportsbook !== publication.sportsbook
    || market.source !== "odds-api" || !market.providerEventId?.trim()
    || !market.isAvailable || market.isStale || market.marketStatus !== "open"
    || market.capturedAt > prediction.predictionTimestamp || market.capturedAt > now
    || prediction.predictionTimestamp.getTime() - market.capturedAt.getTime() > 30 * 60_000
    || now.getTime() - market.capturedAt.getTime() > 30 * 60_000
    || market.group.length !== 2
    || market.group.filter(row => row.selection === "home" && validAmericanOdds(row.odds)
      && row.isAvailable && !row.isStale && row.marketStatus === "open").length !== 1
    || market.group.filter(row => row.selection === "away" && validAmericanOdds(row.odds)
      && row.isAvailable && !row.isStale && row.marketStatus === "open").length !== 1) {
    throw new Error("Official prediction persistence market snapshot binding mismatch");
  }
  return required;
}

/**
 * Dormant future official persistence entry point. It independently verifies
 * server-side identity and approval; caller-provided approval is never trusted.
 */
export async function persistOfficialPredictionIdentity(
  predictionId: number,
  publication: AdaptedPublication,
  publicationStatus: "ELIGIBLE" | "PUBLISHED",
): Promise<number> {
  const canonical = publication.sport === "NCAAF"
    ? getCurrentNcaafCandidateIdentity()
    : publication.sport === "MLB" ? await getCurrentMlbCandidateIdentity() : null;
  if (!canonical) throw new Error("Official prediction persistence requires canonical candidate identity");
  const configuredMode = publication.sport === "NCAAF"
    ? guardedServingConfig.ncaafMode : guardedServingConfig.mlbMode;
  const required = configuredMode === "v4_guarded" || configuredMode === "nextgen_guarded"
    ? "guarded" : configuredMode === "v4" || configuredMode === "nextgen" ? "full" : null;
  if (!required) throw new Error("Official prediction persistence is disabled in incumbent serving mode");
  return db.transaction(async tx => {
    await acquireExactApprovalDecisionLock(tx, canonical);
    const approval = await resolveExactApproval(canonical, required, tx);
    const [prediction] = await tx.select({
      id: modelPredictionsTable.id, gameId: modelPredictionsTable.gameId, sport: modelPredictionsTable.sport,
      market: modelPredictionsTable.market, selection: modelPredictionsTable.selection,
      odds: modelPredictionsTable.odds, sportsbookId: modelPredictionsTable.sportsbookId,
      sportsbook: sportsbooksTable.name, modelProbability: modelPredictionsTable.modelProbability,
      impliedProbability: modelPredictionsTable.impliedProbability, edge: modelPredictionsTable.edge,
      confidence: modelPredictionsTable.confidence, recommendation: modelPredictionsTable.recommendation,
      units: modelPredictionsTable.units, podScore: modelPredictionsTable.podScore,
      finalRating: modelPredictionsTable.finalRating,
      marketIntelligenceGrade: modelPredictionsTable.marketIntelligenceGrade,
      predictionTimestamp: modelPredictionsTable.predictionTimestamp,
      dataCutoffTimestamp: modelPredictionsTable.dataCutoffTimestamp,
      cohort: modelPredictionsTable.cohort, isChallenger: modelPredictionsTable.isChallenger,
      modelId: modelVersionsTable.modelId,
      candidateModelVersion: modelVersionsTable.candidateModelVersion,
      candidateArtifactId: modelVersionsTable.candidateArtifactId,
      candidateArtifactHash: modelVersionsTable.candidateArtifactHash,
      candidateConfigurationHash: modelVersionsTable.candidateConfigurationHash,
      candidateParameterHash: modelVersionsTable.candidateParameterHash,
      candidateInputContractVersion: modelVersionsTable.candidateInputContractVersion,
    }).from(modelPredictionsTable).innerJoin(modelVersionsTable, eq(modelPredictionsTable.modelVersionId, modelVersionsTable.id))
      .leftJoin(sportsbooksTable, eq(modelPredictionsTable.sportsbookId, sportsbooksTable.id))
      .where(eq(modelPredictionsTable.id, predictionId)).limit(1);
    const marketSnapshotId = Number(publication.identity.marketSnapshotId);
    const [marketRow] = Number.isInteger(marketSnapshotId) && marketSnapshotId > 0
      ? await tx.select({
        id: oddsSnapshotsTable.id, gameId: oddsSnapshotsTable.gameId, market: marketsTable.slug,
        selection: oddsSnapshotsTable.selection, odds: oddsSnapshotsTable.price,
        sportsbookId: oddsSnapshotsTable.sportsbookId, sportsbook: sportsbooksTable.name,
        source: oddsSnapshotsTable.source, providerEventId: oddsSnapshotsTable.providerEventId,
        capturedAt: oddsSnapshotsTable.capturedAt, marketId: oddsSnapshotsTable.marketId,
        isAvailable: oddsSnapshotsTable.isAvailable, isStale: oddsSnapshotsTable.isStale,
        marketStatus: oddsSnapshotsTable.marketStatus,
      }).from(oddsSnapshotsTable)
        .innerJoin(marketsTable, eq(oddsSnapshotsTable.marketId, marketsTable.id))
        .leftJoin(sportsbooksTable, eq(oddsSnapshotsTable.sportsbookId, sportsbooksTable.id))
        .where(eq(oddsSnapshotsTable.id, marketSnapshotId)).limit(1)
      : [undefined];
    const marketGroup = marketRow?.sportsbookId != null && marketRow.providerEventId
      ? await tx.select({
        selection: oddsSnapshotsTable.selection, odds: oddsSnapshotsTable.price,
        isAvailable: oddsSnapshotsTable.isAvailable, isStale: oddsSnapshotsTable.isStale,
        marketStatus: oddsSnapshotsTable.marketStatus,
      }).from(oddsSnapshotsTable).where(and(
        eq(oddsSnapshotsTable.gameId, marketRow.gameId),
        eq(oddsSnapshotsTable.sportsbookId, marketRow.sportsbookId),
        eq(oddsSnapshotsTable.marketId, marketRow.marketId),
        eq(oddsSnapshotsTable.source, marketRow.source),
        eq(oddsSnapshotsTable.providerEventId, marketRow.providerEventId),
        eq(oddsSnapshotsTable.capturedAt, marketRow.capturedAt),
      ))
      : [];
    const market = marketRow ? { ...marketRow, group: marketGroup } : null;
    validateOfficialPersistenceContext({
      publication, canonical, configuredMode, approval,
      prediction: prediction ?? null, market: market ?? null, now: new Date(),
    });
    const [row] = await tx.insert(officialPredictionIdentityTable).values({
    predictionId,
    sport: publication.sport,
    gameId: publication.gameId,
    market: publication.market,
    selection: publication.selection,
    line: publication.line,
    odds: publication.odds,
    sportsbook: publication.sportsbook,
    engine: publication.identity.engine,
    modelFamily: publication.identity.modelFamily,
    modelVersion: publication.identity.modelVersion,
    artifactId: publication.identity.artifactId,
    artifactHash: publication.identity.artifactHash ?? null,
    inputVersion: publication.identity.inputVersion,
    inputSnapshotId: publication.identity.snapshotId ?? null,
    configurationHash: publication.identity.configurationHash ?? null,
    marketSnapshotId: publication.identity.marketSnapshotId ?? null,
    servingMode: publication.identity.servingMode,
    approvalStatusAtPrediction: approval.state,
    modelProbability: publication.modelProbability,
    impliedProbability: publication.impliedProbability,
    edge: publication.edge,
    confidence: publication.confidence,
    recommendation: publication.recommendation,
    units: publication.units,
    fallbackUsed: publication.identity.fallbackUsed,
    fallbackReason: publication.identity.fallbackReason,
    publicationStatus,
    predictionTimestamp: new Date(publication.identity.predictionTimestamp),
    }).returning({ id: officialPredictionIdentityTable.id });
    if (!row) throw new Error("Official prediction identity was not inserted");
    const eventId = randomUUID();
    await tx.insert(officialPredictionLifecycleTable).values({
      eventId, officialIdentityId: row.id, state: publicationStatus,
      actor: "guarded-serving-runtime", reason: null, occurredAt: new Date(),
    });
    return row.id;
  });
}