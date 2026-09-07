import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ncaafFeatureSnapshotsTable } from "./ncaaf-feature-snapshots";
import { ncaafFootballIntelligenceSnapshotsTable } from "./ncaaf-football-intelligence-snapshots";

export const NCAAF_PREGAME_COHORT_SCHEMA_VERSION = "ncaaf-pregame-cohort-v1";

/**
 * Immutable cohort membership for pregame evaluation. This table is deliberately
 * not part of the canonical forecast or publication paths. A provider event can
 * receive one assignment for each cohort type, and assignments are never updated.
 */
export const ncaafPregameCohortAssignmentsTable = pgTable(
  "ncaaf_pregame_cohort_assignments",
  {
    id: serial("id").primaryKey(),
    schemaVersion: text("schema_version").notNull().default(NCAAF_PREGAME_COHORT_SCHEMA_VERSION),
    cohortType: text("cohort_type").notNull(), // FINAL_PREGAME | LIVE_SHADOW
    targetProvider: text("target_provider").notNull(),
    targetEventId: text("target_event_id").notNull(),
    featureSnapshotId: integer("feature_snapshot_id").notNull()
      .references(() => ncaafFeatureSnapshotsTable.id),
    footballIntelligenceSnapshotId: integer("football_intelligence_snapshot_id")
      .references(() => ncaafFootballIntelligenceSnapshotsTable.id),
    season: integer("season").notNull(),
    week: integer("week"),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    cutoffAt: timestamp("cutoff_at", { withTimezone: true }).notNull(),
    featureSchemaVersion: text("feature_schema_version").notNull(),
    collectionVersion: text("collection_version").notNull(),
    assignmentAt: timestamp("assignment_at", { withTimezone: true }).notNull(),
    activationAt: timestamp("activation_at", { withTimezone: true }),
    activationVersion: text("activation_version"),
    provenance: jsonb("provenance").notNull(),
    completeness: jsonb("completeness").notNull(),
    quality: jsonb("quality").notNull(),
    missingReasons: jsonb("missing_reasons").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ncaaf_pregame_cohort_identity_idx").on(
      t.schemaVersion, t.cohortType, t.targetProvider, t.targetEventId,
    ),
    index("ncaaf_pregame_cohort_snapshot_idx").on(t.featureSnapshotId),
    index("ncaaf_pregame_cohort_schedule_idx").on(t.season, t.week, t.kickoffAt),
  ],
);

export type NcaafPregameCohortAssignment = typeof ncaafPregameCohortAssignmentsTable.$inferSelect;
export type InsertNcaafPregameCohortAssignment = typeof ncaafPregameCohortAssignmentsTable.$inferInsert;
export const insertNcaafPregameCohortAssignmentSchema =
  createInsertSchema(ncaafPregameCohortAssignmentsTable).omit({ id: true, createdAt: true });
export type NewNcaafPregameCohortAssignment =
  z.infer<typeof insertNcaafPregameCohortAssignmentSchema>;