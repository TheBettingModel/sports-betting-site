import { createHash } from "node:crypto";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import {
  db,
  marketApprovalDecisionsTable,
  modelPredictionsTable,
  modelVersionsTable,
  type InsertMarketApprovalDecision,
  type ModelVersion,
} from "@workspace/db";

export const MARKET_APPROVAL_STATUSES = [
  "UNVALIDATED",
  "SHADOW",
  "PROVISIONAL",
  "PRODUCTION_APPROVED",
  "SUSPENDED",
] as const;

export type MarketApprovalStatus = typeof MARKET_APPROVAL_STATUSES[number];
export type ApprovalLayerStatus = "PASSED" | "FAILED" | "INSUFFICIENT";

export interface ApprovalLayerResult {
  status: ApprovalLayerStatus;
  reasons: string[];
  metrics: Record<string, number | string | boolean | null>;
}

export interface MarketApprovalIdentity {
  sport: string;
  market: string;
  modelVersion: string;
  evaluationVersion: string;
  datasetVersion: string;
  featureSchemaVersion: string;
  evidenceCutoff: Date;
}

export interface PublicationPermission {
  approved: boolean;
  status: MarketApprovalStatus;
  reasons: string[];
  decisionId: number | null;
}

export interface MoneylinePublicationPermission extends PublicationPermission {
  modelVersion: string | null;
}

export interface ApprovalEvaluationInput {
  hasEvaluationEvidence: boolean;
  dataIntegrity: ApprovalLayerResult;
  predictiveQuality: ApprovalLayerResult;
  bettingQuality: ApprovalLayerResult;
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

export function marketApprovalDecisionHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function deriveApprovalStatus(input: ApprovalEvaluationInput): MarketApprovalStatus {
  if (!input.hasEvaluationEvidence) return "UNVALIDATED";
  if (input.dataIntegrity.status !== "PASSED") return "SHADOW";
  if (input.predictiveQuality.status !== "PASSED") return "SHADOW";
  if (input.bettingQuality.status !== "PASSED") return "PROVISIONAL";
  return "PRODUCTION_APPROVED";
}

export function evaluateBettingQuality(input: {
  clv: number | null;
  roi: number | null;
  maxDrawdown: number | null;
  stability: number | null;
  minimumClv: number;
  maximumDrawdown: number;
  minimumStability: number;
}): ApprovalLayerResult {
  const missing = Object.entries({
    clv: input.clv,
    roi: input.roi,
    maxDrawdown: input.maxDrawdown,
    stability: input.stability,
  }).filter(([, value]) => value == null).map(([name]) => `missing_${name}`);
  if (missing.length) return { status: "INSUFFICIENT", reasons: missing, metrics: { ...input } };

  const reasons: string[] = [];
  if (input.clv! < input.minimumClv) reasons.push("clv_below_minimum");
  if (input.maxDrawdown! > input.maximumDrawdown) reasons.push("drawdown_above_maximum");
  if (input.stability! < input.minimumStability) reasons.push("market_stability_below_minimum");

  // ROI is intentionally retained as evidence but is not a standalone veto.
  // Positive CLV, controlled drawdown, and stable segmented performance can
  // support provisional/production trust through short-term ROI noise.
  return {
    status: reasons.length ? "FAILED" : "PASSED",
    reasons,
    metrics: { ...input },
  };
}

export function moneylineApprovalIdentity(
  model: Pick<ModelVersion, "modelId" | "sport" | "market" | "trainingDatasetId" | "featureVersions">,
  evidenceCutoff: Date,
): MarketApprovalIdentity {
  return {
    sport: model.sport,
    market: model.market,
    modelVersion: model.modelId,
    evaluationVersion: "model-registry-evaluation-v1",
    datasetVersion: model.trainingDatasetId == null
      ? "training-dataset:unassigned"
      : `training-dataset:${model.trainingDatasetId}`,
    featureSchemaVersion: marketApprovalDecisionHash(model.featureVersions ?? {}),
    evidenceCutoff,
  };
}

export async function appendMarketApprovalDecision(
  input: Omit<InsertMarketApprovalDecision, "decisionHash">,
) {
  const decisionHash = marketApprovalDecisionHash(input);
  const [inserted] = await db
    .insert(marketApprovalDecisionsTable)
    .values({ ...input, decisionHash })
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;
  const [existing] = await db
    .select()
    .from(marketApprovalDecisionsTable)
    .where(eq(marketApprovalDecisionsTable.decisionHash, decisionHash))
    .limit(1);
  return existing ?? null;
}

export async function getPublicationPermission(
  identity: MarketApprovalIdentity,
): Promise<PublicationPermission> {
  try {
    const [decision] = await db
      .select()
      .from(marketApprovalDecisionsTable)
      .where(and(
        eq(marketApprovalDecisionsTable.sport, identity.sport),
        eq(marketApprovalDecisionsTable.market, identity.market),
        eq(marketApprovalDecisionsTable.modelVersion, identity.modelVersion),
        eq(marketApprovalDecisionsTable.evaluationVersion, identity.evaluationVersion),
        eq(marketApprovalDecisionsTable.datasetVersion, identity.datasetVersion),
        eq(marketApprovalDecisionsTable.featureSchemaVersion, identity.featureSchemaVersion),
        lte(marketApprovalDecisionsTable.evidenceCutoff, identity.evidenceCutoff),
      ))
      .orderBy(
        desc(marketApprovalDecisionsTable.evidenceCutoff),
        desc(marketApprovalDecisionsTable.createdAt),
      )
      .limit(1);

    if (!decision) {
      return {
        approved: false,
        status: "UNVALIDATED",
        reasons: ["exact_approval_record_missing"],
        decisionId: null,
      };
    }
    const status = MARKET_APPROVAL_STATUSES.includes(decision.status as MarketApprovalStatus)
      ? decision.status as MarketApprovalStatus
      : "UNVALIDATED";
    return {
      approved: status === "PRODUCTION_APPROVED",
      status,
      reasons: status === "PRODUCTION_APPROVED" ? [] : [`approval_status_${status.toLowerCase()}`],
      decisionId: decision.id,
    };
  } catch {
    return {
      approved: false,
      status: "UNVALIDATED",
      reasons: ["approval_lookup_failed"],
      decisionId: null,
    };
  }
}

export async function getMoneylinePublicationPermission(
  modelVersionId: number,
  evidenceCutoff: Date,
): Promise<PublicationPermission> {
  const [model] = await db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.id, modelVersionId))
    .limit(1);
  if (!model) {
    return {
      approved: false,
      status: "UNVALIDATED",
      reasons: ["model_version_not_found"],
      decisionId: null,
    };
  }
  return getPublicationPermission(moneylineApprovalIdentity(model, evidenceCutoff));
}

export async function getMoneylinePublicationPermissionsForGames(
  gameIds: readonly string[],
): Promise<Map<string, MoneylinePublicationPermission>> {
  if (gameIds.length === 0) return new Map();
  const rows = await db
    .select({
      gameId: modelPredictionsTable.gameId,
      dataCutoffTimestamp: modelPredictionsTable.dataCutoffTimestamp,
      predictionTimestamp: modelPredictionsTable.predictionTimestamp,
      model: modelVersionsTable,
    })
    .from(modelPredictionsTable)
    .innerJoin(modelVersionsTable, eq(modelPredictionsTable.modelVersionId, modelVersionsTable.id))
    .where(and(
      inArray(modelPredictionsTable.gameId, [...gameIds]),
      eq(modelPredictionsTable.market, "moneyline"),
    ))
    .orderBy(desc(modelPredictionsTable.predictionTimestamp));

  const latest = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    if (!latest.has(row.gameId)) latest.set(row.gameId, row);
  }
  const result = new Map<string, MoneylinePublicationPermission>();
  await Promise.all([...latest.entries()].map(async ([gameId, row]) => {
    const permission = await getPublicationPermission(
      moneylineApprovalIdentity(row.model, row.dataCutoffTimestamp),
    );
    result.set(gameId, { ...permission, modelVersion: row.model.modelId });
  }));
  return result;
}

export async function listLatestMarketApprovalDecisions() {
  const rows = await db
    .select()
    .from(marketApprovalDecisionsTable)
    .orderBy(desc(marketApprovalDecisionsTable.createdAt));
  const latest = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    const key = [
      row.sport,
      row.market,
      row.modelVersion,
      row.evaluationVersion,
      row.datasetVersion,
      row.featureSchemaVersion,
    ].join("|");
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()];
}