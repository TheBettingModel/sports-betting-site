import type { Sport } from '@/data/mockGames';

const SPORT_SLUG: Record<Sport, string | null> = {
  NFL: 'nfl',
  NCAAF: 'ncaa',
  NBA: 'nba',
  NCAAB: 'ncaa',
  MLB: 'mlb',
  NHL: 'nhl',
  WNBA: 'wnba',
  Soccer: null, // handled separately — uses ESPN numeric team IDs
  UFC: null,    // UFC uses fighter headshots, not team logos
};

/**
 * MLS team abbreviation → ESPN numeric team ID.
 * Used as a fallback when the ESPN ID is not passed directly.
 * Source: site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams
 */
const MLS_TEAM_IDS: Record<string, string> = {
  ATL:  '18418', // Atlanta United FC
  ATX:  '20906', // Austin FC
  MTL:  '9720',  // CF Montréal
  CLT:  '21300', // Charlotte FC
  CHI:  '182',   // Chicago Fire FC
  COL:  '184',   // Colorado Rapids
  CLB:  '183',   // Columbus Crew
  DC:   '193',   // D.C. United
  CIN:  '18267', // FC Cincinnati
  DAL:  '185',   // FC Dallas
  HOU:  '6077',  // Houston Dynamo FC
  MIA:  '20232', // Inter Miami CF
  LA:   '187',   // LA Galaxy
  LAFC: '18966', // LAFC
  MIN:  '17362', // Minnesota United FC
  NSH:  '18986', // Nashville SC
  NE:   '189',   // New England Revolution
  NYC:  '17606', // New York City FC
  ORL:  '12011', // Orlando City SC
  PHI:  '10739', // Philadelphia Union
  POR:  '9723',  // Portland Timbers
  RSL:  '4771',  // Real Salt Lake
  RBNY: '190',   // Red Bull New York
  SD:   '22529', // San Diego FC
  SJ:   '191',   // San Jose Earthquakes
  SEA:  '9726',  // Seattle Sounders FC
  SKC:  '186',   // Sporting Kansas City
  STL:  '21812', // St. Louis CITY SC
  TOR:  '7318',  // Toronto FC
  VAN:  '9727',  // Vancouver Whitecaps
};

/**
 * Returns an ESPN CDN logo URL for a given sport + team.
 *
 * For Soccer: prefers the ESPN numeric `teamId` (works for any league —
 * MLS, EPL, La Liga, etc.). Falls back to the MLS abbreviation lookup.
 * Returns null when no ID can be resolved (new or unknown teams).
 *
 * For all other sports: uses the team abbreviation with the sport CDN slug.
 * Returns null for sports without team logos (UFC).
 */
export function getTeamLogoUrl(
  sport: Sport,
  abbr: string,
  teamId?: string | null,
): string | null {
  if (sport === 'Soccer') {
    // Prefer direct ESPN team ID (works for all leagues)
    const id = teamId ?? MLS_TEAM_IDS[abbr.toUpperCase()];
    if (!id) return null;
    return `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
  }

  const slug = SPORT_SLUG[sport];
  if (!slug) return null;
  return `https://a.espncdn.com/i/teamlogos/${slug}/500/${abbr.toLowerCase()}.png`;
}
