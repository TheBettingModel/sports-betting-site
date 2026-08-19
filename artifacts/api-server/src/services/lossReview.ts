/**
 * Evidence-based outcome reviews.
 *
 * Reviews deliberately describe what the decision record and market data show.
 * They never infer an unmeasured cause for a one-game result.
 */

export type OutcomeReview = {
  version: 1;
  status: "reviewed" | "insufficient_pregame_evidence";
  reviewedAt: string;
  reviewedResult: "win" | "loss";
  primaryClassification: string;
  flags: string[];
  summary: string;
  evidence: {
    modelProbability: number;
    impliedProbability: number | null;
    closingLineValue: number | null;
    dataQuality: Record<string, unknown>;
    factorEvidence: Array<{
      factor: string;
      contribution: number;
      supportedPick: boolean | null;
      agreedWithOutcome: boolean | null;
    }>;
    availabilityChanged: boolean;
  };
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normaliseAvailability(value: unknown): string {
  const record = asRecord(value);
  return JSON.stringify(record, Object.keys(record).sort());
}

export function isDecisionSnapshot(snapshot: unknown): snapshot is JsonRecord {
  return asRecord(snapshot).schemaVersion === 2;
}

export function buildOutcomeReview(input: {
  snapshot: unknown;
  selection: string;
  result: "win" | "loss";
  modelProbability: number;
  impliedProbability: number | null;
  clv: number | null;
  currentAvailability?: JsonRecord;
}): OutcomeReview {
  const snapshot = asRecord(input.snapshot);
  const decision = asRecord(snapshot.decision);
  const dataQuality = asRecord(decision.dataQuality);
  const availability = asRecord(decision.availability);
  const contributions = asRecord(decision.factorContributions);

  if (!isDecisionSnapshot(snapshot)) {
    return {
      version: 1,
      status: "insufficient_pregame_evidence",
      reviewedAt: new Date().toISOString(),
      reviewedResult: input.result,
      primaryClassification: "insufficient_pregame_evidence",
      flags: ["historical_snapshot_missing_decision_evidence"],
      summary: "This historical pick was graded, but its pregame decision evidence was not retained. It is excluded from factor learning rather than reconstructed from later data.",
      evidence: {
        modelProbability: input.modelProbability,
        impliedProbability: input.impliedProbability,
        closingLineValue: input.clv,
        dataQuality: {},
        factorEvidence: [],
        availabilityChanged: false,
      },
    };
  }

  const selectedHome = input.selection === "home";
  const actualHome = input.result === "win" ? selectedHome : !selectedHome;
  const factorEvidence = Object.entries(contributions)
    .map(([factor, rawContribution]) => {
      const contribution = toNumber(rawContribution);
      if (contribution == null || Math.abs(contribution) < 0.0001) return null;
      const factorFavoursHome = contribution > 0;
      return {
        factor,
        contribution,
        supportedPick: selectedHome === factorFavoursHome,
        agreedWithOutcome: actualHome === factorFavoursHome,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const totalMagnitude = factorEvidence.reduce((sum, row) => sum + Math.abs(row.contribution), 0);
  const supportMagnitude = factorEvidence
    .filter((row) => row.supportedPick)
    .reduce((sum, row) => sum + Math.abs(row.contribution), 0);
  const supportShare = totalMagnitude > 0 ? supportMagnitude / totalMagnitude : null;

  const missingSignals = Array.isArray(dataQuality.missingSignals)
    ? dataQuality.missingSignals.filter((value): value is string => typeof value === "string")
    : [];
  const availabilityChanged = input.currentAvailability != null
    && Object.keys(availability).length > 0
    && normaliseAvailability(availability) !== normaliseAvailability(input.currentAvailability);

  const flags: string[] = [];
  if (missingSignals.length > 0) flags.push("missing_or_stale_pregame_data");
  if (availabilityChanged) flags.push("availability_changed_after_snapshot");
  if (input.clv != null && input.clv < 0) flags.push("market_moved_against_pick");
  if (supportShare != null && supportShare < 0.65) flags.push("conflicting_model_signals");
  if (
    input.result === "loss" &&
    input.clv != null &&
    input.clv > 0 &&
    input.modelProbability >= 0.52 &&
    input.modelProbability <= 0.70
  ) {
    flags.push("high_variance_outcome");
  }
  if (flags.length === 0 && input.result === "loss") flags.push("no_measurable_pregame_exception");

  const primaryClassification = flags[0] ?? "pick_won";
  const summaryParts: string[] = [];
  if (input.result === "loss") {
    summaryParts.push(`The ${input.selection} selection lost after a ${(input.modelProbability * 100).toFixed(1)}% pregame model probability.`);
  } else {
    summaryParts.push(`The ${input.selection} selection won after a ${(input.modelProbability * 100).toFixed(1)}% pregame model probability.`);
  }
  if (input.clv != null) {
    summaryParts.push(input.clv >= 0
      ? "The pick beat the recorded closing price."
      : "The recorded closing price moved against the pick.");
  }
  if (missingSignals.length > 0) {
    summaryParts.push(`Pregame evidence was incomplete: ${missingSignals.join(", ")}.`);
  }
  if (availabilityChanged) {
    summaryParts.push("The latest recorded availability differs from the pregame snapshot; this is a timing signal, not proof of causation.");
  }
  if (supportShare != null && supportShare < 0.65) {
    summaryParts.push("The saved factor contributions were internally mixed rather than uniformly supporting the selection.");
  }

  return {
    version: 1,
    status: "reviewed",
    reviewedAt: new Date().toISOString(),
    reviewedResult: input.result,
    primaryClassification,
    flags,
    summary: summaryParts.join(" "),
    evidence: {
      modelProbability: input.modelProbability,
      impliedProbability: input.impliedProbability,
      closingLineValue: input.clv,
      dataQuality,
      factorEvidence: factorEvidence.slice(0, 8),
      availabilityChanged,
    },
  };
}