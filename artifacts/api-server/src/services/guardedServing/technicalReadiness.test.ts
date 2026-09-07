import { describe, expect, it } from "vitest";
import { evaluateTechnicalCutoverReadiness, type TechnicalReadinessInput } from "./technicalReadiness";

const ready: TechnicalReadinessInput = {
  executors: { mlb: true, ncaaf: true },
  executorHealth: { mlb: true, ncaaf: true },
  reproducibility: { mlb: true, ncaaf: true },
  freshInference: { mlb: true, ncaaf: true },
  bridges: { mlb: true, ncaaf: true },
  guardedResolver: true, fallback: true, killSwitch: true, dryRunSeparation: true,
  observability: {
    mlbExecutorAudit: true, ncaafExecutorAudit: true,
    mlbResolverObserved: true, ncaafResolverObserved: true,
    mlbSafeDispositionObserved: true, ncaafSafeDispositionObserved: true,
    appendOnlyMutationRejectionVerified: true, officialHistoryIntegrity: true,
  },
  schema: {
    tables: 6, triggers: 12,
    indexes: [
      "model_artifact_approval_event_idx", "model_artifact_approval_exact_idx",
      "guarded_serving_audit_id_idx", "guarded_serving_audit_lookup_idx",
      "candidate_execution_audit_execution_idx", "candidate_execution_audit_lookup_idx",
      "candidate_execution_audit_exact_artifact_idx",
      "official_prediction_identity_prediction_idx", "official_prediction_identity_game_idx",
      "official_prediction_lifecycle_event_idx", "official_prediction_lifecycle_identity_idx",
      "model_review_policy_id_idx", "model_review_policy_sport_version_idx",
    ],
    constraints: [
      "model_artifact_approval_ledger:PRIMARY_KEY",
      "guarded_serving_audits:PRIMARY_KEY",
      "candidate_execution_audits:PRIMARY_KEY",
      "official_prediction_identity:PRIMARY_KEY",
      "official_prediction_lifecycle:PRIMARY_KEY",
      "model_review_policies:PRIMARY_KEY",
      "official_prediction_identity:model_predictions:FOREIGN_KEY",
      "official_prediction_lifecycle:official_prediction_identity:FOREIGN_KEY",
    ],
  },
  approval: { mlb: true, ncaaf: true },
  officialIdentityCount: 0, officialLifecycleCount: 0,
};

describe("technical cutover readiness", () => {
  it("keeps technical, evidence, and approval decisions separate", () => {
    const status = evaluateTechnicalCutoverReadiness({
      ...ready,
      approval: { mlb: false, ncaaf: false },
      reproducibility: { mlb: false, ncaaf: false },
    });
    expect(status.TECHNICAL_CUTOVER_READY).toBe(true);
    expect(status.MODEL_EVIDENCE_READY).toBe(false);
    expect(status.GUARDED_APPROVED).toBe(false);
  });

  it("fails closed for current MLB executor absence even when approval is present", () => {
    const status = evaluateTechnicalCutoverReadiness({
      ...ready, executors: { ...ready.executors, mlb: false },
      executorHealth: { ...ready.executorHealth, mlb: false },
    });
    expect(status.TECHNICAL_CUTOVER_READY).toBe(false);
    expect(status.technicalBlockers).toEqual(expect.arrayContaining([
      "MLB_AUTHENTIC_EXECUTOR_UNAVAILABLE", "MLB_EXECUTOR_UNHEALTHY",
    ]));
    expect(status.GUARDED_APPROVED).toBe(true);
  });

  it("fails closed when production append-only observability is incomplete", () => {
    const status = evaluateTechnicalCutoverReadiness({
      ...ready, schema: { tables: 0, triggers: 0, indexes: [], constraints: [] },
      dryRunSeparation: false,
      observability: { ...ready.observability, appendOnlyMutationRejectionVerified: false },
    });
    expect(status.TECHNICAL_CUTOVER_READY).toBe(false);
    expect(status.technicalBlockers).toEqual(expect.arrayContaining([
      "GUARDED_SCHEMA_TABLES_UNVERIFIED", "APPEND_ONLY_TRIGGERS_UNVERIFIED",
      "GUARDED_SCHEMA_INDEXES_UNVERIFIED", "GUARDED_SCHEMA_CONSTRAINTS_UNVERIFIED",
      "DRY_RUN_SEPARATION_UNVERIFIED", "APPEND_ONLY_MUTATION_REJECTION_UNVERIFIED",
    ]));
  });
});