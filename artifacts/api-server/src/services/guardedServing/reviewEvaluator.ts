export type ReviewRecommendation = "BLOCK" | "GUARDED_ELIGIBLE" | "FULL_ELIGIBLE";

export interface ModelReviewPolicy {
  sport: "MLB" | "NCAAF" | "NFL";
  minimumGradedSample: number;
  minimumProspectiveSample: number;
  minimumTeamDiversity: number;
  minimumOpponentDiversity: number;
  minimumStarterOrQbDiversity: number | null;
  minimumObservationDays: number;
  calibrationRequired: boolean;
  clvRequired: boolean;
  pitRequired: boolean;
  leakageAuditRequired: boolean;
  runtimeHealthRequired: boolean;
  marketMinimums: Record<string, number>;
}

export const DEFAULT_REVIEW_POLICIES: Record<"MLB" | "NCAAF" | "NFL", ModelReviewPolicy> = {
  MLB: {
    sport: "MLB", minimumGradedSample: 100, minimumProspectiveSample: 150,
    minimumTeamDiversity: 20, minimumOpponentDiversity: 20,
    minimumStarterOrQbDiversity: 50, minimumObservationDays: 42,
    calibrationRequired: true, clvRequired: true, pitRequired: true,
    leakageAuditRequired: true, runtimeHealthRequired: true, marketMinimums: { moneyline: 150 },
  },
  NCAAF: {
    sport: "NCAAF", minimumGradedSample: 100, minimumProspectiveSample: 150,
    minimumTeamDiversity: 60, minimumOpponentDiversity: 60,
    minimumStarterOrQbDiversity: 30, minimumObservationDays: 28,
    calibrationRequired: true, clvRequired: true, pitRequired: true,
    leakageAuditRequired: true, runtimeHealthRequired: true,
    marketMinimums: { moneyline: 100, spread: 100, total: 100 },
  },
  NFL: {
    sport: "NFL", minimumGradedSample: 75, minimumProspectiveSample: 100,
    minimumTeamDiversity: 24, minimumOpponentDiversity: 24,
    minimumStarterOrQbDiversity: 20, minimumObservationDays: 56,
    calibrationRequired: true, clvRequired: true, pitRequired: true,
    leakageAuditRequired: true, runtimeHealthRequired: true,
    marketMinimums: { moneyline: 75, spread: 75, total: 75 },
  },
};

export interface ModelReviewEvidence {
  gradedSample: number;
  prospectiveSample: number;
  teamDiversity: number;
  opponentDiversity: number;
  starterOrQbDiversity: number | null;
  observationDays: number;
  calibrationPassed: boolean;
  clvPassed: boolean;
  pitPassed: boolean;
  leakagePassed: boolean;
  runtimeHealthy: boolean;
  runtimeReproducible: boolean;
  inputComplete: boolean;
  publicationCompatible: boolean;
  marketSamples: Record<string, number>;
  knownLimitations: string[];
}

export function evaluateModelReview(
  policy: ModelReviewPolicy,
  evidence: ModelReviewEvidence,
): { recommendation: ReviewRecommendation; blockers: string[]; knownLimitations: string[]; policy: ModelReviewPolicy } {
  const blockers = [
    evidence.gradedSample < policy.minimumGradedSample ? "MINIMUM_GRADED_SAMPLE_NOT_MET" : null,
    evidence.prospectiveSample < policy.minimumProspectiveSample ? "MINIMUM_PROSPECTIVE_SAMPLE_NOT_MET" : null,
    evidence.teamDiversity < policy.minimumTeamDiversity ? "MINIMUM_TEAM_DIVERSITY_NOT_MET" : null,
    evidence.opponentDiversity < policy.minimumOpponentDiversity ? "MINIMUM_OPPONENT_DIVERSITY_NOT_MET" : null,
    policy.minimumStarterOrQbDiversity != null
      && (evidence.starterOrQbDiversity ?? 0) < policy.minimumStarterOrQbDiversity
      ? "MINIMUM_STARTER_OR_QB_DIVERSITY_NOT_MET" : null,
    evidence.observationDays < policy.minimumObservationDays ? "MINIMUM_OBSERVATION_WINDOW_NOT_MET" : null,
    policy.calibrationRequired && !evidence.calibrationPassed ? "CALIBRATION_NOT_PASSED" : null,
    policy.clvRequired && !evidence.clvPassed ? "CLV_NOT_PASSED" : null,
    policy.pitRequired && !evidence.pitPassed ? "PIT_AUDIT_NOT_PASSED" : null,
    policy.leakageAuditRequired && !evidence.leakagePassed ? "LEAKAGE_AUDIT_NOT_PASSED" : null,
    policy.runtimeHealthRequired && !evidence.runtimeHealthy ? "RUNTIME_UNHEALTHY" : null,
    !evidence.runtimeReproducible ? "RUNTIME_NOT_REPRODUCIBLE" : null,
    !evidence.inputComplete ? "INPUT_INCOMPLETE" : null,
    !evidence.publicationCompatible ? "PUBLICATION_NOT_COMPATIBLE" : null,
    ...Object.entries(policy.marketMinimums)
      .filter(([market, minimum]) => (evidence.marketSamples[market] ?? 0) < minimum)
      .map(([market]) => `MARKET_SAMPLE_NOT_MET:${market}`),
  ].filter((value): value is string => value !== null);
  return {
    recommendation: blockers.length ? "BLOCK" : evidence.gradedSample >= policy.minimumGradedSample * 2
      && evidence.prospectiveSample >= policy.minimumProspectiveSample * 2 ? "FULL_ELIGIBLE" : "GUARDED_ELIGIBLE",
    blockers,
    knownLimitations: [...evidence.knownLimitations],
    policy,
  };
}