import { date, index, integer, jsonb, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Prospective V4 evidence. This is deliberately separate from the frozen
 * validation ledger and never contains mutable sportsbook values. */
export const ncaafV4GameDayPredictionsTable = pgTable("ncaaf_v4_game_day_predictions", {
  id: serial("id").primaryKey(),
  predictionId: text("prediction_id").notNull(),
  gameId: text("game_id").notNull(),
  canonicalGameId: text("canonical_game_id").notNull(),
  sport: text("sport").notNull(),
  gameDate: date("game_date", { mode: "string" }).notNull(),
  kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
  featureCutoff: timestamp("feature_cutoff", { withTimezone: true }).notNull(),
  modelName: text("model_name").notNull(), modelVersion: text("model_version").notNull(),
  configurationHash: text("configuration_hash").notNull(), parameterHash: text("parameter_hash").notNull(),
  featureSchemaVersion: text("feature_schema_version").notNull(), featureSnapshotHash: text("feature_snapshot_hash").notNull(),
  predictionHash: text("prediction_hash").notNull(), homeTeamId: text("home_team_id").notNull(), awayTeamId: text("away_team_id").notNull(),
  expectedHomePoints: real("expected_home_points").notNull(), expectedAwayPoints: real("expected_away_points").notNull(),
  expectedMargin: real("expected_margin").notNull(), expectedTotal: real("expected_total").notNull(),
  homeWinProbability: real("home_win_probability").notNull(), awayWinProbability: real("away_win_probability").notNull(),
  fairHomeMoneyline: integer("fair_home_moneyline"), fairAwayMoneyline: integer("fair_away_moneyline"),
  marginUncertainty: real("margin_uncertainty").notNull(), totalUncertainty: real("total_uncertainty").notNull(),
  dataQuality: text("data_quality").notNull(), modelStatus: text("model_status").notNull(),
  approvalStatus: text("approval_status").notNull(), publicationStatus: text("publication_status").notNull(),
  sourceAudit: jsonb("source_audit").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ncaaf_v4_game_day_prediction_identity_idx").on(t.predictionId),
  index("ncaaf_v4_game_day_prediction_grading_idx").on(t.canonicalGameId, t.kickoffAt, t.modelVersion),
  index("ncaaf_v4_game_day_prediction_date_idx").on(t.gameDate, t.createdAt),
]);

/** Immutable observation links allow market evidence to evolve independently. */
export const ncaafV4GameDayMarketEvidenceTable = pgTable("ncaaf_v4_game_day_market_evidence", {
  id: serial("id").primaryKey(),
  predictionEvidenceId: integer("prediction_evidence_id").notNull().references(() => ncaafV4GameDayPredictionsTable.id),
  marketObservationId: integer("market_observation_id").notNull(),
  marketIdentity: text("market_identity").notNull(), capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  evidenceHash: text("evidence_hash").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ncaaf_v4_game_day_market_evidence_identity_idx").on(t.predictionEvidenceId, t.marketObservationId, t.evidenceHash),
  index("ncaaf_v4_game_day_market_evidence_prediction_idx").on(t.predictionEvidenceId, t.capturedAt),
]);

export const insertNcaafV4GameDayPredictionSchema = createInsertSchema(ncaafV4GameDayPredictionsTable).omit({ id: true, createdAt: true });
export type InsertNcaafV4GameDayPrediction = z.infer<typeof insertNcaafV4GameDayPredictionSchema>;