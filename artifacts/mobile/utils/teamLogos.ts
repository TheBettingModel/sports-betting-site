/**
 * ESPN CDN logo URLs for all supported sports.
 *
 * Uses the team abbreviation (lowercase) as the path segment — ESPN updates
 * these in place when teams rebrand (e.g. Cleveland Indians → Guardians is
 * at /mlb/500/cle.png and always serves the current logo).
 *
 * Numeric-ID URLs like /mlb/500/5.png can serve stale assets for rebranded
 * teams, so we intentionally use the abbreviation form instead.
 *
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

export function getTeamLogoUrl(sport: string, abbr: string): string | null {
  const key = SPORT_KEY[sport];
  if (!key || !abbr) return null; // UFC, unknown sports
  return `https://a.espncdn.com/i/teamlogos/${key}/500/${abbr.toLowerCase()}.png`;
}
