/**
 * Task 238A's downstream-only publication policy.
 *
 * This module deliberately has no persistence or scheduling dependencies.  It
 * consumes already-produced model values and returns the complete decision so a
 * caller can persist it atomically at its own boundary.
 */
export const DOWNSTREAM_PUBLICATION_POLICY_VERSION = "downstream-publication-v1";
export const FAIL_CLOSED_STAKE_POLICY_VERSION = "fail-closed-flat-v1";
export const APPROVED_STAKE_UNITS = 1.0;
export const MAX_PUBLIC_PICKS_PER_EASTERN_DAY = 6;

export enum PublicationDecisionStatus {
  PUBLISHED = "PUBLISHED",
  CAP_EXCLUDED = "CAP_EXCLUDED",
  SAFETY_BLOCKED = "SAFETY_BLOCKED",
  MODEL_OPINION_ONLY = "MODEL_OPINION_ONLY",
}

export enum PublicationDecisionReason {
  PUBLIC_TOP_RANKED = "PUBLIC_TOP_RANKED",
  CAP_EXCLUDED = "CAP_EXCLUDED",
  MODEL_NOT_PRODUCTION_APPROVED = "MODEL_NOT_PRODUCTION_APPROVED",
  PERFORMANCE_INELIGIBLE = "PERFORMANCE_INELIGIBLE",
  INVALID_ODDS = "INVALID_ODDS",
  INVALID_MODEL_PROBABILITY = "INVALID_MODEL_PROBABILITY",
  INVALID_MARKET_PROBABILITY = "INVALID_MARKET_PROBABILITY",
  INVALID_MARKET_IDENTITY = "INVALID_MARKET_IDENTITY",
  INVALID_SELECTION_IDENTITY = "INVALID_SELECTION_IDENTITY",
  GAME_STARTED = "GAME_STARTED",
  NON_ACTIONABLE_RECOMMENDATION = "NON_ACTIONABLE_RECOMMENDATION",
  INVALID_REQUESTED_UNITS = "INVALID_REQUESTED_UNITS",
  INVALID_SELECTED_SIDE_EDGE = "INVALID_SELECTED_SIDE_EDGE",
  NON_POSITIVE_SELECTED_SIDE_EDGE = "NON_POSITIVE_SELECTED_SIDE_EDGE",
  INVALID_RANKING_VALUE = "INVALID_RANKING_VALUE",
}

export enum PublicationRecommendation {
  STRONG_BUY = "Strong Buy",
  BUY = "Buy",
  NEUTRAL = "Neutral",
  FADE = "Fade",
}

/** Values from the model and market boundary; none are recomputed here. */
export interface DownstreamPublicationCandidate {
  /** Durable, stable candidate identity; it is the final ranking tie-breaker. */
  id: string | number;
  recommendation: string;
  requestedUnits: number;
  /** Exact production approval outcome for the producing model/version. */
  productionModelApproved: boolean;
  /** False only when an append-only classification explicitly excludes it. */
  performanceEligible: boolean;
  market: string;
  selection: string;
  odds: number | null;
  modelProbability: number;
  marketProbability: number | null;
  gameStart: Date | string | null;
  /**
   * Edge for the actual selected side.  This is intentionally not normalized
   * with Math.abs(): a negative selected-side edge is not a public candidate.
   */
  selectedSideEdge: number;
  /** Existing universal model output; this policy must not recalculate it. */
  finalRating: number;
  /** Existing cross-sport model output; this policy must not recalculate it. */
  podScore: number;
}

export interface DownstreamPublicationDecision {
  policyVersion: typeof DOWNSTREAM_PUBLICATION_POLICY_VERSION;
  candidateId: string | number;
  status: PublicationDecisionStatus;
  reason: PublicationDecisionReason;
  /** One-based rank among all eligible public candidates, or null if ineligible. */
  eligibleRank: number | null;
  isPublic: boolean;
  /** POTD is selected only from the public, eligible ranked set. */
  isPlayOfTheDay: boolean;
  requestedUnits: number;
  stakePolicyVersion: string;
  /**
   * The policy has no dynamic staking authorization.  A public approval is
   * always exactly 1.0 unit; all other decisions fail closed at zero.
   */
  approvedStakeUnits: number;
}

export interface DownstreamPublicationSlate {
  easternDate: string;
  decisions: readonly DownstreamPublicationDecision[];
}

export function easternDateForPublication(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function selectedSideEdgePercentagePoints(
  modelProbability: number,
  marketProbability: number | null,
): number {
  if (!Number.isFinite(modelProbability) || marketProbability == null || !Number.isFinite(marketProbability)) {
    return Number.NaN;
  }
  return (modelProbability - marketProbability) * 100;
}

function isActionableRecommendation(recommendation: string): boolean {
  return recommendation === PublicationRecommendation.STRONG_BUY
    || recommendation === PublicationRecommendation.BUY;
}

function validAmericanOdds(odds: number | null): boolean {
  return odds != null && Number.isInteger(odds) && (odds <= -100 || odds >= 100);
}

function eligibilityReason(
  candidate: DownstreamPublicationCandidate,
  now: Date,
): PublicationDecisionReason | null {
  if (!candidate.productionModelApproved) return PublicationDecisionReason.MODEL_NOT_PRODUCTION_APPROVED;
  if (!candidate.performanceEligible) return PublicationDecisionReason.PERFORMANCE_INELIGIBLE;
  if (candidate.market !== "moneyline") return PublicationDecisionReason.INVALID_MARKET_IDENTITY;
  if (candidate.selection !== "home" && candidate.selection !== "away") {
    return PublicationDecisionReason.INVALID_SELECTION_IDENTITY;
  }
  if (!validAmericanOdds(candidate.odds)) return PublicationDecisionReason.INVALID_ODDS;
  if (!Number.isFinite(candidate.modelProbability)
    || candidate.modelProbability <= 0 || candidate.modelProbability >= 1) {
    return PublicationDecisionReason.INVALID_MODEL_PROBABILITY;
  }
  if (candidate.marketProbability == null || !Number.isFinite(candidate.marketProbability)
    || candidate.marketProbability <= 0 || candidate.marketProbability >= 1) {
    return PublicationDecisionReason.INVALID_MARKET_PROBABILITY;
  }
  const gameStart = candidate.gameStart instanceof Date
    ? candidate.gameStart : new Date(candidate.gameStart ?? Number.NaN);
  if (!Number.isFinite(gameStart.getTime()) || gameStart <= now) {
    return PublicationDecisionReason.GAME_STARTED;
  }
  if (!isActionableRecommendation(candidate.recommendation)) return PublicationDecisionReason.NON_ACTIONABLE_RECOMMENDATION;
  if (!Number.isFinite(candidate.requestedUnits) || candidate.requestedUnits <= 0) {
    return PublicationDecisionReason.INVALID_REQUESTED_UNITS;
  }
  if (!Number.isFinite(candidate.selectedSideEdge)) return PublicationDecisionReason.INVALID_SELECTED_SIDE_EDGE;
  if (candidate.selectedSideEdge <= 0) return PublicationDecisionReason.NON_POSITIVE_SELECTED_SIDE_EDGE;
  if (!Number.isFinite(candidate.finalRating) || !Number.isFinite(candidate.podScore)) {
    return PublicationDecisionReason.INVALID_RANKING_VALUE;
  }
  return null;
}

/** Stable total ordering, independent of upstream processing order. */
export function comparePublicationCandidates(
  left: DownstreamPublicationCandidate,
  right: DownstreamPublicationCandidate,
): number {
  return right.finalRating - left.finalRating
    || right.podScore - left.podScore
    || right.selectedSideEdge - left.selectedSideEdge
    || String(left.id).localeCompare(String(right.id), "en", { numeric: true });
}

/**
 * Makes pure, deterministic decisions for one Eastern-date slate.  The cap is
 * applied only after the full eligible set is ranked, never during traversal.
 */
export function decideDownstreamPublication(
  candidates: readonly DownstreamPublicationCandidate[],
  now: Date = new Date(),
): DownstreamPublicationSlate {
  const eligible = candidates
    .filter((candidate) => eligibilityReason(candidate, now) === null)
    .slice()
    .sort(comparePublicationCandidates);
  const rankById = new Map(eligible.map((candidate, index) => [String(candidate.id), index + 1]));
  const publicCandidates = eligible.slice(0, MAX_PUBLIC_PICKS_PER_EASTERN_DAY);
  const potdId = publicCandidates
    .slice()
    .sort((left, right) =>
      right.podScore - left.podScore
      || right.finalRating - left.finalRating
      || right.selectedSideEdge - left.selectedSideEdge
      || String(left.id).localeCompare(String(right.id), "en", { numeric: true })
    )[0]?.id;

  const decisions = candidates.map((candidate): DownstreamPublicationDecision => {
    const ineligibleReason = eligibilityReason(candidate, now);
    const eligibleRank = rankById.get(String(candidate.id)) ?? null;
    const isPublic = eligibleRank != null && eligibleRank <= MAX_PUBLIC_PICKS_PER_EASTERN_DAY;
    const status = ineligibleReason === PublicationDecisionReason.NON_ACTIONABLE_RECOMMENDATION
      ? PublicationDecisionStatus.MODEL_OPINION_ONLY
      : ineligibleReason != null
        ? PublicationDecisionStatus.SAFETY_BLOCKED
        : isPublic
          ? PublicationDecisionStatus.PUBLISHED
          : PublicationDecisionStatus.CAP_EXCLUDED;
    const reason = ineligibleReason
      ?? (isPublic ? PublicationDecisionReason.PUBLIC_TOP_RANKED : PublicationDecisionReason.CAP_EXCLUDED);
    return {
      policyVersion: DOWNSTREAM_PUBLICATION_POLICY_VERSION,
      candidateId: candidate.id,
      status,
      reason,
      eligibleRank,
      isPublic,
      isPlayOfTheDay: isPublic && String(candidate.id) === potdId,
      requestedUnits: candidate.requestedUnits,
      stakePolicyVersion: FAIL_CLOSED_STAKE_POLICY_VERSION,
      approvedStakeUnits: isPublic ? APPROVED_STAKE_UNITS : 0,
    };
  });

  return { easternDate: easternDateForPublication(now), decisions };
}