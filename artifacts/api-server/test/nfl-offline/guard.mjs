import { createRequire, syncBuiltinESMExports } from "node:module";
import { realpathSync } from "node:fs";

const require = createRequire(import.meta.url);
const key = Symbol.for("tbm.nfl.offline.guard");
export const state = globalThis[key] ??= { installed: false, expected: 0, attempts: [] };

export function deny(kind) {
  state.attempts.push({ kind, expected: state.expected > 0 });
  throw new Error(`NFL_OFFLINE_BLOCKED:${kind}`);
}

export function expectedBlock(fn) {
  state.expected++;
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.finally(() => { state.expected--; });
    }
    state.expected--;
    return result;
  } catch (error) {
    state.expected--;
    throw error;
  }
}

export function assertSafeImport(source) {
  const normalized = source.replaceAll("\\", "/").replace(/[?#].*$/, "");
  if (/^(pg(?:-pool|-native)?|postgres|@neondatabase\/serverless|node-cron)(?:\/|$)/.test(normalized)
    || normalized === "drizzle-orm/node-postgres"
    || /\/(?:src\/(?:index|app)|src\/routes\/index)\.[cm]?[jt]s$/.test(normalized)
    || /\/services\/(?:scheduler|grading-runner|nflV4Prospective|v4FullSlate|v4EngineBootstrap241)(?:\.[cm]?[jt]s)?$/.test(normalized)
    || /\/scripts\/run-(?:cloud-pipeline-once|preview-market-evidence-capture)/.test(normalized)
    || /\/middleware\/previewProjectionProxy(?:\.[cm]?[jt]s)?$/.test(normalized)) {
    throw new Error("NFL_OFFLINE_FORBIDDEN_IMPORT");
  }
}

if (!state.installed) {
  state.installed = true;
  // Vite's TS transformer needs its pinned local compiler service, not arbitrary
  // Node/application subprocesses. It receives only the sanitized child env.
  const child = require("node:child_process");
  const originalSpawn = child.spawn;
  const compiler = process.env.NFL_OFFLINE_ESBUILD_BIN;
  child.spawn = (file, args = [], options) => {
    let allowed = false;
    try {
      allowed = Boolean(compiler) && realpathSync(file) === compiler
        && args.length === 2 && /^--service=\d+\.\d+\.\d+$/.test(args[0]) && args[1] === "--ping";
    } catch { /* Not the approved compiler executable. */ }
    if (!allowed) return deny("node:child_process.spawn");
    return originalSpawn(file, args, options);
  };
  for (const [name, methods] of [
    ["node:net", ["connect", "createConnection"]],
    ["node:tls", ["connect"]],
    ["node:http", ["request", "get"]],
    ["node:https", ["request", "get"]],
    ["node:http2", ["connect"]],
    ["node:dgram", ["createSocket"]],
    ["node:dns", ["lookup", "lookupService", "resolve", "resolve4", "resolve6", "reverse"]],
    ["node:dns/promises", ["lookup", "lookupService", "resolve", "resolve4", "resolve6", "reverse"]],
    ["node:child_process", ["spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]],
  ]) {
    const mod = require(name);
    for (const method of methods) mod[method] = () => deny(`${name}.${method}`);
  }
  const net = require("node:net");
  net.Socket.prototype.connect = () => deny("socket.connect");
  net.Server.prototype.listen = () => deny("server.listen");
  globalThis.fetch = () => deny("fetch");
  globalThis.WebSocket = class { constructor() { deny("WebSocket"); } };
  syncBuiltinESMExports();
}
