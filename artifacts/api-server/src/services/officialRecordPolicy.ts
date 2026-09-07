import { and, eq, gte, inArray, isNull, ne, notExists, or } from "drizzle-orm";
import {
  db,
  gamesTable,
  modelPredictionsTable,
  modelVersionsTable,
  pickResultsTable,
  publishedPickPerformanceClassificationsTable,
  publishedPicksTable,
} from "@workspace/db";

/**
 * Recommendation tiers that may contribute to the subscriber-facing record.
 *
 * Lower-confidence forecasts remain available for model calibration and
 * coverage review, but are not wagers in the official performance ledger.
 */
export const OFFICIAL_RECORD_RECOMMENDATIONS = ["Strong Buy", "Buy"] as const;
export const OFFICIAL_RECORD_SETTLED_RESULTS = ["win", "loss", "push"] as const;
export const OFFICIAL_RECORD_PREDICTION_COHORT = "official";

export function isOfficialRecordRecommendation(recommendation: string): boolean {
  return (OFFICIAL_RECORD_RECOMMENDATIONS as readonly string[]).includes(recommendation);
}

/** A wager must have a decisive or push settlement before entering the record. */
export function isOfficialRecordSettledResult(result: string): boolean {
  return (OFFICIAL_RECORD_SETTLED_RESULTS as readonly string[]).includes(result);
}

/** Shadow and research prediction snapshots are never subscriber record evidence. */
export function isOfficialRecordPredictionCohort(
  cohort: string | null,
  isChallenger = false,
): boolean {
  return !isChallenger && (cohort == null || cohort === OFFICIAL_RECORD_PREDICTION_COHORT);
}

/**
 * Canonical predicates for subscriber-facing performance evidence.
 *
 * Callers must join published picks to predictions and model versions before
 * applying these conditions. A correlated NOT EXISTS is used for the
 * append-only classification ledger so historical classifications cannot
 * multiply a pick in aggregate results.
 */
export function officialPublicRecordSqlConditions(nflSeasonStart?: string) {
  const conditions = [
    inArray(pickResultsTable.result, OFFICIAL_RECORD_SETTLED_RESULTS),
    eq(publishedPicksTable.isEffective, true),
    eq(publishedPicksTable.isPublic, true),
    inArray(publishedPicksTable.recommendation, OFFICIAL_RECORD_RECOMMENDATIONS),
    eq(modelPredictionsTable.isChallenger, false),
    or(
      isNull(modelPredictionsTable.cohort),
      eq(modelPredictionsTable.cohort, OFFICIAL_RECORD_PREDICTION_COHORT),
    ),
    eq(modelVersionsTable.status, "production"),
    notExists(
      db
        .select({ id: publishedPickPerformanceClassificationsTable.id })
        .from(publishedPickPerformanceClassificationsTable)
        .where(and(
          eq(
            publishedPickPerformanceClassificationsTable.publishedPickId,
            publishedPicksTable.id,
          ),
          eq(publishedPickPerformanceClassificationsTable.performanceEligible, false),
        )),
    ),
  ];

  // Game-aware readers retain the established NFL preseason exclusion.
  if (nflSeasonStart) {
    const nflRegularSeason = or(
      ne(gamesTable.sport, "NFL"),
      gte(gamesTable.gameDate, nflSeasonStart),
    );
    if (nflRegularSeason) conditions.push(nflRegularSeason);
  }
  return conditions;
}