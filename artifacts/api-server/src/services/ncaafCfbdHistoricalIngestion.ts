import { CFBD_PROVIDER, cfbdPayloadHash, cfbdRequestIdentity, type CfbdEndpoint, type CollegeFootballDataResponse } from "./collegeFootballData";

/** Manual-only: this orchestrator has no relationship to the live NCAAF lock. */
export const CFBD_HISTORICAL_SEASONS = [2023, 2024, 2025] as const;
export const CFBD_HISTORICAL_MAX_ENDPOINT_FAMILIES_PER_BATCH = 4;
export const CFBD_HISTORICAL_MAX_REQUESTS_PER_BATCH = 24;
export const CFBD_HISTORICAL_SCHEMA_VERSION = "ncaaf-cfbd-historical-v2";
export const CFBD_HISTORICAL_WEEKS = Array.from({ length: 16 }, (_, index) => index + 1);

export type CfbdHistoricalPhase = "core_games" | "optional_plays" | "aggregate_secondary";
export const CFBD_HISTORICAL_SECONDARY = [
  "season_team_stats", "advanced_stats", "player_stats", "roster", "recruiting",
  "transfers", "coaches", "sp", "elo", "srs", "fpi", "talent", "returning_production",
] as const satisfies readonly CfbdEndpoint[];
/** Aggregate families are retrospective only: they have no proven per-game chronology. */
export const CFBD_HISTORICAL_CLASSIFICATION: Readonly<Record<CfbdEndpoint, "B" | "C" | "D">> = {
  season_team_stats: "C", advanced_stats: "C", player_stats: "C", roster: "C",
  recruiting: "C", transfers: "D", coaches: "C", sp: "C", elo: "C", srs: "C",
  fpi: "C", talent: "C", returning_production: "C",
  games: "B", teams: "C", conferences: "C", venues: "C", plays: "B", weather: "C",
};

export interface CfbdHistoricalRequest {
  season: number;
  endpoint: CfbdEndpoint;
  phase: CfbdHistoricalPhase;
  query: Record<string, number>;
  requestIdentity: string;
}
export interface CfbdHistoricalCursor {
  version: typeof CFBD_HISTORICAL_SCHEMA_VERSION;
  phase: CfbdHistoricalPhase;
  offset: number;
}
export interface CfbdHistoricalBatch {
  requests: readonly CfbdHistoricalRequest[];
  cursor: CfbdHistoricalCursor | null;
  nextCursor: CfbdHistoricalCursor | null;
  endpointFamilies: readonly CfbdEndpoint[];
  estimatedTotalRequests: number;
}

function validSeasons(seasons: readonly number[]) {
  if (!seasons.length || seasons.some((season) => !Number.isInteger(season) || season < 2023 || season > 2025)) {
    throw new Error("CFBD historical ingestion is limited to integer seasons 2023 through 2025");
  }
  return [...seasons];
}
function item(season: number, endpoint: CfbdEndpoint, phase: CfbdHistoricalPhase, query: Record<string, number>): CfbdHistoricalRequest {
  return { season, endpoint, phase, query, requestIdentity: cfbdRequestIdentity(endpoint, query) };
}

/**
 * `games` is CFBD's season bulk endpoint. Core is intentionally atomic first:
 * exactly one all-games request per requested season, not weekly snapshots.
 * teams/conferences/venues are excluded because they are current reference
 * feeds, not historical evidence.
 */
export function cfbdHistoricalRequestPlan(
  phase: CfbdHistoricalPhase = "core_games",
  seasons: readonly number[] = CFBD_HISTORICAL_SEASONS,
): CfbdHistoricalRequest[] {
  const safeSeasons = validSeasons(seasons);
  if (phase === "core_games") return safeSeasons.map((season) => item(season, "games", phase, { year: season }));
  if (phase === "optional_plays") return safeSeasons.flatMap((season) =>
    CFBD_HISTORICAL_WEEKS.map((week) => item(season, "plays", phase, { year: season, week })));
  return safeSeasons.flatMap((season) => CFBD_HISTORICAL_SECONDARY.map((endpoint) =>
    item(season, endpoint, phase, { year: season })));
}
export function estimateCfbdHistoricalRequestVolume(
  phase: CfbdHistoricalPhase = "core_games",
  seasons: readonly number[] = CFBD_HISTORICAL_SEASONS,
) {
  const plan = cfbdHistoricalRequestPlan(phase, seasons);
  return { phase, seasons: [...seasons], totalRequests: plan.length, requestsPerSeason: plan.length / seasons.length };
}

export function nextCfbdHistoricalBatch(input: {
  cursor?: CfbdHistoricalCursor | null; phase?: CfbdHistoricalPhase; seasons?: readonly number[];
  maxEndpointFamilies?: number; maxRequests?: number;
} = {}): CfbdHistoricalBatch {
  const phase = input.cursor?.phase ?? input.phase ?? "core_games";
  if (input.cursor && input.cursor.version !== CFBD_HISTORICAL_SCHEMA_VERSION) throw new Error("Unsupported CFBD historical cursor version");
  if (input.phase && input.cursor && input.phase !== input.cursor.phase) throw new Error("CFBD historical cursor phase does not match requested phase");
  const plan = cfbdHistoricalRequestPlan(phase, input.seasons);
  const offset = input.cursor?.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > plan.length) throw new Error("Invalid CFBD historical cursor offset");
  const maxFamilies = Math.max(1, Math.min(CFBD_HISTORICAL_MAX_ENDPOINT_FAMILIES_PER_BATCH, input.maxEndpointFamilies ?? CFBD_HISTORICAL_MAX_ENDPOINT_FAMILIES_PER_BATCH));
  const maxRequests = Math.max(1, Math.min(CFBD_HISTORICAL_MAX_REQUESTS_PER_BATCH, input.maxRequests ?? CFBD_HISTORICAL_MAX_REQUESTS_PER_BATCH));
  if (offset === plan.length) return { requests: [], cursor: null, nextCursor: null, endpointFamilies: [], estimatedTotalRequests: plan.length };
  const requests: CfbdHistoricalRequest[] = [], endpointFamilies: CfbdEndpoint[] = [];
  let index = offset;
  while (index < plan.length && endpointFamilies.length < maxFamilies) {
    const endpoint = plan[index].endpoint, season = plan[index].season; let end = index;
    // A season's plays are the atomic optional unit.  Do not accidentally
    // combine all three seasons into a 48-request endpoint family.
    while (end < plan.length && plan[end].endpoint === endpoint && plan[end].season === season) end++;
    const family = plan.slice(index, end);
    if (family.length > maxRequests) throw new Error(`CFBD ${endpoint} family exceeds the request cap`);
    if (requests.length && requests.length + family.length > maxRequests) break;
    requests.push(...family); endpointFamilies.push(endpoint); index = end;
  }
  const cursor = { version: CFBD_HISTORICAL_SCHEMA_VERSION, phase, offset } as const;
  return { requests, endpointFamilies, estimatedTotalRequests: plan.length, cursor,
    nextCursor: index === plan.length ? null : { ...cursor, offset: index } };
}

export interface CfbdHistoricalCachedResponse { requestIdentity: string; payloadHash: string; response: CollegeFootballDataResponse }
export function cfbdHistoricalIdempotencyKey(requestIdentity: string, payloadHash: string) {
  return `${CFBD_HISTORICAL_SCHEMA_VERSION}:${CFBD_PROVIDER}:${requestIdentity}:${payloadHash}`;
}
export interface CfbdHistoricalImmutableCache {
  find(requestIdentity: string): Promise<CfbdHistoricalCachedResponse | null>;
  append(entry: CfbdHistoricalCachedResponse): Promise<void>;
}
export async function ingestCfbdHistoricalBatch(input: {
  cache: CfbdHistoricalImmutableCache;
  request: (endpoint: CfbdEndpoint, query: Record<string, number>) => Promise<CollegeFootballDataResponse>;
  cursor?: CfbdHistoricalCursor | null; phase?: CfbdHistoricalPhase; seasons?: readonly number[];
  maxEndpointFamilies?: number; maxRequests?: number;
}) {
  const batch = nextCfbdHistoricalBatch(input), captured: CfbdHistoricalCachedResponse[] = [];
  let cacheHits = 0;
  for (const planned of batch.requests) {
    const existing = await input.cache.find(planned.requestIdentity);
    if (existing) { cacheHits++; captured.push(existing); continue; }
    const response = await input.request(planned.endpoint, planned.query);
    if (response.requestIdentity !== planned.requestIdentity) throw new Error("CFBD response request identity does not match its historical plan");
    const payloadHash = cfbdPayloadHash(response.payload);
    if (payloadHash !== response.payloadHash) throw new Error("CFBD response payload hash does not match its payload");
    const entry = { requestIdentity: planned.requestIdentity, payloadHash, response };
    await input.cache.append(entry); captured.push(entry);
  }
  return { batch, requested: batch.requests.length, cacheHits, captured };
}