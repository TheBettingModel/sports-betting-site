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
import { modelPredictionsTable } from "./model-predictions";

/**
 * Governed, append-only decisions for one exact artifact and market. Absence of
 * a row is deliberately equivalent to UNVALIDATED; this table is never seeded
 * with production approval by application startup.
 */
export const modelArtifactApprovalLedgerTable = pgTable("model_artifact_approval_ledger", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull(),
  sport: text("sport").notNull(),
  market: text("market").notNull(),
  modelFamily: text("model_family").notNull(),
  modelId: text("model_id").notNull(),
  modelVersion: text("model_version").notNull(),
  artifactId: text("artifact_id").notNull(),
  artifactHash: text("artifact_hash").notNull(),
  inputContractVersion: text("input_contract_version").notNull(),
  inputHash: text("input_hash"),
  configurationHash: text("configuration_hash"),
  parameterHash: text("parameter_hash"),
  approvalState: text("approval_state").notNull(),
  governedActor: text("governed_actor").notNull(),
  reason: text("reason").notNull(),
  evidenceReference: text("evidence_reference").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("model_artifact_approval_event_idx").on(t.eventId),
  index("model_artifact_approval_exact_idx").on(
    t.sport, t.market, t.modelId, t.modelVersion, t.artifactHash, t.decidedAt,
  ),
]);

/** Immutable resolver and real-slate dry-run evidence. It never creates a pick. */
export const guardedServingAuditsTable = pgTable("guarded_serving_audits", {
  id: serial("id").primaryKey(),
  auditId: text("audit_id").notNull(),
  dryRun: boolean("dry_run").notNull().default(true),
  sport: text("sport").notNull(),
  gameId: text("game_id"),
  market: text("market").notNull(),
  configuredMode: text("configured_mode").notNull(),
  candidateModelId: text("candidate_model_id").notNull(),
  candidateVersion: text("candidate_version").notNull(),
  candidateArtifactHash: text("candidate_artifact_hash").notNull(),
  candidateApprovalState: text("candidate_approval_state").notNull(),
  selectedEngine: text("selected_engine"),
  resolution: text("resolution").notNull(),
  reason: text("reason").notNull(),
  fallbackUsed: boolean("fallback_used").notNull(),
  fallbackFrom: text("fallback_from"),
  inputVersion: text("input_version").notNull(),
  inputSnapshotId: text("input_snapshot_id"),
  marketSnapshotId: text("market_snapshot_id"),
  runtimeHealth: text("runtime_health").notNull(),
  publicationDisposition: text("publication_disposition").notNull(),
  evidence: jsonb("evidence").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("guarded_serving_audit_id_idx").on(t.auditId),
  index("guarded_serving_audit_lookup_idx").on(t.sport, t.gameId, t.resolvedAt),
]);

/**
 * Fresh raw candidate execution evidence. This is intentionally distinct from
 * resolver audits and has no foreign key to model_predictions: a dry run can
 * prove execution without acquiring official/public prediction identity.
 */
export const candidateExecutionAuditsTable = pgTable("candidate_execution_audits", {
  id: serial("id").primaryKey(),
  executionId: text("execution_id").notNull(),
  dryRun: boolean("dry_run").notNull().default(true),
  sport: text("sport").notNull(),
  gameId: text("game_id").notNull(),
  market: text("market").notNull(),
  modelFamily: text("model_family").notNull(),
  modelId: text("model_id").notNull(),
  modelVersion: text("model_version").notNull(),
  artifactId: text("artifact_id").notNull(),
  artifactHash: text("artifact_hash").notNull(),
  configurationHash: text("configuration_hash"),
  parameterHash: text("parameter_hash"),
  inputContractVersion: text("input_contract_version").notNull(),
  inputSnapshotId: text("input_snapshot_id").notNull(),
  inputHash: text("input_hash").notNull(),
  featureCutoff: timestamp("feature_cutoff", { withTimezone: true }).notNull(),
  materializedAt: timestamp("materialized_at", { withTimezone: true }).notNull(),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
  rawOutput: jsonb("raw_output").notNull(),
  outputHash: text("output_hash").notNull(),
  secondOutputHash: text("second_output_hash").notNull(),
  reproducible: boolean("reproducible").notNull(),
  executorHealth: text("executor_health").notNull(),
  pitSafe: boolean("pit_safe").notNull(),
  leakageSafe: boolean("leakage_safe").notNull(),
  resolverReason: text("resolver_reason").notNull(),
  publicationDisposition: text("publication_disposition").notNull(),
  evidence: jsonb("evidence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("candidate_execution_audit_execution_idx").on(t.executionId),
  index("candidate_execution_audit_lookup_idx").on(t.sport, t.gameId, t.executedAt),
  index("candidate_execution_audit_exact_artifact_idx").on(
    t.modelId, t.modelVersion, t.artifactHash, t.inputHash,
  ),
]);

/**
 * Immutable official identity attached to an existing model_predictions row.
 * Keeping this separate avoids rewriting old prediction evidence.
 */
export const officialPredictionIdentityTable = pgTable("official_prediction_identity", {
  id: serial("id").primaryKey(),
  predictionId: integer("prediction_id").notNull().references(() => modelPredictionsTable.id),
  sport: text("sport").notNull(),
  gameId: text("game_id").notNull(),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  line: real("line"),
  odds: integer("odds"),
  sportsbook: text("sportsbook"),
  engine: text("engine").notNull(),
  modelFamily: text("model_family").notNull(),
  modelVersion: text("model_version").notNull(),
  artifactId: text("artifact_id").notNull(),
  artifactHash: text("artifact_hash"),
  inputVersion: text("input_version").notNull(),
  inputSnapshotId: text("input_snapshot_id"),
  configurationHash: text("configuration_hash"),
  marketSnapshotId: text("market_snapshot_id"),
  servingMode: text("serving_mode").notNull(),
  approvalStatusAtPrediction: text("approval_status_at_prediction").notNull(),
  modelProbability: real("model_probability").notNull(),
  impliedProbability: real("implied_probability"),
  edge: real("edge").notNull(),
  confidence: text("confidence").notNull(),
  recommendation: text("recommendation").notNull(),
  units: real("units").notNull(),
  fallbackUsed: boolean("fallback_used").notNull(),
  fallbackReason: text("fallback_reason"),
  publicationStatus: text("publication_status").notNull(),
  predictionTimestamp: timestamp("prediction_timestamp", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("official_prediction_identity_prediction_idx").on(t.predictionId),
  index("official_prediction_identity_game_idx").on(t.gameId, t.market, t.predictionTimestamp),
]);

/** Append-only lifecycle facts; current state is the latest event, never an update. */
export const officialPredictionLifecycleTable = pgTable("official_prediction_lifecycle", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull(),
  officialIdentityId: integer("official_identity_id").notNull().references(() => officialPredictionIdentityTable.id),
  state: text("state").notNull(),
  reason: text("reason"),
  actor: text("actor").notNull(),
  evidenceReference: text("evidence_reference"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("official_prediction_lifecycle_event_idx").on(t.eventId),
  index("official_prediction_lifecycle_identity_idx").on(t.officialIdentityId, t.occurredAt),
]);

/** Versioned, sport-specific review policy. Policy evaluation cannot approve. */
export const modelReviewPoliciesTable = pgTable("model_review_policies", {
  id: serial("id").primaryKey(),
  policyId: text("policy_id").notNull(),
  sport: text("sport").notNull(),
  version: integer("version").notNull(),
  minimumGradedSample: integer("minimum_graded_sample").notNull(),
  minimumProspectiveSample: integer("minimum_prospective_sample").notNull(),
  minimumTeamDiversity: integer("minimum_team_diversity").notNull(),
  minimumOpponentDiversity: integer("minimum_opponent_diversity").notNull(),
  minimumStarterOrQbDiversity: integer("minimum_starter_or_qb_diversity"),
  minimumObservationDays: integer("minimum_observation_days").notNull(),
  calibrationRequired: boolean("calibration_required").notNull(),
  clvRequired: boolean("clv_required").notNull(),
  pitRequired: boolean("pit_required").notNull(),
  leakageAuditRequired: boolean("leakage_audit_required").notNull(),
  runtimeHealthRequired: boolean("runtime_health_required").notNull(),
  marketRequirements: jsonb("market_requirements").notNull(),
  governedActor: text("governed_actor").notNull(),
  reason: text("reason").notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("model_review_policy_id_idx").on(t.policyId),
  uniqueIndex("model_review_policy_sport_version_idx").on(t.sport, t.version),
]);

export const insertModelArtifactApprovalSchema = createInsertSchema(modelArtifactApprovalLedgerTable).omit({ id: true, createdAt: true });
export const insertGuardedServingAuditSchema = createInsertSchema(guardedServingAuditsTable).omit({ id: true, createdAt: true });
export const insertCandidateExecutionAuditSchema = createInsertSchema(candidateExecutionAuditsTable).omit({ id: true, createdAt: true });
export const insertOfficialPredictionIdentitySchema = createInsertSchema(officialPredictionIdentityTable).omit({ id: true, createdAt: true });
export const insertOfficialPredictionLifecycleSchema = createInsertSchema(officialPredictionLifecycleTable).omit({ id: true, createdAt: true });
export const insertModelReviewPolicySchema = createInsertSchema(modelReviewPoliciesTable).omit({ id: true, createdAt: true });

export type ModelArtifactApproval = typeof modelArtifactApprovalLedgerTable.$inferSelect;
export type InsertModelArtifactApproval = z.infer<typeof insertModelArtifactApprovalSchema>;
export type GuardedServingAudit = typeof guardedServingAuditsTable.$inferSelect;
export type CandidateExecutionAudit = typeof candidateExecutionAuditsTable.$inferSelect;
export type OfficialPredictionIdentity = typeof officialPredictionIdentityTable.$inferSelect;
export type OfficialPredictionLifecycle = typeof officialPredictionLifecycleTable.$inferSelect;
export type ModelReviewPolicy = typeof modelReviewPoliciesTable.$inferSelect;