/**
 * Disposable LOCAL PostgreSQL, private Unix socket only. No Neon/Render access,
 * credentials, application startup, full migrations, jobs, or provider calls.
 * Runs the actual NCAA persistence adapter against its actual Drizzle schema.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";

assert.equal(process.argv.length, 2, "No script overrides accepted");
for (const key of Object.keys(process.env)) {
  assert(!/DATABASE_URL|RENDER_API_KEY|PGHOST|PGUSER|PGPASSWORD|CLERK|CFBD_API_KEY/.test(key),
    "Ambient application credentials forbidden");
}
assert.equal(process.env.SCHEDULER_ENABLED, "false");
const api = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireDb = createRequire(resolve(api, "../../lib/db/package.json"));
const { Pool } = requireDb("pg"), { build } = createRequire(import.meta.url)("esbuild");
const temp = await mkdtemp("/tmp/ncaaf-integrity-pg-"), data = join(temp, "data"), socket = join(temp, "socket");
await mkdir(socket, { mode: 0o700 });
const poolOptions = { host: socket, database: "ncaaf_integrity_test", user: "ncaaf_integrity_runner", max: 6,
  application_name: "ncaaf-isolated-postgres", connectionTimeoutMillis: 10_000 };
const deny = () => { throw Error("NCAAF_POSTGRES_EXTERNAL_IO_FORBIDDEN"); };
globalThis.fetch = deny;
http.get = http.request = https.get = https.request = deny;
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = args[0], path = typeof first === "string" ? first : first?.path;
  assert.equal(path, join(socket, ".s.PGSQL.5432"), "Only the approved private Unix socket may be used");
  return connect.apply(this, args);
};
let started = false, pool, bootstrap, restrictedPool, bundleDir, count = 0;
const check = async (label, fn) => { await fn(); count++; console.log("PASS " + label); };
try {
  execFileSync("initdb", ["-D", data, "-U", "ncaaf_bootstrap", "--auth-local=trust", "--auth-host=reject"], { stdio: "pipe" });
  execFileSync("pg_ctl", ["-D", data, "-l", join(temp, "postgres.log"), "-o",
    `-c listen_addresses='' -c unix_socket_directories='${socket}'`, "-w", "start"], { stdio: "pipe" });
  started = true;
  bootstrap = new Pool({ ...poolOptions, database: "postgres", user: "ncaaf_bootstrap" });
  // These bootstrap writes are confined to the freshly created private cluster.
  assert.equal((await bootstrap.query("SHOW listen_addresses")).rows[0].listen_addresses, "");
  assert.equal((await bootstrap.query("SELECT count(*)::int AS n FROM pg_database WHERE datname='neondb'")).rows[0].n, 0);
  await bootstrap.query("CREATE ROLE ncaaf_integrity_runner LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
  await bootstrap.query("REVOKE CONNECT ON DATABASE postgres FROM PUBLIC");
  await bootstrap.query("CREATE DATABASE ncaaf_integrity_test OWNER ncaaf_integrity_runner");
  await bootstrap.end(); bootstrap = null;
  pool = new Pool(poolOptions);
  const identity = (await pool.query(`SELECT current_database() AS database,current_user AS role,
    rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit,
    (SELECT count(*)::int FROM pg_auth_members WHERE member=pg_roles.oid) AS memberships
    FROM pg_roles WHERE rolname=current_user`)).rows[0];
  assert.equal(identity.database, poolOptions.database); assert.equal(identity.role, poolOptions.user);
  for (const flag of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls", "rolinherit"]) assert.equal(identity[flag], false);
  assert.equal(identity.memberships, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_extension WHERE extname IN ('pg_cron','pgagent')")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n, 0);
  assert((await pool.query("SELECT usename,application_name FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend'"))
    .rows.every(row => row.usename === poolOptions.user && row.application_name === poolOptions.application_name));
  globalThis[Symbol.for("ncaaf.approved.local.postgres")] = pool;
  await mkdir(join(api, "tmp"), { recursive: true });
  bundleDir = await mkdtemp(join(api, "tmp/ncaaf-postgres-"));
  const bundle = join(bundleDir, "adapter.mjs");
  await build({
    stdin: { resolveDir: api, loader: "ts", contents: `
      export {persistNcaafFetchedFinal} from "./src/services/ncaafFinalPersistence";
      export {createNcaafHistoricalRepairStore} from "./src/services/ncaafHistoricalRepairPersistence";
      export {executeNcaafRepair,snapshotHash,officialDocumentHash} from "./src/services/ncaafHistoricalRepair";
      export {createNcaafRepairJournal} from "./src/services/ncaafRepairJournal";
      export {repairFixture} from "./test/ncaaf-integrity/repair-fixture";
      export {ncaafIntegrityHash} from "./src/services/ncaafHistoricalIntegrity";
      export {captureNcaafSource} from "./src/services/ncaafHistoricalIntegrity";
      export {discoverV4Slate} from "./src/services/v4FullSlate";
      export {db,gamesTable,gameResultsTable} from "@workspace/db";
      export {getTableConfig,PgDialect} from "drizzle-orm/pg-core";
    ` },
    outfile: bundle, bundle: true, packages: "external", format: "esm", platform: "node",
    plugins: [{ name: "ncaaf-approved-local-db", setup(b) {
      b.onResolve({ filter: /(?:^|\/)espn$/ }, () => ({ path: "offline-provider", namespace: "ncaaf-pg" }));
      b.onLoad({ filter: /^offline-provider$/, namespace: "ncaaf-pg" }, () => ({
        loader: "js", contents: `export async function fetchSportGamesByDate() {
          const rows=globalThis[Symbol.for("ncaaf.approved.local.providerGames")];
          if(!Array.isArray(rows)) throw Error("No synthetic provider observations supplied");
          return rows;
        }`,
      }));
      b.onResolve({ filter: /(?:^|\/)v4OfficialPersistence$/ }, () => ({
        path: "forbidden-publication", namespace: "ncaaf-pg",
      }));
      b.onLoad({ filter: /^forbidden-publication$/, namespace: "ncaaf-pg" }, () => ({
        loader: "js", contents: `export function persistOfficialV4Forecasts(){throw Error("Publication forbidden")}
          export function reconcileOfficialV4Day(){throw Error("Publication forbidden")}`,
      }));
      b.onResolve({ filter: /^drizzle-zod$/ }, args => ({ path: requireDb.resolve(args.path), external: true }));
      b.onResolve({ filter: /^@workspace\/db(?:\/schema)?$/ }, () => ({ path: "approved-db", namespace: "ncaaf-pg" }));
      b.onLoad({ filter: /^approved-db$/, namespace: "ncaaf-pg" }, () => ({ resolveDir: api, loader: "ts", contents: `
        import {drizzle} from "drizzle-orm/node-postgres";
        export {gamesTable} from ${JSON.stringify(resolve(api, "../../lib/db/src/schema/games.ts"))};
        export {gameResultsTable} from ${JSON.stringify(resolve(api, "../../lib/db/src/schema/game-results.ts"))};
        export {v4ForecastVersionsTable,v4FullSlateRunsTable} from ${JSON.stringify(resolve(api, "../../lib/db/src/schema/v4-platform.ts"))};
        export const db=drizzle(globalThis[Symbol.for("ncaaf.approved.local.postgres")]);
      ` }));
      b.onResolve({ filter: /(?:scheduler|grading-runner|run-cloud-pipeline-once|\/src\/app|\/src\/index)(?:\.ts)?$/ },
        () => { throw Error("Application/worker startup forbidden"); });
    } }],
  });
  const m = await import(bundle), dialect = new m.PgDialect();
  const quote = value => { assert.match(value, /^[a-zA-Z_][a-zA-Z_0-9]*$/); return '"' + value + '"'; };
  const literal = value => {
    if (value?.queryChunks) { const q = dialect.sqlToQuery(value); assert.equal(q.params.length, 0); return q.sql; }
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "'" + (typeof value === "string" ? value : JSON.stringify(value)).replaceAll("'", "''") + "'";
  };
  for (const table of [m.gamesTable, m.gameResultsTable]) {
    const t = m.getTableConfig(table);
    await pool.query(`CREATE TABLE ${quote(t.name)} (${t.columns.map(c =>
      `${quote(c.name)} ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}${c.notNull ? " NOT NULL" : ""}${c.default === undefined ? "" : " DEFAULT " + literal(c.default)}`).join(",")})`);
    for (const index of t.indexes.filter(i => i.config.unique)) {
      await pool.query(`CREATE UNIQUE INDEX ${quote(index.config.name)} ON ${quote(t.name)} (${index.config.columns.map(c => quote(c.name)).join(",")})`);
    }
    for (const fk of t.foreignKeys) {
      const ref = fk.reference(); assert.equal(m.getTableConfig(ref.foreignTable).name, "games");
      await pool.query(`ALTER TABLE ${quote(t.name)} ADD FOREIGN KEY (${ref.columns.map(c => quote(c.name)).join(",")}) REFERENCES games (${ref.foreignColumns.map(c => quote(c.name)).join(",")})`);
    }
  }
  let counter = 990000000;
  const fixture = (home = 21, away = 27, phase = 2) => {
    const event = { id: String(++counter), date: "2026-08-29T23:00:00Z", season: { year: 2026, type: phase },
      status: { type: { completed: true, state: "post", name: "STATUS_FINAL" } },
      competitions: [{ date: "2026-08-29T23:00:00Z", competitors: [
        { homeAway: "home", team: { id: "2439" }, score: String(home) },
        { homeAway: "away", team: { id: "235" }, score: String(away) },
      ] }] };
    return { sport: "NCAAF", espnId: "NCAAF-" + event.id, homeTeamId: "2439", awayTeamId: "235",
      commenceTimeISO: event.date, homeScore: home, awayScore: away,
      ncaafFinalCapture: m.captureNcaafSource("ESPN", event,
        "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=20260829&limit=100",
        new Date().toISOString()) };
  };
  const row = f => ({ id: f.espnId, sport: "NCAAF", homeTeamId: "2439", awayTeamId: "235",
    startsAt: new Date(f.commenceTimeISO), gameDate: "2026-08-29", gameTime: "7 PM", status: "upcoming",
    homeTeamAbbr: "TESTH", awayTeamAbbr: "TESTA", homeTeamName: "Synthetic Home", awayTeamName: "Synthetic Away" });
  const writer = f => async (tx, pending) => tx.insert(m.gamesTable).values({
    ...row(f), status: pending ? "final" : "upcoming", homeScore: null, awayScore: null,
  });
  const state = async f => ({
    g: (await pool.query("SELECT *,xmin::text AS version FROM games WHERE id=$1", [f.espnId])).rows[0],
    r: (await pool.query("SELECT *,xmin::text AS version FROM game_results WHERE game_id=$1", [f.espnId])).rows[0],
  });
  const discover = async observations => {
    globalThis[Symbol.for("ncaaf.approved.local.providerGames")] = observations.map(f => ({
      ...f, homeTeamName: "Synthetic Home", awayTeamName: "Synthetic Away",
      homeTeamAbbr: "TESTH", awayTeamAbbr: "TESTA", gameDate: "2026-08-29",
      gameTime: "7 PM", status: f.status ?? "final",
    }));
    return m.discoverV4Slate(observations[0]?.sport ?? "NCAAF", "2026-08-29");
  };
  await check("real V4 discovery atomically creates a source-backed NCAA final and result", async () => {
    const f = fixture(); const events = await discover([f]); const s = await state(f);
    assert(events.some(e => e.gameId === f.espnId));
    assert.equal(s.g.status, "final"); assert.equal(s.g.home_score, 21); assert.equal(s.r.away_score, 27);
    assert.equal(s.r.raw_result_json.tbmNcaafIntegrity.schemaVersion, "ncaaf-final-integrity-v1");
  });
  await check("real V4 discovery cannot revert an NCAA final with a stale upcoming row", async () => {
    const f = fixture(); await m.persistNcaafFetchedFinal(f, writer(f)); const before = await state(f);
    await discover([{ ...f, status: "upcoming", homeScore: 0, awayScore: 0 }]);
    assert.deepEqual(await state(f), before);
  });
  await check("real V4 discovery quarantines suspicious 0–0 without creating a result", async () => {
    const f = fixture(0, 0); await discover([f]); const s = await state(f);
    assert.equal(s.g.home_score, null); assert.equal(s.g.away_score, null); assert.equal(s.r, undefined);
  });
  await check("real V4 discovery preserves an existing correct final on bad score observations", async () => {
    const f = fixture(); await m.persistNcaafFetchedFinal(f, writer(f)); const before = await state(f);
    await discover([{ ...f, homeScore: 0, awayScore: 0 }]); assert.deepEqual(await state(f), before);
  });
  await check("real V4 discovery synchronizes a stale fixture from a matching verified result", async () => {
    const f = fixture(); await m.persistNcaafFetchedFinal(f, writer(f));
    await pool.query("UPDATE games SET home_score=0,away_score=0 WHERE id=$1", [f.espnId]);
    await discover([f]); const s = await state(f);
    assert.equal(s.g.home_score, 21); assert.equal(s.g.away_score, 27);
    assert.equal(s.g.home_score, s.r.home_score);
  });
  await check("real V4 discovery keeps NFL on its unchanged non-NCAA path", async () => {
    const f = { ...fixture(), sport: "NFL", espnId: "NFL-" + counter };
    await discover([f]); const s = await state(f);
    assert.equal(s.g.sport, "NFL"); assert.equal(s.g.home_score, 21); assert.equal(s.r, undefined);
  });
  await check("new final writes actual fixture/result/provenance atomically", async () => {
    const f = fixture(); assert.equal((await m.persistNcaafFetchedFinal(f, writer(f))).outcome, "INSERTED");
    const s = await state(f); assert.equal(s.g.home_score, 21); assert.equal(s.r.away_score, 27);
    assert.equal(s.r.raw_result_json.tbmNcaafIntegrity.verification, "SINGLE_UPSTREAM");
  });
  await check("duplicate poll is a true no-write operation", async () => {
    const f = fixture(); await m.persistNcaafFetchedFinal(f, writer(f)); const before = await state(f);
    assert.equal((await m.persistNcaafFetchedFinal(f, writer(f))).outcome, "DUPLICATE");
    assert.deepEqual(await state(f), before);
  });
  await check("four concurrent writers produce one result and release pooled locks", async () => {
    const f = fixture(); const r = await Promise.all(Array.from({ length: 4 }, () => m.persistNcaafFetchedFinal(f, writer(f))));
    assert.equal(r.filter(x => x.outcome === "INSERTED").length, 1);
    assert.equal(r.filter(x => x.outcome === "DUPLICATE").length, 3);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM game_results WHERE game_id=$1", [f.espnId])).rows[0].n, 1);
  });
  await check("stale 0–0 fixture is synchronized without changing grade timestamp or raw keys", async () => {
    const f = fixture(); await m.persistNcaafFetchedFinal(f, writer(f));
    await pool.query("UPDATE games SET home_score=0,away_score=0 WHERE id=$1", [f.espnId]);
    await pool.query(`UPDATE game_results SET graded_at='2026-08-30T05:00:00Z',raw_result_json=raw_result_json||'{"preserve":"yes"}'::jsonb WHERE game_id=$1`, [f.espnId]);
    await m.persistNcaafFetchedFinal(f); const s = await state(f);
    assert.equal(s.g.home_score, s.r.home_score); assert.equal(s.r.raw_result_json.preserve, "yes");
    assert.equal(s.r.graded_at.toISOString(), "2026-08-30T05:00:00.000Z");
  });
  const trigger = async () => pool.query(`CREATE FUNCTION fail_ncaaf_result() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_RESULT_FAILURE'; END$$;
    CREATE TRIGGER fail_result BEFORE INSERT OR UPDATE ON game_results FOR EACH ROW EXECUTE FUNCTION fail_ncaaf_result()`);
  const untrigger = async () => pool.query("DROP TRIGGER fail_result ON game_results; DROP FUNCTION fail_ncaaf_result()");
  await check("result insertion failure rolls back new fixture, then retry succeeds", async () => {
    const f = fixture(); await trigger();
    try { await assert.rejects(() => m.persistNcaafFetchedFinal(f, writer(f))); }
    finally { await untrigger(); }
    assert.equal((await state(f)).g, undefined);
    assert.equal((await m.persistNcaafFetchedFinal(f, writer(f))).outcome, "INSERTED");
  });
  await check("result update failure rolls back fixture repair, then retry succeeds", async () => {
    const f = fixture(); await m.persistNcaafFetchedFinal(f, writer(f));
    await pool.query("UPDATE games SET home_score=0,away_score=0 WHERE id=$1", [f.espnId]);
    const before = await state(f); await trigger();
    try { await assert.rejects(() => m.persistNcaafFetchedFinal(f)); }
    finally { await untrigger(); }
    assert.deepEqual(await state(f), before);
    assert.equal((await m.persistNcaafFetchedFinal(f)).outcome, "UPDATED");
  });
  await check("suspicious 0–0 creates a NULL-score pending fixture, no result", async () => {
    const f = fixture(0, 0); assert.equal((await m.persistNcaafFetchedFinal(f, writer(f))).outcome, "QUARANTINED");
    const s = await state(f); assert.equal(s.g.home_score, null); assert.equal(s.r, undefined);
  });
  await check("legitimate shutout remains a real zero in both tables", async () => {
    const f = fixture(21, 0); await m.persistNcaafFetchedFinal(f, writer(f)); const s = await state(f);
    assert.equal(s.g.away_score, 0); assert.equal(s.r.away_score, 0);
  });
  await check("NCAA postseason is retained rather than NFL-excluded", async () => {
    const f = fixture(21, 27, 3); await m.persistNcaafFetchedFinal(f, writer(f));
    assert.equal((await state(f)).r.raw_result_json.tbmNcaafIntegrity.phase, "POSTSEASON");
  });
  await check("conflicting existing result is quarantined without changing either row", async () => {
    const f = fixture(); await m.persistNcaafFetchedFinal(f, writer(f));
    await pool.query("UPDATE game_results SET home_score=30 WHERE game_id=$1", [f.espnId]); const before = await state(f);
    assert.equal((await m.persistNcaafFetchedFinal(f)).outcome, "QUARANTINED"); assert.deepEqual(await state(f), before);
  });
  await check("wrong-sport fixture cannot be modified", async () => {
    const f = fixture(); await m.db.insert(m.gamesTable).values({ ...row(f), sport: "NFL" }); const before = await state(f);
    assert.equal((await m.persistNcaafFetchedFinal(f)).outcome, "QUARANTINED"); assert.deepEqual(await state(f), before);
  });
  await check("no session advisory locks survive successful or failed transactions", async () => {
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())")).rows[0].n, 0);
  });
  const repairStore = m.createNcaafHistoricalRepairStore(pool);
  const repairTarget = {host: poolOptions.host, database: poolOptions.database, role: poolOptions.user};
  const readRepair = id => repairStore.transaction(id, tx => tx.read());
  const buildRepair = async (rawKind = "JSON_NULL", missing = false) => {
    const f = fixture(); await m.persistNcaafFetchedFinal(f, writer(f));
    if (missing) await pool.query("DELETE FROM game_results WHERE game_id=$1", [f.espnId]);
    else {
      await pool.query(`UPDATE game_results SET raw_result_json=${rawKind === "SQL_NULL" ? "NULL" : "'null'::jsonb"} WHERE game_id=$1`, [f.espnId]);
      await pool.query("UPDATE games SET home_score=0,away_score=0 WHERE id=$1", [f.espnId]);
    }
    const snapshot = await readRepair(f.espnId), synthetic = m.repairFixture(f.espnId.slice(6));
    const g = snapshot.game, r = snapshot.result;
    synthetic.entry.input = f;
    synthetic.entry.before = {gameId:g.id,homeTeamId:g.homeTeamId,awayTeamId:g.awayTeamId,kickoffAt:g.startsAt,
      homeScore:g.homeScore,awayScore:g.awayScore,gameUpdatedAt:g.updatedAt,resultId:r?.id??null,
      resultHomeScore:r?.homeScore??null,resultAwayScore:r?.awayScore??null,resultUpdatedAt:r?.updatedAt??null,
      gradedAt:r?.gradedAt??null,gradingSource:r?.gradingSource??null,
      rawIsSqlNull:snapshot.rawIsSqlNull,rawMd5:snapshot.rawMd5};
    synthetic.entry.official.identity = {gameId:g.id,homeTeamId:g.homeTeamId,awayTeamId:g.awayTeamId,kickoffAt:g.startsAt};
    // Test captures are made now, so the review cutoff must follow capture.
    synthetic.manifest.asOf = new Date().toISOString();
    synthetic.approval.manifestHash = m.ncaafIntegrityHash(synthetic.manifest);
    synthetic.approval.target = repairTarget;
    const journalPath = join(temp, "journal-"+f.espnId);
    return {...synthetic,snapshot,journal:await m.createNcaafRepairJournal(journalPath),journalPath};
  };
  const applyRepair = t => m.executeNcaafRepair(repairStore,t.journal,t.manifest,t.approval);
  const rollbackRepair = t => m.executeNcaafRepair(repairStore,t.journal,t.manifest,{
    ...t.approval,operation:"ROLLBACK",acknowledgeKnownBadBeforeScores:true});
  await check("repair rejects wrong pool target before any transaction", async () => {
    await assert.rejects(()=>repairStore.verifyTarget({...repairTarget,database:"not-approved"}),/POOL_BINDING/);
  });
  await repairStore.verifyTarget(repairTarget);
  for (const rawKind of ["SQL_NULL","JSON_NULL"]) await check("repair rollback preserves "+rawKind+" exactly",async()=>{
    const t=await buildRepair(rawKind);
    assert.equal((await applyRepair(t))[0].outcome,"APPLIED");
    const after=await readRepair(t.entry.before.gameId);
    assert.equal(after.game.homeScore,21);assert.equal(after.game.awayScore,27);
    assert.equal(after.result.gradedAt,t.snapshot.result.gradedAt);
    assert.equal(after.result.gradingSource,t.snapshot.result.gradingSource);
    assert.equal((await applyRepair(t))[0].outcome,"ALREADY_APPLIED");
    assert.deepEqual(await readRepair(t.entry.before.gameId),after);
    assert.equal((await rollbackRepair(t))[0].outcome,"ROLLED_BACK");
    assert.deepEqual(await readRepair(t.entry.before.gameId),t.snapshot);
    assert.equal((await rollbackRepair(t))[0].outcome,"ALREADY_ROLLED_BACK");
  });
  await check("repair receipt failure rolls back game and result atomically",async()=>{
    const t=await buildRepair();await trigger();
    try {await assert.rejects(()=>applyRepair(t));}finally{await untrigger();}
    assert.deepEqual(await readRepair(t.entry.before.gameId),t.snapshot);
    assert.equal((await applyRepair(t))[0].outcome,"APPLIED");
  });
  await check("committed repair resumes after journal completion crash",async()=>{
    const t=await buildRepair();const real=t.journal;
    const interrupted={get:k=>real.get(k),put:async(k,v)=>{if(v.state==="APPLIED")throw Error("journal crash");return real.put(k,v);}};
    await assert.rejects(()=>m.executeNcaafRepair(repairStore,interrupted,t.manifest,t.approval),/journal crash/);
    const after=await readRepair(t.entry.before.gameId);
    assert.equal((await applyRepair(t))[0].outcome,"ALREADY_APPLIED");
    assert.deepEqual(await readRepair(t.entry.before.gameId),after);
  });
  await check("concurrent repair invocations perform one reconciliation",async()=>{
    const t=await buildRepair();const outcomes=(await Promise.all([applyRepair(t),applyRepair(t)])).flat().map(x=>x.outcome).sort();
    assert.deepEqual(outcomes,["ALREADY_APPLIED","APPLIED"]);
  });
  await check("stale before-image is quarantined without changes",async()=>{
    const t=await buildRepair();await pool.query("UPDATE games SET updated_at=updated_at+interval '1 second' WHERE id=$1",[t.entry.before.gameId]);
    const current=await readRepair(t.entry.before.gameId);assert.match((await applyRepair(t))[0].outcome,/STALE/);
    assert.deepEqual(await readRepair(t.entry.before.gameId),current);
  });
  await check("new final inserts atomically and destructive rollback is blocked",async()=>{
    const t=await buildRepair("JSON_NULL",true);
    assert.equal((await applyRepair(t))[0].outcome,"APPLIED");
    const after=await readRepair(t.entry.before.gameId);assert(after.result);
    assert.match((await rollbackRepair(t))[0].outcome,/INSERT_ROLLBACK_REQUIRES/);
    assert.deepEqual(await readRepair(t.entry.before.gameId),after);
  });
  await check("filesystem journal corruption fails closed",async()=>{
    const t=await buildRepair();await applyRepair(t);
    const files=(await (await import("node:fs/promises")).readdir(t.journalPath)).filter(f=>f.endsWith(".json"));
    const f=join(t.journalPath,files[0]);await (await import("node:fs/promises")).writeFile(f,'{"tampered":true}');
    await assert.rejects(()=>applyRepair(t),/CHECKSUM/);
  });
  await check("repair leaves no session advisory locks or open failed transactions",async()=>{
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())")).rows[0].n,0);
  });
  // Exercise the actual REVIEW templates only against this disposable cluster.
  // The production host/branch/credentials never enter this process.
  bootstrap = new Pool({...poolOptions,user:"ncaaf_bootstrap"});
  const templateDir = join(api,"test/ncaaf-integrity/release-review");
  const setupTemplate = await readFile(join(templateDir,"restricted-role-setup.sql"),"utf8");
  const revokeTemplate = await readFile(join(templateDir,"restricted-role-revoke.sql"),"utf8");
  await check("role template fails on a non-approved database without creating a role",async()=>{
    await assert.rejects(()=>bootstrap.query(setupTemplate),/UNAPPROVED_DATABASE/);
    await bootstrap.query("ROLLBACK");
    assert.equal((await bootstrap.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname='tbm_ncaaf_integrity_repair'")).rows[0].n,0);
  });
  await check("restricted role template grants only the reviewed columns locally",async()=>{
    await bootstrap.query(setupTemplate.replaceAll("neondb",poolOptions.database));
    const r=(await bootstrap.query(`SELECT
      has_table_privilege('tbm_ncaaf_integrity_repair','games','UPDATE') AS table_update,
      has_column_privilege('tbm_ncaaf_integrity_repair','games','home_score','UPDATE') AS score_update,
      has_column_privilege('tbm_ncaaf_integrity_repair','games','home_team_id','UPDATE') AS identity_update,
      has_column_privilege('tbm_ncaaf_integrity_repair','game_results','graded_at','UPDATE') AS grading_update,
      has_table_privilege('tbm_ncaaf_integrity_repair','game_results','DELETE') AS result_delete`)).rows[0];
    assert.deepEqual(r,{table_update:false,score_update:true,identity_update:false,grading_update:false,result_delete:false});
  });
  const restrictedOptions={...poolOptions,user:"tbm_ncaaf_integrity_repair",max:2};
  restrictedPool=new Pool(restrictedOptions);
  const limitedStore=m.createNcaafHistoricalRepairStore(restrictedPool);
  const limitedTarget={...repairTarget,role:restrictedOptions.user};
  await check("actual restricted non-owner login passes target verification",async()=>{
    await limitedStore.verifyTarget(limitedTarget);
    assert.equal((await restrictedPool.query("SHOW statement_timeout")).rows[0].statement_timeout,"30s");
    assert.equal((await restrictedPool.query("SHOW lock_timeout")).rows[0].lock_timeout,"5s");
  });
  for(const kind of ["SQL_NULL","JSON_NULL"])await check("column-restricted repair applies and restores "+kind,async()=>{
    const t=await buildRepair(kind);const approval={...t.approval,target:limitedTarget};
    assert.equal((await m.executeNcaafRepair(limitedStore,t.journal,t.manifest,approval))[0].outcome,"APPLIED");
    assert.equal((await m.executeNcaafRepair(limitedStore,t.journal,t.manifest,approval))[0].outcome,"ALREADY_APPLIED");
    assert.equal((await m.executeNcaafRepair(limitedStore,t.journal,t.manifest,{
      ...approval,operation:"ROLLBACK",acknowledgeKnownBadBeforeScores:true}))[0].outcome,"ROLLED_BACK");
    assert.deepEqual(await readRepair(t.entry.before.gameId),t.snapshot);
  });
  await check("column-restricted role inserts a missing result using sequence usage only",async()=>{
    const t=await buildRepair("SQL_NULL",true);
    assert.equal((await m.executeNcaafRepair(limitedStore,t.journal,t.manifest,{
      ...t.approval,target:limitedTarget}))[0].outcome,"APPLIED");
    assert((await readRepair(t.entry.before.gameId)).result);
  });
  await check("restricted login cannot change identity, grading time, delete, or create schema objects",async()=>{
    for(const sql of [
      "UPDATE games SET home_team_id=home_team_id",
      "UPDATE game_results SET graded_at=graded_at",
      "UPDATE game_results SET grading_source=grading_source",
      "DELETE FROM game_results",
      "CREATE TABLE public.forbidden_repair_table(id int)",
      "CREATE ROLE forbidden_repair_role",
    ])await assert.rejects(()=>restrictedPool.query(sql),/permission denied/);
  });
  await check("reviewed revoke template removes column grants and disables login",async()=>{
    await restrictedPool.end();restrictedPool=null;
    await bootstrap.query(revokeTemplate.replaceAll("neondb",poolOptions.database));
    const r=(await bootstrap.query(`SELECT rolcanlogin,
      has_column_privilege(rolname,'games','home_score','UPDATE') AS game_update,
      has_column_privilege(rolname,'game_results','home_score','INSERT') AS result_insert
      FROM pg_roles WHERE rolname='tbm_ncaaf_integrity_repair'`)).rows[0];
    assert.deepEqual(r,{rolcanlogin:false,game_update:false,result_insert:false});
  });
  console.log(`NCAA POSTGRES: ${count} passed; private Unix socket, restricted role, actual schema/adapter; no production access.`);
} finally {
  if (restrictedPool) await restrictedPool.end();
  if (bootstrap) await bootstrap.end();
  if (pool) await pool.end();
  if (started) execFileSync("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  if (bundleDir) await rm(bundleDir, { recursive: true, force: true });
  await rm(temp, { recursive: true, force: true });
}
