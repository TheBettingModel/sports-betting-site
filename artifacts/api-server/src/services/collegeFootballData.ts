import { createHash } from "node:crypto";

export const CFBD_PROVIDER = "college_football_data" as const;
export const CFBD_BASE_URL = "https://api.collegefootballdata.com";
export const CFBD_TIMEOUT_MS = 15_000;
export const CFBD_MAX_ATTEMPTS = 3;

export type CfbdEndpoint =
  | "games" | "teams" | "conferences" | "venues" | "season_team_stats"
  | "advanced_stats" | "plays" | "roster" | "player_stats" | "recruiting"
  | "transfers" | "coaches" | "sp" | "elo" | "srs" | "fpi" | "talent"
  | "returning_production" | "weather";

const paths: Record<CfbdEndpoint, string> = {
  games: "/games", teams: "/teams/fbs", conferences: "/conferences", venues: "/venues",
  season_team_stats: "/stats/season", advanced_stats: "/stats/season/advanced",
  plays: "/plays", roster: "/roster", player_stats: "/stats/player/season",
  recruiting: "/recruiting/players",
  // CFBD's documented transfer portal feed accepts the season through `year`.
  transfers: "/player/portal", coaches: "/coaches",
  sp: "/ratings/sp", elo: "/ratings/elo", srs: "/ratings/srs", fpi: "/ratings/fpi",
  talent: "/talent", returning_production: "/player/returning", weather: "/games/weather",
};

export class CollegeFootballDataError extends Error {
  constructor(
    message: string,
    readonly code: "CONFIGURATION" | "TIMEOUT" | "HTTP" | "NETWORK" | "INVALID_RESPONSE",
    readonly endpoint: CfbdEndpoint,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "CollegeFootballDataError";
  }
}

export interface CollegeFootballDataResponse {
  provider: typeof CFBD_PROVIDER;
  endpoint: CfbdEndpoint;
  requestIdentity: string;
  capturedAt: Date;
  providerObservedAt: Date | null;
  payloadHash: string;
  payload: unknown;
}

export interface CollegeFootballDataClientOptions {
  apiKey?: string;
  fetcher?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)]),
  );
  return value;
}

export function cfbdPayloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex");
}

export function cfbdRequestIdentity(endpoint: CfbdEndpoint, query: Record<string, string | number | boolean | undefined> = {}): string {
  const params = new URLSearchParams();
  Object.entries(query).filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => params.set(key, String(value)));
  return `${endpoint}?${params.toString()}`;
}

function isValidPayload(payload: unknown): boolean {
  return Array.isArray(payload) || (payload !== null && typeof payload === "object");
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Server-only CFBD transport. It does not log credentials or interpret data. */
export function createCollegeFootballDataClient(options: CollegeFootballDataClientOptions = {}) {
  const apiKey = options.apiKey ?? process.env["CFBD_API_KEY"];
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? delay;
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? CFBD_MAX_ATTEMPTS, CFBD_MAX_ATTEMPTS));

  async function request(
    endpoint: CfbdEndpoint,
    query: Record<string, string | number | boolean | undefined> = {},
  ): Promise<CollegeFootballDataResponse> {
    if (!apiKey) throw new CollegeFootballDataError("CFBD is not configured", "CONFIGURATION", endpoint);
    const requestIdentity = cfbdRequestIdentity(endpoint, query);
    const url = new URL(paths[endpoint], CFBD_BASE_URL);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
    let lastError: CollegeFootballDataError | undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CFBD_TIMEOUT_MS);
      try {
        const response = await fetcher(url, {
          headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          lastError = new CollegeFootballDataError(`CFBD request failed with HTTP ${response.status}`, "HTTP", endpoint, response.status);
          if (!retryable || attempt === maxAttempts - 1) throw lastError;
        } else {
          let payload: unknown;
          try { payload = await response.json(); } catch {
            throw new CollegeFootballDataError("CFBD returned invalid JSON", "INVALID_RESPONSE", endpoint);
          }
          if (!isValidPayload(payload)) throw new CollegeFootballDataError("CFBD response has an invalid shape", "INVALID_RESPONSE", endpoint);
          const observedHeader = response.headers.get("date");
          const observed = observedHeader ? new Date(observedHeader) : null;
          return {
            provider: CFBD_PROVIDER, endpoint, requestIdentity, capturedAt: now(),
            providerObservedAt: observed && Number.isFinite(observed.getTime()) ? observed : null,
            payloadHash: cfbdPayloadHash(payload), payload,
          };
        }
      } catch (error) {
        if (error instanceof CollegeFootballDataError) {
          if (error.code === "INVALID_RESPONSE" || error.code === "CONFIGURATION" || attempt === maxAttempts - 1) throw error;
          lastError = error;
        } else {
          const timedOut = controller.signal.aborted;
          lastError = new CollegeFootballDataError(timedOut ? "CFBD request timed out" : "CFBD request failed", timedOut ? "TIMEOUT" : "NETWORK", endpoint);
          if (attempt === maxAttempts - 1) throw lastError;
        }
      } finally { clearTimeout(timer); }
      await sleep(Math.min(1_000, 100 * 2 ** attempt));
    }
    throw lastError ?? new CollegeFootballDataError("CFBD request failed", "NETWORK", endpoint);
  }
  return { request };
}

export interface CfbdCapabilityProbe {
  provider: typeof CFBD_PROVIDER;
  endpoint: CfbdEndpoint;
  status: "available" | "partial" | "unavailable";
  httpStatus: number | null;
  latencyMs: number;
  shape: "array" | "object" | "invalid" | "unavailable";
}

/** Safe diagnostic: reports no URL query values, headers, or credential material. */
export async function probeCollegeFootballDataCapability(
  endpoint: CfbdEndpoint = "teams",
  client = createCollegeFootballDataClient(),
): Promise<CfbdCapabilityProbe> {
  const started = Date.now();
  try {
    const result = await client.request(endpoint);
    return { provider: CFBD_PROVIDER, endpoint, status: Array.isArray(result.payload) ? "available" : "partial",
      httpStatus: 200, latencyMs: Date.now() - started, shape: Array.isArray(result.payload) ? "array" : "object" };
  } catch (error) {
    const known = error instanceof CollegeFootballDataError ? error : null;
    return { provider: CFBD_PROVIDER, endpoint, status: "unavailable", httpStatus: known?.httpStatus ?? null,
      latencyMs: Date.now() - started, shape: "unavailable" };
  }
}

export const collegeFootballData = createCollegeFootballDataClient();