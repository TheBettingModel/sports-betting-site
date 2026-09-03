import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { ncaafCollegeFootballDataEvidenceTable } from "./ncaaf-college-football-data-evidence";

/**
 * Provider-native identities are intentionally retained even when no ESPN/TBM
 * identity can be proven.  These ledgers are append-only evidence, not aliases
 * inferred from display-name similarity.
 */
export const ncaafCfbdTeamMappingsTable = pgTable("ncaaf_cfbd_team_mappings", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default("ncaaf-cfbd-team-mapping-v1"),
  cfbdTeamId: text("cfbd_team_id").notNull(),
  season: integer("season").notNull(),
  canonicalProvider: text("canonical_provider"),
  canonicalTeamId: text("canonical_team_id"),
  state: text("state").notNull(), // MAPPED | UNMAPPED | AMBIGUOUS | INVALID
  reason: text("reason").notNull(),
  evidence: jsonb("evidence").notNull(),
  payloadHash: text("payload_hash").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ncaaf_cfbd_team_mapping_append_only_idx").on(t.cfbdTeamId, t.season, t.payloadHash),
  index("ncaaf_cfbd_team_mapping_state_idx").on(t.season, t.state),
]);

export const ncaafCfbdGameMappingsTable = pgTable("ncaaf_cfbd_game_mappings", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default("ncaaf-cfbd-game-mapping-v1"),
  cfbdGameId: text("cfbd_game_id").notNull(),
  season: integer("season").notNull(),
  canonicalProvider: text("canonical_provider"),
  canonicalEventId: text("canonical_event_id"),
  state: text("state").notNull(), // MAPPED | UNMATCHED | AMBIGUOUS | INVALID
  reason: text("reason").notNull(),
  evidence: jsonb("evidence").notNull(),
  payloadHash: text("payload_hash").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ncaaf_cfbd_game_mapping_append_only_idx").on(t.cfbdGameId, t.season, t.payloadHash),
  index("ncaaf_cfbd_game_mapping_state_idx").on(t.season, t.state),
]);

export const ncaafCfbdPlayerMappingsTable = pgTable("ncaaf_cfbd_player_mappings", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default("ncaaf-cfbd-player-mapping-v1"),
  cfbdPlayerId: text("cfbd_player_id").notNull(),
  season: integer("season").notNull(),
  cfbdTeamId: text("cfbd_team_id"),
  canonicalProvider: text("canonical_provider"),
  canonicalPlayerId: text("canonical_player_id"),
  state: text("state").notNull(), // MAPPED | PROVIDER_ONLY | AMBIGUOUS | INVALID
  reason: text("reason").notNull(),
  evidence: jsonb("evidence").notNull(),
  payloadHash: text("payload_hash").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ncaaf_cfbd_player_mapping_append_only_idx").on(t.cfbdPlayerId, t.season, t.payloadHash),
  index("ncaaf_cfbd_player_mapping_state_idx").on(t.season, t.state),
]);

/** Normalized, immutable domain records retain their raw evidence reference. */
export const ncaafCfbdDomainEvidenceTable = pgTable("ncaaf_cfbd_domain_evidence", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default("ncaaf-cfbd-domain-evidence-v1"),
  rawEvidenceId: integer("raw_evidence_id").notNull().references(() => ncaafCollegeFootballDataEvidenceTable.id),
  parentRawPayloadHash: text("parent_raw_payload_hash").notNull(),
  endpoint: text("endpoint").notNull(),
  domain: text("domain").notNull(),
  season: integer("season").notNull(),
  week: integer("week"),
  cfbdGameId: text("cfbd_game_id"),
  cfbdTeamId: text("cfbd_team_id"),
  cfbdPlayerId: text("cfbd_player_id"),
  providerEffectiveAt: timestamp("provider_effective_at", { withTimezone: true }),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  pitClassification: text("pit_classification").notNull(), // A | B | C | D
  evidenceState: text("evidence_state").notNull(),
  missingReasons: jsonb("missing_reasons").notNull().default({}),
  payloadHash: text("payload_hash").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ncaaf_cfbd_domain_append_only_idx").on(t.rawEvidenceId, t.domain, t.payloadHash),
  index("ncaaf_cfbd_domain_lookup_idx").on(t.season, t.week, t.domain, t.cfbdTeamId),
]);

/** Call telemetry has no credentials, URL values, or raw response bodies. */
export const ncaafCfbdProviderHealthTable = pgTable("ncaaf_cfbd_provider_health", {
  id: serial("id").primaryKey(),
  schemaVersion: text("schema_version").notNull().default("ncaaf-cfbd-provider-health-v1"),
  endpoint: text("endpoint").notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  succeeded: boolean("succeeded").notNull(),
  httpStatus: integer("http_status"),
  outcome: text("outcome").notNull().default("unknown"),
  failureCategory: text("failure_category"),
  contentType: text("content_type"),
  latencyMs: integer("latency_ms").notNull(),
  timeout: boolean("timeout").notNull().default(false),
  rateLimited: boolean("rate_limited").notNull().default(false),
  authError: boolean("auth_error").notNull().default(false),
  validationError: boolean("validation_error").notNull().default(false),
  retryCount: integer("retry_count").notNull().default(0),
  payloadBytes: integer("payload_bytes"),
  rowsMaterialized: integer("rows_materialized").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ncaaf_cfbd_provider_health_lookup_idx").on(t.endpoint, t.attemptedAt)]);