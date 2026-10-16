import { describe, expect, it } from "vitest";
import frozen from "../../../../model-artifacts/v4/nfl-v4-core.json";
import { compareNflHistoricalReplay } from "./historical-replay";
import { syntheticBundle } from "./bundle-fixtures";
import { loadNflHistoricalBundle, nflBundleSha256, nflInventorySha256 } from "../../src/services/nflHistoricalBundle";
import type { NflV4Artifact } from "../../src/services/nflV4";

const artifact = frozen as unknown as NflV4Artifact;
async function setup() {
  const f = syntheticBundle();
  Object.assign(f.manifest, { artifactHash: artifact.artifactHash, frozenSeedBoundary: artifact.historySeed.asOf });
  Object.assign(f.context, { artifactHash: artifact.artifactHash, frozenSeedBoundary: artifact.historySeed.asOf });
  Object.assign(f.input, { frozenSeedBoundary: artifact.historySeed.asOf });
  f.rebuild();
  const windows: { path: string; sha256: string }[] = [];
  const required: string[] = [];
  let cursor = Date.parse(artifact.historySeed.asOf);
  const end = Date.parse(f.input.verificationAsOf);
  while (cursor < end) {
    const to = Math.min(cursor + 35 * 86_400_000, end);
    // Deliberately fictional fixtures in EVERY interval, including offseason.
    // Native empty-inventory proof is blocked, not waived for real coverage.
    const window = structuredClone(f.input);
    const date = new Date(cursor + 86_400_000).toISOString();
    const season = Date.parse(date) < Date.parse("2026-07-01T00:00:00Z") ? 2025 : 2026;
    const id = String(900000100 + windows.length); required.push(id);
    Object.assign(window.bounds, { seasons: [season],
      fromInclusive: new Date(cursor).toISOString(), toExclusive: new Date(to).toISOString() });
    const records = [
      ...window.observations.flatMap(o => [o.candidateEvidence!, ...o.references]),
      ...window.schedule.flatMap(s => [s.primary!, ...s.references]),
    ];
    for (const r of records) {
      const event = JSON.parse(r.rawEventJson);
      Object.assign(event, { id, date }); event.season.year = season;
      Object.assign(event.competitions[0], { id, date });
      Object.assign(r, { evidenceId: `window-${windows.length}-${r.evidenceId}`, rawEventJson: JSON.stringify(event) });
    }
    Object.assign(window.observations[0]!.observation, { event: JSON.parse(window.observations[0]!.candidateEvidence!.rawEventJson) });
    Object.assign(window.catalogs, { captures: window.catalogs.captures.map(c => {
      const evidenceId = `window-${windows.length}-${c.evidenceId}`;
      const r = records.find(r => r.evidenceId === evidenceId)!;
      return { ...c, evidenceId, sha256: nflBundleSha256(r.rawEventJson) };
    }) });
    const body = JSON.stringify(window), path = `bundle-inputs/replay-${windows.length}.json`;
    f.files.set(path, body); windows.push({ path, sha256: nflBundleSha256(body) });
    cursor = to;
  }
  Object.assign(f.manifest, { windows, requiredFinalEventIds: required });
  const text = JSON.stringify(f.manifest); Object.assign(f.approval, {
    manifestSha256: nflBundleSha256(text), inventorySha256: nflInventorySha256(required) });
  const synthetic = await loadNflHistoricalBundle(text, f.read, f.context);
  expect(synthetic.status, JSON.stringify(synthetic.reasons)).toBe("READY_FOR_OFFLINE_REPLAY");
  return { f, synthetic, args: { artifact, event: { id: "900000099", homeTeamId: "12",
    awayTeamId: "7", startsAt: f.context.targetKickoff }, legacyHistory: synthetic.history,
    bundle: synthetic, now: f.context.now } };
}
describe("same frozen NFL V4 engine, offline in-memory availability proposal", () => {
  it("identical history gives identical scores and probabilities without changing the frozen artifact", async () => {
    const { args } = await setup(), before = JSON.stringify(artifact);
    const report = await compareNflHistoricalReplay(args);
    expect(report.delta).toEqual({ expectedHomeScore: 0, expectedAwayScore: 0, homeWinProbability: 0 });
    expect(report.legacy.input.dataCutoff).not.toBe(report.verified.input.dataCutoff);
    expect(report.verified.input.dataCutoff).toBe(args.bundle.verificationAsOf);
    expect(report).toMatchObject({ persistenceAuthorized: false, productionActivationAuthorized: false });
    expect(JSON.stringify(artifact)).toBe(before);
  });
  it("demonstrates a synthetic 0–0 correction without changing equations or historical forecasts", async () => {
    const { args } = await setup();
    const bad = args.legacyHistory.map(h => ({ ...h, homeScore: 0, awayScore: 0 }));
    const report = await compareNflHistoricalReplay({ ...args, legacyHistory: bad });
    console.log("SYNTHETIC ONLY / SAME FROZEN ARTIFACT", JSON.stringify({
      artifactHash: report.artifactHash, legacyHome: report.legacy.output.expectedHomeScore,
      verifiedHome: report.verified.output.expectedHomeScore,
      legacyAway: report.legacy.output.expectedAwayScore, verifiedAway: report.verified.output.expectedAwayScore,
      legacyHomeWin: report.legacy.output.homeWinProbability, verifiedHomeWin: report.verified.output.homeWinProbability,
    }));
    expect(Math.abs(report.delta.expectedHomeScore) + Math.abs(report.delta.homeWinProbability)).toBeGreaterThan(0);
    expect(report.label).toBe("OFFLINE_COMPARISON_NOT_HISTORICAL_PERFORMANCE");
    expect(bad[0]!.homeScore).toBe(0);
  });
  it("demonstrates missing-fixture impact using synthetic history only", async () => {
    const { args } = await setup();
    const report = await compareNflHistoricalReplay({ ...args, legacyHistory: [] });
    expect(report.verified.input.featureHash).not.toBe(report.legacy.input.featureHash);
  });
  it("rejects non-ready bundles rather than replaying partial/seed-only fallback", async () => {
    const { args } = await setup();
    await expect(compareNflHistoricalReplay({ ...args, bundle: { ...args.bundle, status: "INCOMPLETE" } })).rejects.toThrow("BUNDLE_NOT_READY");
  });
  it("does not use October evidence for a September replay", async () => {
    const { args } = await setup();
    await expect(compareNflHistoricalReplay({ ...args, now: "2026-09-28T17:00:00Z" })).rejects.toThrow("BUNDLE_NOT_AVAILABLE");
  });
  it("rejects post-kickoff replay", async () => {
    const { args } = await setup();
    await expect(compareNflHistoricalReplay({ ...args, now: args.event.startsAt })).rejects.toThrow("INVALID_REPLAY_CONTEXT");
  });
  it("validates the actual artifact hash", async () => {
    const { args } = await setup();
    await expect(compareNflHistoricalReplay({ ...args, artifact: { ...artifact, artifactHash: "0".repeat(64) } })).rejects.toThrow("REPLAY_BUNDLE_BINDING_MISMATCH");
    await expect(compareNflHistoricalReplay({ ...args, artifact: { ...artifact, trainedAt: "2000-01-01T00:00:00Z" } })).rejects.toThrow("ARTIFACT_HASH_MISMATCH");
  });
  it("rejects reuse after the bundle expires", async () => {
    const { args } = await setup();
    await expect(compareNflHistoricalReplay({ ...args, now: args.bundle.validUntil! })).rejects.toThrow("REPLAY_BUNDLE_STALE");
  });
  it("fails closed when the proposed availability field is missing", async () => {
    const { createNflV4Engine } = await import("virtual:nfl-verified-replay");
    const engine = createNflV4Engine(artifact);
    await expect(engine.materializeInput({ event: { id: "900000099", homeTeamId: "12", awayTeamId: "7",
      startsAt: new Date("2026-10-04T17:00:00Z") }, history: [{ id: "900000001",
      homeTeamId: "12", awayTeamId: "7", startsAt: new Date("2026-09-27T17:00:00Z"), homeScore: 31, awayScore: 10 }] },
    new Date("2026-09-28T19:00:00Z"))).rejects.toThrow("VERIFIED_HISTORY_AVAILABILITY_REQUIRED");
  });
});
