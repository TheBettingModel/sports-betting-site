import type { Sport } from '@/data/mockGames';

const SPORT_SLUG: Record<Sport, string | null> = {
  NFL: 'nfl',
  NCAAF: 'ncaa', // college football — ESPN CDN uses ncaa path with team abbr
  NBA: 'nba',
  NCAAB: 'ncaa', // college basketball — same ncaa path
  MLB: 'mlb',
  NHL: 'nhl',
  WNBA: 'wnba',
  Soccer: 'soccer',
  UFC: null, // UFC uses fighter headshots, not team logos
};

/**
 * Returns an ESPN CDN logo URL for a given sport + team abbreviation.
 * Returns null for sports without team logos (UFC).
 */
export function getTeamLogoUrl(sport: Sport, abbr: string): string | null {
  const slug = SPORT_SLUG[sport];
  if (!slug) return null;
  return `https://a.espncdn.com/i/teamlogos/${slug}/500/${abbr.toLowerCase()}.png`;
}
