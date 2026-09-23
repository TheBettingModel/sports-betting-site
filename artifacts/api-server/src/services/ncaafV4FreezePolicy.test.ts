import { describe, expect, it } from "vitest";
import { stableHash, type V4ArtifactIdentity } from "./v4Platform";
import {
  assessNcaafV4FreezeReview, NCAAF_V4_MIN_GRADED_FBS_FORECASTS,
  NCAAF_V4_MIN_REVIEW_DAYS,
} from "./ncaafV4FreezePolicy";

const identity: V4ArtifactIdentity = {
  sport: "NCAAF", modelFamily: "test", modelId: "test-v4", modelVersion: "challenger-1",
  artifactId: "challenger-1", artifactHash: "artifact-hash", inputContractVersion: "input-v1",
  configurationHash: "config", parameterHash: "params", contractId: "contract", contractHash: "contract-hash",
};
const start = new Date("2026-01-01T00:00:00Z");
const observations = Array.from({ length: NCAAF_V4_MIN_GRADED_FBS_FORECASTS }, (_, index) => ({
  forecastId: `f-${index}`, kickoffAt: new Date(`2026-01-${String((index % 28) + 1).padStart(2, "0")}T20:00:00Z`),
  graded: true, homeClassification: "FBS", awayClassification: "FBS",
  immutablePregameEvidenceComplete: true, integrityFailures: [],
}));
const approval = {
  identity, approvedBy: "human-reviewer", approvedAt: new Date("2026-02-01T00:00:00Z"),
  identityHash: stableHash(identity),
};

describe("NCAAF V4 learning freeze policy", () => {
  it("reports eligible without changing the frozen production status", () => {
    const report = assessNcaafV4FreezeReview({
      observationStartAt: start, now: new Date(start.getTime() + NCAAF_V4_MIN_REVIEW_DAYS * 86400000),
      champion: { ...identity, modelVersion: "production-champion" }, observations, challenger: approval,
    });
    expect(report.decision).toBe("REVIEW_ELIGIBLE");
    expect(report.productionStatus).toBe("FROZEN");
  });

  it("fails closed for age, evidence, integrity, and exact human approval", () => {
    const report = assessNcaafV4FreezeReview({
      observationStartAt: start, now: new Date(start.getTime() + 27 * 86400000),
      champion: identity,
      observations: [{ ...observations[0]!, immutablePregameEvidenceComplete: false, integrityFailures: ["HASH_MISMATCH"] }],
      challenger: null,
    });
    expect(report.decision).toBe("NOT_ELIGIBLE");
    expect(report.reasons).toEqual(expect.arrayContaining([
      "minimumObservationAge", "minimumGradedFbsForecasts",
      "completeImmutablePregameEvidence", "noUnresolvedIntegrityFailures",
      "explicitExactChallengerApproval",
    ]));
  });
});