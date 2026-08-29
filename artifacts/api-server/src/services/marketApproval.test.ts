import { describe, expect, it } from "vitest";
import {
  deriveApprovalStatus,
  evaluateBettingQuality,
  marketApprovalDecisionHash,
} from "./marketApproval";

const passed = { status: "PASSED" as const, reasons: [], metrics: {} };

describe("market approval lifecycle", () => {
  it("graduates each evidence layer in order", () => {
    expect(deriveApprovalStatus({
      hasEvaluationEvidence: false,
      dataIntegrity: passed,
      predictiveQuality: passed,
      bettingQuality: passed,
    })).toBe("UNVALIDATED");
    expect(deriveApprovalStatus({
      hasEvaluationEvidence: true,
      dataIntegrity: { ...passed, status: "FAILED" },
      predictiveQuality: passed,
      bettingQuality: passed,
    })).toBe("SHADOW");
    expect(deriveApprovalStatus({
      hasEvaluationEvidence: true,
      dataIntegrity: passed,
      predictiveQuality: passed,
      bettingQuality: { ...passed, status: "INSUFFICIENT" },
    })).toBe("PROVISIONAL");
    expect(deriveApprovalStatus({
      hasEvaluationEvidence: true,
      dataIntegrity: passed,
      predictiveQuality: passed,
      bettingQuality: passed,
    })).toBe("PRODUCTION_APPROVED");
  });

  it("does not use slightly negative ROI as a standalone veto", () => {
    expect(evaluateBettingQuality({
      clv: 0.02,
      roi: -0.01,
      maxDrawdown: 0.12,
      stability: 0.7,
      minimumClv: 0,
      maximumDrawdown: 0.2,
      minimumStability: 0.6,
    }).status).toBe("PASSED");
  });

  it("hashes versioned evidence contexts deterministically", () => {
    expect(marketApprovalDecisionHash({ b: 2, a: 1 }))
      .toBe(marketApprovalDecisionHash({ a: 1, b: 2 }));
  });
});