/**
 * Recommendation tiers that may contribute to the subscriber-facing record.
 *
 * Lower-confidence forecasts remain available for model calibration and
 * coverage review, but are not wagers in the official performance ledger.
 */
export const OFFICIAL_RECORD_RECOMMENDATIONS = ["Strong Buy", "Buy"] as const;

export function isOfficialRecordRecommendation(recommendation: string): boolean {
  return (OFFICIAL_RECORD_RECOMMENDATIONS as readonly string[]).includes(recommendation);
}