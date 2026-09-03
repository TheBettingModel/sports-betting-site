import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";

export const LEGACY_NCAAF_INVALID_CLASSIFICATION = "LEGACY_INVALID_NON_ACTIONABLE";
export const LEGACY_NCAAF_NEUTRAL_REASON = "NEUTRAL_NORMALIZED_TO_WAGER";

/**
 * Isolate precisely the old NCAAF v1 Neutral rows which were incorrectly
 * normalized into one-unit private publications. This writes only a separate
 * append-only eligibility fact; it never mutates source predictions, picks, or
 * results. The immutable model id fallback keeps the identity stable if a
 * restored database has a different numeric registry id.
 */
export async function reconcileLegacyNcaafPerformanceEligibility(): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO published_pick_performance_classifications (
      published_pick_id,
      classification,
      reason_code,
      performance_eligible
    )
    SELECT
      pick.id,
      ${LEGACY_NCAAF_INVALID_CLASSIFICATION},
      ${LEGACY_NCAAF_NEUTRAL_REASON},
      false
    FROM published_picks AS pick
    INNER JOIN model_predictions AS prediction ON prediction.id = pick.prediction_id
    INNER JOIN model_versions AS version ON version.id = prediction.model_version_id
    WHERE pick.sport = 'NCAAF'
      AND prediction.sport = 'NCAAF'
      AND (prediction.model_version_id = 21 OR version.model_id = 'tbm-ncaaf-moneyline-v1')
      AND pick.recommendation = 'Neutral'
      AND pick.is_public = false
      AND pick.is_effective = true
      AND pick.units = 1.0
      AND (
        prediction.feature_snapshot->>'schemaVersion' IS NULL
        OR prediction.feature_snapshot->>'schemaVersion' <> '4'
        OR NOT (prediction.feature_snapshot ? 'ncaafFeature')
      )
    ON CONFLICT (published_pick_id, classification, reason_code) DO NOTHING
  `);
  const classified = result.rowCount ?? 0;
  logger.info({ classified }, "Legacy NCAAF non-actionable publications classified");
  return classified;
}

/** A single authoritative SQL predicate for performance and learning readers. */
export function isPerformanceEligiblePublishedPickSql(pickId: unknown) {
  return sql`NOT EXISTS (
    SELECT 1
    FROM published_pick_performance_classifications AS eligibility
    WHERE eligibility.published_pick_id = ${pickId}
      AND eligibility.performance_eligible = false
  )`;
}