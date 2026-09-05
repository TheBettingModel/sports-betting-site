import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * #224C prospective-only starter evidence.  These rows deliberately do not
 * reference `games`: an official schedule observation is evidence even before
 * the application's game identity has been materialized.  Corrections are new
 * rows, never updates.
 */
export const MLB_STARTER_EVIDENCE_224C_SCHEMA_VERSION = "mlb-starter-evidence-224c-v3";

export const mlbPregameStarterEvidenceSnapshotsTable = pgTable("mlb_pregame_starter_evidence_snapshots", {
  id: serial("id").primaryKey(),
  // Nullable only for preserved v1-v3 starter snapshots collected before #232.
  // New collection writes link to the dedicated immutable collection run.
  collectionRunId: text("collection_run_id"),
  schemaVersion: text("schema_version").notNull().default(MLB_STARTER_EVIDENCE_224C_SCHEMA_VERSION),
  provider: text("provider").notNull(), // MLB_STATS_API
  sourceRecordId: text("source_record_id").notNull(),
  officialGameId: text("official_game_id").notNull(),
  officialTeamId: text("official_team_id").notNull(),
  // Nullable only for append-only v1/v2 rows captured before this projection
  // was added; the collector's StarterEvidenceRow contract requires it.
  officialOpponentTeamId: text("official_opponent_team_id"),
  officialPlayerId: text("official_player_id"),
  tbmGameId: text("tbm_game_id"),
  tbmTeamId: text("tbm_team_id"),
  tbmPlayerId: text("tbm_player_id"),
  teamSide: text("team_side").notNull(), // HOME | AWAY
  scheduledFirstPitch: timestamp("scheduled_first_pitch", { withTimezone: true }).notNull(),
  featureCutoff: timestamp("feature_cutoff", { withTimezone: true }).notNull(),
  sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  starterState: text("starter_state").notNull(),
  identityState: text("identity_state").notNull(), // UNKNOWN | OFFICIAL_ID | AMBIGUOUS
  identityConfidence: text("identity_confidence").notNull(), // NONE | HIGH | AMBIGUOUS
  identityProvenance: jsonb("identity_provenance").notNull(),
  starterName: text("starter_name"),
  metricsState: text("metrics_state").notNull().default("IDENTITY_ONLY"),
  metricsThroughTime: timestamp("metrics_through_time", { withTimezone: true }),
  starterPitMetrics: jsonb("starter_pit_metrics").notNull().default({}),
  daysRest: integer("days_rest"),
  recentWorkload: jsonb("recent_workload").notNull().default({}),
  sampleSizes: jsonb("sample_sizes").notNull().default({}),
  missingness: jsonb("missingness").notNull().default({}),
  pitSafe: boolean("pit_safe").notNull(),
  pitSafetyReason: text("pit_safety_reason").notNull(),
  reason: text("reason").notNull(),
  rawGamePayload: jsonb("raw_game_payload").notNull(),
  rawGamePayloadHash: text("raw_game_payload_hash").notNull(),
  evidenceStateHash: text("evidence_state_hash"),
  evidenceChecksum: text("evidence_checksum").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_pregame_starter_evidence_identity_idx")
    .on(t.schemaVersion, t.provider, t.sourceRecordId, t.evidenceStateHash),
  check("mlb_pregame_starter_evidence_v3_hashes_required", sql`
    ${t.schemaVersion} <> 'mlb-starter-evidence-224c-v3'
    OR (
      ${t.evidenceStateHash} IS NOT NULL
      AND length(${t.evidenceStateHash}) = 64
      AND length(${t.rawGamePayloadHash}) = 64
      AND length(${t.evidenceChecksum}) = 64
    )
  `),
  index("mlb_pregame_starter_evidence_game_observed_idx").on(t.officialGameId, t.observedAt),
  index("mlb_pregame_starter_evidence_pitch_idx").on(t.scheduledFirstPitch, t.teamSide),
]);

/**
 * A disposition is an immutable research fact.  It is intentionally separate
 * from model artifacts and historical/OOS artifacts, which #224C must not
 * rewrite after its non-competitive result.
 */
export const mlbResearchExperimentDispositionLedgerTable = pgTable("mlb_research_experiment_disposition_ledger", {
  id: serial("id").primaryKey(),
  experimentId: text("experiment_id").notNull(),
  experimentVersion: text("experiment_version").notNull(),
  disposition: text("disposition").notNull(), // RESEARCH_FAILED_NOT_COMPETITIVE
  oosUse: text("oos_use").notNull(), // HISTORICAL_BENCHMARK_ONLY
  dispositionReason: text("disposition_reason").notNull(),
  artifactReferences: jsonb("artifact_references").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  checksum: text("checksum").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mlb_research_experiment_disposition_identity_idx")
    .on(t.experimentId, t.experimentVersion, t.disposition, t.oosUse, t.checksum),
  index("mlb_research_experiment_disposition_recorded_idx").on(t.recordedAt),
]);