import { describe, expect, it, vi } from "vitest";
import { OddsCreditStore, type CreditPool } from "./oddsCreditStore";

// No real pool, application startup, provider calls, or database connections.
describe("20K plan durable collection cadence", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const interval = 12 * 60 * 60_000;
  function fixture(nextAllowed = now) {
    const query = vi.fn(async (sql: string, _values?: unknown[]) => {
      if (sql.includes("SELECT *,month::text")) return { rows: [{
        month: "2026-11-01", day: "2026-11-01", used: 0, outstanding: 0,
        day_used: 0, provider_used: 0, provider_remaining: 20_000,
      }] };
      if (sql.includes("SELECT * FROM odds_api_collection_state")) {
        return { rows: [{ next_allowed_at: nextAllowed }] };
      }
      return { rows: [] };
    });
    const client = { query, release: vi.fn() };
    const pool: CreditPool = { query, connect: async () => client };
    return { store: new OddsCreditStore(pool), query };
  }
  it("persists 12-hour cooldown at reservation, not just after successful HTTP", async () => {
    const { store, query } = fixture();
    expect((await store.acquire({
      scope: "synthetic", feed: "icehockey_nhl", now,
      usage: { used: 0, remaining: 20_000 }, allowCached: false,
    })).kind).toBe("reserved");
    const update = query.mock.calls.find(([sql]) => sql.includes("SET lease_id=$3"));
    expect(update?.[1]?.[3]).toEqual(new Date(now.getTime() + 120_000));
    expect(update?.[1]?.[4]).toEqual(new Date(now.getTime() + interval));
  });
  it("denies a restarted worker before the durable cooldown expires", async () => {
    const { store } = fixture(new Date(now.getTime() + interval));
    expect(await store.acquire({
      scope: "synthetic", feed: "icehockey_nhl", now,
      usage: { used: 0, remaining: 20_000 }, allowCached: false,
    })).toEqual({ kind: "denied", reason: "COLLECTION_NOT_DUE" });
  });
  it.each([undefined, 0, 60_000])("does not shorten cooldown on failure (%s)", async (failureBackoffMs) => {
    const { store, query } = fixture();
    await store.finish({
      scope: "synthetic", feed: "icehockey_nhl", leaseId: "test",
      month: "2026-11-01", now, failureBackoffMs,
    });
    const update = query.mock.calls.find(([sql]) => sql.includes("SET next_allowed_at=$4"));
    expect(update?.[1]?.[3]).toEqual(new Date(now.getTime() + interval));
  });
});
