import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, realpathSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "package.json"));
if (process.argv.length !== 2) throw new Error("This offline runner accepts no additional scripts, filters, or flags.");
const vitestPackage = require.resolve("vitest/package.json");
const installed = JSON.parse(readFileSync(vitestPackage, "utf8"));
const lock = readFileSync(resolve(root, "../../pnpm-lock.yaml"), "utf8");
if (installed.version !== "4.1.10" || !lock.includes("vitest@4.1.10")) {
  throw new Error("Offline dependency mismatch; do not install into or change the main workspace.");
}
const esbuildRequire = createRequire(require.resolve("esbuild/package.json"));
const compiler = realpathSync(esbuildRequire.resolve(`@esbuild/${process.platform}-${process.arch}/bin/esbuild`));
const env = {
  PATH: process.env.PATH ?? "",
  HOME: resolve(root, "tmp/nfl-offline-home"),
  TMPDIR: "/tmp",
  NODE_ENV: "test",
  SCHEDULER_ENABLED: "false",
  NFL_OFFLINE_ONLY: "true",
  CI: "true",
  NO_COLOR: "1",
  NFL_OFFLINE_ESBUILD_BIN: compiler,
};
console.log("NFL OFFLINE ONLY: no database, no HTTP, no API startup, no forecast collection.");
console.log(`Vitest ${installed.version}; explicit thirteen-file allowlist; credentials removed.`);
const child = spawnSync(process.execPath, [
  "--import", resolve(root, "test/nfl-offline/guard.mjs"),
  resolve(dirname(vitestPackage), "vitest.mjs"),
  "run", "--configLoader", "native", "--config", resolve(root, "vitest.nfl-offline.config.mjs"),
], { cwd: root, env, stdio: "inherit" });
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
