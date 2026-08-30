import { describe, expect, it } from "vitest";
import {
  deriveApprovalStatus,
  deriveAutomaticApprovalTransition,
  evaluateBettingQuality,
  grandfatherApprovalCutoffs,
  isEstablishedProductionMoneylineModel,
  marketApprovalDecisionHash,
} from "./marketApproval";

const passed = { status: "PASSED" as const, reasons: [], metrics: {} };

describe("market approval lifecycle", () => {
  it("grandfathers only the named production moneyline v1 models", () => {
    expect(isEstablishedProductionMoneylineModel({
      modelId: "tbm-mlb-moneyline-v1",
      market: "moneyline",
      status: "production",
    })).toBe(true);
    expect(isEstablishedProductionMoneylineModel({
      modelId: "tbm-mlb-moneyline-v2",
      market: "moneyline",
      status: "production",
    })).toBe(false);
    expect(isEstablishedProductionMoneylineModel({
      modelId: "tbm-mlb-moneyline-v1",
      market: "spread",
      status: "production",
    })).toBe(false);
    expect(isEstablishedProductionMoneylineModel({
      modelId: "tbm-mlb-moneyline-v1",
      market: "moneyline",
      status: "retired",
    })).toBe(false);
  });

  it("overrides every distinct historical approval cutoff deterministically", () => {
    const createdAt = new Date("2026-07-20T00:00:00Z");
    const later = new Date("2026-08-29T23:59:59.999Z");
    expect(grandfatherApprovalCutoffs(createdAt, [later, createdAt, later]))
      .toEqual([createdAt, later]);
  });

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

  it("automatically graduates only when every independent layer passes", () => {
    expect(deriveAutomaticApprovalTransition({
      evaluation: {
        hasEvaluationEvidence: true,
        dataIntegrity: passed,
        predictiveQuality: passed,
        bettingQuality: passed,
      },
      previousStatus: "PROVISIONAL",
      evidenceValid: true,
      evidenceStale: false,
    })).toMatchObject({
      status: "PRODUCTION_APPROVED",
      transition: "graduation",
    });
  });

  it("suspends trusted markets on stale or invalid evidence", () => {
    expect(deriveAutomaticApprovalTransition({
      evaluation: {
        hasEvaluationEvidence: true,
        dataIntegrity: passed,
        predictiveQuality: passed,
        bettingQuality: passed,
      },
      previousStatus: "PRODUCTION_APPROVED",
      evidenceValid: true,
      evidenceStale: true,
    })).toMatchObject({
      status: "SUSPENDED",
      transition: "suspension",
      reasons: ["evidence_stale"],
    });
  });

  it("appends a reinstatement state after suspended evidence recovers", () => {
    expect(deriveAutomaticApprovalTransition({
      evaluation: {
        hasEvaluationEvidence: true,
        dataIntegrity: passed,
        predictiveQuality: passed,
        bettingQuality: passed,
      },
      previousStatus: "SUSPENDED",
      evidenceValid: true,
      evidenceStale: false,
    })).toMatchObject({
      status: "PRODUCTION_APPROVED",
      transition: "reinstatement",
      recovered: true,
    });
  });

  it("does not let a failed exact identity inherit another identity's approval", () => {
    const approvedIdentity = {
      sport: "NFL",
      market: "spread",
      modelVersion: "nfl-spread-v1",
      evaluationVersion: "spread-validation-v2",
      datasetVersion: "dataset-a",
      featureSchemaVersion: "features-a",
    };
    const mismatchedIdentity = { ...approvedIdentity, datasetVersion: "dataset-b" };
    expect(marketApprovalDecisionHash(approvedIdentity))
      .not.toBe(marketApprovalDecisionHash(mismatchedIdentity));
  });
});