import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Append-only production permission ledger.
 *
 * Model registries and prediction rows describe what a model is and what it
 * predicted. This table separately records whether one exact validated model
 * and evidence context may publish official plays.
 */
export const marketApprovalDecisionsTable = pgTable(
  "market_approval_decisions",
  {
    id: serial("id").primaryKey(),
    sport: text("sport").notNull(),
    market: text("market").notNull(),
    modelVersion: text("model_version").notNull(),
    evaluationVersion: text("evaluation_version").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    featureSchemaVersion: text("feature_schema_version").notNull(),
    trainingWindow: jsonb("training_window"),
    validationWindow: jsonb("validation_window"),
    outOfSampleWindow: jsonb("out_of_sample_window"),
    evidenceCutoff: timestamp("evidence_cutoff", { withTimezone: true }).notNull(),
    evaluationSeasons: jsonb("evaluation_seasons").notNull().default([]),
    sampleSize: integer("sample_size").notNull().default(0),
    dataCoverage: real("data_coverage"),
    dataIntegrity: jsonb("data_integrity").notNull(),
    predictiveQuality: jsonb("predictive_quality").notNull(),
    bettingQuality: jsonb("betting_quality").notNull(),
    status: text("status").notNull(),
    reason: text("reason").notNull(),
    previousStatus: text("previous_status"),
    evaluationMetadata: jsonb("evaluation_metadata").notNull().default({}),
    decisionHash: text("decision_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("market_approval_decisions_hash_idx").on(t.decisionHash),
    index("market_approval_decisions_identity_idx").on(
      t.sport,
      t.market,
      t.modelVersion,
      t.evaluationVersion,
      t.datasetVersion,
      t.featureSchemaVersion,
      t.evidenceCutoff,
    ),
    index("market_approval_decisions_status_idx").on(t.status, t.createdAt),
  ],
);

export type MarketApprovalDecision = typeof marketApprovalDecisionsTable.$inferSelect;
export type InsertMarketApprovalDecision = typeof marketApprovalDecisionsTable.$inferInsert;