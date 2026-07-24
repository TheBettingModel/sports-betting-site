/**
 * ESPN CDN logo URLs for all supported sports.
 * Returns null for sports without team logos (UFC — individual fighters).
 */

const SPORT_KEY: Record<string, string> = {
  MLB:    'mlb',
  NBA:    'nba',
  NFL:    'nfl',
  NHL:    'nhl',
  WNBA:   'wnba',
  NCAAF:  'college-football',
  NCAAB:  'mens-college-basketball',
  Soccer: 'soccer',
};

export function getTeamLogoUrl(sport: string, espnId: string | undefined): string | null {
  if (!espnId) return null;
  const key = SPORT_KEY[sport];
  if (!key) return null; // UFC etc.
  return `https://a.espncdn.com/i/teamlogos/${key}/500/${espnId}.png`;
}
