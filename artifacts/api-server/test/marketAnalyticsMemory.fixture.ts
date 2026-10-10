import { PgDialect } from "drizzle-orm/pg-core";
import { compactMarketAnalyticsQuery } from "../src/services/marketAnalyticsQuery";
import { type MarketAnalyticsSnapshotRow } from "../src/services/marketAnalyticsHistory";

export const fixtureNow = new Date("2026-10-10T15:20:00Z");

/** SELECT-only integration fixture: CTEs shadow the four source tables.
 * No temporary tables, schema changes, or live data mutations are needed. */
export function marketAnalyticsMemoryFixture() {
  const rows: MarketAnalyticsSnapshotRow[] = [];
  const add = (overrides: Partial<MarketAnalyticsSnapshotRow>) => rows.push({
    gameId: "fixture-game", selection: "home", price: -110,
    capturedAt: new Date("2026-10-10T10:00:00Z"),
    startsAt: new Date("2026-10-10T18:00:00Z"),
    sportsbook: "Pinnacle", sportsbookKey: "pinnacle", isSharp: true,
    source: "odds-api", providerEventId: "current-event",
    marketStatus: "open", isAvailable: true, isStale: false, isActive: true,
    ...overrides,
  });
  const time = (hour: number) => new Date(`2026-10-10T${String(hour).padStart(2, "0")}:00:00Z`);
  // Replaced identity, duplicate observation, conflicting timestamp, opening
  // quote and newest complete pair.
  add({ providerEventId: "old-event", capturedAt: time(8), price: -105 });
  for (const hour of [10, 11, 12, 13, 14]) add({ capturedAt: time(hour), price: -100 - hour });
  add({ capturedAt: time(11), price: -111 });
  add({ capturedAt: time(13), price: -150 });
  for (const hour of [10, 12, 14]) add({
    sportsbook: "FanDuel", sportsbookKey: "fanduel", isSharp: false,
    capturedAt: time(hour), price: 100 + hour,
  });
  // Two replacement IDs at the same newest time must both be withheld.
  for (const providerEventId of ["tie-a", "tie-b"]) add({
    gameId: "tie-game", providerEventId, capturedAt: time(14),
  });
  // An entirely conflicting latest identity cannot revive the older identity.
  add({ gameId: "conflict-game", providerEventId: "previous", capturedAt: time(10) });
  add({ gameId: "conflict-game", capturedAt: time(14), price: -110 });
  add({ gameId: "conflict-game", capturedAt: time(14), price: -120 });
  // Draws and two canonical books sharing a display name remain independent.
  for (const sportsbookKey of ["shared-a", "shared-b"]) {
    for (const hour of [10, 14]) add({
      sportsbook: "Shared name", sportsbookKey, selection: "draw",
      isSharp: sportsbookKey === "shared-a", capturedAt: time(hour), price: 500 + hour,
    });
  }
  // Invalid observations must not manufacture comparisons.
  add({ capturedAt: time(19), price: -160 });
  add({ capturedAt: time(16), price: -160 });
  add({ source: "espn", price: -170 });
  add({ isStale: true, price: -180 });
  add({ isAvailable: false, price: -190 });
  add({ marketStatus: "closed", price: -200 });
  add({ providerEventId: " ", price: -210 });
  add({ price: 90 });
  add({ sportsbookKey: "inactive", isActive: false, price: -220 });
  add({ sportsbookKey: "unclassified", isSharp: null, price: -230 });

  const books = [...new Map(rows.map(r => [r.sportsbookKey!, r])).values()];
  const games = [...new Set(rows.map(r => r.gameId))];
  const text = (value: string | null) => value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`;
  const bool = (value: boolean | null) => value === null ? "NULL::boolean" : String(value);
  const source = `
    WITH games(id, game_date, starts_at) AS (VALUES ${games.map(id =>
      `(${text(id)},'2026-10-10'::date,'2026-10-10T18:00:00Z'::timestamptz)`).join(",")}),
    sportsbooks(id, slug, name, is_sharp, is_active) AS (VALUES ${books.map((r, i) =>
      `(${i + 1},${text(r.sportsbookKey)},${text(r.sportsbook)},${bool(r.isSharp)},${bool(r.isActive)})`).join(",")}),
    markets(id, slug) AS (VALUES (1,'moneyline')),
    odds_snapshots(game_id,sportsbook_id,market_id,selection,provider_event_id,
      captured_at,price,source,is_available,is_stale,market_status) AS (VALUES ${rows.map(r =>
      `(${text(r.gameId)},${books.findIndex(b => b.sportsbookKey === r.sportsbookKey) + 1},1,
        ${text(r.selection)},${text(r.providerEventId)},${text(r.capturedAt.toISOString())}::timestamptz,
        ${r.price},${text(r.source)},${bool(r.isAvailable)},${bool(r.isStale)},${text(r.marketStatus)})`).join(",")})
  `;
  const query = new PgDialect().sqlToQuery(compactMarketAnalyticsQuery("2026-10-10", fixtureNow));
  return { rows, query: { ...query, sql: source + query.sql.replace(/^\s*WITH/, ",") } };
}
