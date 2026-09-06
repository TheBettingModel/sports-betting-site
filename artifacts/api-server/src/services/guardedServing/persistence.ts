import { randomUUID } from "node:crypto";
import {
  db, officialPredictionIdentityTable, officialPredictionLifecycleTable,
} from "@workspace/db";
import type { AdaptedPublication } from "./publicationAdapter";

export type PredictionLifecycleState =
  | "GENERATED" | "ELIGIBLE" | "PUBLISHED" | "WITHDRAWN"
  | "INVALIDATED" | "REPLACED" | "GRADED";

/**
 * Future official persistence entry point. Callers cannot persist shadow or
 * dry-run values; exact approval was already enforced by the adapter.
 */
export async function persistOfficialPredictionIdentity(
  predictionId: number,
  publication: AdaptedPublication,
  publicationStatus: "ELIGIBLE" | "PUBLISHED",
): Promise<number> {
  if (!["GUARDED_APPROVED", "FULL_APPROVED", "PRODUCTION_APPROVED"].includes(publication.identity.approvalStatus)) {
    throw new Error("Official prediction persistence requires exact production approval");
  }
  const [row] = await db.insert(officialPredictionIdentityTable).values({
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
    approvalStatusAtPrediction: publication.identity.approvalStatus,
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
  await appendPredictionLifecycle(row.id, publicationStatus, "guarded-serving-runtime", null);
  return row.id;
}

export async function appendPredictionLifecycle(
  officialIdentityId: number,
  state: PredictionLifecycleState,
  actor: string,
  reason: string | null,
  evidenceReference: string | null = null,
): Promise<string> {
  const eventId = randomUUID();
  await db.insert(officialPredictionLifecycleTable).values({
    eventId, officialIdentityId, state, actor, reason, evidenceReference, occurredAt: new Date(),
  });
  return eventId;
}