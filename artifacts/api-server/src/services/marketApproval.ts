import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import {
  db,
  marketApprovalDecisionsTable,
  modelPredictionsTable,
  modelVersionsTable,
  performanceMetricsTable,
  type InsertMarketApprovalDecision,
  type ModelVersion,
} from "@workspace/db";
import { logger } from "../lib/logger";

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

export interface AutomaticApprovalEvaluationInput extends ApprovalEvaluationInput {
  identity: MarketApprovalIdentity;
  sampleSize: number;
  dataCoverage?: number | null;
  evaluationSeasons?: unknown[];
  trainingWindow?: unknown;
  validationWindow?: unknown;
  outOfSampleWindow?: unknown;
  evaluationMetadata?: Record<string, unknown>;
  /**
   * Hard safety failures are distinct from ordinary quality failures. They
   * suspend an already trusted market, while an unvalidated market remains
   * shadow until it has valid evidence.
   */
  hardSafetyGate?: ApprovalLayerResult;
  evidenceValid?: boolean;
  evidenceStale?: boolean;
  maxEvidenceAgeMs?: number;
}

export interface AutomaticApprovalTransition {
  status: MarketApprovalStatus;
  recovered: boolean;
  reasons: string[];
  transition: "evaluation" | "graduation" | "suspension" | "reinstatement";
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

export function deriveAutomaticApprovalTransition(input: {
  evaluation: ApprovalEvaluationInput;
  previousStatus?: MarketApprovalStatus | null;
  hardSafetyGate?: ApprovalLayerResult;
  evidenceValid: boolean;
  evidenceStale: boolean;
}): AutomaticApprovalTransition {
  const derivedStatus = deriveApprovalStatus(input.evaluation);
  const hardSafetyFailed = input.hardSafetyGate?.status === "FAILED"
    || input.hardSafetyGate?.status === "INSUFFICIENT";
  const shouldSuspend = input.evidenceStale || !input.evidenceValid || hardSafetyFailed;
  const canSuspend = input.previousStatus === "PRODUCTION_APPROVED"
    || input.previousStatus === "PROVISIONAL"
    || input.previousStatus === "SUSPENDED";
  const status: MarketApprovalStatus = shouldSuspend && canSuspend
    ? "SUSPENDED"
    : derivedStatus;
  const recovered = input.previousStatus === "SUSPENDED"
    && status === "PRODUCTION_APPROVED";
  return {
    status,
    recovered,
    reasons: [
      ...input.evaluation.dataIntegrity.reasons,
      ...input.evaluation.predictiveQuality.reasons,
      ...input.evaluation.bettingQuality.reasons,
      ...(input.hardSafetyGate?.reasons ?? []),
      ...(input.evidenceStale ? ["evidence_stale"] : []),
      ...(!input.evidenceValid ? ["evidence_invalid"] : []),
    ],
    transition: recovered
      ? "reinstatement"
      : status === "SUSPENDED"
        ? "suspension"
        : status === "PRODUCTION_APPROVED"
          ? "graduation"
          : "evaluation",
  };
}

async function latestApprovalForModel(identity: MarketApprovalIdentity) {
  return (await db
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
    .orderBy(desc(marketApprovalDecisionsTable.evidenceCutoff), desc(marketApprovalDecisionsTable.createdAt))
    .limit(1))[0] ?? null;
}

/**
 * Evaluate and append one exact automatic lifecycle decision.
 *
 * The identity is always copied into the ledger unchanged. A repeated refresh
 * is idempotent through decisionHash, while a new evidence context creates a
 * new append-only row. No model registry row or prior approval is rewritten.
 */
export async function evaluateAndRecordAutomaticApproval(
  input: AutomaticApprovalEvaluationInput,
) {
  const previous = await latestApprovalForModel(input.identity);
  const evidenceCutoffMs = input.identity.evidenceCutoff.getTime();
  const evidenceStale = input.evidenceStale ?? (
    !Number.isFinite(evidenceCutoffMs)
    || Date.now() - evidenceCutoffMs > (input.maxEvidenceAgeMs ?? 30 * 24 * 60 * 60 * 1000)
  );
  const evidenceValid = input.evidenceValid ?? true;
  const transition = deriveAutomaticApprovalTransition({
    evaluation: input,
    previousStatus: previous?.status as MarketApprovalStatus | null | undefined,
    hardSafetyGate: input.hardSafetyGate,
    evidenceValid,
    evidenceStale,
  });
  if (
    previous?.status === "SUSPENDED"
    && (previous.evaluationMetadata as Record<string, unknown> | null)?.automatic !== true
  ) {
    return {
      decision: previous,
      status: "SUSPENDED" as const,
      previousStatus: previous.previousStatus,
      recovered: false,
    };
  }
  const { status, recovered, reasons } = transition;
  const transitionReason = recovered
    ? "Automatic reinstatement: the latest exact evidence passed every configured gate"
    : status === "SUSPENDED"
      ? `Automatic suspension: ${reasons.join(", ") || "hard safety gate failed"}`
      : status === "PRODUCTION_APPROVED"
        ? "Automatic graduation: data integrity, predictive quality, and betting quality passed"
        : reasons.length
          ? `Automatic evaluation: ${reasons.join(", ")}`
          : `Automatic evaluation produced ${status}`;

  if (
    previous
    && previous.status === status
    && marketApprovalDecisionHash({
      dataIntegrity: previous.dataIntegrity,
      predictiveQuality: previous.predictiveQuality,
      bettingQuality: previous.bettingQuality,
      sampleSize: previous.sampleSize,
      dataCoverage: previous.dataCoverage,
    }) === marketApprovalDecisionHash({
      dataIntegrity: input.dataIntegrity,
      predictiveQuality: input.predictiveQuality,
      bettingQuality: input.bettingQuality,
      sampleSize: input.sampleSize,
      dataCoverage: input.dataCoverage ?? null,
    })
  ) {
    return {
      decision: previous,
      status,
      previousStatus: previous.previousStatus,
      recovered: false,
    };
  }

  const decision = await appendMarketApprovalDecision({
    ...input.identity,
    trainingWindow: input.trainingWindow ?? null,
    validationWindow: input.validationWindow ?? null,
    outOfSampleWindow: input.outOfSampleWindow ?? null,
    evaluationSeasons: input.evaluationSeasons ?? [],
    sampleSize: input.sampleSize,
    dataCoverage: input.dataCoverage ?? null,
    dataIntegrity: input.dataIntegrity,
    predictiveQuality: input.predictiveQuality,
    bettingQuality: input.bettingQuality,
    status,
    reason: transitionReason,
    previousStatus: previous?.status ?? null,
    evaluationMetadata: {
      ...(input.evaluationMetadata ?? {}),
      automatic: true,
      transition: transition.transition,
      evidenceValid,
      evidenceStale,
      hardSafetyGate: input.hardSafetyGate ?? null,
    },
  });

  logger.info({
    decisionId: decision?.id ?? null,
    sport: input.identity.sport,
    market: input.identity.market,
    modelVersion: input.identity.modelVersion,
    evaluationVersion: input.identity.evaluationVersion,
    datasetVersion: input.identity.datasetVersion,
    featureSchemaVersion: input.identity.featureSchemaVersion,
    evidenceCutoff: input.identity.evidenceCutoff,
    previousStatus: previous?.status ?? null,
    status,
    transition: transition.transition,
    reasons,
  }, "Automatic market approval lifecycle evaluated");

  return { decision, status, previousStatus: previous?.status ?? null, recovered };
}

export async function recordManualMarketApproval(input: {
  identity: MarketApprovalIdentity;
  dataIntegrity: ApprovalLayerResult;
  predictiveQuality: ApprovalLayerResult;
  bettingQuality: ApprovalLayerResult;
  sampleSize: number;
  dataCoverage?: number | null;
  status: MarketApprovalStatus;
  reason: string;
  evaluationMetadata?: Record<string, unknown>;
}) {
  const previous = await latestApprovalForModel(input.identity);
  return appendMarketApprovalDecision({
    ...input.identity,
    trainingWindow: null,
    validationWindow: null,
    outOfSampleWindow: null,
    evaluationSeasons: [],
    sampleSize: input.sampleSize,
    dataCoverage: input.dataCoverage ?? null,
    dataIntegrity: input.dataIntegrity,
    predictiveQuality: input.predictiveQuality,
    bettingQuality: input.bettingQuality,
    status: input.status,
    reason: input.reason,
    previousStatus: previous?.status ?? null,
    evaluationMetadata: {
      ...(input.evaluationMetadata ?? {}),
      automatic: false,
      transition: "manual_override",
    },
  });
}

export const MONEYLINE_APPROVAL_POLICY = Object.freeze({
  minimumSampleSize: 100,
  minimumWinRate: 0.5,
  maximumCalibrationError: 0.05,
  maximumBrierScore: 0.25,
  maximumLogLoss: 0.7,
  minimumClv: 0,
  maximumDrawdownUnits: 20,
  minimumPositiveClvRate: 0.5,
  maximumEvidenceAgeMs: 30 * 24 * 60 * 60 * 1000,
});

/**
 * These are the production moneyline models that predate the exact approval
 * ledger. Their publication behavior is preserved during the ledger rollout;
 * new moneyline versions must earn their own exact approval.
 */
export const ESTABLISHED_MONEYLINE_MODEL_IDS = new Set([
  "tbm-mlb-moneyline-v1",
  "tbm-nba-moneyline-v1",
  "tbm-ncaab-moneyline-v1",
  "tbm-ncaaf-moneyline-v1",
  "tbm-nfl-moneyline-v1",
  "tbm-nhl-moneyline-v1",
  "tbm-soccer-moneyline-v1",
  "tbm-ufc-moneyline-v1",
  "tbm-wnba-moneyline-v1",
]);

export function isEstablishedProductionMoneylineModel(
  model: Pick<ModelVersion, "modelId" | "market" | "status">,
): boolean {
  return model.market === "moneyline"
    && model.status === "production"
    && ESTABLISHED_MONEYLINE_MODEL_IDS.has(model.modelId);
}

export function grandfatherApprovalCutoffs(
  modelCreatedAt: Date,
  existingEvidenceCutoffs: readonly Date[],
): Date[] {
  return [...new Map(
    [modelCreatedAt, ...existingEvidenceCutoffs]
      .map((cutoff) => [cutoff.getTime(), cutoff] as const),
  ).values()].sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Append exact approvals at every existing evidence cutoff for the established
 * v1 moneyline models. Matching each prior cutoff ensures a later-created
 * grandfather decision supersedes an automatic SHADOW row without rewriting
 * that history. Automatic lifecycle sweeps skip only this explicit allowlist.
 */
export async function ensureEstablishedMoneylineApprovals(): Promise<number> {
  const models = (await db
    .select()
    .from(modelVersionsTable)
    .where(and(
      eq(modelVersionsTable.market, "moneyline"),
      eq(modelVersionsTable.status, "production"),
    )))
    .filter(isEstablishedProductionMoneylineModel);

  let recorded = 0;
  for (const model of models) {
    const baseIdentity = moneylineApprovalIdentity(model, model.createdAt);
    const existing = await db
      .select({ evidenceCutoff: marketApprovalDecisionsTable.evidenceCutoff })
      .from(marketApprovalDecisionsTable)
      .where(and(
        eq(marketApprovalDecisionsTable.sport, baseIdentity.sport),
        eq(marketApprovalDecisionsTable.market, baseIdentity.market),
        eq(marketApprovalDecisionsTable.modelVersion, baseIdentity.modelVersion),
        eq(marketApprovalDecisionsTable.evaluationVersion, baseIdentity.evaluationVersion),
        eq(marketApprovalDecisionsTable.datasetVersion, baseIdentity.datasetVersion),
        eq(marketApprovalDecisionsTable.featureSchemaVersion, baseIdentity.featureSchemaVersion),
      ));

    for (const evidenceCutoff of grandfatherApprovalCutoffs(
      model.createdAt,
      existing.map((row) => row.evidenceCutoff),
    )) {
      const decision = await recordManualMarketApproval({
        identity: { ...baseIdentity, evidenceCutoff },
        dataIntegrity: {
          status: "PASSED",
          reasons: [],
          metrics: { grandfatheredEstablishedMoneyline: true },
        },
        predictiveQuality: {
          status: "PASSED",
          reasons: [],
          metrics: { grandfatheredEstablishedMoneyline: true },
        },
        bettingQuality: {
          status: "PASSED",
          reasons: [],
          metrics: { grandfatheredEstablishedMoneyline: true },
        },
        sampleSize: 0,
        status: "PRODUCTION_APPROVED",
        reason: "Grandfathered established production moneyline behavior during exact approval ledger rollout",
        evaluationMetadata: {
          policy: "established-moneyline-v1-grandfather",
          modelVersionId: model.id,
        },
      });
      if (decision) recorded++;
    }
  }
  return recorded;
}

/** Append automatic exact decisions from the latest immutable moneyline metrics. */
export async function refreshMoneylineApprovalDecisions(
  modelVersionIds?: readonly number[],
): Promise<number> {
  const models = await db
    .select()
    .from(modelVersionsTable)
    .where(and(
      eq(modelVersionsTable.market, "moneyline"),
      ...(modelVersionIds?.length
        ? [inArray(modelVersionsTable.id, [...modelVersionIds])]
        : []),
    ));
  let recorded = 0;
  for (const model of models) {
    if (isEstablishedProductionMoneylineModel(model)) continue;
    const [metrics] = await db
      .select()
      .from(performanceMetricsTable)
      .where(and(
        eq(performanceMetricsTable.modelVersionId, model.id),
        isNull(performanceMetricsTable.sport),
        isNull(performanceMetricsTable.market),
        isNull(performanceMetricsTable.recommendation),
      ))
      .orderBy(desc(performanceMetricsTable.computedAt))
      .limit(1);
    if (!metrics) {
      const insufficient: ApprovalLayerResult = {
        status: "INSUFFICIENT",
        reasons: ["validation_metrics_missing"],
        metrics: {},
      };
      await evaluateAndRecordAutomaticApproval({
        identity: moneylineApprovalIdentity(model, new Date()),
        hasEvaluationEvidence: false,
        dataIntegrity: insufficient,
        predictiveQuality: insufficient,
        bettingQuality: insufficient,
        sampleSize: 0,
        evidenceValid: false,
        evidenceStale: false,
        evaluationMetadata: {
          modelVersionId: model.id,
          trigger: "analytics_refresh",
          policy: MONEYLINE_APPROVAL_POLICY,
        },
      });
      recorded++;
      continue;
    }

    const dataReasons = [
      ...(metrics.sampleSize < MONEYLINE_APPROVAL_POLICY.minimumSampleSize
        ? ["sample_support"] : []),
    ];
    const predictiveReasons = [
      ...(metrics.winRate == null ? ["missing_win_rate"]
        : metrics.winRate < MONEYLINE_APPROVAL_POLICY.minimumWinRate ? ["win_rate"] : []),
      ...(metrics.calibrationError == null ? ["missing_calibration"]
        : metrics.calibrationError > MONEYLINE_APPROVAL_POLICY.maximumCalibrationError ? ["calibration"] : []),
      ...(metrics.brierScore == null ? ["missing_brier_score"]
        : metrics.brierScore > MONEYLINE_APPROVAL_POLICY.maximumBrierScore ? ["brier_score"] : []),
      ...(metrics.logLoss == null ? ["missing_log_loss"]
        : metrics.logLoss > MONEYLINE_APPROVAL_POLICY.maximumLogLoss ? ["log_loss"] : []),
    ];
    const dataIntegrity: ApprovalLayerResult = {
      status: dataReasons.length ? "FAILED" : "PASSED",
      reasons: dataReasons,
      metrics: { sampleSize: metrics.sampleSize },
    };
    const predictiveQuality: ApprovalLayerResult = {
      status: predictiveReasons.length ? "FAILED" : "PASSED",
      reasons: predictiveReasons,
      metrics: {
        winRate: metrics.winRate,
        calibrationError: metrics.calibrationError,
        brierScore: metrics.brierScore,
        logLoss: metrics.logLoss,
      },
    };
    const bettingQuality = evaluateBettingQuality({
      clv: metrics.clvAverage,
      roi: metrics.roi,
      maxDrawdown: metrics.maxDrawdown,
      stability: metrics.posClvRate,
      minimumClv: MONEYLINE_APPROVAL_POLICY.minimumClv,
      maximumDrawdown: MONEYLINE_APPROVAL_POLICY.maximumDrawdownUnits,
      minimumStability: MONEYLINE_APPROVAL_POLICY.minimumPositiveClvRate,
    });
    const evidenceCutoff = new Date(`${metrics.periodEnd}T23:59:59.999Z`);
    await evaluateAndRecordAutomaticApproval({
      identity: moneylineApprovalIdentity(model, evidenceCutoff),
      hasEvaluationEvidence: metrics.sampleSize > 0,
      dataIntegrity,
      predictiveQuality,
      bettingQuality,
      sampleSize: metrics.sampleSize,
      hardSafetyGate: dataIntegrity,
      maxEvidenceAgeMs: MONEYLINE_APPROVAL_POLICY.maximumEvidenceAgeMs,
      trainingWindow: {
        start: model.trainingPeriodStart,
        end: model.trainingPeriodEnd,
      },
      validationWindow: {
        start: model.validationPeriodStart,
        end: model.validationPeriodEnd,
      },
      outOfSampleWindow: {
        start: metrics.periodStart,
        end: metrics.periodEnd,
      },
      evaluationMetadata: {
        modelVersionId: model.id,
        trigger: "analytics_refresh",
        policy: MONEYLINE_APPROVAL_POLICY,
      },
    });
    recorded++;
  }
  return recorded;
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