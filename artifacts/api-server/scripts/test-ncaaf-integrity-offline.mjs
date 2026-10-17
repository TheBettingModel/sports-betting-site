import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, realpathSync } from "node:fs";

if (process.argv.length !== 2) throw new Error("No custom scripts or flags are accepted.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "package.json"));
const vitest = require.resolve("vitest/package.json");
if (JSON.parse(readFileSync(vitest, "utf8")).version !== "4.1.10") throw new Error("Pinned offline runner version mismatch.");
const compilerRequire = createRequire(require.resolve("esbuild/package.json"));
const env = {
  PATH: process.env.PATH ?? "", HOME: resolve(root, "tmp/ncaaf-integrity-home"), TMPDIR: "/tmp",
  NODE_ENV: "test", SCHEDULER_ENABLED: "false", NCAAF_INTEGRITY_OFFLINE: "true", CI: "true", NO_COLOR: "1",
  // Reuse the existing general I/O guard, not NFL model validation or equations.
  NFL_OFFLINE_ESBUILD_BIN: realpathSync(compilerRequire.resolve(`@esbuild/${process.platform}-${process.arch}/bin/esbuild`)),
};
console.log("NCAA integrity offline: credentials removed, database/network/startup blocked; no model artifact writes.");
const child = spawnSync(process.execPath, [
  "--import", resolve(root, "test/nfl-offline/guard.mjs"),
  resolve(dirname(vitest), "vitest.mjs"), "run", "--configLoader", "native",
  "--config", resolve(root, "vitest.ncaaf-integrity.config.mjs"),
], { cwd: root, env, stdio: "inherit" });
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
