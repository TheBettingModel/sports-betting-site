import { createHash } from "node:crypto";

export const MLB_HISTORICAL_SOURCE_VERSION = "mlb-stats-api-history-v1";

export type HistoricalStarterState =
  | "CONFIRMED_PREGAME"
  | "PROJECTED_PREGAME"
  | "ACTUAL_ONLY"
  | "UNKNOWN";

export interface HistoricalTeamRef {
  providerTeamId: string;
  name: string;
}

export interface HistoricalGameSourceRow {
  providerGameId: string;
  season: number;
  gameType: string;
  gameDate: string;
  scheduledFirstPitch: string;
  actualStartTime: string | null;
  completionTime: string | null;
  home: HistoricalTeamRef;
  away: HistoricalTeamRef;
  venue: { providerVenueId: string; name: string } | null;
  homeRuns: number | null;
  awayRuns: number | null;
  inningsPlayed: number | null;
  gameStatus: string;
  detailedStatus: string;
  abstractStatus: string;
  gameNumber: number | null;
  doubleheaderStatus: string;
  postseason: boolean;
  neutralSite: boolean;
  suspended: boolean;
  resumed: boolean;
  chronologyState: "PROVIDER_COMPLETION_TIME" | "NORMAL_GAME_PROXY" | "AMBIGUOUS";
  probableStarters: {
    home: { providerPlayerId: string; name: string } | null;
    away: { providerPlayerId: string; name: string } | null;
  };
  starterState: { home: HistoricalStarterState; away: HistoricalStarterState };
  payloadHash: string;
  raw: unknown;
}

type JsonRecord = Record<string, unknown>;

function object(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function stableHistoricalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableHistoricalJson).join(",")}]`;
  const row = value as JsonRecord;
  return `{${Object.keys(row).sort().map((key) =>
    `${JSON.stringify(key)}:${stableHistoricalJson(row[key])}`).join(",")}}`;
}

export function historicalPayloadHash(value: unknown): string {
  return createHash("sha256").update(stableHistoricalJson(value)).digest("hex");
}

function parseTeam(value: unknown): HistoricalTeamRef | null {
  const root = object(value);
  const team = object(root.team);
  const id = numberOrNull(team.id);
  const name = stringOrNull(team.name);
  return id !== null && name ? { providerTeamId: String(id), name } : null;
}

function parseProbable(value: unknown): { providerPlayerId: string; name: string } | null {
  const probable = object(object(value).probablePitcher);
  const id = numberOrNull(probable.id);
  const name = stringOrNull(probable.fullName);
  return id !== null && name ? { providerPlayerId: String(id), name } : null;
}

/** Pure parser. Provider history is outcome evidence, not proof of pregame availability. */
export function parseHistoricalSchedulePayload(payload: unknown): HistoricalGameSourceRow[] {
  const games = (Array.isArray(object(payload).dates) ? object(payload).dates as unknown[] : [])
    .flatMap((date) => Array.isArray(object(date).games) ? object(date).games as unknown[] : []);
  const parsed: HistoricalGameSourceRow[] = [];
  for (const raw of games) {
    const game = object(raw);
    const teams = object(game.teams);
    const home = parseTeam(teams.home);
    const away = parseTeam(teams.away);
    const gamePk = numberOrNull(game.gamePk);
    const scheduled = stringOrNull(game.gameDate);
    const officialDate = stringOrNull(game.officialDate);
    if (gamePk === null || !scheduled || !officialDate || !home || !away) continue;
    const status = object(game.status);
    const linescore = object(game.linescore);
    const homeRoot = object(teams.home);
    const awayRoot = object(teams.away);
    const venueRoot = object(game.venue);
    const venueId = numberOrNull(venueRoot.id);
    const venueName = stringOrNull(venueRoot.name);
    const homeProbable = parseProbable(teams.home);
    const awayProbable = parseProbable(teams.away);
    const detailed = stringOrNull(status.detailedState) ?? "Unknown";
    const coded = stringOrNull(status.codedGameState) ?? "unknown";
    const resumeDate = stringOrNull(game.resumeDate);
    const rescheduledFrom = stringOrNull(game.rescheduledFrom);
    const rescheduledGameDate = stringOrNull(game.rescheduledGameDate);
    const suspended = /suspend/i.test(detailed);
    const resumed = resumeDate !== null || rescheduledFrom !== null || rescheduledGameDate !== null || /resume/i.test(detailed);
    const completionTime = stringOrNull(game.gameEndDate);
    parsed.push({
      providerGameId: String(gamePk),
      season: numberOrNull(game.season) ?? Number(officialDate.slice(0, 4)),
      gameType: stringOrNull(game.gameType) ?? "UNKNOWN",
      gameDate: officialDate,
      scheduledFirstPitch: scheduled,
      actualStartTime: stringOrNull(game.actualStartTime),
      completionTime,
      home,
      away,
      venue: venueId !== null && venueName
        ? { providerVenueId: String(venueId), name: venueName }
        : null,
      homeRuns: numberOrNull(homeRoot.score),
      awayRuns: numberOrNull(awayRoot.score),
      inningsPlayed: numberOrNull(linescore.currentInning),
      gameStatus: coded,
      detailedStatus: detailed,
      abstractStatus: stringOrNull(status.abstractGameState) ?? "Unknown",
      gameNumber: numberOrNull(game.gameNumber),
      doubleheaderStatus: stringOrNull(game.doubleHeader) ?? "N",
      postseason: (stringOrNull(game.gameType) ?? "R") !== "R",
      neutralSite: game.neutralSite === true,
      suspended,
      resumed,
      chronologyState: completionTime
        ? "PROVIDER_COMPLETION_TIME"
        : suspended || resumed ? "AMBIGUOUS" : "NORMAL_GAME_PROXY",
      probableStarters: { home: homeProbable, away: awayProbable },
      starterState: {
        home: homeProbable ? "ACTUAL_ONLY" : "UNKNOWN",
        away: awayProbable ? "ACTUAL_ONLY" : "UNKNOWN",
      },
      payloadHash: historicalPayloadHash(raw),
      raw,
    });
  }
  return parsed.sort((a, b) =>
    a.scheduledFirstPitch.localeCompare(b.scheduledFirstPitch)
    || Number(a.providerGameId) - Number(b.providerGameId));
}

export interface HistoricalFetchOptions {
  startDate: string;
  endDate: string;
  gameTypes?: readonly string[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

function assertIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(new Date(`${value}T00:00:00Z`).getTime())) {
    throw new Error(`Invalid MLB historical date: ${value}`);
  }
}

/** One bounded schedule request; callers batch seasons deliberately. */
export async function fetchHistoricalMlbSchedule(
  options: HistoricalFetchOptions,
): Promise<{ rows: HistoricalGameSourceRow[]; retrievedAt: string; requestUrl: string; payloadHash: string }> {
  assertIsoDate(options.startDate);
  assertIsoDate(options.endDate);
  if (options.startDate > options.endDate) throw new Error("Historical startDate must be before endDate");
  const gameTypes = options.gameTypes?.length ? options.gameTypes.join(",") : "R,F,D,L,W";
  const params = new URLSearchParams({
    sportId: "1",
    startDate: options.startDate,
    endDate: options.endDate,
    gameTypes,
    hydrate: "team,probablePitcher,linescore",
  });
  const requestUrl = `https://statsapi.mlb.com/api/v1/schedule?${params}`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(requestUrl, {
    headers: { "User-Agent": "TheBettingModel historical-research/1.0" },
    signal: options.signal ?? AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`MLB Stats API schedule failed: ${response.status}`);
  const payload = await response.json();
  return {
    rows: parseHistoricalSchedulePayload(payload),
    retrievedAt: new Date().toISOString(),
    requestUrl,
    payloadHash: historicalPayloadHash(payload),
  };
}

export async function fetchHistoricalMlbBoxscore(
  providerGameId: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<{ payload: unknown; retrievedAt: string; requestUrl: string; payloadHash: string }> {
  if (!/^\d+$/.test(providerGameId)) throw new Error("Invalid MLB provider game id");
  const requestUrl = `https://statsapi.mlb.com/api/v1/game/${providerGameId}/boxscore`;
  const response = await (options.fetchImpl ?? fetch)(requestUrl, {
    headers: { "User-Agent": "TheBettingModel historical-research/1.0" },
    signal: options.signal ?? AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`MLB Stats API boxscore failed: ${response.status}`);
  const payload = await response.json();
  return { payload, retrievedAt: new Date().toISOString(), requestUrl, payloadHash: historicalPayloadHash(payload) };
}