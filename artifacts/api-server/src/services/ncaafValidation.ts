import { createHash } from "node:crypto";
import { and, asc, eq, exists, gt, inArray, isNotNull, lte, notExists, sql } from "drizzle-orm";
import {
  dataQualityAlertsTable,
  db,
  modelPredictionsTable,
  ncaafDecisionMarketsTable,
  ncaafEvaluationsTable,
  ncaafFeatureSnapshotsTable,
  ncaafGameEvidenceTable,
  ncaafMarketObservationsTable,
  ncaafMarketPricesTable,
  ncaafPromotionDecisionsTable,
  ncaafWalkForwardRunsTable,
  ncaafWalkForwardSegmentsTable,
  NCAAF_EVALUATION_VERSION,
  NCAAF_VALIDATION_SCHEMA_VERSION,
} from "@workspace/db";

export const NCAAF_VALIDATION_CONFIG = Object.freeze({
  version: "ncaaf-validation-config-v1",
  probabilityFloor: 0.01,
  probabilityCeiling: 0.99,
  uncertaintyIntervalScale: 0.12,
  spreadStdDevPoints: 14,
  maximumClosingAgeHours: 24,
  calibrationBucketWidth: 0.1,
  minimumEvaluationSeasons: 2,
  gates: {
    minimumSamplesPerMarketSeason: 200,
    maximumCalibrationError: 0.05,
    maximumBrier: 0.24,
    maximumLogLoss: 0.69,
    minimumRoi: 0,
    minimumClv: 0,
    maximumDrawdownUnits: 20,
    minimumPositiveSeasonRate: 0.6,
    minimumPositiveWeekRate: 0.55,
    minimumCoverage: 0.7,
  },
} as const);

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}

export function ncaafValidationHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export const NCAAF_VALIDATION_CONFIG_HASH = ncaafValidationHash(NCAAF_VALIDATION_CONFIG);
export const ncaafWalkForwardRunKey = (datasetHash: string, modelVersion = "ncaaf-market-free-v1") =>
  ncaafValidationHash({
    datasetHash, modelVersion, configHash: NCAAF_VALIDATION_CONFIG_HASH,
    evaluation: NCAAF_EVALUATION_VERSION,
  });

// A validation invocation must never materialize an unbounded historical
// ledger. If history exceeds this fixed ceiling, metrics remain auditable but
// promotion fails closed until an aggregate implementation can evaluate the
// full corpus without loading it into process memory.
export const NCAAF_VALIDATION_HISTORY_LIMIT = 5_000;
export const ncaafPromotionDecisionKey = (input: {
  championModelVersion: string; challengerModelVersion: string; datasetVersion: string;
  metrics: PromotionMetrics; policyReasons: readonly string[]; thresholdHash: string; provenanceHash: string;
}) => ncaafValidationHash(input);
const clampProbability = (p: number) =>
  Math.min(NCAAF_VALIDATION_CONFIG.probabilityCeiling, Math.max(NCAAF_VALIDATION_CONFIG.probabilityFloor, p));
const round = (n: number, places = 6) => Math.round(n * 10 ** places) / 10 ** places;

export function fairAmericanPrice(probability: number): number {
  const p = clampProbability(probability);
  return Math.round(p >= 0.5 ? -100 * p / (1 - p) : 100 * (1 - p) / p);
}

export function americanImpliedProbability(price: number): number {
  if (!Number.isFinite(price) || price === 0) throw new Error("American price must be finite and non-zero");
  return price < 0 ? -price / (-price + 100) : 100 / (price + 100);
}

function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

export interface ProbabilityInterval {
  lower: number;
  point: number;
  upper: number;
}

export interface NcaafPricedMarket {
  market: "moneyline" | "spread" | "total";
  selection: "home" | "away" | "over" | "under";
  line: number | null;
  status: "available" | "blocked";
  probability: ProbabilityInterval | null;
  fairAmerican: number | null;
  uncertainty: number;
  evidenceTier: string;
  missingReasons: string[];
}

export interface PriceableNcaafSnapshot {
  modelVersion: string;
  configHash: string;
  dataCutoffAt: Date;
  inputHash: string;
  quality: unknown;
  forecast: unknown;
}

function interval(point: number, uncertainty: number): ProbabilityInterval {
  const radius = Math.max(0, Math.min(1, uncertainty)) * NCAAF_VALIDATION_CONFIG.uncertaintyIntervalScale;
  return {
    lower: round(clampProbability(point - radius)),
    point: round(clampProbability(point)),
    upper: round(clampProbability(point + radius)),
  };
}

/**
 * Deterministic analytic pricing from the immutable v1 feature forecast only.
 * No market observation is accepted here, preventing accidental market leakage.
 */
export function priceNcaafSnapshot(
  snapshot: PriceableNcaafSnapshot,
  spreadLines: readonly number[] = [],
): NcaafPricedMarket[] {
  const forecast = snapshot.forecast as {
    status?: string;
    homeWinProbability?: number | null;
    projectedMargin?: number | null;
    projectedTotal?: number | null;
    projectedTotalMissingReason?: string;
    uncertainty?: number;
    blockedReasons?: string[];
  };
  const quality = snapshot.quality as { sufficientIndependentEvidence?: boolean; evidenceCount?: number };
  const uncertainty = Number.isFinite(forecast.uncertainty) ? Math.max(0, Math.min(1, forecast.uncertainty!)) : 1;
  const evidenceTier = quality.sufficientIndependentEvidence
    ? (uncertainty <= 0.4 ? "high" : uncertainty <= 0.7 ? "medium" : "low")
    : "blocked";
  const blocked = forecast.status !== "ready" || !quality.sufficientIndependentEvidence;
  const reasons = [...(forecast.blockedReasons ?? [])];
  const output: NcaafPricedMarket[] = [];
  for (const selection of ["home", "away"] as const) {
    const raw = forecast.homeWinProbability == null
      ? null : selection === "home" ? forecast.homeWinProbability : 1 - forecast.homeWinProbability;
    const probability = !blocked && raw != null && Number.isFinite(raw) ? interval(raw, uncertainty) : null;
    output.push({
      market: "moneyline", selection, line: null,
      status: probability ? "available" : "blocked",
      probability,
      fairAmerican: probability ? fairAmericanPrice(probability.point) : null,
      uncertainty, evidenceTier,
      missingReasons: probability ? [] : reasons.length ? reasons : ["unsupported_or_missing_moneyline_probability"],
    });
  }
  const fairSpread = forecast.projectedMargin == null ? null : round(-forecast.projectedMargin, 3);
  const lines: Array<number | null> = [...new Set([
    fairSpread,
    ...spreadLines.filter((line) => Number.isFinite(line)),
  ])];
  for (const line of lines) {
    const raw = forecast.projectedMargin == null || line == null ? null
      : normalCdf((forecast.projectedMargin + line) / NCAAF_VALIDATION_CONFIG.spreadStdDevPoints);
    const probability = !blocked && raw != null ? interval(raw, uncertainty) : null;
    output.push({
      market: "spread", selection: "home", line,
      status: probability ? "available" : "blocked", probability,
      fairAmerican: probability ? fairAmericanPrice(probability.point) : null,
      uncertainty, evidenceTier,
      missingReasons: probability ? [] : reasons.length ? reasons : ["projected_margin_unavailable_or_feature_quality_blocked"],
    });
    output.push({
      market: "spread", selection: "away", line: line == null ? null : -line,
      status: probability ? "available" : "blocked",
      probability: probability ? interval(1 - probability.point, uncertainty) : null,
      fairAmerican: probability ? fairAmericanPrice(1 - probability.point) : null,
      uncertainty, evidenceTier,
      missingReasons: probability ? [] : reasons.length ? reasons : ["projected_margin_unavailable_or_feature_quality_blocked"],
    });
  }
  const totalReason = forecast.projectedTotalMissingReason
    ?? "NCAAF v1 has no supported immutable total features";
  for (const selection of ["over", "under"] as const) {
    output.push({
      market: "total", selection, line: null, status: "blocked",
      probability: null, fairAmerican: null, uncertainty, evidenceTier: "blocked",
      missingReasons: [totalReason],
    });
  }
  return output;
}

export interface ClosingCandidate {
  id: number;
  provider: string;
  providerEventId: string;
  bookmakerProviderId: string;
  marketKey: string;
  selection: string;
  price: number | null;
  line: number | null;
  isMatchedToGame: boolean;
  capturedAt: Date;
  modeledAsOf: Date;
}

export interface NcaafEventEvidenceIdentity {
  id: number;
  provider: string;
  providerEventId: string;
  payloadHash: string;
  homeTeamName: string | null;
  awayTeamName: string | null;
  kickoffAt: Date | null;
  neutralSite: boolean | null;
  capturedAt: Date;
  modeledAsOf: Date;
}

export interface NcaafFinalEvidenceIdentity extends NcaafEventEvidenceIdentity {
  gameStatus: string | null;
  homeScore: number | null;
  awayScore: number | null;
  week?: number | null;
}

/**
 * The first immutable qualifying final is the canonical label. Later provider
 * corrections remain auditable in the ledger but cannot rewrite validation.
 */
export function selectCanonicalFinalEvidence(
  rows: readonly NcaafFinalEvidenceIdentity[],
  expected: { provider: string; eventId: string },
): NcaafFinalEvidenceIdentity | null {
  return rows.filter((row) => row.provider === expected.provider
    && row.providerEventId === expected.eventId
    && row.kickoffAt != null && row.capturedAt > row.kickoffAt
    && row.homeScore != null && row.awayScore != null
    && ["final", "post", "completed"].includes((row.gameStatus ?? "").toLowerCase()))
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime() || a.id - b.id)[0] ?? null;
}

export function planCanonicalEvaluation(input: {
  predictionId: number;
  decisionMarketId: number;
  finalRows: readonly NcaafFinalEvidenceIdentity[];
  expected: { provider: string; eventId: string };
  existingEvaluationIdentities: ReadonlySet<string>;
}) {
  const identity = `${NCAAF_EVALUATION_VERSION}:${input.predictionId}:${input.decisionMarketId}`;
  if (input.existingEvaluationIdentities.has(identity)) {
    return {
      status: "already_evaluated" as const, identity, final: null,
      coverage: { eligibleFinal: true, evaluationNeeded: false },
    };
  }
  const final = selectCanonicalFinalEvidence(input.finalRows, input.expected);
  if (!final) {
    return {
      status: "pending_final" as const, identity, final: null,
      coverage: { eligibleFinal: false, evaluationNeeded: false },
    };
  }
  return {
    status: "ready" as const, identity, final,
    coverage: { eligibleFinal: true, evaluationNeeded: true },
  };
}

export interface NcaafDecisionObservation extends ClosingCandidate {
  gameEvidenceId: number | null;
  payloadHash: string;
  payload: unknown;
}

const normalizeTeam = (value: string | null | undefined) =>
  (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");

function oddsEventIdentity(row: NcaafDecisionObservation): {
  home: string | null; away: string | null; kickoff: Date | null;
} {
  const payload = row.payload && typeof row.payload === "object"
    ? row.payload as Record<string, unknown> : {};
  const event = payload.event && typeof payload.event === "object"
    ? payload.event as Record<string, unknown> : payload;
  const kickoffValue = event.commence_time;
  const kickoff = typeof kickoffValue === "string" && Number.isFinite(Date.parse(kickoffValue))
    ? new Date(kickoffValue) : null;
  return {
    home: typeof event.home_team === "string" ? event.home_team : null,
    away: typeof event.away_team === "string" ? event.away_team : null,
    kickoff,
  };
}

export interface DecisionMarketSelection {
  observation: NcaafDecisionObservation | null;
  exclusionReason: string | null;
  provenance: Record<string, unknown>;
}

/**
 * Maps an ESPN event to exactly one Odds API event using the durable
 * gameEvidenceId link plus oriented teams and kickoff. Name-only matching is
 * never accepted, and multiple qualifying provider event IDs are ambiguous.
 */
export function selectDecisionMarketObservation(input: {
  espnEventId: string;
  predictionTimestamp: Date;
  kickoffAt: Date;
  market: string;
  selection: string;
  requiredLine?: number | null;
  espnEvidence: readonly NcaafEventEvidenceIdentity[];
  observations: readonly NcaafDecisionObservation[];
  kickoffToleranceMinutes?: number;
}): DecisionMarketSelection {
  const toleranceMs = (input.kickoffToleranceMinutes ?? 180) * 60_000;
  const evidence = input.espnEvidence.filter((row) => row.provider === "espn"
    && row.providerEventId === input.espnEventId
    && row.capturedAt <= input.predictionTimestamp && row.modeledAsOf <= input.predictionTimestamp
    && row.kickoffAt != null);
  if (!evidence.length) {
    return { observation: null, exclusionReason: "decision_espn_evidence_unavailable", provenance: {} };
  }
  const evidenceIds = new Set(evidence.map((row) => row.id));
  const expectedMarket = ledgerMarket(input.market);
  const target = [...evidence].sort((a, b) =>
    b.capturedAt.getTime() - a.capturedAt.getTime() || b.id - a.id)[0]!;
  const expectedSelection = ledgerSelection(input.selection, target.homeTeamName, target.awayTeamName);
  const linked = input.observations.filter((row) =>
    row.gameEvidenceId != null && evidenceIds.has(row.gameEvidenceId)
    && row.isMatchedToGame && row.marketKey === expectedMarket
    && normalizeTeam(row.selection) === normalizeTeam(expectedSelection)
    && row.capturedAt <= input.predictionTimestamp && row.modeledAsOf <= input.predictionTimestamp
    && row.capturedAt < input.kickoffAt && row.modeledAsOf < input.kickoffAt);
  if (!linked.length) {
    return {
      observation: null, exclusionReason: "decision_market_unavailable",
      provenance: { espnEventId: input.espnEventId, espnEvidenceId: target.id, espnEvidenceHash: target.payloadHash },
    };
  }
  const identityValid = linked.filter((row) => {
    const odds = oddsEventIdentity(row);
    return odds.kickoff != null
      && Math.abs(odds.kickoff.getTime() - input.kickoffAt.getTime()) <= toleranceMs
      && normalizeTeam(odds.home) === normalizeTeam(target.homeTeamName)
      && normalizeTeam(odds.away) === normalizeTeam(target.awayTeamName);
  });
  if (!identityValid.length) {
    return {
      observation: null, exclusionReason: "decision_event_identity_or_reschedule_mismatch",
      provenance: { espnEventId: input.espnEventId, espnEvidenceId: target.id, espnEvidenceHash: target.payloadHash },
    };
  }
  const oddsEventIds = [...new Set(identityValid.map((row) => row.providerEventId))].sort();
  if (oddsEventIds.length !== 1) {
    return {
      observation: null, exclusionReason: "decision_event_mapping_ambiguous",
      provenance: {
        espnEventId: input.espnEventId, espnEvidenceId: target.id,
        espnEvidenceHash: target.payloadHash, candidateOddsEventIds: oddsEventIds,
      },
    };
  }
  const sameEvent = identityValid.filter((row) => row.providerEventId === oddsEventIds[0]
    && (input.requiredLine == null || row.line === input.requiredLine));
  if (!sameEvent.length) {
    return {
      observation: null, exclusionReason: "decision_market_line_unavailable",
      provenance: {
        espnEventId: input.espnEventId, oddsEventId: oddsEventIds[0],
        espnEvidenceId: target.id, espnEvidenceHash: target.payloadHash,
      },
    };
  }
  // Canonical book selection is stable and avoids multiplying one emitted
  // prediction into many pseudo-samples.
  const canonicalBook = [...new Set(sameEvent.map((row) =>
    `${row.provider}\u0000${row.bookmakerProviderId}`))].sort()[0]!;
  const [provider, book] = canonicalBook.split("\u0000");
  const observation = sameEvent.filter((row) => row.provider === provider
    && row.bookmakerProviderId === book)
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime()
      || b.modeledAsOf.getTime() - a.modeledAsOf.getTime() || b.id - a.id)[0]!;
  if (input.kickoffAt.getTime() - observation.capturedAt.getTime()
    > NCAAF_VALIDATION_CONFIG.maximumClosingAgeHours * 3_600_000) {
    return {
      observation: null, exclusionReason: "decision_market_stale",
      provenance: {
        espnEventId: input.espnEventId, oddsEventId: observation.providerEventId,
        espnEvidenceId: target.id, espnEvidenceHash: target.payloadHash,
        rejectedObservationId: observation.id, rejectedObservationHash: observation.payloadHash,
      },
    };
  }
  return {
    observation, exclusionReason: null,
    provenance: {
      method: "gameEvidenceId+orientedNormalizedTeams+kickoffTolerance",
      kickoffToleranceMinutes: input.kickoffToleranceMinutes ?? 180,
      neutralSite: target.neutralSite,
      espnEventId: input.espnEventId,
      espnEvidenceId: target.id,
      espnEvidenceHash: target.payloadHash,
      oddsEventId: observation.providerEventId,
      oddsObservationId: observation.id,
      oddsObservationHash: observation.payloadHash,
      provider: observation.provider,
      bookmakerProviderId: observation.bookmakerProviderId,
    },
  };
}

export function selectLatestEligibleClosing(
  rows: readonly ClosingCandidate[],
  kickoffAt: Date,
  expected: {
    provider: string; eventId: string; market: string; selection: string;
    bookmakerProviderId?: string; line?: number | null;
    decisionObservedAt?: Date; decisionModeledAsOf?: Date;
  },
): { closing: ClosingCandidate | null; exclusionReason: string | null } {
  const identity = rows.filter((r) => r.provider === expected.provider && r.providerEventId === expected.eventId
    && r.marketKey === expected.market && r.selection === expected.selection
    && (expected.bookmakerProviderId == null || r.bookmakerProviderId === expected.bookmakerProviderId));
  if (!identity.length) return { closing: null, exclusionReason: "closing_market_unavailable" };
  const matched = identity.filter((r) => r.isMatchedToGame);
  if (!matched.length) return { closing: null, exclusionReason: "closing_market_unmatched" };
  const chronological = matched.filter((r) => r.capturedAt < kickoffAt && r.modeledAsOf < kickoffAt
    && (!expected.decisionObservedAt || r.capturedAt >= expected.decisionObservedAt)
    && (!expected.decisionModeledAsOf || r.modeledAsOf >= expected.decisionModeledAsOf));
  const sameLine = expected.line == null ? chronological : chronological.filter((r) => r.line === expected.line);
  if (expected.line != null && chronological.length && !sameLine.length) {
    return { closing: null, exclusionReason: "closing_line_changed_clv_unavailable" };
  }
  const eligible = sameLine
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime()
      || b.modeledAsOf.getTime() - a.modeledAsOf.getTime() || b.id - a.id);
  if (!eligible.length) return { closing: null, exclusionReason: "no_closing_observation_before_kickoff" };
  const closing = eligible[0]!;
  if (kickoffAt.getTime() - closing.capturedAt.getTime()
    > NCAAF_VALIDATION_CONFIG.maximumClosingAgeHours * 3_600_000) {
    return { closing: null, exclusionReason: "closing_market_stale" };
  }
  return { closing, exclusionReason: null };
}

export type BetOutcome = "win" | "loss" | "push";

export function settleMarket(
  market: "moneyline" | "spread" | "total",
  selection: string,
  homeScore: number,
  awayScore: number,
  line: number | null,
): BetOutcome {
  if (market === "moneyline") {
    if (homeScore === awayScore) return "push";
    return (selection === "home") === (homeScore > awayScore) ? "win" : "loss";
  }
  if (line == null) throw new Error(`${market} settlement requires a line`);
  const value = market === "spread"
    ? (selection === "home" ? homeScore - awayScore : awayScore - homeScore) + line
    : (homeScore + awayScore - line) * (selection === "over" ? 1 : -1);
  return value === 0 ? "push" : value > 0 ? "win" : "loss";
}

export const brierScore = (probability: number, won: boolean) => (probability - (won ? 1 : 0)) ** 2;
export const binaryLogLoss = (probability: number, won: boolean) => {
  const p = clampProbability(probability);
  return -(won ? Math.log(p) : Math.log(1 - p));
};
export const flatUnitProfit = (price: number, outcome: BetOutcome) =>
  outcome === "push" ? 0 : outcome === "loss" ? -1 : price > 0 ? price / 100 : 100 / -price;

export function maximumDrawdown(profits: readonly number[]): number {
  let balance = 0;
  let peak = 0;
  let drawdown = 0;
  for (const profit of profits) {
    balance += profit;
    peak = Math.max(peak, balance);
    drawdown = Math.max(drawdown, peak - balance);
  }
  return round(drawdown);
}

export function comparableClv(
  bet: { selection: string; line: number | null; price: number | null },
  closing: { selection: string; line: number | null; price: number | null },
): number | null {
  if (bet.selection !== closing.selection || bet.line !== closing.line
    || bet.price == null || closing.price == null) return null;
  return round(americanImpliedProbability(closing.price) - americanImpliedProbability(bet.price));
}

export interface ScoredEvaluation {
  season: number;
  week: number | null;
  market: string;
  price: number | null;
  evidenceTier: string;
  probability: number | null;
  outcome: BetOutcome | null;
  profit: number | null;
  clv: number | null;
  excluded?: boolean;
}

export function calibrationBuckets(rows: readonly ScoredEvaluation[]) {
  const included = rows.filter((r) => !r.excluded && r.probability != null && r.outcome !== "push" && r.outcome != null);
  const buckets = new Map<number, { count: number; probability: number; wins: number }>();
  for (const row of included) {
    const lower = Math.min(0.9, Math.floor(row.probability! / NCAAF_VALIDATION_CONFIG.calibrationBucketWidth)
      * NCAAF_VALIDATION_CONFIG.calibrationBucketWidth);
    const bucket = buckets.get(lower) ?? { count: 0, probability: 0, wins: 0 };
    bucket.count++;
    bucket.probability += row.probability!;
    bucket.wins += row.outcome === "win" ? 1 : 0;
    buckets.set(lower, bucket);
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b).map(([lower, b]) => ({
    lower: round(lower), upper: round(lower + NCAAF_VALIDATION_CONFIG.calibrationBucketWidth),
    count: b.count, meanProbability: round(b.probability / b.count),
    winRate: round(b.wins / b.count),
    calibrationError: round(Math.abs(b.probability / b.count - b.wins / b.count)),
  }));
}

export function priceRange(price: number | null): string {
  if (price == null) return "missing";
  if (price <= -200) return "<=-200";
  if (price <= -120) return "-199..-120";
  if (price < 100) return "-119..+99";
  if (price <= 199) return "+100..+199";
  return ">=+200";
}

export function evaluationGroups(rows: readonly ScoredEvaluation[]) {
  const groups = new Map<string, ScoredEvaluation[]>();
  for (const row of rows) {
    const key = JSON.stringify({
      season: row.season, week: row.week, market: row.market,
      priceRange: priceRange(row.price), evidenceTier: row.evidenceTier,
    });
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups].map(([key, group]) => {
    const dimensions = JSON.parse(key) as Record<string, unknown>;
    const eligible = group.filter((r) => !r.excluded && r.outcome != null);
    const decisions = eligible.filter((r) => r.outcome !== "push" && r.probability != null);
    const profits = eligible.flatMap((r) => r.profit == null ? [] : [r.profit]);
    const clvs = eligible.flatMap((r) => r.clv == null ? [] : [r.clv]);
    return {
      dimensions, samples: eligible.length, exclusions: group.length - eligible.length,
      coverage: group.length ? round(eligible.length / group.length) : 0,
      winRate: decisions.length ? round(decisions.filter((r) => r.outcome === "win").length / decisions.length) : null,
      brier: decisions.length ? round(decisions.reduce((s, r) => s + brierScore(r.probability!, r.outcome === "win"), 0) / decisions.length) : null,
      logLoss: decisions.length ? round(decisions.reduce((s, r) => s + binaryLogLoss(r.probability!, r.outcome === "win"), 0) / decisions.length) : null,
      roi: profits.length ? round(profits.reduce((a, b) => a + b, 0) / profits.length) : null,
      maxDrawdown: profits.length ? maximumDrawdown(profits) : null,
      clv: clvs.length ? round(clvs.reduce((a, b) => a + b, 0) / clvs.length) : null,
      calibration: calibrationBuckets(group),
    };
  });
}

export interface PromotionMetrics {
  minimumMarketSeasonSamples: number | null;
  calibrationError: number | null;
  brier: number | null;
  logLoss: number | null;
  roi: number | null;
  clv: number | null;
  maxDrawdown: number | null;
  positiveSeasonRate: number | null;
  positiveWeekRate: number | null;
  coverage: number | null;
}

export const NCAAF_REQUIRED_PROMOTION_MARKETS = Object.freeze([
  "moneyline", "spread",
] as const);

export interface PromotionEvaluationRow extends ScoredEvaluation {
  id: number;
  predictionId?: number;
  provenanceHash: string;
  labelAvailableAt: Date | null;
}

export function deriveNcaafPromotionMetrics(rows: readonly PromotionEvaluationRow[]): {
  metrics: PromotionMetrics;
  evaluationSeasons: number[];
  marketsPresent: string[];
  policyReasons: string[];
  datasetHash: string;
} {
  const canonicalRows = new Map<string, PromotionEvaluationRow>();
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const identity = `${row.predictionId ?? row.id}:${row.market}`;
    if (!canonicalRows.has(identity)) canonicalRows.set(identity, row);
  }
  const ordered = [...canonicalRows.values()].sort((a, b) =>
    (a.labelAvailableAt?.getTime() ?? 0) - (b.labelAvailableAt?.getTime() ?? 0) || a.id - b.id);
  const eligible = ordered.filter((row) => !row.excluded && row.outcome != null);
  const decisions = eligible.filter((row) => row.outcome !== "push" && row.probability != null);
  const seasons = [...new Set(eligible.map((row) => row.season))].sort();
  const markets = [...new Set(eligible.map((row) => row.market))].sort();
  const marketSeasonCounts = NCAAF_REQUIRED_PROMOTION_MARKETS.flatMap((market) =>
    seasons.map((season) => eligible.filter((row) => row.market === market && row.season === season).length));
  const calibration = calibrationBuckets(decisions);
  const calibrationCount = calibration.reduce((sum, bucket) => sum + bucket.count, 0);
  const profits = eligible.flatMap((row) => row.profit == null ? [] : [row.profit]);
  const clvs = eligible.flatMap((row) => row.clv == null ? [] : [row.clv]);
  const roiFor = (subset: readonly PromotionEvaluationRow[]) => {
    const values = subset.flatMap((row) => row.profit == null ? [] : [row.profit]);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const seasonRois = seasons.map((season) => roiFor(eligible.filter((row) => row.season === season)))
    .filter((value): value is number => value != null);
  const weekKeys = [...new Set(eligible.map((row) => `${row.season}:${row.week ?? "unknown"}`))].sort();
  const weekRois = weekKeys.map((key) => roiFor(eligible.filter((row) =>
    `${row.season}:${row.week ?? "unknown"}` === key))).filter((value): value is number => value != null);
  const policyReasons = [
    ...(seasons.length < NCAAF_VALIDATION_CONFIG.minimumEvaluationSeasons
      ? ["insufficient_evaluation_seasons"] : []),
    ...NCAAF_REQUIRED_PROMOTION_MARKETS.filter((market) => !markets.includes(market))
      .map((market) => `required_market_unavailable:${market}`),
  ];
  return {
    metrics: {
      minimumMarketSeasonSamples: marketSeasonCounts.length ? Math.min(...marketSeasonCounts) : null,
      calibrationError: calibrationCount ? round(calibration.reduce((sum, bucket) =>
        sum + bucket.calibrationError * bucket.count, 0) / calibrationCount) : null,
      brier: decisions.length ? round(decisions.reduce((sum, row) =>
        sum + brierScore(row.probability!, row.outcome === "win"), 0) / decisions.length) : null,
      logLoss: decisions.length ? round(decisions.reduce((sum, row) =>
        sum + binaryLogLoss(row.probability!, row.outcome === "win"), 0) / decisions.length) : null,
      roi: profits.length ? round(profits.reduce((sum, value) => sum + value, 0) / profits.length) : null,
      clv: clvs.length ? round(clvs.reduce((sum, value) => sum + value, 0) / clvs.length) : null,
      maxDrawdown: profits.length ? maximumDrawdown(profits) : null,
      positiveSeasonRate: seasonRois.length
        ? round(seasonRois.filter((value) => value > 0).length / seasonRois.length) : null,
      positiveWeekRate: weekRois.length
        ? round(weekRois.filter((value) => value > 0).length / weekRois.length) : null,
      coverage: ordered.length ? round(eligible.length / ordered.length) : null,
    },
    evaluationSeasons: seasons,
    marketsPresent: markets,
    policyReasons,
    datasetHash: ncaafValidationHash(ordered.map((row) => ({
      id: row.id, provenanceHash: row.provenanceHash,
    }))),
  };
}

export function evaluatePromotionGates(metrics: PromotionMetrics, thresholds = NCAAF_VALIDATION_CONFIG.gates) {
  const definitions = [
    ["minimum_samples", metrics.minimumMarketSeasonSamples, (v: number) => v >= thresholds.minimumSamplesPerMarketSeason],
    ["calibration", metrics.calibrationError, (v: number) => v <= thresholds.maximumCalibrationError],
    ["brier", metrics.brier, (v: number) => v <= thresholds.maximumBrier],
    ["log_loss", metrics.logLoss, (v: number) => v <= thresholds.maximumLogLoss],
    ["roi", metrics.roi, (v: number) => v >= thresholds.minimumRoi],
    ["clv", metrics.clv, (v: number) => v >= thresholds.minimumClv],
    ["max_drawdown", metrics.maxDrawdown, (v: number) => v <= thresholds.maximumDrawdownUnits],
    ["season_stability", metrics.positiveSeasonRate, (v: number) => v >= thresholds.minimumPositiveSeasonRate],
    ["week_stability", metrics.positiveWeekRate, (v: number) => v >= thresholds.minimumPositiveWeekRate],
    ["coverage", metrics.coverage, (v: number) => v >= thresholds.minimumCoverage],
  ] as const;
  const gates = definitions.map(([gate, value, pass]) => ({
    gate, value, passed: value != null && Number.isFinite(value) && pass(value),
    reason: value == null || !Number.isFinite(value) ? "metric_missing"
      : pass(value) ? null : "threshold_not_met",
  }));
  return {
    decision: gates.every((g) => g.passed) ? "eligible" as const : "rejected" as const,
    gates,
    reasons: gates.filter((g) => !g.passed).map((g) => `${g.gate}:${g.reason}`),
    thresholdHash: ncaafValidationHash(thresholds),
  };
}

export function assertLeakageSafe(input: {
  predictionAt: Date; featureCutoff: Date; kickoffAt: Date; labelAvailableAt?: Date;
  trainingSeasons?: readonly number[]; evaluationSeason?: number;
}): void {
  if (input.predictionAt >= input.kickoffAt) throw new Error("prediction_not_before_kickoff");
  if (input.featureCutoff > input.predictionAt || input.featureCutoff >= input.kickoffAt) {
    throw new Error("feature_cutoff_leakage");
  }
  if (input.labelAvailableAt && input.labelAvailableAt <= input.predictionAt) throw new Error("label_available_before_prediction");
  if (input.trainingSeasons && input.evaluationSeason != null
    && input.trainingSeasons.some((season) => season >= input.evaluationSeason!)) {
    throw new Error("walk_forward_training_season_leakage");
  }
}

export interface ValidationHealthSignal {
  alertType: "ncaaf_stale_evidence" | "ncaaf_missing_evidence" | "ncaaf_unmatched_closing"
    | "ncaaf_feature_drift" | "ncaaf_config_drift" | "ncaaf_calibration_drift" | "ncaaf_coverage_change";
  active: boolean;
  recoveryProven: boolean;
  evidenceHash: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export function ncaafValidationHealthSignals(input: {
  now: Date;
  candidateCount: number;
  latestEvidenceAt: Date | null;
  exclusions: readonly string[];
  observedFeatureConfigHashes: readonly string[];
  observedValidationConfigHashes: readonly string[];
  calibrationError: number | null;
  currentCoverage: number | null;
  previousCoverage: number | null;
}): ValidationHealthSignal[] {
  const stale = input.candidateCount > 0 && (!input.latestEvidenceAt
    || input.now.getTime() - input.latestEvidenceAt.getTime()
      > NCAAF_VALIDATION_CONFIG.maximumClosingAgeHours * 3_600_000);
  const missing = input.candidateCount > 0 && input.exclusions.some((reason) =>
    reason.includes("unavailable") || reason.includes("missing"));
  const unmatched = input.exclusions.some((reason) =>
    reason === "closing_market_unmatched" || reason === "no_closing_observation_before_kickoff");
  const featureDrift = input.observedFeatureConfigHashes.some((hash) => !hash)
    || new Set(input.observedFeatureConfigHashes).size > 1;
  const configDrift = input.observedValidationConfigHashes.some((hash) => hash !== NCAAF_VALIDATION_CONFIG_HASH);
  const calibrationDrift = input.calibrationError != null
    && input.calibrationError > NCAAF_VALIDATION_CONFIG.gates.maximumCalibrationError;
  const coverageDelta = input.currentCoverage != null && input.previousCoverage != null
    ? Math.abs(input.currentCoverage - input.previousCoverage) : null;
  const coverageChange = coverageDelta != null && coverageDelta >= 0.15;
  const make = (
    alertType: ValidationHealthSignal["alertType"],
    active: boolean,
    recoveryProven: boolean,
    details: unknown,
    description: string,
  ): ValidationHealthSignal => ({
    alertType, active, recoveryProven, description,
    evidenceHash: ncaafValidationHash({ alertType, active, details }),
    metadata: { details },
  });
  return [
    make("ncaaf_stale_evidence", stale, input.candidateCount > 0 && !stale, input.latestEvidenceAt, "NCAAF immutable evidence is stale"),
    make("ncaaf_missing_evidence", missing, input.candidateCount > 0 && !missing, input.exclusions, "NCAAF validation evidence is missing"),
    make("ncaaf_unmatched_closing", unmatched, input.candidateCount > 0 && !unmatched, input.exclusions, "NCAAF closing markets are unmatched"),
    make("ncaaf_feature_drift", featureDrift, input.observedFeatureConfigHashes.length > 0 && !featureDrift, input.observedFeatureConfigHashes, "NCAAF feature provenance drift detected"),
    make("ncaaf_config_drift", configDrift, input.observedValidationConfigHashes.length > 0 && !configDrift, input.observedValidationConfigHashes, "NCAAF validation config drift detected"),
    make("ncaaf_calibration_drift", calibrationDrift, input.calibrationError != null && !calibrationDrift, input.calibrationError, "NCAAF calibration drift exceeds threshold"),
    make("ncaaf_coverage_change", coverageChange, coverageDelta != null && !coverageChange, coverageDelta, "NCAAF validation coverage changed materially"),
  ];
}

/** De-duplicates active NCAAF alerts and resolves only on an explicit recovered signal. */
export async function reconcileNcaafValidationAlerts(signals: readonly ValidationHealthSignal[]): Promise<void> {
  for (const signal of signals) {
    const [existing] = await db.select({ id: dataQualityAlertsTable.id, metadata: dataQualityAlertsTable.metadata })
      .from(dataQualityAlertsTable).where(and(
        eq(dataQualityAlertsTable.sport, "NCAAF"),
        eq(dataQualityAlertsTable.alertType, signal.alertType),
        eq(dataQualityAlertsTable.isResolved, false),
      )).limit(1);
    if (signal.active && !existing) {
      await db.insert(dataQualityAlertsTable).values({
        sport: "NCAAF", alertType: signal.alertType, severity: "warning",
        description: signal.description, metadata: { ...signal.metadata, evidenceHash: signal.evidenceHash },
      });
    } else if (!signal.active && signal.recoveryProven && existing) {
      await db.update(dataQualityAlertsTable).set({
        isResolved: true, resolvedAt: new Date(), resolvedBy: "ncaaf-validation:persisted-recovery",
        metadata: { ...(existing.metadata as object ?? {}), recoveryEvidenceHash: signal.evidenceHash },
      }).where(eq(dataQualityAlertsTable.id, existing.id));
    }
  }
}

/**
 * Prices newly persisted feature snapshots. Conflict-free hashes make retries
 * idempotent. This writes no picks, grades, learning rows, or model activation.
 */
export async function persistNcaafFairPrices(cutoff = new Date()): Promise<number> {
  const batchSize = 100;
  let inserted = 0;
  const snapshots = await db.select().from(ncaafFeatureSnapshotsTable)
    .where(and(
      lte(ncaafFeatureSnapshotsTable.dataCutoffAt, cutoff),
      notExists(
        db.select({ id: ncaafMarketPricesTable.id })
          .from(ncaafMarketPricesTable)
          .where(and(
            eq(ncaafMarketPricesTable.featureSnapshotId, ncaafFeatureSnapshotsTable.id),
            eq(ncaafMarketPricesTable.evaluationVersion, NCAAF_EVALUATION_VERSION),
          )),
      ),
    ))
    .orderBy(asc(ncaafFeatureSnapshotsTable.id))
    .limit(batchSize);
  for (const snapshot of snapshots) {
    const prices = priceNcaafSnapshot(snapshot);
    inserted += await db.transaction(async (tx) => {
      let snapshotInserted = 0;
      for (const price of prices) {
        const provenanceHash = ncaafValidationHash({
          featureSnapshotId: snapshot.id, inputHash: snapshot.inputHash,
          featureConfigHash: snapshot.configHash, validationConfigHash: NCAAF_VALIDATION_CONFIG_HASH,
        });
        const idempotencyHash = ncaafValidationHash({
          schema: NCAAF_VALIDATION_SCHEMA_VERSION, evaluation: NCAAF_EVALUATION_VERSION,
          featureSnapshotId: snapshot.id, market: price.market, selection: price.selection, line: price.line,
        });
        const result = await tx.insert(ncaafMarketPricesTable).values({
          datasetVersion: snapshot.schemaVersion, modelVersion: snapshot.modelVersion,
          configVersion: NCAAF_VALIDATION_CONFIG.version, configHash: NCAAF_VALIDATION_CONFIG_HASH,
          featureSnapshotId: snapshot.id, provider: snapshot.targetProvider,
          providerEventId: snapshot.targetEventId, market: price.market, selection: price.selection,
          line: price.line, probabilityLower: price.probability?.lower,
          probabilityPoint: price.probability?.point, probabilityUpper: price.probability?.upper,
          fairAmericanPrice: price.fairAmerican, status: price.status, evidenceTier: price.evidenceTier,
          uncertainty: price.uncertainty,
          coverage: { evidenceCount: (snapshot.quality as { evidenceCount?: number }).evidenceCount ?? 0 },
          missingReasons: price.missingReasons, pointInTimeCutoff: snapshot.dataCutoffAt,
          provenanceHash, idempotencyHash,
        }).onConflictDoNothing().returning({ id: ncaafMarketPricesTable.id });
        snapshotInserted += result.length;
      }
      return snapshotInserted;
    });
  }
  return inserted;
}

function predictionFeatureId(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const decision = record.decision as Record<string, unknown> | undefined;
  const dataQuality = decision?.dataQuality as Record<string, unknown> | undefined;
  const metadata = (record.ncaafFeatureMetadata ?? record.ncaafFeature ?? record.ncaaf
    ?? dataQuality?.ncaafFeature) as Record<string, unknown> | undefined;
  const candidate = metadata?.snapshotId ?? record.ncaafFeatureSnapshotId;
  return typeof candidate === "number" && Number.isInteger(candidate) ? candidate : null;
}

function predictionLine(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["line", "marketLine", "spread", "total"]) {
    if (typeof record[key] === "number" && Number.isFinite(record[key])) return record[key];
  }
  return null;
}

function ledgerMarket(market: string): string {
  if (market === "moneyline") return "h2h";
  if (market === "spread") return "spreads";
  if (market === "total") return "totals";
  return market;
}

function ledgerSelection(
  selection: string,
  homeName: string | null,
  awayName: string | null,
): string {
  if (selection === "home") return homeName ?? "home";
  if (selection === "away") return awayName ?? "away";
  return selection[0]!.toUpperCase() + selection.slice(1);
}

export function buildImmutableEvaluationScore(input: {
  prediction: {
    market: string; selection: string; modelProbability: number;
    odds: number | null; units: number;
  };
  decision: {
    providerSelection: string; offeredLine: number | null; offeredPrice: number | null;
  };
  final: { homeScore: number; awayScore: number } | null;
  closing: { selection: string; line: number | null; price: number | null } | null;
  exclusionReason?: string | null;
}) {
  const exclusionReason = input.prediction.odds != null
    ? "challenger_prediction_must_keep_odds_null"
    : input.prediction.units !== 0
      ? "challenger_prediction_units_must_remain_zero"
      : input.exclusionReason ?? null;
  const outcome = !exclusionReason && input.final
    ? settleMarket(input.prediction.market as "moneyline" | "spread" | "total",
      input.prediction.selection, input.final.homeScore, input.final.awayScore,
      input.decision.offeredLine)
    : null;
  return {
    probability: input.prediction.modelProbability,
    outcome,
    profitUnits: outcome && input.decision.offeredPrice != null
      ? flatUnitProfit(input.decision.offeredPrice, outcome) : null,
    clv: input.closing ? comparableClv(
      {
        selection: input.decision.providerSelection,
        line: input.prediction.market === "moneyline" ? null : input.decision.offeredLine,
        price: input.decision.offeredPrice,
      },
      input.closing,
    ) : null,
    exclusionReason,
  };
}

async function persistNcaafDecisionMarketBatch(
  predictions: readonly (typeof modelPredictionsTable.$inferSelect)[],
  cutoff: Date,
): Promise<{
  inserted: number; candidates: number; exclusions: number;
}> {
  const featureIds = [...new Set(predictions.flatMap((prediction) => {
    const id = predictionFeatureId(prediction.featureSnapshot);
    return id == null ? [] : [id];
  }))];
  const snapshots = featureIds.length === 0 ? [] : await db
    .select()
    .from(ncaafFeatureSnapshotsTable)
    .where(and(
      lte(ncaafFeatureSnapshotsTable.dataCutoffAt, cutoff),
      inArray(ncaafFeatureSnapshotsTable.id, featureIds),
    ));
  const eventIds = [...new Set(snapshots.map((snapshot) => snapshot.targetEventId))];
  const games = eventIds.length === 0 ? [] : await db
    .select()
    .from(ncaafGameEvidenceTable)
    .where(and(
      lte(ncaafGameEvidenceTable.capturedAt, cutoff),
      inArray(ncaafGameEvidenceTable.providerEventId, eventIds),
    ));
  const evidenceIds = games.map((game) => game.id);
  const markets = evidenceIds.length === 0 ? [] : await db
    .select()
    .from(ncaafMarketObservationsTable)
    .where(and(
      lte(ncaafMarketObservationsTable.capturedAt, cutoff),
      inArray(ncaafMarketObservationsTable.gameEvidenceId, evidenceIds),
    ));
  const snapshotById = new Map(snapshots.map((row) => [row.id, row]));
  let inserted = 0;
  let exclusions = 0;
  for (const prediction of predictions) {
    const featureId = predictionFeatureId(prediction.featureSnapshot);
    const snapshot = featureId == null ? null : snapshotById.get(featureId);
    if (!snapshot) continue;
    const espnEvidence = games.filter((row) => row.provider === snapshot.targetProvider
      && row.providerEventId === snapshot.targetEventId);
    const preDecisionEvidence = espnEvidence.filter((row) =>
      row.capturedAt <= prediction.predictionTimestamp
      && row.modeledAsOf <= prediction.predictionTimestamp && row.kickoffAt)
      .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime() || b.id - a.id);
    const kickoffAt = preDecisionEvidence[0]?.kickoffAt
      ?? espnEvidence.flatMap((row) => row.kickoffAt ? [row.kickoffAt] : [])
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    let selection: DecisionMarketSelection;
    if (prediction.odds != null) {
      selection = {
        observation: null,
        exclusionReason: "challenger_prediction_must_keep_odds_null",
        provenance: { predictionOdds: prediction.odds },
      };
    } else if (!kickoffAt || prediction.predictionTimestamp >= kickoffAt) {
      selection = {
        observation: null,
        exclusionReason: kickoffAt ? "prediction_not_before_persisted_kickoff" : "persisted_kickoff_identity_unavailable",
        provenance: {},
      };
    } else if (prediction.market !== "moneyline" && predictionLine(prediction.featureSnapshot) == null) {
      selection = {
        observation: null,
        exclusionReason: "prediction_market_line_unavailable",
        provenance: {},
      };
    } else {
      selection = selectDecisionMarketObservation({
        espnEventId: snapshot.targetEventId,
        predictionTimestamp: prediction.predictionTimestamp,
        kickoffAt,
        market: prediction.market,
        selection: prediction.selection,
        requiredLine: prediction.market === "moneyline" ? null : predictionLine(prediction.featureSnapshot),
        espnEvidence,
        observations: markets,
      });
    }
    const observation = selection.observation;
    const targetEvidence = observation?.gameEvidenceId == null ? preDecisionEvidence[0]
      : espnEvidence.find((row) => row.id === observation.gameEvidenceId) ?? preDecisionEvidence[0];
    const provenanceHash = ncaafValidationHash({
      predictionId: prediction.id, featureSnapshotId: snapshot.id,
      featureInputHash: snapshot.inputHash, selection: selection.provenance,
    });
    const idempotencyHash = ncaafValidationHash({
      schemaVersion: NCAAF_VALIDATION_SCHEMA_VERSION,
      predictionId: prediction.id, featureSnapshotId: snapshot.id,
      marketObservationId: observation?.id ?? null,
      exclusionReason: selection.exclusionReason,
    });
    const result = await db.insert(ncaafDecisionMarketsTable).values({
      datasetVersion: snapshot.schemaVersion, modelVersion: snapshot.modelVersion,
      configVersion: NCAAF_VALIDATION_CONFIG.version, configHash: NCAAF_VALIDATION_CONFIG_HASH,
      predictionId: prediction.id, featureSnapshotId: snapshot.id,
      marketObservationId: observation?.id,
      espnEventId: snapshot.targetEventId, oddsEventId: observation?.providerEventId,
      espnGameEvidenceId: targetEvidence?.id,
      provider: observation?.provider, bookmakerProviderId: observation?.bookmakerProviderId,
      market: prediction.market, providerMarketKey: observation?.marketKey,
      selection: prediction.selection, providerSelection: observation?.selection,
      offeredPrice: observation?.price, offeredLine: observation?.line,
      observationCapturedAt: observation?.capturedAt,
      observationModeledAsOf: observation?.modeledAsOf,
      kickoffAt, status: observation ? "matched" : "excluded",
      exclusionReason: selection.exclusionReason, matchProvenance: selection.provenance,
      evidenceTier: observation ? "matched" : "excluded", uncertainty: observation ? 0 : 1,
      coverage: { decisionMarket: Boolean(observation), eventIdentity: Boolean(targetEvidence) },
      missingReasons: selection.exclusionReason ? [selection.exclusionReason] : [],
      pointInTimeCutoff: prediction.predictionTimestamp,
      provenanceHash, idempotencyHash,
    }).onConflictDoNothing().returning({ id: ncaafDecisionMarketsTable.id });
    inserted += result.length;
    if (selection.exclusionReason) exclusions++;
  }
  return { inserted, candidates: predictions.length, exclusions };
}

export async function persistNcaafDecisionMarkets(cutoff = new Date()): Promise<{
  inserted: number; candidates: number; exclusions: number;
}> {
  const predictions = await db.select().from(modelPredictionsTable).where(and(
      eq(modelPredictionsTable.sport, "NCAAF"),
      eq(modelPredictionsTable.isChallenger, true),
      lte(modelPredictionsTable.predictionTimestamp, cutoff),
      notExists(
        db.select({ id: ncaafDecisionMarketsTable.id })
          .from(ncaafDecisionMarketsTable)
          .where(and(
            eq(ncaafDecisionMarketsTable.predictionId, modelPredictionsTable.id),
            eq(ncaafDecisionMarketsTable.evaluationVersion, NCAAF_EVALUATION_VERSION),
          )),
      ),
    ))
    .orderBy(asc(modelPredictionsTable.id))
    .limit(100);
  if (predictions.length === 0) return { inserted: 0, candidates: 0, exclusions: 0 };
  return persistNcaafDecisionMarketBatch(predictions, cutoff);
}

/**
 * Grades challenger predictions strictly from append-only ledgers. An excluded
 * evaluation is still persisted so missing coverage cannot disappear.
 */
async function persistCompletedNcaafEvaluationBatch(
  decisions: readonly (typeof ncaafDecisionMarketsTable.$inferSelect)[],
  cutoff: Date,
): Promise<{
  inserted: number; candidates: number; exclusions: number;
}> {
  const predictionIds = [...new Set(decisions.map((decision) => decision.predictionId))];
  const featureSnapshotIds = [...new Set(decisions.map((decision) => decision.featureSnapshotId))];
  const predictions = await db.select().from(modelPredictionsTable).where(and(
      eq(modelPredictionsTable.sport, "NCAAF"),
      eq(modelPredictionsTable.isChallenger, true),
      lte(modelPredictionsTable.predictionTimestamp, cutoff),
      inArray(modelPredictionsTable.id, predictionIds),
    ));
  const snapshots = await db.select().from(ncaafFeatureSnapshotsTable).where(and(
    lte(ncaafFeatureSnapshotsTable.dataCutoffAt, cutoff),
    inArray(ncaafFeatureSnapshotsTable.id, featureSnapshotIds),
  ));
  const eventIds = [...new Set(snapshots.map((snapshot) => snapshot.targetEventId))];
  const games = eventIds.length === 0 ? [] : await db.select().from(ncaafGameEvidenceTable).where(and(
    lte(ncaafGameEvidenceTable.capturedAt, cutoff),
    inArray(ncaafGameEvidenceTable.providerEventId, eventIds),
  ));
  const oddsEventIds = [...new Set(decisions.flatMap((decision) =>
    decision.oddsEventId == null ? [] : [decision.oddsEventId]))];
  const markets = oddsEventIds.length === 0 ? [] : await db.select().from(ncaafMarketObservationsTable).where(and(
    lte(ncaafMarketObservationsTable.capturedAt, cutoff),
    inArray(ncaafMarketObservationsTable.providerEventId, oddsEventIds),
  ));
  const prices = await db.select().from(ncaafMarketPricesTable).where(and(
    lte(ncaafMarketPricesTable.pointInTimeCutoff, cutoff),
    inArray(ncaafMarketPricesTable.featureSnapshotId, featureSnapshotIds),
  ));
  const snapshotById = new Map(snapshots.map((s) => [s.id, s]));
  const predictionById = new Map(predictions.map((p) => [p.id, p]));
  const existingIdentities = new Set<string>();
  let inserted = 0;
  let exclusions = 0;
  for (const decision of decisions) {
    const prediction = predictionById.get(decision.predictionId);
    const snapshot = snapshotById.get(decision.featureSnapshotId);
    if (!prediction || !snapshot) continue;
    const eventRows = games.filter((g) => g.provider === snapshot.targetProvider
      && g.providerEventId === snapshot.targetEventId);
    const plan = planCanonicalEvaluation({
      predictionId: prediction.id,
      decisionMarketId: decision.id,
      finalRows: eventRows,
      expected: { provider: snapshot.targetProvider, eventId: snapshot.targetEventId },
      existingEvaluationIdentities: existingIdentities,
    });
    // Pending games are not exclusions. No evaluation fact exists until the
    // immutable ledger contains a qualifying final label.
    if (plan.status !== "ready") continue;
    const final = plan.final;
    const kickoffAt = decision.kickoffAt ?? final?.kickoffAt ?? null;
    let exclusionReason: string | null = decision.exclusionReason;
    if (!kickoffAt) exclusionReason = "persisted_kickoff_identity_unavailable";
    else {
      try {
        assertLeakageSafe({
          predictionAt: prediction.predictionTimestamp,
          featureCutoff: snapshot.dataCutoffAt,
          kickoffAt,
          labelAvailableAt: final?.capturedAt,
        });
      } catch (error) {
        exclusionReason = error instanceof Error ? error.message : "leakage_check_failed";
      }
    }
    if (!exclusionReason && final?.kickoffAt && decision.kickoffAt
      && Math.abs(final.kickoffAt.getTime() - decision.kickoffAt.getTime()) > 180 * 60_000) {
      exclusionReason = "persisted_kickoff_rescheduled_after_decision";
    }
    const decisionEvidence = eventRows.find((row) => row.id === decision.espnGameEvidenceId);
    if (!exclusionReason && final && decisionEvidence
      && (normalizeTeam(final.homeTeamName) !== normalizeTeam(decisionEvidence.homeTeamName)
        || normalizeTeam(final.awayTeamName) !== normalizeTeam(decisionEvidence.awayTeamName))) {
      exclusionReason = "persisted_team_orientation_changed";
    }
    const requiredLine = prediction.market === "moneyline" ? null : decision.offeredLine;
    const closingResult = !exclusionReason && kickoffAt && decision.provider && decision.oddsEventId
      && decision.bookmakerProviderId && decision.providerMarketKey && decision.providerSelection
      && decision.observationCapturedAt
      ? selectLatestEligibleClosing(markets, kickoffAt, {
          provider: decision.provider, eventId: decision.oddsEventId,
          bookmakerProviderId: decision.bookmakerProviderId,
          market: decision.providerMarketKey, selection: decision.providerSelection,
          line: requiredLine, decisionObservedAt: decision.observationCapturedAt,
          decisionModeledAsOf: decision.observationModeledAsOf ?? decision.observationCapturedAt,
        })
      : { closing: null, exclusionReason: exclusionReason ?? "decision_market_unavailable" };
    const closing = closingResult.closing;
    const clvOnlyReason = closingResult.exclusionReason === "closing_line_changed_clv_unavailable"
      ? closingResult.exclusionReason : null;
    if (!exclusionReason && closingResult.exclusionReason && !clvOnlyReason) {
      exclusionReason = closingResult.exclusionReason;
    }
    const priced = prices.find((p) => p.featureSnapshotId === snapshot.id
      && p.market === prediction.market && p.selection === prediction.selection
      && (prediction.market === "moneyline" || p.line === decision.offeredLine));
    // This is intentionally the exact immutable emitted challenger probability.
    const probability = prediction.modelProbability;
    const score = buildImmutableEvaluationScore({
      prediction: {
        market: prediction.market, selection: prediction.selection,
        modelProbability: prediction.modelProbability, odds: prediction.odds,
        units: prediction.units,
      },
      decision: {
        providerSelection: decision.providerSelection ?? prediction.selection,
        offeredLine: decision.offeredLine, offeredPrice: decision.offeredPrice,
      },
      final: final ? { homeScore: final.homeScore!, awayScore: final.awayScore! } : null,
      closing: closing ? { selection: closing.selection, line: closing.line, price: closing.price } : null,
      exclusionReason,
    });
    exclusionReason = score.exclusionReason;
    const outcome = score.outcome;
    const profit = score.profitUnits;
    const clv = score.clv;
      const provenanceHash = ncaafValidationHash({
        predictionId: prediction.id, decisionMarketId: decision.id,
        decisionMarketProvenanceHash: decision.provenanceHash, featureInputHash: snapshot.inputHash,
        finalEvidence: final ? { id: final.id, payloadHash: final.payloadHash } : null,
        closingEvidence: closing ? {
          id: closing.id,
          payloadHash: markets.find((row) => row.id === closing.id)?.payloadHash ?? null,
        } : null,
      });
      const idempotencyHash = ncaafValidationHash({
        evaluationVersion: NCAAF_EVALUATION_VERSION, predictionId: prediction.id,
        featureSnapshotId: snapshot.id, decisionMarketId: decision.id,
        closingObservationId: closing?.id ?? null,
      });
      const result = await db.insert(ncaafEvaluationsTable).values({
        datasetVersion: snapshot.schemaVersion, modelVersion: snapshot.modelVersion,
        configVersion: NCAAF_VALIDATION_CONFIG.version, configHash: NCAAF_VALIDATION_CONFIG_HASH,
        predictionId: prediction.id, featureSnapshotId: snapshot.id,
        decisionMarketId: decision.id, marketPriceId: priced?.id,
        provider: snapshot.targetProvider, providerEventId: snapshot.targetEventId,
        season: snapshot.season, week: final?.week, market: prediction.market,
        selection: prediction.selection, line: decision.offeredLine, offeredPrice: decision.offeredPrice,
        closingLine: closing?.line, closingPrice: closing?.price,
        closingObservationId: closing?.id, outcome, probability,
        brier: outcome && outcome !== "push" ? brierScore(probability, outcome === "win") : null,
        logLoss: outcome && outcome !== "push" ? binaryLogLoss(probability, outcome === "win") : null,
        profitUnits: profit, clv, exclusionReason,
        evidenceTier: priced?.evidenceTier ?? "unknown", uncertainty: priced?.uncertainty ?? 1,
        coverage: {
          finalEvidence: Boolean(final), decisionMarket: decision.status === "matched",
          closingEvidence: Boolean(closing), featureSnapshot: true, prediction: true,
        },
        missingReasons: [exclusionReason, clvOnlyReason].filter((reason): reason is string => Boolean(reason)),
        pointInTimeCutoff: snapshot.dataCutoffAt, labelAvailableAt: final?.capturedAt,
        provenanceHash, idempotencyHash,
      }).onConflictDoNothing().returning({ id: ncaafEvaluationsTable.id });
      inserted += result.length;
      if (exclusionReason) exclusions++;
      existingIdentities.add(plan.identity);
  }
  return { inserted, candidates: decisions.length, exclusions };
}

export async function persistCompletedNcaafEvaluations(cutoff = new Date()): Promise<{
  inserted: number; candidates: number; exclusions: number;
}> {
  const decisions = await db
    .select()
    .from(ncaafDecisionMarketsTable)
    .where(and(
      lte(ncaafDecisionMarketsTable.pointInTimeCutoff, cutoff),
      notExists(
        db.select({ id: ncaafEvaluationsTable.id })
          .from(ncaafEvaluationsTable)
          .where(and(
            eq(ncaafEvaluationsTable.decisionMarketId, ncaafDecisionMarketsTable.id),
            eq(ncaafEvaluationsTable.evaluationVersion, NCAAF_EVALUATION_VERSION),
            eq(ncaafEvaluationsTable.predictionId, ncaafDecisionMarketsTable.predictionId),
          )),
      ),
      exists(
        db.select({ id: ncaafGameEvidenceTable.id })
          .from(ncaafGameEvidenceTable)
          .where(and(
            eq(ncaafGameEvidenceTable.providerEventId, ncaafDecisionMarketsTable.espnEventId),
            lte(ncaafGameEvidenceTable.capturedAt, cutoff),
            isNotNull(ncaafGameEvidenceTable.kickoffAt),
            isNotNull(ncaafGameEvidenceTable.homeScore),
            isNotNull(ncaafGameEvidenceTable.awayScore),
            sql`lower(coalesce(${ncaafGameEvidenceTable.gameStatus}, '')) in ('final', 'post', 'completed')`,
            sql`${ncaafGameEvidenceTable.capturedAt} > ${ncaafGameEvidenceTable.kickoffAt}`,
          )),
      ),
    ))
    .orderBy(asc(ncaafDecisionMarketsTable.id))
    .limit(100);
  if (decisions.length === 0) return { inserted: 0, candidates: 0, exclusions: 0 };
  return persistCompletedNcaafEvaluationBatch(decisions, cutoff);
}

/**
 * Conservative walk-forward accounting. A segment is conclusive only when an
 * earlier season exists and the persisted evaluation history is adequate.
 */
export async function runNcaafWalkForwardValidation(cutoff = new Date()) {
  const evaluationRows = await db.select().from(ncaafEvaluationsTable)
    .where(and(
      lte(ncaafEvaluationsTable.pointInTimeCutoff, cutoff),
      eq(ncaafEvaluationsTable.evaluationVersion, NCAAF_EVALUATION_VERSION),
    ))
    .orderBy(asc(ncaafEvaluationsTable.id))
    .limit(NCAAF_VALIDATION_HISTORY_LIMIT + 1);
  const historyTruncated = evaluationRows.length > NCAAF_VALIDATION_HISTORY_LIMIT;
  const boundedEvaluationRows = historyTruncated
    ? evaluationRows.slice(0, NCAAF_VALIDATION_HISTORY_LIMIT)
    : evaluationRows;
  const canonical = new Map<string, (typeof evaluationRows)[number]>();
  for (const row of boundedEvaluationRows) {
    const identity = `${row.predictionId}:${row.market}`;
    if (!canonical.has(identity)) canonical.set(identity, row);
  }
  const evaluations = [...canonical.values()];
  const seasons = [...new Set(evaluations.map((e) => e.season))].sort();
  const stableEvaluations = [...evaluations].sort((a, b) => a.id - b.id);
  const datasetHash = ncaafValidationHash(stableEvaluations.map((e) => ({
    id: e.id, provenanceHash: e.provenanceHash,
  })));
  const runKey = ncaafWalkForwardRunKey(datasetHash);
  const existing = await db.select().from(ncaafWalkForwardRunsTable)
    .where(eq(ncaafWalkForwardRunsTable.runKey, runKey)).limit(1);
  if (existing[0]) return existing[0];
  const conclusive = !historyTruncated
    && seasons.length >= NCAAF_VALIDATION_CONFIG.minimumEvaluationSeasons;
  const [run] = await db.insert(ncaafWalkForwardRunsTable).values({
    datasetVersion: NCAAF_VALIDATION_SCHEMA_VERSION, datasetHash,
    modelVersion: "ncaaf-market-free-v1", modelHash: ncaafValidationHash("ncaaf-market-free-v1"),
    configVersion: NCAAF_VALIDATION_CONFIG.version, configHash: NCAAF_VALIDATION_CONFIG_HASH,
    runKey, status: conclusive ? "completed" : "inconclusive", pointInTimeCutoff: cutoff,
    provenanceHash: ncaafValidationHash({ datasetHash, seasons }), evidenceTier: conclusive ? "observed" : "insufficient",
    uncertainty: conclusive ? 0 : 1,
    coverage: { evaluations: evaluations.length, seasons: seasons.length },
    missingReasons: conclusive ? [] : [
      historyTruncated ? "validation_history_exceeds_memory_budget" : "insufficient_historical_seasons",
    ],
    summary: { noPromotionAuthorized: true, historyTruncated, historyLimit: NCAAF_VALIDATION_HISTORY_LIMIT },
  }).returning();
  for (const season of seasons) {
    const trainingSeasons = seasons.filter((s) => s < season);
    const rows = evaluations.filter((e) => e.season === season)
      .sort((a, b) => (a.labelAvailableAt?.getTime() ?? 0) - (b.labelAvailableAt?.getTime() ?? 0)
        || a.id - b.id);
    const eligible = rows.filter((e) => !e.exclusionReason && e.outcome);
    const status = trainingSeasons.length && eligible.length ? "completed" : "inconclusive";
    const idempotencyHash = ncaafValidationHash({ runKey, season, trainingSeasons });
    await db.insert(ncaafWalkForwardSegmentsTable).values({
      datasetVersion: NCAAF_VALIDATION_SCHEMA_VERSION, datasetHash,
      modelVersion: "ncaaf-market-free-v1", modelHash: ncaafValidationHash("ncaaf-market-free-v1"),
      configVersion: NCAAF_VALIDATION_CONFIG.version, configHash: NCAAF_VALIDATION_CONFIG_HASH,
      runId: run!.id, evaluationSeason: season, trainingSeasons, status,
      metrics: evaluationGroups(rows.map((e) => ({
        season: e.season, week: e.week, market: e.market, price: e.offeredPrice,
        evidenceTier: e.evidenceTier, probability: e.probability,
        outcome: e.outcome as BetOutcome | null, profit: e.profitUnits, clv: e.clv,
        excluded: Boolean(e.exclusionReason),
      }))),
      pointInTimeCutoff: cutoff, provenanceHash: ncaafValidationHash(rows.map((r) => r.provenanceHash)),
      evidenceTier: status === "completed" ? "observed" : "insufficient",
      uncertainty: status === "completed" ? 0 : 1,
      coverage: { candidates: rows.length, eligible: eligible.length },
      missingReasons: status === "completed" ? [] : ["no_strictly_prior_training_season_or_eligible_rows"],
      idempotencyHash,
    }).onConflictDoNothing();
  }
  return run!;
}

/** Persists a decision record only; it never changes model_versions or publishing. */
export async function persistNcaafPromotionDecision(input: {
  championModelVersion: string; challengerModelVersion: string; datasetVersion: string;
  metrics: PromotionMetrics; cutoff?: Date; provenance: unknown; policyReasons?: readonly string[];
}) {
  const cutoff = input.cutoff ?? new Date();
  const result = evaluatePromotionGates(input.metrics);
  const provenanceHash = ncaafValidationHash(input.provenance);
  const policyReasons = [...(input.policyReasons ?? [])];
  const decision = policyReasons.length ? "rejected" : result.decision;
  const reasons = [...policyReasons, ...result.reasons];
  const gates = [
    ...result.gates,
    ...policyReasons.map((reason) => ({
      gate: `policy:${reason}`, value: null, passed: false, reason,
    })),
  ];
  const idempotencyHash = ncaafPromotionDecisionKey({
    championModelVersion: input.championModelVersion,
    challengerModelVersion: input.challengerModelVersion,
    datasetVersion: input.datasetVersion,
    metrics: input.metrics,
    policyReasons,
    thresholdHash: result.thresholdHash,
    provenanceHash,
  });
  const [inserted] = await db.insert(ncaafPromotionDecisionsTable).values({
    datasetVersion: input.datasetVersion, modelVersion: input.challengerModelVersion,
    championModelVersion: input.championModelVersion, challengerModelVersion: input.challengerModelVersion,
    configVersion: NCAAF_VALIDATION_CONFIG.version, configHash: NCAAF_VALIDATION_CONFIG_HASH,
    thresholdConfig: NCAAF_VALIDATION_CONFIG.gates, thresholdHash: result.thresholdHash,
    decision, gates, reasons,
    pointInTimeCutoff: cutoff, provenanceHash, evidenceTier: "observed",
    uncertainty: 0, coverage: { value: input.metrics.coverage },
    missingReasons: reasons, idempotencyHash,
  }).onConflictDoNothing().returning();
  return inserted ?? (await db.select().from(ncaafPromotionDecisionsTable)
    .where(eq(ncaafPromotionDecisionsTable.idempotencyHash, idempotencyHash)).limit(1))[0]!;
}

export async function runNcaafValidationCycle(cutoff = new Date()) {
  const decisionMarkets = await persistNcaafDecisionMarkets(cutoff);
  const pricesInserted = await persistNcaafFairPrices(cutoff);
  const evaluations = await persistCompletedNcaafEvaluations(cutoff);
  const walkForward = await runNcaafWalkForwardValidation(cutoff);
  const [loadedEvaluationRows, snapshotRows, priceRows, evidenceRows] = await Promise.all([
    db.select().from(ncaafEvaluationsTable).where(and(
      lte(ncaafEvaluationsTable.createdAt, cutoff),
      eq(ncaafEvaluationsTable.evaluationVersion, NCAAF_EVALUATION_VERSION),
    )).orderBy(asc(ncaafEvaluationsTable.id)).limit(NCAAF_VALIDATION_HISTORY_LIMIT + 1),
    db.select({ configHash: ncaafFeatureSnapshotsTable.configHash })
      .from(ncaafFeatureSnapshotsTable).where(lte(ncaafFeatureSnapshotsTable.createdAt, cutoff))
      .groupBy(ncaafFeatureSnapshotsTable.configHash),
    db.select({ configHash: ncaafMarketPricesTable.configHash })
      .from(ncaafMarketPricesTable).where(lte(ncaafMarketPricesTable.createdAt, cutoff))
      .groupBy(ncaafMarketPricesTable.configHash),
    db.select({ capturedAt: sql<Date | null>`max(${ncaafGameEvidenceTable.capturedAt})` })
      .from(ncaafGameEvidenceTable).where(lte(ncaafGameEvidenceTable.capturedAt, cutoff)),
  ]);
  const historyTruncated = loadedEvaluationRows.length > NCAAF_VALIDATION_HISTORY_LIMIT;
  const evaluationRows = historyTruncated
    ? loadedEvaluationRows.slice(0, NCAAF_VALIDATION_HISTORY_LIMIT)
    : loadedEvaluationRows;
  const eligible = evaluationRows.filter((e) => !e.exclusionReason && e.outcome);
  const calibration = calibrationBuckets(evaluationRows.map((e) => ({
    season: e.season, week: e.week, market: e.market, price: e.offeredPrice,
    evidenceTier: e.evidenceTier, probability: e.probability,
    outcome: e.outcome as BetOutcome | null, profit: e.profitUnits, clv: e.clv,
    excluded: Boolean(e.exclusionReason),
  })));
  const seasonCoverage = [...new Set(evaluationRows.map((e) => e.season))].sort((a, b) => b - a)
    .map((season) => {
      const rows = evaluationRows.filter((e) => e.season === season);
      return rows.length ? rows.filter((e) => !e.exclusionReason).length / rows.length : null;
    });
  const completedSegments = await db.select().from(ncaafWalkForwardSegmentsTable).where(and(
    eq(ncaafWalkForwardSegmentsTable.runId, walkForward.id),
    eq(ncaafWalkForwardSegmentsTable.status, "completed"),
  ));
  const oosSeasons = new Set(completedSegments.map((segment) => segment.evaluationSeason));
  const oosEvaluationRows = evaluationRows.filter((row) => oosSeasons.has(row.season));
  const aggregate = deriveNcaafPromotionMetrics(oosEvaluationRows.map((e) => ({
    id: e.id, predictionId: e.predictionId,
    provenanceHash: e.provenanceHash, labelAvailableAt: e.labelAvailableAt,
    season: e.season, week: e.week, market: e.market, price: e.offeredPrice,
    evidenceTier: e.evidenceTier, probability: e.probability,
    outcome: e.outcome as BetOutcome | null, profit: e.profitUnits, clv: e.clv,
    excluded: Boolean(e.exclusionReason),
  })));
  const boundedHistoryPolicyReasons = historyTruncated
    ? ["validation_history_exceeds_memory_budget"]
    : [];
  const promotion = await persistNcaafPromotionDecision({
    championModelVersion: "none:ncaaf-publication-disabled",
    challengerModelVersion: "ncaaf-market-free-v1",
    datasetVersion: aggregate.datasetHash,
    metrics: aggregate.metrics,
    policyReasons: [...aggregate.policyReasons, ...boundedHistoryPolicyReasons],
    cutoff,
    provenance: {
      datasetHash: aggregate.datasetHash,
      walkForwardRunKey: walkForward.runKey,
      completedSegmentIds: completedSegments.map((segment) => segment.id).sort((a, b) => a - b),
      evaluationSeasons: aggregate.evaluationSeasons,
      marketsPresent: aggregate.marketsPresent,
    },
  });
  await reconcileNcaafValidationAlerts(ncaafValidationHealthSignals({
    now: cutoff,
    candidateCount: evaluationRows.length,
    latestEvidenceAt: evidenceRows[0]?.capturedAt ?? null,
    exclusions: evaluationRows.flatMap((e) => e.exclusionReason ? [e.exclusionReason] : []),
    observedFeatureConfigHashes: snapshotRows.map((s) => s.configHash),
    observedValidationConfigHashes: priceRows.map((p) => p.configHash),
    calibrationError: calibration.length
      ? Math.max(...calibration.map((bucket) => bucket.calibrationError)) : null,
    currentCoverage: evaluationRows.length ? eligible.length / evaluationRows.length : null,
    previousCoverage: seasonCoverage[1] ?? null,
  }));
  return {
    decisionMarkets, pricesInserted, evaluations,
    walkForwardRunId: walkForward.id, status: walkForward.status,
    promotionDecisionId: promotion.id, promotionDecision: promotion.decision,
  };
}

// String names keep the auditable boundary explicit without dereferencing DB
// exports at module initialization (important for scheduler's partial DB mocks).
export const NCAAF_VALIDATION_ALLOWED_SOURCES = Object.freeze([
  "model_predictions",
  "ncaaf_feature_snapshots",
  "ncaaf_game_evidence",
  "ncaaf_market_observations",
  "ncaaf_decision_markets",
]);