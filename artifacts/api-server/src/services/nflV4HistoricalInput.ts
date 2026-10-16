import { stableHash } from "./v4Platform";
import { timestamp } from "./nflHistoricalResultNormalization";
import { validateNflHistoricalResults, type NflObservation } from "./nflHistoricalResultValidation";
import { prepareNflEvidencePolicy, type NflEvidencePolicy, type NflEvidenceRecord } from "./nflHistoricalEvidenceProvenance";
import { verifyNflHistoricalEvidence } from "./nflHistoricalEvidenceVerification";
import { compareNflHistoricalFixtureCoverage, type NflCoverageBounds, type NflFixtureCoverageReport } from "./nflHistoricalFixtureCoverage";
import { compareScheduleText as compare, type NflScheduleEvidence } from "./nflHistoricalScheduleEvidence";
import type { NflHistoricalGame } from "./nflV4";

export type NflHistoricalInputObservation = Readonly<{
  observation: NflObservation;
  candidateEvidence: NflEvidenceRecord | null;
  references: readonly NflEvidenceRecord[];
}>;
export type NflHistoricalInputBounds = Omit<NflCoverageBounds, "maxRecoveryCandidates"> & Readonly<{
  maxObservations: number;
  maxScheduleFixtures: number;
  maxInputBytes: number;
}>;
export type NflV4HistoricalInput = Readonly<{
  observations: readonly NflHistoricalInputObservation[];
  schedule: readonly Omit<NflScheduleEvidence, "policy">[];
  catalogs: NflEvidencePolicy;
  targetKickoff: string;
  frozenSeedBoundary: string;
  /** Caller-supplied verification time, strictly before target kickoff.
   * Never infer this from kickoff, capture time, or the system clock. */
  verificationAsOf: string;
  bounds: NflHistoricalInputBounds;
}>;
export type NflHistoricalInputDecision = Readonly<{
  observationKey: string;
  eventId: string | null;
  decision: "ELIGIBLE" | "EXCLUDED" | "QUARANTINED";
  reasons: readonly string[];
  evidenceAvailableAt: string | null;
  completionTimeKind: "CONSERVATIVE_BOUND" | null;
  resultEvidenceIds: readonly string[];
  scheduleEvidenceIds: readonly string[];
  independentUpstreamProviders: readonly string[];
}>;
export type NflV4HistoricalInputResult = Readonly<{
  /** PROCESSED does not assert complete schedule coverage or authorize serving. */
  status: "PROCESSED" | "INVALID_INPUT";
  reasons: readonly string[];
  history: readonly NflHistoricalGame[];
  decisions: readonly NflHistoricalInputDecision[];
  coverage: NflFixtureCoverageReport | null;
  persistenceAuthorized: false;
  executionAuthorized: false;
  liveIntegrationEnabled: false;
}>;

const unique = (xs: readonly string[]) => [...new Set(xs)].sort(compare);
const flags = { persistenceAuthorized: false, executionAuthorized: false, liveIntegrationEnabled: false } as const;
const limited = (n: number, max: number) => Number.isInteger(n) && n > 0 && n <= max;
const sortEvidence = (xs: readonly NflEvidenceRecord[]) => [...xs].sort((a, b) =>
  compare(a.evidenceId, b.evidenceId) || compare(a.rawEventJson, b.rawEventJson));
const invalid = (reasons: readonly string[]): NflV4HistoricalInputResult => ({
  status: "INVALID_INPUT", reasons: unique(reasons), history: [], decisions: [], coverage: null, ...flags,
});

/** Pure, bounded adapter. No imports of DB, provider, startup, or model runtime.
 * Trusted catalogs must be authenticated externally. The returned completedAt is
 * a conservative evidence-availability bound, NOT a claimed provider end time.
 * Input order never selects a winning correction; ambiguous finals stay blocked.
 */
export function prepareNflV4HistoricalInput(input: NflV4HistoricalInput): NflV4HistoricalInputResult {
  const target = timestamp(input.targetKickoff), seed = timestamp(input.frozenSeedBoundary);
  const asOf = timestamp(input.verificationAsOf), b = input.bounds;
  const failures: string[] = [];
  if (!target) failures.push("INVALID_TARGET_KICKOFF");
  if (!seed) failures.push("INVALID_FROZEN_SEED_BOUNDARY");
  if (!asOf) failures.push("INVALID_VERIFICATION_TIME");
  if (target && seed && seed >= target) failures.push("SEED_NOT_BEFORE_TARGET");
  if (target && asOf && asOf >= target) failures.push("VERIFICATION_NOT_BEFORE_TARGET");
  if (seed && asOf && seed > asOf) failures.push("VERIFICATION_BEFORE_SEED");
  if (!limited(b.maxObservations, 2048) || !limited(b.maxScheduleFixtures, 2048)
    || !limited(b.maxInputBytes, 16 * 1024 * 1024)) failures.push("INVALID_PROCESSING_LIMITS");
  if (input.observations.length > b.maxObservations || input.schedule.length > b.maxScheduleFixtures
    || input.catalogs.sources.length > 64 || input.catalogs.captures.length > 16384) failures.push("INPUT_LIMIT_EXCEEDED");
  if (failures.length) return invalid(failures);
  if (input.observations.some(o => o.references.length > 7) || input.schedule.some(s => s.references.length > 7)) {
    failures.push("EVIDENCE_LIMIT_EXCEEDED");
  }
  if (failures.length) return invalid(failures);
  // Reject oversized raw strings before JSON serialization duplicates them.
  for (const group of [...input.observations.map(o => [o.candidateEvidence, ...o.references]),
    ...input.schedule.map(s => [s.primary, ...s.references])]) {
    for (const record of group) {
      if (record && typeof record.rawEventJson === "string" && record.rawEventJson.length > b.maxInputBytes) {
        return invalid(["INPUT_BYTE_LIMIT_EXCEEDED"]);
      }
    }
  }
  try {
    if (Buffer.byteLength(JSON.stringify(input), "utf8") > b.maxInputBytes) return invalid(["INPUT_BYTE_LIMIT_EXCEEDED"]);
  } catch { return invalid(["NON_JSON_INPUT"]); }
  if (!prepareNflEvidencePolicy(input.catalogs).valid) return invalid(["INVALID_POLICY"]);

  // Canonicalize presentation order before batch validation chooses duplicate
  // representatives; catalogs themselves are immutable caller-owned inputs.
  const observations = input.observations.map(o => ({ ...o, references: sortEvidence(o.references) }))
    .map(value => ({ value, key: stableHash(value) })).sort((a, z) =>
      compare(timestamp(a.value.observation.observedAt) ?? "", timestamp(z.value.observation.observedAt) ?? "")
      || compare(a.key, z.key));
  const validations = validateNflHistoricalResults(observations.map(o => o.value.observation));
  const coverage = compareNflHistoricalFixtureCoverage({
    expected: input.schedule.map(s => ({ ...s, references: sortEvidence(s.references), policy: input.catalogs })),
    known: observations.map(({ value }) => ({
      observation: value.observation,
      resultEvidence: { candidateEvidence: value.candidateEvidence, references: value.references, policy: input.catalogs },
    })),
    bounds: { ...b, maxRecoveryCandidates: 0 },
    asOf: asOf!,
  });
  if (coverage.status === "INVALID_INPUT") return invalid(coverage.reasons);
  const unassignable = coverage.reasons.includes("UNASSIGNABLE_KNOWN_FIXTURE");
  const decisions: NflHistoricalInputDecision[] = [], history: NflHistoricalGame[] = [];
  observations.forEach(({ value, key }, i) => {
    const validation = validations[i]!, n = validation.normalized;
    const reports = coverage.games.filter(g => g.eventId === n?.eventId);
    const report = reports[0];
    let decision: NflHistoricalInputDecision["decision"] = "QUARANTINED";
    let reasons: string[] = [], availableAt: string | null = null;
    let upstream: readonly string[] = [], evidenceIds: string[] = [];
    const proof = verifyNflHistoricalEvidence({
      candidate: value.observation, candidateEvidence: value.candidateEvidence,
      references: value.references, policy: input.catalogs, asOf: asOf!,
    });
    evidenceIds = proof.evidence.map(e => e.evidenceId).filter(Boolean);
    upstream = proof.independentUpstreamProviders;
    if (n?.seasonPhase === "PRESEASON" || n?.seasonPhase === "POSTSEASON") {
      decision = "EXCLUDED"; reasons = [`${n.seasonPhase}_EXCLUDED`];
    } else if (n?.kickoff && n.kickoff <= seed!) {
      decision = "EXCLUDED"; reasons = ["AT_OR_BEFORE_FROZEN_SEED"];
    } else if (n?.kickoff && n.kickoff >= target!) {
      decision = "EXCLUDED"; reasons = ["KICKOFF_NOT_BEFORE_TARGET"];
    } else if (report?.status === "OUT_OF_SCOPE") {
      decision = "EXCLUDED"; reasons = ["OUTSIDE_EXPLICIT_SCOPE"];
    } else if (validation.reasons.includes("DUPLICATE_OBSERVATION")) {
      decision = "EXCLUDED"; reasons = ["DUPLICATE_OBSERVATION"];
    } else {
      if (validation.decision !== "ACCEPTED") reasons.push(...validation.reasons);
      if (proof.decision !== "VERIFIED") reasons.push(...proof.reasons, ...proof.candidateValidationReasons);
      if (unassignable) reasons.push("UNASSIGNABLE_BATCH_OBSERVATION");
      if (!report) reasons.push("MISSING_VERIFIED_SCHEDULE");
      else if (report.status !== "PRESENT_VERIFIED") reasons.push("SCHEDULE_OR_BATCH_NOT_VERIFIED", ...report.reasons);
      availableAt = timestamp(proof.evidenceAvailableAt);
      if (!availableAt || availableAt >= target! || (n?.kickoff && availableAt <= n.kickoff)) {
        reasons.push("EVIDENCE_AVAILABILITY_NOT_SAFE");
      }
      if (reasons.length === 0 && n?.eventId && n.homeTeamId && n.awayTeamId && n.kickoff
        && n.homeScore !== null && n.awayScore !== null && availableAt) {
        decision = "ELIGIBLE"; reasons = ["VERIFIED_REGULAR_SEASON_HISTORY"];
        history.push({
          gameId: n.eventId, eventStart: n.kickoff, completedAt: availableAt,
          homeTeamId: n.homeTeamId, awayTeamId: n.awayTeamId, homeScore: n.homeScore, awayScore: n.awayScore,
        });
      }
    }
    decisions.push({
      observationKey: key, eventId: n?.eventId ?? null, decision,
      reasons: unique(reasons.filter(r => r !== "VALID_REGULAR_SEASON_FINAL")),
      evidenceAvailableAt: decision === "ELIGIBLE" ? availableAt : null,
      completionTimeKind: decision === "ELIGIBLE" ? "CONSERVATIVE_BOUND" : null,
      resultEvidenceIds: unique(evidenceIds), scheduleEvidenceIds: unique(reports.flatMap(r => r.scheduleEvidenceIds)),
      independentUpstreamProviders: upstream,
    });
  });
  history.sort((a, z) => compare(a.eventStart, z.eventStart) || compare(a.gameId, z.gameId));
  decisions.sort((a, z) => compare(a.eventId ?? "", z.eventId ?? "") || compare(a.observationKey, z.observationKey));
  return { status: "PROCESSED", reasons: coverage.reasons, history, decisions, coverage, ...flags };
}
