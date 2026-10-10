import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  compactMarketAnalyticsQuery,
  createMarketAnalyticsLoader,
  MarketAnalyticsBusyError,
} from "./marketAnalyticsQuery";

const now = new Date("2026-10-10T15:00:00Z");
const quote = {
  gameId: "game-1", sportsbook: "Pinnacle", sportsbookKey: "pinnacle",
  selection: "home", price: -110, capturedAt: "2026-10-10T14:00:00Z",
  startsAt: "2026-10-10T17:00:00Z", isSharp: true, source: "odds-api",
  providerEventId: "event-1", marketStatus: "open", isAvailable: true,
  isStale: false, isActive: true,
};

describe("bounded Analytics database query", () => {
  const query = new PgDialect().sqlToQuery(compactMarketAnalyticsQuery("2026-10-10", now));

  it("compacts first/latest-two in PostgreSQL instead of imposing a global tail", () => {
    expect(query.sql).toContain("p.first_rank = 1 OR p.recent_rank <= 2");
    expect(query.sql).toContain("PARTITION BY game_id, sportsbook_key, selection");
    expect(query.sql).not.toMatch(/\bLIMIT\b/i);
    expect(query.params).toEqual(["2026-10-10", now]);
  });

  it("retains the source, active-book, price, and strict pregame gates", () => {
    for (const gate of [
      "o.source = 'odds-api'", "o.captured_at < g.starts_at",
      "o.is_available = true", "o.is_stale = false", "b.is_active = true",
      "o.market_status = 'open'", "b.is_sharp IS NOT NULL",
      "o.price BETWEEN 100 AND 2000", "o.price BETWEEN -2000 AND -100",
    ]) expect(query.sql).toContain(gate);
  });

  it("fails closed on tied provider identities and conflicting timestamps", () => {
    expect(query.sql).toContain("w.winner_count = 1");
    expect(query.sql).toContain("HAVING count(DISTINCT e.price) = 1");
    // Match the millisecond precision of the existing node-postgres decoder.
    expect(query.sql).toContain("date_trunc('milliseconds', o.captured_at) AS captured_at");
    expect(query.sql.indexOf("identity_latest AS")).toBeLessThan(query.sql.indexOf("observation_times AS"));
  });

  it("keeps canonical display-name collision protection", () => {
    expect(query.sql).toContain("count(DISTINCT sportsbook_key)");
    expect(query.sql).toContain("b.name || ' (' || b.slug || ')'");
  });
});

describe("bounded, uncached Analytics loading", () => {
  it("normalizes driver timestamps and preserves the existing response contract", async () => {
    const load = createMarketAnalyticsLoader(vi.fn().mockResolvedValue({ rows: [
      quote, { ...quote, price: -120, capturedAt: "2026-10-10T14:30:00Z" },
    ] }));
    expect((await load("2026-10-10", now)).get("game-1")).toEqual({
      marketHistory: [],
      sharpMoneyHistory: [
        { sportsbook: "Pinnacle", selection: "home", price: -110, capturedAt: "2026-10-10T14:00:00.000Z" },
        { sportsbook: "Pinnacle", selection: "home", price: -120, capturedAt: "2026-10-10T14:30:00.000Z" },
      ],
    });
  });

  it("shares only overlapping requests and refetches after completion", async () => {
    let release!: (value: { rows: typeof quote[] }) => void;
    const execute = vi.fn().mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const load = createMarketAnalyticsLoader(execute);
    const first = load("2026-10-10", now);
    const second = load("2026-10-10", now);
    expect(second).toBe(first);
    await Promise.resolve();
    release({ rows: [quote] });
    await first;
    execute.mockResolvedValue({ rows: [] });
    await load("2026-10-10", now);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("evicts failed work without fabricating empty histories", async () => {
    const execute = vi.fn().mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ rows: [quote] });
    const load = createMarketAnalyticsLoader(execute);
    await expect(load("2026-10-10", now)).rejects.toThrow("database unavailable");
    expect((await load("2026-10-10", now)).has("game-1")).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("bounds distinct-date scans, permits same-date sharing, and releases slots", async () => {
    let release!: (value: { rows: typeof quote[] }) => void;
    const execute = vi.fn().mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const load = createMarketAnalyticsLoader(execute, 1);
    const pending = load("2026-10-10", now);
    expect(load("2026-10-10", now)).toBe(pending);
    await expect(load("2026-10-11", now)).rejects.toBeInstanceOf(MarketAnalyticsBusyError);
    await Promise.resolve();
    release({ rows: [] });
    await pending;
    execute.mockResolvedValue({ rows: [] });
    await expect(load("2026-10-11", now)).resolves.toEqual(new Map());
  });

  it("does not turn singleton or absent sharp quotes into movement", async () => {
    const load = createMarketAnalyticsLoader(vi.fn().mockResolvedValue({ rows: [
      { ...quote, sportsbook: "FanDuel", sportsbookKey: "fanduel", isSharp: false },
    ] }));
    const result = (await load("2026-10-10", now)).get("game-1")!;
    expect(result.marketHistory).toHaveLength(1);
    expect(result.sharpMoneyHistory).toEqual([]);
  });
});
