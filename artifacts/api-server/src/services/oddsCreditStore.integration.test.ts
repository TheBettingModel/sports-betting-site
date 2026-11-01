import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OddsCreditStore, type CreditPool, type CreditAdmission } from "./oddsCreditStore";

const connectionString = process.env.ODDS_BUDGET_TEST_DATABASE_URL;
// Never fall back to DATABASE_URL or any existing environment database.
describe.skipIf(!connectionString)("Odds credit transactions on disposable PostgreSQL only", () => {
  const require = createRequire(new URL("../../../../lib/db/package.json", import.meta.url));
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString, max: 12, application_name: "offline_odds_budget_test" }) as
    CreditPool & { end: () => Promise<void> };
  const store = new OddsCreditStore(pool);
  const now = new Date("2026-11-01T12:00:00Z");
  const usage = { used: 0, remaining: 20_000 };
  const scope = "synthetic-test-key-fingerprint";
  const args = (feed = "basketball_nba", time = now) => ({
    scope, feed, now: time, usage, allowCached: true,
  });
  function reserved(result: CreditAdmission) {
    expect(result.kind).toBe("reserved");
    if (result.kind !== "reserved") throw new Error("Expected an isolated reservation");
    return result;
  }
  const counters = async () => (await pool.query(
    "SELECT *,month::text AS month,day::text AS day FROM odds_api_credit_state WHERE scope=$1", [scope],
  )).rows[0]!;
  beforeAll(async () => {
    const parsed = new URL(connectionString!);
    if (parsed.username !== "budget_test" || parsed.pathname !== "/budget_test"
      || !parsed.searchParams.get("host")?.startsWith("/tmp/tbm-odds-budget-")) {
      throw new Error("Unsafe integration test target");
    }
    const { rows } = await pool.query("SELECT current_database() AS db,current_user AS role,inet_server_addr() AS addr");
    expect(rows[0]).toMatchObject({ db: "budget_test", role: "budget_test", addr: null });
    const migration = readFileSync(new URL(
      "../../../../lib/db/migrations/20261027_odds_credit_budget.sql", import.meta.url,
    ), "utf8");
    await pool.query(migration);
    await pool.query(migration); // explicitly idempotent
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE odds_api_collection_state,odds_api_credit_state");
  });
  afterAll(async () => { await pool.end(); });

  it("allows one paid request for concurrent same-feed callers", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => store.acquire(args())));
    expect(results.filter((r) => r.kind === "reserved")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "denied")).toHaveLength(19);
    expect(await counters()).toMatchObject({ used: 6, outstanding: 6, day_used: 6 });
  });
  it("enforces a shared cap across different feeds and independent pool instances", async () => {
    reserved(await store.acquire(args()));
    await pool.query("UPDATE odds_api_credit_state SET used=15988,provider_used=15988");
    const other = new OddsCreditStore(pool);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      (i % 2 ? other : store).acquire({ ...args(`feed_${i}`), usage: { used: 15988, remaining: 4012 } })));
    // Outstanding six credits from the first request are counted conservatively.
    expect(results.filter((r) => r.kind === "reserved")).toHaveLength(1);
    expect(Number((await counters()).used)).toBe(16_000);
  });
  it("cannot evade a daily ceiling by using another feed", async () => {
    reserved(await store.acquire(args()));
    await pool.query("UPDATE odds_api_credit_state SET day_used=498");
    expect(await store.acquire(args("icehockey_nhl"))).toEqual({ kind: "denied", reason: "DAILY_LIMIT" });
    expect((await counters()).day_used).toBe(498);
  });
  it("does not refund or immediately duplicate a request after a simulated crash", async () => {
    reserved(await store.acquire(args()));
    expect(await store.acquire(args())).toEqual({ kind: "denied", reason: "COLLECTION_IN_FLIGHT" });
    const later = new Date(now.getTime() + 121_000);
    expect(await new OddsCreditStore(pool).acquire(args("basketball_nba", later)))
      .toEqual({ kind: "denied", reason: "COLLECTION_NOT_DUE" });
    reserved(await store.acquire(args("basketball_nba", new Date(now.getTime() + 12 * 60 * 60_000))));
    expect(await counters()).toMatchObject({ used: 12, outstanding: 12, day_used: 6 });
  });
  it("shares fresh receipts across processes without near-start acceleration", async () => {
    const reservation = reserved(await store.acquire(args()));
    const events = [{ id: "synthetic-event", commence_time: "2026-11-01T14:00:00Z" }];
    await store.finish({ ...args(), ...reservation, events, usage: { used: 6, remaining: 99994 } });
    expect(await counters()).toMatchObject({ used: 6, outstanding: 0, day_used: 6 });
    const later = new Date(now.getTime() + 14 * 60_000);
    expect(await new OddsCreditStore(pool).acquire(args("basketball_nba", later)))
      .toEqual({ kind: "cached", cache: { events, fetchedAt: now } });
    expect(await store.read(scope, "basketball_nba", later)).toEqual({ events, fetchedAt: now });
    expect(await store.acquire(args("basketball_nba", new Date(now.getTime() + 31 * 60_000))))
      .toEqual({ kind: "denied", reason: "COLLECTION_NOT_DUE" });
    reserved(await store.acquire(args("basketball_nba", new Date(now.getTime() + 12 * 60 * 60_000))));
  });
  it("does not expose hour-old odds as actionable or retimestamp old raw evidence", async () => {
    const reservation = reserved(await store.acquire(args()));
    const events = [{ id: "distant-event", commence_time: "2026-11-02T14:00:00Z" }];
    await store.finish({ ...args(), ...reservation, events });
    const later = new Date(now.getTime() + 31 * 60_000);
    expect(await store.read(scope, "basketball_nba", later)).toBeNull();
    expect(await store.acquire(args("basketball_nba", later)))
      .toEqual({ kind: "denied", reason: "COLLECTION_NOT_DUE" });
    expect(await store.acquire({ ...args("basketball_nba", new Date(now.getTime() + 60_000)), allowCached: false }))
      .toEqual({ kind: "denied", reason: "COLLECTION_NOT_DUE" });
    reserved(await store.acquire(args("basketball_nba", new Date(now.getTime() + 12 * 60 * 60_000))));
  });
  it("preserves fresh cached data but never pays when the provider is depleted", async () => {
    expect(await store.acquire({ ...args(), usage: { used: 100000, remaining: 0 } }))
      .toEqual({ kind: "denied", reason: "MONTHLY_LIMIT" });
    expect(await counters()).toMatchObject({ used: 100000, day_used: 0, outstanding: 0 });
  });
  it("resets only daily counters on a UTC day boundary", async () => {
    const reservation = reserved(await store.acquire(args()));
    await store.finish({ ...args(), ...reservation, events: [] });
    await pool.query("UPDATE odds_api_credit_state SET day_used=2496");
    reserved(await store.acquire(args("icehockey_nhl", new Date("2026-11-02T00:00:00Z"))));
    expect(await counters()).toMatchObject({ used: 12, day_used: 6, day: "2026-11-02" });
  });
  it("resets monthly accounting only in the next calendar month", async () => {
    reserved(await store.acquire(args()));
    await pool.query("UPDATE odds_api_credit_state SET used=100000,outstanding=6,day_used=2496");
    reserved(await store.acquire(args("icehockey_nhl", new Date("2026-12-01T00:00:00Z"))));
    expect(await counters()).toMatchObject({
      used: 6, outstanding: 6, day_used: 6, month: "2026-12-01", day: "2026-12-01",
    });
  });
  it("does not let an old completion release a newer lease or new-month reservation", async () => {
    const old = reserved(await store.acquire(args()));
    const december = new Date("2026-12-01T00:00:00Z");
    const current = reserved(await store.acquire(args("basketball_nba", december)));
    expect(current.leaseId).not.toBe(old.leaseId);
    await store.finish({ ...args(), ...old, now: december, events: [{ id: "old" }] });
    expect(await counters()).toMatchObject({ used: 6, outstanding: 6 });
    const { rows } = await pool.query("SELECT lease_id,payload FROM odds_api_collection_state");
    expect(rows[0]).toMatchObject({ lease_id: current.leaseId, payload: null });
  });
  it("counts provider-reported external usage", async () => {
    const reservation = reserved(await store.acquire(args()));
    await store.finish({
      ...args(), ...reservation, usage: { used: 1000, remaining: 99000 }, actualCost: 6,
    });
    expect(await counters()).toMatchObject({ used: 1000, day_used: 6, provider_used: 1000 });
    reserved(await store.acquire({ ...args("icehockey_nhl"), usage: { used: 1000, remaining: 99000 } }));
    expect((await counters()).used).toBe(1006);
  });
  it("halts all feeds after an unexpected pricing increase, including across resets", async () => {
    const reservation = reserved(await store.acquire(args()));
    await store.finish({
      ...args(), ...reservation, actualCost: 12, usage: { used: 12, remaining: 99988 },
    });
    expect(await counters()).toMatchObject({ used: 12, day_used: 12, pricing_fault: true });
    expect(await store.acquire(args("icehockey_nhl")))
      .toEqual({ kind: "denied", reason: "PROVIDER_PRICING_CHANGED" });
    expect(await store.acquire(args("icehockey_nhl", new Date("2026-12-01T00:00:00Z"))))
      .toEqual({ kind: "denied", reason: "PROVIDER_PRICING_CHANGED" });
  });
  it("rolls back a transaction failure without making a phantom reservation", async () => {
    await expect(store.acquire({ ...args(), feed: null as unknown as string })).rejects.toThrow();
    expect((await pool.query("SELECT * FROM odds_api_credit_state")).rows).toHaveLength(0);
  });
  it("read-only cache misses do not write any state", async () => {
    expect(await store.read(scope, "missing", now)).toBeNull();
    expect((await pool.query("SELECT * FROM odds_api_credit_state")).rows).toHaveLength(0);
  });
});
