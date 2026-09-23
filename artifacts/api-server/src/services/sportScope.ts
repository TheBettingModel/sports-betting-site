/**
 * Product-release sport scope.
 *
 * Archived sports remain valid domain values so their historical games,
 * predictions, and grades can be retained and rebuilt later. Active jobs and
 * subscriber-facing reads must use this scope rather than treating every
 * stored sport as currently supported.
 */
export const ARCHIVED_PRODUCT_SPORTS = Object.freeze(["UFC"] as const);
export type ArchivedProductSport = typeof ARCHIVED_PRODUCT_SPORTS[number];

export const ACTIVE_PRODUCT_SPORTS = Object.freeze([
  "MLB", "NFL", "NHL", "NBA", "WNBA", "NCAAB", "NCAAF", "Soccer",
] as const);

export function isArchivedProductSport(sport: string): sport is ArchivedProductSport {
  return (ARCHIVED_PRODUCT_SPORTS as readonly string[]).includes(sport.toUpperCase());
}

/** Guard for ingestion, recovery, modelling, publication, and public reads. */
export function isActiveProductSport(sport: string): boolean {
  return !isArchivedProductSport(sport)
    && (ACTIVE_PRODUCT_SPORTS as readonly string[]).includes(sport);
}