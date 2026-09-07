import { describe, expect, it } from "vitest";
import {
  CFBD_HISTORICAL_MAX_ENDPOINT_FAMILIES_PER_BATCH, CFBD_HISTORICAL_MAX_REQUESTS_PER_BATCH,
  cfbdHistoricalRequestPlan, estimateCfbdHistoricalRequestVolume, ingestCfbdHistoricalBatch,
  nextCfbdHistoricalBatch, type CfbdHistoricalCachedResponse,
} from "./ncaafCfbdHistoricalIngestion";
import { CFBD_PROVIDER, cfbdPayloadHash, cfbdRequestIdentity, type CfbdEndpoint } from "./collegeFootballData";

describe("CFBD historical ingestion orchestrator", () => {
  it("makes the atomic core exactly three bulk games requests, not weekly or current reference requests", () => {
    const plan = cfbdHistoricalRequestPlan();
    expect(plan).toEqual([2023, 2024, 2025].map((year) => expect.objectContaining({ endpoint: "games", query: { year } })));
    expect(estimateCfbdHistoricalRequestVolume()).toMatchObject({ phase: "core_games", totalRequests: 3 });
    expect(cfbdHistoricalRequestPlan("optional_plays")).toHaveLength(48);
    expect(cfbdHistoricalRequestPlan("aggregate_secondary").some(({ endpoint }) => ["teams", "conferences", "venues"].includes(endpoint))).toBe(false);
  });
  it("has bounded batches and a deterministic phase-aware resume cursor", () => {
    const first = nextCfbdHistoricalBatch({ phase: "optional_plays" });
    expect(first.requests.length).toBe(16);
    expect(first.endpointFamilies.length).toBeLessThanOrEqual(CFBD_HISTORICAL_MAX_ENDPOINT_FAMILIES_PER_BATCH);
    expect(first.requests.length).toBeLessThanOrEqual(CFBD_HISTORICAL_MAX_REQUESTS_PER_BATCH);
    const resumed = nextCfbdHistoricalBatch({ cursor: first.nextCursor });
    expect(resumed.requests[0]).toMatchObject({ season: 2024, endpoint: "plays", query: { year: 2024, week: 1 } });
  });
  it("uses immutable cached responses so repeated core capture makes no network call", async () => {
    const records = new Map<string, CfbdHistoricalCachedResponse>(); let calls = 0;
    const cache = { find: async (key: string) => records.get(key) ?? null, append: async (entry: CfbdHistoricalCachedResponse) => {
      const prior = records.get(entry.requestIdentity); if (prior && prior.payloadHash !== entry.payloadHash) throw new Error("immutable cache conflict"); records.set(entry.requestIdentity, entry);
    } };
    const request = async (endpoint: CfbdEndpoint, query: Record<string, number>) => {
      calls++; const payload = [{ id: query.year, homeId: 1, awayId: 2 }]; const now = new Date("2026-01-01T00:00:00Z");
      return { provider: CFBD_PROVIDER, endpoint, requestIdentity: cfbdRequestIdentity(endpoint, query), payload, payloadHash: cfbdPayloadHash(payload), capturedAt: now, providerObservedAt: null,
        transport: { status: 200, contentType: "json" as const, byteLength: 1, requestStartedAt: now, requestFinishedAt: now, durationMs: 0, retryCount: 0, failureCategory: null } };
    };
    const first = await ingestCfbdHistoricalBatch({ cache, request });
    const second = await ingestCfbdHistoricalBatch({ cache, request });
    expect(calls).toBe(3); expect(first.requested).toBe(3); expect(second.cacheHits).toBe(3);
  });
});