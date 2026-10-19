/**
 * Disposable PostgreSQL only. No DATABASE_URL, remote credentials, startup import,
 * providers, scheduler, migrations against an existing database, or app processes.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const require = createRequire(join(root, "lib/db/package.json"));
const { Pool } = require("pg");
const { buildSync } = createRequire(new URL("../package.json", import.meta.url))("esbuild");
const tmp = mkdtempSync(join(tmpdir(), "tbm-pass-pg-"));
const env = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C.UTF-8" };
let started = false, pool;
try {
  execFileSync("initdb", ["-D", join(tmp, "data"), "-A", "trust", "--no-locale", "-U", userInfo().username], { env, stdio: "pipe" });
  execFileSync("pg_ctl", ["-D", join(tmp, "data"), "-l", join(tmp, "pg.log"),
    "-o", `-F -k ${tmp} -h '' -p 55439`, "-w", "start"], { env, stdio: "pipe" });
  started = true;
  pool = new Pool({ host: tmp, port: 55439, user: userInfo().username, database: "postgres", max: 10 });
  // The generated bundle substitutes ONLY this socket-bound DB. It cannot fall
  // through to the application's ambient production/development connection.
  globalThis.__projectionPassTestPool = pool;
  const shim = join(tmp, "db.ts"), entry = join(tmp, "entry.ts");
  writeFileSync(shim, `
    import {drizzle} from ${JSON.stringify(require.resolve("drizzle-orm/node-postgres"))};
    export * from ${JSON.stringify(join(root, "lib/db/src/schema/index.ts"))};
    export const db = drizzle(globalThis.__projectionPassTestPool);
  `);
  writeFileSync(entry, `
    export * from ${JSON.stringify(join(root, "artifacts/api-server/src/services/projectionPass.ts"))};
    export {bootstrapTask241V4Engines as bootstrap} from ${JSON.stringify(join(root, "artifacts/api-server/src/services/v4EngineBootstrap241.ts"))};
    export {canonicalV4EngineRegistry as registry,stableHash} from ${JSON.stringify(join(root, "artifacts/api-server/src/services/v4Platform.ts"))};
    export {gamesTable,v4ForecastVersionsTable,db} from ${JSON.stringify(shim)};
    export {getTableConfig} from ${JSON.stringify(require.resolve("drizzle-orm/pg-core"))};
  `);
  buildSync({ entryPoints: [entry], outfile: join(tmp, "runtime.cjs"), bundle: true, platform: "node",
    format: "cjs", alias: { "@workspace/db": shim }, external: ["pg-native"],
    define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" });
  const runtime = require(join(tmp, "runtime.cjs"));
  for (const table of [runtime.gamesTable, runtime.v4ForecastVersionsTable]) {
    const config = runtime.getTableConfig(table);
    await pool.query(`CREATE TABLE "${config.name}" (${config.columns.map(c =>
      `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`).join(",")})`);
  }
  await pool.query(readFileSync(join(root, "lib/db/migrations/20261019_projection_passes.sql"), "utf8"));
  runtime.bootstrap();
  const now = new Date(), start = new Date(now.getTime() + 900_000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const identity = runtime.registry.get("NFL").identity;
  async function fixture(id, status = "upcoming", kickoff = start, withForecast = true) {
    await runtime.db.insert(runtime.gamesTable).values({ id, sport: "NFL", gameDate: date, gameTime: "TEST",
      startsAt: kickoff, status, homeTeamName: "Test Home", awayTeamName: "Test Away",
      homeTeamAbbr: "HOME", awayTeamAbbr: "AWAY" });
    if (!withForecast) return;
    const predictionTime = new Date(now.getTime() - 60_000), cutoff = new Date(now.getTime() - 120_000);
    const payload = { ...identity, gameId: id, predictionId: `prediction-${id}`,
      predictionTimestamp: predictionTime.toISOString(), dataCutoff: cutoff.toISOString(),
      expectedHomeScore: 24, expectedAwayScore: 17, homeWinProbability: .7, awayWinProbability: .3 };
    await runtime.db.insert(runtime.v4ForecastVersionsTable).values({
      predictionId: payload.predictionId, gameId: id, sport: "NFL", version: 1,
      ...identity, dataCutoff: cutoff, predictedAt: predictionTime, eventStart: kickoff,
      createdAt: predictionTime, forecastPayload: payload, forecastHash: runtime.stableHash(payload),
    });
  }
  await fixture("one"); await fixture("two"); await fixture("live", "live");
  await fixture("started", "upcoming", new Date(now.getTime() - 1));
  await fixture("unavailable", "upcoming", start, false);
  const first = await runtime.claimProjectionPass("account-a", "one");
  assert.equal(first.gameId, "one"); assert.equal(first.projection.expectedHomeScore, 24);
  assert.equal(Date.parse(first.expiresAt) - Date.parse(first.claimedAt), 86_400_000);
  assert.equal(first.canClaim, false);
  assert.equal((await runtime.claimProjectionPass("account-a", "one")).claimedAt, first.claimedAt);
  await assert.rejects(runtime.claimProjectionPass("account-a", "two"), { code: "PASS_ALREADY_USED" });
  assert.equal((await runtime.claimProjectionPass("account-b", "two")).gameId, "two");
  const race = await Promise.allSettled([
    runtime.claimProjectionPass("concurrent-account", "one"), runtime.claimProjectionPass("concurrent-account", "two"),
  ]);
  assert.equal(race.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(race.filter(r => r.status === "rejected" && r.reason.code === "PASS_ALREADY_USED").length, 1);
  for (const id of ["live", "started", "unavailable", "does-not-exist"]) {
    await assert.rejects(runtime.claimProjectionPass("unused-account", id));
    assert.equal((await runtime.getProjectionPassView("unused-account")).canClaim, true);
  }
  // A selected projection stays frozen after kickoff, even if upstream rows change.
  await pool.query("UPDATE games SET status='live', starts_at=clock_timestamp()-interval '1 minute' WHERE id='one'");
  assert.equal((await runtime.claimProjectionPass("account-a", "one")).projection.expectedHomeScore, 24);
  const view = await runtime.getProjectionPassView("account-a");
  assert.ok(view.games.every(g => !("homeWinProbability" in g) && !("projectedSpread" in g)));
  // Use one timestamp expression, preserving the exact 24-hour constraint.
  await pool.query("UPDATE projection_passes SET claimed_at=t.n-interval '25 hours', expires_at=t.n-interval '1 hour' FROM (SELECT clock_timestamp() n) t WHERE user_id='account-a'");
  assert.equal((await runtime.getProjectionPassView("account-a")).projection, null);
  assert.equal((await runtime.claimProjectionPass("account-a", "two")).gameId, "two");
  // Started while a claim waits on a fixture lock: no grant is written.
  const kickoff = new Date(Date.now() + 150);
  await fixture("kickoff-race", "upcoming", kickoff);
  const lock = await pool.connect(); await lock.query("BEGIN");
  await lock.query("SELECT id FROM games WHERE id='kickoff-race' FOR UPDATE");
  const attempt = runtime.claimProjectionPass("race-account", "kickoff-race");
  setTimeout(() => void lock.query("COMMIT").finally(() => lock.release()), 300);
  await assert.rejects(attempt, { code: "GAME_STARTED" });
  assert.equal((await runtime.getProjectionPassView("race-account")).canClaim, true);
  console.log("PASS: disposable PostgreSQL — atomic concurrent claims, 24h expiry/renewal, idempotence, cross-account isolation, live-game freeze, missing projection, kickoff race, schedule allowlist.");
} finally {
  if (pool) await pool.end();
  delete globalThis.__projectionPassTestPool;
  if (started) execFileSync("pg_ctl", ["-D", join(tmp, "data"), "-m", "immediate", "-w", "stop"], { env, stdio: "pipe" });
  rmSync(tmp, { recursive: true, force: true });
}
