import { describe, expect, it } from "vitest";
import { parseMlbModelMode, parseNcaafModelMode, readGuardedServingConfig } from "./config";
import { resolveMlbProductionEngine, resolveNcaafProductionEngine } from "./resolvers";
import { adaptApprovedNextGenOutput, dryRunDisposition } from "./publicationAdapter";
import { DEFAULT_REVIEW_POLICIES, evaluateModelReview } from "./reviewEvaluator";
import { GUARDED_SERVING_APPEND_ONLY_TABLES } from "./appendOnlyGuards";
import { resolveProductionPredictionBoundary } from "./productionBoundary";
import { resolveRuntimeSportStatus } from "./runtimeStatus";
import type { FetchedGame } from "../espn";
import type { ProjectionResult } from "../model";
import type { EligibilitySignals, ExactApproval, ExactArtifactIdentity } from "./types";

const mlbIdentity: ExactArtifactIdentity = {
  sport: "MLB", market: "moneyline", modelFamily: "expected-runs",
  modelId: "tbm-mlb-moneyline-v4", modelVersion: "4.0.0",
  artifactId: "fixture-only", artifactHash: "fixture-hash",
  inputContractVersion: "model-input-v4",
};
const ncaafIdentity: ExactArtifactIdentity = {
  sport: "NCAAF", market: "moneyline", modelFamily: "expected-score-linear",
  modelId: "tbm-ncaaf-v4-expected-score", modelVersion: "D-simple-expected-score-linear",
  artifactId: "fixture-only", artifactHash: "fixture-hash",
  inputContractVersion: "ncaaf-v4-features",
};
const approved: ExactApproval = {
  state: "GUARDED_APPROVED", approved: true, eventId: "fixture",
  reason: "EXACT_APPROVAL_CONFIRMED", decidedAt: new Date(),
};
const unapproved: ExactApproval = {
  state: "UNVALIDATED", approved: false, eventId: null,
  reason: "EXACT_APPROVAL_RECORD_MISSING", decidedAt: null,
};
const healthy: EligibilitySignals = {
  identityResolved: true, inputAvailable: true, inputFresh: true,
  starterOrQbComplete: true, teamStateComplete: true, contextComplete: true,
  pitSafe: true, leakageSafe: true, marketFresh: true,
  runtimeHealth: "CANDIDATE_HEALTHY", publicationEligible: true,
  incumbentEligible: true,
};

describe("Task234 guarded serving configuration", () => {
  it("preserves safe incumbent defaults and accepts only typed modes", () => {
    expect(readGuardedServingConfig({})).toEqual({ mlbMode: "v1", ncaafMode: "legacy" });
    expect(parseMlbModelMode("v4_guarded")).toBe("v4_guarded");
    expect(parseNcaafModelMode("nextgen_guarded")).toBe("nextgen_guarded");
  });

  it("rejects invalid mode values instead of coercing toward a candidate", () => {
    expect(() => parseMlbModelMode("latest")).toThrow(/Invalid MLB_MODEL_MODE/);
    expect(() => parseNcaafModelMode("v4")).toThrow(/Invalid NCAAF_MODEL_MODE/);
  });
});

describe("Task234 authoritative resolvers", () => {
  it("leaves the actual central production boundary byte-for-byte incumbent under safe defaults", async () => {
    const projection = { sentinel: "same-incumbent-object" } as unknown as ProjectionResult;
    const game = { sport: "MLB", espnId: "central-boundary-fixture" } as FetchedGame;
    const result = await resolveProductionPredictionBoundary(game, projection);
    expect(result).toMatchObject({ disposition: "INCUMBENT", projection });
    expect(result.projection).toBe(projection);
  });

  it("makes incumbent modes operational kill switches", () => {
    expect(resolveMlbProductionEngine({ mode: "v1", identity: mlbIdentity, approval: approved, signals: healthy }))
      .toMatchObject({ kind: "V1_PRIMARY", selectedEngine: "tbm-mlb-moneyline-v1", fallbackUsed: false });
    expect(resolveNcaafProductionEngine({ mode: "legacy", identity: ncaafIdentity, approval: approved, signals: healthy }))
      .toMatchObject({ kind: "LEGACY_PRIMARY", selectedEngine: "tbm-ncaaf-moneyline-v1", fallbackUsed: false });
  });

  it("rejects the real unapproved-state shape in guarded mode with true fallback identity", () => {
    expect(resolveMlbProductionEngine({ mode: "v4_guarded", identity: mlbIdentity, approval: unapproved, signals: healthy }))
      .toMatchObject({ kind: "V1_FALLBACK", reason: "V4_NOT_APPROVED", selectedEngine: "tbm-mlb-moneyline-v1", fallbackFrom: "tbm-mlb-moneyline-v4" });
    expect(resolveNcaafProductionEngine({ mode: "nextgen_guarded", identity: ncaafIdentity, approval: unapproved, signals: healthy }))
      .toMatchObject({ kind: "LEGACY_FALLBACK", reason: "NEXTGEN_NOT_APPROVED", selectedEngine: "tbm-ncaaf-moneyline-v1", fallbackFrom: "tbm-ncaaf-v4-expected-score" });
  });

  it("selects candidates only in isolated exact approved fixtures", () => {
    expect(resolveMlbProductionEngine({ mode: "v4_guarded", identity: mlbIdentity, approval: approved, signals: healthy }).kind)
      .toBe("V4_GUARDED");
    expect(resolveNcaafProductionEngine({ mode: "nextgen_guarded", identity: ncaafIdentity, approval: approved, signals: healthy }).kind)
      .toBe("NEXTGEN_GUARDED");
  });

  it("keeps SHADOW_APPROVED barred and requires full approval in full mode", () => {
    const shadow = { ...approved, state: "SHADOW_APPROVED" as const };
    expect(resolveMlbProductionEngine({ mode: "v4_guarded", identity: mlbIdentity, approval: shadow, signals: healthy }).kind)
      .toBe("V1_FALLBACK");
    expect(resolveNcaafProductionEngine({ mode: "nextgen", identity: ncaafIdentity, approval: approved, signals: healthy }).kind)
      .toBe("LEGACY_FALLBACK");
  });

  it("uses PASS rather than an unsafe fallback after PIT or market failure", () => {
    expect(resolveMlbProductionEngine({
      mode: "v4_guarded", identity: mlbIdentity, approval: approved,
      signals: { ...healthy, pitSafe: false },
    })).toMatchObject({ kind: "PASS", reason: "V4_PIT_FAILURE", selectedEngine: null });
    expect(resolveNcaafProductionEngine({
      mode: "nextgen_guarded", identity: ncaafIdentity, approval: approved,
      signals: { ...healthy, marketFresh: false },
    })).toMatchObject({ kind: "PASS", reason: "NEXTGEN_MARKET_STALE", selectedEngine: null });
  });

  it("treats market approval as exact rather than sport-wide", () => {
    const unsupported = { ...mlbIdentity, market: "run_line" };
    expect(resolveMlbProductionEngine({ mode: "v4_guarded", identity: unsupported, approval: approved, signals: healthy }))
      .toMatchObject({ kind: "V1_FALLBACK", reason: "V4_MARKET_NOT_APPROVED" });
  });
});

describe("Task234 adapters, lifecycle runway, and review", () => {
  it("reports approved-but-unexecutable nextgen as startup blocked, never active", () => {
    const status = resolveRuntimeSportStatus(
      "MLB", "v4_guarded", "tbm-mlb-moneyline-v1", mlbIdentity, approved,
      new Date(), new Date(), false,
    );
    expect(status).toMatchObject({
      activePrimaryEngine: "tbm-mlb-moneyline-v1",
      executorAvailable: false,
      resolvedServingState: "STARTUP_BLOCKED",
      runtimeHealth: "CANDIDATE_RUNTIME_UNAVAILABLE",
      publicationStatus: "BLOCKED_BY_RUNTIME",
    });
  });

  it("cannot adapt an unapproved output and preserves raw evidence when approved", () => {
    const unapprovedResolution = resolveMlbProductionEngine({
      mode: "v4_guarded", identity: mlbIdentity, approval: unapproved, signals: healthy,
    });
    const rawEvidence = Object.freeze({ immutable: "raw-v4-evidence" });
    const input = {
      sport: "MLB" as const, gameId: "1", market: "moneyline", selection: "home",
      line: null, odds: -110, sportsbook: "book", modelProbability: .57,
      impliedProbability: .524, edge: .046, confidence: "High", recommendation: "Buy",
      units: 1, rawEvidence,
      identity: {
        sport: "MLB", engine: mlbIdentity.modelId, modelFamily: mlbIdentity.modelFamily,
        modelVersion: mlbIdentity.modelVersion, artifactId: mlbIdentity.artifactId, servingMode: "v4_guarded",
        inputVersion: mlbIdentity.inputContractVersion, approvalStatus: "UNVALIDATED" as const,
        fallbackUsed: false, fallbackFrom: null, fallbackReason: null,
        predictionTimestamp: new Date().toISOString(),
      },
    };
    expect(adaptApprovedNextGenOutput(input, unapprovedResolution)).toBeNull();
    expect(dryRunDisposition(unapprovedResolution, null)).toBe("WOULD_FALLBACK");
    const candidate = resolveMlbProductionEngine({
      mode: "v4_guarded", identity: mlbIdentity, approval: approved, signals: healthy,
    });
    const adapted = adaptApprovedNextGenOutput({
      ...input, identity: { ...input.identity, approvalStatus: "GUARDED_APPROVED" },
    }, candidate);
    expect(adapted?.rawEvidenceReference).toBe(rawEvidence);
    expect(adapted?.universal.podScore).toMatchObject({ status: "UNAVAILABLE", value: null });
    expect(dryRunDisposition(candidate, adapted)).toBe("WOULD_SERVE");
  });

  it("returns blockers without mutating approval and has distinct future NFL policy", () => {
    const review = evaluateModelReview(DEFAULT_REVIEW_POLICIES.MLB, {
      gradedSample: 0, prospectiveSample: 3, teamDiversity: 10, opponentDiversity: 10,
      starterOrQbDiversity: 30, observationDays: 3, calibrationPassed: false,
      clvPassed: false, pitPassed: true, leakagePassed: true, runtimeHealthy: true,
      runtimeReproducible: true, inputComplete: true, publicationCompatible: true,
      marketSamples: { moneyline: 3 }, knownLimitations: [],
    });
    expect(review.recommendation).toBe("BLOCK");
    expect(review.blockers).toContain("MINIMUM_PROSPECTIVE_SAMPLE_NOT_MET");
    expect(DEFAULT_REVIEW_POLICIES.NFL.sport).toBe("NFL");
    expect(DEFAULT_REVIEW_POLICIES.NFL.minimumObservationDays)
      .not.toBe(DEFAULT_REVIEW_POLICIES.MLB.minimumObservationDays);
  });

  it("declares all governance, resolution, identity, lifecycle, and policy tables append-only", () => {
    expect(GUARDED_SERVING_APPEND_ONLY_TABLES).toEqual(expect.arrayContaining([
      "model_artifact_approval_ledger", "guarded_serving_audits",
      "official_prediction_identity", "official_prediction_lifecycle", "model_review_policies",
    ]));
  });
});