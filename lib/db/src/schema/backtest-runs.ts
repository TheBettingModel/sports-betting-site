import { pgTable, serial, text, integer, real, jsonb, date, timestamp, index } from "drizzle-orm/pg-core";
import { modelVersionsTable } from "./model-versions";
import { trainingDatasetsTable } from "./training-datasets";

/**
 * Walk-forward backtest results for a given model version.
 * Each run covers a specific train/validate/test window split.
 */
export const backtestRunsTable = pgTable(
  "backtest_runs",
  {
    id: serial("id").primaryKey(),
    modelVersionId: integer("model_version_id").notNull().references(() => modelVersionsTable.id),
    datasetId: integer("dataset_id").notNull().references(() => trainingDatasetsTable.id),
    // running | completed | failed
    status: text("status").notNull().default("running"),

    // Chronological window splits
    trainWindowStart: date("train_window_start", { mode: "string" }),
    trainWindowEnd: date("train_window_end", { mode: "string" }),
    validateWindowStart: date("validate_window_start", { mode: "string" }),
    validateWindowEnd: date("validate_window_end", { mode: "string" }),
    testWindowStart: date("test_window_start", { mode: "string" }),
    testWindowEnd: date("test_window_end", { mode: "string" }),

    // All financial and probabilistic metrics
    metrics: jsonb("metrics"),
    // Number of test-window predictions
    sampleSize: integer("sample_size"),
    // Average odds used (affects unit math)
    avgOdds: real("avg_odds"),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorDetails: text("error_details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("backtest_runs_model_version_idx").on(t.modelVersionId),
    index("backtest_runs_dataset_idx").on(t.datasetId),
    index("backtest_runs_status_idx").on(t.status),
  ],
);

export type BacktestRun = typeof backtestRunsTable.$inferSelect;
export type InsertBacktestRun = typeof backtestRunsTable.$inferInsert;
