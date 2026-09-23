import type {
  EligibilitySignals, ExactApproval, ExactArtifactIdentity, MlbModelMode,
  MlbResolution, NcaafModelMode, NcaafResolution, ResolutionBase,
} from "./types";
import {
  MLB_CANDIDATE_ENGINE, MLB_INCUMBENT_ENGINE,
  NCAAF_CANDIDATE_ENGINE, NCAAF_INCUMBENT_ENGINE,
} from "./types";

function result<K extends string>(
  kind: K,
  reason: string,
  selectedEngine: string | null,
  approval: ExactApproval,
  health: EligibilitySignals["runtimeHealth"],
  fallbackFrom: string | null = null,
): ResolutionBase<K> {
  return {
    kind, reason, selectedEngine,
    fallbackUsed: fallbackFrom !== null,
    fallbackFrom,
    candidateApproval: approval.state,
    candidateHealth: health,
  };
}

function commonFailure(signals: EligibilitySignals, prefix: "V4" | "NEXTGEN"): string | null {
  if (!signals.identityResolved) return `${prefix}_IDENTITY_UNRESOLVED`;
  if (!signals.inputAvailable) return `${prefix}_INPUT_MISSING`;
  if (!signals.inputFresh) return `${prefix}_INPUT_STALE`;
  if (!signals.contextComplete) return `${prefix}_CONTEXT_INCOMPLETE`;
  if (!signals.pitSafe) return `${prefix}_PIT_FAILURE`;
  if (!signals.leakageSafe) return `${prefix}_LEAKAGE_FAILURE`;
  if (!signals.marketFresh) return `${prefix}_MARKET_STALE`;
  if (signals.runtimeHealth !== "CANDIDATE_HEALTHY") return `${prefix}_RUNTIME_UNHEALTHY`;
  if (!signals.publicationEligible) return `${prefix}_PUBLICATION_REJECTED`;
  return null;
}

function approvalEligible(approval: ExactApproval, full: boolean): boolean {
  return approval.approved && (full
    ? ["FULL_APPROVED", "PRODUCTION_APPROVED"].includes(approval.state)
    : ["GUARDED_APPROVED", "FULL_APPROVED", "PRODUCTION_APPROVED"].includes(approval.state));
}

export function resolveMlbProductionEngine(context: {
  mode: MlbModelMode;
  identity: ExactArtifactIdentity;
  approval: ExactApproval;
  signals: EligibilitySignals;
}): MlbResolution {
  const { mode, approval, signals } = context;
  if (mode === "v1") {
    return signals.incumbentEligible
      ? result("V1_PRIMARY", "MLB_MODE_V1", MLB_INCUMBENT_ENGINE, approval, signals.runtimeHealth)
      : result("PASS", "V1_INELIGIBLE", null, approval, signals.runtimeHealth);
  }
  const critical = commonFailure(signals, "V4");
  const candidateReason = !approvalEligible(approval, mode === "v4")
    ? approval.state === "REVOKED" ? "V4_APPROVAL_REVOKED" : "V4_NOT_APPROVED"
    : context.identity.market !== "moneyline" ? "V4_MARKET_NOT_APPROVED"
    : !signals.starterOrQbComplete ? "V4_STARTER_STATE_INCOMPLETE"
    : !signals.teamStateComplete ? "V4_TEAM_STATE_INCOMPLETE"
    : critical;
  if (!candidateReason) {
    return mode === "v4_guarded"
      ? result("V4_GUARDED", "V4_ALL_GATES_PASSED", MLB_CANDIDATE_ENGINE, approval, signals.runtimeHealth)
      : result("V4_FULL", "V4_ALL_GATES_PASSED", MLB_CANDIDATE_ENGINE, approval, signals.runtimeHealth);
  }
  const mustPass = ["V4_IDENTITY_UNRESOLVED", "V4_PIT_FAILURE", "V4_LEAKAGE_FAILURE", "V4_MARKET_STALE", "V4_PUBLICATION_REJECTED"].includes(candidateReason);
  if (!mustPass && signals.incumbentEligible) {
    return result("V1_FALLBACK", candidateReason, MLB_INCUMBENT_ENGINE, approval, signals.runtimeHealth, MLB_CANDIDATE_ENGINE);
  }
  return result("PASS", candidateReason, null, approval, signals.runtimeHealth);
}

export function resolveNcaafProductionEngine(context: {
  mode: NcaafModelMode;
  identity: ExactArtifactIdentity;
  approval: ExactApproval;
  signals: EligibilitySignals;
}): NcaafResolution {
  const { mode, approval, signals } = context;
  if (mode === "legacy") {
    return signals.incumbentEligible
      ? result("LEGACY_PRIMARY", "NCAAF_MODE_LEGACY", NCAAF_INCUMBENT_ENGINE, approval, signals.runtimeHealth)
      : result("PASS", "LEGACY_INELIGIBLE", null, approval, signals.runtimeHealth);
  }
  const critical = commonFailure(signals, "NEXTGEN");
  const candidateReason = !approvalEligible(approval, mode === "nextgen")
    ? approval.state === "REVOKED" ? "NEXTGEN_APPROVAL_REVOKED" : "NEXTGEN_NOT_APPROVED"
    : !["moneyline", "spread", "total"].includes(context.identity.market) ? "NEXTGEN_MARKET_NOT_APPROVED"
    : !signals.starterOrQbComplete ? "NEXTGEN_QB_STATE_INCOMPLETE"
    : !signals.teamStateComplete ? "NEXTGEN_INJURY_STATE_INCOMPLETE"
    : critical;
  if (!candidateReason) {
    return mode === "nextgen_guarded"
      ? result("NEXTGEN_GUARDED", "NEXTGEN_ALL_GATES_PASSED", NCAAF_CANDIDATE_ENGINE, approval, signals.runtimeHealth)
      : result("NEXTGEN_FULL", "NEXTGEN_ALL_GATES_PASSED", NCAAF_CANDIDATE_ENGINE, approval, signals.runtimeHealth);
  }
  const mustPass = ["NEXTGEN_IDENTITY_UNRESOLVED", "NEXTGEN_PIT_FAILURE", "NEXTGEN_LEAKAGE_FAILURE", "NEXTGEN_MARKET_STALE", "NEXTGEN_PUBLICATION_REJECTED"].includes(candidateReason);
  if (!mustPass && signals.incumbentEligible) {
    return result("LEGACY_FALLBACK", candidateReason, NCAAF_INCUMBENT_ENGINE, approval, signals.runtimeHealth, NCAAF_CANDIDATE_ENGINE);
  }
  return result("PASS", candidateReason, null, approval, signals.runtimeHealth);
}