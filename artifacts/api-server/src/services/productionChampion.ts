import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  deploymentHistoryTable,
  modelVersionsTable,
  modelWeightsTable,
  type ModelVersion,
  type ModelWeights,
} from "@workspace/db";
import {
  effectiveWeights,
  MLB_MAX_FAVORITE_ODDS,
} from "./model";
import {
  isDeployableModelIdentity,
  modelRegistryProductionLock,
} from "./modelRegistryShared";

export const CHAMPION_SNAPSHOT_SCHEMA_VERSION = 1;

export function shouldCaptureProductionChampionSnapshot(market: string): boolean {
  return market === "moneyline";
}

function canonical(value: unknown): unknown {
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

export function productionChampionSnapshotHash(snapshot: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(snapshot)))
    .digest("hex");
}

export function buildProductionChampionSnapshot(
  model: Pick<ModelVersion, "id" | "modelId" | "sport" | "market" | "rollbackTargetId">,
  weights: ModelWeights | null,
): Record<string, unknown> {
  return {
    schemaVersion: CHAMPION_SNAPSHOT_SCHEMA_VERSION,
    role: "production_champion",
    identity: {
      modelVersionId: model.id,
      modelId: model.modelId,
      sport: model.sport,
      market: model.market,
    },
    formula: {
      implementation: "sport_specific_moneyline",
      version: "production-moneyline-formula-v1",
      factorWeights: effectiveWeights(model.sport, weights?.factorWeights),
      confidenceMultiplier: weights?.confidenceMultiplier ?? 1,
      publicationThresholdsChanged: false,
      gradingChanged: false,
      unitsChanged: false,
    },
    guardrails: {
      mlbMaximumFavoriteOdds: MLB_MAX_FAVORITE_ODDS,
    },
    evidenceState: {
      modelWeightsRecordId: weights?.id ?? null,
      learningMode: "frozen_research_only",
      observedAccuracyRate: weights?.accuracyRate ?? null,
      observedBrierScore: weights?.brierScore ?? null,
      observedTotalPredictions: weights?.totalPredictions ?? null,
      lastOutcomeDrivenUpdateAt: weights?.lastLearnedAt?.toISOString() ?? null,
    },
    rollbackProvenance: {
      rollbackTargetModelVersionId: model.rollbackTargetId,
      registrySource: "model_versions",
      auditSource: "deployment_history",
    },
  };
}

/**
 * Return the exact live row without mutation. Champion capture is evidence,
 * never an opportunity to "normalize" production values.
 */
export async function normalizeWeightsForChampionCapture(
  // Drizzle's transaction type is intentionally generic across node-postgres
  // versions; callers still provide the active database transaction.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  sport: string,
  weights: ModelWeights | null,
): Promise<ModelWeights | null> {
  void tx;
  void sport;
  return weights;
}

/**
 * Extend each existing canonical production registry row with an immutable
 * configuration snapshot. The null guard makes this append-like: later startup
 * runs cannot silently refresh the champion to newer live values.
 */
export async function ensureProductionChampionSnapshots(): Promise<number> {
  const models = await db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.status, "production"));
  let created = 0;

  for (const model of models.filter((row) =>
    isDeployableModelIdentity(row)
    && shouldCaptureProductionChampionSnapshot(row.market)
  )) {
    const didCreate = await db.transaction(async (tx) => {
      await tx.execute(modelRegistryProductionLock(model.sport, model.market));
      const [current] = await tx
        .select()
        .from(modelVersionsTable)
        .where(and(
          eq(modelVersionsTable.id, model.id),
          eq(modelVersionsTable.status, "production"),
          isNull(modelVersionsTable.championSnapshot),
        ))
        .limit(1);
      if (!current) return false;

      let [weights] = await tx
        .select()
        .from(modelWeightsTable)
        .where(eq(modelWeightsTable.sport, current.sport))
        .limit(1);
      const normalizedWeights = await normalizeWeightsForChampionCapture(
        tx,
        current.sport,
        weights ?? null,
      );
      const snapshot = buildProductionChampionSnapshot(
        current,
        normalizedWeights,
      );
      const snapshotHash = productionChampionSnapshotHash(snapshot);
      const frozenAt = new Date();
      const [updated] = await tx
        .update(modelVersionsTable)
        .set({
          championSnapshot: snapshot,
          championSnapshotHash: snapshotHash,
          championFrozenAt: frozenAt,
        })
        .where(and(
          eq(modelVersionsTable.id, current.id),
          eq(modelVersionsTable.status, "production"),
          isNull(modelVersionsTable.championSnapshot),
        ))
        .returning({ id: modelVersionsTable.id });
      if (!updated) return false;

      await tx.insert(deploymentHistoryTable).values({
        modelVersionId: current.id,
        action: "freeze_production_champion",
        previousStatus: "production",
        newStatus: "production",
        performedBy: "system",
        notes: "Captured Phase 1 production configuration before research-only learning",
        metadata: {
          championSnapshotHash: snapshotHash,
          rollbackTargetModelVersionId: current.rollbackTargetId,
          learningMode: "frozen_research_only",
        },
        performedAt: frozenAt,
      });
      return true;
    });
    if (didCreate) created++;
  }
  return created;
}