import { pgTable, serial, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { modelVersionsTable } from "./model-versions";
import { trainingDatasetsTable } from "./training-datasets";

/**
 * Records each training run that produced or updated a model version.
 */
export const trainingRunsTable = pgTable(
  "training_runs",
  {
    id: serial("id").primaryKey(),
    modelVersionId: integer("model_version_id").notNull().references(() => modelVersionsTable.id),
    datasetId: integer("dataset_id").notNull().references(() => trainingDatasetsTable.id),
    // running | completed | failed
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // { accuracy, brierScore, logLoss, ... }
    metrics: jsonb("metrics"),
    errorDetails: text("error_details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("training_runs_model_version_idx").on(t.modelVersionId),
    index("training_runs_dataset_idx").on(t.datasetId),
    index("training_runs_status_idx").on(t.status),
  ],
);

export type TrainingRun = typeof trainingRunsTable.$inferSelect;
export type InsertTrainingRun = typeof trainingRunsTable.$inferInsert;
