import { createHash } from "node:crypto";
import { timestamp, providerId } from "./nflHistoricalResultNormalization";
import { prepareNflV4HistoricalInput, type NflV4HistoricalInput } from "./nflV4HistoricalInput";
import type { NflHistoricalGame } from "./nflV4";

/** Files are supplied through an injected reader. This module never opens files,
 * connects to a database, fetches a provider, or authorizes serving.
 * Authenticity, rights, upstream lineage and exhaustiveness require OUTSIDE review.
 */
export type NflBundleManifest = Readonly<{
  format: "NFL_V4_HISTORY_BUNDLE_1";
  datasetId: string;
  artifactHash: string;
  frozenSeedBoundary: string;
  verificationAsOf: string;
  validUntil: string;
  /** Exhaustive completed regular-season inventory, externally reviewed as of
   * verificationAsOf. NOT inferred from whichever rows were supplied. */
  requiredFinalEventIds: readonly string[];
  windows: readonly { path: string; sha256: string }[];
}>;
export type NflBundleApproval = Readonly<{
  /** Pins are supplied separately by the release reviewer, not read from bundle. */
  manifestSha256: string;
  inventorySha256: string;
  inventoryReviewedAt: string;
  /** Externally reviewed next refresh deadline: at most 24h after the cutoff,
   * and earlier when the next NFL kickoff/status change requires a refresh. */
  refreshDeadline: string;
  independentInventoryUpstreams: readonly string[];
  sources: readonly {
    sourceId: string; upstreamProviderId: string; origin: string; rightsReference: string;
  }[];
}>;
export type NflBundleContext = Readonly<{
  now: string; targetKickoff: string; artifactHash: string; frozenSeedBoundary: string;
  approval: NflBundleApproval | null;
}>;
export type NflBundleReport = Readonly<{
  status: "MISSING" | "INVALID" | "UNAPPROVED" | "STALE" | "INCOMPLETE"
    | "CONFLICTED" | "READY_FOR_OFFLINE_REPLAY";
  reasons: readonly string[];
  datasetId: string | null;
  manifestSha256: string | null;
  artifactHash: string | null;
  frozenSeedBoundary: string | null;
  targetKickoff: string | null;
  validUntil: string | null;
  verificationAsOf: string | null;
  requiredEvents: number;
  verifiedEvents: number;
  missingEventIds: readonly string[];
  unexpectedEventIds: readonly string[];
  history: readonly NflHistoricalGame[];
  sourceAuthenticity: "REQUIRES_EXTERNAL_REVIEW";
  persistenceAuthorized: false;
  liveIntegrationEnabled: false;
  productionActivationAuthorized: false;
}>;
export const nflBundleSha256 = (body: string): string =>
  createHash("sha256").update(body, "utf8").digest("hex");
const sorted = (xs: readonly string[]) => [...xs].sort();
export const nflInventorySha256 = (ids: readonly string[]): string =>
  nflBundleSha256(JSON.stringify(sorted(ids)));
const hash = (x: unknown): x is string => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const safePath = (x: unknown): x is string =>
  typeof x === "string" && /^bundle-inputs\/[a-z0-9][a-z0-9_-]{0,100}\.json$/.test(x);
const flags = { sourceAuthenticity: "REQUIRES_EXTERNAL_REVIEW", persistenceAuthorized: false,
  liveIntegrationEnabled: false, productionActivationAuthorized: false } as const;

/** A failed read/verification returns NO replayable history. Read errors are
 * deliberately not echoed: filesystem errors may contain private paths. */
export async function loadNflHistoricalBundle(
  manifestBody: string | null,
  readApprovedFile: (relativePath: string) => Promise<string>,
  context: NflBundleContext,
): Promise<NflBundleReport> {
  let manifest: NflBundleManifest | null = null;
  let manifestSha256: string | null = null;
  let required: string[] = [];
  let verifiedCount = 0;
  const result = (status: NflBundleReport["status"], reasons: string[],
    history: readonly NflHistoricalGame[] = [], missing: string[] = [], unexpected: string[] = []): NflBundleReport => ({
    status, reasons: sorted([...new Set(reasons)]),
    datasetId: typeof manifest?.datasetId === "string" ? manifest.datasetId : null,
    manifestSha256, verificationAsOf: timestamp(manifest?.verificationAsOf),
    artifactHash: hash(manifest?.artifactHash) ? manifest.artifactHash : null,
    frozenSeedBoundary: timestamp(manifest?.frozenSeedBoundary), targetKickoff: timestamp(context.targetKickoff),
    validUntil: timestamp(manifest?.validUntil),
    requiredEvents: required.length, verifiedEvents: verifiedCount,
    missingEventIds: sorted(missing), unexpectedEventIds: sorted(unexpected),
    history, ...flags,
  });
  if (manifestBody === null) return result("MISSING", ["BUNDLE_MISSING"]);
  if (typeof manifestBody !== "string" || Buffer.byteLength(manifestBody) > 128 * 1024) {
    return result("INVALID", ["MANIFEST_BYTE_LIMIT"]);
  }
  manifestSha256 = nflBundleSha256(manifestBody);
  const approval = context.approval;
  if (!approval || !hash(approval.manifestSha256) || approval.manifestSha256 !== manifestSha256) {
    return result("UNAPPROVED", ["EXTERNAL_MANIFEST_APPROVAL_REQUIRED"]);
  }
  try { manifest = JSON.parse(manifestBody) as NflBundleManifest; }
  catch { return result("INVALID", ["INVALID_MANIFEST_JSON"]); }
  if (!manifest || manifest.format !== "NFL_V4_HISTORY_BUNDLE_1"
    || typeof manifest.datasetId !== "string" || !/^[a-z0-9][a-z0-9_-]{0,100}$/.test(manifest.datasetId)
    || !Array.isArray(manifest.windows) || !manifest.windows.length || manifest.windows.length > 32
    || manifest.windows.some(w => !w || !safePath(w.path) || !hash(w.sha256))
    || new Set(manifest.windows.map(w => w.path)).size !== manifest.windows.length
    || !Array.isArray(manifest.requiredFinalEventIds) || manifest.requiredFinalEventIds.length > 2048
    || manifest.requiredFinalEventIds.some(id => providerId(id) !== id)
    || new Set(manifest.requiredFinalEventIds).size !== manifest.requiredFinalEventIds.length) {
    return result("INVALID", ["INVALID_MANIFEST_SHAPE"]);
  }
  required = sorted(manifest.requiredFinalEventIds);
  const now = timestamp(context.now), target = timestamp(context.targetKickoff);
  const seed = timestamp(manifest.frozenSeedBoundary), expectedSeed = timestamp(context.frozenSeedBoundary);
  const asOf = timestamp(manifest.verificationAsOf), until = timestamp(manifest.validUntil);
  const review = timestamp(approval.inventoryReviewedAt);
  const deadline = timestamp(approval.refreshDeadline);
  if (!now || !target || !seed || !asOf || !until || !review || !deadline || seed !== expectedSeed
    || !hash(context.artifactHash) || manifest.artifactHash !== context.artifactHash
    || !(seed < asOf && asOf <= review && review <= now && now < target && asOf < until
      && until <= deadline && Date.parse(deadline) - Date.parse(asOf) <= 24 * 60 * 60 * 1000)) {
    return result("INVALID", ["BUNDLE_CONTEXT_OR_TIME_MISMATCH"]);
  }
  if (now >= until) return result("STALE", ["BUNDLE_EXPIRED"]);
  if (!Array.isArray(approval.independentInventoryUpstreams)
    || approval.independentInventoryUpstreams.some(p => typeof p !== "string" || !/^[a-z0-9._:-]+$/.test(p))
    || new Set(approval.independentInventoryUpstreams).size < 2
    || approval.inventorySha256 !== nflInventorySha256(required)
    || !Array.isArray(approval.sources) || !approval.sources.length || approval.sources.length > 64
    || approval.sources.some(s => !s || typeof s.rightsReference !== "string" || !s.rightsReference.trim())
    || new Set(approval.sources.map(s => s.sourceId)).size !== approval.sources.length) {
    return result("UNAPPROVED", ["EXHAUSTIVE_INVENTORY_AND_RIGHTS_REVIEW_REQUIRED"]);
  }
  const approvedSources = new Map(approval.sources.map(s => [s.sourceId, s]));
  if (approval.independentInventoryUpstreams.some(p =>
    !approval.sources.some(s => s.upstreamProviderId === p))) {
    return result("UNAPPROVED", ["INVENTORY_UPSTREAM_NOT_APPROVED"]);
  }
  let bytes = 0;
  const windows: NflV4HistoricalInput[] = [];
  for (const file of manifest.windows) {
    let body: string;
    try { body = await readApprovedFile(file.path); }
    catch { return result("INCOMPLETE", ["APPROVED_WINDOW_UNREADABLE"]); }
    if (typeof body !== "string") return result("INVALID", ["WINDOW_NOT_UTF8_TEXT"]);
    bytes += Buffer.byteLength(body);
    if (Buffer.byteLength(body) > 16 * 1024 * 1024 || bytes > 32 * 1024 * 1024) {
      return result("INVALID", ["BUNDLE_BYTE_LIMIT"]);
    }
    if (nflBundleSha256(body) !== file.sha256) return result("INVALID", ["WINDOW_HASH_MISMATCH"]);
    try { windows.push(JSON.parse(body) as NflV4HistoricalInput); }
    catch { return result("INVALID", ["INVALID_WINDOW_JSON"]); }
  }
  try {
    windows.sort((a, b) => String(a?.bounds?.fromInclusive).localeCompare(String(b?.bounds?.fromInclusive)));
    let cursor = seed;
    const history: NflHistoricalGame[] = [];
    const issues: string[] = [];
    const captureBindings = new Map<string, string>();
    for (const window of windows) {
      const from = timestamp(window.bounds?.fromInclusive), to = timestamp(window.bounds?.toExclusive);
      if (from !== cursor || !to || to <= from! || to > asOf
        || timestamp(window.verificationAsOf) !== asOf || timestamp(window.frozenSeedBoundary) !== seed
        || timestamp(window.targetKickoff) !== target) return result("INVALID", ["WINDOW_GAP_OVERLAP_OR_CONTEXT_MISMATCH"]);
      cursor = to;
      if (window.catalogs.sources.some(s => {
        const a = approvedSources.get(s.sourceId);
        return !a || a.origin !== s.origin || a.upstreamProviderId !== s.upstreamProviderId
          || s.reviewStatus !== "APPROVED";
      })) return result("UNAPPROVED", ["SOURCE_NOT_EXTERNALLY_APPROVED"]);
      for (const capture of window.catalogs.captures) {
        const binding = JSON.stringify([capture.sourceId, capture.sourceUrl, capture.sha256,
          capture.retrievedAt, capture.resultPublishedAt ?? null, capture.reviewStatus]);
        const prior = captureBindings.get(capture.evidenceId);
        if (prior && prior !== binding) return result("CONFLICTED", ["CROSS_WINDOW_CAPTURE_ID_CONFLICT"]);
        captureBindings.set(capture.evidenceId, binding);
      }
      const prepared = prepareNflV4HistoricalInput(window);
      if (prepared.status !== "PROCESSED") return result("INVALID", ["INVALID_ADAPTER_WINDOW", ...prepared.reasons]);
      if (prepared.decisions.some(d => d.decision === "QUARANTINED")
        || prepared.coverage?.status === "UNCERTAIN") issues.push("QUARANTINED_OR_UNCERTAIN_HISTORY");
      if (prepared.coverage?.status !== "COMPLETE") issues.push("INCOMPLETE_WINDOW_COVERAGE");
      // Bounds must not hide inconvenient supplied records.
      if (prepared.decisions.some(d => d.reasons.includes("OUTSIDE_EXPLICIT_SCOPE"))
        || prepared.coverage?.counts.outOfScope) issues.push("OUT_OF_SCOPE_WINDOW_RECORD");
      history.push(...prepared.history);
    }
    if (cursor !== asOf) return result("INCOMPLETE", ["POST_SEED_INTERVAL_NOT_FULLY_COVERED"]);
    history.sort((a, b) => a.eventStart.localeCompare(b.eventStart) || a.gameId.localeCompare(b.gameId));
    const seen = new Set(history.map(h => h.gameId)), expected = new Set(required);
    verifiedCount = seen.size;
    if (seen.size !== history.length) return result("CONFLICTED", ["CROSS_WINDOW_DUPLICATE_EVENT"]);
    const missing = required.filter(id => !seen.has(id)), unexpected = [...seen].filter(id => !expected.has(id));
    if (issues.includes("QUARANTINED_OR_UNCERTAIN_HISTORY") || unexpected.length) {
      return result("CONFLICTED", [...issues, ...(unexpected.length ? ["UNEXPECTED_VERIFIED_EVENT"] : [])], [], missing, unexpected);
    }
    if (missing.length || issues.length) return result("INCOMPLETE", [...issues, "REQUIRED_FINAL_COVERAGE_MISSING"], [], missing);
    return result("READY_FOR_OFFLINE_REPLAY", ["READY_UNDER_EXTERNALLY_SUPPLIED_APPROVAL"], history);
  } catch {
    return result("INVALID", ["MALFORMED_WINDOW_OR_APPROVAL"]);
  }
}
