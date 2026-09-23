import { and, eq, inArray, or } from "drizzle-orm";
import {
  db,
  deploymentHistoryTable,
  modelVersionsTable,
  type ModelVersion,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { invalidateBootstrapCache } from "./bootstrap";
import {
  isDeployableModelIdentity,
  modelRegistryProductionLock,
} from "./modelRegistry";

const CANONICAL_MLB_MODEL_ID = "tbm-mlb-moneyline-v1";
const RECONCILIATION_ACTOR = "system:model-registry-reconciliation";

export interface MlbRegistryRepairPlan {
  contaminatedProductionIds: number[];
  restoreModelId: number | null;
  alreadyValidProductionId: number | null;
}

export interface PriorDeploymentEvidence {
  modelVersionId: number | null;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  approvedBy: string | null;
  performedAt: Date;
}

const QUALIFYING_PRIOR_DEPLOYMENT_ACTIONS = new Set([
  "deploy",
  "rollback_restore",
  // Auto-retirement proves the row was the incumbent production model, and
  // carries the named approver of the replacement lifecycle action.
  "auto_retire",
]);

export function isQualifiedPriorDeployment(
  evidence: PriorDeploymentEvidence,
): boolean {
  const approver = evidence.approvedBy?.trim() ?? "";
  const provesProduction = evidence.newStatus === "production"
    || (
      evidence.action === "auto_retire"
      && evidence.previousStatus === "production"
    );
  return evidence.modelVersionId !== null
    && QUALIFYING_PRIOR_DEPLOYMENT_ACTIONS.has(evidence.action)
    && provesProduction
    && approver.length > 0
    && !approver.toLowerCase().startsWith("system");
}

/**
 * Derive a repair without consulting prediction/publication tables. Those
 * immutable ledgers are intentionally outside this operation.
 */
export function deriveMlbRegistryRepairPlan(
  models: readonly Pick<ModelVersion, "id" | "modelId" | "sport" | "market" | "status">[],
  priorDeploymentEvidence: readonly PriorDeploymentEvidence[] = [],
): MlbRegistryRepairPlan {
  const scoped = models.filter(
    (model) => model.sport === "MLB" && model.market === "moneyline",
  );
  const production = scoped.filter((model) => model.status === "production");
  const validProduction = production.filter(isDeployableModelIdentity);
  if (validProduction.length > 1) {
    throw new Error("MLB registry reconciliation found multiple valid production models");
  }

  const contaminatedProductionIds = production
    .filter((model) => !isDeployableModelIdentity(model))
    .map((model) => model.id);
  if (contaminatedProductionIds.length === 0) {
    return {
      contaminatedProductionIds: [],
      restoreModelId: null,
      alreadyValidProductionId: validProduction[0]?.id ?? null,
    };
  }
  if (validProduction.length > 0) {
    throw new Error(
      "MLB registry reconciliation found both valid and contaminated production models",
    );
  }

  const canonical = scoped.find((model) => model.modelId === CANONICAL_MLB_MODEL_ID);
  const qualifiedPriorDeployment = priorDeploymentEvidence.find(
    (entry) =>
      entry.modelVersionId === canonical?.id
      && isQualifiedPriorDeployment(entry),
  );
  if (
    validProduction.length === 0
    && (!canonical
      || canonical.status !== "retired"
      || !qualifiedPriorDeployment)
  ) {
    throw new Error(
      `MLB registry reconciliation cannot restore ${CANONICAL_MLB_MODEL_ID} without retired status and prior deployment history`,
    );
  }

  return {
    contaminatedProductionIds,
    restoreModelId: canonical!.id,
    alreadyValidProductionId: null,
  };
}

export async function reconcileMlbProductionRegistry(): Promise<MlbRegistryRepairPlan> {
  const plan = await db.transaction(async (tx) => {
    await tx.execute(modelRegistryProductionLock("MLB", "moneyline"));
    const models = await tx
      .select()
      .from(modelVersionsTable)
      .where(and(
        eq(modelVersionsTable.sport, "MLB"),
        eq(modelVersionsTable.market, "moneyline"),
      ));
    const priorDeployments = await tx
      .select({
        modelVersionId: deploymentHistoryTable.modelVersionId,
        action: deploymentHistoryTable.action,
        previousStatus: deploymentHistoryTable.previousStatus,
        newStatus: deploymentHistoryTable.newStatus,
        approvedBy: deploymentHistoryTable.approvedBy,
        performedAt: deploymentHistoryTable.performedAt,
      })
      .from(deploymentHistoryTable)
      .where(and(
        inArray(deploymentHistoryTable.modelVersionId, models.map((model) => model.id)),
        or(
          eq(deploymentHistoryTable.newStatus, "production"),
          and(
            eq(deploymentHistoryTable.action, "auto_retire"),
            eq(deploymentHistoryTable.previousStatus, "production"),
          ),
        ),
      ));
    const derived = deriveMlbRegistryRepairPlan(models, priorDeployments);
    if (derived.contaminatedProductionIds.length === 0) return derived;

    const repairedAt = new Date();
    await tx
      .update(modelVersionsTable)
      .set({ status: "retired" })
      .where(inArray(modelVersionsTable.id, derived.contaminatedProductionIds));

    for (const contaminatedId of derived.contaminatedProductionIds) {
      await tx.insert(deploymentHistoryTable).values({
        modelVersionId: contaminatedId,
        action: "registry_contamination_retire",
        previousStatus: "production",
        newStatus: "retired",
        performedBy: RECONCILIATION_ACTOR,
        approvedBy: RECONCILIATION_ACTOR,
        notes: "Retired an invalid fixture-like production model identity",
        metadata: {
          repair: "mlb-production-registry-v1",
          historicalPredictionsModified: false,
        },
        performedAt: repairedAt,
      });
    }

    if (derived.restoreModelId !== null) {
      const restored = models.find((model) => model.id === derived.restoreModelId);
      const priorDeployment = priorDeployments
        .filter((entry) =>
          entry.modelVersionId === derived.restoreModelId
          && isQualifiedPriorDeployment(entry)
        )
        .sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime())[0];
      await tx
        .update(modelVersionsTable)
        .set({ status: "production" })
        .where(eq(modelVersionsTable.id, derived.restoreModelId));
      await tx.insert(deploymentHistoryTable).values({
        modelVersionId: derived.restoreModelId,
        action: "registry_contamination_restore",
        previousStatus: restored?.status ?? null,
        newStatus: "production",
        performedBy: RECONCILIATION_ACTOR,
        approvedBy: priorDeployment?.approvedBy ?? null,
        notes: `Restored ${CANONICAL_MLB_MODEL_ID} after registry contamination`,
        metadata: {
          repair: "mlb-production-registry-v1",
          retiredModelVersionIds: derived.contaminatedProductionIds,
          historicalPredictionsModified: false,
          publicationApprovalBypassed: false,
          restoredFromPriorDeploymentAt: priorDeployment?.performedAt.toISOString() ?? null,
        },
        performedAt: repairedAt,
      });
    }

    return derived;
  });

  if (plan.contaminatedProductionIds.length > 0) {
    invalidateBootstrapCache();
    logger.warn(
      {
        contaminatedProductionIds: plan.contaminatedProductionIds,
        restoredModelVersionId: plan.restoreModelId,
        retainedProductionModelId: plan.alreadyValidProductionId,
      },
      "MLB production model registry contamination repaired",
    );
  }
  return plan;
}