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
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const NCAAF_EVIDENCE_SCHEMA_VERSION = "ncaaf-evidence-v1";

/**
 * Append-only provider evidence for the NCAAF feature store.  These tables are
 * deliberately separate from games, odds_snapshots, and predictions: ingestion
 * records what a provider said and when it was observed, not a revised model
 * state.
 */
export const ncaafEvidenceRunsTable = pgTable(
  "ncaaf_evidence_runs",
  {
    id: serial("id").primaryKey(),
    schemaVersion: text("schema_version").notNull().default(NCAAF_EVIDENCE_SCHEMA_VERSION),
    runKey: text("run_key").notNull(),
    requestedFrom: text("requested_from").notNull(),
    requestedTo: text("requested_to").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(), // running | completed | partial | failed
    providers: jsonb("providers").notNull(),
    coverage: jsonb("coverage").notNull().default({}),
    errorDetails: jsonb("error_details"),
    /** Append-only lifecycle audit trail (creation, stale reconciliation, finalization). */
    statusHistory: jsonb("status_history").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("ncaaf_evidence_runs_run_key_idx").on(t.runKey),
    index("ncaaf_evidence_runs_captured_at_idx").on(t.capturedAt),
    index("ncaaf_evidence_runs_range_idx").on(t.requestedFrom, t.requestedTo),
  ],
);

export const ncaafGameEvidenceTable = pgTable(
  "ncaaf_game_evidence",
  {
    id: serial("id").primaryKey(),
    schemaVersion: text("schema_version").notNull().default(NCAAF_EVIDENCE_SCHEMA_VERSION),
    runId: integer("run_id").references(() => ncaafEvidenceRunsTable.id),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    providerObservedAt: timestamp("provider_observed_at", { withTimezone: true }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    modeledAsOf: timestamp("modeled_as_of", { withTimezone: true }).notNull(),
    season: integer("season").notNull(),
    week: integer("week"),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }),
    gameStatus: text("game_status"),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    homeHalftimeScore: integer("home_halftime_score"),
    awayHalftimeScore: integer("away_halftime_score"),
    isOvertime: boolean("is_overtime"),
    venueId: text("venue_id"),
    venueName: text("venue_name"),
    venueCity: text("venue_city"),
    venueState: text("venue_state"),
    venueCountry: text("venue_country"),
    venueIndoor: boolean("venue_indoor"),
    homeConferenceId: text("home_conference_id"),
    awayConferenceId: text("away_conference_id"),
    homeProviderTeamId: text("home_provider_team_id"),
    awayProviderTeamId: text("away_provider_team_id"),
    homeTeamName: text("home_team_name"),
    awayTeamName: text("away_team_name"),
    neutralSite: boolean("neutral_site"),
    evidenceStatus: text("evidence_status").notNull().default("observed"),
    missingFields: jsonb("missing_fields").notNull().default([]),
    missingReasons: jsonb("missing_reasons").notNull().default({}),
    payload: jsonb("payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ncaaf_game_evidence_idempotency_idx").on(
      t.schemaVersion, t.provider, t.providerEventId, t.payloadHash,
    ),
    index("ncaaf_game_evidence_as_of_idx").on(t.season, t.modeledAsOf, t.capturedAt),
    index("ncaaf_game_evidence_event_idx").on(t.provider, t.providerEventId),
    index("ncaaf_game_evidence_kickoff_idx").on(t.kickoffAt),
  ],
);

/** Observations whose provider support is not yet available are represented as
 * explicit missing evidence rather than invented values. */
export const ncaafEntityObservationsTable = pgTable(
  "ncaaf_entity_observations",
  {
    id: serial("id").primaryKey(),
    schemaVersion: text("schema_version").notNull().default(NCAAF_EVIDENCE_SCHEMA_VERSION),
    runId: integer("run_id").references(() => ncaafEvidenceRunsTable.id),
    gameEvidenceId: integer("game_evidence_id").references(() => ncaafGameEvidenceTable.id),
    provider: text("provider").notNull(),
    providerEntityId: text("provider_entity_id").notNull(),
    entityType: text("entity_type").notNull(), // team_season | player | roster | context
    observationType: text("observation_type").notNull(),
    season: integer("season").notNull(),
    week: integer("week"),
    providerObservedAt: timestamp("provider_observed_at", { withTimezone: true }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    modeledAsOf: timestamp("modeled_as_of", { withTimezone: true }).notNull(),
    missingFields: jsonb("missing_fields").notNull().default([]),
    missingReasons: jsonb("missing_reasons").notNull().default({}),
    payload: jsonb("payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ncaaf_entity_observations_idempotency_idx").on(
      t.schemaVersion, t.provider, t.entityType, t.observationType, t.providerEntityId, t.season, t.payloadHash,
    ),
    index("ncaaf_entity_observations_as_of_idx").on(t.season, t.modeledAsOf, t.capturedAt),
    index("ncaaf_entity_observations_game_idx").on(t.gameEvidenceId),
  ],
);

export const ncaafMarketObservationsTable = pgTable(
  "ncaaf_market_observations",
  {
    id: serial("id").primaryKey(),
    schemaVersion: text("schema_version").notNull().default(NCAAF_EVIDENCE_SCHEMA_VERSION),
    runId: integer("run_id").references(() => ncaafEvidenceRunsTable.id),
    gameEvidenceId: integer("game_evidence_id").references(() => ncaafGameEvidenceTable.id),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    bookmakerProviderId: text("bookmaker_provider_id").notNull(),
    bookmakerName: text("bookmaker_name"),
    marketKey: text("market_key").notNull(),
    selection: text("selection").notNull(),
    price: integer("price"),
    line: real("line"),
    observationPhase: text("observation_phase").notNull().default("current"),
    isMatchedToGame: boolean("is_matched_to_game").notNull().default(false),
    /** Deliberately retains provider rows that cannot be safely identified. */
    marketIdentityStatus: text("market_identity_status").notNull().default("unmatched"),
    marketIdentityReason: text("market_identity_reason").notNull().default("unmatched_identity"),
    providerObservedAt: timestamp("provider_observed_at", { withTimezone: true }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    modeledAsOf: timestamp("modeled_as_of", { withTimezone: true }).notNull(),
    season: integer("season").notNull(),
    week: integer("week"),
    missingFields: jsonb("missing_fields").notNull().default([]),
    missingReasons: jsonb("missing_reasons").notNull().default({}),
    payload: jsonb("payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ncaaf_market_observations_idempotency_idx").on(
      t.schemaVersion, t.provider, t.providerEventId, t.bookmakerProviderId, t.marketKey, t.selection, t.payloadHash,
    ),
    index("ncaaf_market_observations_as_of_idx").on(t.season, t.modeledAsOf, t.capturedAt),
    index("ncaaf_market_observations_game_idx").on(t.gameEvidenceId, t.capturedAt),
    index("ncaaf_market_observations_provider_event_idx").on(t.provider, t.providerEventId),
  ],
);

export type NcaafEvidenceRun = typeof ncaafEvidenceRunsTable.$inferSelect;
export type NcaafGameEvidence = typeof ncaafGameEvidenceTable.$inferSelect;
export type NcaafEntityObservation = typeof ncaafEntityObservationsTable.$inferSelect;
export type NcaafMarketObservation = typeof ncaafMarketObservationsTable.$inferSelect;

export const insertNcaafEvidenceRunSchema = createInsertSchema(ncaafEvidenceRunsTable).omit({
  id: true, createdAt: true,
});
export const insertNcaafGameEvidenceSchema = createInsertSchema(ncaafGameEvidenceTable).omit({
  id: true, createdAt: true,
});
export const insertNcaafEntityObservationSchema = createInsertSchema(ncaafEntityObservationsTable).omit({
  id: true, createdAt: true,
});
export const insertNcaafMarketObservationSchema = createInsertSchema(ncaafMarketObservationsTable).omit({
  id: true, createdAt: true,
});

export type InsertNcaafEvidenceRun = z.infer<typeof insertNcaafEvidenceRunSchema>;
export type InsertNcaafGameEvidence = z.infer<typeof insertNcaafGameEvidenceSchema>;
export type InsertNcaafEntityObservation = z.infer<typeof insertNcaafEntityObservationSchema>;
export type InsertNcaafMarketObservation = z.infer<typeof insertNcaafMarketObservationSchema>;