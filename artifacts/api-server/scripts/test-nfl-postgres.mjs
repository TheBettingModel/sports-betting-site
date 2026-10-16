/**
 * Explicit opt-in integration runner. Credentials arrive on stdin only.
 * No ambient DATABASE_URL, application startup, provider HTTP, jobs or migrations.
 * Creates/drops only two synthetic-test tables in the attested empty disposable DB.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import http from "node:http";
import https from "node:https";

const api = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireDb = createRequire(resolve(api, "../../lib/db/package.json"));
const { Pool } = requireDb("pg");
const { build } = createRequire(import.meta.url)("esbuild");
const config = JSON.parse(await new Promise((done, fail) => {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => { input += chunk; if (input.length > 16_384) fail(Error("Oversize configuration")); });
  process.stdin.on("end", () => done(input));
  process.stdin.on("error", fail);
}));
assert(!process.env.DATABASE_URL, "Ambient application database credentials are forbidden");
const target = new URL(config.uri);
const normalizedHost = host => host.replace("-pooler.", ".");
assert.equal(target.hostname, config.host);
assert.equal(decodeURIComponent(target.pathname.slice(1)), config.database);
assert.equal(decodeURIComponent(target.username), config.role);
assert.equal(config.database, "nfl_integrity_restricted_test");
assert.match(config.role, /^nfl_integrity_runner_\d+$/);
assert.match(config.branch, /^br-/);
assert.notEqual(config.branch, "br-blue-frost-aqu7381i");
assert(target.password, "Restricted test credentials must be initialized");
assert(config.productionHosts?.length, "An explicit production denylist is required");
for (const host of config.productionHosts) assert.notEqual(normalizedHost(target.hostname), normalizedHost(host));
const denyHttp = () => { throw Error("Provider/application HTTP is forbidden during NFL DB tests"); };
globalThis.fetch = denyHttp;
http.get = http.request = https.get = https.request = denyHttp;

const quote = value => {
  assert.match(value, /^[a-zA-Z_][a-zA-Z_0-9]*$/);
  return '"' + value + '"';
};
const pool = new Pool({
  connectionString: config.uri, max: 6, connectionTimeoutMillis: 20_000,
  application_name: "nfl-isolated-integration", query_timeout: 30_000,
});
let temp, created = false, completed = 0;
const check = async (name, run) => {
  await run();
  completed++;
  console.log(`PASS ${name}`);
};
try {
  // All checks precede the first DDL or data write.
  const identity = (await pool.query(`
    SELECT current_database() AS database, current_user AS role,
      rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit,
      (SELECT count(*)::int FROM pg_auth_members WHERE member=pg_roles.oid) AS memberships,
      has_database_privilege(oid,'neondb','CONNECT') AS source_database_connect,
      (SELECT count(*)::int FROM pg_extension WHERE extname IN ('pg_cron','pgagent')) AS job_extensions
    FROM pg_roles WHERE rolname=current_user
  `)).rows[0];
  assert.equal(identity.database, config.database);
  assert.equal(identity.role, config.role);
  for (const flag of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls", "rolinherit", "source_database_connect"]) {
    assert.equal(identity[flag], false, `Unsafe role flag: ${flag}`);
  }
  assert.equal(identity.memberships, 0);
  assert.equal(identity.job_extensions, 0);
  const clients = (await pool.query(`
    SELECT usename, application_name FROM pg_stat_activity
    WHERE datname=current_database() AND backend_type='client backend'
  `)).rows;
  assert(clients.every(c => c.usename === config.role && c.application_name === "nfl-isolated-integration"),
    "Unexpected automatic writer connected to test database");
  // Neon transaction-pooler endpoints reject startup search_path options.
  // Use the dedicated empty DB's public schema, just as the deployed writer does.
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT current_schema() AS s")).rows[0].s, "public");
  created = true;
  globalThis[Symbol.for("nfl.approved.postgres.test")] = pool;
  await mkdir(join(api, "tmp"), { recursive: true });
  temp = await mkdtemp(join(api, "tmp/nfl-postgres-"));
  const bundle = join(temp, "adapter.mjs");
  await build({
    stdin: {
      resolveDir: api, loader: "ts",
      contents: `
        export { persistNflFetchedFinal } from "./src/services/nflFinalPersistence";
        export { captureNflFinalEvent } from "./src/services/nflFinalIngestion";
        export { classifyNflStoredHistory } from "./src/services/nflHistoricalSeasonPolicy";
        export { finalEvent } from "./test/nfl-offline/result-fixtures";
        export { db, gamesTable, gameResultsTable } from "@workspace/db";
        export { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
        export { eq, ne } from "drizzle-orm";
      `,
    },
    outfile: bundle, bundle: true, packages: "external", format: "esm", platform: "node",
    plugins: [{
      name: "approved-db-only",
      setup(b) {
        b.onResolve({ filter: /^drizzle-zod$/ }, args => ({
          path: requireDb.resolve(args.path), external: true,
        }));
        b.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "approved-db", namespace: "nfl-test" }));
        b.onLoad({ filter: /.*/, namespace: "nfl-test" }, () => ({
          resolveDir: api, loader: "ts", contents: `
            import {drizzle} from "drizzle-orm/node-postgres";
            export {gamesTable} from ${JSON.stringify(resolve(api, "../../lib/db/src/schema/games.ts"))};
            export {gameResultsTable} from ${JSON.stringify(resolve(api, "../../lib/db/src/schema/game-results.ts"))};
            export const db=drizzle(globalThis[Symbol.for("nfl.approved.postgres.test")]);
          `,
        }));
        b.onResolve({ filter: /\/(?:app|index|scheduler|grading-runner|pipeline-once)\.ts$/ }, args => {
          if (args.path.includes("/src/")) throw Error("Application/worker startup import forbidden");
          return undefined;
        });
      },
    }],
  });
  const m = await import(bundle);
  const dialect = new m.PgDialect();
  const literal = value => {
    if (value?.queryChunks) {
      const query = dialect.sqlToQuery(value);
      assert.equal(query.params.length, 0, "Unexpected bound schema default");
      return query.sql;
    }
    if (typeof value === "number") { assert(Number.isFinite(value)); return String(value); }
    if (typeof value === "boolean") return String(value);
    return "'" + (typeof value === "string" ? value : JSON.stringify(value)).replaceAll("'", "''") + "'";
  };
  // Mirror actual Drizzle columns/defaults/PKs and the relevant unique/FK
  // constraints. No full application schema push or other-sport tables.
  for (const table of [m.gamesTable, m.gameResultsTable]) {
    const t = m.getTableConfig(table);
    const columns = t.columns.map(c => `${quote(c.name)} ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}${c.notNull ? " NOT NULL" : ""}${c.default === undefined ? "" : " DEFAULT " + literal(c.default)}`);
    await pool.query(`CREATE TABLE ${quote(t.name)} (${columns.join(",")})`);
    for (const index of t.indexes.filter(i => i.config.unique)) {
      await pool.query(`CREATE UNIQUE INDEX ${quote(index.config.name)} ON ${quote(t.name)} (${index.config.columns.map(c => quote(c.name)).join(",")})`);
    }
    for (const fk of t.foreignKeys) {
      const ref = fk.reference(), other = m.getTableConfig(ref.foreignTable);
      assert.equal(other.name, "games", "Unexpected external schema dependency");
      await pool.query(`ALTER TABLE ${quote(t.name)} ADD FOREIGN KEY (${ref.columns.map(c => quote(c.name)).join(",")}) REFERENCES ${quote(other.name)} (${ref.foreignColumns.map(c => quote(c.name)).join(",")})`);
    }
  }
  let counter = 900010000;
  const sourceUrl = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20260913&limit=100";
  const input = (options = {}) => {
    const event = m.finalEvent({ id: String(++counter), ...options });
    return fromEvent(event);
  };
  const fromEvent = event => ({
    espnId: "NFL-" + event.id, sport: "NFL", homeTeamId: "12", awayTeamId: "7",
    commenceTimeISO: event.date,
    homeScore: Number(event.competitions[0].competitors[1].score),
    awayScore: Number(event.competitions[0].competitors[0].score),
    nflFinalCapture: m.captureNflFinalEvent(event, sourceUrl, new Date().toISOString()),
  });
  const row = f => ({
    id: f.espnId, sport: "NFL", homeTeamId: "12", awayTeamId: "7",
    homeTeamAbbr: "TESTH", awayTeamAbbr: "TESTA", homeTeamName: "Synthetic Home",
    awayTeamName: "Synthetic Away", gameDate: "2026-09-13", gameTime: "8:20 PM",
    startsAt: new Date(f.commenceTimeISO), status: "upcoming", homeScore: null, awayScore: null,
  });
  const writer = f => async (tx, pending) => {
    await tx.insert(m.gamesTable).values({ ...row(f), status: pending ? "final" : "upcoming" })
      .onConflictDoNothing();
  };
  const read = async f => {
    const g = (await pool.query("SELECT *,xmin::text AS row_version FROM games WHERE id=$1", [f.espnId])).rows[0];
    const r = (await pool.query("SELECT *,xmin::text AS row_version FROM game_results WHERE game_id=$1", [f.espnId])).rows[0];
    return { g, r };
  };
  const classify = state => m.classifyNflStoredHistory({
    id: state.g.id, homeTeamId: state.g.home_team_id, awayTeamId: state.g.away_team_id,
    startsAt: state.g.starts_at, homeScore: state.g.home_score, awayScore: state.g.away_score,
    resultEvidence: state.r?.raw_result_json,
  }, new Date().toISOString());
  await check("new final atomically persists both tables and single-provider phase", async () => {
    const f = input();
    assert.equal((await m.persistNflFetchedFinal(f, writer(f))).outcome, "INSERTED");
    const s = await read(f);
    assert.equal(s.g.status, "final"); assert.equal(s.g.home_score, 31); assert.equal(s.r.away_score, 10);
    assert.equal(classify(s).decision, "REGULAR_SEASON");
    assert.equal(s.r.raw_result_json.tbmNflProviderFinal.independentlyVerified, false);
  });
  await check("concurrent refresh/recovery serializes to one result and one accepted capture", async () => {
    const f = input();
    await m.db.insert(m.gamesTable).values(row(f));
    const outcomes = await Promise.all([
      m.persistNflFetchedFinal(f, writer(f)), m.persistNflFetchedFinal(f),
      m.persistNflFetchedFinal(f, writer(f)), m.persistNflFetchedFinal(f),
    ]);
    assert.equal(outcomes.filter(o => o.outcome === "INSERTED").length, 1);
    assert.equal(outcomes.filter(o => o.outcome === "DUPLICATE").length, 3);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM game_results WHERE game_id=$1", [f.espnId])).rows[0].n, 1);
    const before = await read(f);
    const duplicate = { ...f, nflFinalCapture: m.captureNflFinalEvent(f.nflFinalCapture.event, sourceUrl, new Date().toISOString()) };
    await m.persistNflFetchedFinal(duplicate);
    const after = await read(f);
    assert.equal(after.g.row_version, before.g.row_version);
    assert.equal(after.r.row_version, before.r.row_version);
    assert.deepEqual(after.r.raw_result_json, before.r.raw_result_json);
  });
  await check("real result-insert failure rolls back a newly created fixture and retries safely", async () => {
    const f = input();
    await pool.query(`CREATE FUNCTION fail_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic interruption'; END $$`);
    await pool.query(`CREATE TRIGGER fail_result BEFORE INSERT OR UPDATE ON game_results FOR EACH ROW EXECUTE FUNCTION fail_result()`);
    await assert.rejects(m.persistNflFetchedFinal(f, writer(f)));
    assert.equal((await read(f)).g, undefined);
    await pool.query("DROP TRIGGER fail_result ON game_results");
    assert.equal((await m.persistNflFetchedFinal(f, writer(f))).outcome, "INSERTED");
  });
  await check("existing fixture score update rolls back when its result write fails", async () => {
    const f = input();
    await m.db.insert(m.gamesTable).values(row(f));
    await pool.query(`CREATE TRIGGER fail_result BEFORE INSERT OR UPDATE ON game_results FOR EACH ROW EXECUTE FUNCTION fail_result()`);
    await assert.rejects(m.persistNflFetchedFinal(f));
    const s = await read(f); assert.equal(s.g.status, "upcoming"); assert.equal(s.g.home_score, null); assert.equal(s.r, undefined);
    await pool.query("DROP TRIGGER fail_result ON game_results");
    assert.equal((await m.persistNflFetchedFinal(f)).outcome, "INSERTED");
  });
  await check("legitimate shutout remains zero in both tables", async () => {
    const f = input({ homeScore: "0", awayScore: "10" });
    await m.persistNflFetchedFinal(f, writer(f));
    const s = await read(f); assert.equal(s.g.home_score, 0); assert.equal(s.r.home_score, 0);
  });
  await check("0–0 and missing phase remain NULL-score quarantines without fabricated results", async () => {
    const zero = input({ homeScore: "0", awayScore: "0" });
    const unknown = input(); const event = structuredClone(unknown.nflFinalCapture.event); delete event.season;
    const noPhase = fromEvent(event);
    for (const f of [zero, noPhase]) {
      assert.equal((await m.persistNflFetchedFinal(f, writer(f))).outcome, "QUARANTINED");
      const s = await read(f); assert.equal(s.g.home_score, null); assert.equal(s.g.away_score, null); assert.equal(s.r, undefined);
      assert.equal(classify(s).decision, "QUARANTINED");
    }
    const fixed = fromEvent({ ...event, season: { year: 2026, type: 2 } });
    assert.equal((await m.persistNflFetchedFinal(fixed)).outcome, "INSERTED");
  });
  await check("preseason and postseason are archived but excluded from regular-season history", async () => {
    for (const seasonType of [1, 3]) {
      const f = input({ seasonType }); await m.persistNflFetchedFinal(f, writer(f));
      assert.equal(classify(await read(f)).decision, "EXCLUDED");
    }
  });
  await check("conflicting source score quarantines without overwriting facts or grade provenance", async () => {
    const f = input(); await m.persistNflFetchedFinal(f, writer(f));
    await pool.query("UPDATE game_results SET grading_source='synthetic-reviewed',raw_result_json=raw_result_json||'{\"retained\":true}'::jsonb WHERE game_id=$1", [f.espnId]);
    const before = await read(f);
    const event = structuredClone(f.nflFinalCapture.event); event.competitions[0].competitors[1].score = "20";
    assert.equal((await m.persistNflFetchedFinal(fromEvent(event))).outcome, "QUARANTINED");
    const after = await read(f); assert.equal(after.g.home_score, 31); assert.equal(after.r.home_score, 31);
    assert.equal(after.r.grading_source, "synthetic-reviewed"); assert.equal(after.r.graded_at.toISOString(), before.r.graded_at.toISOString());
    assert.equal(after.r.raw_result_json.retained, true); assert.equal(classify(after).decision, "QUARANTINED");
    await m.persistNflFetchedFinal(f);
    assert.equal(classify(await read(f)).decision, "QUARANTINED");
  });
  await check("existing matching result repairs game score atomically and preserves raw keys", async () => {
    const f = input(); await m.persistNflFetchedFinal(f, writer(f));
    await pool.query("UPDATE games SET home_score=0,away_score=0 WHERE id=$1", [f.espnId]);
    await pool.query("UPDATE game_results SET raw_result_json='{\"prior\":true}'::jsonb WHERE game_id=$1", [f.espnId]);
    const before = await read(f);
    await pool.query(`CREATE TRIGGER fail_result BEFORE INSERT OR UPDATE ON game_results FOR EACH ROW EXECUTE FUNCTION fail_result()`);
    await assert.rejects(m.persistNflFetchedFinal(f));
    assert.equal((await read(f)).g.home_score, 0);
    await pool.query("DROP TRIGGER fail_result ON game_results");
    await m.persistNflFetchedFinal(f);
    const after = await read(f); assert.equal(after.g.home_score, 31); assert.equal(after.r.raw_result_json.prior, true);
    assert.equal(after.r.graded_at.toISOString(), before.r.graded_at.toISOString());
  });
  await check("late live upsert cannot downgrade a stored NFL final", async () => {
    const f = input(); await m.persistNflFetchedFinal(f, writer(f));
    await m.db.insert(m.gamesTable).values({ ...row(f), status: "live" }).onConflictDoUpdate({
      target: m.gamesTable.id, setWhere: m.ne(m.gamesTable.status, "final"),
      set: { status: "live", homeScore: 0, awayScore: 0 },
    });
    assert.equal((await read(f)).g.status, "final"); assert.equal((await read(f)).g.home_score, 31);
  });
  await check("NFL ID with stored non-NFL sport cannot change either table", async () => {
    const f = input(); await m.db.insert(m.gamesTable).values({ ...row(f), sport: "NBA" });
    const before = await read(f);
    assert.equal((await m.persistNflFetchedFinal(f)).outcome, "QUARANTINED");
    assert.deepEqual(await read(f), before);
  });
  await check("no transaction advisory locks survive commit/rollback on the test pool", async () => {
    const locks = (await pool.query(`
      SELECT count(*)::int AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
      WHERE l.locktype='advisory' AND a.application_name='nfl-isolated-integration'
        AND a.datname=current_database()
    `)).rows[0].n;
    assert.equal(locks, 0);
  });
  console.log(JSON.stringify({
    result: "PASS", postgresCases: completed, isolatedDatabase: config.database,
    restrictedRole: config.role, branch: config.branch, sourceDatabaseConnect: false,
    tables: ["games", "game_results"], providerRequests: 0, applicationStartupImports: 0,
  }));
} catch (error) {
  // Do not print driver configuration or an exception object carrying credentials.
  console.error(JSON.stringify({ result: "FAIL", completed, name: error.name, code: error.code, message: String(error.message).replaceAll(config.uri, "[private]") }));
  process.exitCode = 1;
} finally {
  if (created) {
    await pool.query("DROP TABLE IF EXISTS game_results");
    await pool.query("DROP TABLE IF EXISTS games");
    await pool.query("DROP FUNCTION IF EXISTS fail_result()");
  }
  await pool.end();
  if (temp) await rm(temp, { recursive: true, force: true });
  delete globalThis[Symbol.for("nfl.approved.postgres.test")];
}
