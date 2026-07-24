/**
 * The Odds API — Phase 2 odds ingestion.
 *
 * Replaces ESPN's single-book moneyline (often unavailable) with:
 *   • Consensus odds  — average implied probability across all US public books
 *   • Pinnacle odds   — the sharpest book in the world; accepts professional
 *                       bettors and doesn't limit winners. When Pinnacle's
 *                       implied probability diverges from public consensus,
 *                       that divergence is the sharpest betting signal available.
 *   • Spreads & totals — consistently available for every supported sport,
 *                        filling the gaps ESPN often leaves blank.
 *
 * Cache strategy: 30-minute in-memory TTL per sport key.
 * At ~10 active sports × 2 fetches/hour, this keeps daily usage under 500
 * requests/day even on the starter plan.
 */

import { logger } from "../lib/logger";

// ── The Odds API sport key mapping ────────────────────────────────────────────

/** TBM sport name + optional league label → The Odds API sport key */
const SPORT_KEY: Record<string, string> = {
  MLB:    "baseball_mlb",
  NBA:    "basketball_nba",
  NFL:    "americanfootball_nfl",
  NHL:    "icehockey_nhl",
  WNBA:   "basketball_wnba",
  NCAAF:  "americanfootball_ncaaf",
  NCAAB:  "basketball_ncaab",
};

/** Soccer sub-league label → The Odds API sport key */
const SOCCER_LEAGUE_KEY: Record<string, string> = {
  "EPL":         "soccer_epl",
  "La Liga":     "soccer_spain_la_liga",
  "Bundesliga":  "soccer_germany_bundesliga",
  "Serie A":     "soccer_italy_serie_a",
  "Ligue 1":     "soccer_france_ligue_one",
  "UCL":         "soccer_uefa_champs_league",
};

/** Resolve TBM sport/league → The Odds API sport key, or null if unsupported */
export function resolveOddsApiKey(sport: string, league?: string | null): string | null {
  if (sport === "Soccer") {
    return league ? (SOCCER_LEAGUE_KEY[league] ?? null) : "soccer_usa_mls";
  }
  return SPORT_KEY[sport] ?? null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BookmakerLine {
  book: string;       // e.g. "pinnacle", "draftkings", "fanduel"
  homeOdds: number;   // American odds for home team
  awayOdds: number;   // American odds for away team
}

export interface GameOdds {
  /** Average moneyline across US public books (consensus market price) */
  consensusHomeOdds: number;
  consensusAwayOdds: number;
  /** Draw moneyline — soccer only; undefined for two-outcome sports */
  consensusDrawOdds?: number;
  /** Pinnacle moneylines — undefined when Pinnacle doesn't have the game */
  pinnacleHomeOdds?: number;
  pinnacleAwayOdds?: number;
  pinnacleDrawOdds?: number;
  /** Best available spread (Pinnacle if available, else consensus) */
  spread?: number;   // positive = home favoured by N points
  /** Best available total */
  total?: number;
  /** All per-bookmaker H2H lines — used to find the best available price */
  bookmakerOdds: BookmakerLine[];
}

interface OddsApiOutcome {
  name: string;
  price: number;    // American odds
  point?: number;   // spread / total point value
}

interface OddsApiMarket {
  key: string;       // "h2h" | "spreads" | "totals"
  outcomes: OddsApiOutcome[];
}

interface OddsApiBookmaker {
  key: string;       // e.g. "pinnacle", "draftkings", "fanduel"
  title: string;
  markets: OddsApiMarket[];
}

interface OddsApiGame {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: OddsApiBookmaker[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert American odds to implied probability (no vig removed — raw value). */
function impliedProb(american: number): number {
  return american < 0
    ? Math.abs(american) / (Math.abs(american) + 100)
    : 100 / (american + 100);
}

/** Convert implied probability back to American odds. */
function probToAmerican(prob: number): number {
  prob = Math.max(0.01, Math.min(0.99, prob));
  return prob >= 0.5
    ? Math.round(-(prob / (1 - prob)) * 100)
    : Math.round(((1 - prob) / prob) * 100);
}

/**
 * Normalise a team name for fuzzy matching between ESPN and The Odds API.
 * Lowercases, strips punctuation, removes leading "the ".
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/^the /, "")
    .trim();
}

/** Build the lookup key for a game: "{normalizedHome}|{normalizedAway}" */
function matchKey(homeTeam: string, awayTeam: string): string {
  return `${normalizeName(homeTeam)}|${normalizeName(awayTeam)}`;
}

// ── In-memory cache ───────────────────────────────────────────────────────────

interface CacheEntry {
  games: Map<string, GameOdds>;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── Core fetch ────────────────────────────────────────────────────────────────

const PUBLIC_BOOKS = new Set([
  "draftkings", "fanduel", "betmgm", "caesars", "pointsbet",
  "unibet_us", "barstool", "wynnbet", "betus", "mybookieag",
]);

async function fetchAndNormalise(oddsApiKey: string): Promise<Map<string, GameOdds>> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("ODDS_API_KEY secret is not set");

  const url =
    `https://api.the-odds-api.com/v4/sports/${oddsApiKey}/odds/` +
    `?apiKey=${apiKey}&regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "TheBettingModel/2.0" },
    signal: AbortSignal.timeout(12_000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`The Odds API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const remaining = resp.headers.get("x-requests-remaining");
  const used      = resp.headers.get("x-requests-used");
  logger.debug({ oddsApiKey, remaining, used }, "OddsAPI: request consumed");

  const games = (await resp.json()) as OddsApiGame[];
  const result = new Map<string, GameOdds>();

  for (const g of games) {
    const key = matchKey(g.home_team, g.away_team);

    // ── Separate Pinnacle from public books ───────────────────────────────
    const pinnacleBook = g.bookmakers.find((b) => b.key === "pinnacle");
    const publicBooks  = g.bookmakers.filter((b) => PUBLIC_BOOKS.has(b.key));

    // ── h2h (moneyline) odds ──────────────────────────────────────────────
    let pinnacleHomeOdds: number | undefined;
    let pinnacleAwayOdds: number | undefined;
    let pinnacleDrawOdds: number | undefined;

    if (pinnacleBook) {
      const h2h = pinnacleBook.markets.find((m) => m.key === "h2h");
      if (h2h) {
        pinnacleHomeOdds = h2h.outcomes.find((o) => normalizeName(o.name) === normalizeName(g.home_team))?.price;
        pinnacleAwayOdds = h2h.outcomes.find((o) => normalizeName(o.name) === normalizeName(g.away_team))?.price;
        const draw = h2h.outcomes.find((o) => o.name.toLowerCase() === "draw");
        if (draw) pinnacleDrawOdds = draw.price;
      }
    }

    // Consensus: average implied probabilities across public books, then convert back
    const homeProbs: number[] = [];
    const awayProbs: number[] = [];
    const drawProbs: number[] = [];

    for (const book of publicBooks) {
      const h2h = book.markets.find((m) => m.key === "h2h");
      if (!h2h) continue;
      const homeOut = h2h.outcomes.find((o) => normalizeName(o.name) === normalizeName(g.home_team));
      const awayOut = h2h.outcomes.find((o) => normalizeName(o.name) === normalizeName(g.away_team));
      const drawOut = h2h.outcomes.find((o) => o.name.toLowerCase() === "draw");
      if (homeOut) homeProbs.push(impliedProb(homeOut.price));
      if (awayOut) awayProbs.push(impliedProb(awayOut.price));
      if (drawOut) drawProbs.push(impliedProb(drawOut.price));
    }

    // Fall back to Pinnacle for consensus if no US public books have the game
    const avgHome = homeProbs.length > 0
      ? homeProbs.reduce((a, b) => a + b, 0) / homeProbs.length
      : pinnacleHomeOdds != null ? impliedProb(pinnacleHomeOdds) : null;
    const avgAway = awayProbs.length > 0
      ? awayProbs.reduce((a, b) => a + b, 0) / awayProbs.length
      : pinnacleAwayOdds != null ? impliedProb(pinnacleAwayOdds) : null;
    const avgDraw = drawProbs.length > 0
      ? drawProbs.reduce((a, b) => a + b, 0) / drawProbs.length
      : pinnacleDrawOdds != null ? impliedProb(pinnacleDrawOdds) : null;

    if (avgHome == null || avgAway == null) continue;

    const consensusHomeOdds = probToAmerican(avgHome);
    const consensusAwayOdds = probToAmerican(avgAway);
    const consensusDrawOdds = avgDraw != null ? probToAmerican(avgDraw) : undefined;

    // ── Spreads — prefer Pinnacle, else first public book ─────────────────
    let spread: number | undefined;
    const spreadSource = pinnacleBook ?? publicBooks[0];
    if (spreadSource) {
      const spreadsMarket = spreadSource.markets.find((m) => m.key === "spreads");
      if (spreadsMarket) {
        const homeSpread = spreadsMarket.outcomes.find((o) =>
          normalizeName(o.name) === normalizeName(g.home_team),
        );
        if (homeSpread?.point != null) spread = homeSpread.point;
      }
    }

    // ── Totals — prefer Pinnacle, else first public book ──────────────────
    let total: number | undefined;
    if (spreadSource) {
      const totalsMarket = spreadSource.markets.find((m) => m.key === "totals");
      if (totalsMarket) {
        const overLine = totalsMarket.outcomes.find((o) => o.name.toLowerCase() === "over");
        if (overLine?.point != null) total = overLine.point;
      }
    }

    // Collect per-bookmaker H2H lines for best-line surfacing
    const bookmakerOdds: BookmakerLine[] = [];
    for (const book of g.bookmakers) {
      const h2h = book.markets.find((m) => m.key === "h2h");
      if (!h2h) continue;
      const bHomeOdds = h2h.outcomes.find((o) => normalizeName(o.name) === normalizeName(g.home_team))?.price;
      const bAwayOdds = h2h.outcomes.find((o) => normalizeName(o.name) === normalizeName(g.away_team))?.price;
      if (bHomeOdds != null && bAwayOdds != null) {
        bookmakerOdds.push({ book: book.key, homeOdds: bHomeOdds, awayOdds: bAwayOdds });
      }
    }

    result.set(key, {
      consensusHomeOdds,
      consensusAwayOdds,
      consensusDrawOdds,
      pinnacleHomeOdds,
      pinnacleAwayOdds,
      pinnacleDrawOdds,
      spread,
      total,
      bookmakerOdds,
    });
  }

  logger.info(
    { oddsApiKey, games: result.size, hasPinnacle: games.some(g => g.bookmakers.some(b => b.key === "pinnacle")) },
    "OddsAPI: normalised",
  );
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch and cache The Odds API data for a given TBM sport + optional league.
 * Returns a Map keyed by "{normalizedHome}|{normalizedAway}".
 * Uses a 30-minute in-memory cache to minimise API credit usage.
 */
export async function fetchOddsForSport(
  sport: string,
  league?: string | null,
): Promise<Map<string, GameOdds>> {
  const oddsApiKey = resolveOddsApiKey(sport, league);
  if (!oddsApiKey) return new Map(); // sport not supported (UFC, etc.)

  const cached = cache.get(oddsApiKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.games;
  }

  try {
    const games = await fetchAndNormalise(oddsApiKey);
    cache.set(oddsApiKey, { games, fetchedAt: Date.now() });
    return games;
  } catch (err) {
    logger.error({ err, oddsApiKey }, "OddsAPI: fetch failed — using cached/empty data");
    return cached?.games ?? new Map();
  }
}

// ── Best available line ───────────────────────────────────────────────────────

/** Returns the book with the best American odds for the given pick direction. */
export function getBestLine(
  gameOdds: GameOdds | null,
  pickIsHome: boolean,
): { book: string; odds: number } | null {
  if (!gameOdds?.bookmakerOdds.length) return null;

  let best: { book: string; odds: number } | null = null;

  for (const b of gameOdds.bookmakerOdds) {
    const odds = pickIsHome ? b.homeOdds : b.awayOdds;
    if (best == null || impliedProb(odds) < impliedProb(best.odds)) {
      // Lower implied probability = higher payout = better for the bettor
      best = { book: b.book, odds };
    }
  }

  return best;
}

// ── Friendly book name map ────────────────────────────────────────────────────

const BOOK_DISPLAY: Record<string, string> = {
  pinnacle:        "Pinnacle",
  draftkings:      "DraftKings",
  fanduel:         "FanDuel",
  betmgm:          "BetMGM",
  caesars:         "Caesars",
  pointsbet:       "PointsBet",
  betrivers:       "BetRivers",
  williamhill_us:  "Caesars",
  unibet_us:       "Unibet",
  betanysports:    "BetAnySports",
  betclic_fr:      "Betclic",
  betonlineag:     "BetOnline",
  bovada:          "Bovada",
  betus:           "BetUS",
  fanatics:        "Fanatics",
  matchbook:       "Matchbook",
  lowvig:          "LowVig.ag",
  betfair_ex_eu:   "Betfair",
};

/** Human-readable bookmaker name (falls back to the raw key). */
export function displayBookName(key: string): string {
  return BOOK_DISPLAY[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Convenience: look up a specific game by home + away team name.
 * Returns null when no match is found (game not yet listed, or sport unsupported).
 */
export async function getOddsForGame(
  sport: string,
  league: string | null | undefined,
  homeTeamName: string,
  awayTeamName: string,
): Promise<GameOdds | null> {
  const gamesMap = await fetchOddsForSport(sport, league);
  const key = matchKey(homeTeamName, awayTeamName);
  return gamesMap.get(key) ?? null;
}
