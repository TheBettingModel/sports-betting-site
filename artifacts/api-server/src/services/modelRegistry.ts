/**
 * Model Registry service.
 *
 * Manages the full lifecycle of model versions:
 *   development → challenger → approved → production → retired
 *
 * Rules:
 * - Only ONE model per (sport, market) can be `production` at a time.
 *   Promoting a new model to production automatically retires the incumbent.
 * - Transitioning to `production` or `retired` requires master approval
 *   (masterApproved: true on the caller's request).
 * - Every status change writes a deployment_history audit row.
 * - All multi-step lifecycle operations (promote, rollback, archive) are
 *   wrapped in a database transaction to guarantee atomicity.
 */

import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  deploymentHistoryTable,
  modelVersionsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

// ── Valid status transitions ──────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  development: ["challenger", "rejected"],
  challenger: ["approved", "rejected", "development"],
  approved: ["production", "rejected", "challenger"],
  production: ["retired"],          // only with masterApproved
  retired: [],                      // terminal
  rejected: [],                     // terminal
};

/** Transitions that require master approval */
const MASTER_REQUIRED = new Set(["production", "retired"]);

/** Statuses that forbid metadata updates */
const IMMUTABLE_STATUSES = new Set(["production", "retired", "rejected"]);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateModelVersionInput {
  modelId: string;
  sport: string;
  market: string;
  notes?: string;
  hyperparameters?: Record<string, unknown>;
  evaluationMetrics?: Record<string, unknown>;
  artifactLocation?: string;
  featureVersions?: Record<string, number>;
  trainingPeriodStart?: string;
  trainingPeriodEnd?: string;
}

export interface UpdateModelVersionInput {
  notes?: string;
  hyperparameters?: Record<string, unknown>;
  evaluationMetrics?: Record<string, unknown>;
  artifactLocation?: string;
  featureVersions?: Record<string, number>;
  trainingPeriodStart?: string;
  trainingPeriodEnd?: string;
}

export interface TransitionStatusInput {
  newStatus: string;
  performedBy: string;
  masterApproved?: boolean;
  notes?: string;
  approvedBy?: string;
}

// ── Internal helper ───────────────────────────────────────────────────────────

/** Write a deployment_history row. Accepts `db` or a Drizzle transaction. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbOrTx: any,
  modelVersionId: number | null,
  action: string,
  previousStatus: string | null,
  newStatus: string | null,
  performedBy: string,
  approvedBy?: string | null,
  notes?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  await dbOrTx.insert(deploymentHistoryTable).values({
    modelVersionId,
    action,
    previousStatus,
    newStatus,
    performedBy,
    approvedBy: approvedBy ?? null,
    notes: notes ?? null,
    metadata: metadata ?? null,
    performedAt: new Date(),
  });
}

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Register a new model version in `development` status.
 */
export async function createModelVersion(input: CreateModelVersionInput) {
  const [version] = await db
    .insert(modelVersionsTable)
    .values({
      modelId: input.modelId,
      sport: input.sport,
      market: input.market,
      status: "development",
      notes: input.notes ?? null,
      hyperparameters: input.hyperparameters ?? null,
      evaluationMetrics: input.evaluationMetrics ?? null,
      artifactLocation: input.artifactLocation ?? null,
      featureVersions: input.featureVersions ?? null,
      trainingPeriodStart: input.trainingPeriodStart ?? null,
      trainingPeriodEnd: input.trainingPeriodEnd ?? null,
    })
    .returning();

  await writeHistory(
    db,
    version.id,
    "create",
    null,
    "development",
    "system",
    null,
    `Model version ${input.modelId} registered`,
  );

  logger.info({ modelId: input.modelId, id: version.id }, "Model version created");
  return version;
}

// ── Update metadata ───────────────────────────────────────────────────────────

/**
 * Update editable metadata on a model version.
 * Forbidden when status is production, retired, or rejected — those records
 * must be immutable for audit purposes.
 */
export async function updateModelVersion(
  id: number,
  updates: UpdateModelVersionInput,
) {
  const [current] = await db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.id, id))
    .limit(1);

  if (!current) throw new Error(`Model version ${id} not found`);

  if (IMMUTABLE_STATUSES.has(current.status)) {
    throw new Error(
      `Cannot update metadata on a model in "${current.status}" status. ` +
        `Only development, challenger, and approved versions are editable.`,
    );
  }

  const [updated] = await db
    .update(modelVersionsTable)
    .set({
      notes: updates.notes ?? current.notes,
      hyperparameters: updates.hyperparameters ?? current.hyperparameters,
      evaluationMetrics: updates.evaluationMetrics ?? current.evaluationMetrics,
      artifactLocation: updates.artifactLocation ?? current.artifactLocation,
      featureVersions: updates.featureVersions ?? current.featureVersions,
      trainingPeriodStart: updates.trainingPeriodStart ?? current.trainingPeriodStart,
      trainingPeriodEnd: updates.trainingPeriodEnd ?? current.trainingPeriodEnd,
    })
    .where(eq(modelVersionsTable.id, id))
    .returning();

  return updated;
}

// ── Archive (soft-delete) ─────────────────────────────────────────────────────

/**
 * Archive a model version by rejecting it. Writes a deployment_history entry.
 * Production models cannot be archived — retire them via a status transition instead.
 */
export async function archiveModelVersion(
  id: number,
  performedBy: string,
  reason?: string,
) {
  const [current] = await db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.id, id))
    .limit(1);

  if (!current) throw new Error(`Model version ${id} not found`);

  if (current.status === "production") {
    throw new Error(
      "Cannot archive a production model. " +
        "Transition it to retired via PATCH /api/models/:id/status with masterApproved: true.",
    );
  }

  if (current.status === "retired" || current.status === "rejected") {
    throw new Error(`Model version is already in terminal status "${current.status}".`);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(modelVersionsTable)
      .set({ status: "rejected" })
      .where(eq(modelVersionsTable.id, id));

    await writeHistory(
      tx,
      id,
      "archive",
      current.status,
      "rejected",
      performedBy,
      null,
      reason ?? "Archived by user",
    );
  });

  const [updated] = await db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.id, id))
    .limit(1);

  logger.info({ id, from: current.status, performedBy }, "Model version archived");
  return updated;
}

// ── Status transition ─────────────────────────────────────────────────────────

/**
 * Transition a model version to a new status.
 * All DB writes are performed inside a single transaction.
 */
export async function transitionModelStatus(
  modelVersionId: number,
  input: TransitionStatusInput,
) {
  const [current] = await db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.id, modelVersionId))
    .limit(1);

  if (!current) throw new Error(`Model version ${modelVersionId} not found`);

  const { newStatus, performedBy, masterApproved, notes, approvedBy } = input;
  const allowed = VALID_TRANSITIONS[current.status] ?? [];

  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid transition: ${current.status} → ${newStatus}. ` +
        `Allowed: ${allowed.join(", ") || "none (terminal state)"}`,
    );
  }

  if (MASTER_REQUIRED.has(newStatus) && !masterApproved) {
    throw new Error(
      `Transition to "${newStatus}" requires master approval (masterApproved: true).`,
    );
  }

  // ── All writes are atomic ─────────────────────────────────────────────────
  await db.transaction(async (tx) => {
    // Retire the incumbent production model if we are promoting a new one
    if (newStatus === "production") {
      const [incumbent] = await tx
        .select()
        .from(modelVersionsTable)
        .where(
          and(
            eq(modelVersionsTable.sport, current.sport),
            eq(modelVersionsTable.market, current.market),
            eq(modelVersionsTable.status, "production"),
          ),
        )
        .limit(1);

      if (incumbent && incumbent.id !== modelVersionId) {
        await tx
          .update(modelVersionsTable)
          .set({ status: "retired" })
          .where(eq(modelVersionsTable.id, incumbent.id));

        await writeHistory(
          tx,
          incumbent.id,
          "auto_retire",
          "production",
          "retired",
          "system",
          approvedBy ?? null,
          `Auto-retired when ${current.modelId} was promoted to production`,
          { promotedModelId: modelVersionId },
        );

        // Set rollback target so a later rollback can restore the old version
        await tx
          .update(modelVersionsTable)
          .set({ rollbackTargetId: incumbent.id })
          .where(eq(modelVersionsTable.id, modelVersionId));

        logger.info(
          { retiredId: incumbent.id, promotedId: modelVersionId },
          "Incumbent production model auto-retired",
        );
      }
    }

    // Apply the status update
    const updates: Partial<typeof modelVersionsTable.$inferInsert> = { status: newStatus };
    if (newStatus === "approved") {
      updates.approvedAt = new Date();
      updates.approvedBy = approvedBy ?? performedBy;
    }
    if (newStatus === "production") {
      updates.deployedAt = new Date();
      updates.deploymentApprovedBy = approvedBy ?? performedBy;
    }

    await tx
      .update(modelVersionsTable)
      .set(updates)
      .where(eq(modelVersionsTable.id, modelVersionId));

    const actionMap: Record<string, string> = {
      production: "deploy",
      retired: "retire",
      challenger: "promote_to_challenger",
      approved: "approve",
      rejected: "reject",
      development: "demote",
    };

    await writeHistory(
      tx,
      modelVersionId,
      actionMap[newStatus] ?? newStatus,
      current.status,
      newStatus,
      performedBy,
      approvedBy ?? null,
      notes ?? null,
    );
  });

  const [updated] = await db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.id, modelVersionId))
    .limit(1);

  logger.info(
    { id: modelVersionId, from: current.status, to: newStatus, performedBy },
    "Model status transitioned",
  );
  return updated;
}

// ── Rollback ──────────────────────────────────────────────────────────────────

/**
 * Roll back the current production model to the version stored in
 * rollback_target_id. Requires master approval. All writes are atomic.
 */
export async function rollbackModel(
  modelVersionId: number,
  performedBy: string,
  masterApproved: boolean,
  notes?: string,
) {
  if (!masterApproved) {
    throw new Error("Rollback requires master approval (masterApproved: true).");
  }

  const [current] = await db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.id, modelVersionId))
    .limit(1);

  if (!current) throw new Error(`Model version ${modelVersionId} not found`);
  if (current.status !== "production")
    throw new Error("Can only roll back a model that is currently in production.");
  if (!current.rollbackTargetId)
    throw new Error("No rollback target set for this model version.");

  const [target] = await db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.id, current.rollbackTargetId))
    .limit(1);

  if (!target) throw new Error(`Rollback target ${current.rollbackTargetId} not found.`);

  const previousTargetStatus = target.status;

  await db.transaction(async (tx) => {
    // Retire current production
    await tx
      .update(modelVersionsTable)
      .set({ status: "retired" })
      .where(eq(modelVersionsTable.id, current.id));

    // Restore target to production
    await tx
      .update(modelVersionsTable)
      .set({
        status: "production",
        deployedAt: new Date(),
        deploymentApprovedBy: performedBy,
      })
      .where(eq(modelVersionsTable.id, target.id));

    await writeHistory(
      tx,
      current.id,
      "rollback",
      "production",
      "retired",
      performedBy,
      performedBy,
      notes ?? `Rolled back to ${target.modelId}`,
      { rollbackTargetId: target.id },
    );

    await writeHistory(
      tx,
      target.id,
      "rollback_restore",
      previousTargetStatus,
      "production",
      performedBy,
      performedBy,
      notes ?? `Restored via rollback from ${current.modelId}`,
      { rolledBackFromId: current.id },
    );
  });

  logger.info(
    { retiredId: current.id, restoredId: target.id, performedBy },
    "Model rollback complete",
  );

  return {
    retired: { ...current, status: "retired" },
    restored: { ...target, status: "production" },
  };
}

// ── Read helpers ──────────────────────────────────────────────────────────────

export async function getProductionVersions() {
  return db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.status, "production"));
}

export async function getChallengerVersions() {
  return db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.status, "challenger"));
}

export async function listModelVersions(filters?: {
  sport?: string;
  market?: string;
  status?: string | string[];
}) {
  const conditions = [];
  if (filters?.sport) conditions.push(eq(modelVersionsTable.sport, filters.sport));
  if (filters?.market) conditions.push(eq(modelVersionsTable.market, filters.market));
  if (filters?.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    conditions.push(inArray(modelVersionsTable.status, statuses));
  }

  return db
    .select()
    .from(modelVersionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(modelVersionsTable.createdAt);
}

export async function getModelVersion(id: number) {
  const [version] = await db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.id, id))
    .limit(1);
  return version ?? null;
}
