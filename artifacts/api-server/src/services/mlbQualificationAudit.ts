import type { ProjectionResult } from "./model";
import { MLB_MAX_FAVORITE_ODDS, removeVig2 } from "./model";
import type { MlbDecisionEvidence } from "./mlbDecisionEvidence";

/**
 * This module is intentionally pure: it creates observability and runs
 * non-publishing policy comparisons only. It does not import the database,
 * snapshot pipeline, notifications, grading, or learning services.
 */

export const MLB_BUY_THRESHOLD = 7;
export const MLB_STRONG_BUY_THRESHOLD = 12;
export const MLB_AWAY_THRESHOLD_OFFSET = 3;
export const DEFAULT_MLB_SHADOW_BUY_THRESHOLD = 5;

export interface MlbQualificationAudit {
  schemaVersion: "mlb-qualification-audit-v1";
  capturedAt: string;
  selectedSide: "home" | "away";
  pickOdds: number;
  verifiedMarket: {
    valid: boolean;
    homeFairProbability: number | null;
    awayFairProbability: number | null;
    selectedFairProbability: number | null;
  };
  modelProbability: number;
  edge: number;
  absoluteEdge: number;
  confidence: string;
  effectiveBuyThreshold: number;
  effectiveStrongBuyThreshold: number;
  priceCap: {
    maximumFavoriteOdds: number;
    evaluated: boolean;
    applies: boolean | null;
    passed: boolean | null;
  };
  requiredEvidence: {
    blocked: boolean;
    missingSignals: string[];
  };
  secondarySignalQualityReasons: string[];
  production: {
    recommendation: string;
    qualifiesBeforePublicationCap: boolean;
    primaryBlocker:
      | "required_evidence"
      | "edge_threshold"
      | "favorite_price_cap"
      | "none";
  };
}

export interface MlbShadowDecision {
  policy: {
    buyThreshold: number;
    strongBuyThreshold: number;
    awayThresholdOffset: number;
    maximumFavoriteOdds: number;
  };
  recommendation: "Strong Buy" | "Buy" | "Neutral";
  qualifiesBeforePublicationCap: boolean;
  primaryBlocker: MlbQualificationAudit["production"]["primaryBlocker"];
}

export interface MlbQualificationSummary {
  totalGames: number;
  auditUnavailable: number;
  requiredEvidenceBlocked: number;
  edgeThresholdFailed: number;
  favoritePriceCapFailed: number;
  qualifiedBeforePublicationCap: number;
  secondaryQualityReasonCounts: Record<string, number>;
}

function hasCredibleOdds(odds: number): boolean {
  return Number.isFinite(odds)
    && Number.isInteger(odds)
    && Math.abs(odds) >= 100
    && Math.abs(odds) <= 2_000;
}

function primaryBlocker(
  requiredEvidenceBlocked: boolean,
  meetsBuyThreshold: boolean,
  passesPriceCap: boolean,
): MlbQualificationAudit["production"]["primaryBlocker"] {
  if (requiredEvidenceBlocked) return "required_evidence";
  if (!meetsBuyThreshold) return "edge_threshold";
  if (!passesPriceCap) return "favorite_price_cap";
  return "none";
}

/**
 * Captures the current decision inputs without changing how the live model
 * chooses a recommendation. `proj.valueRating` remains the source of truth
 * for the production recommendation shown to subscribers.
 */
export function createMlbQualificationAudit(
  proj: ProjectionResult,
  evidence: MlbDecisionEvidence | undefined,
  capturedAt = new Date().toISOString(),
): MlbQualificationAudit {
  const selectedSide = proj.edge >= 0 ? "home" as const : "away" as const;
  // computeProjection deliberately fills its numeric response shape with
  // fallback odds when a source market is invalid. Diagnostics must never
  // mistake those placeholders for a verified, no-vig betting market.
  const sourceMarketAvailable = evidence?.signals.market?.available;
  const verifiedMarket = sourceMarketAvailable === undefined
    ? hasCredibleOdds(proj.vegasHomeOdds) && hasCredibleOdds(proj.vegasAwayOdds)
    : sourceMarketAvailable;
  const fair = verifiedMarket ? removeVig2(proj.vegasHomeOdds, proj.vegasAwayOdds) : null;
  const modelProbability = selectedSide === "home"
    ? proj.homeWinPct / 100
    : 1 - proj.homeWinPct / 100;
  const absoluteEdge = Math.abs(proj.edge);
  const effectiveBuyThreshold = selectedSide === "away"
    ? MLB_BUY_THRESHOLD + MLB_AWAY_THRESHOLD_OFFSET
    : MLB_BUY_THRESHOLD;
  const effectiveStrongBuyThreshold = selectedSide === "away"
    ? MLB_STRONG_BUY_THRESHOLD + MLB_AWAY_THRESHOLD_OFFSET
    : MLB_STRONG_BUY_THRESHOLD;
  const pickOdds = selectedSide === "home" ? proj.vegasHomeOdds : proj.vegasAwayOdds;
  const passesPriceCap = verifiedMarket ? pickOdds > MLB_MAX_FAVORITE_ODDS : null;
  const requiredEvidenceBlocked = evidence?.recommendationBlocked === true || !verifiedMarket;
  const meetsBuyThreshold = absoluteEdge >= effectiveBuyThreshold;

  return {
    schemaVersion: "mlb-qualification-audit-v1",
    capturedAt,
    selectedSide,
    pickOdds,
    verifiedMarket: {
      valid: verifiedMarket,
      homeFairProbability: fair?.home ?? null,
      awayFairProbability: fair?.away ?? null,
      selectedFairProbability: selectedSide === "home" ? (fair?.home ?? null) : (fair?.away ?? null),
    },
    modelProbability,
    edge: proj.edge,
    absoluteEdge,
    confidence: proj.confidence,
    effectiveBuyThreshold,
    effectiveStrongBuyThreshold,
    priceCap: {
      maximumFavoriteOdds: MLB_MAX_FAVORITE_ODDS,
      evaluated: verifiedMarket,
      applies: verifiedMarket ? pickOdds <= MLB_MAX_FAVORITE_ODDS : null,
      passed: passesPriceCap,
    },
    requiredEvidence: {
      blocked: requiredEvidenceBlocked,
      missingSignals: evidence?.missingSignals ?? (verifiedMarket ? [] : ["market_odds"]),
    },
    secondarySignalQualityReasons: evidence?.qualityReasons ?? [],
    production: {
      recommendation: proj.valueRating,
      qualifiesBeforePublicationCap: !requiredEvidenceBlocked && meetsBuyThreshold && passesPriceCap === true,
      primaryBlocker: primaryBlocker(requiredEvidenceBlocked, meetsBuyThreshold, passesPriceCap === true),
    },
  };
}

/**
 * Applies only a candidate Buy threshold. Strong Buy requirements, required
 * evidence, the away adjustment, and the -160 favorite ceiling never change.
 */
export function evaluateMlbShadowPolicy(
  audit: MlbQualificationAudit,
  buyThreshold = DEFAULT_MLB_SHADOW_BUY_THRESHOLD,
): MlbShadowDecision {
  if (!Number.isFinite(buyThreshold) || buyThreshold <= 0 || buyThreshold >= MLB_STRONG_BUY_THRESHOLD) {
    throw new Error(`Shadow Buy threshold must be greater than 0 and below ${MLB_STRONG_BUY_THRESHOLD}.`);
  }

  const effectiveBuyThreshold = audit.selectedSide === "away"
    ? buyThreshold + MLB_AWAY_THRESHOLD_OFFSET
    : buyThreshold;
  const meetsBuyThreshold = audit.absoluteEdge >= effectiveBuyThreshold;
  const meetsStrongBuyThreshold = audit.absoluteEdge >= audit.effectiveStrongBuyThreshold
    && audit.confidence === "High";
  const blocker = primaryBlocker(
    audit.requiredEvidence.blocked,
    meetsBuyThreshold,
    audit.priceCap.passed === true,
  );
  const qualifies = blocker === "none";

  return {
    policy: {
      buyThreshold,
      strongBuyThreshold: MLB_STRONG_BUY_THRESHOLD,
      awayThresholdOffset: MLB_AWAY_THRESHOLD_OFFSET,
      maximumFavoriteOdds: MLB_MAX_FAVORITE_ODDS,
    },
    recommendation: !qualifies
      ? "Neutral"
      : meetsStrongBuyThreshold
        ? "Strong Buy"
        : "Buy",
    qualifiesBeforePublicationCap: qualifies,
    primaryBlocker: blocker,
  };
}

export function summarizeMlbQualificationAudits(
  audits: Array<MlbQualificationAudit | null | undefined>,
): MlbQualificationSummary {
  const summary: MlbQualificationSummary = {
    totalGames: audits.length,
    auditUnavailable: 0,
    requiredEvidenceBlocked: 0,
    edgeThresholdFailed: 0,
    favoritePriceCapFailed: 0,
    qualifiedBeforePublicationCap: 0,
    secondaryQualityReasonCounts: {},
  };

  for (const audit of audits) {
    if (!audit) {
      summary.auditUnavailable++;
      continue;
    }
    if (audit.production.primaryBlocker === "required_evidence") summary.requiredEvidenceBlocked++;
    if (audit.production.primaryBlocker === "edge_threshold") summary.edgeThresholdFailed++;
    if (audit.production.primaryBlocker === "favorite_price_cap") summary.favoritePriceCapFailed++;
    if (audit.production.qualifiesBeforePublicationCap) summary.qualifiedBeforePublicationCap++;
    for (const reason of audit.secondarySignalQualityReasons) {
      summary.secondaryQualityReasonCounts[reason] = (summary.secondaryQualityReasonCounts[reason] ?? 0) + 1;
    }
  }

  return summary;
}

export interface GradedMlbDecision {
  selection: "home" | "away";
  odds: number | null;
  modelProbability: number;
  recommendation: string;
  edge: number;
  confidence: string;
  result: "win" | "loss" | "push";
  clv: number | null;
}

export interface MlbPolicyPerformance {
  selectedCount: number;
  gradedCandidateCount: number;
  coverage: number | null;
  wins: number;
  losses: number;
  pushes: number;
  roi: number | null;
  clv: number | null;
  clvSampleSize: number;
  brierScore: number | null;
  calibrationError: number | null;
  maxDrawdown: number | null;
  unavailableMetrics: string[];
}

function round(value: number, digits = 4): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function metricsForRows(rows: GradedMlbDecision[], allCandidates: number): MlbPolicyPerformance {
  const decisive = rows.filter((row) => row.result === "win" || row.result === "loss");
  const wins = decisive.filter((row) => row.result === "win").length;
  const losses = decisive.filter((row) => row.result === "loss").length;
  const pushes = rows.filter((row) => row.result === "push").length;
  const financialRows = rows.filter(
    (row): row is GradedMlbDecision & { odds: number } => row.odds != null,
  );
  const hasCompleteOdds = financialRows.length === rows.length;
  const outcomes = financialRows.map((row) => {
    if (row.result === "loss") return -1;
    if (row.result === "push") return 0;
    return row.odds > 0 ? row.odds / 100 : 100 / Math.abs(row.odds);
  });
  const netUnits = outcomes.reduce((total, outcome) => total + outcome, 0);
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const outcome of outcomes) {
    cumulative += outcome;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }
  const clvRows = rows.filter((row) => row.clv != null);
  const unavailableMetrics: string[] = [];
  if (!rows.length) unavailableMetrics.push("no_graded_selected_decisions");
  if (!decisive.length) unavailableMetrics.push("no_decisive_results_for_calibration");
  if (!clvRows.length) unavailableMetrics.push("no_closing_line_value_available");
  if (rows.length && !hasCompleteOdds) unavailableMetrics.push("incomplete_odds_for_financial_metrics");
  if (clvRows.length && clvRows.length < rows.length) {
    unavailableMetrics.push("closing_line_value_missing_for_some_selected_decisions");
  }

  const brier = decisive.length
    ? decisive.reduce((sum, row) => sum + (row.modelProbability - (row.result === "win" ? 1 : 0)) ** 2, 0) / decisive.length
    : null;
  const calibration = decisive.length
    ? Math.abs(
        decisive.reduce((sum, row) => sum + row.modelProbability, 0) / decisive.length
        - wins / decisive.length,
      )
    : null;

  return {
    selectedCount: rows.length,
    gradedCandidateCount: allCandidates,
    coverage: allCandidates ? round(rows.length / allCandidates) : null,
    wins,
    losses,
    pushes,
    roi: rows.length && hasCompleteOdds ? round(netUnits / rows.length) : null,
    clv: clvRows.length
      ? round(clvRows.reduce((sum, row) => sum + (row.clv ?? 0), 0) / clvRows.length)
      : null,
    clvSampleSize: clvRows.length,
    brierScore: brier == null ? null : round(brier),
    calibrationError: calibration == null ? null : round(calibration),
    maxDrawdown: rows.length && hasCompleteOdds ? round(maxDrawdown, 2) : null,
    unavailableMetrics,
  };
}

/**
 * Compares immutable, already-graded decisions. It is analytics only: this
 * returns no pick IDs, units, publish state, or writes for either policy.
 */
export function compareMlbQualificationPolicies(
  rows: GradedMlbDecision[],
  buyThreshold = DEFAULT_MLB_SHADOW_BUY_THRESHOLD,
): { production: MlbPolicyPerformance; shadow: MlbPolicyPerformance } {
  if (!Number.isFinite(buyThreshold) || buyThreshold <= 0 || buyThreshold >= MLB_STRONG_BUY_THRESHOLD) {
    throw new Error(`Shadow Buy threshold must be greater than 0 and below ${MLB_STRONG_BUY_THRESHOLD}.`);
  }
  const shadowRows = rows.filter((row) => {
    const selectedSide = row.selection;
    const threshold = selectedSide === "away"
      ? buyThreshold + MLB_AWAY_THRESHOLD_OFFSET
      : buyThreshold;
    // A historical snapshot without an odds value cannot prove the two-way
    // market requirement, so it remains excluded from the candidate policy.
    const priceSafe = row.odds != null && row.odds > MLB_MAX_FAVORITE_ODDS;
    return Math.abs(row.edge) >= threshold && priceSafe;
  });
  const productionRows = rows.filter(
    (row) => row.recommendation === "Buy" || row.recommendation === "Strong Buy",
  );
  return {
    production: metricsForRows(productionRows, rows.length),
    shadow: metricsForRows(shadowRows, rows.length),
  };
}