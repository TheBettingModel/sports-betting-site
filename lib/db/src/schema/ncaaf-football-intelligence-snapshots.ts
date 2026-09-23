import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const NCAAF_FOOTBALL_INTELLIGENCE_SNAPSHOT_SCHEMA_VERSION = "ncaaf-football-intelligence-v2";

/**
 * Immutable, append-only, market-free NCAAF intelligence materializations.
 * Corrections and changed evidence are represented by a new input hash; this
 * table is intentionally not a mutable current-state store.
 */
export const ncaafFootballIntelligenceSnapshotsTable = pgTable(
  "ncaaf_football_intelligence_snapshots",
  {
    id: serial("id").primaryKey(),
    schemaVersion: text("schema_version").notNull()
      .default(NCAAF_FOOTBALL_INTELLIGENCE_SNAPSHOT_SCHEMA_VERSION),
    targetProvider: text("target_provider").notNull(),
    targetEventId: text("target_event_id").notNull(),
    season: integer("season").notNull(),
    week: integer("week"),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    homeProviderTeamId: text("home_provider_team_id"),
    awayProviderTeamId: text("away_provider_team_id"),
    dataCutoffAt: timestamp("data_cutoff_at", { withTimezone: true }).notNull(),
    evidenceMaxCapturedAt: timestamp("evidence_max_captured_at", { withTimezone: true }),
    evidenceMaxModeledAt: timestamp("evidence_max_modeled_at", { withTimezone: true }),
    inputHash: text("input_hash").notNull(),
    domainPayload: jsonb("domain_payload").notNull(),
    qualityReadiness: jsonb("quality_readiness").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ncaaf_football_intelligence_snapshots_identity_idx").on(
      t.schemaVersion, t.targetProvider, t.targetEventId, t.dataCutoffAt, t.inputHash,
    ),
    index("ncaaf_football_intelligence_snapshots_target_idx").on(
      t.targetProvider, t.targetEventId, t.createdAt,
    ),
    index("ncaaf_football_intelligence_snapshots_cutoff_idx").on(t.season, t.week, t.dataCutoffAt),
    index("ncaaf_football_intelligence_snapshots_kickoff_idx").on(t.kickoffAt),
  ],
);

export type NcaafFootballIntelligenceSnapshot = typeof ncaafFootballIntelligenceSnapshotsTable.$inferSelect;
export const insertNcaafFootballIntelligenceSnapshotSchema =
  createInsertSchema(ncaafFootballIntelligenceSnapshotsTable).omit({ id: true, createdAt: true });
export type InsertNcaafFootballIntelligenceSnapshot =
  z.infer<typeof insertNcaafFootballIntelligenceSnapshotSchema>;