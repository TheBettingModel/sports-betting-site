import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const NCAAF_FEATURE_SCHEMA_VERSION = "ncaaf-features-v1";

/**
 * Immutable, append-only NCAAF feature materializations.  A new feature version
 * or cutoff creates a new row; consumers must never update an existing row.
 */
export const ncaafFeatureSnapshotsTable = pgTable(
  "ncaaf_feature_snapshots",
  {
    id: serial("id").primaryKey(),
    schemaVersion: text("schema_version").notNull().default(NCAAF_FEATURE_SCHEMA_VERSION),
    modelVersion: text("model_version").notNull(),
    configHash: text("config_hash").notNull(),
    targetProvider: text("target_provider").notNull(),
    targetEventId: text("target_event_id").notNull(),
    season: integer("season").notNull(),
    homeProviderTeamId: text("home_provider_team_id"),
    awayProviderTeamId: text("away_provider_team_id"),
    dataCutoffAt: timestamp("data_cutoff_at", { withTimezone: true }).notNull(),
    evidenceMaxModeledAsOf: timestamp("evidence_max_modeled_as_of", { withTimezone: true }),
    inputHash: text("input_hash").notNull(),
    features: jsonb("features").notNull(),
    quality: jsonb("quality").notNull(),
    forecast: jsonb("forecast").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ncaaf_feature_snapshots_identity_idx").on(
      t.schemaVersion, t.modelVersion, t.configHash, t.targetProvider, t.targetEventId, t.dataCutoffAt, t.inputHash,
    ),
    index("ncaaf_feature_snapshots_target_idx").on(t.targetProvider, t.targetEventId, t.createdAt),
    index("ncaaf_feature_snapshots_cutoff_idx").on(t.season, t.dataCutoffAt),
  ],
);

export type NcaafFeatureSnapshot = typeof ncaafFeatureSnapshotsTable.$inferSelect;
export type InsertNcaafFeatureSnapshot = typeof ncaafFeatureSnapshotsTable.$inferInsert;
export const insertNcaafFeatureSnapshotSchema = createInsertSchema(ncaafFeatureSnapshotsTable).omit({
  id: true,
  createdAt: true,
});
export type NewNcaafFeatureSnapshot = z.infer<typeof insertNcaafFeatureSnapshotSchema>;