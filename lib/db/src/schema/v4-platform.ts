import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const v4HistoricalSourcesTable = pgTable("v4_historical_sources", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sourceKey: text("source_key").notNull().unique(),
  provider: text("provider").notNull(),
  retrievalMethod: text("retrieval_method").notNull(),
  sourceUri: text("source_uri"),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  rawPayloadHash: text("raw_payload_hash").notNull(),
  rawRowCount: integer("raw_row_count").notNull(),
  provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("v4_historical_source_hash_check", sql`${table.rawPayloadHash} ~ '^[0-9a-f]{64}$'`),
  check("v4_historical_source_rows_check", sql`${table.rawRowCount} >= 0`),
]);

export const v4HistoricalIdentitiesTable = pgTable("v4_historical_identities", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sport: text("sport").notNull(),
  provider: text("provider").notNull(),
  providerEntityId: text("provider_entity_id").notNull(),
  canonicalEntityId: text("canonical_entity_id").notNull(),
  displayName: text("display_name").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  season: text("season"),
  competition: text("competition"),
  proof: jsonb("proof").$type<Record<string, unknown>>().notNull(),
  identityHash: text("identity_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("v4_historical_identity_provider_unique").on(
    table.sport, table.provider, table.providerEntityId, table.season, table.competition,
  ),
  check("v4_historical_identity_hash_check", sql`${table.identityHash} ~ '^[0-9a-f]{64}$'`),
]);

export const v4HistoricalEventsTable = pgTable("v4_historical_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sport: text("sport").notNull(),
  league: text("league"),
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  canonicalEventId: text("canonical_event_id").notNull(),
  season: text("season").notNull(),
  eventStart: timestamp("event_start", { withTimezone: true }).notNull(),
  completionTime: timestamp("completion_time", { withTimezone: true }),
  completionTimeKind: text("completion_time_kind").notNull(),
  homeParticipantId: text("home_participant_id"),
  awayParticipantId: text("away_participant_id"),
  participantAId: text("participant_a_id"),
  participantBId: text("participant_b_id"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  participantAWon: boolean("participant_a_won"),
  targetAvailableAt: timestamp("target_available_at", { withTimezone: true }),
  sourceId: bigint("source_id", { mode: "number" }).notNull()
    .references(() => v4HistoricalSourcesTable.id),
  rawEventHash: text("raw_event_hash").notNull(),
  canonicalEventHash: text("canonical_event_hash").notNull(),
  eligibility: text("eligibility").notNull(),
  quarantineReason: text("quarantine_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("v4_historical_event_identity_unique").on(
    table.sport, table.provider, table.providerEventId, table.canonicalEventHash,
  ),
  index("v4_historical_event_chronology_idx").on(table.sport, table.eventStart),
  check("v4_historical_event_raw_hash_check", sql`${table.rawEventHash} ~ '^[0-9a-f]{64}$'`),
  check("v4_historical_event_canonical_hash_check", sql`${table.canonicalEventHash} ~ '^[0-9a-f]{64}$'`),
  check("v4_historical_event_eligibility_check", sql`${table.eligibility} IN ('ELIGIBLE','QUARANTINED')`),
  check("v4_historical_event_completion_kind_check", sql`${table.completionTimeKind} IN ('SOURCE_REPORTED','CONSERVATIVE_BOUND','UNAVAILABLE')`),
  check("v4_historical_event_quarantine_check", sql`
    (${table.eligibility} = 'ELIGIBLE' AND ${table.quarantineReason} IS NULL)
    OR (${table.eligibility} = 'QUARANTINED' AND ${table.quarantineReason} IS NOT NULL)
  `),
]);

export const v4HistoricalCohortsTable = pgTable("v4_historical_cohorts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sport: text("sport").notNull(),
  cohortId: text("cohort_id").notNull(),
  cohortVersion: text("cohort_version").notNull(),
  contractId: text("contract_id").notNull(),
  contractHash: text("contract_hash").notNull(),
  sourceManifest: jsonb("source_manifest").$type<Record<string, unknown>>().notNull(),
  dateStart: timestamp("date_start", { withTimezone: true }).notNull(),
  dateEnd: timestamp("date_end", { withTimezone: true }).notNull(),
  rawRows: integer("raw_rows").notNull(),
  eligibleRows: integer("eligible_rows").notNull(),
  quarantinedRows: integer("quarantined_rows").notNull(),
  featureCount: integer("feature_count").notNull(),
  trainingRows: integer("training_rows").notNull(),
  validationRows: integer("validation_rows").notNull(),
  cohortHash: text("cohort_hash").notNull(),
  frozenAt: timestamp("frozen_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("v4_historical_cohort_exact_unique").on(
    table.sport, table.cohortId, table.cohortVersion, table.cohortHash,
  ),
  check("v4_historical_cohort_hash_check", sql`${table.cohortHash} ~ '^[0-9a-f]{64}$'`),
  check("v4_historical_contract_hash_check", sql`${table.contractHash} ~ '^[0-9a-f]{64}$'`),
]);

export const v4FullSlateRunsTable = pgTable("v4_full_slate_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  runId: text("run_id").notNull().unique(),
  sport: text("sport").notNull(),
  sportDate: text("sport_date").notNull(),
  mode: text("mode").notNull(),
  scheduledEvents: integer("scheduled_events").notNull(),
  eligibleEvents: integer("eligible_events").notNull(),
  forecastedEvents: integer("forecasted_events").notNull(),
  failedEvents: integer("failed_events").notNull(),
  coverageBasisPoints: integer("coverage_basis_points").notNull(),
  failures: jsonb("failures").$type<Array<{ gameId: string; reason: string }>>().notNull().default([]),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("v4_full_slate_mode_check", sql`${table.mode} IN ('DRY_RUN','SHADOW','PRODUCTION')`),
  check("v4_full_slate_counts_check", sql`
    ${table.scheduledEvents} >= ${table.eligibleEvents}
    AND ${table.eligibleEvents} = ${table.forecastedEvents} + ${table.failedEvents}
  `),
  check("v4_full_slate_coverage_check", sql`${table.coverageBasisPoints} BETWEEN 0 AND 10000`),
]);

export const v4ForecastVersionsTable = pgTable("v4_forecast_versions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  predictionId: text("prediction_id").notNull().unique(),
  sport: text("sport").notNull(),
  gameId: text("game_id").notNull(),
  version: integer("version").notNull(),
  supersedesPredictionId: text("supersedes_prediction_id"),
  modelId: text("model_id").notNull(),
  modelVersion: text("model_version").notNull(),
  artifactHash: text("artifact_hash").notNull(),
  contractId: text("contract_id").notNull(),
  contractHash: text("contract_hash").notNull(),
  featureSnapshotId: text("feature_snapshot_id").notNull(),
  featureHash: text("feature_hash").notNull(),
  dataCutoff: timestamp("data_cutoff", { withTimezone: true }).notNull(),
  predictedAt: timestamp("predicted_at", { withTimezone: true }).notNull(),
  eventStart: timestamp("event_start", { withTimezone: true }).notNull(),
  approvalState: text("approval_state").notNull(),
  maturity: text("maturity").notNull(),
  forecastStatus: text("forecast_status").notNull(),
  officialPickStatus: text("official_pick_status").notNull(),
  forecastPayload: jsonb("forecast_payload").$type<Record<string, unknown>>().notNull(),
  forecastHash: text("forecast_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("v4_forecast_version_game_unique").on(table.sport, table.gameId, table.version),
  index("v4_forecast_latest_idx").on(table.sport, table.gameId, table.predictedAt),
  check("v4_forecast_version_positive_check", sql`${table.version} > 0`),
  check("v4_forecast_hash_check", sql`${table.forecastHash} ~ '^[0-9a-f]{64}$'`),
  check("v4_forecast_pre_event_check", sql`${table.dataCutoff} <= ${table.predictedAt} AND ${table.predictedAt} < ${table.eventStart}`),
  check("v4_forecast_status_check", sql`${table.forecastStatus} IN ('V4_VALIDATING','V4_PROVISIONAL','V4_APPROVED')`),
  check("v4_official_pick_status_check", sql`${table.officialPickStatus} IN ('NOT_PUBLICATION_ELIGIBLE','NO_OFFICIAL_PLAY','OFFICIAL_TBM_PLAY')`),
]);

export type V4HistoricalEvent = typeof v4HistoricalEventsTable.$inferSelect;
export type InsertV4HistoricalEvent = typeof v4HistoricalEventsTable.$inferInsert;
export type V4ForecastVersion = typeof v4ForecastVersionsTable.$inferSelect;