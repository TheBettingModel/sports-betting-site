import { stableHash } from "./v4Platform";
import { record, timestamp, type NflSeasonPhase } from "./nflHistoricalResultNormalization";
import { validateNflHistoricalResult, type NflObservation } from "./nflHistoricalResultValidation";
import {
  inspectNflEvidence, prepareNflEvidencePolicy,
  type NflEvidencePolicy, type NflEvidenceRecord,
} from "./nflHistoricalEvidenceProvenance";

export type NflScheduleFixture = Readonly<{
  eventId: string; homeTeamId: string; awayTeamId: string;
  kickoff: string; season: number; week: number; phase: NflSeasonPhase;
}>;
export type NflScheduleEvidence = Readonly<{
  primary: NflEvidenceRecord | null;
  references: readonly NflEvidenceRecord[];
  policy: NflEvidencePolicy;
}>;
export type NflScheduleVerification = Readonly<{
  fixture: NflScheduleFixture | null;
  status: "OFFLINE_CORROBORATED" | "QUARANTINED";
  reasons: readonly string[];
  evidenceIds: readonly string[];
  upstreamProviders: readonly string[];
  captures: readonly { evidenceId: string; sha256: string }[];
}>;
export const compareScheduleText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const scheduleIdentity = (f: NflScheduleFixture) => stableHash(f);
export const scheduleTeamPair = (f: NflScheduleFixture) =>
  [f.homeTeamId, f.awayTeamId].sort(compareScheduleText).join(":");

// Schedule evidence does not establish a final score. Only result-specific
// failures may be ignored here; identity, time, phase, and status failures remain.
const RESULT_ONLY = new Set([
  "VALID_REGULAR_SEASON_FINAL", "NONFINAL_EVENT", "PRESEASON_EXCLUDED", "POSTSEASON_EXCLUDED",
  "MISSING_FINAL_SCORE", "INVALID_FINAL_SCORE", "SUSPICIOUS_ZERO_ZERO_FINAL",
  "WINNER_SCORE_MISMATCH", "INVALID_WINNER_FLAG", "REFERENCE_SCORE_CONFLICT", "INVALID_REFERENCE_SCORE",
]);
export function normalizeNflScheduleFixture(observation: NflObservation): {
  fixture: NflScheduleFixture | null; reasons: string[];
} {
  const validated = validateNflHistoricalResult(observation);
  const reasons: string[] = validated.reasons.filter(r => !RESULT_ONLY.has(r));
  const event = record(observation.event), n = validated.normalized;
  const week = record(event.week).number;
  if (typeof week !== "number" || !Number.isInteger(week) || week < 1 || week > 23) reasons.push("INVALID_EVENT_WEEK");
  const type = record(record(event.status).type);
  const competition = record(Array.isArray(event.competitions) ? event.competitions[0] : null);
  const competitionType = record(record(competition.status).type);
  if ([type.name, competitionType.name].some(name => typeof name === "string" && /CANCEL|POSTPON|SUSPEND|DELAY/.test(name))) {
    reasons.push("INTERRUPTED_SCHEDULE_STATUS");
  }
  if (!n || !n.eventId || !n.homeTeamId || !n.awayTeamId || !n.kickoff || !n.seasonYear || typeof week !== "number" || reasons.length) {
    return { fixture: null, reasons: [...new Set(reasons)].sort(compareScheduleText) };
  }
  // Regular-season week numbers are deliberately checked independently of month.
  if (n.seasonPhase === "REGULAR_SEASON" && week > 18) return { fixture: null, reasons: ["INVALID_REGULAR_SEASON_WEEK"] };
  return {
    fixture: { eventId: n.eventId, homeTeamId: n.homeTeamId, awayTeamId: n.awayTeamId,
      kickoff: n.kickoff, season: n.seasonYear, week, phase: n.seasonPhase },
    reasons: [],
  };
}

/** Uses Step 3 byte/source checks, but validates schedule identity, not results.
 * Trusted capture/source catalogs and canonical ESPN-compatible IDs are required.
 */
export function verifyNflScheduleEvidence(input: NflScheduleEvidence, cutoff: string): NflScheduleVerification {
  const reasons = new Set<string>(), asOf = timestamp(cutoff);
  const evidenceIds = new Set<string>(), providers = new Set<string>();
  if (!asOf) reasons.add("INVALID_VERIFICATION_TIME");
  if (!input.primary) reasons.add("MISSING_PRIMARY_SCHEDULE_EVIDENCE");
  if (!input.references.length) reasons.add("MISSING_SCHEDULE_REFERENCE");
  if (input.references.length > 7) return {
    fixture: null, status: "QUARANTINED", reasons: ["SCHEDULE_EVIDENCE_LIMIT_EXCEEDED"], evidenceIds: [], upstreamProviders: [], captures: [],
  };
  const policy = prepareNflEvidencePolicy(input.policy);
  if (!policy.valid) reasons.add("INVALID_POLICY");
  const observations = [
    ...(input.primary ? [{ record: input.primary, role: "CANDIDATE" as const }] : []),
    ...input.references.map(r => ({ record: r, role: "REFERENCE" as const })),
  ].map(({ record: evidence, role }) => {
    const audit = inspectNflEvidence(evidence, role, policy, asOf);
    // INVALID_RESULT is expected for pregame schedule snapshots. Structural
    // validation below is mandatory; no other provenance failure is discarded.
    const failures: string[] = audit.reasons.filter(r => r !== "INVALID_RESULT");
    let parsed: unknown = null;
    try { parsed = JSON.parse(evidence.rawEventJson); } catch { failures.push("INVALID_PAYLOAD"); }
    const normalized = normalizeNflScheduleFixture({ event: parsed, observedAt: audit.retrievedAt ?? "" });
    failures.push(...normalized.reasons);
    failures.forEach(r => reasons.add(r));
    if (audit.evidenceId) evidenceIds.add(audit.evidenceId);
    return { audit, fixture: normalized.fixture, failures };
  });
  const ids = new Map<string, Set<string>>(), hashes = new Map<string, Set<string>>();
  const identities = new Set<string>();
  for (const o of observations) {
    if (o.fixture) identities.add(scheduleIdentity(o.fixture));
    const { evidenceId, actualSha256, upstreamProviderId } = o.audit;
    if (evidenceId && actualSha256) {
      const group = ids.get(evidenceId) ?? new Set(); group.add(actualSha256); ids.set(evidenceId, group);
    }
    if (actualSha256 && upstreamProviderId) {
      const group = hashes.get(actualSha256) ?? new Set(); group.add(upstreamProviderId); hashes.set(actualSha256, group);
    }
    if (!o.failures.length && upstreamProviderId) providers.add(upstreamProviderId);
  }
  if ([...ids.values()].some(group => group.size > 1)) reasons.add("CONFLICTING_EVIDENCE_ID");
  if ([...hashes.values()].some(group => group.size > 1)) reasons.add("CROSS_PROVIDER_PAYLOAD_REUSE");
  if (identities.size > 1) reasons.add("SCHEDULE_EVIDENCE_CONFLICT");
  if (providers.size < 2) reasons.add("INSUFFICIENT_INDEPENDENT_PROVIDERS");
  const fixture = observations.find(o => o.audit.role === "CANDIDATE")?.fixture ?? null;
  if (!fixture) reasons.add("INVALID_PRIMARY_SCHEDULE");
  return {
    fixture, status: reasons.size ? "QUARANTINED" : "OFFLINE_CORROBORATED",
    reasons: [...reasons].sort(compareScheduleText),
    evidenceIds: [...evidenceIds].sort(compareScheduleText),
    upstreamProviders: [...providers].sort(compareScheduleText),
    captures: observations.flatMap(o => o.audit.evidenceId && o.audit.actualSha256
      ? [{ evidenceId: o.audit.evidenceId, sha256: o.audit.actualSha256 }] : [])
      .sort((a, b) => compareScheduleText(a.evidenceId, b.evidenceId) || compareScheduleText(a.sha256, b.sha256)),
  };
}
