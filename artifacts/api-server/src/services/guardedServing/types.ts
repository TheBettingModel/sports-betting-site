export type ApprovalState =
  | "UNVALIDATED"
  | "SHADOW_APPROVED"
  | "GUARDED_APPROVED"
  | "FULL_APPROVED"
  | "PRODUCTION_APPROVED"
  | "REVOKED";

export type MlbModelMode = "v1" | "v4_guarded" | "v4";
export type NcaafModelMode = "legacy" | "nextgen_guarded" | "nextgen";
export type CandidateRuntimeHealth =
  | "CANDIDATE_HEALTHY"
  | "CANDIDATE_INPUT_UNAVAILABLE"
  | "CANDIDATE_RUNTIME_FAILURE";

export interface ExactArtifactIdentity {
  sport: "MLB" | "NCAAF" | "NFL";
  market: string;
  modelFamily: string;
  modelId: string;
  modelVersion: string;
  artifactId: string;
  artifactHash: string;
  inputContractVersion: string;
  inputHash?: string | null;
  configurationHash?: string | null;
  parameterHash?: string | null;
}

export interface ExactApproval {
  state: ApprovalState;
  approved: boolean;
  eventId: string | null;
  reason: string;
  decidedAt: Date | null;
}

export interface EligibilitySignals {
  identityResolved: boolean;
  inputAvailable: boolean;
  inputFresh: boolean;
  starterOrQbComplete: boolean;
  teamStateComplete: boolean;
  contextComplete: boolean;
  pitSafe: boolean;
  leakageSafe: boolean;
  marketFresh: boolean;
  runtimeHealth: CandidateRuntimeHealth;
  publicationEligible: boolean;
  incumbentEligible: boolean;
}

export interface EngineIdentity {
  sport: string;
  engine: string;
  modelFamily: string;
  modelVersion: string;
  artifactId: string;
  servingMode: string;
  inputVersion: string;
  approvalStatus: ApprovalState;
  fallbackUsed: boolean;
  fallbackFrom: string | null;
  fallbackReason: string | null;
  predictionTimestamp: string;
  artifactHash?: string | null;
  configurationHash?: string | null;
  parameterHash?: string | null;
  snapshotId?: string | null;
  marketSnapshotId?: string | null;
}

export interface ResolutionBase<K extends string> {
  kind: K;
  reason: string;
  selectedEngine: string | null;
  fallbackUsed: boolean;
  fallbackFrom: string | null;
  candidateApproval: ApprovalState;
  candidateHealth: CandidateRuntimeHealth;
}

export type MlbResolution =
  | ResolutionBase<"V4_GUARDED">
  | ResolutionBase<"V4_FULL">
  | ResolutionBase<"V1_FALLBACK">
  | ResolutionBase<"V1_PRIMARY">
  | ResolutionBase<"PASS">
  | ResolutionBase<"INELIGIBLE">;

export type NcaafResolution =
  | ResolutionBase<"NEXTGEN_GUARDED">
  | ResolutionBase<"NEXTGEN_FULL">
  | ResolutionBase<"LEGACY_FALLBACK">
  | ResolutionBase<"LEGACY_PRIMARY">
  | ResolutionBase<"PASS">
  | ResolutionBase<"INELIGIBLE">;

export const MLB_INCUMBENT_ENGINE = "tbm-mlb-moneyline-v1";
export const MLB_CANDIDATE_ENGINE = "tbm-mlb-moneyline-v4";
export const NCAAF_INCUMBENT_ENGINE = "tbm-ncaaf-moneyline-v1";
export const NCAAF_CANDIDATE_ENGINE = "tbm-ncaaf-v4-expected-score";