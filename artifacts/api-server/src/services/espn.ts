/**
 * ESPN Scoreboard Service
 *
 * Fetches today's games for all supported sports from the ESPN public API.
 * Also extracts real Vegas odds (from DraftKings via ESPN) and home/road
 * record splits where available.
 */

import { logger } from "../lib/logger";

// ── Sport paths ───────────────────────────────────────────────────────────────

/**
 * Maps internal sport/league keys to ESPN API path segments.
 * Soccer sub-leagues all map to sport="Soccer" in FetchedGame but carry
 * a distinct `league` label so the model and UI can surface the right name.
 */
const ESPN_SPORT_PATHS: Record<string, string> = {
  NFL:              "football/nfl",
  NCAAF:            "football/college-football",
  NBA:              "basketball/nba",
  NCAAB:            "basketball/mens-college-basketball",
  MLB:              "baseball/mlb",
  NHL:              "hockey/nhl",
  WNBA:             "basketball/wnba",
  Soccer:           "soccer/usa.1",           // MLS
  Soccer_EPL:       "soccer/eng.1",           // English Premier League
  Soccer_LaLiga:    "soccer/esp.1",           // La Liga
  Soccer_Bundesliga:"soccer/ger.1",           // Bundesliga
  Soccer_SerieA:    "soccer/ita.1",           // Serie A
  Soccer_Ligue1:    "soccer/fra.1",           // Ligue 1
  Soccer_UCL:       "soccer/uefa.champions",  // UEFA Champions League
  UFC:              "mma/ufc",
};

/** Maps sub-league internal keys back to the canonical sport name. */
const SPORT_FOR_KEY: Record<string, string> = {
  Soccer_EPL:       "Soccer",
  Soccer_LaLiga:    "Soccer",
  Soccer_Bundesliga:"Soccer",
  Soccer_SerieA:    "Soccer",
  Soccer_Ligue1:    "Soccer",
  Soccer_UCL:       "Soccer",
};

/** Human-readable league labels. */
const LEAGUE_LABEL: Record<string, string> = {
  Soccer:           "MLS",
  Soccer_EPL:       "EPL",
  Soccer_LaLiga:    "La Liga",
  Soccer_Bundesliga:"Bundesliga",
  Soccer_SerieA:    "Serie A",
  Soccer_Ligue1:    "Ligue 1",
  Soccer_UCL:       "Champions League",
};

// ── ESPN response interfaces ──────────────────────────────────────────────────

interface EspnTeam {
  id?: string;
  abbreviation?: string;
  displayName?: string;
  shortDisplayName?: string;
  logos?: Array<{ href: string; rel?: string[] }>;
}

interface EspnAthlete {
  displayName?: string;
  shortName?: string;
}

interface EspnRecord {
  name: string;
  type: string;
  summary: string;
  abbreviation?: string;
}

interface EspnCompetitor {
  homeAway: "home" | "away";
  team?: EspnTeam;
  athlete?: EspnAthlete;
  records?: EspnRecord[];
  score?: string;
}

interface EspnOdds {
  homeTeamOdds?: { moneyLine?: number };
  awayTeamOdds?: { moneyLine?: number };
  drawOdds?: { moneyLine?: number };
  overUnder?: number;
  details?: string; // e.g. "CLB -115" — favored team abbreviation + moneyline
}

interface EspnStatus {
  type: { state: "pre" | "in" | "post"; completed: boolean };
}

interface EspnEvent {
  id: string;
  date: string;
  name: string;
  status: EspnStatus;
  competitions: Array<{
    id?: string;         // present for UFC bouts; used as game ID
    date?: string;       // individual bout start time (UFC)
    competitors: EspnCompetitor[];
    odds?: EspnOdds[];
    neutralSite?: boolean;
  }>;
}

interface EspnScoreboard {
  events?: EspnEvent[];
}

// ── FetchedGame ───────────────────────────────────────────────────────────────

export interface FetchedGame {
  espnId: string;
  sport: string;          // canonical sport (e.g. "Soccer" for all soccer leagues)
  league?: string;        // sub-league label (e.g. "EPL", "MLS", "La Liga")

  // Team identifiers
  homeTeamId?: string;    // ESPN numeric team ID
  awayTeamId?: string;
  homeTeamLogo?: string;  // ESPN CDN logo URL, captured directly from API response
  awayTeamLogo?: string;
  homeTeamAbbr: string;
  homeTeamName: string;
  awayTeamAbbr: string;
  awayTeamName: string;

  // Records — overall W-L (or W-D-L for soccer)
  homeTeamRecord: string;
  awayTeamRecord: string;

  // Home/road splits (extracted when ESPN provides them — WNBA, NBA, etc.)
  homeHomeRecord?: string;  // home team's record AT HOME  (W-L)
  homeRoadRecord?: string;  // home team's record ON ROAD
  awayHomeRecord?: string;  // away team's record AT HOME
  awayRoadRecord?: string;  // away team's record ON ROAD

  gameTime: string;
  gameDate: string;         // YYYY-MM-DD (Eastern)
  status: "upcoming" | "live" | "final";
  homeScore?: number;
  awayScore?: number;

  // Real Vegas odds from ESPN/DraftKings — present only when ESPN returns them
  vegasHomeOdds?: number;   // home moneyline
  vegasAwayOdds?: number;   // away moneyline
  vegasDrawOdds?: number;   // draw moneyline (soccer only)
  vegasOverUnder?: number;  // game total
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayEspnParam(): string {
  const et = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
  const [m, d, y] = et.split("/");
  return `${y}${m!.padStart(2, "0")}${d!.padStart(2, "0")}`;
}

function toEasternDate(date: Date): string {
  const et = date.toLocaleDateString("en-US", { timeZone: "America/New_York" });
  const [m, d, y] = et.split("/");
  return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
}

// ── Field extractors ──────────────────────────────────────────────────────────

function formatGameTime(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true,
      timeZone: "America/New_York", timeZoneName: "short",
    });
  } catch { return "TBD"; }
}

function getStatus(event: EspnEvent): "upcoming" | "live" | "final" {
  const state = event.status.type.state;
  if (state === "post") return "final";
  if (state === "in") return "live";
  return "upcoming";
}

function getAbbr(competitor: EspnCompetitor): string {
  const raw =
    competitor.team?.abbreviation ??
    competitor.athlete?.shortName?.split(" ").pop() ??
    "TBD";
  return raw.slice(0, 5).toUpperCase();
}

function getDisplayName(competitor: EspnCompetitor): string {
  return competitor.team?.displayName ?? competitor.athlete?.displayName ?? "Unknown";
}

/**
 * Returns the "total" (overall) record summary string.
 * Soccer records come as "W-D-L" (e.g. "4-4-7") — preserved as-is.
 * All other sports come as "W-L" (e.g. "10-5").
 */
function getOverallRecord(competitor: EspnCompetitor): string {
  return (
    competitor.records?.find((r) => r.type === "total")?.summary ??
    competitor.records?.[0]?.summary ??
    "0-0"
  );
}

/** Returns the home-venue record if ESPN provides it, otherwise undefined. */
function getHomeRecord(competitor: EspnCompetitor): string | undefined {
  return competitor.records?.find((r) => r.type === "home")?.summary;
}

/** Returns the road/away record if ESPN provides it, otherwise undefined. */
function getRoadRecord(competitor: EspnCompetitor): string | undefined {
  return competitor.records?.find(
    (r) => r.type === "road" || r.type === "away",
  )?.summary;
}

/**
 * Extracts real Vegas odds from the ESPN competition's odds array.
 * ESPN embeds DraftKings moneylines in the scoreboard for soccer;
 * for other sports the odds array may be absent or empty.
 *
 * Strategy:
 *  1. Prefer explicit homeTeamOdds / awayTeamOdds objects.
 *  2. Fall back to parsing the `details` string ("CLB -115" = home favoured at -115).
 *  3. Always capture drawOdds and overUnder when present.
 */
function extractOdds(
  competition: { odds?: EspnOdds[] },
  homeAbbr: string,
): {
  homeOdds: number | null;
  awayOdds: number | null;
  drawOdds: number | null;
  overUnder: number | null;
} {
  const odds = competition.odds?.[0];
  if (!odds) return { homeOdds: null, awayOdds: null, drawOdds: null, overUnder: null };

  let homeOdds: number | null = odds.homeTeamOdds?.moneyLine ?? null;
  let awayOdds: number | null = odds.awayTeamOdds?.moneyLine ?? null;
  const drawOdds: number | null = odds.drawOdds?.moneyLine ?? null;
  const overUnder: number | null = odds.overUnder ?? null;

  // Parse "ABBR ML" details string when direct objects are absent
  if ((homeOdds === null || awayOdds === null) && odds.details) {
    const match = odds.details.trim().match(/^(\S+)\s+([+-]?\d+)$/);
    if (match) {
      const oddsVal = parseInt(match[2]!, 10);
      const favAbbr = match[1]!.toUpperCase();
      if (favAbbr === homeAbbr.toUpperCase().slice(0, favAbbr.length)) {
        homeOdds = oddsVal;
      } else {
        awayOdds = oddsVal;
      }
    }
  }

  return { homeOdds, awayOdds, drawOdds, overUnder };
}

// ── Fetch with retry ──────────────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  attempts = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url, options);
      if (resp.ok) return resp;
      lastErr = new Error(`HTTP ${resp.status}`);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastErr;
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function fetchSportGames(sportKey: string): Promise<FetchedGame[]> {
  const path = ESPN_SPORT_PATHS[sportKey];
  if (!path) return [];

  // Resolve canonical sport name and league label
  const sport = SPORT_FOR_KEY[sportKey] ?? sportKey;
  const league = LEAGUE_LABEL[sportKey];

  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${todayEspnParam()}&limit=100`;

  try {
    const resp = await fetchWithRetry(url, {
      headers: { "User-Agent": "TheBettingModel/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    const data = (await resp.json()) as EspnScoreboard;
    const events = data.events ?? [];
    const games: FetchedGame[] = [];

    for (const event of events) {
      // UFC returns one event (the card) with many competitions (one per bout).
      // All other sports return one event per game with a single competition.
      const competitionsToProcess = sport === "UFC"
        ? event.competitions
        : (event.competitions[0] ? [event.competitions[0]] : []);

      for (const competition of competitionsToProcess) {
        // UFC competitors have homeAway: null — fall back to array position.
        const home = competition.competitors.find((c) => c.homeAway === "home")
          ?? competition.competitors[0];
        const away = competition.competitors.find((c) => c.homeAway === "away")
          ?? competition.competitors[1];
        if (!home || !away) continue;

        // UFC bouts each have their own date; other sports use the event date.
        const startDate = new Date(competition.date ?? event.date);
        const gameDate = toEasternDate(startDate);

        // UFC uses competition.id (bout ID) so each fight is a distinct row.
        const espnId = sport === "UFC"
          ? `${sport}-${competition.id ?? event.id}`
          : `${sport}-${event.id}`;

        const homeAbbr = getAbbr(home);
        const { homeOdds, awayOdds, drawOdds, overUnder } = extractOdds(competition, homeAbbr);

        games.push({
          espnId,
          sport,
          league,

          homeTeamId: home.team?.id,
          awayTeamId: away.team?.id,
          homeTeamLogo: home.team?.logos?.[0]?.href,
          awayTeamLogo: away.team?.logos?.[0]?.href,
          homeTeamAbbr: homeAbbr,
          homeTeamName: getDisplayName(home),
          awayTeamAbbr: getAbbr(away),
          awayTeamName: getDisplayName(away),

          homeTeamRecord: getOverallRecord(home),
          awayTeamRecord: getOverallRecord(away),

          homeHomeRecord: getHomeRecord(home),
          homeRoadRecord: getRoadRecord(home),
          awayHomeRecord: getHomeRecord(away),
          awayRoadRecord: getRoadRecord(away),

          gameTime: formatGameTime(competition.date ?? event.date),
          gameDate,
          status: getStatus(event),

          homeScore: home.score !== undefined ? parseInt(home.score, 10) : undefined,
          awayScore: away.score !== undefined ? parseInt(away.score, 10) : undefined,

          // Real Vegas odds — undefined when ESPN doesn't provide them
          vegasHomeOdds: homeOdds ?? undefined,
          vegasAwayOdds: awayOdds ?? undefined,
          vegasDrawOdds: drawOdds ?? undefined,
          vegasOverUnder: overUnder ?? undefined,
        });
      }
    }

    logger.info({ sportKey, sport, count: games.length }, "ESPN games fetched");
    return games;
  } catch (err) {
    logger.error({ err, sportKey }, "ESPN fetch failed");
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch games for a specific sport key on a specific date (YYYYMMDD).
 * Used by the stale-game recovery process to backfill results that fell
 * off the current-day scoreboard feed.
 */
export async function fetchSportGamesByDate(
  sportKey: string,
  yyyymmdd: string,
): Promise<FetchedGame[]> {
  const path = ESPN_SPORT_PATHS[sportKey];
  if (!path) return [];

  const sport = SPORT_FOR_KEY[sportKey] ?? sportKey;
  const league = LEAGUE_LABEL[sportKey];

  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${yyyymmdd}&limit=100`;

  try {
    const resp = await fetchWithRetry(url, {
      headers: { "User-Agent": "TheBettingModel/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    const data = (await resp.json()) as EspnScoreboard;
    const events = data.events ?? [];
    const games: FetchedGame[] = [];

    for (const event of events) {
      const competitionsToProcess = sport === "UFC"
        ? event.competitions
        : (event.competitions[0] ? [event.competitions[0]] : []);

      for (const competition of competitionsToProcess) {
        const home = competition.competitors.find((c) => c.homeAway === "home")
          ?? competition.competitors[0];
        const away = competition.competitors.find((c) => c.homeAway === "away")
          ?? competition.competitors[1];
        if (!home || !away) continue;

        const startDate = new Date(competition.date ?? event.date);
        const gameDate = toEasternDate(startDate);
        const espnId = sport === "UFC"
          ? `${sport}-${competition.id ?? event.id}`
          : `${sport}-${event.id}`;
        const homeAbbr = getAbbr(home);
        const { homeOdds, awayOdds, drawOdds, overUnder } = extractOdds(competition, homeAbbr);

        games.push({
          espnId,
          sport,
          league,
          homeTeamId:       home.team?.id,
          awayTeamId:       away.team?.id,
          homeTeamLogo:     home.team?.logos?.[0]?.href,
          awayTeamLogo:     away.team?.logos?.[0]?.href,
          homeTeamAbbr:     homeAbbr,
          homeTeamName:     getDisplayName(home),
          awayTeamAbbr:     getAbbr(away),
          awayTeamName:     getDisplayName(away),
          homeTeamRecord:   getOverallRecord(home),
          awayTeamRecord:   getOverallRecord(away),
          homeHomeRecord:   getHomeRecord(home),
          homeRoadRecord:   getRoadRecord(home),
          awayHomeRecord:   getHomeRecord(away),
          awayRoadRecord:   getRoadRecord(away),
          gameTime:         formatGameTime(competition.date ?? event.date),
          gameDate,
          status:           getStatus(event),
          homeScore:        home.score !== undefined ? parseInt(home.score, 10) : undefined,
          awayScore:        away.score !== undefined ? parseInt(away.score, 10) : undefined,
          vegasHomeOdds:    homeOdds ?? undefined,
          vegasAwayOdds:    awayOdds ?? undefined,
          vegasDrawOdds:    drawOdds ?? undefined,
          vegasOverUnder:   overUnder ?? undefined,
        });
      }
    }

    logger.info({ sportKey, yyyymmdd, count: games.length }, "ESPN historical games fetched");
    return games;
  } catch (err) {
    logger.error({ err, sportKey, yyyymmdd }, "ESPN historical fetch failed");
    return [];
  }
}

/** All sport keys that map to the "Soccer" canonical sport. */
export const SOCCER_SPORT_KEYS = Object.keys(ESPN_SPORT_PATHS).filter(
  (k) => (SPORT_FOR_KEY[k] ?? k) === "Soccer",
);

export async function fetchAllSports(): Promise<FetchedGame[]> {
  const results = await Promise.allSettled(
    Object.keys(ESPN_SPORT_PATHS).map(fetchSportGames),
  );
  const all: FetchedGame[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  return all;
}

/** Per-sport fetch result — distinguishes 0 games from fetch errors. */
export interface SportFetchResult {
  sport: string;
  games: FetchedGame[];
  fetchStatus: "ok" | "error";
  errorMessage?: string;
}

/**
 * Like fetchAllSports() but returns one result per sport key so callers
 * can distinguish "no games today" from "ESPN fetch failed".
 */
export async function fetchAllSportsDetailed(): Promise<SportFetchResult[]> {
  const sportKeys = Object.keys(ESPN_SPORT_PATHS);

  return Promise.all(
    sportKeys.map(async (sportKey): Promise<SportFetchResult> => {
      const path = ESPN_SPORT_PATHS[sportKey];
      const sport = SPORT_FOR_KEY[sportKey] ?? sportKey;
      if (!path) return { sport, games: [], fetchStatus: "ok" };

      try {
        const games = await fetchSportGames(sportKey);
        return { sport, games, fetchStatus: "ok" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err, sportKey }, "ESPN fetch failed");
        return { sport, games: [], fetchStatus: "error", errorMessage: msg };
      }
    }),
  );
}
