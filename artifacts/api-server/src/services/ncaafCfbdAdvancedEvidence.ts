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
export function scheduledCfbdEndpoints(at: Date): CfbdEndpoint[] {
  // The production cycle is every 15 minutes. Static families run at 02:02 UTC,
  // week-bounded families at 03:02 UTC Monday.
  const minute = at.getUTCMinutes(); const hour = at.getUTCHours();
  return endpoints.filter((endpoint) => {
    const cadence = CFBD_DOMAIN_SCHEDULE[endpoint].cadence;
    // `plays` and `weather` require a provider game identity and are purposely
    // excluded from bulk polling. They are captured only by a bounded
    // game-specific caller once a CFBD game has been selected.
    return cadence !== "game" && (
      cadence === "daily" && hour === 2 && minute < 15
      || cadence === "weekly" && at.getUTCDay() === 1 && hour === 3 && minute < 15
    );
  });
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
  input: { season: number; week?: number; now?: Date; request?: (endpoint: CfbdEndpoint, query: Record<string, number | string | undefined>) => Promise<CollegeFootballDataResponse> },
): Promise<AdvancedCaptureResult> {
  const now = input.now ?? new Date();
  const scheduled = scheduledCfbdEndpoints(now).filter((endpoint) => endpoint !== "games");
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
        provider: CFBD_PROVIDER, endpoint, requestIdentity: response.requestIdentity, season: input.season, week: input.week ?? null,
        capturedAt: response.capturedAt, modeledAsOf: response.capturedAt, providerObservedAt: response.providerObservedAt,
        payloadHash: response.payloadHash, payload: response.payload, evidenceState: "observed", missingFields: [], missingReasons: {},
      }).onConflictDoNothing().returning({ id: ncaafCollegeFootballDataEvidenceTable.id });
      result.rawRows += raw.length;
      // Normalize only against the row just appended; an idempotent raw payload
      // already has its immutable normalized representation.
      let endpointDomainRows = 0;
      if (raw[0] && Array.isArray(response.payload)) for (const item of response.payload) {
        if (!item || typeof item !== "object") continue;
        const payload = item as Record<string, unknown>; const identity = cfbdItemIdentity(endpoint, payload); const itemHash = cfbdPayloadHash(payload);
        if (endpoint === "teams" && identity.teamName && identity.team) teamNames.set(identity.teamName.trim().toLocaleLowerCase("en-US"), identity.team);
        if (!identity.team && identity.teamName) {
          identity.team = teamNames.get(identity.teamName.trim().toLocaleLowerCase("en-US")) ?? null;
          if (!identity.team) (identity.missingReasons as Record<string, string>).cfbd_team_id = "No exact CFBD teams-ledger match for provider school name";
        }
        const inserted = await db.insert(ncaafCfbdDomainEvidenceTable).values({
          rawEvidenceId: raw[0].id, parentRawPayloadHash: response.payloadHash, endpoint, domain: CFBD_DOMAIN_SCHEDULE[endpoint].domain, season: input.season, week: input.week ?? null,
          cfbdGameId: identity.game, cfbdTeamId: identity.team, cfbdPlayerId: identity.player, providerEffectiveAt: effective(payload),
          capturedAt: response.capturedAt, pitClassification: CFBD_DOMAIN_SCHEDULE[endpoint].pit, evidenceState: "observed",
          missingReasons: identity.missingReasons, payloadHash: itemHash, payload,
        }).onConflictDoNothing().returning({ id: ncaafCfbdDomainEvidenceTable.id });
        result.domainRows += inserted.length;
        endpointDomainRows += inserted.length;
        if ((endpoint === "roster" || endpoint === "player_stats") && identity.player) {
          const playerEvidence = { cfbdPlayerId: identity.player, cfbdTeamId: identity.team, sourceEndpoint: endpoint, payloadHash: itemHash };
          await db.insert(ncaafCfbdPlayerMappingsTable).values({
            cfbdPlayerId: identity.player, cfbdTeamId: identity.team, season: input.season,
            canonicalProvider: null, canonicalPlayerId: null, state: "PROVIDER_ONLY",
            reason: "No cross-provider player identifier bridge is present; name matching is prohibited",
            evidence: playerEvidence, payloadHash: cfbdPayloadHash(playerEvidence), capturedAt: response.capturedAt,
          }).onConflictDoNothing();
        }
      }
      await db.insert(ncaafCfbdProviderHealthTable).values({ endpoint, attemptedAt: now, succeeded: true, httpStatus: 200,
        latencyMs: Date.now() - started, payloadBytes: Buffer.byteLength(JSON.stringify(response.payload)),
        rowsMaterialized: raw.length + endpointDomainRows });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error); result.failed.push({ endpoint, cause: message });
      const known = error instanceof CollegeFootballDataError ? error : null;
      await db.insert(ncaafCfbdProviderHealthTable).values({ endpoint, attemptedAt: now, succeeded: false, httpStatus: known?.httpStatus ?? null,
        latencyMs: Date.now() - started, timeout: known?.code === "TIMEOUT", rateLimited: known?.httpStatus === 429,
        authError: known?.httpStatus === 401 || known?.httpStatus === 403, validationError: known?.code === "INVALID_RESPONSE", rowsMaterialized: 0 });
    }
  }
  return result;
}