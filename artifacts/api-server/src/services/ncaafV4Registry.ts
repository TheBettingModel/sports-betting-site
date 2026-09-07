import { and, eq } from "drizzle-orm";
import { db, modelVersionsTable, trainingDatasetsTable, trainingRunsTable } from "@workspace/db";
import { createModelVersion, transitionModelStatus } from "./modelRegistry";

export const NCAAF_V4_SPLIT_CHECKSUM = "7cee52d5188179d81a177aa55b9ac54e06211f11ed8a5b0d29b032ff94095abc";
export interface NcaafV4Registration {
  validationMetrics: Record<string, unknown>; oosMetrics: Record<string, unknown>;
  configurationHash: string; parameterHash: string; artifactLocation: string;
}
/** Development-only idempotent registry ledger. It deliberately never invokes a
 * production transition, prediction table, recommendation, or publication path. */
export async function registerNcaafV4Development(input: NcaafV4Registration) {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("NCAAF V4 challenger registration is restricted to NODE_ENV=development");
  }
  const incumbentBefore = await db.select().from(modelVersionsTable).where(eq(modelVersionsTable.modelId, "tbm-ncaaf-moneyline-v1")).limit(1);
  let [dataset] = await db.select().from(trainingDatasetsTable).where(eq(trainingDatasetsTable.checksum, NCAAF_V4_SPLIT_CHECKSUM)).limit(1);
  if (!dataset) {
    [dataset] = await db.insert(trainingDatasetsTable).values({
      sport: "NCAAF", market: "expected-score", includedSeasons: [2023, 2024, 2025],
      featureVersions: { schema: "ncaaf-chronological-team-game-v2", dataset: "ncaaf-v4-training-foundation-v2" },
      outcomeDefinition: "independent expected home and away points reconstructed from immutable margin/total labels",
      dataCutoffRules: { pit: "pregame replay only", splitChecksum: NCAAF_V4_SPLIT_CHECKSUM, validation: "2025 weeks 1-7", oos: "2025 week 8+" },
      rowCount: 2398, sourceVersions: { provider: "college_football_data", artifact: "ncaaf-v4-training-foundation-v2" },
      missingDataReport: { week: { recoveredReadOnlyFrom: "ncaaf_game_evidence" } }, checksum: NCAAF_V4_SPLIT_CHECKSUM,
    }).onConflictDoNothing().returning();
    if (!dataset) [dataset] = await db.select().from(trainingDatasetsTable).where(eq(trainingDatasetsTable.checksum, NCAAF_V4_SPLIT_CHECKSUM)).limit(1);
  }
  if (!dataset) throw new Error("Could not establish immutable NCAAF V4 dataset");
  let [model] = await db.select().from(modelVersionsTable).where(eq(modelVersionsTable.modelId, "tbm-ncaaf-v4-expected-score")).limit(1);
  if (!model) {
    model = await createModelVersion({ modelId: "tbm-ncaaf-v4-expected-score", sport: "NCAAF", market: "expected-score",
      notes: "UNVALIDATED NCAAF-only research challenger; no production/publication permission.",
      hyperparameters: { family: "validation-selected ridge expected score", configurationHash: input.configurationHash, parameterHash: input.parameterHash },
      evaluationMetrics: { validation: input.validationMetrics, oos: input.oosMetrics }, artifactLocation: input.artifactLocation,
      featureVersions: { schema: 2 }, trainingPeriodStart: "2023-01-01", trainingPeriodEnd: "2024-12-31" });
    [model] = await db.update(modelVersionsTable).set({ trainingDatasetId: dataset.id, validationPeriodStart: "2025-01-01", validationPeriodEnd: "2025-10-13", testPeriodStart: "2025-10-14", testPeriodEnd: "2025-12-31" }).where(eq(modelVersionsTable.id, model.id)).returning();
  }
  if (model.status === "development") model = await transitionModelStatus(model.id, { newStatus: "challenger", performedBy: "ncaaf-v4-development-registration", notes: "UNVALIDATED research challenger only" });
  if (model.status !== "challenger") throw new Error(`NCAAF V4 registry is not an editable challenger: ${model.status}`);
  [model] = await db.update(modelVersionsTable).set({
    trainingDatasetId: dataset.id,
    hyperparameters: {
      family: "validation-selected expected score",
      configurationHash: input.configurationHash,
      parameterHash: input.parameterHash,
    },
    evaluationMetrics: { validation: input.validationMetrics, oos: input.oosMetrics },
    artifactLocation: input.artifactLocation,
    notes: "UNVALIDATED NCAAF-only research challenger; no production/publication permission.",
  }).where(and(
    eq(modelVersionsTable.id, model.id),
    eq(modelVersionsTable.status, "challenger"),
  )).returning();
  if (!model) throw new Error("Could not update editable NCAAF V4 challenger metadata");
  const existing = await db.select().from(trainingRunsTable).where(and(eq(trainingRunsTable.modelVersionId, model.id), eq(trainingRunsTable.datasetId, dataset.id)));
  const sameParameters = existing.some(run => (run.metrics as Record<string, unknown> | null)?.parameterHash === input.parameterHash);
  if (!sameParameters) await db.insert(trainingRunsTable).values({ modelVersionId: model.id, datasetId: dataset.id, status: "completed", startedAt: new Date("2026-09-04T00:00:00.000Z"), completedAt: new Date("2026-09-04T00:00:00.000Z"), metrics: { validation: input.validationMetrics, oos: input.oosMetrics, configurationHash: input.configurationHash, parameterHash: input.parameterHash } });
  const incumbentAfter = await db.select().from(modelVersionsTable).where(eq(modelVersionsTable.modelId, "tbm-ncaaf-moneyline-v1")).limit(1);
  if (JSON.stringify(incumbentBefore) !== JSON.stringify(incumbentAfter)) throw new Error("Production NCAAF incumbent changed during challenger registration");
  return { dataset, model, incumbentUnchanged: true, trainingRunCreated: !sameParameters };
}