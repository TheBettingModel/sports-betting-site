/**
 * MLB Park Factors
 *
 * Static run factor lookup keyed by ESPN home team abbreviation.
 * Source: Fangraphs multi-year park factors (2022–2025 average).
 *
 * 100 = league-average run environment.
 * >100 = hitter-friendly (more runs scored per game).
 * <100 = pitcher-friendly (fewer runs, defense/pitching dominates).
 *
 * Why this matters for moneylines:
 *   In a high-run park (Coors: 117), run-scoring variance increases so
 *   outcomes are less predictable — win probability compresses toward 50%.
 *   In a pitcher's park (Petco: 92), lower variance means team quality
 *   expresses itself more reliably — win probability expands away from 50%.
 *
 * Update the table at the start of each season. Park factors are stable
 * year-to-year (Coors is always Coors), so this rarely needs major changes.
 */

const PARK_RUN_FACTOR: Record<string, number> = {
  COL: 117, // Coors Field         — altitude 5,280 ft, extreme hitter's park
  CIN: 112, // Great American Ball Park
  PHI: 110, // Citizens Bank Park
  ATL: 109, // Truist Park
  BOS: 108, // Fenway Park
  HOU: 107, // Minute Maid Park    — retractable roof
  TEX: 107, // Globe Life Field    — retractable roof
  KC:  105, // Kauffman Stadium
  MIL: 104, // American Family Field — retractable roof
  DET: 104, // Comerica Park
  NYM: 103, // Citi Field
  LAA: 103, // Angel Stadium
  BAL: 102, // Camden Yards
  NYY: 101, // Yankee Stadium
  LAD: 100, // Dodger Stadium      — neutral baseline
  MIN: 100, // Target Field
  TOR:  99, // Rogers Centre       — dome (climate-controlled)
  STL:  99, // Busch Stadium
  WSH:  98, // Nationals Park
  CLE:  97, // Progressive Field
  SEA:  97, // T-Mobile Park       — retractable roof, marine layer effect
  CHC:  96, // Wrigley Field       — wind-variable; averages near neutral
  PIT:  96, // PNC Park
  TB:   95, // Tropicana Field     — dome
  CWS:  95, // Guaranteed Rate Field
  ARI:  95, // Chase Field         — dome
  SF:   94, // Oracle Park         — marine layer, large foul territory
  ATH:  93, // Sutter Health Park  — Sacramento (Athletics)
  SD:   92, // Petco Park          — pitcher-friendly, marine layer
  MIA:  90, // loanDepot Park      — dome, significant pitcher advantage
};

/**
 * Return the park run factor (100 = neutral) for the given home team.
 * Falls back to 100 (neutral) when the team is not in the table.
 */
export function getParkFactor(homeTeamAbbr: string): number {
  return PARK_RUN_FACTOR[homeTeamAbbr] ?? 100;
}
