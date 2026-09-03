import { createHash } from "node:crypto";

export const ESPN_NCAAF_SUMMARY_ENDPOINT =
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary";

export class EspnNcaafSummaryError extends Error {
  constructor(
    public readonly code: "INVALID_EVENT_ID" | "NETWORK" | "HTTP" | "INVALID_RESPONSE" | "NOT_COMPLETED",
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "EspnNcaafSummaryError";
  }
}

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
const records = (value: unknown): JsonRecord[] => Array.isArray(value)
  ? value.map(record).filter((item): item is JsonRecord => item !== null) : [];
const string = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const integer = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null;
};
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export interface NumericPair { made: number | null; attempted: number | null; }
export function parseNumericPair(value: unknown, separator: "/" | "-" = "/"): NumericPair {
  if (typeof value !== "string") return { made: null, attempted: null };
  const match = value.trim().match(separator === "/" ? /^(\d+)\s*\/\s*(\d+)$/ : /^(\d+)\s*-\s*(\d+)$/);
  return match ? { made: Number(match[1]), attempted: Number(match[2]) } : { made: null, attempted: null };
}

/** ESPN uses mm:ss (and occasionally h:mm:ss) for possession. */
export function parsePossessionSeconds(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value.trim())) return null;
  const parts = value.trim().split(":").map(Number);
  if (parts.some((part) => !Number.isInteger(part)) || parts.slice(1).some((part) => part > 59)) return null;
  return parts.length === 2 ? parts[0]! * 60 + parts[1]! : parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
}

export interface NcaafSummaryTeam {
  providerTeamId: string | null;
  homeAway: "home" | "away" | "unknown";
  displayName: string | null;
  statistics: Readonly<Record<string, string | null>>;
  totalYards: number | null;
  netPassingYards: number | null;
  rushingYards: number | null;
  totalPlays: number | null;
  turnovers: number | null;
  completionAttempts: NumericPair;
  thirdDown: NumericPair;
  penalties: NumericPair;
  possessionSeconds: number | null;
  missingFields: readonly string[];
  missingReasons: Readonly<Record<string, string>>;
}

export interface NcaafSummaryDrive {
  providerDriveId: string | null;
  providerTeamId: string | null;
  description: string | null;
  result: string | null;
  start: Readonly<Record<string, unknown>> | null;
  end: Readonly<Record<string, unknown>> | null;
  timeElapsed: string | null;
  plays: number | null;
  yards: number | null;
  isScore: boolean | null;
}

export interface NcaafSummaryPlayer {
  providerTeamId: string | null;
  providerPlayerId: string | null;
  displayName: string | null;
  category: string | null;
  statistics: Readonly<Record<string, string | null>>;
}

export interface NcaafSummaryQuarterback extends NcaafSummaryPlayer {
  completions: number | null;
  attempts: number | null;
  passingYards: number | null;
  passingTouchdowns: number | null;
  interceptions: number | null;
}

export interface NcaafEspnSummaryPayload {
  readonly provider: "espn";
  readonly sourceEndpoint: string;
  readonly providerEventId: string;
  readonly retrievedAt: string;
  readonly effectiveAt: string | null;
  readonly teams: readonly NcaafSummaryTeam[];
  readonly drives: readonly NcaafSummaryDrive[];
  readonly players: readonly NcaafSummaryPlayer[];
  readonly quarterbacks: readonly NcaafSummaryQuarterback[];
  readonly missingFields: readonly string[];
  readonly missingReasons: Readonly<Record<string, string>>;
  readonly payloadHash: string;
}

function statMap(stats: unknown): Record<string, string | null> {
  return Object.fromEntries(records(stats).map((stat) => [string(stat.name) ?? "unknown", string(stat.displayValue)]));
}
function missing(value: unknown, field: string, fields: string[], reasons: Record<string, string>) {
  if (value === null) { fields.push(field); reasons[field] = "ESPN summary omitted or supplied an invalid value"; }
}
function normalizedTeam(value: JsonRecord): NcaafSummaryTeam {
  const team = record(value.team);
  const statistics = statMap(value.statistics);
  const fields: string[] = [], reasons: Record<string, string> = {};
  const totalYards = integer(statistics.totalYards), netPassingYards = integer(statistics.netPassingYards);
  const rushingYards = integer(statistics.rushingYards), totalPlays = integer(statistics.totalPlays);
  const turnovers = integer(statistics.turnovers), completionAttempts = parseNumericPair(statistics.completionAttempts);
  const thirdDown = parseNumericPair(statistics.thirdDownEff, "-"), penalties = parseNumericPair(statistics.totalPenaltiesYards, "-");
  const possessionSeconds = parsePossessionSeconds(statistics.possessionTime);
  for (const [field, value] of Object.entries({ totalYards, netPassingYards, rushingYards, turnovers, possessionSeconds })) missing(value, field, fields, reasons);
  if (completionAttempts.made === null) missing(null, "completionAttempts", fields, reasons);
  if (thirdDown.made === null) missing(null, "thirdDown", fields, reasons);
  if (penalties.made === null) missing(null, "penalties", fields, reasons);
  return Object.freeze({ providerTeamId: string(team?.id), homeAway: value.homeAway === "home" || value.homeAway === "away" ? value.homeAway : "unknown",
    displayName: string(team?.displayName), statistics: Object.freeze(statistics), totalYards, netPassingYards, rushingYards, totalPlays, turnovers,
    completionAttempts: Object.freeze(completionAttempts), thirdDown: Object.freeze(thirdDown), penalties: Object.freeze(penalties), possessionSeconds,
    missingFields: Object.freeze(fields), missingReasons: Object.freeze(reasons) });
}

function normalizePlayers(boxscore: JsonRecord): { players: NcaafSummaryPlayer[]; quarterbacks: NcaafSummaryQuarterback[] } {
  const players: NcaafSummaryPlayer[] = [], quarterbacks: NcaafSummaryQuarterback[] = [];
  for (const group of records(boxscore.players)) {
    const providerTeamId = string(record(group.team)?.id);
    for (const category of records(group.statistics)) {
      const keys = Array.isArray(category.keys) ? category.keys.map(string) : [];
      for (const row of records(category.athletes)) {
        const athlete = record(row.athlete), values = Array.isArray(row.stats) ? row.stats : [];
        const statistics = Object.fromEntries(keys.map((key, index) => [key ?? `stat${index}`, string(values[index])]));
        const player = Object.freeze({ providerTeamId, providerPlayerId: string(athlete?.id), displayName: string(athlete?.displayName),
          category: string(category.name), statistics: Object.freeze(statistics) });
        players.push(player);
        if (category.name === "passing") {
          const pair = parseNumericPair(statistics["completions/passingAttempts"]);
          quarterbacks.push(Object.freeze({ ...player, completions: pair.made, attempts: pair.attempted, passingYards: integer(statistics.passingYards),
            passingTouchdowns: integer(statistics.passingTouchdowns), interceptions: integer(statistics.interceptions) }));
        }
      }
    }
  }
  return { players, quarterbacks };
}

function normalizeDrives(root: JsonRecord): NcaafSummaryDrive[] {
  const drives = record(root.drives);
  return records(drives?.previous).map((drive) => Object.freeze({
    providerDriveId: string(drive.id), providerTeamId: string(record(drive.team)?.id), description: string(drive.description), result: string(drive.result),
    start: record(drive.start), end: record(drive.end), timeElapsed: string(record(drive.timeElapsed)?.displayValue),
    plays: integer(drive.plays), yards: integer(drive.yards), isScore: typeof drive.isScore === "boolean" ? drive.isScore : null,
  }));
}

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

/** Normalizes explicitly-completed ESPN summary responses; it never reads markets, odds, pickcenter, or predictor data. */
export function normalizeEspnNcaafSummary(response: unknown, retrievedAt = new Date()): NcaafEspnSummaryPayload {
  const root = record(response);
  if (!root) throw new EspnNcaafSummaryError("INVALID_RESPONSE", "ESPN summary was not an object");
  const header = record(root.header), competition = records(header?.competitions)[0], status = record(competition?.status), type = record(status?.type);
  if (type?.completed !== true) throw new EspnNcaafSummaryError("NOT_COMPLETED", "ESPN summary is not an explicitly completed game");
  const eventId = string(header?.id) ?? string(competition?.id);
  if (!eventId) throw new EspnNcaafSummaryError("INVALID_RESPONSE", "ESPN summary omitted the event identifier");
  const boxscore = record(root.boxscore) ?? {};
  const teams = records(boxscore.teams).map(normalizedTeam);
  const { players, quarterbacks } = normalizePlayers(boxscore);
  const drives = normalizeDrives(root);
  const missingFields: string[] = [], missingReasons: Record<string, string> = {};
  if (!teams.length) { missingFields.push("teams"); missingReasons.teams = "ESPN summary omitted boxscore teams"; }
  if (!drives.length) { missingFields.push("drives"); missingReasons.drives = "ESPN summary omitted completed-game drive data"; }
  if (!players.length) { missingFields.push("players"); missingReasons.players = "ESPN summary omitted player statistics"; }
  const effectiveAt = string(competition?.date) ?? string(record(header?.season)?.year);
  const canonical: Omit<NcaafEspnSummaryPayload, "retrievedAt" | "payloadHash"> = {
    provider: "espn", sourceEndpoint: ESPN_NCAAF_SUMMARY_ENDPOINT, providerEventId: eventId, effectiveAt,
    teams, drives, players, quarterbacks, missingFields, missingReasons,
  };
  return deepFreeze({ ...canonical, retrievedAt: retrievedAt.toISOString(), missingFields: Object.freeze(missingFields), missingReasons: Object.freeze(missingReasons), payloadHash: hash(canonical) });
}

export async function fetchEspnNcaafSummary(eventId: string, options: { timeoutMs?: number; fetchFn?: typeof fetch } = {}): Promise<NcaafEspnSummaryPayload> {
  const providerEventId = eventId.replace(/^NCAAF-/i, "");
  if (!/^\d+$/.test(providerEventId)) throw new EspnNcaafSummaryError("INVALID_EVENT_ID", "ESPN event ID must be numeric", { eventId });
  const url = `${ESPN_NCAAF_SUMMARY_ENDPOINT}?event=${encodeURIComponent(providerEventId)}`;
  let response: Response;
  try {
    response = await (options.fetchFn ?? fetch)(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(options.timeoutMs ?? 15_000) });
  } catch (cause) {
    throw new EspnNcaafSummaryError("NETWORK", "ESPN NCAAF summary request failed", { eventId: providerEventId, cause: cause instanceof Error ? cause.message : String(cause) });
  }
  if (!response.ok) throw new EspnNcaafSummaryError("HTTP", "ESPN NCAAF summary returned an HTTP error", { eventId: providerEventId, status: response.status });
  try { return normalizeEspnNcaafSummary(await response.json()); }
  catch (cause) { if (cause instanceof EspnNcaafSummaryError) throw cause; throw new EspnNcaafSummaryError("INVALID_RESPONSE", "ESPN NCAAF summary was invalid JSON", { eventId }); }
}