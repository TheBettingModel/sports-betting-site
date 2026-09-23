import type { ExactArtifactIdentity, MlbResolution, NcaafResolution } from "./types";

type Availability<T> = Readonly<{ status: "AVAILABLE" | "UNAVAILABLE"; value: T | null; reason: string | null }>;
const unavailable = <T>(reason: string): Availability<T> => Object.freeze({ status: "UNAVAILABLE", value: null, reason });
const available = <T>(value: T): Availability<T> => Object.freeze({ status: "AVAILABLE", value, reason: null });

export type VerifiedMarketEvaluationEvidence = Readonly<{
  snapshotId: number;
  sportsbook: string | null;
  source: string;
  providerEventId: string | null;
  selection: "home" | "away";
  price: number;
  capturedAt: string;
  modelProbability: number;
  impliedProbability: number;
  edge: number;
}>;

/** Evaluation-only shape: it contains no persistence identifier or writer input. */
export interface NonPublishingCandidateEvaluation {
  readonly adapterVersion: "candidate-evaluation-adapter-v1";
  readonly persistenceAllowed: false;
  readonly rawOutput: Readonly<Record<string, unknown>>;
  readonly identity: ExactArtifactIdentity;
  readonly resolver: Pick<MlbResolution | NcaafResolution, "kind" | "reason" | "candidateApproval" | "fallbackUsed">;
  readonly market: Availability<unknown>;
  readonly risk: Availability<unknown>;
  readonly universal: Readonly<Record<string, Availability<unknown>>>;
  readonly stages: Readonly<{ adapter: "COMPLETED"; universal: "BLOCKED"; reason: string }>;
}

export function evaluateCandidateWithoutPublishing(
  rawOutput: Readonly<Record<string, unknown>>,
  identity: ExactArtifactIdentity,
  resolution: MlbResolution | NcaafResolution,
  verifiedMarketEvidence?: VerifiedMarketEvaluationEvidence,
): NonPublishingCandidateEvaluation {
  const market = verifiedMarketEvidence
    ? available<unknown>(verifiedMarketEvidence)
    : unavailable<unknown>("NO_AUTHENTIC_MARKET_SNAPSHOT_SUPPLIED_TO_CANDIDATE_EXECUTOR");
  return Object.freeze({
    adapterVersion: "candidate-evaluation-adapter-v1",
    persistenceAllowed: false,
    rawOutput,
    identity,
    resolver: Object.freeze({
      kind: resolution.kind, reason: resolution.reason,
      candidateApproval: resolution.candidateApproval, fallbackUsed: resolution.fallbackUsed,
    }),
    market,
    risk: unavailable("NO_AUTHENTIC_RISK_POLICY_INPUT_SUPPLIED"),
    universal: Object.freeze({
      sportsbookComparison: unavailable(verifiedMarketEvidence
        ? "SINGLE_EXACT_BOOK_OBSERVATION_ONLY" : "MARKET_INPUT_UNAVAILABLE"),
      sharpBookAnalysis: unavailable(verifiedMarketEvidence
        ? "NO_VALIDATED_NCAAF_SHARP_BOOK_POLICY" : "MARKET_INPUT_UNAVAILABLE"),
      lineShopping: unavailable(verifiedMarketEvidence
        ? "MULTIBOOK_MARKET_NOT_CARRIED_INTO_BRIDGE" : "MARKET_INPUT_UNAVAILABLE"),
      marketIntelligence: verifiedMarketEvidence
        ? available<unknown>(Object.freeze({
          snapshotId: verifiedMarketEvidence.snapshotId,
          selection: verifiedMarketEvidence.selection,
          modelProbability: verifiedMarketEvidence.modelProbability,
          impliedProbability: verifiedMarketEvidence.impliedProbability,
          edge: verifiedMarketEvidence.edge,
        }))
        : unavailable("MARKET_INPUT_UNAVAILABLE"),
      finalRating: unavailable("RISK_POLICY_INPUT_UNAVAILABLE"),
      podScore: unavailable("RISK_POLICY_INPUT_UNAVAILABLE"),
      finalModelTier: unavailable("RISK_POLICY_INPUT_UNAVAILABLE"),
      finalRecommendation: unavailable("RISK_POLICY_INPUT_UNAVAILABLE"),
    }),
    stages: Object.freeze({
      adapter: "COMPLETED", universal: "BLOCKED",
      reason: verifiedMarketEvidence
        ? "AUTHENTIC_MARKET_AVAILABLE_BUT_VALIDATED_RISK_POLICY_UNAVAILABLE"
        : "AUTHENTIC_RAW_MODEL_OUTPUT_HAS_NO_MARKET_OR_RISK_INPUT",
    }),
  });
}