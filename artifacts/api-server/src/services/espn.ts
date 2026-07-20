import { logger } from "../lib/logger";

/**
 * Returns the YYYY-MM-DD date in US Eastern time (America/New_York).
 * US sports leagues schedule games in Eastern time, so a game at 8 PM ET
 * is "today" even if it falls on the next UTC calendar day.
 */
function toEasternDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2");
}

const ESPN_SPORT_PATHS: Record<string, string> = {
  NFL: "football/nfl",
  NCAAF: "football/college-football",
  NBA: "basketball/nba",
  NCAAB: "basketball/mens-college-basketball",
  MLB: "baseball/mlb",
  NHL: "hockey/nhl",
  WNBA: "basketball/wnba",
  Soccer: "soccer/usa.1",
  UFC: "mma/ufc",
};

interface EspnTeam {
  abbreviation?: string;
  displayName?: string;
  shortDisplayName?: string;
}

interface EspnAthlete {
  displayName?: string;
  shortName?: string;
}

interface EspnCompetitor {
  homeAway: "home" | "away";
  team?: EspnTeam;
  athlete?: EspnAthlete;
  records?: Array<{ type: string; summary: string }>;
  score?: string;
}

interface EspnStatus {
  type: {
    state: "pre" | "in" | "post";
    completed: boolean;
  };
}

interface EspnEvent {
  id: string;
  date: string;
  name: string;
  status: EspnStatus;
  competitions: Array<{
    competitors: EspnCompetitor[];
  }>;
}

interface EspnScoreboard {
  events?: EspnEvent[];
}

export interface FetchedGame {
  espnId: string;
  sport: string;
  homeTeamAbbr: string;
  homeTeamName: string;
  homeTeamRecord: string;
  awayTeamAbbr: string;
  awayTeamName: string;
  awayTeamRecord: string;
  gameTime: string;
  gameDate: string; // YYYY-MM-DD
  status: "upcoming" | "live" | "final";
  homeScore?: number;
  awayScore?: number;
}

function formatGameTime(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
      timeZoneName: "short",
    });
  } catch {
    return "TBD";
  }
}

function getRecord(competitor: EspnCompetitor): string {
  const total = competitor.records?.find((r) => r.type === "total");
  return total?.summary ?? "0-0";
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
  return raw.slice(0, 4).toUpperCase();
}

function getDisplayName(competitor: EspnCompetitor): string {
  return (
    competitor.team?.displayName ??
    competitor.athlete?.displayName ??
    "Unknown"
  );
}

async function fetchSportGames(sport: string): Promise<FetchedGame[]> {
  const path = ESPN_SPORT_PATHS[sport];
  if (!path) return [];

  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`;

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "TheBettingModel/1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      logger.warn({ sport, status: resp.status }, "ESPN request non-OK");
      return [];
    }

    const data = (await resp.json()) as EspnScoreboard;
    const events = data.events ?? [];
    const games: FetchedGame[] = [];

    for (const event of events) {
      const competition = event.competitions[0];
      if (!competition) continue;

      const home = competition.competitors.find((c) => c.homeAway === "home");
      const away = competition.competitors.find((c) => c.homeAway === "away");
      if (!home || !away) continue;

      const eventDate = new Date(event.date);
      const gameDate = toEasternDate(eventDate);

      games.push({
        espnId: `${sport}-${event.id}`,
        sport,
        homeTeamAbbr: getAbbr(home),
        homeTeamName: getDisplayName(home),
        homeTeamRecord: getRecord(home),
        awayTeamAbbr: getAbbr(away),
        awayTeamName: getDisplayName(away),
        awayTeamRecord: getRecord(away),
        gameTime: formatGameTime(event.date),
        gameDate,
        status: getStatus(event),
        homeScore:
          home.score !== undefined ? parseInt(home.score, 10) : undefined,
        awayScore:
          away.score !== undefined ? parseInt(away.score, 10) : undefined,
      });
    }

    logger.info({ sport, count: games.length }, "ESPN games fetched");
    return games;
  } catch (err) {
    logger.error({ err, sport }, "ESPN fetch failed");
    return [];
  }
}

export async function fetchAllSports(): Promise<FetchedGame[]> {
  const sports = Object.keys(ESPN_SPORT_PATHS);
  const results = await Promise.allSettled(sports.map(fetchSportGames));

  const all: FetchedGame[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  return all;
}

/** Per-sport fetch result — distinguishes 0 games (off-season) from fetch errors. */
export interface SportFetchResult {
  sport: string;
  games: FetchedGame[];
  /** "ok" = ESPN responded (may still be 0 games); "error" = network/HTTP failure */
  fetchStatus: "ok" | "error";
  errorMessage?: string;
}

/**
 * Like fetchAllSports() but returns a result per sport so callers can tell the
 * difference between "no games today" and "ESPN fetch failed".
 */
export async function fetchAllSportsDetailed(): Promise<SportFetchResult[]> {
  const sports = Object.keys(ESPN_SPORT_PATHS);

  const out: SportFetchResult[] = await Promise.all(
    sports.map(async (sport): Promise<SportFetchResult> => {
      const path = ESPN_SPORT_PATHS[sport];
      if (!path) return { sport, games: [], fetchStatus: "ok" };

      const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`;
      try {
        const resp = await fetch(url, {
          headers: { "User-Agent": "TheBettingModel/1.0" },
          signal: AbortSignal.timeout(8000),
        });

        if (!resp.ok) {
          logger.warn({ sport, status: resp.status }, "ESPN request non-OK");
          return {
            sport,
            games: [],
            fetchStatus: "error",
            errorMessage: `HTTP ${resp.status}`,
          };
        }

        const data = (await resp.json()) as EspnScoreboard;
        const events = data.events ?? [];
        const games: FetchedGame[] = [];

        for (const event of events) {
          const competition = event.competitions[0];
          if (!competition) continue;

          const home = competition.competitors.find((c) => c.homeAway === "home");
          const away = competition.competitors.find((c) => c.homeAway === "away");
          if (!home || !away) continue;

          const eventDate = new Date(event.date);
          const gameDate = toEasternDate(eventDate);

          games.push({
            espnId: `${sport}-${event.id}`,
            sport,
            homeTeamAbbr: getAbbr(home),
            homeTeamName: getDisplayName(home),
            homeTeamRecord: getRecord(home),
            awayTeamAbbr: getAbbr(away),
            awayTeamName: getDisplayName(away),
            awayTeamRecord: getRecord(away),
            gameTime: formatGameTime(event.date),
            gameDate,
            status: getStatus(event),
            homeScore:
              home.score !== undefined ? parseInt(home.score, 10) : undefined,
            awayScore:
              away.score !== undefined ? parseInt(away.score, 10) : undefined,
          });
        }

        logger.info({ sport, count: games.length }, "ESPN games fetched");
        return { sport, games, fetchStatus: "ok" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err, sport }, "ESPN fetch failed");
        return { sport, games: [], fetchStatus: "error", errorMessage: msg };
      }
    }),
  );

  return out;
}
