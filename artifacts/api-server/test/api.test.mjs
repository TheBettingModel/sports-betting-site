/**
 * Focused API tests for the Model Registry and Feature Store.
 *
 * Tests:
 *   - Status transition rules (valid paths, invalid paths, terminal states)
 *   - Master-approval gating for production and retired transitions
 *   - Incumbent auto-retirement on promotion to production
 *   - Rollback behaviour and audit trail completeness
 *   - Metadata update (allowed statuses / forbidden statuses)
 *   - Archive (soft-delete) semantics
 *   - Feature store CRUD and auto-versioning
 *   - Analytics and calibration endpoints
 *
 * Run: node artifacts/api-server/test/api.test.mjs
 * Requires the API server to be running on http://localhost:8080
 */

const BASE = "http://localhost:8080";
let passed = 0;
let failed = 0;

// ── Test harness ──────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

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

// ── Cleanup helpers ───────────────────────────────────────────────────────────

// IDs created during the test run — used to clean up at the end
const createdModelIds = [];
const createdFeatureIds = [];

// ── Tests ─────────────────────────────────────────────────────────────────────

section("Model Registry — Create");

const { status: s1, data: mv1 } = await api("POST", "/api/models", {
  modelId: `test-mlb-moneyline-v99-${Date.now()}`,
  sport: "MLB",
  market: "moneyline",
  notes: "Test model",
  hyperparameters: { alpha: 0.3 },
});
assert("POST /api/models returns 201", s1 === 201);
assert("Created version has status=development", mv1?.status === "development");
assert("Created version has correct sport", mv1?.sport === "MLB");
createdModelIds.push(mv1?.id);

// ── Transition: development → challenger ──────────────────────────────────────
section("Model Registry — Valid Status Transitions");

const { status: s2, data: mv2 } = await api("PATCH", `/api/models/${mv1.id}/status`, {
  newStatus: "challenger",
  performedBy: "test-agent",
});
assert("dev → challenger succeeds", s2 === 200);
assert("Status is now challenger", mv2?.status === "challenger");

const { status: s3, data: mv3 } = await api("PATCH", `/api/models/${mv1.id}/status`, {
  newStatus: "approved",
  performedBy: "test-agent",
});
assert("challenger → approved succeeds", s3 === 200);
assert("Status is now approved", mv3?.status === "approved");

// Transition to production requires masterApproved
const { status: s4a } = await api("PATCH", `/api/models/${mv1.id}/status`, {
  newStatus: "production",
  performedBy: "test-agent",
  masterApproved: false,
});
assert("approved → production without masterApproved is rejected (non-200)", s4a !== 200, `got ${s4a}`);

const { status: s4b, data: mv4 } = await api("PATCH", `/api/models/${mv1.id}/status`, {
  newStatus: "production",
  performedBy: "test-agent",
  masterApproved: true,
  approvedBy: "admin",
});
assert("approved → production WITH masterApproved succeeds", s4b === 200, `got ${s4b}`);
assert("Status is now production", mv4?.status === "production");
assert("deployedAt is set", mv4?.deployedAt != null);

// ── Incumbent auto-retirement ─────────────────────────────────────────────────
section("Model Registry — Incumbent Auto-Retirement");

// Create a second MLB model and promote it
const { data: mv5 } = await api("POST", "/api/models", {
  modelId: `test-mlb-moneyline-v100-${Date.now()}`,
  sport: "MLB",
  market: "moneyline",
  notes: "Second test model",
});
createdModelIds.push(mv5?.id);

await api("PATCH", `/api/models/${mv5.id}/status`, { newStatus: "challenger", performedBy: "test" });
await api("PATCH", `/api/models/${mv5.id}/status`, { newStatus: "approved", performedBy: "test" });
const { data: mv5prod } = await api("PATCH", `/api/models/${mv5.id}/status`, {
  newStatus: "production", performedBy: "test", masterApproved: true,
});
assert("Second model promoted to production", mv5prod?.status === "production");

// The first model should now be retired
const { data: mv1check } = await api("GET", `/api/models/${mv1.id}`);
assert("First model auto-retired on promotion of second", mv1check?.status === "retired", `got ${mv1check?.status}`);

// ── Rollback ──────────────────────────────────────────────────────────────────
section("Model Registry — Rollback");

// Rollback requires masterApproved
const { status: rbNoAuth } = await api("POST", `/api/models/${mv5.id}/rollback`, {
  performedBy: "test",
  masterApproved: false,
});
assert("Rollback without masterApproved is rejected", rbNoAuth !== 200, `got ${rbNoAuth}`);

const { status: rbOk, data: rbResult } = await api("POST", `/api/models/${mv5.id}/rollback`, {
  performedBy: "test-admin",
  masterApproved: true,
  notes: "Testing rollback",
});
assert("Rollback with masterApproved succeeds", rbOk === 200, `got ${rbOk}`);
assert("Rollback retires current production", rbResult?.retired?.status === "retired" || rbResult?.retired?.id === mv5.id, `retired: ${JSON.stringify(rbResult?.retired)}`);
assert("Rollback restores target to production", rbResult?.restored?.status === "production");
assert("Restored model is the original (mv1)", rbResult?.restored?.id === mv1.id);

// ── Audit history completeness ────────────────────────────────────────────────
section("Model Registry — Audit History");

const { data: hist1 } = await api("GET", `/api/models/${mv1.id}/history`);
assert("Model history endpoint returns events", hist1?.count > 0, `count=${hist1?.count}`);

const actions = hist1?.history?.map((h) => h.action) ?? [];
assert("History contains 'create' event", actions.includes("create"), `actions: ${actions.join(",")}`);
assert("History contains 'deploy' or 'rollback_restore' event",
  actions.some((a) => a === "deploy" || a === "rollback_restore" || a === "auto_retire"),
  `actions: ${actions.join(",")}`
);

// ── Invalid transitions ───────────────────────────────────────────────────────
section("Model Registry — Invalid Transitions (should all fail)");

// Terminal state — can't transition from retired
const { status: retiredTransition } = await api("PATCH", `/api/models/${mv5.id}/status`, {
  newStatus: "production",
  performedBy: "test",
  masterApproved: true,
});
assert("Transition from retired → production is rejected", retiredTransition !== 200, `got ${retiredTransition}`);

// Can't skip steps (development → production)
const { data: jumpMv } = await api("POST", "/api/models", {
  modelId: `test-jump-${Date.now()}`,
  sport: "NFL",
  market: "spread",
});
createdModelIds.push(jumpMv?.id);
const { status: jumpStatus } = await api("PATCH", `/api/models/${jumpMv.id}/status`, {
  newStatus: "production",
  performedBy: "test",
  masterApproved: true,
});
assert("Direct development → production is rejected", jumpStatus !== 200, `got ${jumpStatus}`);

// Retire the jump model cleanly via archive
await api("DELETE", `/api/models/${jumpMv.id}`, { performedBy: "test" });

// ── Metadata update ───────────────────────────────────────────────────────────
section("Model Registry — Metadata Update (PUT /api/models/:id)");

// mv1 is now restored to production — updating production should be forbidden
const { status: putProd } = await api("PUT", `/api/models/${mv1.id}`, {
  notes: "Trying to update production model",
});
assert("Cannot update metadata on production model", putProd !== 200, `got ${putProd}`);

// Create a dev model, update it, verify
const { data: devMv } = await api("POST", "/api/models", {
  modelId: `test-dev-update-${Date.now()}`,
  sport: "NBA",
  market: "total",
  notes: "Before update",
});
createdModelIds.push(devMv?.id);

const { status: putDev, data: putResult } = await api("PUT", `/api/models/${devMv.id}`, {
  notes: "After update",
  hyperparameters: { lr: 0.001, epochs: 100 },
});
assert("Can update metadata on development model", putDev === 200, `got ${putDev}`);
assert("Notes updated correctly", putResult?.notes === "After update");
assert("Hyperparameters updated", putResult?.hyperparameters?.lr === 0.001);

// ── Archive (DELETE) ──────────────────────────────────────────────────────────
section("Model Registry — Archive / Soft-Delete");

const { status: archOk, data: archResult } = await api("DELETE", `/api/models/${devMv.id}`, {
  performedBy: "test",
  reason: "Obsolete test model",
});
assert("DELETE /api/models/:id succeeds for dev model", archOk === 200, `got ${archOk}`);
assert("Archived model has status=rejected", archResult?.status === "rejected");

// Can't delete a production model
const { status: archProdFail } = await api("DELETE", `/api/models/${mv1.id}`, {
  performedBy: "test",
});
assert("Cannot archive a production model", archProdFail !== 200, `got ${archProdFail}`);

// ── Feature Store — CRUD ──────────────────────────────────────────────────────
section("Feature Store — Create & Auto-versioning");

const { status: f1s, data: f1 } = await api("POST", "/api/features", {
  name: `test_feature_${Date.now()}`,
  source: "espn",
  description: "Version 1",
  dataType: "float",
});
assert("POST /api/features returns 201", f1s === 201, `got ${f1s}`);
assert("First version is v1", f1?.version === 1);
createdFeatureIds.push(f1?.id);

const { status: f2s, data: f2 } = await api("POST", "/api/features", {
  name: f1.name,
  source: "espn",
  description: "Version 2",
});
assert("Second registration auto-increments to v2", f2s === 201 && f2?.version === 2, `got v${f2?.version}`);
createdFeatureIds.push(f2?.id);

section("Feature Store — Versions List");
const { data: fVersions } = await api("GET", `/api/features/${f1.name}/versions`);
assert("Versions endpoint returns both versions", fVersions?.count === 2, `count=${fVersions?.count}`);
assert("Versions are ordered newest first", fVersions?.versions?.[0]?.version === 2);

section("Feature Store — Update (PUT)");
const { status: fPutS, data: fPutD } = await api("PUT", `/api/features/${f1.id}`, {
  description: "Updated description",
  calculationMethod: "ema(x, 0.3)",
});
assert("PUT /api/features/:id returns 200", fPutS === 200, `got ${fPutS}`);
assert("Description updated", fPutD?.description === "Updated description");
assert("name unchanged (immutable)", fPutD?.name === f1.name);
assert("version unchanged (immutable)", fPutD?.version === 1);

section("Feature Store — Soft Delete (DELETE)");
const { status: fDelS, data: fDelD } = await api("DELETE", `/api/features/${f1.id}`);
assert("DELETE /api/features/:id returns 200", fDelS === 200, `got ${fDelS}`);
assert("Feature is marked inactive", fDelD?.isActive === false);

// Deleted feature still exists (read still works)
const { status: fReadS, data: fReadD } = await api("GET", `/api/features/${f1.id}`);
assert("Deleted feature still readable (soft delete)", fReadS === 200 && fReadD?.id === f1.id);
assert("isActive is false", fReadD?.isActive === false);

// ── Analytics endpoints ───────────────────────────────────────────────────────
section("Analytics Endpoints");

const { status: perfS, data: perfD } = await api("GET", "/api/analytics/performance");
assert("GET /api/analytics/performance returns 200", perfS === 200);
assert("Response has metrics array", Array.isArray(perfD?.metrics));

const { status: calS, data: calD } = await api("GET", "/api/analytics/calibration?modelVersionId=1");
assert("GET /api/analytics/calibration returns 200", calS === 200);
assert("Response has 10 buckets", calD?.buckets?.length === 10);
assert("Response has brierScore", typeof calD?.brierScore === "number");

const { status: calBadS } = await api("GET", "/api/analytics/calibration");
assert("Calibration without modelVersionId returns 400", calBadS === 400);

const { status: refS, data: refD } = await api("POST", "/api/analytics/refresh");
assert("POST /api/analytics/refresh returns 200", refS === 200);
assert("Response has rowsWritten", typeof refD?.rowsWritten === "number");

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("Some tests failed.");
  process.exit(1);
} else {
  console.log("All tests passed ✓");
}
