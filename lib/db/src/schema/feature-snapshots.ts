import { pgTable, serial, integer, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { modelPredictionsTable } from "./model-predictions";

/**
 * Exact feature values used for each prediction.
 * Stored separately from model_predictions to keep the predictions
 * table lean while still enabling full reproducibility.
 */
export const featureSnapshotsTable = pgTable(
  "feature_snapshots",
  {
    id: serial("id").primaryKey(),
    predictionId: integer("prediction_id").notNull().references(() => modelPredictionsTable.id),
    // { featureName: value }
    featureValues: jsonb("feature_values").notNull(),
    // { featureName: version } — which version of each definition was used
    featureDefinitionVersions: jsonb("feature_definition_versions").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("feature_snapshots_prediction_id_idx").on(t.predictionId),
    index("feature_snapshots_captured_at_idx").on(t.capturedAt),
  ],
);

export type FeatureSnapshot = typeof featureSnapshotsTable.$inferSelect;
export type InsertFeatureSnapshot = typeof featureSnapshotsTable.$inferInsert;
