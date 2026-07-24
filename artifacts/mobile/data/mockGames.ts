export type Sport = 'NFL' | 'NCAAF' | 'NBA' | 'NCAAB' | 'MLB' | 'NHL' | 'Soccer' | 'UFC' | 'WNBA';
export type ValueRating = 'Strong Buy' | 'Buy' | 'Neutral' | 'Fade';
export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface Team {
  name: string;
  abbr: string;
  record: string;
  city: string;
  /** ESPN numeric team ID */
  espnId?: string;
  /** ESPN CDN logo URL — stored at ingestion time, always current */
  logoUrl?: string;
}

export interface Game {
  id: string;
  sport: Sport;
  /** Sub-league label (e.g. "EPL", "MLS", "La Liga") — Soccer only */
  league?: string;
  homeTeam: Team;
  awayTeam: Team;
  gameTime: string;
  status: 'upcoming' | 'live' | 'final';
  /** True when the server has gated this game's premium data (non-subscriber). */
  isLocked?: boolean;
  /**
   * 1–2 human-readable signals explaining why the model favours this pick.
   * Computed in the client adapter from projection fields; not stored on the server.
   */
  insights?: string[];
  projection: {
    homeWinPct: number;
    confidence: ConfidenceLevel;
    projectedSpread: number;
    projectedTotal: number;
    valueRating: ValueRating;
    modelScore: number;  // 0–100 universal final rating
    edge: number;        // % edge vs market
    // Phase 1: enhanced model fields
    confidenceNum?: number;   // 0–100 numeric confidence
    units?: number;           // dynamic unit sizing (0.5–3.0; 0 = no bet)
    sharpScore?: number;      // 0–5 sharp signal strength
    sharpSignal?: string;     // "Sharp Play" | "Value Watch" | "Neutral Signal" | "No Signal"
    finalModelScore?: number; // universal final rating
    finalModelTier?: string;  // "Elite" | "Strong" | "Playable" | "Watchlist" | "Pass"
    finalModelStars?: number; // 1–5
    podScore?: number;        // cross-sport ranking score
  };
  vegasLine: {
    spread: number;
    total: number;
    homeOdds: number;
    awayOdds: number;
    /** Draw moneyline — present for Soccer (0 = N/A) */
    drawOdds?: number;
  };
}

export const MOCK_GAMES: Game[] = [
  // ─── MLB ───────────────────────────────────────────────────
  {
    id: 'mlb1',
    sport: 'MLB',
    homeTeam: { name: 'Yankees', abbr: 'NYY', record: '62-38', city: 'New York' },
    awayTeam: { name: 'Red Sox', abbr: 'BOS', record: '54-46', city: 'Boston' },
    gameTime: '7:05 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 68, confidence: 'High', projectedSpread: -1.5, projectedTotal: 9.2, valueRating: 'Strong Buy', modelScore: 91, edge: 14.2 },
    vegasLine: { spread: -1.5, total: 8.5, homeOdds: -145, awayOdds: 125 },
  },
  {
    id: 'mlb2',
    sport: 'MLB',
    homeTeam: { name: 'Dodgers', abbr: 'LAD', record: '71-29', city: 'Los Angeles' },
    awayTeam: { name: 'Giants', abbr: 'SF', record: '48-52', city: 'San Francisco' },
    gameTime: '10:10 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 72, confidence: 'High', projectedSpread: -2.5, projectedTotal: 8.8, valueRating: 'Buy', modelScore: 85, edge: 8.7 },
    vegasLine: { spread: -1.5, total: 8.0, homeOdds: -160, awayOdds: 140 },
  },
  {
    id: 'mlb3',
    sport: 'MLB',
    homeTeam: { name: 'Braves', abbr: 'ATL', record: '59-41', city: 'Atlanta' },
    awayTeam: { name: 'Mets', abbr: 'NYM', record: '55-45', city: 'New York' },
    gameTime: '7:20 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 54, confidence: 'Low', projectedSpread: -0.5, projectedTotal: 9.5, valueRating: 'Neutral', modelScore: 61, edge: 2.1 },
    vegasLine: { spread: -1.5, total: 9.0, homeOdds: -120, awayOdds: 100 },
  },
  {
    id: 'mlb4',
    sport: 'MLB',
    homeTeam: { name: 'Astros', abbr: 'HOU', record: '58-42', city: 'Houston' },
    awayTeam: { name: 'Rangers', abbr: 'TEX', record: '51-49', city: 'Texas' },
    gameTime: '8:10 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 62, confidence: 'Medium', projectedSpread: -1.5, projectedTotal: 9.1, valueRating: 'Buy', modelScore: 78, edge: 7.3 },
    vegasLine: { spread: -1.5, total: 8.5, homeOdds: -130, awayOdds: 110 },
  },
  // ─── NBA ───────────────────────────────────────────────────
  {
    id: 'nba1',
    sport: 'NBA',
    homeTeam: { name: 'Lakers', abbr: 'LAL', record: '47-35', city: 'Los Angeles' },
    awayTeam: { name: 'Warriors', abbr: 'GSW', record: '44-38', city: 'Golden State' },
    gameTime: '10:00 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 58, confidence: 'Medium', projectedSpread: -3.5, projectedTotal: 228.0, valueRating: 'Buy', modelScore: 74, edge: 6.8 },
    vegasLine: { spread: -2.5, total: 225.5, homeOdds: -130, awayOdds: 110 },
  },
  {
    id: 'nba2',
    sport: 'NBA',
    homeTeam: { name: 'Celtics', abbr: 'BOS', record: '55-27', city: 'Boston' },
    awayTeam: { name: 'Heat', abbr: 'MIA', record: '40-42', city: 'Miami' },
    gameTime: '7:30 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 74, confidence: 'High', projectedSpread: -8.0, projectedTotal: 220.5, valueRating: 'Strong Buy', modelScore: 88, edge: 11.4 },
    vegasLine: { spread: -6.5, total: 218.0, homeOdds: -220, awayOdds: 185 },
  },
  {
    id: 'nba3',
    sport: 'NBA',
    homeTeam: { name: 'Nuggets', abbr: 'DEN', record: '52-30', city: 'Denver' },
    awayTeam: { name: 'Thunder', abbr: 'OKC', record: '57-25', city: 'Oklahoma City' },
    gameTime: '9:00 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 43, confidence: 'Medium', projectedSpread: 2.5, projectedTotal: 222.5, valueRating: 'Fade', modelScore: 45, edge: -5.2 },
    vegasLine: { spread: -3.0, total: 224.0, homeOdds: 130, awayOdds: -150 },
  },
  // ─── NFL ───────────────────────────────────────────────────
  {
    id: 'nfl1',
    sport: 'NFL',
    homeTeam: { name: 'Chiefs', abbr: 'KC', record: '14-3', city: 'Kansas City' },
    awayTeam: { name: 'Eagles', abbr: 'PHI', record: '11-6', city: 'Philadelphia' },
    gameTime: '8:20 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 65, confidence: 'High', projectedSpread: -6.5, projectedTotal: 48.5, valueRating: 'Buy', modelScore: 82, edge: 9.1 },
    vegasLine: { spread: -4.5, total: 47.5, homeOdds: -175, awayOdds: 150 },
  },
  {
    id: 'nfl2',
    sport: 'NFL',
    homeTeam: { name: 'Cowboys', abbr: 'DAL', record: '9-8', city: 'Dallas' },
    awayTeam: { name: 'Giants', abbr: 'NYG', record: '7-10', city: 'New York' },
    gameTime: '4:25 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 59, confidence: 'Medium', projectedSpread: -5.0, projectedTotal: 44.0, valueRating: 'Neutral', modelScore: 63, edge: 3.4 },
    vegasLine: { spread: -3.5, total: 43.5, homeOdds: -155, awayOdds: 135 },
  },
  // ─── NHL ───────────────────────────────────────────────────
  {
    id: 'nhl1',
    sport: 'NHL',
    homeTeam: { name: 'Maple Leafs', abbr: 'TOR', record: '48-26-8', city: 'Toronto' },
    awayTeam: { name: 'Bruins', abbr: 'BOS', record: '45-28-9', city: 'Boston' },
    gameTime: '7:00 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 55, confidence: 'Medium', projectedSpread: -0.5, projectedTotal: 6.0, valueRating: 'Buy', modelScore: 71, edge: 7.9 },
    vegasLine: { spread: -0.5, total: 5.5, homeOdds: -115, awayOdds: -105 },
  },
  {
    id: 'nhl2',
    sport: 'NHL',
    homeTeam: { name: 'Avalanche', abbr: 'COL', record: '52-22-8', city: 'Colorado' },
    awayTeam: { name: 'Golden Knights', abbr: 'VGK', record: '49-25-8', city: 'Vegas' },
    gameTime: '9:30 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 61, confidence: 'High', projectedSpread: -1.5, projectedTotal: 6.5, valueRating: 'Strong Buy', modelScore: 86, edge: 12.8 },
    vegasLine: { spread: -0.5, total: 6.0, homeOdds: -140, awayOdds: 120 },
  },
  // ─── WNBA ──────────────────────────────────────────────────
  {
    id: 'wnba1',
    sport: 'WNBA',
    homeTeam: { name: 'Aces', abbr: 'LVA', record: '24-8', city: 'Las Vegas' },
    awayTeam: { name: 'Liberty', abbr: 'NYL', record: '22-10', city: 'New York' },
    gameTime: '9:00 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 64, confidence: 'High', projectedSpread: -5.5, projectedTotal: 168.0, valueRating: 'Strong Buy', modelScore: 87, edge: 11.6 },
    vegasLine: { spread: -4.0, total: 165.5, homeOdds: -190, awayOdds: 160 },
  },
  {
    id: 'wnba2',
    sport: 'WNBA',
    homeTeam: { name: 'Storm', abbr: 'SEA', record: '18-14', city: 'Seattle' },
    awayTeam: { name: 'Sky', abbr: 'CHI', record: '15-17', city: 'Chicago' },
    gameTime: '10:00 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 61, confidence: 'Medium', projectedSpread: -4.0, projectedTotal: 162.5, valueRating: 'Buy', modelScore: 76, edge: 7.4 },
    vegasLine: { spread: -3.0, total: 160.0, homeOdds: -155, awayOdds: 130 },
  },
  {
    id: 'wnba3',
    sport: 'WNBA',
    homeTeam: { name: 'Fever', abbr: 'IND', record: '20-12', city: 'Indiana' },
    awayTeam: { name: 'Sun', abbr: 'CON', record: '21-11', city: 'Connecticut' },
    gameTime: '7:00 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 46, confidence: 'Medium', projectedSpread: 2.0, projectedTotal: 166.0, valueRating: 'Fade', modelScore: 48, edge: -4.8 },
    vegasLine: { spread: -2.5, total: 164.5, homeOdds: 120, awayOdds: -140 },
  },
  // ─── UFC ───────────────────────────────────────────────────
  {
    id: 'ufc1',
    sport: 'UFC',
    homeTeam: { name: 'Jon Jones', abbr: 'JON', record: '28-1-0', city: 'Rochester, NY' },
    awayTeam: { name: 'Stipe Miocic', abbr: 'STI', record: '20-4-0', city: 'Cleveland, OH' },
    gameTime: '10:00 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 71, confidence: 'High', projectedSpread: -1.5, projectedTotal: 3.5, valueRating: 'Strong Buy', modelScore: 90, edge: 13.5 },
    vegasLine: { spread: -1.5, total: 3.0, homeOdds: -240, awayOdds: 195 },
  },
  {
    id: 'ufc2',
    sport: 'UFC',
    homeTeam: { name: 'Islam Makhachev', abbr: 'ISL', record: '26-1-0', city: 'Dagestan, RU' },
    awayTeam: { name: 'Dustin Poirier', abbr: 'DUS', record: '30-8-0', city: 'Lafayette, LA' },
    gameTime: '8:30 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 76, confidence: 'High', projectedSpread: -2.5, projectedTotal: 3.0, valueRating: 'Buy', modelScore: 83, edge: 9.2 },
    vegasLine: { spread: -1.5, total: 2.5, homeOdds: -310, awayOdds: 250 },
  },
  {
    id: 'ufc3',
    sport: 'UFC',
    homeTeam: { name: 'Alex Pereira', abbr: 'ALE', record: '12-2-0', city: 'São Paulo, BR' },
    awayTeam: { name: 'Magomed Ankalaev', abbr: 'MAG', record: '20-1-1', city: 'Makhachkala, RU' },
    gameTime: '7:00 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 58, confidence: 'Medium', projectedSpread: -0.5, projectedTotal: 3.5, valueRating: 'Neutral', modelScore: 64, edge: 3.1 },
    vegasLine: { spread: -0.5, total: 3.0, homeOdds: -155, awayOdds: 130 },
  },
  // ─── Soccer ────────────────────────────────────────────────
  {
    id: 'soc1',
    sport: 'Soccer',
    homeTeam: { name: 'Man City', abbr: 'MCI', record: '18-5-4', city: 'Manchester' },
    awayTeam: { name: 'Arsenal', abbr: 'ARS', record: '16-7-4', city: 'London' },
    gameTime: '12:30 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 58, confidence: 'High', projectedSpread: -0.5, projectedTotal: 2.8, valueRating: 'Buy', modelScore: 79, edge: 8.5 },
    vegasLine: { spread: -0.5, total: 2.5, homeOdds: -155, awayOdds: 350 },
  },
  {
    id: 'soc2',
    sport: 'Soccer',
    homeTeam: { name: 'Real Madrid', abbr: 'RMA', record: '22-3-3', city: 'Madrid' },
    awayTeam: { name: 'Barcelona', abbr: 'BAR', record: '20-4-4', city: 'Barcelona' },
    gameTime: '3:00 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 52, confidence: 'Low', projectedSpread: 0.0, projectedTotal: 3.1, valueRating: 'Neutral', modelScore: 55, edge: 1.9 },
    vegasLine: { spread: 0.0, total: 2.5, homeOdds: 125, awayOdds: 200 },
  },
  {
    id: 'soc3',
    sport: 'Soccer',
    homeTeam: { name: 'Bayern', abbr: 'BAY', record: '24-2-2', city: 'Munich' },
    awayTeam: { name: 'Dortmund', abbr: 'BVB', record: '17-5-6', city: 'Dortmund' },
    gameTime: '2:30 PM ET',
    status: 'upcoming',
    projection: { homeWinPct: 71, confidence: 'High', projectedSpread: -1.5, projectedTotal: 3.5, valueRating: 'Strong Buy', modelScore: 89, edge: 13.1 },
    vegasLine: { spread: -1.0, total: 3.0, homeOdds: -180, awayOdds: 400 },
  },
];

export function getTopPick(): Game {
  return [...MOCK_GAMES].sort((a, b) => b.projection.modelScore - a.projection.modelScore)[0];
}

export function getBestPicks(): Game[] {
  return MOCK_GAMES.filter(
    g => g.projection.valueRating === 'Strong Buy' || g.projection.valueRating === 'Buy',
  ).sort((a, b) => b.projection.modelScore - a.projection.modelScore);
}
