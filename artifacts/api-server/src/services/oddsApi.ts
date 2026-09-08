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

/**
 * Resolve TBM sport/league → The Odds API sport key, or null if unsupported.
 *
 * NFL special-case: the preseason uses a separate Odds API key
 * ("americanfootball_nfl_preseason"). We switch to it automatically
 * from August 1 through September 10 each year, which covers every
 * preseason week without hard-coding specific dates.
 */
export function resolveOddsApiKey(sport: string, league?: string | null): string | null {
  if (sport === "Soccer") {
    return league ? (SOCCER_LEAGUE_KEY[league] ?? null) : "soccer_usa_mls";
  }
  if (sport === "NFL") {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-indexed
    const day = now.getDate();
    const isPreseason = month === 8 || (month === 9 && day <= 10);
    return isPreseason ? "americanfootball_nfl_preseason" : "americanfootball_nfl";
  }
  return SPORT_KEY[sport] ?? null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BookmakerLine {
  book: string;       // e.g. "pinnacle", "draftkings", "fanduel"
  homeOdds: number;   // American odds for home team
  awayOdds: number;   // American odds for away team
  drawOdds?: number;  // Soccer three-way market, from this exact same book
  lastUpdate?: string;
}

export interface SpreadBookmakerLine {
  book: string;
  homeLine: number;
  homeOdds: number;
  awayLine: number;
  awayOdds: number;
}

export interface GameOdds {
  /** The Odds API event id; absent only in legacy hand-built fixtures. */
  providerEventId?: string;
  /** Average moneyline across US public books (consensus market price) */
  consensusHomeOdds: number;
  consensusAwayOdds: number;
  /** Draw moneyline — soccer only; undefined for two-outcome sports */
  consensusDrawOdds?: number;
  /** Pinnacle moneylines — undefined when Pinnacle doesn't have the game */
  pinnacleHomeOdds?: number;
  pinnacleAwayOdds?: number;
  pinnacleDrawOdds?: number;
  /** First complete user-facing US spread market, retained for legacy display. */
  spread?: number;
  /** Complete, exact two-sided spread markets from user-facing US books. */
  spreadMarkets?: SpreadBookmakerLine[];
  /** Best available total */
  total?: number;
  /** All per-bookmaker H2H lines — used to find the best available price */
  bookmakerOdds: BookmakerLine[];
  /** ISO 8601 game start time from The Odds API — used for doubleheader matching */
  commenceTime: string;
}

export interface MoneylineMarket {
  homeOdds: number | null | undefined;
  awayOdds: number | null | undefined;
  drawOdds?: number | null | undefined;
}

export interface OddsLookupResult {
  odds: GameOdds | null;
  /** A matching provider event is already live, so no secondary feed may revive it as pregame. */
  marketBlockedByProviderStart: boolean;
}

export interface OddsApiOutcome {
  name: string;
  price: number;    // American odds
  point?: number;   // spread / total point value
}

export interface OddsApiMarket {
  key: string;       // "h2h" | "spreads" | "totals"
  outcomes: OddsApiOutcome[];
}

export interface OddsApiBookmaker {
  key: string;       // e.g. "pinnacle", "draftkings", "fanduel"
  title: string;
  last_update?: string;
  markets: OddsApiMarket[];
}

export interface OddsApiGame {
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
  /** Map keyed by "{normalizedHome}|{normalizedAway}" — value is an array to
   *  support doubleheaders where the same teams play twice on the same day. */
  games: Map<string, GameOdds[]>;
  /** Raw provider start times, retained even when that event has no usable odds. */
  providerCommenceTimes: Map<string, string[]>;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
// Match the 30-minute game-refresh cadence while avoiding duplicate requests
// from the scheduler, mobile refetches, or manual refreshes in that interval.
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
/** A failed refresh may only use data that would still qualify as fresh normally. */
export const ACTIONABLE_ODDS_CACHE_MAX_AGE_MS = CACHE_TTL_MS;

const MAX_REASONABLE_AMERICAN_ODDS = 2_000;

/**
 * A credible pregame American moneyline is an integer with an absolute value
 * between 100 and 2,000. Values outside that range are almost always missing,
 * decimal-format, or in-play feed values and must never drive a pregame pick.
 */
export function isValidAmericanOdds(value: number | null | undefined): value is number {
  return value != null
    && Number.isFinite(value)
    && Number.isInteger(value)
    && Math.abs(value) >= 100
    && Math.abs(value) <= MAX_REASONABLE_AMERICAN_ODDS;
}

/** Reject non-finite or obviously malformed spread/total values from provider data. */
export function isValidMarketPoint(
  value: number | null | undefined,
  kind: "spread" | "total",
): value is number {
  if (value == null || !Number.isFinite(value)) return false;
  return kind === "spread"
    ? Math.abs(value) <= 100
    : value > 0 && value <= 500;
}

/** A two-way moneyline is usable only when both prices came from the same market. */
export function hasValidMoneylineMarket(
  market: Pick<MoneylineMarket, "homeOdds" | "awayOdds"> | null | undefined,
): market is MoneylineMarket & { homeOdds: number; awayOdds: number } {
  return market != null
    && isValidAmericanOdds(market.homeOdds)
    && isValidAmericanOdds(market.awayOdds);
}

/** Soccer is a three-outcome market; a missing or invalid draw price invalidates the whole market. */
export function hasValidMoneylineMarketForSport(
  sport: string,
  market: MoneylineMarket | null | undefined,
): market is MoneylineMarket & { homeOdds: number; awayOdds: number; drawOdds?: number } {
  return hasValidMoneylineMarket(market)
    && (sport !== "Soccer" || isValidAmericanOdds(market.drawOdds));
}

/** Select a complete market without mixing one side from a newer feed with the other from an older feed. */
export function firstValidMoneylineMarket(
  ...markets: Array<MoneylineMarket | null | undefined>
): (MoneylineMarket & { homeOdds: number; awayOdds: number }) | undefined {
  return markets.find(hasValidMoneylineMarket);
}

/** Select a complete market using the outcome requirements of the sport. */
export function firstValidMoneylineMarketForSport(
  sport: string,
  ...markets: Array<MoneylineMarket | null | undefined>
): (MoneylineMarket & { homeOdds: number; awayOdds: number; drawOdds?: number }) | undefined {
  return markets.find((market) => hasValidMoneylineMarketForSport(sport, market));
}

/** The Odds API may retain in-play markets briefly; never consume them as pregame odds. */
export function isPregameCommenceTime(commenceTime: string, now = Date.now()): boolean {
  const commenceMs = new Date(commenceTime).getTime();
  return Number.isFinite(commenceMs) && commenceMs > now;
}

/** Cached odds are actionable only within the same bounded freshness window as normal cache hits. */
export function isActionableOddsCache(fetchedAt: number, now = Date.now()): boolean {
  return Number.isFinite(fetchedAt)
    && fetchedAt <= now
    && now - fetchedAt <= ACTIONABLE_ODDS_CACHE_MAX_AGE_MS;
}

/**
 * Select an unstarted provider market for an ESPN event. Both source start
 * times must still be pregame; this prevents a delayed ESPN status from
 * reviving an Odds API entry that has crossed its own kickoff.
 */
export function selectPregameGameOdds(
  entries: readonly GameOdds[] | undefined,
  commenceTimeISO?: string,
  now = Date.now(),
): GameOdds | null {
  const pregameEntries = entries?.filter((entry) => isPregameCommenceTime(entry.commenceTime, now)) ?? [];
  if (pregameEntries.length === 0) return null;
  if (!commenceTimeISO) return pregameEntries[0]!;
  if (!isPregameCommenceTime(commenceTimeISO, now)) return null;

  const espnMs = new Date(commenceTimeISO).getTime();
  if (!Number.isFinite(espnMs)) return null;

  // Multiple entries (doubleheader): pick the one whose commence_time is
  // closest to the ESPN game time. Reject same-team games that are too far
  // apart instead of assigning tomorrow's or a live market to this event.
  const closest = pregameEntries.reduce((best, cur) => {
    const bestDiff = Math.abs(new Date(best.commenceTime).getTime() - espnMs);
    const curDiff  = Math.abs(new Date(cur.commenceTime).getTime() - espnMs);
    return curDiff < bestDiff ? cur : best;
  });
  const differenceMs = Math.abs(new Date(closest.commenceTime).getTime() - espnMs);
  const MAX_START_TIME_DIFFERENCE_MS = 8 * 60 * 60 * 1000;
  return Number.isFinite(differenceMs) && differenceMs <= MAX_START_TIME_DIFFERENCE_MS
    ? closest
    : null;
}

/** Choose one complete market, unless the corresponding provider event is already live. */
export function selectActionableMoneylineMarket(
  sport: string,
  oddsLookup: OddsLookupResult,
  fallbackMarket: MoneylineMarket,
): (MoneylineMarket & { homeOdds: number; awayOdds: number; drawOdds?: number }) | undefined {
  if (oddsLookup.marketBlockedByProviderStart) return undefined;
  const providerMarket = oddsLookup.odds
    ? {
        homeOdds: oddsLookup.odds.consensusHomeOdds,
        awayOdds: oddsLookup.odds.consensusAwayOdds,
        drawOdds: oddsLookup.odds.consensusDrawOdds,
      }
    : null;
  return firstValidMoneylineMarketForSport(sport, providerMarket, fallbackMarket);
}

/**
 * Return the first usable moneyline in priority order. A caller can supply
 * fresh Odds API data, a current secondary feed, then the last verified
 * stored line without risking an invalid zero-value overwrite.
 */
export function firstValidAmericanOdds(
  ...candidates: Array<number | null | undefined>
): number | undefined {
  return candidates.find(isValidAmericanOdds);
}

// ── Core fetch ────────────────────────────────────────────────────────────────

const PUBLIC_BOOKS = new Set([
  "draftkings", "fanduel", "betmgm", "caesars", "pointsbet",
  "unibet_us", "barstool", "wynnbet", "betus", "mybookieag",
]);

/**
 * Books that can be surfaced to users as an actionable "best line".
 *
 * The provider response also includes offshore books, European books, and
 * betting exchanges because the feed requests both US and EU regions. Those
 * quotes remain available for internal market context, but should not be
 * presented as a line a typical US bettor can readily access.
 */
const USER_FACING_BEST_LINE_BOOKS = new Set([
  "draftkings",
  "fanduel",
  "betmgm",
  "caesars",
  "williamhill_us",
  "betrivers",
  "fanatics",
  "hardrockbet",
  "espnbet",
  "betparx",
  "ballybet",
  "betfred_us",
  "superbook",
  "circasports",
  "bet365_nj",
  "bet365_oh",
  "bet365_pa",
  "bet365_in",
  "bet365_az",
]);

async function fetchAndNormalise(
  oddsApiKey: string,
): Promise<Pick<CacheEntry, "games" | "providerCommenceTimes">> {
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
  const result = new Map<string, GameOdds[]>();
  const providerCommenceTimes = new Map<string, string[]>();

  for (const g of games) {
    const key = matchKey(g.home_team, g.away_team);
    const existingTimes = providerCommenceTimes.get(key);
    if (existingTimes) {
      existingTimes.push(g.commence_time);
    } else {
      providerCommenceTimes.set(key, [g.commence_time]);
    }

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
        const homePrice = h2h.outcomes.find((o) => normalizeName(o.name) === normalizeName(g.home_team))?.price;
        const awayPrice = h2h.outcomes.find((o) => normalizeName(o.name) === normalizeName(g.away_team))?.price;
        if (isValidAmericanOdds(homePrice) && isValidAmericanOdds(awayPrice)) {
          pinnacleHomeOdds = homePrice;
          pinnacleAwayOdds = awayPrice;
        }
        const draw = h2h.outcomes.find((o) => o.name.toLowerCase() === "draw");
        if (draw && isValidAmericanOdds(draw.price)) pinnacleDrawOdds = draw.price;
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
      if (isValidAmericanOdds(homeOut?.price) && isValidAmericanOdds(awayOut?.price)) {
        homeProbs.push(impliedProb(homeOut.price));
        awayProbs.push(impliedProb(awayOut.price));
      }
      if (drawOut && isValidAmericanOdds(drawOut.price)) drawProbs.push(impliedProb(drawOut.price));
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
    if (!hasValidMoneylineMarket({ homeOdds: consensusHomeOdds, awayOdds: consensusAwayOdds })) {
      continue;
    }

    // ── Spreads — retain complete two-sided user-facing US markets ─────────
    // Do not fabricate the opposite side or surface offshore/Pinnacle prices.
    const spreadMarkets: SpreadBookmakerLine[] = [];
    for (const book of g.bookmakers) {
      if (!USER_FACING_BEST_LINE_BOOKS.has(book.key)) continue;
      const market = book.markets.find((m) => m.key === "spreads");
      if (!market) continue;
      const home = market.outcomes.find((o) =>
        normalizeName(o.name) === normalizeName(g.home_team),
      );
      const away = market.outcomes.find((o) =>
        normalizeName(o.name) === normalizeName(g.away_team),
      );
      if (
        !isValidMarketPoint(home?.point, "spread")
        || !isValidMarketPoint(away?.point, "spread")
        || !isValidAmericanOdds(home?.price)
        || !isValidAmericanOdds(away?.price)
      ) {
        continue;
      }
      spreadMarkets.push({
        book: book.key,
        homeLine: home.point,
        homeOdds: home.price,
        awayLine: away.point,
        awayOdds: away.price,
      });
    }
    const spread = spreadMarkets[0]?.homeLine;

    // ── Totals — prefer Pinnacle, else first public book ──────────────────
    let total: number | undefined;
    const spreadSource = pinnacleBook ?? publicBooks[0];
    if (spreadSource) {
      const totalsMarket = spreadSource.markets.find((m) => m.key === "totals");
      if (totalsMarket) {
        const overLine = totalsMarket.outcomes.find((o) => o.name.toLowerCase() === "over");
          if (isValidMarketPoint(overLine?.point, "total")) total = overLine.point;
      }
    }

    // Collect per-bookmaker H2H lines for best-line surfacing
    const bookmakerOdds: BookmakerLine[] = [];
    for (const book of g.bookmakers) {
      const h2h = book.markets.find((m) => m.key === "h2h");
      if (!h2h) continue;
      const bHomeOdds = h2h.outcomes.find((o) => normalizeName(o.name) === normalizeName(g.home_team))?.price;
      const bAwayOdds = h2h.outcomes.find((o) => normalizeName(o.name) === normalizeName(g.away_team))?.price;
      const bDrawOdds = h2h.outcomes.find((o) => normalizeName(o.name) === "draw")?.price;
      if (isValidAmericanOdds(bHomeOdds) && isValidAmericanOdds(bAwayOdds)) {
        bookmakerOdds.push({
          book: book.key, homeOdds: bHomeOdds, awayOdds: bAwayOdds,
          ...(isValidAmericanOdds(bDrawOdds) ? { drawOdds: bDrawOdds } : {}),
          lastUpdate: book.last_update,
        });
      }
    }

    const entry: GameOdds = {
      providerEventId: g.id,
      consensusHomeOdds,
      consensusAwayOdds,
      consensusDrawOdds,
      pinnacleHomeOdds,
      pinnacleAwayOdds,
      pinnacleDrawOdds,
      spread,
      spreadMarkets,
      total,
      bookmakerOdds,
      commenceTime: g.commence_time,
    };
    // Support doubleheaders: append to the array rather than overwriting.
    const existing = result.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      result.set(key, [entry]);
    }
  }

  logger.info(
    { oddsApiKey, games: result.size, hasPinnacle: games.some(g => g.bookmakers.some(b => b.key === "pinnacle")) },
    "OddsAPI: normalised",
  );
  return { games: result, providerCommenceTimes };
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
): Promise<Map<string, GameOdds[]>> {
  const oddsApiKey = resolveOddsApiKey(sport, league);
  if (!oddsApiKey) return new Map(); // sport not supported (UFC, etc.)

  const cached = cache.get(oddsApiKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.games;
  }

  try {
    const normalised = await fetchAndNormalise(oddsApiKey);
    cache.set(oddsApiKey, { ...normalised, fetchedAt: Date.now() });
    return normalised.games;
  } catch (err) {
    const cachedIsActionable = cached != null && isActionableOddsCache(cached.fetchedAt);
    logger.error(
      { err, oddsApiKey, cachedIsActionable },
      "OddsAPI: fetch failed — using fresh cached or empty data",
    );
    return cachedIsActionable ? cached!.games : new Map();
  }
}

/**
 * Returns the uncollapsed current NCAAF response for the evidence ledger.
 * This intentionally does not use the prediction cache/normalisation path:
 * partial books and events that cannot be matched to a game are evidence too.
 */
export async function fetchCurrentNcaafEvidenceOdds(): Promise<OddsApiGame[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("ODDS_API_KEY secret is not set");
  const url =
    "https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds/" +
    `?apiKey=${apiKey}&regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american`;
  const response = await fetch(url, {
    headers: { "User-Agent": "TheBettingModel/2.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`The Odds API ${response.status}: ${body.slice(0, 200)}`);
  }
  return (await response.json()) as OddsApiGame[];
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
    if (!USER_FACING_BEST_LINE_BOOKS.has(b.book)) continue;
    const odds = pickIsHome ? b.homeOdds : b.awayOdds;
    if (!isValidAmericanOdds(odds)) continue;
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
 * Pass commenceTimeISO (ESPN game start time) so doubleheaders are matched
 * by proximity instead of always returning the first entry.
 * Returns null when no match is found (game not yet listed, or sport unsupported).
 */
export async function getOddsForGame(
  sport: string,
  league: string | null | undefined,
  homeTeamName: string,
  awayTeamName: string,
  commenceTimeISO?: string,
): Promise<GameOdds | null> {
  return (await getOddsForGameWithStatus(
    sport,
    league,
    homeTeamName,
    awayTeamName,
    commenceTimeISO,
  )).odds;
}

/**
 * Fetch odds plus the provider-start safety state used when selecting a
 * secondary market. A known live provider event makes the market unavailable.
 */
export async function getOddsForGameWithStatus(
  sport: string,
  league: string | null | undefined,
  homeTeamName: string,
  awayTeamName: string,
  commenceTimeISO?: string,
): Promise<OddsLookupResult> {
  const gamesMap = await fetchOddsForSport(sport, league);
  const key = matchKey(homeTeamName, awayTeamName);
  const oddsApiKey = resolveOddsApiKey(sport, league);
  const cached = oddsApiKey ? cache.get(oddsApiKey) : undefined;
  const providerCommenceTimes = cached && isActionableOddsCache(cached.fetchedAt)
    ? cached.providerCommenceTimes.get(key)
    : undefined;
  return resolveOddsLookup(gamesMap.get(key), commenceTimeISO, Date.now(), providerCommenceTimes);
}

/** Resolve a provider event's actionable status for one scheduled game. */
export function resolveOddsLookup(
  entries: readonly GameOdds[] | undefined,
  commenceTimeISO?: string,
  now = Date.now(),
  providerCommenceTimes: readonly string[] = entries?.map((entry) => entry.commenceTime) ?? [],
): OddsLookupResult {
  const providerMatch = selectClosestProviderCommenceTime(providerCommenceTimes, commenceTimeISO);
  const marketBlockedByProviderStart = providerMatch != null
    && !isPregameCommenceTime(providerMatch, now);
  return {
    odds: marketBlockedByProviderStart
      ? null
      : selectPregameGameOdds(entries, commenceTimeISO, now),
    marketBlockedByProviderStart,
  };
}

function selectClosestProviderCommenceTime(
  commenceTimes: readonly string[],
  commenceTimeISO?: string,
): string | null {
  if (!commenceTimes.length) return null;
  if (!commenceTimeISO) return commenceTimes[0]!;
  const espnMs = new Date(commenceTimeISO).getTime();
  if (!Number.isFinite(espnMs)) return null;
  const validTimes = commenceTimes.filter((time) => Number.isFinite(new Date(time).getTime()));
  if (validTimes.length === 0) return commenceTimes[0]!;
  const closest = validTimes.reduce((best, cur) => {
    const bestDiff = Math.abs(new Date(best).getTime() - espnMs);
    const curDiff = Math.abs(new Date(cur).getTime() - espnMs);
    return curDiff < bestDiff ? cur : best;
  });
  const differenceMs = Math.abs(new Date(closest).getTime() - espnMs);
  const MAX_START_TIME_DIFFERENCE_MS = 8 * 60 * 60 * 1000;
  return Number.isFinite(differenceMs) && differenceMs <= MAX_START_TIME_DIFFERENCE_MS
    ? closest
    : null;
}
