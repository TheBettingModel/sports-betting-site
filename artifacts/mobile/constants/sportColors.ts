/**
 * Single authoritative sport colour palette.
 * Import from here — never define local SPORT_COLORS maps in components.
 */
export const SPORT_COLORS: Record<string, string> = {
  NFL:    '#6366F1', // indigo
  NBA:    '#F97316', // orange
  MLB:    '#3B82F6', // blue
  NHL:    '#A78BFA', // purple
  Soccer: '#34D399', // emerald
  UFC:    '#F87171', // red
  WNBA:   '#FB923C', // amber-orange
  NCAAF:  '#6366F1',
  NCAAB:  '#F97316',
};

export function getSportColor(sport: string): string {
  return SPORT_COLORS[sport] ?? '#6B7280';
}
