import { sql } from "drizzle-orm";
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

    // Optional immutable candidate identity.  These fields make a challenger
    // registry row an exact foreign-key target rather than treating a
    // human-readable model_id as sufficient provenance.
    candidateModelVersion: text("candidate_model_version"),
    candidateArtifactId: text("candidate_artifact_id"),
    candidateArtifactHash: text("candidate_artifact_hash"),
    candidateConfigurationHash: text("candidate_configuration_hash"),
    candidateParameterHash: text("candidate_parameter_hash"),
    candidateInputContractVersion: text("candidate_input_contract_version"),

    // Immutable capture of the exact runtime configuration that occupied this
    // production slot when Phase 1 froze outcome-driven production learning.
    // Existing production rows are extended in place; no parallel registry is
    // created.
    championSnapshot: jsonb("champion_snapshot").$type<Record<string, unknown>>(),
    championSnapshotHash: text("champion_snapshot_hash"),
    championFrozenAt: timestamp("champion_frozen_at", { withTimezone: true }),

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
    index("model_versions_champion_snapshot_hash_idx").on(t.championSnapshotHash),
    uniqueIndex("model_versions_one_production_per_market_unique")
      .on(t.sport, t.market)
      .where(sql`${t.status} = 'production'`),
  ],
);

export type ModelVersion = typeof modelVersionsTable.$inferSelect;
export type InsertModelVersion = typeof modelVersionsTable.$inferInsert;
