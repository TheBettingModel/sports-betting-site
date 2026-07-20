import { pgTable, serial, text, integer, date, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Registry of all model versions across sports and markets.
 * status: development | challenger | approved | production | retired | rejected
 */
export const modelVersionsTable = pgTable(
  "model_versions",
  {
    id: serial("id").primaryKey(),
    // Human-readable ID e.g. "tbm-mlb-moneyline-v2"
    modelId: text("model_id").notNull().unique(),
    sport: text("sport").notNull(),
    market: text("market").notNull(),
    // development | challenger | approved | production | retired | rejected
    status: text("status").notNull().default("development"),

    // Training provenance
    trainingDatasetId: integer("training_dataset_id"), // FK added after training_datasets table
    featureVersions: jsonb("feature_versions"),        // { featureName: version }
    trainingPeriodStart: date("training_period_start", { mode: "string" }),
    trainingPeriodEnd: date("training_period_end", { mode: "string" }),
    validationPeriodStart: date("validation_period_start", { mode: "string" }),
    validationPeriodEnd: date("validation_period_end", { mode: "string" }),
    testPeriodStart: date("test_period_start", { mode: "string" }),
    testPeriodEnd: date("test_period_end", { mode: "string" }),

    hyperparameters: jsonb("hyperparameters"),
    evaluationMetrics: jsonb("evaluation_metrics"),
    artifactLocation: text("artifact_location"), // path or URL to serialized model

    // Approval & deployment lifecycle
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    deployedAt: timestamp("deployed_at", { withTimezone: true }),
    deploymentApprovedBy: text("deployment_approved_by"),
    // points to the model that should be restored on rollback
    rollbackTargetId: integer("rollback_target_id"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("model_versions_model_id_idx").on(t.modelId),
    index("model_versions_sport_market_idx").on(t.sport, t.market),
    index("model_versions_status_idx").on(t.status),
  ],
);

export type ModelVersion = typeof modelVersionsTable.$inferSelect;
export type InsertModelVersion = typeof modelVersionsTable.$inferInsert;
