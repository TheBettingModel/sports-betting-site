#!/usr/bin/env node
/**
 * check-spec-coverage.mjs
 *
 * Validates that every mobile-facing API route in the server is documented in
 * lib/api-spec/openapi.yaml. Run this before codegen or in CI to catch new
 * endpoints that were added to the server but not to the spec.
 *
 * Exit 0 = all covered. Exit 1 = gaps found.
 *
 * Usage:
 *   node lib/api-spec/scripts/check-spec-coverage.mjs
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..", "..");

// ── Routes that are intentionally excluded from the spec ─────────────────────
// Admin / internal / server-to-server routes don't need typed mobile hooks.
const EXCLUDED_ROUTE_FILES = new Set([
  "admin.ts",
  "analytics.ts",
  "features.ts",
  "model-registry.ts",
  "webhooks.ts",
  "clerk-proxy.ts",   // internal proxy, no JSON response schema
  "index.ts",
  "push-tokens.test.ts",
]);

// Static HTML endpoints — not JSON, no codegen needed.
const EXCLUDED_PATHS = new Set(["/privacy", "/terms"]);

// ── Extract routes from a route file ────────────────────────────────────────

function extractRoutes(filePath) {
  const src = readFileSync(filePath, "utf8");
  const routes = [];
  // Match: router.get("/path", ...) or router.post("/path", ...)
  const re = /router\.(get|post|put|patch|delete)\(\s*["'`](\/[^"'`]*?)["'`]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    routes.push({ method: m[1].toUpperCase(), path: m[2] });
  }
  return routes;
}

// ── Extract paths from the OpenAPI spec ─────────────────────────────────────
// Simple YAML line-based parse — avoids importing a YAML library.

function extractSpecPaths(yamlPath) {
  const lines = readFileSync(yamlPath, "utf8").split("\n");
  const paths = new Set();
  let inPaths = false;
  for (const line of lines) {
    if (line.startsWith("paths:")) { inPaths = true; continue; }
    if (inPaths && /^components:/.test(line)) break;
    if (inPaths) {
      const m = line.match(/^  (\/[^\s:]+):/);
      if (m) paths.add(m[1]);
    }
  }
  return paths;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const routesDir = resolve(root, "artifacts", "api-server", "src", "routes");
const specPath  = resolve(root, "lib", "api-spec", "openapi.yaml");

const specPaths = extractSpecPaths(specPath);
const routeFiles = readdirSync(routesDir).filter(
  (f) => f.endsWith(".ts") && !EXCLUDED_ROUTE_FILES.has(f),
);

const missing = [];

for (const file of routeFiles) {
  const routes = extractRoutes(resolve(routesDir, file));
  for (const { method, path } of routes) {
    // Normalise path params: /models/:id → /models/{id}
    const normalised = path.replace(/:([a-zA-Z_]+)/g, "{$1}");
    if (!EXCLUDED_PATHS.has(normalised) && !specPaths.has(normalised)) {
      missing.push({ file, method, path: normalised });
    }
  }
}

if (missing.length === 0) {
  console.log("✅ All mobile-facing routes are documented in openapi.yaml");
  process.exit(0);
} else {
  console.error("❌ The following routes are NOT in openapi.yaml:\n");
  for (const { file, method, path } of missing) {
    console.error(`   ${method.padEnd(6)} ${path.padEnd(40)}  (${file})`);
  }
  console.error(
    "\nAdd these paths to lib/api-spec/openapi.yaml, then run: pnpm --filter @workspace/api-spec codegen",
  );
  process.exit(1);
}
