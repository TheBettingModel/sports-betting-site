/**
 * Team logo URL helper — IP-safe stub.
 *
 * ESPN CDN URLs have been removed to avoid third-party intellectual-property
 * concerns under App Store Review Guideline 5.2.2. TeamLogo renders
 * sport-coloured monogram badges locally with no external image requests.
 *
 * Kept as a no-op so existing import sites compile without changes.
 */
import type { Sport } from '@/data/mockGames';

export function getTeamLogoUrl(
  _sport: Sport,
  _abbr: string,
  _teamId?: string | null,
): null {
  return null;
}
