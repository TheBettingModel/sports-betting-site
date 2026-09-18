import { isValidMarketPoint } from "./oddsApi";

const ESPN_NCAAF_SUMMARY_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary";
const CACHE_TTL_MS = 15 * 60 * 1000;

export type EspnNcaafPregameMarket = Readonly<{
  homeSpread: number;
  total: number;
  provider: string;
}>;

type CacheEntry = Readonly<{
  market: EspnNcaafPregameMarket | null;
  fetchedAt: number;
}>;

const cache = new Map<string, CacheEntry>();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

export function parseEspnNcaafPregameMarket(
  payload: unknown,
  expectedHomeTeamId?: string | null,
  expectedAwayTeamId?: string | null,
): EspnNcaafPregameMarket | null {
  const root = asRecord(payload);
  const pickcenter = Array.isArray(root?.["pickcenter"]) ? root["pickcenter"] : [];
  for (const candidate of pickcenter) {
    const row = asRecord(candidate);
    if (!row) continue;
    const homeOdds = asRecord(row["homeTeamOdds"]);
    const awayOdds = asRecord(row["awayTeamOdds"]);
    const homeTeamId = typeof homeOdds?.["teamId"] === "string" ? homeOdds["teamId"] : null;
    const awayTeamId = typeof awayOdds?.["teamId"] === "string" ? awayOdds["teamId"] : null;
    if ((expectedHomeTeamId && homeTeamId !== expectedHomeTeamId)
      || (expectedAwayTeamId && awayTeamId !== expectedAwayTeamId)) continue;

    const homeSpread = typeof row["spread"] === "number" ? row["spread"] : null;
    const total = typeof row["overUnder"] === "number" ? row["overUnder"] : null;
    if (!isValidMarketPoint(homeSpread, "spread") || !isValidMarketPoint(total, "total")) continue;
    const provider = asRecord(row["provider"]);
    return {
      homeSpread,
      total,
      provider: typeof provider?.["name"] === "string" ? provider["name"] : "ESPN",
    };
  }
  return null;
}

export async function fetchEspnNcaafPregameMarket(input: Readonly<{
  eventId: string;
  eventStart: string;
  now: Date;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
}>): Promise<EspnNcaafPregameMarket | null> {
  if (input.now >= new Date(input.eventStart)) return null;
  const cached = cache.get(input.eventId);
  if (cached && input.now.getTime() - cached.fetchedAt < CACHE_TTL_MS) return cached.market;

  try {
    const url = new URL(ESPN_NCAAF_SUMMARY_URL);
    url.searchParams.set("event", input.eventId.replace(/^NCAAF-/, ""));
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const market = parseEspnNcaafPregameMarket(
      await response.json(),
      input.homeTeamId,
      input.awayTeamId,
    );
    cache.set(input.eventId, { market, fetchedAt: input.now.getTime() });
    return market;
  } catch {
    return null;
  }
}