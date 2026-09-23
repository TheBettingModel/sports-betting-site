import type { MarketApprovalStatus } from "./marketApproval";

export type RawRecommendation = "Strong Buy" | "Buy" | "Neutral" | "Fade" | string;
export type PublicationStatus = "PUBLISHED" | "PUBLISHABLE" | "BLOCKED" | "NOT_APPLICABLE_NO_PLAY";

export interface RecommendationPublicationInput {
  rawRecommendation: RawRecommendation;
  approvalStatus: MarketApprovalStatus;
  approvalReasons: string[];
  effectivePublishedRecommendation?: string | null;
}

export interface RecommendationPublicationState {
  rawModelRecommendation: string;
  publicationStatus: PublicationStatus;
  publicationBlockReason: string | null;
  publicationBlockDetails: string[];
  displayRecommendation: string;
}

const isActionable = (recommendation: string) =>
  recommendation === "Strong Buy" || recommendation === "Buy";

function approvalBlockReason(status: MarketApprovalStatus): string {
  switch (status) {
    case "SHADOW": return "MODEL_OR_MARKET_IN_SHADOW";
    case "PROVISIONAL": return "MARKET_NOT_PRODUCTION_APPROVED";
    case "SUSPENDED": return "MARKET_APPROVAL_SUSPENDED";
    case "UNVALIDATED": return "EXACT_APPROVAL_MISSING";
    case "PRODUCTION_APPROVED": return "OTHER";
  }
}

/**
 * Mirrors the existing public feed's fail-closed recommendation masking without
 * changing it. Admin uses the result to explain rather than collapse the state.
 */
export function classifyRecommendationPublication(
  input: RecommendationPublicationInput,
): RecommendationPublicationState {
  const pinned = input.effectivePublishedRecommendation ?? input.rawRecommendation;
  const displayRecommendation = input.approvalStatus === "PRODUCTION_APPROVED"
    ? pinned
    : "Neutral";

  if (!isActionable(input.rawRecommendation)) {
    return {
      rawModelRecommendation: input.rawRecommendation,
      publicationStatus: "NOT_APPLICABLE_NO_PLAY",
      publicationBlockReason: null,
      publicationBlockDetails: [],
      displayRecommendation,
    };
  }

  if (input.approvalStatus !== "PRODUCTION_APPROVED") {
    return {
      rawModelRecommendation: input.rawRecommendation,
      publicationStatus: "BLOCKED",
      publicationBlockReason: approvalBlockReason(input.approvalStatus),
      publicationBlockDetails: input.approvalReasons,
      displayRecommendation: "Neutral",
    };
  }

  if (input.effectivePublishedRecommendation === "Neutral") {
    return {
      rawModelRecommendation: input.rawRecommendation,
      publicationStatus: "BLOCKED",
      publicationBlockReason: "EFFECTIVE_POLICY_DECISION_NO_PLAY",
      publicationBlockDetails: [],
      displayRecommendation: "Neutral",
    };
  }

  return {
    rawModelRecommendation: input.rawRecommendation,
    publicationStatus: isActionable(input.effectivePublishedRecommendation ?? "")
      ? "PUBLISHED"
      : "PUBLISHABLE",
    publicationBlockReason: null,
    publicationBlockDetails: [],
    displayRecommendation,
  };
}

export function summarizeRecommendationPublication(
  rows: RecommendationPublicationState[],
) {
  const rawDistribution: Record<string, number> = {};
  const publication: Record<PublicationStatus, number> = {
    PUBLISHED: 0,
    PUBLISHABLE: 0,
    BLOCKED: 0,
    NOT_APPLICABLE_NO_PLAY: 0,
  };
  const blockedReasons: Record<string, number> = {};
  for (const row of rows) {
    rawDistribution[row.rawModelRecommendation] =
      (rawDistribution[row.rawModelRecommendation] ?? 0) + 1;
    publication[row.publicationStatus]++;
    if (row.publicationBlockReason) {
      blockedReasons[row.publicationBlockReason] =
        (blockedReasons[row.publicationBlockReason] ?? 0) + 1;
    }
  }
  return { totalGames: rows.length, rawDistribution, publication, blockedReasons };
}