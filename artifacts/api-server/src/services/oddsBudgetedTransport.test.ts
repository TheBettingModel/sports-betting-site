import { describe, expect, it, vi } from "vitest";
import { createBudgetedOddsTransport } from "./oddsBudgetedTransport";
import { readFileSync } from "node:fs";

const now = new Date("2026-11-01T12:00:00Z");
const usageHeaders = (used = 0, cost = 0) => ({
  "x-requests-used": String(used), "x-requests-remaining": String(100_000 - used),
  "x-requests-last": String(cost),
});
const event = { id: "synthetic-event", commence_time: "2026-11-01T14:00:00Z" };

function setup() {
  const store = {
    read: vi.fn().mockResolvedValue(null),
    acquire: vi.fn().mockResolvedValue({ kind: "reserved", leaseId: "local-lease", month: "2026-11-01" }),
    finish: vi.fn().mockResolvedValue(undefined),
  };
  const network = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("[]", { headers: usageHeaders() }))
    .mockResolvedValueOnce(new Response(JSON.stringify([event]), { headers: usageHeaders(6, 6) }));
  const clock = vi.fn(() => new Date(now));
  const enabled = vi.fn(() => true);
  const request = createBudgetedOddsTransport({
    store: async () => store, fetch: network, now: clock, collectorEnabled: enabled,
  });
  return { store, network, clock, enabled, request };
}
const options = { apiKey: "offline-synthetic-key-not-a-credential", feed: "basketball_nba" };

describe("shared budgeted Odds API transport (no real HTTP or DB)", () => {
  it("checks usage for free, reserves before paying, then persists the original receipt", async () => {
    const { request, network, store } = setup();
    expect(await request(options)).toEqual({ events: [event], fetchedAt: now });
    expect(network).toHaveBeenCalledTimes(2);
    expect(new URL(String(network.mock.calls[0]![0])).pathname).toBe("/v4/sports/");
    const url = new URL(String(network.mock.calls[1]![0]));
    expect(url.searchParams.get("markets")).toBe("h2h,spreads,totals");
    expect(url.searchParams.get("regions")).toBe("us,eu");
    expect(store.acquire.mock.invocationCallOrder[0]).toBeLessThan(network.mock.invocationCallOrder[1]!);
    expect(store.finish).toHaveBeenCalledWith(expect.objectContaining({
      events: [event], actualCost: 6, month: "2026-11-01",
    }));
    const scope = store.acquire.mock.calls[0]![0].scope;
    expect(scope).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(store.acquire.mock.calls)).not.toContain(options.apiKey);
  });
  it("never makes paid or free HTTP requests from a read-only API", async () => {
    const { request, enabled, network, store } = setup();
    enabled.mockReturnValue(false);
    const receipt = { events: [event], fetchedAt: new Date(now.getTime() - 60_000) };
    store.read.mockResolvedValue(receipt);
    expect(await request(options)).toEqual(receipt);
    expect(network).not.toHaveBeenCalled();
    expect(store.acquire).not.toHaveBeenCalled();
    expect(store.finish).not.toHaveBeenCalled();
    store.read.mockResolvedValue(null);
    await expect(request(options)).rejects.toThrow("COLLECTOR_DISABLED_OR_NO_FRESH_CACHE");
    expect(network).not.toHaveBeenCalled();
  });
  it("returns a cross-process cache without inventing a new receipt timestamp", async () => {
    const { request, network, store } = setup();
    const receipt = { events: [event], fetchedAt: new Date(now.getTime() - 20 * 60_000) };
    store.acquire.mockResolvedValue({ kind: "cached", cache: receipt });
    expect(await request(options)).toEqual(receipt);
    expect(network).toHaveBeenCalledTimes(1); // free check only
    expect(store.finish).not.toHaveBeenCalled();
  });
  it.each(["MONTHLY_LIMIT", "DAILY_LIMIT", "DAILY_PACING", "COLLECTION_IN_FLIGHT", "COLLECTION_NOT_DUE"])(
    "does not spend on a %s deferral", async (reason) => {
      const { request, network, store } = setup();
      store.acquire.mockResolvedValue({ kind: "denied", reason });
      await expect(request(options)).rejects.toThrow(reason);
      expect(network).toHaveBeenCalledTimes(1);
      expect(store.finish).not.toHaveBeenCalled();
    },
  );
  it("refuses spending when usage headers are unavailable and caches failed probes", async () => {
    const { request, network, store } = setup();
    network.mockReset().mockResolvedValue(new Response("[]"));
    await expect(request(options)).rejects.toThrow("usage headers");
    await expect(request(options)).rejects.toThrow("usage headers");
    expect(network).toHaveBeenCalledTimes(1);
    expect(store.acquire).not.toHaveBeenCalled();
  });
  it("fails closed if the usage probe fails", async () => {
    const { request, network, store } = setup();
    network.mockReset().mockResolvedValue(new Response("", { status: 401 }));
    await expect(request(options)).rejects.toThrow("USAGE_CHECK_HTTP_401");
    expect(store.acquire).not.toHaveBeenCalled();
  });
  it("does not call the provider when the shared store is unavailable", async () => {
    const network = vi.fn();
    const request = createBudgetedOddsTransport({
      store: async () => { throw new Error("synthetic database unavailable"); }, fetch: network,
    });
    await expect(request(options)).rejects.toThrow("database unavailable");
    expect(network).not.toHaveBeenCalled();
  });
  it("retains a full reservation and sanitizes network errors containing URLs", async () => {
    const { request, network, store } = setup();
    network.mockReset().mockResolvedValueOnce(new Response("[]", { headers: usageHeaders() }))
      .mockRejectedValueOnce(new Error(`network failure https://example.invalid?apiKey=${options.apiKey}`));
    await expect(request(options)).rejects.toThrow("COLLECTION_FAILED");
    expect(store.finish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      leaseId: "local-lease", month: "2026-11-01",
    }));
    expect(store.finish.mock.calls[0]![0]).not.toHaveProperty("events");
    expect(network).toHaveBeenCalledTimes(2); // no hidden retry
  });
  it.each([401, 429, 503])("records HTTP %s without logging a raw response body", async (status) => {
    const { request, network, store } = setup();
    network.mockReset().mockResolvedValueOnce(new Response("[]", { headers: usageHeaders() }))
      .mockResolvedValueOnce(new Response(options.apiKey, { status, headers: usageHeaders(6, 6) }));
    await expect(request(options)).rejects.toThrow(`PROVIDER_HTTP_${status}`);
    expect(store.finish).toHaveBeenCalledOnce();
    expect(JSON.stringify(store.finish.mock.calls)).not.toContain(options.apiKey);
    expect(store.finish.mock.calls[0]![0].failureBackoffMs).toBe(43_200_000);
  });
  it("accounts for an unexpected higher price and does not publish its payload", async () => {
    const { request, network, store } = setup();
    network.mockReset().mockResolvedValueOnce(new Response("[]", { headers: usageHeaders() }))
      .mockResolvedValueOnce(new Response("[]", { headers: usageHeaders(12, 12) }));
    await expect(request(options)).rejects.toThrow("PROVIDER_PRICING_CHANGED");
    expect(store.finish.mock.calls[0]![0]).toMatchObject({ actualCost: 12 });
    expect(store.finish.mock.calls[0]![0]).not.toHaveProperty("events");
  });
  it("does not accept malformed provider payloads", async () => {
    const { request, network, store } = setup();
    network.mockReset().mockResolvedValueOnce(new Response("[]", { headers: usageHeaders() }))
      .mockResolvedValueOnce(new Response("{}", { headers: usageHeaders(6, 6) }));
    await expect(request(options)).rejects.toThrow("INVALID_PROVIDER_PAYLOAD");
    expect(store.finish.mock.calls[0]![0]).not.toHaveProperty("events");
  });
  it("does not retry a paid request when completion persistence fails", async () => {
    const { request, network, store } = setup();
    store.finish.mockRejectedValue(new Error("synthetic transaction failure"));
    await expect(request(options)).rejects.toThrow("COLLECTION_FAILED");
    expect(store.finish).toHaveBeenCalledOnce();
    expect(network).toHaveBeenCalledTimes(2);
  });
  it("forces a new free usage probe at the monthly boundary", async () => {
    const { request, clock, network, store } = setup();
    clock.mockReturnValue(new Date("2026-11-30T23:58:00Z"));
    store.acquire.mockResolvedValue({ kind: "denied", reason: "MONTHLY_LIMIT" });
    network.mockReset().mockImplementation(async () => new Response("[]", { headers: usageHeaders() }));
    await expect(request(options)).rejects.toThrow();
    clock.mockReturnValue(new Date("2026-12-01T00:01:00Z"));
    await expect(request(options)).rejects.toThrow();
    expect(network).toHaveBeenCalledTimes(2);
  });
  it("forbids cached raw ledger captures, missing keys and arbitrary provider URLs", async () => {
    const { request, store, network } = setup();
    await request({ ...options, allowCached: false });
    expect(store.acquire.mock.calls[0]![0].allowCached).toBe(false);
    await expect(request({ ...options, apiKey: "" })).rejects.toThrow("API_KEY_MISSING");
    await expect(request({ ...options, feed: "../evil" })).rejects.toThrow("INVALID_FEED");
    expect(network).toHaveBeenCalledTimes(2);
  });
  it("routes both paid ingress paths through the guard, leaving the catalog free", () => {
    const source = readFileSync(new URL("./oddsApi.ts", import.meta.url), "utf8");
    expect(source.match(/await fetchBudgetedOdds\(/g)).toHaveLength(2);
    expect(source).not.toContain("markets=h2h,spreads,totals");
    expect(source).toContain("allowCached: false");
    expect(source).toContain("cache.set(oddsApiKey, normalised)");
  });
});
