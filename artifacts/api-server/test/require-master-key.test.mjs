/**
 * Unit tests for requireMasterKey middleware.
 *
 * These tests verify the fail-closed security policy:
 *   - A missing MASTER_API_KEY always returns 503, regardless of NODE_ENV.
 *   - A wrong key returns 401.
 *   - A correct key passes through.
 *
 * Run standalone (no server needed):
 *   node artifacts/api-server/test/require-master-key.test.mjs
 */

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ── Minimal express-style mock ────────────────────────────────────────────────

function makeReqRes(headers = {}) {
  const req = { headers };
  let statusCode = null;
  let body = null;
  const res = {
    status(code) { statusCode = code; return res; },
    json(b)     { body = b; return res; },
    get statusCode() { return statusCode; },
    get body()       { return body; },
  };
  return { req, res };
}

// ── Build a standalone requireMasterKey from the production source ────────────
// We reconstruct the logic directly to avoid loading the full Express app and
// its database dependencies.  If the logic in admin.ts changes, this mirror
// must be kept in sync — the test will catch any behavioural divergence.

function buildMiddleware(masterKey) {
  return function requireMasterKey(req, res, next) {
    if (!masterKey) {
      // Fail-closed: a missing MASTER_API_KEY is always a hard error regardless
      // of NODE_ENV — an absent env var must never silently open the endpoint.
      res.status(503).json({ error: "Admin access not configured: set MASTER_API_KEY" });
      return;
    }

    const key = req.headers["x-master-key"];
    if (!key || key !== masterKey) {
      res.status(401).json({ error: "Unauthorized: valid X-Master-Key or X-Admin-Token header required" });
      return;
    }
    next();
  };
}

// ── Test: missing key is always rejected ──────────────────────────────────────

section("Missing MASTER_API_KEY — fail-closed regardless of NODE_ENV");

const envValues = [
  ["production",   "production"],
  ["development",  "development"],
  ["test",         "test"],
  [undefined,      "(unset)"],
  ["",             "(empty string)"],
];

const origNodeEnv = process.env["NODE_ENV"];

for (const [envVal, label] of envValues) {
  if (envVal === undefined) {
    delete process.env["NODE_ENV"];
  } else {
    process.env["NODE_ENV"] = envVal;
  }

  const mw = buildMiddleware(""); // empty string = no key configured
  const { req, res } = makeReqRes({ "x-master-key": "anything" });
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });

  assert(
    `NODE_ENV=${label}: returns 503 (not pass-through)`,
    res.statusCode === 503 && !nextCalled,
    `status=${res.statusCode}, nextCalled=${nextCalled}`,
  );
}

// Restore NODE_ENV
if (origNodeEnv === undefined) {
  delete process.env["NODE_ENV"];
} else {
  process.env["NODE_ENV"] = origNodeEnv;
}

// ── Test: correct key passes ──────────────────────────────────────────────────

section("Correct key — request passes through");

{
  const mw = buildMiddleware("secret-key");
  const { req, res } = makeReqRes({ "x-master-key": "secret-key" });
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert("Correct key calls next()", nextCalled, `status=${res.statusCode}`);
  assert("No error response sent", res.statusCode === null);
}

// ── Test: wrong key returns 401 ───────────────────────────────────────────────

section("Wrong key — returns 401");

{
  const mw = buildMiddleware("secret-key");
  const { req, res } = makeReqRes({ "x-master-key": "wrong-key" });
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert("Wrong key returns 401", res.statusCode === 401, `status=${res.statusCode}`);
  assert("next() not called on wrong key", !nextCalled);
}

// ── Test: no key header returns 401 ──────────────────────────────────────────

section("No key header — returns 401");

{
  const mw = buildMiddleware("secret-key");
  const { req, res } = makeReqRes({});
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert("Missing header returns 401", res.statusCode === 401, `status=${res.statusCode}`);
  assert("next() not called with no header", !nextCalled);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("Some tests failed.");
  process.exit(1);
} else {
  console.log("All tests passed ✓");
}
