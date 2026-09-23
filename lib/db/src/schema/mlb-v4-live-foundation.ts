import { sql } from "drizzle-orm";
import {
  boolean, check, doublePrecision, index, integer, jsonb, pgTable, text,
  timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

export const MLB_V4_LIVE_SCHEMA_VERSION = "mlb-v4-live-foundation-v1";

const immutable = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  artifactHash: text("artifact_hash").notNull(),
};

export const mlbV4CollectionRunsTable = pgTable("mlb_v4_collection_runs", {
  runId: text("run_id").primaryKey(),
  logicalRunId: text("logical_run_id").notNull(),
  retryOfRunId: text("retry_of_run_id"),
  collectorName: text("collector_name").notNull(),
  collectorVersion: text("collector_version").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  executionDate: text("execution_date").notNull(),
  timezone: text("timezone").notNull(),
  source: text("source").notNull(),
  requestCount: integer("request_count").notNull(),
  scheduledGamesDiscovered: integer("scheduled_games_discovered").notNull(),
  gamesProcessed: integer("games_processed").notNull(),
  starterSlotsExpected: integer("starter_slots_expected").notNull(),
  starterSlotsObserved: integer("starter_slots_observed").notNull(),
  starterSlotsInserted: integer("starter_slots_inserted").notNull(),
  starterSlotsUnchanged: integer("starter_slots_unchanged").notNull(),
  starterSlotsRejected: integer("starter_slots_rejected").notNull(),
  sourceErrors: integer("source_errors").notNull(),
  timeouts: integer("timeouts").notNull(),
  rateLimitEvents: integer("rate_limit_events").notNull(),
  status: text("status").notNull(),
  errorSummary: text("error_summary"),
  ...immutable,
}, (t) => [
  index("mlb_v4_collection_runs_execution_idx").on(t.executionDate, t.startedAt),
  index("mlb_v4_collection_runs_logical_idx").on(t.logicalRunId),
  check("mlb_v4_collection_runs_nonnegative", sql`${t.requestCount} >= 0 AND ${t.gamesProcessed} >= 0`),
]);

/** Append-only lifecycle ledger, persisted before every provider request. */
export const mlbV4CollectionRunEventsTable = pgTable("mlb_v4_collection_run_events", {
  eventId: text("event_id").primaryKey(),
  runId: text("run_id").notNull(),
  logicalRunId: text("logical_run_id").notNull(),
  eventType: text("event_type").notNull(), // STARTED | COMPLETED | PARTIAL | FAILED
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  retryOfRunId: text("retry_of_run_id"),
  detail: jsonb("detail").notNull(),
  ...immutable,
}, (t) => [
  uniqueIndex("mlb_v4_collection_event_identity_idx").on(t.runId, t.eventType),
  index("mlb_v4_collection_event_logical_idx").on(t.logicalRunId, t.occurredAt),
]);

export const mlbV4GameDiscoveriesTable = pgTable("mlb_v4_game_discoveries", {
  discoveryId: text("discovery_id").primaryKey(),
  runId: text("run_id").notNull(),
  // Nullable for legacy discoveries; new rows link to the durable STARTED event.
  collectionEventId: text("collection_event_id").references(() => mlbV4CollectionRunEventsTable.eventId),
  gameId: text("game_id").notNull(),
  gameDate: text("game_date").notNull(),
  scheduledFirstPitch: timestamp("scheduled_first_pitch", { withTimezone: true }).notNull(),
  homeTeamId: text("home_team_id").notNull(),
  awayTeamId: text("away_team_id").notNull(),
  gameStatus: text("game_status").notNull(),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
  sourceRecordId: text("source_record_id").notNull(),
  rawPayloadHash: text("raw_payload_hash").notNull(),
  eligibleForPregameCapture: boolean("eligible_for_pregame_capture").notNull(),
  reasonNotEligible: text("reason_not_eligible"),
  ...immutable,
}, (t) => [
  uniqueIndex("mlb_v4_discovery_run_game_idx").on(t.runId, t.gameId),
  index("mlb_v4_discovery_game_idx").on(t.gameId, t.discoveredAt),
]);

export const mlbV4StarterStatesTable = pgTable("mlb_v4_starter_pit_states", {
  stateId: text("state_id").primaryKey(),
  starterSnapshotId: integer("starter_snapshot_id").notNull(),
  gameId: text("game_id").notNull(),
  teamId: text("team_id").notNull(),
  pitcherId: text("pitcher_id").notNull(),
  featureCutoff: timestamp("feature_cutoff", { withTimezone: true }).notNull(),
  stateSchemaVersion: text("state_schema_version").notNull(),
  sourceFoundation: text("source_foundation").notNull(),
  sourceCutoff: timestamp("source_cutoff", { withTimezone: true }),
  role: text("role").notNull(),
  features: jsonb("features").notNull(),
  sampleSizes: jsonb("sample_sizes").notNull(),
  missingness: jsonb("missingness").notNull(),
  rookie: boolean("rookie").notNull(),
  ...immutable,
}, (t) => [
  uniqueIndex("mlb_v4_starter_state_snapshot_idx").on(t.starterSnapshotId, t.stateSchemaVersion),
  check("mlb_v4_starter_state_chronology", sql`${t.sourceCutoff} IS NULL OR ${t.sourceCutoff} < ${t.featureCutoff}`),
]);

export const mlbV4TeamStatesTable = pgTable("mlb_v4_team_pit_states", {
  stateId: text("state_id").primaryKey(),
  gameId: text("game_id").notNull(),
  teamId: text("team_id").notNull(),
  stateKind: text("state_kind").notNull(), // OFFENSE | BULLPEN
  teamSide: text("team_side").notNull(),
  appliesToOffenseTeamId: text("applies_to_offense_team_id").notNull(),
  featureCutoff: timestamp("feature_cutoff", { withTimezone: true }).notNull(),
  sourceCutoff: timestamp("source_cutoff", { withTimezone: true }),
  stateSchemaVersion: text("state_schema_version").notNull(),
  features: jsonb("features").notNull(),
  sampleSizes: jsonb("sample_sizes").notNull(),
  missingness: jsonb("missingness").notNull(),
  ...immutable,
}, (t) => [
  uniqueIndex("mlb_v4_team_state_identity_idx").on(t.gameId, t.teamId, t.stateKind, t.featureCutoff, t.artifactHash),
  check("mlb_v4_team_state_chronology", sql`${t.sourceCutoff} IS NULL OR ${t.sourceCutoff} < ${t.featureCutoff}`),
]);

export const mlbV4ContextStatesTable = pgTable("mlb_v4_context_states", {
  stateId: text("state_id").primaryKey(),
  gameId: text("game_id").notNull(),
  featureCutoff: timestamp("feature_cutoff", { withTimezone: true }).notNull(),
  sourceCutoff: timestamp("source_cutoff", { withTimezone: true }),
  schemaVersion: text("schema_version").notNull(),
  league: jsonb("league").notNull(),
  home: jsonb("home").notNull(),
  park: jsonb("park").notNull(),
  sampleSizes: jsonb("sample_sizes").notNull(),
  missingness: jsonb("missingness").notNull(),
  ...immutable,
}, (t) => [check("mlb_v4_context_chronology", sql`${t.sourceCutoff} IS NULL OR ${t.sourceCutoff} < ${t.featureCutoff}`)]);

export const mlbV4PregameFeaturesTable = pgTable("mlb_v4_pregame_feature_snapshots", {
  snapshotId: text("snapshot_id").primaryKey(),
  gameId: text("game_id").notNull(),
  scheduledFirstPitch: timestamp("scheduled_first_pitch", { withTimezone: true }).notNull(),
  featureCutoff: timestamp("feature_cutoff", { withTimezone: true }).notNull(),
  schemaVersion: text("schema_version").notNull(),
  evidenceTier: text("evidence_tier").notNull(),
  componentIds: jsonb("component_ids").notNull(),
  componentHashes: jsonb("component_hashes").notNull(),
  features: jsonb("features").notNull(),
  sampleSizes: jsonb("sample_sizes").notNull(),
  missingness: jsonb("missingness").notNull(),
  pitSafe: boolean("pit_safe").notNull(),
  baselineCoreEligible: boolean("baseline_core_eligible").notNull(),
  starterCoreEligible: boolean("starter_core_eligible").notNull(),
  enhancedEligible: boolean("enhanced_eligible").notNull(),
  ...immutable,
}, (t) => [
  uniqueIndex("mlb_v4_feature_semantic_idx").on(t.gameId, t.featureCutoff, t.artifactHash),
  check("mlb_v4_feature_before_pitch", sql`${t.featureCutoff} < ${t.scheduledFirstPitch}`),
]);

export const mlbV4GameOutcomesTable = pgTable("mlb_v4_game_outcomes", {
  outcomeId: text("outcome_id").primaryKey(), gameId: text("game_id").notNull(),
  finalStatus: text("final_status").notNull(), homeRuns: integer("home_runs").notNull(),
  awayRuns: integer("away_runs").notNull(), totalRuns: integer("total_runs").notNull(),
  margin: integer("margin").notNull(), winner: text("winner").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  outcomeSource: text("outcome_source").notNull(), rawPayloadHash: text("raw_payload_hash").notNull(),
  outcomeSchemaVersion: text("outcome_schema_version").notNull(), ...immutable,
}, (t) => [uniqueIndex("mlb_v4_game_outcome_semantic_idx").on(t.gameId, t.rawPayloadHash)]);

export const mlbV4StarterOutcomesTable = pgTable("mlb_v4_starter_outcomes", {
  outcomeId: text("outcome_id").primaryKey(), gameId: text("game_id").notNull(),
  teamId: text("team_id").notNull(), actualStarterId: text("actual_starter_id").notNull(),
  actualStarterName: text("actual_starter_name"), innings: doublePrecision("innings"),
  battersFaced: integer("batters_faced"), pitchCount: integer("pitch_count"),
  runs: integer("runs"), earnedRuns: integer("earned_runs"), hits: integer("hits"),
  walks: integer("walks"), strikeouts: integer("strikeouts"), homeRunsAllowed: integer("home_runs_allowed"),
  agreement: text("agreement").notNull(), outcomeSource: text("outcome_source").notNull(),
  rawPayloadHash: text("raw_payload_hash").notNull(), ...immutable,
}, (t) => [uniqueIndex("mlb_v4_starter_outcome_semantic_idx").on(t.gameId, t.teamId, t.rawPayloadHash)]);

export const mlbV4BullpenOutcomesTable = pgTable("mlb_v4_bullpen_outcomes", {
  outcomeId: text("outcome_id").primaryKey(), gameId: text("game_id").notNull(), teamId: text("team_id").notNull(),
  innings: doublePrecision("innings"), runsAllowed: integer("runs_allowed"), earnedRuns: integer("earned_runs"),
  hits: integer("hits"), walks: integer("walks"), strikeouts: integer("strikeouts"), homeRuns: integer("home_runs"),
  outcomeSource: text("outcome_source").notNull(), rawPayloadHash: text("raw_payload_hash").notNull(), ...immutable,
}, (t) => [uniqueIndex("mlb_v4_bullpen_outcome_semantic_idx").on(t.gameId, t.teamId, t.rawPayloadHash)]);

export const mlbV4EvidencePairsTable = pgTable("mlb_v4_evidence_pairs", {
  pairId: text("pair_id").primaryKey(), gameId: text("game_id").notNull(),
  featureSnapshotId: text("feature_snapshot_id").notNull(), gameOutcomeId: text("game_outcome_id").notNull(),
  starterOutcomeIds: jsonb("starter_outcome_ids").notNull(), bullpenOutcomeIds: jsonb("bullpen_outcome_ids").notNull(),
  starterAgreement: jsonb("starter_agreement").notNull(), evidenceTier: text("evidence_tier").notNull(),
  pitSafe: boolean("pit_safe").notNull(), starterSafe: boolean("starter_safe").notNull(),
  outcomeComplete: boolean("outcome_complete").notNull(), baselineCoreEligible: boolean("baseline_core_eligible").notNull(),
  starterCoreEligible: boolean("starter_core_eligible").notNull(), enhancedEligible: boolean("enhanced_eligible").notNull(),
  ineligibilityReasons: jsonb("ineligibility_reasons").notNull(), qualityStatus: text("quality_status").notNull(), ...immutable,
}, (t) => [uniqueIndex("mlb_v4_pair_identity_idx").on(t.featureSnapshotId, t.gameOutcomeId)]);

export const mlbV4ShadowForecastsTable = pgTable("mlb_v4_shadow_forecasts", {
  forecastId: text("forecast_id").primaryKey(), modelId: text("model_id").notNull(), modelVersion: text("model_version").notNull(),
  modelHash: text("model_hash").notNull(), gameId: text("game_id").notNull(),
  forecastGeneratedAt: timestamp("forecast_generated_at", { withTimezone: true }).notNull(),
  featureSnapshotId: text("feature_snapshot_id").notNull(), featureHash: text("feature_hash").notNull(),
  homeExpectedRunsExact: doublePrecision("home_expected_runs_exact").notNull(),
  awayExpectedRunsExact: doublePrecision("away_expected_runs_exact").notNull(),
  projectedTotalExact: doublePrecision("projected_total_exact").notNull(),
  projectedMarginExact: doublePrecision("projected_margin_exact").notNull(),
  homeWinProbability: doublePrecision("home_win_probability").notNull(),
  awayWinProbability: doublePrecision("away_win_probability").notNull(),
  fairHomeMoneyline: doublePrecision("fair_home_moneyline").notNull(),
  fairAwayMoneyline: doublePrecision("fair_away_moneyline").notNull(),
  distributionVersion: text("distribution_version").notNull(), calibrationVersion: text("calibration_version").notNull(),
  approvalStatus: text("approval_status").notNull(), maturityStatus: text("maturity_status").notNull(),
  publicationStatus: text("publication_status").notNull(), ...immutable,
}, (t) => [uniqueIndex("mlb_v4_forecast_identity_idx").on(t.modelHash, t.featureSnapshotId, t.artifactHash)]);

export const mlbV4MarketSnapshotsTable = pgTable("mlb_v4_market_snapshots", {
  marketSnapshotId: text("market_snapshot_id").primaryKey(), forecastId: text("forecast_id").notNull(),
  sportsbook: text("sportsbook").notNull(), market: text("market").notNull(), side: text("side").notNull(),
  price: doublePrecision("price").notNull(), line: doublePrecision("line"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  marketImpliedProbability: doublePrecision("market_implied_probability").notNull(), rawPayloadHash: text("raw_payload_hash").notNull(),
  ...immutable,
});

export const mlbV4EvaluationsTable = pgTable("mlb_v4_forecast_evaluations", {
  evaluationId: text("evaluation_id").primaryKey(), forecastId: text("forecast_id").notNull(),
  outcomeId: text("outcome_id").notNull(), metrics: jsonb("metrics").notNull(), calibrationBucket: text("calibration_bucket"),
  marketComparison: jsonb("market_comparison").notNull(), clv: jsonb("clv").notNull(),
  betResult: text("bet_result"), units: doublePrecision("units"), biasDimensions: jsonb("bias_dimensions").notNull(), ...immutable,
}, (t) => [uniqueIndex("mlb_v4_evaluation_identity_idx").on(t.forecastId, t.outcomeId)]);

export const mlbV4ModelRegistryTable = pgTable("mlb_v4_model_registry", {
  registryId: text("registry_id").primaryKey(), modelId: text("model_id").notNull(), version: text("version").notNull(),
  family: text("family").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  trainingArtifact: text("training_artifact").notNull(), featureSchema: text("feature_schema").notNull(),
  parameterHash: text("parameter_hash").notNull(), modelHash: text("model_hash").notNull(),
  approvalStatus: text("approval_status").notNull(), maturity: text("maturity").notNull(),
  championChallengerState: text("champion_challenger_state").notNull(),
  promotionTimestamp: timestamp("promotion_timestamp", { withTimezone: true }),
  retirementTimestamp: timestamp("retirement_timestamp", { withTimezone: true }), reason: text("reason").notNull(),
  publicationPermitted: boolean("publication_permitted").notNull(), artifactHash: text("artifact_hash").notNull(),
}, (t) => [uniqueIndex("mlb_v4_registry_model_version_idx").on(t.modelId, t.version)]);