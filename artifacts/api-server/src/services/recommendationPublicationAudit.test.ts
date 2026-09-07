import { describe, expect, it } from "vitest";
import {
  classifyRecommendationPublication,
  summarizeRecommendationPublication,
} from "./recommendationPublicationAudit";

describe("recommendation/publication separation", () => {
  it("keeps a true Neutral distinct from a blocked play", () => {
    expect(classifyRecommendationPublication({
      rawRecommendation: "Neutral",
      approvalStatus: "UNVALIDATED",
      approvalReasons: ["exact_approval_record_missing"],
    })).toMatchObject({
      publicationStatus: "NOT_APPLICABLE_NO_PLAY",
      publicationBlockReason: null,
      displayRecommendation: "Neutral",
    });
  });

  it.each(["Strong Buy", "Buy"])("masks blocked %s without changing raw opinion", (rawRecommendation) => {
    expect(classifyRecommendationPublication({
      rawRecommendation,
      approvalStatus: "UNVALIDATED",
      approvalReasons: ["exact_approval_record_missing"],
    })).toEqual({
      rawModelRecommendation: rawRecommendation,
      publicationStatus: "BLOCKED",
      publicationBlockReason: "EXACT_APPROVAL_MISSING",
      publicationBlockDetails: ["exact_approval_record_missing"],
      displayRecommendation: "Neutral",
    });
  });

  it("preserves production-approved publication", () => {
    expect(classifyRecommendationPublication({
      rawRecommendation: "Strong Buy",
      approvalStatus: "PRODUCTION_APPROVED",
      approvalReasons: [],
      effectivePublishedRecommendation: "Strong Buy",
    })).toMatchObject({
      publicationStatus: "PUBLISHED",
      displayRecommendation: "Strong Buy",
    });
  });

  it("reports an effective no-play policy decision separately", () => {
    expect(classifyRecommendationPublication({
      rawRecommendation: "Buy",
      approvalStatus: "PRODUCTION_APPROVED",
      approvalReasons: [],
      effectivePublishedRecommendation: "Neutral",
    })).toMatchObject({
      publicationStatus: "BLOCKED",
      publicationBlockReason: "EFFECTIVE_POLICY_DECISION_NO_PLAY",
      displayRecommendation: "Neutral",
    });
  });

  it("reconciles admin counts", () => {
    const rows = [
      classifyRecommendationPublication({ rawRecommendation: "Neutral", approvalStatus: "UNVALIDATED", approvalReasons: [] }),
      classifyRecommendationPublication({ rawRecommendation: "Buy", approvalStatus: "UNVALIDATED", approvalReasons: [] }),
      classifyRecommendationPublication({ rawRecommendation: "Buy", approvalStatus: "PRODUCTION_APPROVED", approvalReasons: [], effectivePublishedRecommendation: "Buy" }),
    ];
    expect(summarizeRecommendationPublication(rows)).toEqual({
      totalGames: 3,
      rawDistribution: { Neutral: 1, Buy: 2 },
      publication: { PUBLISHED: 1, PUBLISHABLE: 0, BLOCKED: 1, NOT_APPLICABLE_NO_PLAY: 1 },
      blockedReasons: { EXACT_APPROVAL_MISSING: 1 },
    });
  });
});