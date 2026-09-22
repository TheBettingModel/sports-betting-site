import { stableHash, type V4ArtifactIdentity } from "./v4Platform";

/**
 * Operational freeze boundary for the NCAAF V4 learning cycle.
 *
 * This module is deliberately a pure review report. It does not write an
 * approval, alter an artifact, or change the production champion. Existing
 * exact-artifact approval, immutable forecast, validation, and challenger
 * promotion workflows remain the only paths that can authorize a release.
 */
export const NCAAF_V4_FREEZE_POLICY_VERSION = "ncaaf-v4-learning-freeze-v1";
export const NCAAF_V4_MIN_REVIEW_DAYS = 28;
export const NCAAF_V4_MIN_GRADED_FBS_FORECASTS = 100;
export const NCAAF_V4_PRODUCTION_STATUS = "FROZEN" as const;

export interface NcaafFreezeObservation {
  forecastId: string;
  kickoffAt: Date;
  graded: boolean;
  homeClassification: string;
  awayClassification: string;
  immutablePregameEvidenceComplete: boolean;
  integrityFailures: readonly string[];
}

export interface NcaafExactChallengerApproval {
  identity: V4ArtifactIdentity;
  approvedBy: string;
  approvedAt: Date;
  /** Hash of the exact identity approved by the human reviewer. */
  identityHash: string;
}

export interface NcaafFreezeReviewInput {
  observationStartAt: Date;
  now: Date;
  champion: V4ArtifactIdentity;
  observations: readonly NcaafFreezeObservation[];
  challenger: NcaafExactChallengerApproval | null;
}

export interface NcaafFreezeReviewReport {
  policyVersion: string;
  productionStatus: typeof NCAAF_V4_PRODUCTION_STATUS;
  decision: "REVIEW_ELIGIBLE" | "NOT_ELIGIBLE";
  earliestReviewAt: Date;
  gradedFbsForecastCount: number;
  completeImmutableEvidence: boolean;
  unresolvedIntegrityFailures: number;
  exactChallengerApproved: boolean;
  checks: Readonly<Record<string, boolean>>;
  reasons: readonly string[];
}

const FBS = new Set(["FBS", "NCAA_FBS", "DIVISION_I_FBS"]);

function isFbs(value: string): boolean {
  return FBS.has(value.trim().toUpperCase());
}

function exactApproval(approval: NcaafExactChallengerApproval | null): boolean {
  if (!approval?.approvedBy.trim() || !Number.isFinite(approval.approvedAt.getTime())) return false;
  return approval.identityHash === stableHash(approval.identity)
    && approval.identity.artifactHash.length > 0
    && approval.identity.modelVersion.length > 0;
}

/**
 * Reports whether a human review may begin. It never returns a promotion
 * decision and never mutates the production champion.
 */
export function assessNcaafV4FreezeReview(input: NcaafFreezeReviewInput): NcaafFreezeReviewReport {
  const earliestReviewAt = new Date(input.observationStartAt.getTime()
    + NCAAF_V4_MIN_REVIEW_DAYS * 24 * 60 * 60 * 1000);
  const elapsed = input.now.getTime() >= earliestReviewAt.getTime();
  const gradedFbs = input.observations.filter((observation) =>
    observation.graded && isFbs(observation.homeClassification) && isFbs(observation.awayClassification));
  const completeImmutableEvidence = gradedFbs.every((observation) =>
    observation.immutablePregameEvidenceComplete);
  const unresolvedIntegrityFailures = gradedFbs.reduce(
    (count, observation) => count + observation.integrityFailures.length, 0,
  );
  const exactChallengerApproved = exactApproval(input.challenger)
    && input.challenger!.identity.sport === input.champion.sport;
  const checks = Object.freeze({
    minimumObservationAge: elapsed,
    minimumGradedFbsForecasts: gradedFbs.length >= NCAAF_V4_MIN_GRADED_FBS_FORECASTS,
    completeImmutablePregameEvidence: completeImmutableEvidence,
    noUnresolvedIntegrityFailures: unresolvedIntegrityFailures === 0,
    explicitExactChallengerApproval: exactChallengerApproved,
  });
  const reasons = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([check]) => check);
  return Object.freeze({
    policyVersion: NCAAF_V4_FREEZE_POLICY_VERSION,
    productionStatus: NCAAF_V4_PRODUCTION_STATUS,
    decision: reasons.length ? "NOT_ELIGIBLE" : "REVIEW_ELIGIBLE",
    earliestReviewAt,
    gradedFbsForecastCount: gradedFbs.length,
    completeImmutableEvidence,
    unresolvedIntegrityFailures,
    exactChallengerApproved,
    checks,
    reasons: Object.freeze(reasons),
  });
}