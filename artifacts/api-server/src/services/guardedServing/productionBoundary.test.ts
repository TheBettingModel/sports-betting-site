import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  config: { mlbMode: "v4_guarded" as any, ncaafMode: "legacy" as any },
  identity: { sport: "MLB" as const, market: "moneyline", modelFamily: "expected-runs", modelId: "tbm-mlb-moneyline-v4", modelVersion: "4.0.0", artifactId: "artifact-fixture", artifactHash: "hash-fixture", inputContractVersion: "model-input-v4" },
  approval: { state: "UNVALIDATED", approved: false, eventId: null, reason: "EXACT_APPROVAL_RECORD_MISSING", decidedAt: null } as any,
  persist: vi.fn(), auditValues: vi.fn(),
}));
vi.mock("./config", () => ({ guardedServingConfig: state.config }));
vi.mock("./candidateRegistry", () => ({ getCurrentMlbCandidateIdentity: vi.fn(async () => state.identity), getCurrentNcaafCandidateIdentity: vi.fn() }));
vi.mock("./approvalRegistry", () => ({ resolveExactApproval: vi.fn(async () => state.approval) }));
vi.mock("./persistence", () => ({ persistOfficialPredictionIdentity: state.persist }));
vi.mock("@workspace/db", () => ({ db: { insert: vi.fn(() => ({ values: state.auditValues })) }, guardedServingAuditsTable: {} }));

import { resolveProductionPredictionBoundary, shouldRunIncumbentSnapshot } from "./productionBoundary";

const game = { sport: "MLB", espnId: "integration-game" } as any;
const projection = { incumbent: true } as any;
const eligibleContext = { dataQuality: { missingSignals: [] } } as any;

describe("central guarded production boundary", () => {
  beforeEach(() => {
    state.config.mlbMode = "v4_guarded";
    state.approval = { state: "UNVALIDATED", approved: false, eventId: null, reason: "EXACT_APPROVAL_RECORD_MISSING", decidedAt: null };
    state.persist.mockReset(); state.auditValues.mockReset();
  });

  it("falls back on an exact unapproved guarded candidate without executor publication", async () => {
    const result = await resolveProductionPredictionBoundary(game, projection, eligibleContext);
    expect(result).toMatchObject({ disposition: "FALLBACK", projection, resolution: { kind: "V1_FALLBACK", reason: "V4_NOT_APPROVED" } });
    expect(state.persist).not.toHaveBeenCalled();
    expect(state.auditValues).toHaveBeenCalledWith(expect.objectContaining({ fallbackUsed: true, selectedEngine: "tbm-mlb-moneyline-v1" }));
  });

  it("does not permit a controller-supplied candidate executor to bypass the central registry", async () => {
    state.approval = { state: "GUARDED_APPROVED", approved: true, eventId: "fixture", reason: "EXACT_APPROVAL_CONFIRMED", decidedAt: new Date() };
    const executor = {
      modelId: state.identity.modelId, inputContractVersion: state.identity.inputContractVersion,
      execute: vi.fn(async () => ({
        predictionId: 42, projection: { candidate: true },
        adapterInput: {
          sport: "MLB", gameId: game.espnId, market: "moneyline", selection: "home",
          line: null, odds: -110, sportsbook: "fixture", modelProbability: .55, impliedProbability: .52,
          edge: .03, confidence: "fixture", recommendation: "LEAN", units: 0,
          rawEvidence: { immutable: true },
          identity: { sport: "MLB", engine: state.identity.modelId, modelFamily: state.identity.modelFamily,
            modelVersion: state.identity.modelVersion, artifactId: state.identity.artifactId, servingMode: "v4_guarded",
            inputVersion: state.identity.inputContractVersion, approvalStatus: "GUARDED_APPROVED",
            fallbackUsed: false, fallbackFrom: null, fallbackReason: null, predictionTimestamp: new Date().toISOString(),
            artifactHash: state.identity.artifactHash },
        },
      })),
    };
    const result = await (resolveProductionPredictionBoundary as Function)(game, projection, eligibleContext, executor);
    expect(result).toMatchObject({ disposition: "FALLBACK", projection });
    expect(executor.execute).not.toHaveBeenCalled();
    expect(state.persist).not.toHaveBeenCalled();
  });

  it("allows only incumbent or explicit fallback into the incumbent snapshot writer", () => {
    expect(shouldRunIncumbentSnapshot({ disposition: "INCUMBENT", projection, resolution: null })).toBe(true);
    expect(shouldRunIncumbentSnapshot({ disposition: "FALLBACK", projection, resolution: {} as any })).toBe(true);
    expect(shouldRunIncumbentSnapshot({ disposition: "PASS", projection: null, resolution: {} as any })).toBe(false);
    expect(shouldRunIncumbentSnapshot({ disposition: "CANDIDATE", projection, resolution: {} as any })).toBe(false);
  });
});