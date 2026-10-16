import { stableHash } from "./v4Platform";
import { timestamp } from "./nflHistoricalResultNormalization";
import { validateNflHistoricalResult, type NflObservation, type NflNormalizedResult } from "./nflHistoricalResultValidation";
import {
  inspectNflEvidence, prepareNflEvidencePolicy,
  type NflEvidenceAudit, type NflEvidencePolicy, type NflEvidenceReason, type NflEvidenceRecord,
} from "./nflHistoricalEvidenceProvenance";

export type NflEvidenceVerificationInput = Readonly<{
  candidate: NflObservation;
  candidateEvidence: NflEvidenceRecord | null;
  references: readonly NflEvidenceRecord[];
  policy: NflEvidencePolicy;
  /** Explicit audit cutoff; never taken from the system clock. */
  asOf: string;
}>;
export type NflEvidenceVerification = Readonly<{
  decision: "VERIFIED" | "QUARANTINED" | "REJECTED";
  verificationStatus: "OFFLINE_CORROBORATED" | "NOT_VERIFIED";
  reasons: readonly NflEvidenceReason[];
  candidateValidationReasons: readonly string[];
  verifiedAt: string | null;
  evidenceAvailableAt: string | null;
  independentUpstreamProviders: readonly string[];
  evidence: readonly NflEvidenceAudit[];
  /** Never supplies a replacement score or an eligible warehouse row. */
  verifiedResult: NflNormalizedResult | null;
  persistenceAuthorized: false;
}>;

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const identity = (n: NflNormalizedResult) => stableHash([
  n.eventId, n.homeTeamId, n.awayTeamId, n.kickoff, n.seasonYear, n.seasonPhase,
]);

/** Pure corroboration, not source authentication, correction, or persistence.
 * Conservative rule: any questionable supplied record blocks verification;
 * duplicate agreeing records may be retained but never add independent support.
 */
export function verifyNflHistoricalEvidence(input: NflEvidenceVerificationInput): NflEvidenceVerification {
  const candidate = validateNflHistoricalResult(input.candidate);
  const asOf = timestamp(input.asOf);
  const policy = prepareNflEvidencePolicy(input.policy);
  const reasons = new Set<NflEvidenceReason>();
  if (!asOf) reasons.add("INVALID_VERIFICATION_TIME");
  if (!policy.valid) reasons.add("INVALID_POLICY");
  if (candidate.decision !== "ACCEPTED") reasons.add("CANDIDATE_NOT_ACCEPTED");
  if (!input.candidateEvidence) reasons.add("MISSING_CANDIDATE_EVIDENCE");
  if (!input.references.length) reasons.add("MISSING_REFERENCE_EVIDENCE");
  const evidence = [
    ...(input.candidateEvidence ? [inspectNflEvidence(input.candidateEvidence, "CANDIDATE", policy, asOf)] : []),
    ...input.references.map(r => inspectNflEvidence(r, "REFERENCE", policy, asOf)),
  ].sort((a, b) => compare(a.role, b.role) || compare(a.evidenceId, b.evidenceId)
    || compare(a.actualSha256 ?? "", b.actualSha256 ?? ""));
  const flag = (e: NflEvidenceAudit, reason: NflEvidenceReason, conflict = true) => {
    if (!e.reasons.includes(reason)) e.reasons.push(reason);
    e.status = conflict ? "CONFLICTING" : "UNVERIFIABLE";
  };
  for (const e of evidence) {
    if (candidate.normalized && e.normalized) {
      if (identity(candidate.normalized) !== identity(e.normalized)) flag(e, "GAME_IDENTITY_MISMATCH");
      else if (e.normalized.homeScore !== null && e.normalized.awayScore !== null
        && (candidate.normalized.homeScore !== e.normalized.homeScore || candidate.normalized.awayScore !== e.normalized.awayScore)) {
        flag(e, "FINAL_SCORE_CONFLICT");
      }
      if (e.role === "CANDIDATE") {
        if (candidate.normalized.eventPayloadHash !== e.normalized.eventPayloadHash) flag(e, "CANDIDATE_PAYLOAD_MISMATCH");
        if (candidate.normalized.observedAt !== e.retrievedAt) flag(e, "CANDIDATE_TIMESTAMP_MISMATCH");
      }
    }
  }
  const byId = new Map<string, NflEvidenceAudit[]>(), byHash = new Map<string, NflEvidenceAudit[]>();
  for (const e of evidence) {
    if (e.evidenceId) { const group = byId.get(e.evidenceId) ?? []; group.push(e); byId.set(e.evidenceId, group); }
    if (e.actualSha256) { const group = byHash.get(e.actualSha256) ?? []; group.push(e); byHash.set(e.actualSha256, group); }
  }
  for (const group of byId.values()) {
    if (new Set(group.map(e => e.actualSha256)).size > 1) group.forEach(e => flag(e, "CONFLICTING_EVIDENCE_ID"));
  }
  for (const group of byHash.values()) {
    const providers = new Set(group.map(e => e.upstreamProviderId).filter(Boolean));
    if (providers.size > 1) group.forEach(e => flag(e, "CROSS_PROVIDER_PAYLOAD_REUSE"));
  }
  const upstream = new Set<string>(), snapshots = new Set<string>();
  for (const e of evidence) {
    if (e.status !== "MATCHED" || !e.upstreamProviderId || !e.actualSha256) continue;
    const snapshot = `${e.upstreamProviderId}:${e.actualSha256}`;
    if (snapshots.has(snapshot)) {
      e.status = "DUPLICATE"; e.reasons.push("DUPLICATE_EVIDENCE");
    }
    if (upstream.has(e.upstreamProviderId)) e.reasons.push("REPEATED_UPSTREAM_PROVIDER");
    snapshots.add(snapshot); upstream.add(e.upstreamProviderId);
  }
  for (const e of evidence) {
    for (const reason of e.reasons) {
      if (reason !== "DUPLICATE_EVIDENCE" && reason !== "REPEATED_UPSTREAM_PROVIDER") reasons.add(reason);
    }
  }
  if (upstream.size < 2) reasons.add("INSUFFICIENT_INDEPENDENT_PROVIDERS");
  const verified = reasons.size === 0 && candidate.decision === "ACCEPTED";
  return {
    decision: candidate.decision === "REJECTED" ? "REJECTED" : verified ? "VERIFIED" : "QUARANTINED",
    verificationStatus: verified ? "OFFLINE_CORROBORATED" : "NOT_VERIFIED",
    reasons: verified ? ["INDEPENDENT_SOURCES_AGREE"] : [...reasons].sort(compare),
    candidateValidationReasons: candidate.reasons,
    verifiedAt: verified ? asOf : null,
    // Verification is not retroactively available when an earlier capture was made.
    evidenceAvailableAt: verified ? asOf : null,
    independentUpstreamProviders: [...upstream].sort(compare),
    evidence,
    verifiedResult: verified ? candidate.normalized : null,
    persistenceAuthorized: false,
  };
}
