/**
 * Team logo URL helper — IP-safe stub.
 *
 * ESPN CDN URLs have been removed to avoid third-party intellectual-property
 * concerns under App Store Review Guideline 5.2.2. TeamLogo now renders
 * sport-coloured monogram badges locally with no external image requests.
 *
 * This file is kept as a no-op so any existing import sites compile without
 * changes. All callers receive null and TeamLogo's badge fallback is used.
 */

export function getTeamLogoUrl(_sport: string, _abbr: string): null {
  return null;
}
