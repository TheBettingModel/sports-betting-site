import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  spreadModelConfigsTable,
  spreadPredictionsTable,
  spreadPredictionResultsTable,
  ncaafPromotionDecisionsTable,
  type InsertSpreadPrediction,
} from "@workspace/db";
import type { FetchedGame } from "./espn";
import type { GameOdds, SpreadBookmakerLine } from "./oddsApi";
import type { DbTeamStats, WnbaTeamStats } from "./teamStats";
import { calculateClv, calculateUnits, gradeSpread, type GradeResult } from "./grading";
import {
  deriveApprovalStatus,
  evaluateAndRecordAutomaticApproval,
  evaluateBettingQuality,
  getPublicationPermission,
  marketApprovalDecisionHash,
  recordManualMarketApproval,
  type ApprovalLayerResult,
  type MarketApprovalIdentity,
  type MarketApprovalStatus,
} from "./marketApproval";

export type SpreadSport = "NFL" | "NCAAF" | "NBA" | "NCAAB" | "WNBA";

export const SPREAD_MARGIN_CONVENTION = Object.freeze({
  version: "home-perspective-v1",
  predictedMargin: "projected_home_score_minus_projected_away_score",
  actualMargin: "final_home_score_minus_final_away_score",
  residual: "actual_margin_minus_predicted_margin",
});

export function spreadResidual(input: {
  expectedHomeMargin: number;
  homeScore: number;
  awayScore: number;
}): number {
  return (input.homeScore - input.awayScore) - input.expectedHomeMargin;
}

export interface SpreadValidationMetrics {
  sampleSize: number;
  calibrationError: number;
  brierScore: number;
  logLoss: number;
  roi: number;
  clv: number;
  maxDrawdown: number;
  coverage: number;
  dataQualityRate: number;
  datasetVersion?: string;
  evaluationVersion?: string;
  featureSchemaVersion?: string;
  evidenceCutoff?: string;
}

export interface NcaafMarketApproval {
  approved: boolean;
  modelVersion: string | null;
  decidedAt: Date | null;
}

interface SpreadGatePolicy {
  minSampleSize: number;
  maxCalibrationError: number;
  maxBrierScore: number;
  maxLogLoss: number;
  minRoi: number;
  minClv: number;
  maxDrawdown: number;
  minCoverage: number;
  minDataQualityRate: number;
}

interface SpreadConfig {
  sport: SpreadSport;
  modelKey: string;
  modelVersion: string;
  configHash: string;
  marginStandardDeviation: number;
  minimumTeamSample: number;
  minimumProbabilityEdge: number;
  minimumExpectedValue: number;
  gatePolicy: SpreadGatePolicy;
}

const DEFAULT_GATE: SpreadGatePolicy = {
  minSampleSize: 250,
  maxCalibrationError: 0.035,
  maxBrierScore: 0.245,
  maxLogLoss: 0.69,
  minRoi: 0.01,
  minClv: 0,
  maxDrawdown: 0.2,
  minCoverage: 0.85,
  minDataQualityRate: 0.98,
};

/**
 * Each sport owns a distinct model identity, distribution width, evidence
 * threshold, pricing gate, and future validation record.
 */
export const SPREAD_CONFIGS: Record<SpreadSport, SpreadConfig> = {
  NFL: {
    sport: "NFL",
    modelKey: "tbm-nfl-spread",
    modelVersion: "nfl-spread-v1",
    configHash: "nfl-spread-v1-margin-pd-rest-form",
    marginStandardDeviation: 13.5,
    minimumTeamSample: 3,
    minimumProbabilityEdge: 0.04,
    minimumExpectedValue: 0.04,
    gatePolicy: DEFAULT_GATE,
  },
  NCAAF: {
    sport: "NCAAF",
    modelKey: "tbm-ncaaf-spread",
    modelVersion: "ncaaf-spread-v1",
    configHash: "ncaaf-spread-v1-margin-pd-rest-form",
    marginStandardDeviation: 17.5,
    minimumTeamSample: 4,
    minimumProbabilityEdge: 0.05,
    minimumExpectedValue: 0.05,
    gatePolicy: { ...DEFAULT_GATE, minSampleSize: 350, minDataQualityRate: 0.995 },
  },
  NBA: {
    sport: "NBA",
    modelKey: "tbm-nba-spread",
    modelVersion: "nba-spread-v1",
    configHash: "nba-spread-v1-netrating-form-rest",
    marginStandardDeviation: 12.0,
    minimumTeamSample: 5,
    minimumProbabilityEdge: 0.035,
    minimumExpectedValue: 0.035,
    gatePolicy: DEFAULT_GATE,
  },
  NCAAB: {
    sport: "NCAAB",
    modelKey: "tbm-ncaab-spread",
    modelVersion: "ncaab-spread-v1",
    configHash: "ncaab-spread-v1-margin-pd-rest-form",
    marginStandardDeviation: 14.0,
    minimumTeamSample: 6,
    minimumProbabilityEdge: 0.045,
    minimumExpectedValue: 0.045,
    gatePolicy: { ...DEFAULT_GATE, minSampleSize: 300 },
  },
  WNBA: {
    sport: "WNBA",
    modelKey: "tbm-wnba-spread",
    modelVersion: "wnba-spread-v1",
    configHash: "wnba-spread-v1-netrating-form-rest",
    marginStandardDeviation: 11.0,
    minimumTeamSample: 5,
    minimumProbabilityEdge: 0.04,
    minimumExpectedValue: 0.04,
    gatePolicy: DEFAULT_GATE,
  },
};

export interface SpreadEvaluationInput {
  game: FetchedGame;
  odds: GameOdds | null;
  homeTeamStats?: WnbaTeamStats;
  awayTeamStats?: WnbaTeamStats;
  homeDbStats?: DbTeamStats;
  awayDbStats?: DbTeamStats;
  capturedAt?: Date;
}

export interface SpreadCandidate {
  gameId: string;
  sport: SpreadSport;
  modelKey: string;
  modelVersion: string;
  selection: "home" | "away";
  teamAbbr: string;
  sportsbook: string;
  line: number;
  odds: number;
  opposingLine: number;
  opposingOdds: number;
  expectedHomeMargin: number;
  marginStandardDeviation: number;
  modelProbability: number;
  noVigProbability: number;
  fairPrice: number;
  edge: number;
  expectedValue: number;
  pushProbability: number;
  uncertainty: number;
  confidence: "High" | "Medium" | "Low";
  recommendation: "Strong Buy" | "Buy" | "Neutral";
  units: number;
  priceQualified: boolean;
  promotionEligible: boolean;
  gateStatus: "shadow" | "challenger" | "production";
  gateReasons: string[];
  approvalStatus?: MarketApprovalStatus;
  researchRecommendation?: "Strong Buy" | "Buy" | "Neutral";
  researchUnits?: number;
  featureSnapshot: Record<string, unknown>;
  capturedAt: Date;
}

function spreadApprovalIdentity(
  config: SpreadConfig,
  metrics: SpreadValidationMetrics | null,
  evidenceCutoff: Date,
): MarketApprovalIdentity {
  return {
    sport: config.sport,
    market: "spread",
    modelVersion: config.modelVersion,
    evaluationVersion: metrics?.evaluationVersion ?? "spread-validation-v2",
    datasetVersion: metrics?.datasetVersion ?? "spread-dataset:unvalidated",
    featureSchemaVersion: metrics?.featureSchemaVersion ?? "spread-feature-v1",
    evidenceCutoff,
  };
}

function isSpreadSport(sport: string): sport is SpreadSport {
  return Object.prototype.hasOwnProperty.call(SPREAD_CONFIGS, sport);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

export function computeSpreadUncertainty(marginStandardDeviation: number): number {
  // Thirty points is the conservative upper bound across supported sport
  // distributions. Scaling against it keeps wider NCAAF outcomes honest
  // without making the sport categorically ineligible.
  return clamp(marginStandardDeviation / 30, 0, 1);
}

function americanToImplied(odds: number): number {
  return odds < 0
    ? Math.abs(odds) / (Math.abs(odds) + 100)
    : 100 / (odds + 100);
}

function impliedToAmerican(probability: number): number {
  const p = clamp(probability, 0.01, 0.99);
  return p >= 0.5
    ? Math.round(-(p / (1 - p)) * 100)
    : Math.round(((1 - p) / p) * 100);
}

function payoutProfit(odds: number): number {
  return odds > 0 ? odds / 100 : 100 / Math.abs(odds);
}

function parseRecordGames(record: string): number {
  return record
    .split("-")
    .map(Number)
    .filter(Number.isFinite)
    .reduce((sum, value) => sum + value, 0);
}

function basketballMargin(
  sport: "NBA" | "WNBA",
  home: WnbaTeamStats,
  away: WnbaTeamStats,
): number {
  if (sport === "NBA") {
    const ratings = ((home.netRating ?? home.last10PointDiff) - (away.netRating ?? away.last10PointDiff)) * 0.52;
    const form = (home.last10PointDiff - away.last10PointDiff) * 0.22;
    const rest = clamp(home.restDays - away.restDays, -3, 3) * 0.35;
    return 2.2 + ratings + form + rest;
  }
  const ratings = ((home.netRating ?? home.last10PointDiff) - (away.netRating ?? away.last10PointDiff)) * 0.55;
  const form = (home.last10PointDiff - away.last10PointDiff) * 0.24;
  const rest = clamp(home.restDays - away.restDays, -3, 3) * 0.3;
  return 1.6 + ratings + form + rest;
}

function footballMargin(
  sport: "NFL" | "NCAAF",
  home: DbTeamStats,
  away: DbTeamStats,
): number {
  if (sport === "NFL") {
    return 2.2
      + (home.scoreDifferential - away.scoreDifferential) * 0.62
      + (home.last5ScoreDiff - away.last5ScoreDiff) * 0.18
      + clamp(home.restDays - away.restDays, -7, 7) * 0.22;
  }
  return 3.2
    + (home.scoreDifferential - away.scoreDifferential) * 0.58
    + (home.last5ScoreDiff - away.last5ScoreDiff) * 0.16
    + clamp(home.restDays - away.restDays, -7, 7) * 0.12;
}

function collegeBasketballMargin(home: DbTeamStats, away: DbTeamStats): number {
  return 3.0
    + (home.scoreDifferential - away.scoreDifferential) * 0.58
    + (home.last5ScoreDiff - away.last5ScoreDiff) * 0.2
    + clamp(home.restDays - away.restDays, -4, 4) * 0.2;
}

function computeExpectedMargin(
  input: SpreadEvaluationInput,
  config: SpreadConfig,
): { margin: number; snapshot: Record<string, unknown> } | null {
  if (config.sport === "NBA" || config.sport === "WNBA") {
    const home = input.homeTeamStats;
    const away = input.awayTeamStats;
    if (!home || !away) return null;
    if (
      parseRecordGames(input.game.homeTeamRecord) < config.minimumTeamSample
      || parseRecordGames(input.game.awayTeamRecord) < config.minimumTeamSample
    ) {
      return null;
    }
    return {
      margin: basketballMargin(config.sport, home, away),
      snapshot: {
        pipeline: config.sport === "NBA" ? "nba-netrating-form-rest" : "wnba-netrating-form-rest",
        home: {
          netRating: home.netRating ?? null,
          last10PointDiff: home.last10PointDiff,
          restDays: home.restDays,
        },
        away: {
          netRating: away.netRating ?? null,
          last10PointDiff: away.last10PointDiff,
          restDays: away.restDays,
        },
      },
    };
  }
  const home = input.homeDbStats;
  const away = input.awayDbStats;
  if (!home || !away || home.sampleSize < config.minimumTeamSample || away.sampleSize < config.minimumTeamSample) {
    return null;
  }
  const margin = config.sport === "NCAAB"
    ? collegeBasketballMargin(home, away)
    : footballMargin(config.sport, home, away);
  return {
    margin,
    snapshot: {
      pipeline: config.sport === "NCAAB"
        ? "ncaab-point-differential-form-rest"
        : `${config.sport.toLowerCase()}-point-differential-form-rest`,
      home: {
        scoreDifferential: home.scoreDifferential,
        last5ScoreDiff: home.last5ScoreDiff,
        restDays: home.restDays,
        sampleSize: home.sampleSize,
      },
      away: {
        scoreDifferential: away.scoreDifferential,
        last5ScoreDiff: away.last5ScoreDiff,
        restDays: away.restDays,
        sampleSize: away.sampleSize,
      },
    },
  };
}

export function evaluateValidationGate(
  sport: SpreadSport,
  status: string,
  metrics: SpreadValidationMetrics | null,
  policy: SpreadGatePolicy,
): { eligible: boolean; status: SpreadCandidate["gateStatus"]; reasons: string[] } {
  const gateStatus = status === "production" ? "production" : status === "challenger" ? "challenger" : "shadow";
  const reasons: string[] = [];
  if (status !== "production") reasons.push(`model_status_${gateStatus}`);
  if (sport === "NCAAF" && status !== "production") reasons.push("ncaaf_challenger_not_promoted");
  if (!metrics) {
    reasons.push("validation_metrics_missing");
    return { eligible: false, status: gateStatus, reasons };
  }
  if (metrics.sampleSize < policy.minSampleSize) reasons.push("sample_support");
  if (metrics.calibrationError > policy.maxCalibrationError) reasons.push("calibration");
  if (metrics.brierScore > policy.maxBrierScore) reasons.push("brier_score");
  if (metrics.logLoss > policy.maxLogLoss) reasons.push("log_loss");
  if (metrics.roi < policy.minRoi) reasons.push("roi");
  if (metrics.clv < policy.minClv) reasons.push("clv");
  if (metrics.maxDrawdown > policy.maxDrawdown) reasons.push("drawdown");
  if (metrics.coverage < policy.minCoverage) reasons.push("coverage");
  if (metrics.dataQualityRate < policy.minDataQualityRate) reasons.push("data_quality");
  return { eligible: status === "production" && reasons.length === 0, status: gateStatus, reasons };
}

function evaluateMarket(
  line: SpreadBookmakerLine,
  expectedHomeMargin: number,
  config: SpreadConfig,
  gate: ReturnType<typeof evaluateValidationGate>,
  input: SpreadEvaluationInput,
  featureSnapshot: Record<string, unknown>,
): SpreadCandidate[] {
  const threshold = -line.homeLine;
  const wholeNumberLine = Number.isInteger(Math.abs(line.homeLine));
  const pushProbability = wholeNumberLine
    ? clamp(
        normalCdf((threshold + 0.5 - expectedHomeMargin) / config.marginStandardDeviation)
          - normalCdf((threshold - 0.5 - expectedHomeMargin) / config.marginStandardDeviation),
        0,
        0.12,
      )
    : 0;
  const homeCoverProbability = clamp(
    normalCdf((expectedHomeMargin - threshold) / config.marginStandardDeviation) * (1 - pushProbability),
    0.01,
    0.98,
  );
  const awayCoverProbability = clamp(1 - homeCoverProbability - pushProbability, 0.01, 0.98);
  const homeRaw = americanToImplied(line.homeOdds);
  const awayRaw = americanToImplied(line.awayOdds);
  const totalRaw = homeRaw + awayRaw;
  const homeNoVig = homeRaw / totalRaw;
  const awayNoVig = awayRaw / totalRaw;
  const uncertainty = clamp(
    computeSpreadUncertainty(config.marginStandardDeviation)
      + (featureSnapshot.pipeline ? 0 : 0.2),
    0,
    1,
  );
  const capturedAt = input.capturedAt ?? new Date();

  return ([
    {
      selection: "home" as const,
      probability: homeCoverProbability,
      noVig: homeNoVig,
      odds: line.homeOdds,
      point: line.homeLine,
      opposingLine: line.awayLine,
      opposingOdds: line.awayOdds,
      teamAbbr: input.game.homeTeamAbbr,
    },
    {
      selection: "away" as const,
      probability: awayCoverProbability,
      noVig: awayNoVig,
      odds: line.awayOdds,
      point: line.awayLine,
      opposingLine: line.homeLine,
      opposingOdds: line.homeOdds,
      teamAbbr: input.game.awayTeamAbbr,
    },
  ]).map((side) => {
    const edge = side.probability - side.noVig;
    const expectedValue = side.probability * payoutProfit(side.odds) - (1 - side.probability - pushProbability);
    const priceQualified = edge >= config.minimumProbabilityEdge
      && expectedValue >= config.minimumExpectedValue
      && uncertainty <= 0.8;
    const recommendation = priceQualified
      ? edge >= config.minimumProbabilityEdge * 1.75 && expectedValue >= config.minimumExpectedValue * 1.75
        ? "Strong Buy"
        : "Buy"
      : "Neutral";
    const confidence = uncertainty <= 0.62 && edge >= 0.07
      ? "High"
      : uncertainty <= 0.75 && edge >= 0.04
        ? "Medium"
        : "Low";
    const units = priceQualified && gate.eligible
      ? clamp(Math.round((0.5 + edge * 12) * 2) / 2, 0.5, 2)
      : 0;
    return {
      gameId: input.game.espnId,
      sport: config.sport,
      modelKey: config.modelKey,
      modelVersion: config.modelVersion,
      selection: side.selection,
      teamAbbr: side.teamAbbr,
      sportsbook: line.book,
      line: side.point,
      odds: side.odds,
      opposingLine: side.opposingLine,
      opposingOdds: side.opposingOdds,
      expectedHomeMargin: Math.round(expectedHomeMargin * 10) / 10,
      marginStandardDeviation: config.marginStandardDeviation,
      modelProbability: side.probability,
      noVigProbability: side.noVig,
      fairPrice: impliedToAmerican(side.probability / Math.max(0.01, 1 - pushProbability)),
      edge,
      expectedValue,
      pushProbability,
      uncertainty,
      confidence,
      recommendation,
      units,
      priceQualified,
      promotionEligible: priceQualified && gate.eligible,
      gateStatus: gate.status,
      gateReasons: gate.reasons,
      featureSnapshot: {
        schemaVersion: 1,
        configHash: config.configHash,
        gameStartsAt: input.game.commenceTimeISO,
        ...featureSnapshot,
      },
      capturedAt,
    };
  });
}

async function ensureConfig(config: SpreadConfig): Promise<{
  status: string;
  validationMetrics: SpreadValidationMetrics | null;
}> {
  await db.insert(spreadModelConfigsTable).values({
    sport: config.sport,
    modelKey: config.modelKey,
    modelVersion: config.modelVersion,
    status: "shadow",
    configHash: config.configHash,
    parameters: {
      marginStandardDeviation: config.marginStandardDeviation,
      minimumTeamSample: config.minimumTeamSample,
      minimumProbabilityEdge: config.minimumProbabilityEdge,
      minimumExpectedValue: config.minimumExpectedValue,
    },
    gatePolicy: config.gatePolicy,
  }).onConflictDoNothing();
  const [row] = await db
    .select({
      status: spreadModelConfigsTable.status,
      validationMetrics: spreadModelConfigsTable.validationMetrics,
    })
    .from(spreadModelConfigsTable)
    .where(and(
      eq(spreadModelConfigsTable.sport, config.sport),
      eq(spreadModelConfigsTable.modelKey, config.modelKey),
    ))
    .limit(1);
  return {
    status: row?.status ?? "shadow",
    validationMetrics: (row?.validationMetrics as SpreadValidationMetrics | null | undefined) ?? null,
  };
}

export async function buildSpreadCandidates(input: SpreadEvaluationInput): Promise<SpreadCandidate[]> {
  if (!isSpreadSport(input.game.sport) || !input.odds?.spreadMarkets?.length) return [];
  const config = SPREAD_CONFIGS[input.game.sport];
  const distribution = computeExpectedMargin(input, config);
  if (!distribution) return [];
  const persistedConfig = await ensureConfig(config);
  const gate = evaluateValidationGate(
    config.sport,
    persistedConfig.status,
    persistedConfig.validationMetrics,
    config.gatePolicy,
  );
  const approval = await getPublicationPermission(
    spreadApprovalIdentity(config, persistedConfig.validationMetrics, input.capturedAt ?? new Date()),
  );
  const permissionGate = {
    ...gate,
    eligible: gate.eligible && approval.approved,
    status: approval.approved
      ? "production" as const
      : approval.status === "PROVISIONAL"
        ? "challenger" as const
        : "shadow" as const,
    reasons: [...new Set([...gate.reasons, ...approval.reasons])],
  };
  return input.odds.spreadMarkets.flatMap((market) =>
    evaluateMarket(market, distribution.margin, config, permissionGate, input, {
      ...distribution.snapshot,
      validationMetrics: persistedConfig.validationMetrics,
      approvalStatus: approval.status,
      approvalDecisionId: approval.decisionId,
    })
  ).map((candidate) => ({
    ...candidate,
    approvalStatus: approval.status,
    researchRecommendation: candidate.recommendation,
    researchUnits: candidate.priceQualified
      ? clamp(Math.round((0.5 + candidate.edge * 12) * 2) / 2, 0.5, 2)
      : 0,
    featureSnapshot: {
      ...candidate.featureSnapshot,
      spreadMarginConvention: SPREAD_MARGIN_CONVENTION,
    },
  }));
}

export function selectBestSpreadCandidate(candidates: readonly SpreadCandidate[]): SpreadCandidate | null {
  return candidates
    .filter((candidate) => candidate.priceQualified)
    .reduce<SpreadCandidate | null>((best, candidate) => {
      if (!best) return candidate;
      if (candidate.promotionEligible !== best.promotionEligible) {
        return candidate.promotionEligible ? candidate : best;
      }
      if (candidate.expectedValue !== best.expectedValue) {
        return candidate.expectedValue > best.expectedValue ? candidate : best;
      }
      return candidate.edge > best.edge ? candidate : best;
    }, null);
}

export function selectLatestPromotionEligibleCandidate(
  candidates: readonly SpreadCandidate[],
): SpreadCandidate | null {
  if (candidates.length === 0) return null;
  const latestCapturedAt = Math.max(...candidates.map((candidate) => candidate.capturedAt.getTime()));
  return selectBestSpreadCandidate(
    candidates.filter((candidate) =>
      candidate.capturedAt.getTime() === latestCapturedAt
      && candidate.promotionEligible
      && candidate.gateStatus === "production"
    ),
  );
}

export async function getNcaafMarketApproval(): Promise<NcaafMarketApproval> {
  const [decision] = await db
    .select({
      decision: ncaafPromotionDecisionsTable.decision,
      challengerModelVersion: ncaafPromotionDecisionsTable.challengerModelVersion,
      createdAt: ncaafPromotionDecisionsTable.createdAt,
    })
    .from(ncaafPromotionDecisionsTable)
    .orderBy(desc(ncaafPromotionDecisionsTable.createdAt))
    .limit(1);
  return {
    approved: decision?.decision === "eligible",
    modelVersion: decision?.decision === "eligible" ? decision.challengerModelVersion : null,
    decidedAt: decision?.createdAt ?? null,
  };
}

export interface MarketSelectionCandidate {
  market: "moneyline" | "spread";
  eligible: boolean;
  expectedValue: number;
  edge: number;
  modelProbability: number;
  uncertainty: number;
  priceQuality: number;
  marketQuality: number;
  dataQuality: number;
  clvSignal?: number;
  pushProbability?: number;
}

export interface MarketSelectionScore {
  market: "moneyline" | "spread";
  score: number;
  components: {
    expectedValue: number;
    edge: number;
    probabilityQuality: number;
    uncertaintyPenalty: number;
    priceQuality: number;
    marketQuality: number;
    dataQuality: number;
    clvSignal: number;
    pushPenalty: number;
  };
}

export function spreadToMarketSelectionCandidate(
  spread: SpreadCandidate,
): MarketSelectionCandidate {
  return {
    market: "spread",
    eligible: spread.promotionEligible && spread.gateStatus === "production",
    expectedValue: spread.expectedValue,
    edge: spread.edge,
    modelProbability: spread.modelProbability,
    uncertainty: spread.uncertainty,
    priceQuality: clamp(1 - Math.abs(spread.odds + 110) / 400, 0, 1),
    marketQuality: spread.opposingOdds !== 0 ? 1 : 0,
    // Eligibility already requires the spread's immutable validation metrics
    // to pass CLV and data-quality gates. Until an equivalent per-game
    // moneyline aggregate is available, treat both approved markets neutrally
    // on these two components rather than biasing the winner asymmetrically.
    dataQuality: 1,
    clvSignal: 0,
    pushProbability: spread.pushProbability,
  };
}

function normalizedProbabilityQuality(probability: number, uncertainty: number): number {
  const decisiveness = Math.abs(probability - 0.5) * 2;
  return clamp((1 - uncertainty) * 0.7 + decisiveness * 0.3, 0, 1);
}

/**
 * Compare independently validated markets on a common risk-adjusted scale.
 * EV remains the strongest signal; uncertainty and push risk prevent a high
 * hit-rate but weakly priced spread from automatically beating a moneyline.
 */
export function scoreMarketCandidate(candidate: MarketSelectionCandidate): MarketSelectionScore {
  const components = {
    expectedValue: clamp(candidate.expectedValue, -0.5, 0.5) * 0.45,
    edge: clamp(candidate.edge, -0.25, 0.25) * 0.2,
    probabilityQuality: normalizedProbabilityQuality(
      candidate.modelProbability,
      candidate.uncertainty,
    ) * 0.1,
    uncertaintyPenalty: -clamp(candidate.uncertainty, 0, 1) * 0.15,
    priceQuality: clamp(candidate.priceQuality, 0, 1) * 0.08,
    marketQuality: clamp(candidate.marketQuality, 0, 1) * 0.05,
    dataQuality: clamp(candidate.dataQuality, 0, 1) * 0.07,
    clvSignal: clamp(candidate.clvSignal ?? 0, -0.1, 0.1) * 0.05,
    pushPenalty: -clamp(candidate.pushProbability ?? 0, 0, 0.15) * 0.05,
  };
  return {
    market: candidate.market,
    score: Object.values(components).reduce((sum, value) => sum + value, 0),
    components,
  };
}

export function choosePrimaryMarket(
  moneylineCandidate: MarketSelectionCandidate | null,
  spreadCandidate: SpreadCandidate | null,
): "moneyline" | "spread" | null {
  const moneyline = moneylineCandidate?.eligible ? moneylineCandidate : null;
  const spread = spreadCandidate
    ? spreadToMarketSelectionCandidate(spreadCandidate)
    : null;
  const eligibleSpread = spread?.eligible ? spread : null;
  if (!moneyline) return eligibleSpread ? "spread" : null;
  if (!eligibleSpread) return "moneyline";
  const moneylineScore = scoreMarketCandidate(moneyline);
  const spreadScore = scoreMarketCandidate(eligibleSpread);
  return spreadScore.score > moneylineScore.score ? "spread" : "moneyline";
}

export function calculateSpreadClv(
  prediction: Pick<SpreadCandidate, "selection" | "line" | "odds" | "expectedHomeMargin" | "marginStandardDeviation">,
  closingLine: number,
  closingPrice: number,
): number {
  const selectedProbability = (line: number): number => {
    const homeLine = prediction.selection === "home" ? line : -line;
    const homeCover = 1 - normalCdf(
      (-homeLine - prediction.expectedHomeMargin) / prediction.marginStandardDeviation,
    );
    return prediction.selection === "home" ? homeCover : 1 - homeCover;
  };
  const lineValue = (selectedProbability(prediction.line) - selectedProbability(closingLine)) * 100;
  const priceClv = calculateClv(prediction.odds, closingPrice);
  if (priceClv == null) throw new Error("CLOSING_PRICE_UNAVAILABLE");
  return Math.round((lineValue + priceClv) * 100) / 100;
}

export interface SpreadSettlement {
  result: Exclude<GradeResult, "pending">;
  finalScore: string;
  closingLine: number;
  closingPrice: number;
  clv: number;
  unitsWonLost: number;
  predictedHomeMargin: number;
  actualHomeMargin: number;
  residual: number;
  residualConvention: typeof SPREAD_MARGIN_CONVENTION.version;
}

export function buildSpreadSettlement(input: {
  selection: "home" | "away";
  recommendedLine: number;
  recommendedPrice: number;
  expectedHomeMargin: number;
  marginStandardDeviation: number;
  closingLine: number;
  closingPrice: number;
  homeScore: number;
  awayScore: number;
}): SpreadSettlement {
  const grade = gradeSpread(
    input.selection,
    input.selection === "home" ? input.recommendedLine : -input.recommendedLine,
    input.homeScore,
    input.awayScore,
  );
  const result: Exclude<GradeResult, "pending"> = grade === "pending" ? "void" : grade;
  return {
    result,
    finalScore: `${input.awayScore}-${input.homeScore}`,
    closingLine: input.closingLine,
    closingPrice: input.closingPrice,
    clv: calculateSpreadClv({
      selection: input.selection,
      line: input.recommendedLine,
      odds: input.recommendedPrice,
      expectedHomeMargin: input.expectedHomeMargin,
      marginStandardDeviation: input.marginStandardDeviation,
    }, input.closingLine, input.closingPrice),
    unitsWonLost: calculateUnits(result, 1, input.recommendedPrice),
    predictedHomeMargin: input.expectedHomeMargin,
    actualHomeMargin: input.homeScore - input.awayScore,
    residual: spreadResidual(input),
    residualConvention: SPREAD_MARGIN_CONVENTION.version,
  };
}

export async function writeSpreadCandidateSnapshots(input: SpreadEvaluationInput): Promise<SpreadCandidate[]> {
  const candidates = await buildSpreadCandidates(input);
  if (candidates.length === 0) return [];
  const existing = await db
    .select()
    .from(spreadPredictionsTable)
    .where(eq(spreadPredictionsTable.gameId, input.game.espnId))
    .orderBy(spreadPredictionsTable.predictedAt);
  const openingByMarket = new Map<string, { line: number; price: number }>();
  for (const row of existing) {
    const key = `${row.modelKey}|${row.sportsbook}|${row.selection}`;
    if (!openingByMarket.has(key)) {
      openingByMarket.set(key, {
        line: row.openingLine ?? row.currentLine,
        price: row.openingPrice ?? row.currentPrice,
      });
    }
  }
  const values: InsertSpreadPrediction[] = candidates.map((candidate) => ({
    gameId: candidate.gameId,
    sport: candidate.sport,
    modelKey: candidate.modelKey,
    modelVersion: candidate.modelVersion,
    selection: candidate.selection,
    teamAbbr: candidate.teamAbbr,
    sportsbook: candidate.sportsbook,
    openingLine: openingByMarket.get(
      `${candidate.modelKey}|${candidate.sportsbook}|${candidate.selection}`,
    )?.line ?? candidate.line,
    openingPrice: openingByMarket.get(
      `${candidate.modelKey}|${candidate.sportsbook}|${candidate.selection}`,
    )?.price ?? candidate.odds,
    currentLine: candidate.line,
    currentPrice: candidate.odds,
    opposingLine: candidate.opposingLine,
    opposingPrice: candidate.opposingOdds,
    recommendedLine: candidate.line,
    recommendedPrice: candidate.odds,
    sourceCapturedAt: candidate.capturedAt,
    expectedHomeMargin: candidate.expectedHomeMargin,
    marginStandardDeviation: candidate.marginStandardDeviation,
    modelProbability: candidate.modelProbability,
    noVigProbability: candidate.noVigProbability,
    fairPrice: candidate.fairPrice,
    edge: candidate.edge,
    expectedValue: candidate.expectedValue,
    pushProbability: candidate.pushProbability,
    uncertainty: candidate.uncertainty,
    confidence: candidate.confidence,
    recommendation: candidate.recommendation,
    units: candidate.units,
    priceQualified: candidate.priceQualified,
    promotionEligible: candidate.promotionEligible,
    gateStatus: candidate.gateStatus,
    gateReasons: candidate.gateReasons,
    featureSnapshot: candidate.featureSnapshot,
    dataCutoffAt: candidate.capturedAt,
    predictedAt: candidate.capturedAt,
  }));
  await db.insert(spreadPredictionsTable).values(values).onConflictDoNothing();
  return candidates;
}

export async function getLatestSpreadCandidates(gameIds: readonly string[]): Promise<Map<string, SpreadCandidate>> {
  if (gameIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(spreadPredictionsTable)
    .where(inArray(spreadPredictionsTable.gameId, [...gameIds]))
    .orderBy(desc(spreadPredictionsTable.predictedAt), desc(spreadPredictionsTable.expectedValue));
  const grouped = new Map<string, SpreadCandidate[]>();
  for (const row of rows) {
    const candidate: SpreadCandidate = {
      gameId: row.gameId,
      sport: row.sport as SpreadSport,
      modelKey: row.modelKey,
      modelVersion: row.modelVersion,
      selection: row.selection as "home" | "away",
      teamAbbr: row.teamAbbr,
      sportsbook: row.sportsbook,
      line: row.recommendedLine,
      odds: row.recommendedPrice,
      opposingLine: row.opposingLine,
      opposingOdds: row.opposingPrice,
      expectedHomeMargin: row.expectedHomeMargin,
      marginStandardDeviation: row.marginStandardDeviation,
      modelProbability: row.modelProbability,
      noVigProbability: row.noVigProbability,
      fairPrice: row.fairPrice,
      edge: row.edge,
      expectedValue: row.expectedValue,
      pushProbability: row.pushProbability,
      uncertainty: row.uncertainty,
      confidence: row.confidence as "High" | "Medium" | "Low",
      recommendation: row.recommendation as "Strong Buy" | "Buy" | "Neutral",
      units: row.units,
      priceQualified: row.priceQualified,
      promotionEligible: row.promotionEligible,
      gateStatus: row.gateStatus as "shadow" | "challenger" | "production",
      gateReasons: row.gateReasons as string[],
      featureSnapshot: row.featureSnapshot as Record<string, unknown>,
      capturedAt: row.sourceCapturedAt,
    };
    const existing = grouped.get(row.gameId);
    if (existing) existing.push(candidate);
    else grouped.set(row.gameId, [candidate]);
  }
  const result = new Map<string, SpreadCandidate>();
  for (const [gameId, candidates] of grouped) {
    const candidate = selectLatestPromotionEligibleCandidate(candidates);
    if (candidate) result.set(gameId, candidate);
  }
  return result;
}

export async function getLatestSpreadCandidatesForAdmin(
  gameIds: readonly string[],
): Promise<Map<string, SpreadCandidate>> {
  if (gameIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(spreadPredictionsTable)
    .where(inArray(spreadPredictionsTable.gameId, [...gameIds]))
    .orderBy(desc(spreadPredictionsTable.predictedAt), desc(spreadPredictionsTable.expectedValue));
  const latestCaptureByGame = new Map<string, Date>();
  const candidates: SpreadCandidate[] = [];
  for (const row of rows) {
    const latest = latestCaptureByGame.get(row.gameId);
    if (latest && row.predictedAt.getTime() !== latest.getTime()) continue;
    if (!latest) latestCaptureByGame.set(row.gameId, row.predictedAt);
    candidates.push({
      gameId: row.gameId,
      sport: row.sport as SpreadSport,
      modelKey: row.modelKey,
      modelVersion: row.modelVersion,
      selection: row.selection as "home" | "away",
      teamAbbr: row.teamAbbr,
      sportsbook: row.sportsbook,
      line: row.recommendedLine,
      odds: row.recommendedPrice,
      opposingLine: row.opposingLine,
      opposingOdds: row.opposingPrice,
      expectedHomeMargin: row.expectedHomeMargin,
      marginStandardDeviation: row.marginStandardDeviation,
      modelProbability: row.modelProbability,
      noVigProbability: row.noVigProbability,
      fairPrice: row.fairPrice,
      edge: row.edge,
      expectedValue: row.expectedValue,
      pushProbability: row.pushProbability,
      uncertainty: row.uncertainty,
      confidence: row.confidence as "High" | "Medium" | "Low",
      recommendation: row.recommendation as "Strong Buy" | "Buy" | "Neutral",
      units: row.units,
      priceQualified: row.priceQualified,
      promotionEligible: row.promotionEligible,
      gateStatus: row.gateStatus as SpreadCandidate["gateStatus"],
      gateReasons: row.gateReasons as string[],
      featureSnapshot: row.featureSnapshot as Record<string, unknown>,
      capturedAt: row.sourceCapturedAt,
    });
  }
  const result = new Map<string, SpreadCandidate>();
  for (const candidate of candidates) {
    const best = selectBestSpreadCandidate([
      ...(result.get(candidate.gameId) ? [result.get(candidate.gameId)!] : []),
      candidate,
    ]);
    if (best) result.set(candidate.gameId, best);
  }
  return result;
}

export async function settleSpreadPredictions(
  game: Pick<FetchedGame, "espnId" | "status" | "homeScore" | "awayScore">,
  settledAt = new Date(),
): Promise<number> {
  if (game.status !== "final" || game.homeScore == null || game.awayScore == null) return 0;
  const predictions = await db
    .select()
    .from(spreadPredictionsTable)
    .where(eq(spreadPredictionsTable.gameId, game.espnId));
  if (predictions.length === 0) return 0;
  const latestByMarket = new Map<string, typeof predictions[number]>();
  for (const prediction of predictions) {
    const key = `${prediction.modelKey}|${prediction.sportsbook}|${prediction.selection}`;
    const current = latestByMarket.get(key);
    if (!current || prediction.predictedAt > current.predictedAt) latestByMarket.set(key, prediction);
  }
  let settled = 0;
  for (const prediction of predictions) {
    const closing = latestByMarket.get(
      `${prediction.modelKey}|${prediction.sportsbook}|${prediction.selection}`,
    ) ?? prediction;
    const settlement = buildSpreadSettlement({
      selection: prediction.selection as "home" | "away",
      recommendedLine: prediction.recommendedLine,
      recommendedPrice: prediction.recommendedPrice,
      expectedHomeMargin: prediction.expectedHomeMargin,
      marginStandardDeviation: prediction.marginStandardDeviation,
      closingLine: closing.currentLine,
      closingPrice: closing.currentPrice,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
    });
    await db.insert(spreadPredictionResultsTable).values({
      predictionId: prediction.id,
      gameId: prediction.gameId,
      result: settlement.result,
      finalScore: settlement.finalScore,
      predictedHomeMargin: settlement.predictedHomeMargin,
      actualHomeMargin: settlement.actualHomeMargin,
      residual: settlement.residual,
      residualConvention: settlement.residualConvention,
      // The last immutable pregame observation is the closing proxy when a
      // later provider quote is unavailable; it never changes the prediction.
      closingLine: settlement.closingLine,
      closingPrice: settlement.closingPrice,
      clv: settlement.clv,
      unitsWonLost: settlement.unitsWonLost,
      settledAt,
    }).onConflictDoNothing();
    settled++;
  }
  if (isSpreadSportName(predictions[0]!.sport)) {
    await refreshSpreadValidationMetrics(predictions[0]!.sport);
  }
  return settled;
}

export interface SpreadValidationSummary extends SpreadValidationMetrics {
  sport: SpreadSport;
  modelKey: string;
  modelVersion: string;
  computedAt: string;
  datasetVersion: string;
  evaluationVersion: string;
  featureSchemaVersion: string;
  evidenceCutoff: string;
}

export async function computeSpreadValidationMetrics(
  sport: SpreadSport,
): Promise<SpreadValidationSummary | null> {
  const config = SPREAD_CONFIGS[sport];
  const predictions = await db
    .select()
    .from(spreadPredictionsTable)
    .where(and(
      eq(spreadPredictionsTable.sport, sport),
      eq(spreadPredictionsTable.modelKey, config.modelKey),
    ));
  if (predictions.length === 0) return null;
  const results = await db
    .select()
    .from(spreadPredictionResultsTable)
    .where(inArray(spreadPredictionResultsTable.predictionId, predictions.map(({ id }) => id)));
  const resultByPrediction = new Map(results.map((result) => [result.predictionId, result]));
  const rows = predictions.map((prediction) => ({
    prediction,
    result: resultByPrediction.get(prediction.id) ?? null,
  }));
  const bestByCapture = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    if (!row.prediction.priceQualified) continue;
    const key = `${row.prediction.gameId}|${row.prediction.predictedAt.toISOString()}`;
    const current = bestByCapture.get(key);
    if (!current || row.prediction.expectedValue > current.prediction.expectedValue) {
      bestByCapture.set(key, row);
    }
  }
  const validationRows = [...bestByCapture.values()];
  const settled = validationRows.filter(
    (row): row is typeof row & { result: NonNullable<typeof row.result> } =>
      row.result != null
      && (row.result.result === "win" || row.result.result === "loss" || row.result.result === "push"),
  );
  const scored = settled.filter(({ result }) => result.result !== "push");
  if (scored.length === 0) return null;
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const outcomes = scored.map(({ result }) => result.result === "win" ? 1 : 0);
  const probabilities = scored.map(({ prediction }) => prediction.modelProbability);
  const brierScore = mean(probabilities.map((probability, i) => (probability - outcomes[i]!) ** 2));
  const logLoss = mean(probabilities.map((probability, i) => {
    const p = clamp(probability, 0.001, 0.999);
    return -(outcomes[i]! ? Math.log(p) : Math.log(1 - p));
  }));
  const winRate = mean(outcomes);
  const calibrationError = Math.abs(mean(probabilities) - winRate);
  const netUnits = settled.reduce((sum, { result }) => sum + result.unitsWonLost, 0);
  const maxDrawdown = (() => {
    let peak = 0;
    let balance = 0;
    let drawdown = 0;
    for (const { result } of [...settled].sort((a, b) => a.result.settledAt.getTime() - b.result.settledAt.getTime())) {
      balance += result.unitsWonLost;
      peak = Math.max(peak, balance);
      drawdown = Math.max(drawdown, peak - balance);
    }
    return drawdown / Math.max(1, settled.length);
  })();
  const evidenceCutoff = new Date(Math.max(...settled.map(({ result }) => result.settledAt.getTime())));
  const datasetVersion = marketApprovalDecisionHash(
    settled
      .map(({ prediction, result }) => ({
        predictionId: prediction.id,
        resultId: result.id,
        predictedAt: prediction.predictedAt,
        settledAt: result.settledAt,
      }))
      .sort((a, b) => a.predictionId - b.predictionId),
  );
  return {
    sport,
    modelKey: config.modelKey,
    modelVersion: config.modelVersion,
    sampleSize: settled.length,
    calibrationError,
    brierScore,
    logLoss,
    roi: netUnits / Math.max(1, settled.length),
    clv: mean(settled
      .map(({ result }) => result.clv)
      .filter((value): value is number => value != null)),
    maxDrawdown,
    coverage: settled.length / Math.max(1, validationRows.length),
    dataQualityRate: validationRows.filter(({ prediction }) => prediction.featureSnapshot != null).length / Math.max(1, validationRows.length),
    computedAt: new Date().toISOString(),
    datasetVersion,
    evaluationVersion: "spread-validation-v2",
    featureSchemaVersion: "spread-feature-v1",
    evidenceCutoff: evidenceCutoff.toISOString(),
  };
}

function spreadApprovalLayers(
  metrics: SpreadValidationSummary,
  config: SpreadConfig,
): {
  dataIntegrity: ApprovalLayerResult;
  predictiveQuality: ApprovalLayerResult;
  bettingQuality: ApprovalLayerResult;
} {
  const dataReasons = [
    ...(metrics.sampleSize < config.gatePolicy.minSampleSize ? ["sample_support"] : []),
    ...(metrics.coverage < config.gatePolicy.minCoverage ? ["coverage"] : []),
    ...(metrics.dataQualityRate < config.gatePolicy.minDataQualityRate ? ["data_quality"] : []),
  ];
  const predictiveReasons = [
    ...(metrics.calibrationError > config.gatePolicy.maxCalibrationError ? ["calibration"] : []),
    ...(metrics.brierScore > config.gatePolicy.maxBrierScore ? ["brier_score"] : []),
    ...(metrics.logLoss > config.gatePolicy.maxLogLoss ? ["log_loss"] : []),
  ];
  return {
    dataIntegrity: {
      status: dataReasons.length ? "FAILED" : "PASSED",
      reasons: dataReasons,
      metrics: {
        sampleSize: metrics.sampleSize,
        coverage: metrics.coverage,
        dataQualityRate: metrics.dataQualityRate,
      },
    },
    predictiveQuality: {
      status: predictiveReasons.length ? "FAILED" : "PASSED",
      reasons: predictiveReasons,
      metrics: {
        calibrationError: metrics.calibrationError,
        brierScore: metrics.brierScore,
        logLoss: metrics.logLoss,
      },
    },
    bettingQuality: evaluateBettingQuality({
      clv: metrics.clv,
      roi: metrics.roi,
      maxDrawdown: metrics.maxDrawdown,
      stability: metrics.coverage,
      minimumClv: config.gatePolicy.minClv,
      maximumDrawdown: config.gatePolicy.maxDrawdown,
      minimumStability: config.gatePolicy.minCoverage,
    }),
  };
}

async function appendSpreadApprovalEvaluation(
  sport: SpreadSport,
  metrics: SpreadValidationSummary,
  requestedStatus?: MarketApprovalStatus,
  requestedReason?: string,
) {
  const config = SPREAD_CONFIGS[sport];
  const layers = spreadApprovalLayers(metrics, config);
  const derived = deriveApprovalStatus({
    hasEvaluationEvidence: metrics.sampleSize > 0,
    ...layers,
  });
  if (requestedStatus == null) {
    return evaluateAndRecordAutomaticApproval({
      identity: spreadApprovalIdentity(config, metrics, new Date(metrics.evidenceCutoff)),
      hasEvaluationEvidence: metrics.sampleSize > 0,
      ...layers,
      sampleSize: metrics.sampleSize,
      dataCoverage: metrics.coverage,
      hardSafetyGate: layers.dataIntegrity,
      maxEvidenceAgeMs: 45 * 24 * 60 * 60 * 1000,
      evaluationMetadata: {
        modelKey: config.modelKey,
        configHash: config.configHash,
        trigger: "spread_validation_refresh",
      },
    });
  }
  const status = requestedStatus
    ?? derived;
  const reasons = [
    ...layers.dataIntegrity.reasons,
    ...layers.predictiveQuality.reasons,
    ...layers.bettingQuality.reasons,
  ];
  return recordManualMarketApproval({
    identity: spreadApprovalIdentity(config, metrics, new Date(metrics.evidenceCutoff)),
    sampleSize: metrics.sampleSize,
    dataCoverage: metrics.coverage,
    dataIntegrity: layers.dataIntegrity,
    predictiveQuality: layers.predictiveQuality,
    bettingQuality: layers.bettingQuality,
    status,
    reason: requestedReason ?? (reasons.length ? reasons.join(", ") : (
      status === "PRODUCTION_APPROVED"
        ? "All independent spread approval layers passed"
        : "Validation passed; awaiting explicit production approval"
    )),
    evaluationMetadata: {
      modelKey: config.modelKey,
      configHash: config.configHash,
    },
  });
}

function isSpreadSportName(sport: string): sport is SpreadSport {
  return isSpreadSport(sport);
}

export async function refreshSpreadValidationMetrics(
  sport: SpreadSport,
): Promise<SpreadValidationSummary | null> {
  const metrics = await computeSpreadValidationMetrics(sport);
  const config = SPREAD_CONFIGS[sport];
  if (!metrics) {
    const insufficient: ApprovalLayerResult = {
      status: "INSUFFICIENT",
      reasons: ["validation_metrics_missing"],
      metrics: {},
    };
    const lifecycle = await evaluateAndRecordAutomaticApproval({
      identity: spreadApprovalIdentity(config, null, new Date()),
      hasEvaluationEvidence: false,
      dataIntegrity: insufficient,
      predictiveQuality: insufficient,
      bettingQuality: insufficient,
      sampleSize: 0,
      evidenceValid: false,
      evidenceStale: false,
      evaluationMetadata: {
        modelKey: config.modelKey,
        configHash: config.configHash,
        trigger: "spread_validation_refresh",
      },
    });
    await db.update(spreadModelConfigsTable)
      .set({
        status: lifecycle.status === "SUSPENDED" ? "suspended" : "shadow",
        updatedAt: new Date(),
      })
      .where(and(
        eq(spreadModelConfigsTable.sport, sport),
        eq(spreadModelConfigsTable.modelKey, config.modelKey),
      ));
    return null;
  }
  await db.update(spreadModelConfigsTable)
    .set({ validationMetrics: metrics, updatedAt: new Date() })
    .where(and(
      eq(spreadModelConfigsTable.sport, sport),
      eq(spreadModelConfigsTable.modelKey, config.modelKey),
    ));
  const lifecycle = await appendSpreadApprovalEvaluation(sport, metrics);
  const lifecycleStatus = lifecycle.status as MarketApprovalStatus;
  const registryStatus = lifecycleStatus === "PRODUCTION_APPROVED"
    ? "production"
    : lifecycleStatus === "SUSPENDED"
      ? "suspended"
      : lifecycleStatus === "PROVISIONAL"
        ? "challenger"
        : "shadow";
  await db.update(spreadModelConfigsTable)
    .set({ status: registryStatus, updatedAt: new Date() })
    .where(and(
      eq(spreadModelConfigsTable.sport, sport),
      eq(spreadModelConfigsTable.modelKey, config.modelKey),
    ));
  return metrics;
}

export async function refreshAllSpreadApprovalLifecycles(): Promise<number> {
  for (const sport of Object.keys(SPREAD_CONFIGS) as SpreadSport[]) {
    await refreshSpreadValidationMetrics(sport);
  }
  return Object.keys(SPREAD_CONFIGS).length;
}

export async function promoteSpreadModel(sport: SpreadSport): Promise<SpreadValidationSummary> {
  const config = SPREAD_CONFIGS[sport];
  const metrics = await refreshSpreadValidationMetrics(sport);
  if (!metrics) throw new Error(`No settled spread validation data for ${sport}`);
  const gate = evaluateValidationGate(sport, "production", metrics, config.gatePolicy);
  if (!gate.eligible) throw new Error(`Spread promotion gate failed for ${sport}: ${gate.reasons.join(", ")}`);
  await db.update(spreadModelConfigsTable)
    .set({ status: "production", validationMetrics: metrics, updatedAt: new Date() })
    .where(and(
      eq(spreadModelConfigsTable.sport, sport),
      eq(spreadModelConfigsTable.modelKey, config.modelKey),
    ));
  await appendSpreadApprovalEvaluation(sport, metrics, "PRODUCTION_APPROVED");
  return metrics;
}

export async function suspendSpreadModel(
  sport: SpreadSport,
  reason: string,
): Promise<void> {
  const metrics = await computeSpreadValidationMetrics(sport);
  if (!metrics) throw new Error(`No spread validation context exists for ${sport}`);
  await appendSpreadApprovalEvaluation(sport, metrics, "SUSPENDED", reason);
  await db.update(spreadModelConfigsTable)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(and(
      eq(spreadModelConfigsTable.sport, sport),
      eq(spreadModelConfigsTable.modelKey, SPREAD_CONFIGS[sport].modelKey),
    ));
}