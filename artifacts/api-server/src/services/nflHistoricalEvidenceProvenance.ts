import { createHash } from "node:crypto";
import { timestamp } from "./nflHistoricalResultNormalization";
import { validateNflHistoricalResult, type NflNormalizedResult } from "./nflHistoricalResultValidation";

/** These catalogs are trusted offline inputs, never assertions from a payload.
 * Their authenticity must be established outside this pure verification layer.
 * Payloads are supplied ESPN-compatible NFL snapshots; no native-provider adapter
 * or live-source authenticity check is implemented here.
 */
export type NflSourceDefinition = Readonly<{
  sourceId: string; upstreamProviderId: string; origin: string;
  sport: "NFL"; reviewStatus: "APPROVED" | "UNREVIEWED";
}>;
export type NflCaptureManifest = Readonly<{
  evidenceId: string; sourceId: string; sourceUrl: string;
  sha256: string; retrievedAt: string; resultPublishedAt?: string;
  reviewStatus: "APPROVED" | "UNREVIEWED";
}>;
export type NflEvidencePolicy = Readonly<{
  sources: readonly NflSourceDefinition[];
  captures: readonly NflCaptureManifest[];
}>;
export type NflEvidenceRecord = Readonly<{ evidenceId: string; rawEventJson: string }>;
export type NflEvidenceReason =
  | "INVALID_POLICY" | "MISSING_CAPTURE_MANIFEST" | "UNAPPROVED_CAPTURE"
  | "UNKNOWN_SOURCE" | "UNAPPROVED_SOURCE" | "INVALID_SOURCE_LOCATOR"
  | "SOURCE_ORIGIN_MISMATCH" | "INVALID_CAPTURE_TIMESTAMP" | "FUTURE_CAPTURE"
  | "INVALID_PUBLICATION_TIMESTAMP" | "PUBLICATION_AFTER_CAPTURE"
  | "FINAL_PUBLICATION_BEFORE_KICKOFF" | "PAYLOAD_HASH_MISMATCH"
  | "INVALID_PAYLOAD" | "INVALID_RESULT" | "MISSING_CANDIDATE_EVIDENCE"
  | "INVALID_VERIFICATION_TIME" | "CANDIDATE_NOT_ACCEPTED" | "MISSING_REFERENCE_EVIDENCE"
  | "CANDIDATE_PAYLOAD_MISMATCH" | "CANDIDATE_TIMESTAMP_MISMATCH"
  | "GAME_IDENTITY_MISMATCH" | "FINAL_SCORE_CONFLICT"
  | "DUPLICATE_EVIDENCE" | "REPEATED_UPSTREAM_PROVIDER" | "CONFLICTING_EVIDENCE_ID"
  | "CROSS_PROVIDER_PAYLOAD_REUSE" | "INSUFFICIENT_INDEPENDENT_PROVIDERS"
  | "INDEPENDENT_SOURCES_AGREE";
export type NflEvidenceAudit = {
  role: "CANDIDATE" | "REFERENCE";
  evidenceId: string;
  sourceId: string | null;
  upstreamProviderId: string | null;
  sourceLocator: string | null;
  retrievedAt: string | null;
  resultPublishedAt: string | null;
  actualSha256: string | null;
  byteIntegrity: "MATCHED" | "MISMATCHED" | "UNKNOWN";
  sourceAuthenticity: "NOT_CHECKED_OFFLINE";
  sourceReview: "APPROVED" | "UNREVIEWED" | "UNKNOWN";
  captureReview: "APPROVED" | "UNREVIEWED" | "UNKNOWN";
  status: "MATCHED" | "UNVERIFIABLE" | "CONFLICTING" | "DUPLICATE";
  reasons: NflEvidenceReason[];
  validationReasons: readonly string[];
  normalized: NflNormalizedResult | null;
};

export function evidenceKey(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(value.trim())
    ? value.trim().toLowerCase() : null;
}

function locator(value: unknown): URL | null {
  try {
    if (typeof value !== "string") return null;
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash ? url : null;
  } catch { return null; }
}

export function prepareNflEvidencePolicy(policy: NflEvidencePolicy) {
  const sources = new Map<string, NflSourceDefinition>();
  const captures = new Map<string, NflCaptureManifest>();
  const originUpstreams = new Map<string, string>();
  let valid = true;
  for (const source of policy.sources) {
    const id = evidenceKey(source.sourceId), upstream = evidenceKey(source.upstreamProviderId);
    const url = locator(source.origin);
    if (!id || !upstream || sources.has(id) || !url || url.pathname !== "/" || source.sport !== "NFL"
      || !["APPROVED", "UNREVIEWED"].includes(source.reviewStatus)) { valid = false; continue; }
    if (originUpstreams.has(url.origin) && originUpstreams.get(url.origin) !== upstream) {
      valid = false; continue;
    }
    originUpstreams.set(url.origin, upstream);
    sources.set(id, source);
  }
  for (const capture of policy.captures) {
    const id = evidenceKey(capture.evidenceId);
    if (!id || captures.has(id) || !evidenceKey(capture.sourceId)
      || typeof capture.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(capture.sha256)
      || !["APPROVED", "UNREVIEWED"].includes(capture.reviewStatus)) { valid = false; continue; }
    captures.set(id, capture);
  }
  return { valid, sources, captures };
}

/** Hash raw UTF-8 bytes before parsing. No payload value can approve its source. */
export function inspectNflEvidence(
  record: NflEvidenceRecord,
  role: NflEvidenceAudit["role"],
  policy: ReturnType<typeof prepareNflEvidencePolicy>,
  asOf: string | null,
): NflEvidenceAudit {
  const id = evidenceKey(record.evidenceId);
  const audit: NflEvidenceAudit = {
    role, evidenceId: id ?? "", sourceId: null, upstreamProviderId: null, sourceLocator: null,
    retrievedAt: null, resultPublishedAt: null, actualSha256: null, byteIntegrity: "UNKNOWN",
    sourceAuthenticity: "NOT_CHECKED_OFFLINE", sourceReview: "UNKNOWN", captureReview: "UNKNOWN",
    status: "UNVERIFIABLE", reasons: [], validationReasons: [], normalized: null,
  };
  const fail = (reason: NflEvidenceReason) => { audit.reasons.push(reason); };
  if (typeof record.rawEventJson === "string") audit.actualSha256 = createHash("sha256").update(record.rawEventJson, "utf8").digest("hex");
  const manifest = id ? policy.captures.get(id) : undefined;
  if (!manifest) { fail("MISSING_CAPTURE_MANIFEST"); return audit; }
  audit.captureReview = manifest.reviewStatus;
  if (manifest.reviewStatus !== "APPROVED") fail("UNAPPROVED_CAPTURE");
  audit.sourceId = evidenceKey(manifest.sourceId);
  const source = audit.sourceId ? policy.sources.get(audit.sourceId) : undefined;
  if (!source) fail("UNKNOWN_SOURCE");
  else {
    audit.upstreamProviderId = evidenceKey(source.upstreamProviderId);
    audit.sourceReview = source.reviewStatus;
    if (source.reviewStatus !== "APPROVED") fail("UNAPPROVED_SOURCE");
  }
  const url = locator(manifest.sourceUrl);
  if (!url) fail("INVALID_SOURCE_LOCATOR");
  else {
    audit.sourceLocator = url.origin + url.pathname;
    if (source && url.origin !== new URL(source.origin).origin) fail("SOURCE_ORIGIN_MISMATCH");
  }
  audit.retrievedAt = timestamp(manifest.retrievedAt);
  if (!audit.retrievedAt) fail("INVALID_CAPTURE_TIMESTAMP");
  else if (asOf && audit.retrievedAt > asOf) fail("FUTURE_CAPTURE");
  if (manifest.resultPublishedAt !== undefined) {
    audit.resultPublishedAt = timestamp(manifest.resultPublishedAt);
    if (!audit.resultPublishedAt) fail("INVALID_PUBLICATION_TIMESTAMP");
    else if (audit.retrievedAt && audit.resultPublishedAt > audit.retrievedAt) fail("PUBLICATION_AFTER_CAPTURE");
  }
  if (audit.actualSha256 !== manifest.sha256.toLowerCase()) {
    audit.byteIntegrity = "MISMATCHED"; fail("PAYLOAD_HASH_MISMATCH");
  } else audit.byteIntegrity = "MATCHED";
  let event: unknown;
  try {
    if (typeof record.rawEventJson !== "string") throw new Error("missing");
    event = JSON.parse(record.rawEventJson);
  } catch { fail("INVALID_PAYLOAD"); return audit; }
  const validation = validateNflHistoricalResult({ event, observedAt: audit.retrievedAt ?? "" });
  audit.normalized = validation.normalized;
  audit.validationReasons = validation.reasons;
  if (validation.decision !== "ACCEPTED") fail("INVALID_RESULT");
  if (audit.resultPublishedAt && audit.normalized?.kickoff && audit.resultPublishedAt <= audit.normalized.kickoff) {
    fail("FINAL_PUBLICATION_BEFORE_KICKOFF");
  }
  if (audit.reasons.length === 0 && policy.valid && asOf) audit.status = "MATCHED";
  return audit;
}
