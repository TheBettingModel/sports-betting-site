import { describe, expect, it } from "vitest";
import { loadNflHistoricalBundle, nflBundleSha256 } from "../../src/services/nflHistoricalBundle";
import { syntheticBundle } from "./bundle-fixtures";

describe("file-backed NFL bundle, synthetic approvals only", () => {
  it("loads complete history under separate supplied approval without activating anything", async () => {
    const f = syntheticBundle(), before = JSON.stringify(f.input);
    const report = await loadNflHistoricalBundle(f.rebuild(), f.read, f.context);
    expect(report.status).toBe("READY_FOR_OFFLINE_REPLAY");
    expect(report.history).toHaveLength(1);
    expect(report.history[0]).toMatchObject({ homeScore: 31, awayScore: 10, completedAt: f.input.verificationAsOf });
    expect(report).toMatchObject({ productionActivationAuthorized: false, liveIntegrationEnabled: false,
      persistenceAuthorized: false, sourceAuthenticity: "REQUIRES_EXTERNAL_REVIEW" });
    expect(JSON.stringify(f.input)).toBe(before);
  });
  it("returns missing without attempting a read", async () => {
    const f = syntheticBundle();
    expect((await loadNflHistoricalBundle(null, () => { throw new Error("must not read"); }, f.context)).status).toBe("MISSING");
  });
  it("does not accept self-approved bundles", async () => {
    const f = syntheticBundle(), text = f.rebuild();
    expect((await loadNflHistoricalBundle(text, f.read, { ...f.context, approval: null })).status).toBe("UNAPPROVED");
  });
  it("rejects modified manifest bytes before file reads", async () => {
    const f = syntheticBundle(), text = f.rebuild();
    expect((await loadNflHistoricalBundle(text + " ", () => { throw new Error("no read"); }, f.context)).status).toBe("UNAPPROVED");
  });
  it.each(["../window.json", "/etc/passwd", "bundle-inputs/../x.json", "bundle-inputs/%2e.json",
    "bundle-inputs/a/b.json", "bundle-inputs/window.json?token=secret"])("rejects unsafe path %s", async path => {
    const f = syntheticBundle(); f.rebuild();
    Object.assign(f.manifest, { windows: [{ path, sha256: "b".repeat(64) }] });
    const text = JSON.stringify(f.manifest); Object.assign(f.approval, { manifestSha256: nflBundleSha256(text) });
    expect((await loadNflHistoricalBundle(text, () => { throw new Error("no read"); }, f.context)).status).toBe("INVALID");
  });
  it("does not expose read errors or private paths", async () => {
    const f = syntheticBundle();
    const result = await loadNflHistoricalBundle(f.rebuild(), async () => { throw new Error("/private/credential"); }, f.context);
    expect(result.status).toBe("INCOMPLETE"); expect(JSON.stringify(result)).not.toContain("/private");
  });
  it("rejects changed file bytes", async () => {
    const f = syntheticBundle(), text = f.rebuild();
    f.files.set("bundle-inputs/window-1.json", "{}");
    expect((await loadNflHistoricalBundle(text, f.read, f.context)).reasons).toContain("WINDOW_HASH_MISMATCH");
  });
  it.each(["now", "targetKickoff", "frozenSeedBoundary"])("rejects invalid context timestamp %s", async field => {
    const f = syntheticBundle(), text = f.rebuild();
    expect((await loadNflHistoricalBundle(text, f.read, { ...f.context, [field]: "invalid" })).status).toBe("INVALID");
  });
  it("rejects an artifact different from the approved frozen artifact", async () => {
    const f = syntheticBundle();
    expect((await loadNflHistoricalBundle(f.rebuild(), f.read, { ...f.context, artifactHash: "b".repeat(64) })).status).toBe("INVALID");
  });
  it("rejects expired bundles, including the exact expiry instant", async () => {
    const f = syntheticBundle();
    expect((await loadNflHistoricalBundle(f.rebuild(), f.read, { ...f.context, now: f.manifest.validUntil })).status).toBe("STALE");
  });
  it("does not backdate inventory review or permit future review", async () => {
    for (const review of ["2026-09-27T12:00:00Z", "2026-09-30T12:00:00Z"]) {
      const f = syntheticBundle(); Object.assign(f.approval, { inventoryReviewedAt: review });
      expect((await loadNflHistoricalBundle(f.rebuild(), f.read, f.context)).status).toBe("INVALID");
    }
  });
  it("requires exhaustive inventory approval separate from supplied records", async () => {
    const f = syntheticBundle(), text = f.rebuild();
    Object.assign(f.approval, { inventorySha256: "c".repeat(64) });
    expect((await loadNflHistoricalBundle(text, f.read, f.context)).status).toBe("UNAPPROVED");
  });
  it("requires two independent inventory upstreams, not duplicate labels", async () => {
    const f = syntheticBundle(); Object.assign(f.approval, { independentInventoryUpstreams: ["schedule-a", "schedule-a"] });
    expect((await loadNflHistoricalBundle(f.rebuild(), f.read, f.context)).status).toBe("UNAPPROVED");
  });
  it("requires outside rights approval for every supplied source", async () => {
    const f = syntheticBundle(); Object.assign(f.approval, { sources: f.approval.sources.map(s => ({ ...s, rightsReference: "" })) });
    expect((await loadNflHistoricalBundle(f.rebuild(), f.read, f.context)).status).toBe("UNAPPROVED");
  });
  it("will not accept catalog upstream relabeling", async () => {
    const f = syntheticBundle();
    Object.assign(f.input.catalogs.sources[0]!, { upstreamProviderId: "counterfeit" });
    expect((await loadNflHistoricalBundle(f.rebuild(), f.read, f.context)).status).toBe("UNAPPROVED");
  });
  it("reports missing finals even when the supplied subset is COMPLETE", async () => {
    const f = syntheticBundle(); Object.assign(f.manifest, { requiredFinalEventIds: ["900000001", "900000027", "900000028"] });
    const report = await loadNflHistoricalBundle(f.rebuild(), f.read, f.context);
    expect(report.status).toBe("INCOMPLETE");
    expect(report.missingEventIds).toEqual(["900000027", "900000028"]);
    expect(report.history).toEqual([]);
  });
  it("quarantines unexpected verified finals rather than expanding approved scope", async () => {
    const f = syntheticBundle(); Object.assign(f.manifest, { requiredFinalEventIds: [] });
    const report = await loadNflHistoricalBundle(f.rebuild(), f.read, f.context);
    expect(report.status).toBe("CONFLICTED"); expect(report.unexpectedEventIds).toEqual(["900000001"]);
  });
  it("does not silently drop missing result evidence", async () => {
    const f = syntheticBundle(); Object.assign(f.input.observations[0]!, { references: [] });
    const report = await loadNflHistoricalBundle(f.rebuild(), f.read, f.context);
    expect(report.status).not.toBe("READY_FOR_OFFLINE_REPLAY"); expect(report.history).toEqual([]);
  });
  it("does not turn an empty supplied schedule into independently established absence", async () => {
    const f = syntheticBundle();
    Object.assign(f.input, { observations: [], schedule: [] });
    Object.assign(f.manifest, { requiredFinalEventIds: [] });
    const report = await loadNflHistoricalBundle(f.rebuild(), f.read, f.context);
    expect(report.status).toBe("CONFLICTED");
    expect(report.history).toEqual([]);
  });
  it("reports partial verified counts without returning partial replay history", async () => {
    const f = syntheticBundle(); Object.assign(f.manifest, { requiredFinalEventIds: ["900000001", "900000028"] });
    const report = await loadNflHistoricalBundle(f.rebuild(), f.read, f.context);
    expect(report.verifiedEvents).toBe(1); expect(report.requiredEvents).toBe(2);
    expect(report.history).toEqual([]);
  });
  it("does not allow an arbitrarily long freshness lease", async () => {
    const f = syntheticBundle();
    Object.assign(f.manifest, { validUntil: "2026-10-03T12:00:00Z" });
    Object.assign(f.approval, { refreshDeadline: f.manifest.validUntil });
    expect((await loadNflHistoricalBundle(f.rebuild(), f.read, f.context)).status).toBe("INVALID");
  });
  it("rejects an uncovered interval after the last window", async () => {
    const f = syntheticBundle();
    Object.assign(f.input.bounds, { toExclusive: "2026-09-28T17:00:00Z" });
    expect((await loadNflHistoricalBundle(f.rebuild(), f.read, f.context)).reasons).toContain("POST_SEED_INTERVAL_NOT_FULLY_COVERED");
  });
  it("rejects a gap at the seed boundary", async () => {
    const f = syntheticBundle(); Object.assign(f.input.bounds, { fromInclusive: "2026-09-08T12:00:00Z" });
    expect((await loadNflHistoricalBundle(f.rebuild(), f.read, f.context)).status).toBe("INVALID");
  });
  it.each([null, {}, [], { bounds: null }])("handles malformed windows explicitly (%j)", async value => {
    const f = syntheticBundle(); f.rebuild();
    const body = JSON.stringify(value); f.files.set("bundle-inputs/window-1.json", body);
    Object.assign(f.manifest, { windows: [{ path: "bundle-inputs/window-1.json", sha256: nflBundleSha256(body) }] });
    const text = JSON.stringify(f.manifest); Object.assign(f.approval, { manifestSha256: nflBundleSha256(text) });
    expect((await loadNflHistoricalBundle(text, f.read, f.context)).status).toBe("INVALID");
  });
});
