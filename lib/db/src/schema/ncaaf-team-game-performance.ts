import {
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

export const NCAAF_TEAM_GAME_PERFORMANCE_SCHEMA_VERSION = "ncaaf-team-game-performance-v1";

/**
 * Immutable, provider-scoped team-game evidence. This table intentionally does
 * not contain lines, prices, forecasts, picks, or recommendations. A correction
 * from a provider is a new payload-hashed row rather than an update.
 */
export const ncaafTeamGamePerformanceTable = pgTable(
  "ncaaf_team_game_performance",
  {
    id: serial("id").primaryKey(),
    schemaVersion: text("schema_version").notNull().default(NCAAF_TEAM_GAME_PERFORMANCE_SCHEMA_VERSION),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    providerTeamId: text("provider_team_id").notNull(),
    providerOpponentTeamId: text("provider_opponent_team_id").notNull(),
    season: integer("season").notNull(),
    week: integer("week"),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }),
    teamLocation: text("team_location").notNull(), // home | away | neutral | unknown
    competitionClassification: text("competition_classification").notNull(), // FBS | FCS | OTHER | UNKNOWN

    // Raw scoreboard-compatible performance evidence. Never encode absence as 0.
    pointsFor: integer("points_for"),
    pointsAgainst: integer("points_against"),
    halftimePointsFor: integer("halftime_points_for"),
    halftimePointsAgainst: integer("halftime_points_against"),
    overtimePeriods: integer("overtime_periods"),
    possessions: integer("possessions"),
    offensivePlays: integer("offensive_plays"),
    yardsFor: integer("yards_for"),
    yardsAgainst: integer("yards_against"),
    turnoversCommitted: integer("turnovers_committed"),
    turnoversForced: integer("turnovers_forced"),
    penalties: integer("penalties"),
    penaltyYards: integer("penalty_yards"),
    timeOfPossessionSeconds: integer("time_of_possession_seconds"),
    fieldGoalAttempts: integer("field_goal_attempts"),
    fieldGoalsMade: integer("field_goals_made"),

    // Sanitized, market-free completed-game summary evidence. These retain the
    // provider's observed boxscore/drive/player fields without overwriting the
    // typed performance columns above.
    rawSummaryEvidence: jsonb("raw_summary_evidence"),
    rawTeamStatisticsEvidence: jsonb("raw_team_statistics_evidence"),
    rawDriveEvidence: jsonb("raw_drive_evidence"),
    rawPlayerEvidence: jsonb("raw_player_evidence"),

    // Metrics may be populated only by a supporting provider and retain their
    // method/unit/source in JSON; absent provider support remains SQL NULL.
    derivedMetrics: jsonb("derived_metrics"),
    quality: real("quality"),
    reliability: real("reliability"),
    missingFields: jsonb("missing_fields").notNull().default([]),
    missingReasons: jsonb("missing_reasons").notNull().default({}),
    providerObservedAt: timestamp("provider_observed_at", { withTimezone: true }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    payloadHash: text("payload_hash").notNull(),
    provenance: jsonb("provenance").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ncaaf_team_game_performance_idempotency_idx").on(
      t.schemaVersion, t.provider, t.providerEventId, t.providerTeamId, t.payloadHash,
    ),
    index("ncaaf_team_game_performance_team_kickoff_idx").on(
      t.provider, t.providerTeamId, t.kickoffAt,
    ),
    index("ncaaf_team_game_performance_season_week_idx").on(t.season, t.week, t.kickoffAt),
    index("ncaaf_team_game_performance_opponent_idx").on(t.provider, t.providerOpponentTeamId),
  ],
);

export type NcaafTeamGamePerformance = typeof ncaafTeamGamePerformanceTable.$inferSelect;
export const insertNcaafTeamGamePerformanceSchema = createInsertSchema(ncaafTeamGamePerformanceTable).omit({
  id: true,
  createdAt: true,
});
export type InsertNcaafTeamGamePerformance = z.infer<typeof insertNcaafTeamGamePerformanceSchema>;