import { createHash } from "node:crypto";

export const CFBD_PROVIDER = "college_football_data" as const;
export const CFBD_BASE_URL = "https://api.collegefootballdata.com";
export const CFBD_TIMEOUT_MS = 15_000;
export const CFBD_MAX_ATTEMPTS = 3;
export const CFBD_RETRY_BASE_MS = 100;

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
    readonly metadata?: CfbdTransportMetadata,
  ) {
    super(message);
    this.name = "CollegeFootballDataError";
  }
}

export type CfbdContentTypeCategory = "json" | "html" | "other" | "missing";
export type CfbdFailureCategory =
  | "http"
  | "gateway_response"
  | "empty_response"
  | "html_response"
  | "content_type_mismatch"
  | "malformed_json"
  | "likely_truncated_json"
  | "invalid_shape"
  | "network"
  | "timeout"
  | "configuration";

/** Deliberately excludes response body, raw headers, URL values, and credentials. */
export interface CfbdTransportMetadata {
  status: number | null;
  contentType: CfbdContentTypeCategory;
  byteLength: number;
  requestStartedAt: Date;
  requestFinishedAt: Date;
  durationMs: number;
  retryCount: number;
  failureCategory: CfbdFailureCategory | null;
}

export interface CollegeFootballDataResponse {
  provider: typeof CFBD_PROVIDER;
  endpoint: CfbdEndpoint;
  requestIdentity: string;
  capturedAt: Date;
  providerObservedAt: Date | null;
  payloadHash: string;
  payload: unknown;
  transport: CfbdTransportMetadata;
}

export interface CollegeFootballDataClientOptions {
  apiKey?: string;
  fetcher?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  /** Injectable solely to make bounded retry jitter deterministic in tests. */
  random?: () => number;
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

export function cfbdRetryDelay(attempt: number, random: () => number = Math.random): number {
  const jitter = 0.5 + Math.max(0, Math.min(1, random()));
  return Math.min(1_000, Math.floor(CFBD_RETRY_BASE_MS * 2 ** attempt * jitter));
}

function contentTypeCategory(contentType: string | null): CfbdContentTypeCategory {
  if (!contentType) return "missing";
  const normalized = contentType.toLowerCase();
  if (normalized.includes("json") || normalized.includes("+json")) return "json";
  if (normalized.includes("html")) return "html";
  return "other";
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function malformedCategory(error: unknown): CfbdFailureCategory {
  if (error instanceof SyntaxError && /unexpected end|unterminated|end of json/i.test(error.message)) {
    return "likely_truncated_json";
  }
  return "malformed_json";
}

/** Server-only CFBD transport. It does not log credentials or interpret data. */
export function createCollegeFootballDataClient(options: CollegeFootballDataClientOptions = {}) {
  const apiKey = options.apiKey ?? process.env["CFBD_API_KEY"];
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? delay;
  const random = options.random ?? Math.random;
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? CFBD_MAX_ATTEMPTS, CFBD_MAX_ATTEMPTS));

  async function request(
    endpoint: CfbdEndpoint,
    query: Record<string, string | number | boolean | undefined> = {},
  ): Promise<CollegeFootballDataResponse> {
    const requestStartedAt = now();
    if (!apiKey) {
      const requestFinishedAt = now();
      throw new CollegeFootballDataError("CFBD is not configured", "CONFIGURATION", endpoint, undefined, {
        status: null, contentType: "missing", byteLength: 0, requestStartedAt, requestFinishedAt,
        durationMs: Math.max(0, requestFinishedAt.getTime() - requestStartedAt.getTime()),
        retryCount: 0, failureCategory: "configuration",
      });
    }
    const requestIdentity = cfbdRequestIdentity(endpoint, query);
    const url = new URL(paths[endpoint], CFBD_BASE_URL);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
    let lastError: CollegeFootballDataError | undefined;
    const metadata = (
      status: number | null,
      contentType: CfbdContentTypeCategory,
      length: number,
      retryCount: number,
      failureCategory: CfbdFailureCategory | null,
    ): CfbdTransportMetadata => {
      const requestFinishedAt = now();
      return {
        status, contentType, byteLength: length, requestStartedAt, requestFinishedAt,
        durationMs: Math.max(0, requestFinishedAt.getTime() - requestStartedAt.getTime()),
        retryCount, failureCategory,
      };
    };
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CFBD_TIMEOUT_MS);
      try {
        const response = await fetcher(url, {
          headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
        const text = await response.text();
        const contentType = contentTypeCategory(response.headers.get("content-type"));
        const responseMetadata = (failureCategory: CfbdFailureCategory | null) =>
          metadata(response.status, contentType, byteLength(text), attempt, failureCategory);
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          const failureCategory = response.status >= 502 && response.status <= 504 ? "gateway_response" : "http";
          lastError = new CollegeFootballDataError(
            `CFBD request failed with HTTP ${response.status}`, "HTTP", endpoint, response.status,
            responseMetadata(failureCategory),
          );
          if (!retryable || attempt === maxAttempts - 1) throw lastError;
        } else {
          let failureCategory: CfbdFailureCategory | null = null;
          if (response.status === 204 || text.trim() === "") failureCategory = "empty_response";
          else if (contentType === "html") failureCategory = "html_response";
          else if (contentType === "other") failureCategory = "content_type_mismatch";
          if (failureCategory) {
            const invalid = new CollegeFootballDataError(
              `CFBD returned ${failureCategory.replaceAll("_", " ")}`, "INVALID_RESPONSE", endpoint,
              response.status, responseMetadata(failureCategory),
            );
            // Empty 200s and HTML pages are transient upstream failures; 204 and declared
            // non-JSON content are deterministic protocol violations.
            if ((failureCategory === "empty_response" && response.status !== 204) || failureCategory === "html_response") {
              lastError = invalid;
              if (attempt === maxAttempts - 1) throw invalid;
            } else throw invalid;
          } else {
          let payload: unknown;
          try { payload = JSON.parse(text); } catch (error) {
            failureCategory = malformedCategory(error);
            const invalid = new CollegeFootballDataError(
              "CFBD returned invalid JSON", "INVALID_RESPONSE", endpoint, response.status,
              responseMetadata(failureCategory),
            );
            lastError = invalid;
            if (attempt === maxAttempts - 1) throw invalid;
          }
          if (payload === undefined) {
            // The parse failure above always throws on the final attempt; this guards TS and
            // keeps the retry path from treating an absent payload as valid.
          } else if (!isValidPayload(payload)) {
            throw new CollegeFootballDataError(
              "CFBD response has an invalid shape", "INVALID_RESPONSE", endpoint, response.status,
              responseMetadata("invalid_shape"),
            );
          } else {
          const observedHeader = response.headers.get("date");
          const observed = observedHeader ? new Date(observedHeader) : null;
          return {
            provider: CFBD_PROVIDER, endpoint, requestIdentity, capturedAt: now(),
            providerObservedAt: observed && Number.isFinite(observed.getTime()) ? observed : null,
            payloadHash: cfbdPayloadHash(payload), payload, transport: responseMetadata(null),
          };
          }
          }
        }
      } catch (error) {
        if (error instanceof CollegeFootballDataError) {
          const retryableInvalid = (error.metadata?.failureCategory === "empty_response"
              && error.metadata.status !== 204)
            || error.metadata?.failureCategory === "html_response"
            || error.metadata?.failureCategory === "malformed_json"
            || error.metadata?.failureCategory === "likely_truncated_json";
          const retryableHttp = error.code === "HTTP"
            && (error.httpStatus === 429 || (error.httpStatus ?? 0) >= 500);
          const retryable = retryableHttp || (error.code === "INVALID_RESPONSE" && retryableInvalid);
          if (!retryable || attempt === maxAttempts - 1) throw error;
          lastError = error;
        } else {
          const timedOut = controller.signal.aborted;
          lastError = new CollegeFootballDataError(
            timedOut ? "CFBD request timed out" : "CFBD request failed",
            timedOut ? "TIMEOUT" : "NETWORK", endpoint, undefined,
            metadata(null, "missing", 0, attempt, timedOut ? "timeout" : "network"),
          );
          if (attempt === maxAttempts - 1) throw lastError;
        }
      } finally { clearTimeout(timer); }
      await sleep(cfbdRetryDelay(attempt, random));
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