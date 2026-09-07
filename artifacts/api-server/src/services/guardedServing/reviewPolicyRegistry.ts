import { and, desc, eq, lte } from "drizzle-orm";
import { db, modelReviewPoliciesTable } from "@workspace/db";
import { DEFAULT_REVIEW_POLICIES } from "./reviewEvaluator";
import type { ModelReviewPolicy } from "./reviewEvaluator";

/** Latest effective governed policy, with a sport-specific safe code default. */
export async function loadModelReviewPolicy(
  sport: "MLB" | "NCAAF" | "NFL",
  at = new Date(),
): Promise<ModelReviewPolicy> {
  const [row] = await db.select().from(modelReviewPoliciesTable)
    .where(and(eq(modelReviewPoliciesTable.sport, sport), lte(modelReviewPoliciesTable.effectiveAt, at)))
    .orderBy(desc(modelReviewPoliciesTable.version), desc(modelReviewPoliciesTable.id))
    .limit(1);
  if (!row) return DEFAULT_REVIEW_POLICIES[sport];
  return {
    sport,
    minimumGradedSample: row.minimumGradedSample,
    minimumProspectiveSample: row.minimumProspectiveSample,
    minimumTeamDiversity: row.minimumTeamDiversity,
    minimumOpponentDiversity: row.minimumOpponentDiversity,
    minimumStarterOrQbDiversity: row.minimumStarterOrQbDiversity,
    minimumObservationDays: row.minimumObservationDays,
    calibrationRequired: row.calibrationRequired,
    clvRequired: row.clvRequired,
    pitRequired: row.pitRequired,
    leakageAuditRequired: row.leakageAuditRequired,
    runtimeHealthRequired: row.runtimeHealthRequired,
    marketMinimums: row.marketRequirements as Record<string, number>,
  };
}