import { guardedServingConfig, type GuardedServingConfig } from "./config";
import { getCurrentMlbCandidateIdentity, getCurrentNcaafCandidateIdentity } from "./candidateRegistry";
import { resolveExactApproval } from "./approvalRegistry";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function validateGuardedServingStartup(
  config: GuardedServingConfig = guardedServingConfig,
): Promise<{
  config: GuardedServingConfig;
  mlb: { registryPresent: boolean; approval: string };
  ncaaf: { registryPresent: boolean; approval: string };
}> {
  const mlbIdentity = await getCurrentMlbCandidateIdentity();
  const ncaafIdentity = getCurrentNcaafCandidateIdentity();
  const nextgenConfigured = config.mlbMode !== "v1" || config.ncaafMode !== "legacy";
  if (nextgenConfigured) {
    const schema = await db.execute<{ tables: number; triggers: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM pg_class WHERE relname IN (
          'model_artifact_approval_ledger', 'guarded_serving_audits',
          'official_prediction_identity', 'official_prediction_lifecycle', 'model_review_policies'
        )) AS tables,
        (SELECT count(*)::int
           FROM pg_trigger
           JOIN pg_class ON pg_class.oid = tgrelid
          WHERE NOT tgisinternal
            AND relname IN (
              'model_artifact_approval_ledger', 'guarded_serving_audits',
              'official_prediction_identity', 'official_prediction_lifecycle', 'model_review_policies'
            )
            AND tgname IN (relname || '_block_row_mutation', relname || '_block_truncate')) AS triggers
    `);
    const readiness = schema.rows[0];
    if (!readiness || readiness.tables !== 5 || readiness.triggers !== 10) {
      throw new Error("Guarded-serving managed schema/append-only triggers are not verified; publish-time schema verification is required");
    }
  }
  if (config.mlbMode !== "v1" && !mlbIdentity) {
    throw new Error("MLB next-generation mode configured but exact candidate registry record is missing");
  }
  if (nextgenConfigured) {
    throw new Error("Next-generation serving mode configured but no authentic typed production candidate executor is available");
  }
  const [mlbApproval, ncaafApproval] = await Promise.all([
    mlbIdentity
      ? resolveExactApproval(mlbIdentity, config.mlbMode === "v4" ? "full" : "guarded")
      : Promise.resolve({ state: "UNVALIDATED" as const }),
    resolveExactApproval(ncaafIdentity, config.ncaafMode === "nextgen" ? "full" : "guarded"),
  ]);
  return {
    config,
    mlb: { registryPresent: mlbIdentity !== null, approval: mlbApproval.state },
    ncaaf: { registryPresent: true, approval: ncaafApproval.state },
  };
}