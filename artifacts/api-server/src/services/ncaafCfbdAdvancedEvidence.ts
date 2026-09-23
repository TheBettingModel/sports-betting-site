import {
  db, ncaafCfbdDomainEvidenceTable, ncaafCfbdPlayerMappingsTable, ncaafCfbdProviderHealthTable,
  ncaafCollegeFootballDataEvidenceTable, ncaafGameEvidenceTable,
} from "@workspace/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { CFBD_PROVIDER, cfbdPayloadHash, collegeFootballData, CollegeFootballDataError, type CfbdEndpoint, type CollegeFootballDataResponse } from "./collegeFootballData";

export type PitClassification = "A" | "B" | "C" | "D";
export const CFBD_DOMAIN_SCHEDULE: Readonly<Record<CfbdEndpoint, { domain: string; cadence: "daily" | "weekly" | "game"; pit: PitClassification }>> = {
  games: { domain: "game", cadence: "game", pit: "B" }, teams: { domain: "teamIdentity", cadence: "daily", pit: "B" },
  conferences: { domain: "conference", cadence: "daily", pit: "B" }, venues: { domain: "venue", cadence: "daily", pit: "B" },
  season_team_stats: { domain: "teamStats", cadence: "weekly", pit: "B" }, advanced_stats: { domain: "advanced", cadence: "weekly", pit: "B" },
  plays: { domain: "plays", cadence: "weekly", pit: "B" }, roster: { domain: "roster", cadence: "weekly", pit: "B" },
  player_stats: { domain: "playerStats", cadence: "weekly", pit: "B" }, recruiting: { domain: "recruiting", cadence: "daily", pit: "C" },
  transfers: { domain: "transfers", cadence: "daily", pit: "D" }, coaches: { domain: "coaching", cadence: "daily", pit: "B" },
  sp: { domain: "sp", cadence: "weekly", pit: "B" }, elo: { domain: "elo", cadence: "weekly", pit: "B" },
  srs: { domain: "srs", cadence: "weekly", pit: "C" }, fpi: { domain: "fpi", cadence: "weekly", pit: "C" },
  talent: { domain: "talent", cadence: "daily", pit: "C" }, returning_production: { domain: "returningProduction", cadence: "daily", pit: "C" },
  weather: { domain: "weather", cadence: "game", pit: "B" },
};
const endpoints = Object.keys(CFBD_DOMAIN_SCHEDULE) as CfbdEndpoint[];
/**
 * Pregame capture priority is intentionally independent of object declaration
 * order. Team identity and model priors are small, critical inputs and must be
 * activated before high-volume historical families can consume the cycle.
 * Successful endpoints fall out through the cadence check; failed endpoints
 * remain in their priority position until a success is recorded.
 */
export const CFBD_ADVANCED_ENDPOINT_PRIORITY = [
  "teams",
  "sp", "elo", "srs", "fpi", "talent", "returning_production", "coaches",
  "conferences", "venues", "season_team_stats", "advanced_stats",
  "plays", "roster", "player_stats", "recruiting", "transfers",
] as const satisfies readonly CfbdEndpoint[];
const advancedEndpointPriority = new Map<CfbdEndpoint, number>(
  CFBD_ADVANCED_ENDPOINT_PRIORITY.map((endpoint, index) => [endpoint, index]),
);
function utcDayStart(at: Date) {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}
function utcWeekStart(at: Date) {
  const day = at.getUTCDay() || 7; // Monday is the first day of the UTC week.
  const start = utcDayStart(at);
  start.setUTCDate(start.getUTCDate() - day + 1);
  return start;
}
export function cfbdEndpointDue(endpoint: CfbdEndpoint, at: Date, lastSuccessfulAt?: Date | null) {
  const cadence = CFBD_DOMAIN_SCHEDULE[endpoint].cadence;
  if (cadence === "game") return false;
  if (!lastSuccessfulAt || !Number.isFinite(lastSuccessfulAt.getTime())) return true;
  const periodStart = cadence === "daily" ? utcDayStart(at) : utcWeekStart(at);
  return lastSuccessfulAt < periodStart;
}
export function scheduledCfbdEndpoints(at: Date, lastSuccessfulByEndpoint: ReadonlyMap<CfbdEndpoint, Date> = new Map()): CfbdEndpoint[] {
  // A missed window (or a newly enabled endpoint) remains due until it succeeds.
  return endpoints.filter((endpoint) => cfbdEndpointDue(endpoint, at, lastSuccessfulByEndpoint.get(endpoint)))
    .sort((left, right) => {
      const priority = (advancedEndpointPriority.get(left) ?? Number.MAX_SAFE_INTEGER)
        - (advancedEndpointPriority.get(right) ?? Number.MAX_SAFE_INTEGER);
      return priority || left.localeCompare(right);
    });
}
export function prioritizedCfbdEndpoints(
  at: Date,
  lastSuccessfulByEndpoint: ReadonlyMap<CfbdEndpoint, Date> = new Map(),
  limit = 5,
): CfbdEndpoint[] {
  return scheduledCfbdEndpoints(at, lastSuccessfulByEndpoint)
    .filter((endpoint) => endpoint !== "games")
    .slice(0, Math.max(0, Math.min(5, limit)));
}
export function cfbdQueryForEndpoint(endpoint: CfbdEndpoint, season: number, week?: number, gameId?: string): Record<string, number | string | undefined> {
  if (endpoint === "plays") return { year: season, week };
  if (endpoint === "weather") return { gameId };
  if (endpoint === "games") return { year: season, week };
  if (["season_team_stats", "advanced_stats", "player_stats", "recruiting", "transfers", "sp", "elo", "srs", "fpi", "talent", "returning_production", "roster", "coaches"].includes(endpoint)) return { year: season };
  return {};
}
export function cfbdItemIdentity(endpoint: CfbdEndpoint, row: Record<string, unknown>) {
  const value = (...keys: string[]) => { const found = keys.map((key) => row[key]).find((item) => item != null); return found == null ? null : String(found); };
  const game = endpoint === "plays" || endpoint === "weather" ? value("gameId", "game_id") : null;
  // Only /teams has a CFBD team ID. Other verified CFBD families identify a
  // team by school string; resolution through the immutable teams ledger occurs
  // below and never falls back to a fuzzy name match.
  const team = endpoint === "teams" ? value("teamId", "team_id", "id") : null;
  const player = ["roster", "player_stats", "recruiting", "transfers"].includes(endpoint) ? value("playerId", "player_id", "recruitId", "id") : null;
  const teamName = typeof row.school === "string" ? row.school : typeof row.team === "string" ? row.team
    : typeof row.committedTo === "string" ? row.committedTo : null;
  const required = endpoint === "teams" ? team : endpoint === "plays" || endpoint === "weather" ? game : player ?? teamName;
  return { game, team, teamName, player, missingReasons: required ? {} : { stable_identity: `CFBD ${endpoint} item omitted its endpoint-specific stable identity` } };
}
function effective(row: Record<string, unknown>): Date | null {
  const source = row.startDate ?? row.date ?? row.updatedAt ?? row.lastUpdated;
  const parsed = typeof source === "string" ? new Date(source) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}
export interface AdvancedCaptureResult { requested: number; rawRows: number; domainRows: number; failed: Array<{ endpoint: CfbdEndpoint; cause: string }> }
export async function captureScheduledCfbdAdvancedEvidence(
  input: {
    season: number; week?: number; now?: Date;
    /** Manual/admin use only: no more than five non-game endpoint families. */
    forceEndpoints?: readonly CfbdEndpoint[];
    request?: (endpoint: CfbdEndpoint, query: Record<string, number | string | undefined>) => Promise<CollegeFootballDataResponse>;
  },
): Promise<AdvancedCaptureResult> {
  const now = input.now ?? new Date();
  const forced = input.forceEndpoints ?? [];
  if (forced.length > 5) throw new Error("CFBD forceEndpoints is limited to five endpoint families");
  if (forced.some((endpoint) => !CFBD_DOMAIN_SCHEDULE[endpoint] || endpoint === "games" || CFBD_DOMAIN_SCHEDULE[endpoint].cadence === "game")) {
    throw new Error("CFBD forceEndpoints may contain only non-game endpoint families");
  }
  // Health is append-only. This bounded lookup covers both cadence periods.
  const successes = await db.select({
    endpoint: ncaafCfbdProviderHealthTable.endpoint,
    attemptedAt: ncaafCfbdProviderHealthTable.attemptedAt,
  }).from(ncaafCfbdProviderHealthTable).where(and(
    eq(ncaafCfbdProviderHealthTable.succeeded, true),
    gte(ncaafCfbdProviderHealthTable.attemptedAt, utcWeekStart(now)),
  ));
  const lastSuccessfulByEndpoint = new Map<CfbdEndpoint, Date>();
  for (const success of successes) {
    if (!Object.prototype.hasOwnProperty.call(CFBD_DOMAIN_SCHEDULE, success.endpoint) || !success.attemptedAt) continue;
    const endpoint = success.endpoint as CfbdEndpoint;
    const previous = lastSuccessfulByEndpoint.get(endpoint);
    if (!previous || success.attemptedAt > previous) lastSuccessfulByEndpoint.set(endpoint, success.attemptedAt);
  }
  const due = prioritizedCfbdEndpoints(now, lastSuccessfulByEndpoint);
  // Keep the pregame cycle bounded. Successful families fall out of `due`, so
  // later cycles resume with the next endpoint group instead of repeating work.
  const scheduled = forced.length ? [...new Set(forced)] : due;
  const cfbdGames = await db.select({
    providerEventId: ncaafGameEvidenceTable.providerEventId,
    week: ncaafGameEvidenceTable.week,
    kickoffAt: ncaafGameEvidenceTable.kickoffAt,
  }).from(ncaafGameEvidenceTable).where(and(
    eq(ncaafGameEvidenceTable.provider, CFBD_PROVIDER),
    eq(ncaafGameEvidenceTable.season, input.season),
    gte(ncaafGameEvidenceTable.kickoffAt, new Date(now.getTime() - 14 * 86_400_000)),
    lte(ncaafGameEvidenceTable.kickoffAt, new Date(now.getTime() + 36 * 3_600_000)),
  ));
  const activeWeeks = [...new Set(cfbdGames
    .filter((game) => game.kickoffAt && game.kickoffAt <= now && game.week != null)
    .map((game) => game.week!))].sort((a, b) => b - a).slice(0, 2);
  const weatherDue = now.getUTCMinutes() < 15 && now.getUTCHours() % 6 === 0;
  const weatherGames = weatherDue ? [...new Set(cfbdGames
    .filter((game) => game.kickoffAt && game.kickoffAt >= now)
    .map((game) => game.providerEventId))].slice(0, 10) : [];
  const requests: Array<{ endpoint: CfbdEndpoint; query: Record<string, number | string | undefined> }> = [];
  for (const endpoint of scheduled) {
    if (endpoint === "plays") {
      for (const week of input.week != null ? [input.week] : activeWeeks) {
        requests.push({ endpoint, query: cfbdQueryForEndpoint(endpoint, input.season, week) });
      }
    } else {
      requests.push({ endpoint, query: cfbdQueryForEndpoint(endpoint, input.season, input.week) });
    }
  }
  requests.push(...weatherGames.map((gameId) => ({
    endpoint: "weather" as const,
    query: cfbdQueryForEndpoint("weather", input.season, undefined, gameId),
  })));
  // Name-based normalization in later domains consumes this refresh.
  requests.sort((left, right) => Number(right.endpoint === "teams") - Number(left.endpoint === "teams"));
  const result: AdvancedCaptureResult = { requested: requests.length, rawRows: 0, domainRows: 0, failed: [] };
  const teamNames = new Map<string, string>();
  const knownTeamPayloads = await db.select({ payload: ncaafCollegeFootballDataEvidenceTable.payload })
    .from(ncaafCollegeFootballDataEvidenceTable).where(and(
      eq(ncaafCollegeFootballDataEvidenceTable.endpoint, "teams"), eq(ncaafCollegeFootballDataEvidenceTable.season, input.season),
    ));
  for (const raw of knownTeamPayloads) if (Array.isArray(raw.payload)) for (const entry of raw.payload) {
    if (!entry || typeof entry !== "object") continue;
    const team = entry as Record<string, unknown>;
    if (typeof team.school === "string" && team.id != null) teamNames.set(team.school.trim().toLocaleLowerCase("en-US"), String(team.id));
  }
  for (const { endpoint, query } of requests) {
    const started = Date.now();
    try {
      const response = await (input.request ?? ((name, requestQuery) => collegeFootballData.request(name, requestQuery)))(endpoint, query);
      const raw = await db.insert(ncaafCollegeFootballDataEvidenceTable).values({
        provider: CFBD_PROVIDER, endpoint, requestIdentity: response.requestIdentity, season: input.season, week: typeof query.week === "number" ? query.week : null,
        capturedAt: response.capturedAt, modeledAsOf: response.capturedAt, providerObservedAt: response.providerObservedAt,
        payloadHash: response.payloadHash, payload: response.payload, evidenceState: "observed", missingFields: [], missingReasons: {},
      }).onConflictDoNothing().returning({ id: ncaafCollegeFootballDataEvidenceTable.id });
      result.rawRows += raw.length;
      // Normalize only against the row just appended; an idempotent raw payload
      // already has its immutable normalized representation.
      let endpointDomainRows = 0;
      if (raw[0] && Array.isArray(response.payload)) {
        const domainValues: Array<typeof ncaafCfbdDomainEvidenceTable.$inferInsert> = [];
        const playerValues: Array<typeof ncaafCfbdPlayerMappingsTable.$inferInsert> = [];
        for (const item of response.payload) {
          if (!item || typeof item !== "object") continue;
          const payload = item as Record<string, unknown>; const identity = cfbdItemIdentity(endpoint, payload); const itemHash = cfbdPayloadHash(payload);
          if (endpoint === "teams" && identity.teamName && identity.team) teamNames.set(identity.teamName.trim().toLocaleLowerCase("en-US"), identity.team);
          if (!identity.team && identity.teamName) {
            identity.team = teamNames.get(identity.teamName.trim().toLocaleLowerCase("en-US")) ?? null;
            if (!identity.team) (identity.missingReasons as Record<string, string>).cfbd_team_id = "No exact CFBD teams-ledger match for provider school name";
          }
          domainValues.push({
            rawEvidenceId: raw[0].id, parentRawPayloadHash: response.payloadHash, endpoint,
            domain: CFBD_DOMAIN_SCHEDULE[endpoint].domain, season: input.season,
            week: typeof query.week === "number" ? query.week : null,
            cfbdGameId: identity.game, cfbdTeamId: identity.team, cfbdPlayerId: identity.player,
            providerEffectiveAt: effective(payload), capturedAt: response.capturedAt,
            pitClassification: CFBD_DOMAIN_SCHEDULE[endpoint].pit, evidenceState: "observed",
            missingReasons: identity.missingReasons, payloadHash: itemHash, payload,
          });
          if ((endpoint === "roster" || endpoint === "player_stats") && identity.player) {
            const playerEvidence = { cfbdPlayerId: identity.player, cfbdTeamId: identity.team, sourceEndpoint: endpoint, payloadHash: itemHash };
            playerValues.push({
              cfbdPlayerId: identity.player, cfbdTeamId: identity.team, season: input.season,
              canonicalProvider: null, canonicalPlayerId: null, state: "PROVIDER_ONLY",
              reason: "No cross-provider player identifier bridge is present; name matching is prohibited",
              evidence: playerEvidence, payloadHash: cfbdPayloadHash(playerEvidence), capturedAt: response.capturedAt,
            });
          }
        }
        for (let offset = 0; offset < domainValues.length; offset += 500) {
          const inserted = await db.insert(ncaafCfbdDomainEvidenceTable).values(domainValues.slice(offset, offset + 500))
            .onConflictDoNothing().returning({ id: ncaafCfbdDomainEvidenceTable.id });
          result.domainRows += inserted.length;
          endpointDomainRows += inserted.length;
        }
        for (let offset = 0; offset < playerValues.length; offset += 500) {
          await db.insert(ncaafCfbdPlayerMappingsTable).values(playerValues.slice(offset, offset + 500)).onConflictDoNothing();
        }
      }
      await db.insert(ncaafCfbdProviderHealthTable).values({
        endpoint, attemptedAt: response.transport.requestStartedAt, finishedAt: response.transport.requestFinishedAt,
        succeeded: true, outcome: "success", httpStatus: response.transport.status,
        failureCategory: null, contentType: response.transport.contentType,
        latencyMs: response.transport.durationMs || Date.now() - started, retryCount: response.transport.retryCount,
        payloadBytes: response.transport.byteLength,
        rowsMaterialized: raw.length + endpointDomainRows });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error); result.failed.push({ endpoint, cause: message });
      const known = error instanceof CollegeFootballDataError ? error : null;
      await db.insert(ncaafCfbdProviderHealthTable).values({
        endpoint, attemptedAt: known?.metadata?.requestStartedAt ?? now,
        finishedAt: known?.metadata?.requestFinishedAt ?? new Date(),
        succeeded: false, outcome: "failure", httpStatus: known?.httpStatus ?? null,
        failureCategory: known?.metadata?.failureCategory ?? known?.code?.toLocaleLowerCase("en-US") ?? "unknown",
        contentType: known?.metadata?.contentType ?? null,
        latencyMs: known?.metadata?.durationMs ?? Date.now() - started,
        retryCount: known?.metadata?.retryCount ?? 0,
        payloadBytes: known?.metadata?.byteLength ?? null,
        timeout: known?.code === "TIMEOUT", rateLimited: known?.httpStatus === 429,
        authError: known?.httpStatus === 401 || known?.httpStatus === 403,
        validationError: known?.code === "INVALID_RESPONSE", rowsMaterialized: 0,
      });
    }
  }
  return result;
}