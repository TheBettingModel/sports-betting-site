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
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { modelPredictionsTable } from "./model-predictions";
import { ncaafFeatureSnapshotsTable } from "./ncaaf-feature-snapshots";
import { ncaafMarketObservationsTable } from "./ncaaf-evidence-ledger";

export const NCAAF_VALIDATION_SCHEMA_VERSION = "ncaaf-validation-v1";
export const NCAAF_EVALUATION_VERSION = "ncaaf-evaluation-v1";

/**
 * Immutable market available at the exact challenger decision time. This is
 * deliberately separate from both model_predictions and closing observations:
 * model predictions remain market-independent and odds-null.
 */
export const ncaafDecisionMarketsTable = pgTable("ncaaf_decision_markets", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(NCAAF_VALIDATION_SCHEMA_VERSION),
  evaluationVersion: text("evaluation_version").notNull().default(NCAAF_EVALUATION_VERSION),
  datasetVersion: text("dataset_version").notNull(),
  modelVersion: text("model_version").notNull(),
  configVersion: text("config_version").notNull(),
  configHash: text("config_hash").notNull(),
  predictionId: integer("prediction_id").notNull().references(() => modelPredictionsTable.id),
  featureSnapshotId: integer("feature_snapshot_id").notNull().references(() => ncaafFeatureSnapshotsTable.id),
  marketObservationId: integer("market_observation_id").references(() => ncaafMarketObservationsTable.id),
  espnEventId: text("espn_event_id").notNull(),
  oddsEventId: text("odds_event_id"),
  espnGameEvidenceId: integer("espn_game_evidence_id"),
  provider: text("provider"),
  bookmakerProviderId: text("bookmaker_provider_id"),
  market: text("market").notNull(),
  providerMarketKey: text("provider_market_key"),
  selection: text("selection").notNull(),
  providerSelection: text("provider_selection"),
  offeredPrice: integer("offered_price"),
  offeredLine: real("offered_line"),
  observationCapturedAt: timestamp("observation_captured_at", { withTimezone: true }),
  observationModeledAsOf: timestamp("observation_modeled_as_of", { withTimezone: true }),
  kickoffAt: timestamp("kickoff_at", { withTimezone: true }),
  status: text("status").notNull(), // matched | excluded
  exclusionReason: text("exclusion_reason"),
  matchProvenance: jsonb("match_provenance").notNull(),
  evidenceTier: text("evidence_tier").notNull(),
  uncertainty: real("uncertainty").notNull(),
  coverage: jsonb("coverage").notNull(),
  missingReasons: jsonb("missing_reasons").notNull(),
  pointInTimeCutoff: timestamp("point_in_time_cutoff", { withTimezone: true }).notNull(),
  provenanceHash: text("provenance_hash").notNull(),
  idempotencyHash: text("idempotency_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ncaaf_decision_markets_idempotency_idx").on(t.idempotencyHash),
  index("ncaaf_decision_markets_prediction_idx").on(t.predictionId, t.market),
  index("ncaaf_decision_markets_event_idx").on(t.espnEventId, t.oddsEventId),
]);

/** Immutable fair-price output. Unsupported markets are retained as blocked rows. */
export const ncaafMarketPricesTable = pgTable("ncaaf_market_prices", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(NCAAF_VALIDATION_SCHEMA_VERSION),
  evaluationVersion: text("evaluation_version").notNull().default(NCAAF_EVALUATION_VERSION),
  datasetVersion: text("dataset_version").notNull(),
  modelVersion: text("model_version").notNull(),
  configVersion: text("config_version").notNull(),
  configHash: text("config_hash").notNull(),
  featureSnapshotId: integer("feature_snapshot_id").notNull().references(() => ncaafFeatureSnapshotsTable.id),
  predictionId: integer("prediction_id").references(() => modelPredictionsTable.id),
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  line: real("line"),
  probabilityLower: real("probability_lower"),
  probabilityPoint: real("probability_point"),
  probabilityUpper: real("probability_upper"),
  fairAmericanPrice: integer("fair_american_price"),
  status: text("status").notNull(), // available | blocked
  evidenceTier: text("evidence_tier").notNull(),
  uncertainty: real("uncertainty").notNull(),
  coverage: jsonb("coverage").notNull(),
  missingReasons: jsonb("missing_reasons").notNull(),
  pointInTimeCutoff: timestamp("point_in_time_cutoff", { withTimezone: true }).notNull(),
  provenanceHash: text("provenance_hash").notNull(),
  idempotencyHash: text("idempotency_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ncaaf_market_prices_idempotency_idx").on(t.idempotencyHash),
  index("ncaaf_market_prices_event_idx").on(t.provider, t.providerEventId, t.market),
]);

/** One immutable grading fact per prediction/market/closing observation. */
export const ncaafEvaluationsTable = pgTable("ncaaf_evaluations", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(NCAAF_VALIDATION_SCHEMA_VERSION),
  evaluationVersion: text("evaluation_version").notNull().default(NCAAF_EVALUATION_VERSION),
  datasetVersion: text("dataset_version").notNull(),
  modelVersion: text("model_version").notNull(),
  configVersion: text("config_version").notNull(),
  configHash: text("config_hash").notNull(),
  predictionId: integer("prediction_id").notNull().references(() => modelPredictionsTable.id),
  featureSnapshotId: integer("feature_snapshot_id").notNull().references(() => ncaafFeatureSnapshotsTable.id),
  decisionMarketId: integer("decision_market_id").references(() => ncaafDecisionMarketsTable.id),
  marketPriceId: integer("market_price_id").references(() => ncaafMarketPricesTable.id),
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  season: integer("season").notNull(),
  week: integer("week"),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  line: real("line"),
  offeredPrice: integer("offered_price"),
  closingLine: real("closing_line"),
  closingPrice: integer("closing_price"),
  closingObservationId: integer("closing_observation_id"),
  outcome: text("outcome"), // win | loss | push
  probability: real("probability"),
  brier: real("brier"),
  logLoss: real("log_loss"),
  profitUnits: real("profit_units"),
  clv: real("clv"),
  exclusionReason: text("exclusion_reason"),
  evidenceTier: text("evidence_tier").notNull(),
  uncertainty: real("uncertainty").notNull(),
  coverage: jsonb("coverage").notNull(),
  missingReasons: jsonb("missing_reasons").notNull(),
  pointInTimeCutoff: timestamp("point_in_time_cutoff", { withTimezone: true }).notNull(),
  labelAvailableAt: timestamp("label_available_at", { withTimezone: true }),
  provenanceHash: text("provenance_hash").notNull(),
  idempotencyHash: text("idempotency_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ncaaf_evaluations_idempotency_idx").on(t.idempotencyHash),
  uniqueIndex("ncaaf_evaluations_canonical_identity_idx").on(
    t.evaluationVersion, t.predictionId, t.decisionMarketId,
  ),
  index("ncaaf_evaluations_dimensions_idx").on(t.season, t.week, t.market, t.evidenceTier),
]);

export const ncaafWalkForwardRunsTable = pgTable("ncaaf_walk_forward_runs", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(NCAAF_VALIDATION_SCHEMA_VERSION),
  evaluationVersion: text("evaluation_version").notNull().default(NCAAF_EVALUATION_VERSION),
  datasetVersion: text("dataset_version").notNull(),
  datasetHash: text("dataset_hash").notNull(),
  modelVersion: text("model_version").notNull(),
  modelHash: text("model_hash").notNull(),
  configVersion: text("config_version").notNull(),
  configHash: text("config_hash").notNull(),
  runKey: text("run_key").notNull(),
  status: text("status").notNull(), // completed | inconclusive | rejected
  pointInTimeCutoff: timestamp("point_in_time_cutoff", { withTimezone: true }).notNull(),
  provenanceHash: text("provenance_hash").notNull(),
  evidenceTier: text("evidence_tier").notNull(),
  uncertainty: real("uncertainty").notNull(),
  coverage: jsonb("coverage").notNull(),
  missingReasons: jsonb("missing_reasons").notNull(),
  summary: jsonb("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("ncaaf_walk_forward_runs_key_idx").on(t.runKey)]);

export const ncaafWalkForwardSegmentsTable = pgTable("ncaaf_walk_forward_segments", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(NCAAF_VALIDATION_SCHEMA_VERSION),
  evaluationVersion: text("evaluation_version").notNull().default(NCAAF_EVALUATION_VERSION),
  datasetVersion: text("dataset_version").notNull(),
  datasetHash: text("dataset_hash").notNull(),
  modelVersion: text("model_version").notNull(),
  modelHash: text("model_hash").notNull(),
  configVersion: text("config_version").notNull(),
  configHash: text("config_hash").notNull(),
  runId: integer("run_id").notNull().references(() => ncaafWalkForwardRunsTable.id),
  evaluationSeason: integer("evaluation_season").notNull(),
  trainingSeasons: jsonb("training_seasons").notNull(),
  status: text("status").notNull(),
  metrics: jsonb("metrics").notNull(),
  pointInTimeCutoff: timestamp("point_in_time_cutoff", { withTimezone: true }).notNull(),
  provenanceHash: text("provenance_hash").notNull(),
  evidenceTier: text("evidence_tier").notNull(),
  uncertainty: real("uncertainty").notNull(),
  coverage: jsonb("coverage").notNull(),
  missingReasons: jsonb("missing_reasons").notNull(),
  idempotencyHash: text("idempotency_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ncaaf_walk_forward_segments_idempotency_idx").on(t.idempotencyHash),
  index("ncaaf_walk_forward_segments_season_idx").on(t.evaluationSeason),
]);

/** Append-only recommendation. There is deliberately no mutable promoted flag. */
export const ncaafPromotionDecisionsTable = pgTable("ncaaf_promotion_decisions", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(NCAAF_VALIDATION_SCHEMA_VERSION),
  evaluationVersion: text("evaluation_version").notNull().default(NCAAF_EVALUATION_VERSION),
  datasetVersion: text("dataset_version").notNull(),
  modelVersion: text("model_version").notNull(),
  championModelVersion: text("champion_model_version").notNull(),
  challengerModelVersion: text("challenger_model_version").notNull(),
  configVersion: text("config_version").notNull(),
  configHash: text("config_hash").notNull(),
  thresholdConfig: jsonb("threshold_config").notNull(),
  thresholdHash: text("threshold_hash").notNull(),
  decision: text("decision").notNull(), // eligible | rejected | inconclusive
  gates: jsonb("gates").notNull(),
  reasons: jsonb("reasons").notNull(),
  pointInTimeCutoff: timestamp("point_in_time_cutoff", { withTimezone: true }).notNull(),
  provenanceHash: text("provenance_hash").notNull(),
  evidenceTier: text("evidence_tier").notNull(),
  uncertainty: real("uncertainty").notNull(),
  coverage: jsonb("coverage").notNull(),
  missingReasons: jsonb("missing_reasons").notNull(),
  idempotencyHash: text("idempotency_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ncaaf_promotion_decisions_idempotency_idx").on(t.idempotencyHash),
  index("ncaaf_promotion_decisions_models_idx").on(t.championModelVersion, t.challengerModelVersion),
]);

export const insertNcaafMarketPriceSchema = createInsertSchema(ncaafMarketPricesTable).omit({ id: true, createdAt: true });
export const insertNcaafDecisionMarketSchema = createInsertSchema(ncaafDecisionMarketsTable).omit({ id: true, createdAt: true });
export const insertNcaafEvaluationSchema = createInsertSchema(ncaafEvaluationsTable).omit({ id: true, createdAt: true });
export const insertNcaafWalkForwardRunSchema = createInsertSchema(ncaafWalkForwardRunsTable).omit({ id: true, createdAt: true });
export const insertNcaafWalkForwardSegmentSchema = createInsertSchema(ncaafWalkForwardSegmentsTable).omit({ id: true, createdAt: true });
export const insertNcaafPromotionDecisionSchema = createInsertSchema(ncaafPromotionDecisionsTable).omit({ id: true, createdAt: true });

export type NcaafMarketPrice = typeof ncaafMarketPricesTable.$inferSelect;
export type NcaafDecisionMarket = typeof ncaafDecisionMarketsTable.$inferSelect;
export type NcaafEvaluation = typeof ncaafEvaluationsTable.$inferSelect;
export type NcaafWalkForwardRun = typeof ncaafWalkForwardRunsTable.$inferSelect;
export type NcaafWalkForwardSegment = typeof ncaafWalkForwardSegmentsTable.$inferSelect;
export type NcaafPromotionDecision = typeof ncaafPromotionDecisionsTable.$inferSelect;
export type InsertNcaafMarketPrice = z.infer<typeof insertNcaafMarketPriceSchema>;
export type InsertNcaafEvaluation = z.infer<typeof insertNcaafEvaluationSchema>;