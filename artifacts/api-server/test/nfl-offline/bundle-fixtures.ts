import type { NflV4HistoricalInput } from "../../src/services/nflV4HistoricalInput";
import { nflBundleSha256, nflInventorySha256, type NflBundleManifest,
  type NflBundleContext, type NflBundleApproval } from "../../src/services/nflHistoricalBundle";
import { scheduleEvent, scheduleProof } from "./schedule-fixtures";

/** Entirely synthetic; these are NOT recovered fixtures or authentic sources. */
export function syntheticBundle() {
  const seed = "2026-09-07T12:00:00.000Z", asOf = "2026-09-28T18:00:00.000Z";
  const kickoff = "2026-10-04T17:00:00.000Z", observed = "2026-09-28T12:00:00.000Z";
  const scheduled = scheduleEvent();
  const final = structuredClone(scheduled);
  final.status.type = { state: "post", completed: true, name: "STATUS_FINAL" };
  final.competitions[0]!.competitors.forEach(c => { c.score = c.homeAway === "home" ? 31 : 10; });
  const schedule = scheduleProof(scheduled), result = scheduleProof(final, "synthetic independent final");
  const resultIds = new Set([result.primary!.evidenceId, ...result.references.map(r => r.evidenceId)]);
  // Give the final captures separate identities from schedule snapshots.
  const rename = (id: string) => `final-${id}`;
  const input: NflV4HistoricalInput = {
    observations: [{ observation: { event: final, observedAt: observed },
      candidateEvidence: { ...result.primary!, evidenceId: rename(result.primary!.evidenceId) },
      references: result.references.map(r => ({ ...r, evidenceId: rename(r.evidenceId) })) }],
    schedule: [{ primary: schedule.primary, references: schedule.references }],
    catalogs: { sources: schedule.policy.sources,
      captures: [...schedule.policy.captures, ...result.policy.captures.filter(c => resultIds.has(c.evidenceId))
        .map(c => ({ ...c, evidenceId: rename(c.evidenceId), retrievedAt: observed }))] },
    targetKickoff: kickoff, frozenSeedBoundary: seed, verificationAsOf: asOf,
    bounds: { seasons: [2026], weeks: [3], fromInclusive: seed, toExclusive: asOf,
      maxObservations: 16, maxScheduleFixtures: 16, maxInputBytes: 1024 * 1024 },
  };
  const manifest: NflBundleManifest = {
    format: "NFL_V4_HISTORY_BUNDLE_1", datasetId: "synthetic-only", artifactHash: "a".repeat(64),
    frozenSeedBoundary: seed, verificationAsOf: asOf, validUntil: "2026-09-29T12:00:00.000Z",
    requiredFinalEventIds: ["900000001"], windows: [],
  };
  const files = new Map<string, string>();
  const approval: NflBundleApproval = {
    manifestSha256: "", inventorySha256: "", inventoryReviewedAt: asOf,
    refreshDeadline: manifest.validUntil,
    independentInventoryUpstreams: ["schedule-a", "schedule-b"],
    sources: input.catalogs.sources.map(s => ({ ...s, rightsReference: "SYNTHETIC_TEST_ONLY" })),
  };
  const context: NflBundleContext = {
    now: "2026-09-28T19:00:00.000Z", targetKickoff: kickoff,
    artifactHash: manifest.artifactHash, frozenSeedBoundary: seed, approval,
  };
  const rebuild = () => {
    const body = JSON.stringify(input);
    files.set("bundle-inputs/window-1.json", body);
    Object.assign(manifest, { windows: [{ path: "bundle-inputs/window-1.json", sha256: nflBundleSha256(body) }] });
    const text = JSON.stringify(manifest);
    Object.assign(approval, { manifestSha256: nflBundleSha256(text),
      inventorySha256: nflInventorySha256(manifest.requiredFinalEventIds) });
    return text;
  };
  return { input, manifest, approval, context, files, rebuild,
    read: async (path: string) => { const value = files.get(path); if (!value) throw new Error("missing"); return value; } };
}
