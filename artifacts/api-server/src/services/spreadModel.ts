import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  spreadModelConfigsTable,
  spreadPredictionsTable,
  type InsertSpreadPrediction,
} from "@workspace/db";
import type { FetchedGame } from "./espn";
import type { GameOdds, SpreadBookmakerLine } from "./oddsApi";
import type { DbTeamStats, WnbaTeamStats } from "./teamStats";

export type SpreadSport = "NFL" | "NCAAF" | "NBA" | "NCAAB" | "WNBA";

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
  featureSnapshot: Record<string, unknown>;
  capturedAt: Date;
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

function evaluateValidationGate(
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
    config.marginStandardDeviation / 20
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
  return input.odds.spreadMarkets.flatMap((market) =>
    evaluateMarket(market, distribution.margin, config, gate, input, distribution.snapshot)
  );
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

export function choosePrimaryMarket(
  moneylineQualified: boolean,
  spreadCandidate: SpreadCandidate | null,
): "moneyline" | "spread" | null {
  if (moneylineQualified) return "moneyline";
  return spreadCandidate?.promotionEligible && spreadCandidate.gateStatus === "production"
    ? "spread"
    : null;
}

export async function writeSpreadCandidateSnapshots(input: SpreadEvaluationInput): Promise<SpreadCandidate[]> {
  const candidates = await buildSpreadCandidates(input);
  if (candidates.length === 0) return [];
  const values: InsertSpreadPrediction[] = candidates.map((candidate) => ({
    gameId: candidate.gameId,
    sport: candidate.sport,
    modelKey: candidate.modelKey,
    modelVersion: candidate.modelVersion,
    selection: candidate.selection,
    sportsbook: candidate.sportsbook,
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
      teamAbbr: "",
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