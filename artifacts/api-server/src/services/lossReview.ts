/**
 * Evidence-based outcome reviews.
 *
 * Reviews deliberately describe what the decision record and market data show.
 * They never infer an unmeasured cause for a one-game result.
 */

export type OutcomeReview = {
  version: 2;
  status: "reviewed" | "insufficient_pregame_evidence";
  reviewedAt: string;
  reviewedResult: "win" | "loss";
  primaryClassification: string;
  flags: string[];
  summary: string;
  improvementActions: Array<{
    area: "calibration" | "data_quality" | "market" | "availability" | "factor_review" | "monitoring";
    priority: "high" | "medium" | "low";
    action: string;
  }>;
  evidence: {
    modelProbability: number;
    impliedProbability: number | null;
    closingLineValue: number | null;
    calibrationError: number;
    dataQuality: Record<string, unknown>;
    factorEvidence: Array<{
      factor: string;
      contribution: number;
      supportedPick: boolean | null;
      agreedWithOutcome: boolean | null;
    }>;
    availabilityChanged: boolean;
    wnbaSegmentation?: Record<string, unknown>;
  };
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normaliseAvailability(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(normaliseAvailability).sort().join(",")}]`;
  const record = asRecord(value);
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${normaliseAvailability(record[key])}`,
  ).join(",")}}`;
}

function buildImprovementActions(input: {
  result: "win" | "loss";
  modelProbability: number;
  clv: number | null;
  missingSignals: string[];
  availabilityChanged: boolean;
  factorEvidence: Array<{ factor: string; agreedWithOutcome: boolean | null }>;
}): OutcomeReview["improvementActions"] {
  const actions: OutcomeReview["improvementActions"] = [];

  if (input.missingSignals.length > 0) {
    actions.push({
      area: "data_quality",
      priority: "high",
      action: `Improve pregame coverage for: ${input.missingSignals.join(", ")}.`,
    });
  }
  if (input.availabilityChanged) {
    actions.push({
      area: "availability",
      priority: "high",
      action: "Review late lineup, starter, goalie, or injury changes before publishing similar picks.",
    });
  }
  if (input.clv != null && input.clv < 0) {
    actions.push({
      area: "market",
      priority: "medium",
      action: "Monitor adverse market movement and require confirmation before raising conviction.",
    });
  }

  const misleading = input.factorEvidence
    .filter((factor) => factor.agreedWithOutcome === false)
    .slice(0, 2)
    .map((factor) => factor.factor);
  if (misleading.length > 0) {
    actions.push({
      area: "factor_review",
      priority: "medium",
      action: `Track ${misleading.join(" and ")} against a larger sample before changing factor weights.`,
    });
  }
  if (input.result === "loss" && input.modelProbability >= 0.65) {
    actions.push({
      area: "calibration",
      priority: "high",
      action: "Dampen high-confidence probabilities until this confidence band is better calibrated.",
    });
  }
  if (actions.length === 0) {
    actions.push({
      area: "monitoring",
      priority: "low",
      action: input.result === "win"
        ? "Retain this signal mix and confirm it across a larger sample."
        : "Record this outcome as variance; do not make a one-game model change.",
    });
  }

  return actions.slice(0, 4);
}

export function isDecisionSnapshot(snapshot: unknown): snapshot is JsonRecord {
  const record = asRecord(snapshot);
  const schemaVersion = record.schemaVersion;
  const decision = record.decision;
  // Version 2 is the original decision-evidence format. Version 3 is the
   // current full-game snapshot, version 4 adds the first immutable policy
  // revision, and version 5 is the material-pregame revision shape. All retain
  // the same complete decision evidence required for safe review and learning.
  return (
    schemaVersion === 2
    || schemaVersion === 3
    || schemaVersion === 4
    || schemaVersion === 5
  )
    && isRecord(decision)
    && isRecord(decision.factorContributions)
    && isRecord(decision.availability)
    && isRecord(decision.dataQuality);
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
        version: 2,
      status: "insufficient_pregame_evidence",
      reviewedAt: new Date().toISOString(),
      reviewedResult: input.result,
      primaryClassification: "insufficient_pregame_evidence",
      flags: ["historical_snapshot_missing_decision_evidence"],
      summary: "This historical pick was graded, but its pregame decision evidence was not retained. It is excluded from factor learning rather than reconstructed from later data.",
        improvementActions: [{
          area: "data_quality",
          priority: "high",
          action: "Save an immutable pregame decision snapshot before using future outcomes for factor learning.",
        }],
      evidence: {
        modelProbability: input.modelProbability,
        impliedProbability: input.impliedProbability,
        closingLineValue: input.clv,
          calibrationError: Math.abs(input.modelProbability - (input.result === "win" ? 1 : 0)),
        dataQuality: {},
        factorEvidence: [],
        availabilityChanged: false,
      },
    };
  }

  const selectedHome = input.selection === "home"
    ? true
    : input.selection === "away"
      ? false
      : null;
  const actualHome = selectedHome == null
    ? null
    : input.result === "win" ? selectedHome : !selectedHome;
  const factorEvidence = Object.entries(contributions)
    .map(([factor, rawContribution]) => {
      const contribution = toNumber(rawContribution);
      if (contribution == null || Math.abs(contribution) < 0.0001) return null;
      const factorFavoursHome = contribution > 0;
      return {
        factor,
        contribution,
       supportedPick: selectedHome == null ? null : selectedHome === factorFavoursHome,
       agreedWithOutcome: actualHome == null ? null : actualHome === factorFavoursHome,
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
  if (input.result === "loss" && input.modelProbability >= 0.65) {
    flags.push("high_confidence_miss");
  }
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
    version: 2,
    status: "reviewed",
    reviewedAt: new Date().toISOString(),
    reviewedResult: input.result,
    primaryClassification,
    flags,
    summary: summaryParts.join(" "),
    improvementActions: buildImprovementActions({
      result: input.result,
      modelProbability: input.modelProbability,
      clv: input.clv,
      missingSignals,
      availabilityChanged,
      ...(isRecord(snapshot.wnbaSegmentation)
        ? { wnbaSegmentation: snapshot.wnbaSegmentation }
        : {}),
      factorEvidence,
    }),
    evidence: {
      modelProbability: input.modelProbability,
      impliedProbability: input.impliedProbability,
      closingLineValue: input.clv,
      calibrationError: Math.abs(input.modelProbability - (input.result === "win" ? 1 : 0)),
      dataQuality,
      factorEvidence: factorEvidence.slice(0, 8),
      availabilityChanged,
    },
  };
}