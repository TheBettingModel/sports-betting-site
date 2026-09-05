import {
  boolean,
  date,
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
 * Historical MLB reconstruction ledger. These tables are additive research
 * artifacts only: they are not production predictions and must never be read
 * by the current MLB champion.
 */
export const MLB_HISTORICAL_SCHEMA_VERSION = "mlb-chronological-team-game-v1";
export const MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION = "mlb-completion-chronology-v2";
export const MLB_HISTORICAL_CHRONOLOGY_V3_SCHEMA_VERSION = "mlb-completion-chronology-v3";

export const mlbHistoricalArtifactsTable = pgTable("mlb_historical_artifacts", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(MLB_HISTORICAL_SCHEMA_VERSION),
  artifactKey: text("artifact_key").notNull(),
  sourceManifest: jsonb("source_manifest").notNull(),
  sourceManifestHash: text("source_manifest_hash").notNull(),
  foundationChecksum: text("foundation_checksum").notNull(),
  replayChecksum: text("replay_checksum").notNull(),
  retrievalCutoff: timestamp("retrieval_cutoff", { withTimezone: true }).notNull(),
  status: text("status").notNull(),
  sealedAt: timestamp("sealed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_historical_artifact_key_idx").on(t.schemaVersion, t.artifactKey),
  uniqueIndex("mlb_historical_artifact_source_hash_idx").on(t.schemaVersion, t.sourceManifestHash),
]);

export const mlbHistoricalGamesTable = pgTable("mlb_historical_games", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(MLB_HISTORICAL_SCHEMA_VERSION),
  canonicalGameId: text("canonical_game_id").notNull(),
  provider: text("provider").notNull(),
  providerGameId: text("provider_game_id").notNull(),
  season: integer("season").notNull(),
  gameType: text("game_type").notNull(),
  gameDate: timestamp("game_date", { withTimezone: true }).notNull(),
  scheduledFirstPitch: timestamp("scheduled_first_pitch", { withTimezone: true }).notNull(),
  actualStartTime: timestamp("actual_start_time", { withTimezone: true }),
  completionTime: timestamp("completion_time", { withTimezone: true }),
  homeProviderTeamId: text("home_provider_team_id").notNull(),
  awayProviderTeamId: text("away_provider_team_id").notNull(),
  homeTeamName: text("home_team_name").notNull(),
  awayTeamName: text("away_team_name").notNull(),
  venueProviderId: text("venue_provider_id"),
  venueName: text("venue_name"),
  homeStarterProviderPlayerId: text("home_starter_provider_player_id"),
  awayStarterProviderPlayerId: text("away_starter_provider_player_id"),
  homeStarterName: text("home_starter_name"),
  awayStarterName: text("away_starter_name"),
  homeStarterState: text("home_starter_state").notNull().default("UNKNOWN"),
  awayStarterState: text("away_starter_state").notNull().default("UNKNOWN"),
  homeRuns: integer("home_runs"),
  awayRuns: integer("away_runs"),
  inningsPlayed: integer("innings_played"),
  gameStatus: text("game_status").notNull(),
  gameNumber: integer("game_number"),
  doubleheaderStatus: text("doubleheader_status").notNull(),
  postseason: boolean("postseason").notNull().default(false),
  neutralSite: boolean("neutral_site").notNull().default(false),
  suspended: boolean("suspended").notNull().default(false),
  resumed: boolean("resumed").notNull().default(false),
  outcomeEligible: boolean("outcome_eligible").notNull().default(false),
  sourcePayloadHash: text("source_payload_hash").notNull(),
  sourceRetrievedAt: timestamp("source_retrieved_at", { withTimezone: true }).notNull(),
  provenance: jsonb("provenance").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_historical_game_provider_identity_idx").on(t.schemaVersion, t.provider, t.providerGameId),
  uniqueIndex("mlb_historical_game_canonical_identity_idx").on(t.schemaVersion, t.canonicalGameId),
  index("mlb_historical_game_chronology_idx").on(t.season, t.scheduledFirstPitch, t.providerGameId),
]);

export const mlbHistoricalTeamIdentityTable = pgTable("mlb_historical_team_identity", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(MLB_HISTORICAL_SCHEMA_VERSION),
  provider: text("provider").notNull(),
  providerTeamId: text("provider_team_id").notNull(),
  season: integer("season").notNull(),
  canonicalTeamId: text("canonical_team_id").notNull(),
  franchiseId: text("franchise_id").notNull(),
  abbreviation: text("abbreviation"),
  providerName: text("provider_name").notNull(),
  resolutionState: text("resolution_state").notNull(),
  resolutionRule: text("resolution_rule").notNull(),
  sourcePayloadHash: text("source_payload_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_historical_team_provider_identity_idx").on(t.schemaVersion, t.provider, t.providerTeamId, t.season),
  index("mlb_historical_team_canonical_idx").on(t.canonicalTeamId, t.season),
]);

export const mlbHistoricalTeamGameRowsTable = pgTable("mlb_historical_team_game_rows", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(MLB_HISTORICAL_SCHEMA_VERSION),
  artifactKey: text("artifact_key").notNull(),
  canonicalGameId: text("canonical_game_id").notNull(),
  providerGameId: text("provider_game_id").notNull(),
  season: integer("season").notNull(),
  teamSide: text("team_side").notNull(),
  canonicalTeamId: text("canonical_team_id").notNull(),
  opponentCanonicalTeamId: text("opponent_canonical_team_id").notNull(),
  scheduledFirstPitch: timestamp("scheduled_first_pitch", { withTimezone: true }).notNull(),
  featureCutoff: timestamp("feature_cutoff", { withTimezone: true }),
  starterState: text("starter_state").notNull(),
  lineupState: text("lineup_state").notNull(),
  completionBoundaryState: text("completion_boundary_state").notNull().default("UNVERIFIED"),
  eligibilityState: text("eligibility_state").notNull(),
  /** Deprecated compatibility field. Historical outcomes live in the separate outcome ledger. */
  targets: jsonb("targets").notNull(),
  coreFeatures: jsonb("core_features").notNull(),
  enhancedFeatures: jsonb("enhanced_features").notNull(),
  missingness: jsonb("missingness").notNull(),
  sourceVersions: jsonb("source_versions").notNull(),
  sourceHashes: jsonb("source_hashes").notNull(),
  pitLineage: jsonb("pit_lineage").notNull(),
  quality: jsonb("quality").notNull(),
  checksum: text("checksum").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_historical_team_game_identity_idx").on(
    t.schemaVersion, t.artifactKey, t.canonicalGameId, t.teamSide,
  ),
  index("mlb_historical_team_game_chronology_idx").on(t.season, t.scheduledFirstPitch, t.providerGameId),
  index("mlb_historical_team_game_eligibility_idx").on(t.eligibilityState, t.season),
  index("mlb_historical_team_game_checksum_idx").on(t.checksum),
]);

export const mlbHistoricalOutcomesTable = pgTable("mlb_historical_outcomes", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(MLB_HISTORICAL_SCHEMA_VERSION),
  artifactKey: text("artifact_key").notNull(),
  canonicalGameId: text("canonical_game_id").notNull(),
  providerGameId: text("provider_game_id").notNull(),
  season: integer("season").notNull(),
  homeRuns: integer("home_runs").notNull(),
  awayRuns: integer("away_runs").notNull(),
  winnerSide: text("winner_side").notNull(),
  runDifference: integer("run_difference").notNull(),
  gameTotal: integer("game_total").notNull(),
  inningsPlayed: integer("innings_played"),
  extraInnings: boolean("extra_innings").notNull(),
  settlementStatus: text("settlement_status").notNull(),
  completionTime: timestamp("completion_time", { withTimezone: true }),
  completionBoundaryState: text("completion_boundary_state").notNull(),
  sourcePayloadHash: text("source_payload_hash").notNull(),
  outcomeHash: text("outcome_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_historical_outcome_game_idx").on(t.schemaVersion, t.artifactKey, t.canonicalGameId),
  index("mlb_historical_outcome_season_idx").on(t.season, t.providerGameId),
]);

export const mlbHistoricalCompletionEvidenceTable = pgTable("mlb_historical_completion_evidence", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION),
  artifactKey: text("artifact_key").notNull(),
  canonicalGameId: text("canonical_game_id").notNull(),
  provider: text("provider").notNull(),
  providerGameId: text("provider_game_id").notNull(),
  endpoint: text("endpoint").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  scheduledStartTime: timestamp("scheduled_start_time", { withTimezone: true }).notNull(),
  actualStartTime: timestamp("actual_start_time", { withTimezone: true }),
  firstPlayStartTime: timestamp("first_play_start_time", { withTimezone: true }),
  lastPlayStartTime: timestamp("last_play_start_time", { withTimezone: true }),
  lastPlayEndTime: timestamp("last_play_end_time", { withTimezone: true }),
  gameEndTime: timestamp("game_end_time", { withTimezone: true }),
  finalStatusTime: timestamp("final_status_time", { withTimezone: true }),
  providerFinalSeenAt: timestamp("provider_final_seen_at", { withTimezone: true }).notNull(),
  canonicalCompletionTime: timestamp("canonical_completion_time", { withTimezone: true }),
  completionTimeSource: text("completion_time_source").notNull(),
  completionTimeMethod: text("completion_time_method").notNull(),
  completionTimeConfidence: text("completion_time_confidence").notNull(),
  completionTimePrecision: text("completion_time_precision").notNull(),
  featureCutoff: timestamp("feature_cutoff", { withTimezone: true }),
  featureCutoffSource: text("feature_cutoff_source").notNull(),
  featureCutoffConfidence: text("feature_cutoff_confidence").notNull(),
  completionDateEt: date("completion_date_et"),
  gameStatus: text("game_status").notNull(),
  statusCode: text("status_code").notNull(),
  finalStatus: boolean("final_status").notNull(),
  terminalPlayComplete: boolean("terminal_play_complete").notNull(),
  playCount: integer("play_count").notNull(),
  inningsPlayed: integer("innings_played"),
  gameNumber: integer("game_number"),
  doubleheaderStatus: text("doubleheader_status"),
  postponed: boolean("postponed").notNull(),
  suspended: boolean("suspended").notNull(),
  resumed: boolean("resumed").notNull(),
  crossedMidnightUtc: boolean("crossed_midnight_utc").notNull(),
  quarantineReason: text("quarantine_reason"),
  evidencePayload: jsonb("evidence_payload").notNull(),
  rawPayloadHash: text("raw_payload_hash").notNull(),
  evidenceHash: text("evidence_hash").notNull(),
  resolverVersion: text("resolver_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_historical_completion_game_idx").on(
    t.schemaVersion, t.artifactKey, t.canonicalGameId,
  ),
  uniqueIndex("mlb_historical_completion_provider_idx").on(
    t.schemaVersion, t.artifactKey, t.provider, t.providerGameId,
  ),
  index("mlb_historical_completion_time_idx").on(
    t.schemaVersion, t.artifactKey, t.canonicalCompletionTime,
  ),
]);

export const mlbHistoricalRawCompletionSnapshotsTable = pgTable("mlb_historical_raw_completion_snapshots", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(MLB_HISTORICAL_CHRONOLOGY_V3_SCHEMA_VERSION),
  artifactKey: text("artifact_key").notNull(),
  canonicalGameId: text("canonical_game_id").notNull(),
  provider: text("provider").notNull(),
  providerGameId: text("provider_game_id").notNull(),
  endpoint: text("endpoint").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  httpStatus: integer("http_status").notNull(),
  contentType: text("content_type"),
  rawBody: text("raw_body").notNull(),
  rawBodyHash: text("raw_body_hash").notNull(),
  byteLength: integer("byte_length").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_historical_raw_completion_game_idx").on(
    t.schemaVersion, t.artifactKey, t.canonicalGameId,
  ),
  uniqueIndex("mlb_historical_raw_completion_hash_idx").on(
    t.schemaVersion, t.artifactKey, t.rawBodyHash,
  ),
  index("mlb_historical_raw_completion_provider_idx").on(
    t.schemaVersion, t.artifactKey, t.providerGameId,
  ),
]);

export const mlbHistoricalChronologyDecisionsTable = pgTable("mlb_historical_chronology_decisions", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION),
  artifactKey: text("artifact_key").notNull(),
  canonicalGameId: text("canonical_game_id").notNull(),
  providerGameId: text("provider_game_id").notNull(),
  season: integer("season").notNull(),
  featureCutoff: timestamp("feature_cutoff", { withTimezone: true }),
  featureCutoffSource: text("feature_cutoff_source").notNull(),
  eligiblePriorGameCount: integer("eligible_prior_game_count").notNull(),
  eligiblePriorGameIdsHash: text("eligible_prior_game_ids_hash").notNull(),
  homePriorGameCount: integer("home_prior_game_count").notNull(),
  homePriorGameIdsHash: text("home_prior_game_ids_hash").notNull(),
  awayPriorGameCount: integer("away_prior_game_count").notNull(),
  awayPriorGameIdsHash: text("away_prior_game_ids_hash").notNull(),
  sameDayDecisions: jsonb("same_day_decisions").notNull(),
  deniedReasonCounts: jsonb("denied_reason_counts").notNull(),
  decisionRule: text("decision_rule").notNull(),
  decisionHash: text("decision_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_historical_chronology_decision_game_idx").on(
    t.schemaVersion, t.artifactKey, t.canonicalGameId,
  ),
  index("mlb_historical_chronology_decision_season_idx").on(
    t.schemaVersion, t.artifactKey, t.season,
  ),
]);

export const mlbHistoricalExclusionsTable = pgTable("mlb_historical_exclusions", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(MLB_HISTORICAL_SCHEMA_VERSION),
  artifactKey: text("artifact_key").notNull(),
  provider: text("provider").notNull(),
  providerGameId: text("provider_game_id").notNull(),
  season: integer("season"),
  reasonCode: text("reason_code").notNull(),
  reasonDetail: text("reason_detail").notNull(),
  evidence: jsonb("evidence").notNull(),
  evidenceHash: text("evidence_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_historical_exclusion_identity_idx").on(
    t.schemaVersion, t.artifactKey, t.provider, t.providerGameId, t.reasonCode, t.evidenceHash,
  ),
  index("mlb_historical_exclusion_reason_idx").on(t.reasonCode, t.season),
]);

export const mlbHistoricalSplitsTable = pgTable("mlb_historical_splits", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default(MLB_HISTORICAL_SCHEMA_VERSION),
  splitVersion: text("split_version").notNull(),
  canonicalGameId: text("canonical_game_id").notNull(),
  cohort: text("cohort").notNull(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull(),
  assignmentRule: text("assignment_rule").notNull(),
  immutable: boolean("immutable").notNull().default(true),
  foundationChecksum: text("foundation_checksum").notNull().default("UNBOUND"),
  assignmentHash: text("assignment_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_historical_split_game_idx").on(t.schemaVersion, t.splitVersion, t.canonicalGameId),
  index("mlb_historical_split_cohort_idx").on(t.splitVersion, t.cohort, t.assignedAt),
]);

export type MlbHistoricalGame = typeof mlbHistoricalGamesTable.$inferSelect;
export type InsertMlbHistoricalGame = typeof mlbHistoricalGamesTable.$inferInsert;
export type MlbHistoricalTeamGameRow = typeof mlbHistoricalTeamGameRowsTable.$inferSelect;
export type InsertMlbHistoricalTeamGameRow = typeof mlbHistoricalTeamGameRowsTable.$inferInsert;