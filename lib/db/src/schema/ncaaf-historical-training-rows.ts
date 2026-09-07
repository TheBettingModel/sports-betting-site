import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Immutable canonical rows emitted by the bounded NCAAF historical builder.
 * This is an artifact ledger, not a V4 training queue or model input table.
 */
export const ncaafHistoricalTrainingRowsTable = pgTable("ncaaf_historical_training_rows", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default("ncaaf-historical-team-game-v1"),
  artifactKey: text("artifact_key").notNull(),
  canonicalProvider: text("canonical_provider").notNull(),
  canonicalEventId: text("canonical_event_id").notNull(),
  season: integer("season").notNull(),
  week: integer("week"),
  kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
  pregameCutoffAt: timestamp("pregame_cutoff_at", { withTimezone: true }).notNull(),
  homeCanonicalTeamId: text("home_canonical_team_id").notNull(),
  awayCanonicalTeamId: text("away_canonical_team_id").notNull(),
  targets: jsonb("targets").notNull(),
  features: jsonb("features").notNull(),
  pitLineage: jsonb("pit_lineage").notNull(),
  quality: jsonb("quality").notNull(),
  checksum: text("checksum").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ncaaf_historical_training_row_identity_idx").on(
    t.schemaVersion, t.artifactKey, t.canonicalProvider, t.canonicalEventId,
  ),
  index("ncaaf_historical_training_row_season_idx").on(t.season, t.week, t.kickoffAt),
  index("ncaaf_historical_training_row_checksum_idx").on(t.checksum),
]);

export type NcaafHistoricalTrainingRow = typeof ncaafHistoricalTrainingRowsTable.$inferSelect;
export type InsertNcaafHistoricalTrainingRow = typeof ncaafHistoricalTrainingRowsTable.$inferInsert;