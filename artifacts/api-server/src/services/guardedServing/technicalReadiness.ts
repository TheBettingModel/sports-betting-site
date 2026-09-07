import { and, count, desc, eq, sql } from "drizzle-orm";
import {
  candidateExecutionAuditsTable, db, guardedServingAuditsTable,
  modelArtifactApprovalLedgerTable, officialPredictionIdentityTable,
  officialPredictionLifecycleTable,
} from "@workspace/db";
import { GUARDED_SERVING_APPEND_ONLY_TABLES } from "./appendOnlyGuards";

const GUARDED_TABLE_NAMES_SQL = sql.raw(
  GUARDED_SERVING_APPEND_ONLY_TABLES.map((name) => `'${name}'`).join(","),
);

export type TechnicalReadinessInput = {
  executors: { mlb: boolean; ncaaf: boolean };
  executorHealth: { mlb: boolean; ncaaf: boolean };
  reproducibility: { mlb: boolean; ncaaf: boolean };
  freshInference: { mlb: boolean; ncaaf: boolean };
  bridges: { mlb: boolean; ncaaf: boolean };
  guardedResolver: boolean;
  fallback: boolean;
  killSwitch: boolean;
  dryRunSeparation: boolean;
  observability: {
    mlbExecutorAudit: boolean;
    ncaafExecutorAudit: boolean;
    mlbResolverObserved: boolean;
    ncaafResolverObserved: boolean;
    mlbSafeDispositionObserved: boolean;
    ncaafSafeDispositionObserved: boolean;
    appendOnlyMutationRejectionVerified: boolean;
    officialHistoryIntegrity: boolean;
  };
  schema: {
    tables: number;
    triggers: number;
    indexes: string[];
    constraints: string[];
  };
  approval: { mlb: boolean; ncaaf: boolean };
  officialIdentityCount: number;
  officialLifecycleCount: number;
};

/**
 * Pure and intentionally fail-closed. Technical readiness does not grant an
 * approval, and approval cannot compensate for absent technical controls.
 */
export function evaluateTechnicalCutoverReadiness(input: TechnicalReadinessInput) {
  const technicalBlockers: string[] = [];
  const evidenceBlockers: string[] = [];
  const approvalBlockers: string[] = [];
  const requiredIndexes = [
    "model_artifact_approval_event_idx", "model_artifact_approval_exact_idx",
    "guarded_serving_audit_id_idx", "guarded_serving_audit_lookup_idx",
    "candidate_execution_audit_execution_idx", "candidate_execution_audit_lookup_idx", "candidate_execution_audit_exact_artifact_idx",
    "official_prediction_identity_prediction_idx", "official_prediction_identity_game_idx",
    "official_prediction_lifecycle_event_idx", "official_prediction_lifecycle_identity_idx",
    "model_review_policy_id_idx", "model_review_policy_sport_version_idx",
  ];
  const requiredConstraints = [
    "model_artifact_approval_ledger:PRIMARY_KEY",
    "guarded_serving_audits:PRIMARY_KEY",
    "candidate_execution_audits:PRIMARY_KEY",
    "official_prediction_identity:PRIMARY_KEY",
    "official_prediction_lifecycle:PRIMARY_KEY",
    "model_review_policies:PRIMARY_KEY",
    "official_prediction_identity:model_predictions:FOREIGN_KEY",
    "official_prediction_lifecycle:official_prediction_identity:FOREIGN_KEY",
  ];

  if (!input.executors.mlb) technicalBlockers.push("MLB_AUTHENTIC_EXECUTOR_UNAVAILABLE");
  if (!input.executors.ncaaf) technicalBlockers.push("NCAAF_AUTHENTIC_EXECUTOR_UNAVAILABLE");
  if (!input.executorHealth.mlb) technicalBlockers.push("MLB_EXECUTOR_UNHEALTHY");
  if (!input.executorHealth.ncaaf) technicalBlockers.push("NCAAF_EXECUTOR_UNHEALTHY");
  if (!input.bridges.mlb) technicalBlockers.push("MLB_REQUIRED_BRIDGE_UNVERIFIED");
  if (!input.bridges.ncaaf) technicalBlockers.push("NCAAF_REQUIRED_BRIDGE_UNVERIFIED");
  if (!input.guardedResolver) technicalBlockers.push("GUARDED_RESOLVER_UNVERIFIED");
  if (!input.fallback) technicalBlockers.push("GUARDED_FALLBACK_UNVERIFIED");
  if (!input.killSwitch) technicalBlockers.push("KILL_SWITCH_UNVERIFIED");
  if (!input.dryRunSeparation) technicalBlockers.push("DRY_RUN_SEPARATION_UNVERIFIED");
  if (!input.observability.mlbExecutorAudit) technicalBlockers.push("MLB_EXECUTOR_OBSERVABILITY_UNVERIFIED");
  if (!input.observability.ncaafExecutorAudit) technicalBlockers.push("NCAAF_EXECUTOR_OBSERVABILITY_UNVERIFIED");
  if (!input.observability.mlbResolverObserved) technicalBlockers.push("MLB_GUARDED_RESOLVER_NOT_OBSERVED");
  if (!input.observability.ncaafResolverObserved) technicalBlockers.push("NCAAF_GUARDED_RESOLVER_NOT_OBSERVED");
  if (!input.observability.mlbSafeDispositionObserved) technicalBlockers.push("MLB_SAFE_FALLBACK_OR_PASS_NOT_OBSERVED");
  if (!input.observability.ncaafSafeDispositionObserved) technicalBlockers.push("NCAAF_SAFE_FALLBACK_OR_PASS_NOT_OBSERVED");
  if (!input.observability.appendOnlyMutationRejectionVerified) technicalBlockers.push("APPEND_ONLY_MUTATION_REJECTION_UNVERIFIED");
  if (!input.observability.officialHistoryIntegrity) technicalBlockers.push("OFFICIAL_HISTORY_INTEGRITY_UNVERIFIED");
  if (input.schema.tables !== GUARDED_SERVING_APPEND_ONLY_TABLES.length) technicalBlockers.push("GUARDED_SCHEMA_TABLES_UNVERIFIED");
  if (input.schema.triggers !== GUARDED_SERVING_APPEND_ONLY_TABLES.length * 2) technicalBlockers.push("APPEND_ONLY_TRIGGERS_UNVERIFIED");
  if (requiredIndexes.some((name) => !input.schema.indexes.includes(name))) technicalBlockers.push("GUARDED_SCHEMA_INDEXES_UNVERIFIED");
  if (requiredConstraints.some((name) => !input.schema.constraints.includes(name))) technicalBlockers.push("GUARDED_SCHEMA_CONSTRAINTS_UNVERIFIED");

  if (!input.freshInference.mlb) evidenceBlockers.push("MLB_FRESH_AUTHENTIC_INFERENCE_UNVERIFIED");
  if (!input.freshInference.ncaaf) evidenceBlockers.push("NCAAF_FRESH_AUTHENTIC_INFERENCE_UNVERIFIED");
  if (!input.reproducibility.mlb) evidenceBlockers.push("MLB_REPRODUCIBILITY_UNVERIFIED");
  if (!input.reproducibility.ncaaf) evidenceBlockers.push("NCAAF_REPRODUCIBILITY_UNVERIFIED");
  if (!input.approval.mlb) approvalBlockers.push("MLB_GUARDED_APPROVAL_MISSING");
  if (!input.approval.ncaaf) approvalBlockers.push("NCAAF_GUARDED_APPROVAL_MISSING");

  return {
    TECHNICAL_CUTOVER_READY: technicalBlockers.length === 0,
    MODEL_EVIDENCE_READY: evidenceBlockers.length === 0,
    GUARDED_APPROVED: approvalBlockers.length === 0,
    technicalBlockers,
    modelEvidenceBlockers: evidenceBlockers,
    guardedApprovalBlockers: approvalBlockers,
  };
}

const MAX_SAFE_EXECUTION_AGE_MS = 24 * 60 * 60 * 1000;
type LatestExecution = { executedAt: Date; reproducible: boolean; executorHealth: string; pitSafe: boolean; leakageSafe: boolean };

async function latestSafeExecution(sport: "MLB" | "NCAAF"): Promise<LatestExecution | null> {
  const [row] = await db.select({
    executedAt: candidateExecutionAuditsTable.executedAt,
    reproducible: candidateExecutionAuditsTable.reproducible,
    executorHealth: candidateExecutionAuditsTable.executorHealth,
    pitSafe: candidateExecutionAuditsTable.pitSafe,
    leakageSafe: candidateExecutionAuditsTable.leakageSafe,
  }).from(candidateExecutionAuditsTable)
    .where(and(eq(candidateExecutionAuditsTable.sport, sport), eq(candidateExecutionAuditsTable.dryRun, true)))
    .orderBy(desc(candidateExecutionAuditsTable.executedAt)).limit(1);
  return row ?? null;
}

export async function inspectGuardedPersistenceReadiness() {
  const [
    metadata, approvalRows, identities, lifecycle, mlbExecution, ncaafExecution,
    mlbAudit, ncaafAudit, orphanedPredictions, orphanedLifecycle, identitiesWithoutLifecycle,
  ] = await Promise.all([
    db.execute<{ tables: number; triggers: number; indexes: string[]; constraints: string[] }>(sql`
      SELECT
        (SELECT count(*)::int FROM pg_class WHERE relkind = 'r'
          AND relname = ANY(ARRAY[${GUARDED_TABLE_NAMES_SQL}])) AS tables,
        (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          WHERE NOT t.tgisinternal AND c.relname = ANY(ARRAY[${GUARDED_TABLE_NAMES_SQL}])
          AND t.tgname IN (c.relname || '_block_row_mutation', c.relname || '_block_truncate')) AS triggers,
        COALESCE(ARRAY(SELECT indexname::text FROM pg_indexes
          WHERE tablename = ANY(ARRAY[${GUARDED_TABLE_NAMES_SQL}])
          ORDER BY indexname), ARRAY[]::text[]) AS indexes,
        COALESCE(ARRAY(SELECT token::text FROM (
          SELECT c.relname || ':PRIMARY_KEY' AS token
          FROM pg_constraint co
          JOIN pg_class c ON c.oid = co.conrelid
          WHERE co.contype = 'p' AND c.relname = ANY(ARRAY[${GUARDED_TABLE_NAMES_SQL}])
          UNION ALL
          SELECT c.relname || ':' || referenced.relname || ':FOREIGN_KEY' AS token
          FROM pg_constraint co
          JOIN pg_class c ON c.oid = co.conrelid
          JOIN pg_class referenced ON referenced.oid = co.confrelid
          WHERE co.contype = 'f' AND c.relname = ANY(ARRAY[${GUARDED_TABLE_NAMES_SQL}])
        ) semantic_constraints ORDER BY token), ARRAY[]::text[]) AS constraints
    `),
    db.select({ count: count() }).from(modelArtifactApprovalLedgerTable),
    db.select({ count: count() }).from(officialPredictionIdentityTable),
    db.select({ count: count() }).from(officialPredictionLifecycleTable),
    latestSafeExecution("MLB"),
    latestSafeExecution("NCAAF"),
    db.select({
      resolvedAt: guardedServingAuditsTable.resolvedAt,
      dryRun: guardedServingAuditsTable.dryRun,
      resolution: guardedServingAuditsTable.resolution,
      fallbackUsed: guardedServingAuditsTable.fallbackUsed,
      publicationDisposition: guardedServingAuditsTable.publicationDisposition,
    }).from(guardedServingAuditsTable).where(and(eq(guardedServingAuditsTable.sport, "MLB"), eq(guardedServingAuditsTable.dryRun, true))).orderBy(desc(guardedServingAuditsTable.resolvedAt)).limit(1),
    db.select({
      resolvedAt: guardedServingAuditsTable.resolvedAt,
      dryRun: guardedServingAuditsTable.dryRun,
      resolution: guardedServingAuditsTable.resolution,
      fallbackUsed: guardedServingAuditsTable.fallbackUsed,
      publicationDisposition: guardedServingAuditsTable.publicationDisposition,
    }).from(guardedServingAuditsTable).where(and(eq(guardedServingAuditsTable.sport, "NCAAF"), eq(guardedServingAuditsTable.dryRun, true))).orderBy(desc(guardedServingAuditsTable.resolvedAt)).limit(1),
    db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM official_prediction_identity i LEFT JOIN model_predictions p ON p.id = i.prediction_id WHERE p.id IS NULL`),
    db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM official_prediction_lifecycle l LEFT JOIN official_prediction_identity i ON i.id = l.official_identity_id WHERE i.id IS NULL`),
    db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM official_prediction_identity i WHERE NOT EXISTS (SELECT 1 FROM official_prediction_lifecycle l WHERE l.official_identity_id = i.id)`),
  ]);
  const now = Date.now();
  const safe = (execution: LatestExecution | null) => Boolean(
    execution
    && now - execution.executedAt.getTime() >= 0
    && now - execution.executedAt.getTime() <= MAX_SAFE_EXECUTION_AGE_MS
    && execution.executorHealth === "HEALTHY"
    && execution.reproducible && execution.pitSafe && execution.leakageSafe,
  );
  const audit = (rows: typeof mlbAudit) => rows[0] ?? null;
  return {
    schema: metadata.rows[0] ?? { tables: 0, triggers: 0, indexes: [], constraints: [] },
    counts: {
      approvalLedger: approvalRows[0]?.count ?? 0,
      officialIdentity: identities[0]?.count ?? 0,
      officialLifecycle: lifecycle[0]?.count ?? 0,
    },
    environment: process.env.NODE_ENV === "production" ? "PRODUCTION" : "NON_PRODUCTION",
    maxSafeExecutionAgeHours: MAX_SAFE_EXECUTION_AGE_MS / (60 * 60 * 1000),
    // Mutation-rejection outcomes are not persisted by this schema, so this remains
    // false until a managed-production test adds durable evidence.
    latestSafeMutationVerification: null,
    appendOnlyMutationRejectionVerified: false,
    latestDryRunResolutions: { mlb: audit(mlbAudit), ncaaf: audit(ncaafAudit) },
    latestSafeExecutions: {
      mlb: mlbExecution ? { ...mlbExecution, safe: safe(mlbExecution) } : null,
      ncaaf: ncaafExecution ? { ...ncaafExecution, safe: safe(ncaafExecution) } : null,
    },
    officialHistoryIntegrity: {
      orphanedPredictionIdentities: orphanedPredictions.rows[0]?.count ?? 0,
      orphanedLifecycleEvents: orphanedLifecycle.rows[0]?.count ?? 0,
      identitiesWithoutLifecycle: identitiesWithoutLifecycle.rows[0]?.count ?? 0,
    },
  };
}