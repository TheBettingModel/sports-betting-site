import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Raw, append-only CFBD responses. This is deliberately not a model table. */
export const NCAAF_COLLEGE_FOOTBALL_DATA_EVIDENCE_SCHEMA_VERSION = "ncaaf-cfbd-evidence-v1";

export const ncaafCollegeFootballDataEvidenceTable = pgTable(
  "ncaaf_college_football_data_evidence",
  {
    id: serial("id").primaryKey(),
    schemaVersion: text("schema_version").notNull().default(NCAAF_COLLEGE_FOOTBALL_DATA_EVIDENCE_SCHEMA_VERSION),
    provider: text("provider").notNull().default("college_football_data"),
    endpoint: text("endpoint").notNull(),
    requestIdentity: text("request_identity").notNull(),
    season: integer("season").notNull(),
    week: integer("week"),
    cfbdGameId: text("cfbd_game_id"),
    cfbdTeamId: text("cfbd_team_id"),
    cfbdPlayerId: text("cfbd_player_id"),
    providerObservedAt: timestamp("provider_observed_at", { withTimezone: true }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    modeledAsOf: timestamp("modeled_as_of", { withTimezone: true }).notNull(),
    payloadHash: text("payload_hash").notNull(),
    payload: jsonb("payload").notNull(),
    evidenceState: text("evidence_state").notNull().default("observed"),
    missingFields: jsonb("missing_fields").notNull().default([]),
    missingReasons: jsonb("missing_reasons").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ncaaf_cfbd_evidence_idempotency_idx").on(
      t.schemaVersion, t.provider, t.endpoint, t.requestIdentity, t.payloadHash,
    ),
    index("ncaaf_cfbd_evidence_lookup_idx").on(t.season, t.week, t.endpoint, t.capturedAt),
    index("ncaaf_cfbd_evidence_game_idx").on(t.provider, t.cfbdGameId),
    index("ncaaf_cfbd_evidence_team_idx").on(t.provider, t.cfbdTeamId, t.season),
    index("ncaaf_cfbd_evidence_player_idx").on(t.provider, t.cfbdPlayerId, t.season),
  ],
);

export type NcaafCollegeFootballDataEvidence = typeof ncaafCollegeFootballDataEvidenceTable.$inferSelect;
export const insertNcaafCollegeFootballDataEvidenceSchema =
  createInsertSchema(ncaafCollegeFootballDataEvidenceTable).omit({ id: true, createdAt: true });
export type InsertNcaafCollegeFootballDataEvidence =
  z.infer<typeof insertNcaafCollegeFootballDataEvidenceSchema>;