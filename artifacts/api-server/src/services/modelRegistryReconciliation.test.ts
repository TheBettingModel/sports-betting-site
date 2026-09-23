import { describe, expect, it } from "vitest";
import { isDeployableModelIdentity } from "./modelRegistry";
import {
  deriveMlbRegistryRepairPlan,
  isQualifiedPriorDeployment,
  type PriorDeploymentEvidence,
} from "./modelRegistryReconciliation";

function model(
  id: number,
  modelId: string,
  status: string,
  sport = "MLB",
  market = "moneyline",
) {
  return { id, modelId, status, sport, market };
}

function priorDeployment(
  modelVersionId: number,
  approvedBy: string | null = "admin",
  action = "auto_retire",
): PriorDeploymentEvidence {
  return {
    modelVersionId,
    action,
    previousStatus: action === "auto_retire" ? "production" : "approved",
    newStatus: action === "auto_retire" ? "retired" : "production",
    approvedBy,
    performedAt: new Date("2026-07-20T18:47:50.540Z"),
  };
}

describe("production model identity", () => {
  it("accepts canonical TBM versions and rejects fixture-like identities", () => {
    expect(isDeployableModelIdentity(model(1, "tbm-mlb-moneyline-v1", "production"))).toBe(true);
    expect(isDeployableModelIdentity(model(2, "tbm-mlb-moneyline-v20", "production"))).toBe(true);
    expect(isDeployableModelIdentity(model(3, "test-mlb-moneyline-v99-1784573270185", "production"))).toBe(false);
    expect(isDeployableModelIdentity(model(4, "mock-mlb-moneyline-v1", "production"))).toBe(false);
  });
});

describe("MLB registry contamination repair", () => {
  it("retires the contaminated production fixture and restores canonical v1", () => {
    const rows = [
      model(3, "tbm-mlb-moneyline-v1", "retired"),
      model(4, "tbm-mlb-moneyline-v2", "challenger"),
      model(9, "test-mlb-moneyline-v99-1784573270185", "production"),
    ];

    expect(deriveMlbRegistryRepairPlan(rows, [priorDeployment(3)])).toEqual({
      contaminatedProductionIds: [9],
      restoreModelId: 3,
      alreadyValidProductionId: null,
    });
    // The plan contains registry IDs only: immutable prediction rows are not
    // inputs to, nor mutation targets of, the repair.
    expect(rows).toEqual([
      model(3, "tbm-mlb-moneyline-v1", "retired"),
      model(4, "tbm-mlb-moneyline-v2", "challenger"),
      model(9, "test-mlb-moneyline-v99-1784573270185", "production"),
    ]);
  });

  it("accepts an auto-retire row as proof the canonical model was production", () => {
    const evidence = priorDeployment(3, "admin", "auto_retire");
    expect(evidence).toMatchObject({
      previousStatus: "production",
      newStatus: "retired",
    });
    expect(isQualifiedPriorDeployment(evidence)).toBe(true);
  });

  it("fails closed when valid and contaminated production models coexist", () => {
    expect(() => deriveMlbRegistryRepairPlan([
      model(3, "tbm-mlb-moneyline-v1", "production"),
      model(9, "test-mlb-moneyline-v99", "production"),
    ], [priorDeployment(3)])).toThrow(/both valid and contaminated/);
  });

  it("is idempotent when the registry is already valid", () => {
    expect(deriveMlbRegistryRepairPlan([
      model(3, "tbm-mlb-moneyline-v1", "production"),
      model(4, "tbm-mlb-moneyline-v2", "challenger"),
    ])).toEqual({
      contaminatedProductionIds: [],
      restoreModelId: null,
      alreadyValidProductionId: 3,
    });
  });

  it("fails closed when contamination has no canonical restore target", () => {
    expect(() => deriveMlbRegistryRepairPlan([
      model(9, "test-mlb-moneyline-v99", "production"),
    ], [])).toThrow(/without retired status and prior deployment history/);
  });

  it.each(["development", "challenger", "approved", "rejected"])(
    "will not restore a canonical model from %s status",
    (status) => {
      expect(() => deriveMlbRegistryRepairPlan([
        model(3, "tbm-mlb-moneyline-v1", status),
        model(9, "test-mlb-moneyline-v99", "production"),
      ], [priorDeployment(3)])).toThrow(/without retired status and prior deployment history/);
    },
  );

  it("will not restore a retired canonical model without prior deployment evidence", () => {
    expect(() => deriveMlbRegistryRepairPlan([
      model(3, "tbm-mlb-moneyline-v1", "retired"),
      model(9, "test-mlb-moneyline-v99", "production"),
    ], [])).toThrow(/without retired status and prior deployment history/);
  });

  it.each([
    priorDeployment(3, null),
    priorDeployment(3, "system"),
    priorDeployment(3, "system:model-registry-reconciliation"),
    priorDeployment(3, "admin", "registry_contamination_restore"),
    {
      ...priorDeployment(3, "admin", "auto_retire"),
      previousStatus: "retired",
    },
  ])("rejects synthetic or unnamed prior deployment provenance", (evidence) => {
    expect(isQualifiedPriorDeployment(evidence)).toBe(false);
    expect(() => deriveMlbRegistryRepairPlan([
      model(3, "tbm-mlb-moneyline-v1", "retired"),
      model(9, "test-mlb-moneyline-v99", "production"),
    ], [evidence])).toThrow(/without retired status and prior deployment history/);
  });
});