import {
  boolean,
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
import { gamesTable } from "./games";
import { modelPredictionsTable } from "./model-predictions";
import { playersTable } from "./players";

/**
 * MLB point-in-time intelligence dataset. These tables are append-only evidence:
 * a correction is a new revision/outcome row, never an update to prior evidence.
 * JSON documents are reserved for provider-shaped, optional detail; queryable
 * research metrics retain typed columns.
 */
export const MLB_PIT_SCHEMA_VERSION = "mlb-pit-v1";

export const mlbRawProviderSnapshotsTable = pgTable("mlb_raw_provider_snapshots", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  providerRecordId: text("provider_record_id"),
  providerEventId: text("provider_event_id").notNull(),
  gameId: text("game_id").references(() => gamesTable.id),
  payload: jsonb("payload").notNull(),
  payloadHash: text("payload_hash").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  sourceFreshnessSeconds: integer("source_freshness_seconds"),
  qualityState: text("quality_state").notNull(),
  providerError: text("provider_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_raw_provider_snapshot_identity_idx").on(t.provider, t.providerEventId, t.payloadHash),
  index("mlb_raw_provider_snapshot_game_retrieved_idx").on(t.gameId, t.retrievedAt),
]);

export const mlbFeatureSnapshotsTable = pgTable("mlb_feature_snapshots", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(MLB_PIT_SCHEMA_VERSION),
  gameId: text("game_id").notNull().references(() => gamesTable.id),
  revisionKey: text("revision_key").notNull(),
  revisionState: text("revision_state").notNull(), // EARLY | UPDATED | FINAL_PREGAME
  pointInTimeCutoff: timestamp("point_in_time_cutoff", { withTimezone: true }).notNull(),
  gameStartTime: timestamp("game_start_time", { withTimezone: true }).notNull(),
  inputHash: text("input_hash").notNull(),
  features: jsonb("features").notNull(),
  quality: jsonb("quality").notNull(),
  completenessPct: real("completeness_pct").notNull(),
  rawPayloadHashes: jsonb("raw_payload_hashes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_feature_snapshot_identity_idx").on(t.schemaVersion, t.gameId, t.revisionKey, t.inputHash),
  index("mlb_feature_snapshot_game_cutoff_idx").on(t.gameId, t.pointInTimeCutoff),
]);

export const mlbLeagueRunEnvironmentTable = pgTable("mlb_league_run_environment", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(MLB_PIT_SCHEMA_VERSION),
  season: integer("season").notNull(),
  targetGameId: text("target_game_id").references(() => gamesTable.id),
  cutoffAt: timestamp("cutoff_at", { withTimezone: true }).notNull(),
  window: text("window").notNull(), // season_to_date | last_7d | last_14d | last_30d
  sampleGames: integer("sample_games").notNull(),
  runsPerTeamGame: real("runs_per_team_game"),
  homeRunsPerGame: real("home_runs_per_game"),
  awayRunsPerGame: real("away_runs_per_game"),
  homeRunsPerTeamGame: real("home_runs_per_team_game"),
  qualityState: text("quality_state").notNull(),
  inputHash: text("input_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_league_run_environment_identity_idx").on(t.season, t.targetGameId, t.cutoffAt, t.window, t.inputHash),
  index("mlb_league_run_environment_cutoff_idx").on(t.season, t.cutoffAt),
]);

export const mlbStarterPregameSnapshotsTable = pgTable("mlb_starter_pregame_snapshots", {
  id: serial("id").primaryKey(),
  featureSnapshotId: integer("feature_snapshot_id").notNull().references(() => mlbFeatureSnapshotsTable.id),
  gameId: text("game_id").notNull().references(() => gamesTable.id),
  teamSide: text("team_side").notNull(),
  providerPlayerId: text("provider_player_id"),
  playerName: text("player_name"),
  handedness: text("handedness"),
  confirmationState: text("confirmation_state").notNull(),
  metrics: jsonb("metrics").notNull(),
  projectedInnings: real("projected_innings"),
  projectedRunsAllowed: real("projected_runs_allowed"),
  v4StarterQuality: real("v4_starter_quality"),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  qualityState: text("quality_state").notNull(),
  rawPayloadHash: text("raw_payload_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_starter_pregame_snapshot_identity_idx").on(t.featureSnapshotId, t.teamSide),
  index("mlb_starter_pregame_game_idx").on(t.gameId, t.teamSide),
]);

export const mlbStarterOutcomesTable = pgTable("mlb_starter_outcomes", {
  id: serial("id").primaryKey(),
  gameId: text("game_id").notNull().references(() => gamesTable.id),
  teamSide: text("team_side").notNull(),
  providerPlayerId: text("provider_player_id"),
  playerName: text("player_name"),
  inningsPitched: real("innings_pitched"),
  battersFaced: integer("batters_faced"),
  pitchCount: integer("pitch_count"),
  runsAllowed: integer("runs_allowed"),
  earnedRuns: integer("earned_runs"),
  hits: integer("hits"),
  walks: integer("walks"),
  strikeouts: integer("strikeouts"),
  homeRunsAllowed: integer("home_runs_allowed"),
  projectedInnings: real("projected_innings"),
  projectedRunsAllowed: real("projected_runs_allowed"),
  inningsResidual: real("innings_residual"),
  runsResidual: real("runs_residual"),
  source: text("source").notNull(),
  qualityState: text("quality_state").notNull(),
  rawPayloadHash: text("raw_payload_hash"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_starter_outcome_identity_idx").on(t.gameId, t.teamSide, t.rawPayloadHash),
  index("mlb_starter_outcome_game_idx").on(t.gameId),
]);

/** Team batting actuality is outcome-only and can never be joined into PIT inputs. */
export const mlbTeamOffenseOutcomesTable = pgTable("mlb_team_offense_outcomes", {
  id: serial("id").primaryKey(),
  gameId: text("game_id").notNull().references(() => gamesTable.id),
  teamSide: text("team_side").notNull(),
  runs: integer("runs").notNull(), hits: integer("hits"), walks: integer("walks"),
  strikeouts: integer("strikeouts"), homeRuns: integer("home_runs"), plateAppearances: integer("plate_appearances"),
  source: text("source").notNull(), qualityState: text("quality_state").notNull(),
  rawPayloadHash: text("raw_payload_hash"), capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("mlb_team_offense_outcome_identity_idx").on(t.gameId, t.teamSide, t.rawPayloadHash)]);

export const mlbLineupRevisionsTable = pgTable("mlb_lineup_revisions", {
  id: serial("id").primaryKey(),
  featureSnapshotId: integer("feature_snapshot_id").notNull().references(() => mlbFeatureSnapshotsTable.id),
  gameId: text("game_id").notNull().references(() => gamesTable.id),
  teamSide: text("team_side").notNull(),
  lineupState: text("lineup_state").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  lineupCompletenessPct: real("lineup_completeness_pct").notNull(),
  players: jsonb("players").notNull(),
  aggregateFeatures: jsonb("aggregate_features").notNull(),
  qualityState: text("quality_state").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  rawPayloadHash: text("raw_payload_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_lineup_revision_identity_idx").on(t.featureSnapshotId, t.teamSide, t.rawPayloadHash),
  index("mlb_lineup_revision_game_idx").on(t.gameId, t.teamSide, t.retrievedAt),
]);

export const mlbBullpenPregameSnapshotsTable = pgTable("mlb_bullpen_pregame_snapshots", {
  id: serial("id").primaryKey(),
  featureSnapshotId: integer("feature_snapshot_id").notNull().references(() => mlbFeatureSnapshotsTable.id),
  gameId: text("game_id").notNull().references(() => gamesTable.id),
  teamSide: text("team_side").notNull(),
  weightedPitches: real("weighted_pitches"),
  fatigueState: text("fatigue_state"),
  relievers: jsonb("relievers").notNull(),
  unsupportedFeatures: jsonb("unsupported_features").notNull(),
  qualityState: text("quality_state").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  rawPayloadHash: text("raw_payload_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("mlb_bullpen_pregame_identity_idx").on(t.featureSnapshotId, t.teamSide)]);

export const mlbBullpenOutcomesTable = pgTable("mlb_bullpen_outcomes", {
  id: serial("id").primaryKey(),
  gameId: text("game_id").notNull().references(() => gamesTable.id),
  teamSide: text("team_side").notNull(),
  inningsPitched: real("innings_pitched"),
  runsAllowed: integer("runs_allowed"),
  earnedRuns: integer("earned_runs"),
  hits: integer("hits"), walks: integer("walks"), strikeouts: integer("strikeouts"),
  homeRunsAllowed: integer("home_runs_allowed"), pitchCount: integer("pitch_count"),
  relievers: jsonb("relievers").notNull(),
  projectedInnings: real("projected_innings"), projectedRunsAllowed: real("projected_runs_allowed"),
  inningsResidual: real("innings_residual"), runsResidual: real("runs_residual"),
  source: text("source").notNull(), qualityState: text("quality_state").notNull(),
  rawPayloadHash: text("raw_payload_hash"), capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("mlb_bullpen_outcome_identity_idx").on(t.gameId, t.teamSide, t.rawPayloadHash)]);

export const mlbContextSnapshotsTable = pgTable("mlb_context_snapshots", {
  id: serial("id").primaryKey(),
  featureSnapshotId: integer("feature_snapshot_id").notNull().references(() => mlbFeatureSnapshotsTable.id),
  gameId: text("game_id").notNull().references(() => gamesTable.id),
  venue: text("venue"), parkId: text("park_id"), parkFactor: real("park_factor"),
  parkFactorVersion: text("park_factor_version"), parkQualityState: text("park_quality_state").notNull(),
  parkFallbackUsed: boolean("park_fallback_used").notNull().default(false), parkFallbackValue: real("park_fallback_value"),
  weather: jsonb("weather").notNull(), weatherQualityState: text("weather_quality_state").notNull(),
  context: jsonb("context").notNull(), retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }), rawPayloadHash: text("raw_payload_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("mlb_context_snapshot_identity_idx").on(t.featureSnapshotId, t.rawPayloadHash)]);

export const mlbMarketSnapshotsTable = pgTable("mlb_market_snapshots", {
  id: serial("id").primaryKey(),
  gameId: text("game_id").notNull().references(() => gamesTable.id),
  sportsbook: text("sportsbook").notNull(), state: text("state").notNull(),
  homeOdds: integer("home_odds"), awayOdds: integer("away_odds"),
  noVigHomeProbability: real("no_vig_home_probability"), noVigAwayProbability: real("no_vig_away_probability"),
  isConsensus: boolean("is_consensus").notNull().default(false), isPinnacle: boolean("is_pinnacle").notNull().default(false),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  pointInTimeCutoff: timestamp("point_in_time_cutoff", { withTimezone: true }),
  source: text("source").notNull(), qualityState: text("quality_state").notNull(),
  rawPayloadHash: text("raw_payload_hash"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_market_snapshot_identity_idx").on(t.gameId, t.sportsbook, t.capturedAt, t.rawPayloadHash),
  index("mlb_market_snapshot_game_time_idx").on(t.gameId, t.capturedAt),
]);

export const mlbForecastEvidenceTable = pgTable("mlb_forecast_evidence", {
  id: serial("id").primaryKey(),
  predictionId: integer("prediction_id").references(() => modelPredictionsTable.id),
  featureSnapshotId: integer("feature_snapshot_id").notNull().references(() => mlbFeatureSnapshotsTable.id),
  gameId: text("game_id").notNull().references(() => gamesTable.id),
  modelId: text("model_id").notNull(), modelVersion: text("model_version").notNull(),
  configHash: text("config_hash").notNull(), calibrationVersion: text("calibration_version"),
  pointInTimeCutoff: timestamp("point_in_time_cutoff", { withTimezone: true }).notNull(),
  forecast: jsonb("forecast").notNull(), contributions: jsonb("contributions").notNull(),
  dataQuality: real("data_quality"), uncertainty: real("uncertainty"),
  cohort: text("cohort").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_forecast_evidence_identity_idx").on(t.gameId, t.modelId, t.modelVersion, t.featureSnapshotId, t.configHash),
  index("mlb_forecast_evidence_cohort_idx").on(t.cohort, t.createdAt),
]);

export const mlbForecastEvaluationsTable = pgTable("mlb_forecast_evaluations", {
  id: serial("id").primaryKey(),
  forecastEvidenceId: integer("forecast_evidence_id").notNull().references(() => mlbForecastEvidenceTable.id),
  gameId: text("game_id").notNull().references(() => gamesTable.id),
  outcome: jsonb("outcome").notNull(), residuals: jsonb("residuals").notNull(),
  brierScore: real("brier_score"), logLoss: real("log_loss"), marketBrierScore: real("market_brier_score"),
  brierSkill: real("brier_skill"), probabilityError: real("probability_error"), calibrationBucket: text("calibration_bucket"),
  marketEvaluation: jsonb("market_evaluation").notNull(), evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("mlb_forecast_evaluation_evidence_idx").on(t.forecastEvidenceId)]);

export const mlbResearchLearningEvidenceTable = pgTable("mlb_research_learning_evidence", {
  id: serial("id").primaryKey(),
  forecastEvidenceId: integer("forecast_evidence_id").notNull().references(() => mlbForecastEvidenceTable.id),
  evaluationId: integer("evaluation_id").notNull().references(() => mlbForecastEvaluationsTable.id),
  gameId: text("game_id").notNull().references(() => gamesTable.id),
  cohort: text("cohort").notNull(), evidence: jsonb("evidence").notNull(),
  isolationState: text("isolation_state").notNull().default("RESEARCH_ONLY"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("mlb_research_learning_evidence_evaluation_idx").on(t.evaluationId)]);

export const mlbFeatureStatusRegistryTable = pgTable("mlb_feature_status_registry", {
  id: serial("id").primaryKey(), featureName: text("feature_name").notNull(), status: text("status").notNull(),
  schemaVersion: text("schema_version").notNull().default(MLB_PIT_SCHEMA_VERSION),
  notes: text("notes").notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("mlb_feature_status_registry_name_idx").on(t.featureName, t.schemaVersion)]);

/**
 * #214 provider-neutral, append-only research evidence.  This is deliberately
 * separate from the canonical #213 feature snapshot and from every production
 * model input.  `values` contains only adapter-validated provider fields; a
 * missing provider field is absent/null, never represented as zero.
 */
export const mlbAdvancedResearchEvidenceTable = pgTable("mlb_advanced_research_evidence", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull(),
  domain: text("domain").notNull(),
  provider: text("provider").notNull(),
  providerRecordId: text("provider_record_id"),
  providerEventId: text("provider_event_id"),
  gameId: text("game_id").references(() => gamesTable.id),
  canonicalPlayerId: integer("canonical_player_id").references(() => playersTable.id),
  providerPlayerId: text("provider_player_id"),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  statThroughAt: timestamp("stat_through_at", { withTimezone: true }),
  pointInTimeCutoff: timestamp("point_in_time_cutoff", { withTimezone: true }).notNull(),
  payloadHash: text("payload_hash").notNull(),
  qualityState: text("quality_state").notNull(),
  sampleReliability: text("sample_reliability").notNull(),
  historicalAvailability: text("historical_availability").notNull(),
  modelUsageStatus: text("model_usage_status").notNull().default("CAPTURED_RESEARCH_ONLY"),
  values: jsonb("values").notNull(),
  leakageMetadata: jsonb("leakage_metadata").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_advanced_research_evidence_identity_idx").on(t.schemaVersion, t.provider, t.domain, t.payloadHash),
  index("mlb_advanced_research_evidence_game_cutoff_idx").on(t.gameId, t.pointInTimeCutoff),
  index("mlb_advanced_research_evidence_player_idx").on(t.canonicalPlayerId, t.domain),
]);

/** Immutable advanced snapshot linked to a #213 canonical revision, if any. */
export const mlbAdvancedFeatureSnapshotsTable = pgTable("mlb_advanced_feature_snapshots", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull(),
  gameId: text("game_id").notNull().references(() => gamesTable.id),
  canonicalFeatureSnapshotId: integer("canonical_feature_snapshot_id").references(() => mlbFeatureSnapshotsTable.id),
  revisionState: text("revision_state").notNull(), // EARLY | UPDATED | FINAL_PREGAME
  pointInTimeCutoff: timestamp("point_in_time_cutoff", { withTimezone: true }).notNull(),
  gameStartTime: timestamp("game_start_time", { withTimezone: true }).notNull(),
  evidenceHashes: jsonb("evidence_hashes").notNull(),
  features: jsonb("features").notNull(),
  quality: jsonb("quality").notNull(),
  sampleReliability: jsonb("sample_reliability").notNull(),
  leakageMetadata: jsonb("leakage_metadata").notNull(),
  modelUsageStatus: text("model_usage_status").notNull().default("CAPTURED_RESEARCH_ONLY"),
  inputHash: text("input_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_advanced_feature_snapshot_identity_idx").on(t.schemaVersion, t.gameId, t.revisionState, t.inputHash),
  index("mlb_advanced_feature_snapshot_game_cutoff_idx").on(t.gameId, t.pointInTimeCutoff),
]);

export const mlbOosCohortsTable = pgTable("mlb_oos_cohorts", {
  id: serial("id").primaryKey(), gameId: text("game_id").notNull().references(() => gamesTable.id),
  cohort: text("cohort").notNull(), assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull(),
  assignmentReason: text("assignment_reason").notNull(), immutable: boolean("immutable").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("mlb_oos_cohort_game_idx").on(t.gameId, t.cohort), index("mlb_oos_cohort_lookup_idx").on(t.cohort, t.assignedAt)]);