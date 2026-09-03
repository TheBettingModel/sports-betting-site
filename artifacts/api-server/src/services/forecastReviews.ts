/**
 * Independent outcome review for completed model predictions.
 *
 * Forecast reviews are an audit and calibration layer. They never write to
 * pick_results, model_predictions, or model_weights.
 */

import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import {
  db,
  forecastReviewsTable,
  gameResultsTable,
  modelPredictionsTable,
  publishedPicksTable,
} from "@workspace/db";
import {
  calculateUnits,
  gradeMoneyline,
  gradeSoccer3Way,
  gradeSpread,
  gradeTotal,
  type GradeResult,
} from "./grading";
import { isDecisionSnapshot } from "./lossReview";
import { logger } from "../lib/logger";
import { logSchedulerMemory } from "./schedulerRuntime";

export type ForecastReviewOutcome = Exclude<GradeResult, "pending">;
export type ForecastReviewStatus = "graded" | "excluded";
export type ForecastSegment = "published" | "forecast_only";
export type ForecastQualification = "qualified" | "passed";

export interface ForecastEligibility {
  status: ForecastReviewStatus;
  exclusionReason: string | null;
  snapshotSchemaVersion: number | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numericSnapshotValue(snapshot: unknown, key: string): number | null {
  const value = asRecord(snapshot)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function immutableGameStart(snapshot: unknown): Date | null {
  const value = asRecord(snapshot).gameStartsAt;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function supportedMarket(market: string): boolean {
  return market === "moneyline" || market === "spread" || market === "total";
}

function hasValidSelection(sport: string, market: string, selection: string): boolean {
  if (market === "moneyline") {
    return sport === "Soccer"
      ? selection === "home" || selection === "away" || selection === "draw"
      : selection === "home" || selection === "away";
  }
  if (market === "spread") return selection === "home" || selection === "away";
  if (market === "total") return selection === "over" || selection === "under";
  return false;
}

/**
 * A completed prediction is eligible only when its immutable evidence is
 * complete and it was captured before the recorded game start.
 */
export function classifyForecastEligibility(input: {
  snapshot: unknown;
  isChallenger: boolean;
  predictionTimestamp: Date;
  sport: string;
  market: string;
  selection: string;
}): ForecastEligibility {
  const snapshotSchemaVersion = (() => {
    const value = asRecord(input.snapshot).schemaVersion;
    return typeof value === "number" ? value : null;
  })();

  const snapshot = asRecord(input.snapshot);
  const isMlbV4Shadow =
    input.isChallenger
    && snapshot.modelId === "tbm-mlb-moneyline-v4"
    && snapshot.cohort === "shadow"
    && snapshot.shadowOnly === true;
  if (input.isChallenger && !isMlbV4Shadow) {
    return {
      status: "excluded",
      exclusionReason: "challenger_snapshot",
      snapshotSchemaVersion,
    };
  }

  if (!isDecisionSnapshot(input.snapshot)) {
    return {
      status: "excluded",
      exclusionReason: "invalid_or_incomplete_snapshot",
      snapshotSchemaVersion,
    };
  }

  const gameStartsAt = immutableGameStart(input.snapshot);
  if (!gameStartsAt) {
    return {
      status: "excluded",
      exclusionReason: "missing_game_start_evidence",
      snapshotSchemaVersion,
    };
  }

  if (input.predictionTimestamp.getTime() >= gameStartsAt.getTime()) {
    return {
      status: "excluded",
      exclusionReason: "post_start_snapshot",
      snapshotSchemaVersion,
    };
  }

  if (!supportedMarket(input.market)) {
    return {
      status: "excluded",
      exclusionReason: "unsupported_market",
      snapshotSchemaVersion,
    };
  }

  if (!hasValidSelection(input.sport, input.market, input.selection)) {
    return {
      status: "excluded",
      exclusionReason: "invalid_selection",
      snapshotSchemaVersion,
    };
  }

  if (
    (input.market === "spread" && numericSnapshotValue(input.snapshot, "vegasSpread") == null)
    || (input.market === "total" && numericSnapshotValue(input.snapshot, "vegasTotal") == null)
  ) {
    return {
      status: "excluded",
      exclusionReason: "missing_market_line",
      snapshotSchemaVersion,
    };
  }

  return { status: "graded", exclusionReason: null, snapshotSchemaVersion };
}

export function gradeForecastOutcome(input: {
  sport: string;
  market: string;
  selection: string;
  snapshot: unknown;
  homeScore: number;
  awayScore: number;
}): ForecastReviewOutcome | null {
  let grade: GradeResult;
  if (input.market === "moneyline") {
    grade = input.sport === "Soccer"
      ? gradeSoccer3Way(input.selection, input.homeScore, input.awayScore)
      : gradeMoneyline(input.selection, input.homeScore, input.awayScore);
  } else if (input.market === "spread") {
    const spread = numericSnapshotValue(input.snapshot, "vegasSpread");
    if (spread == null) return null;
    grade = gradeSpread(input.selection, spread, input.homeScore, input.awayScore);
  } else if (input.market === "total") {
    const total = numericSnapshotValue(input.snapshot, "vegasTotal");
    if (total == null) return null;
    grade = gradeTotal(input.selection, total, input.homeScore, input.awayScore);
  } else {
    return null;
  }
  return grade === "pending" ? null : grade;
}

export interface ForecastMetricRow {
  reviewStatus: string;
  result: string | null;
  segment: string;
  qualificationStatus: string;
  sport: string;
  market: string;
  modelProbability: number;
  unitsWonLost: number | null;
  units: number;
}

export interface ForecastMetricSummary {
  reviewCount: number;
  gradedCount: number;
  excludedCount: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  sampleSize: number;
  winRate: number | null;
  netUnits: number;
  roi: number | null;
  brierScore: number | null;
  calibrationError: number | null;
}

function round(value: number, digits = 4): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function summarizeGroup(rows: ForecastMetricRow[]): ForecastMetricSummary {
  const graded = rows.filter((row) => row.reviewStatus === "graded");
  const decisive = graded.filter((row) => row.result === "win" || row.result === "loss");
  const wins = graded.filter((row) => row.result === "win").length;
  const losses = graded.filter((row) => row.result === "loss").length;
  const pushes = graded.filter((row) => row.result === "push").length;
  const voids = graded.filter((row) => row.result === "void" || row.result === "postponed").length;
  const netUnits = round(
    graded.reduce((sum, row) => sum + (row.unitsWonLost ?? 0), 0),
    2,
  );
  const totalRisked = graded.reduce((sum, row) => sum + row.units, 0);
  const probabilities = decisive.map((row) => ({
    probability: Math.max(0.001, Math.min(0.999, row.modelProbability)),
    won: row.result === "win" ? 1 : 0,
  }));
  const brierScore = probabilities.length > 0
    ? round(probabilities.reduce((sum, row) => sum + (row.probability - row.won) ** 2, 0) / probabilities.length)
    : null;
  const calibrationError = probabilities.length > 0
    ? round(
        probabilities.reduce((sum, row) => sum + Math.abs(row.probability - row.won), 0)
          / probabilities.length,
      )
    : null;

  return {
    reviewCount: rows.length,
    gradedCount: graded.length,
    excludedCount: rows.length - graded.length,
    wins,
    losses,
    pushes,
    voids,
    sampleSize: decisive.length,
    winRate: decisive.length > 0 ? round(wins / decisive.length) : null,
    netUnits,
    roi: totalRisked > 0 ? round(netUnits / totalRisked) : null,
    brierScore,
    calibrationError,
  };
}

export interface ForecastMetrics {
  all: ForecastMetricSummary;
  published: ForecastMetricSummary;
  forecastOnly: ForecastMetricSummary;
  qualified: ForecastMetricSummary;
  passed: ForecastMetricSummary;
}

export function summarizeForecastRows(rows: ForecastMetricRow[]): ForecastMetrics {
  return {
    all: summarizeGroup(rows),
    published: summarizeGroup(rows.filter((row) => row.segment === "published")),
    forecastOnly: summarizeGroup(rows.filter((row) => row.segment === "forecast_only")),
    qualified: summarizeGroup(rows.filter((row) => row.qualificationStatus === "qualified")),
    passed: summarizeGroup(rows.filter((row) => row.qualificationStatus === "passed")),
  };
}

type PredictionCandidate = {
  predictionId: number;
  gameId: string;
  modelVersionId: number;
  sport: string;
  market: string;
  selection: string;
  odds: number | null;
  units: number;
  modelProbability: number;
  impliedProbability: number | null;
  fairProbability: number | null;
  edge: number;
  recommendation: string;
  confidence: string;
  featureSnapshot: unknown;
  predictionTimestamp: Date;
  isChallenger: boolean;
  gameStartsAt: Date | null;
  homeScore: number;
  awayScore: number;
};

/**
 * Review all completed model predictions exactly once. The unique insert is
 * the transactional claim: concurrent runs can calculate the same candidate,
 * but only one can persist its predictionId.
 */
export async function runForecastReviews(): Promise<{
  inserted: number;
  graded: number;
  excluded: number;
}> {
  const batchSize = 100;
  const startedAt = performance.now();
  let afterPredictionId = 0;
  let inserted = 0;
  let graded = 0;
  let excluded = 0;
  let batchNumber = 0;

  while (true) {
    const candidates = await db
    .select({
      predictionId: modelPredictionsTable.id,
      gameId: modelPredictionsTable.gameId,
      modelVersionId: modelPredictionsTable.modelVersionId,
      sport: modelPredictionsTable.sport,
      market: modelPredictionsTable.market,
      selection: modelPredictionsTable.selection,
      odds: modelPredictionsTable.odds,
      units: modelPredictionsTable.units,
      modelProbability: modelPredictionsTable.modelProbability,
      impliedProbability: modelPredictionsTable.impliedProbability,
      fairProbability: modelPredictionsTable.fairProbability,
      edge: modelPredictionsTable.edge,
      recommendation: modelPredictionsTable.recommendation,
      confidence: modelPredictionsTable.confidence,
      featureSnapshot: modelPredictionsTable.featureSnapshot,
      predictionTimestamp: modelPredictionsTable.predictionTimestamp,
      isChallenger: modelPredictionsTable.isChallenger,
      homeScore: gameResultsTable.homeScore,
      awayScore: gameResultsTable.awayScore,
    })
    .from(modelPredictionsTable)
    .innerJoin(gameResultsTable, eq(gameResultsTable.gameId, modelPredictionsTable.gameId))
    .leftJoin(forecastReviewsTable, eq(forecastReviewsTable.predictionId, modelPredictionsTable.id))
    .where(and(
      isNull(forecastReviewsTable.id),
      gt(modelPredictionsTable.id, afterPredictionId),
    ))
    .orderBy(asc(modelPredictionsTable.id))
    .limit(batchSize);

    if (candidates.length === 0) break;
    batchNumber++;
    afterPredictionId = candidates[candidates.length - 1]!.predictionId;
    logSchedulerMemory(logger, {
      jobName: "forecast-reviews",
      phase: "batch",
      startedAt,
      batchSize: candidates.length,
      batchNumber,
    });

    const predictionIds = candidates.map((row) => row.predictionId);
    const publishedRows = await db
    .select({
      predictionId: publishedPicksTable.predictionId,
      id: publishedPicksTable.id,
      isPublic: publishedPicksTable.isPublic,
    })
    .from(publishedPicksTable)
    .where(inArray(publishedPicksTable.predictionId, predictionIds))
    .orderBy(desc(publishedPicksTable.isPublic), desc(publishedPicksTable.publishedAt));

    const publishedByPrediction = new Map<number, { id: number; isPublic: boolean }>();
    for (const row of publishedRows) {
      if (!publishedByPrediction.has(row.predictionId)) {
        publishedByPrediction.set(row.predictionId, { id: row.id, isPublic: row.isPublic });
      }
    }

    const now = new Date();
    const values = candidates.map((candidate: PredictionCandidate) => {
    const published = publishedByPrediction.get(candidate.predictionId);
    const eligibility = classifyForecastEligibility({
      snapshot: candidate.featureSnapshot,
      isChallenger: candidate.isChallenger,
      predictionTimestamp: candidate.predictionTimestamp,
      sport: candidate.sport,
      market: candidate.market,
      selection: candidate.selection,
    });
    const segment: ForecastSegment = published?.isPublic ? "published" : "forecast_only";
    const qualificationStatus: ForecastQualification =
      candidate.recommendation === "Strong Buy" || candidate.recommendation === "Buy"
        ? "qualified"
        : "passed";

    let result: ForecastReviewOutcome | null = null;
    if (eligibility.status === "graded") {
      result = gradeForecastOutcome({
        sport: candidate.sport,
        market: candidate.market,
        selection: candidate.selection,
        snapshot: candidate.featureSnapshot,
        homeScore: candidate.homeScore,
        awayScore: candidate.awayScore,
      });
    }

    const effectiveEligibility = result == null && eligibility.status === "graded"
      ? { ...eligibility, status: "excluded" as const, exclusionReason: "unable_to_grade_market" }
      : eligibility;
    const finalScore = `${candidate.homeScore}-${candidate.awayScore}`;

    return {
      predictionId: candidate.predictionId,
      gameId: candidate.gameId,
      modelVersionId: candidate.modelVersionId,
      sport: candidate.sport,
      market: candidate.market,
      selection: candidate.selection,
      recommendation: candidate.recommendation,
      confidence: candidate.confidence,
      odds: candidate.odds,
      units: candidate.units,
      modelProbability: candidate.modelProbability,
      impliedProbability: candidate.impliedProbability,
      fairProbability: candidate.fairProbability,
      edge: candidate.edge,
      segment,
      qualificationStatus,
      publishedPickId: published?.id ?? null,
      isChallenger: candidate.isChallenger,
      featureSnapshot: candidate.featureSnapshot,
      snapshotSchemaVersion: effectiveEligibility.snapshotSchemaVersion,
      predictionTimestamp: candidate.predictionTimestamp,
      gameStartsAt: immutableGameStart(candidate.featureSnapshot),
      reviewVersion: 2,
      reviewStatus: effectiveEligibility.status,
      exclusionReason: effectiveEligibility.exclusionReason,
      result,
      unitsWonLost: result == null
        ? null
        : calculateUnits(result, candidate.units, candidate.odds ?? -110),
      finalScore: result == null ? null : finalScore,
      reviewedAt: now,
      createdAt: now,
    };
    });

    const claimed = await db.transaction(async (tx) =>
      tx
        .insert(forecastReviewsTable)
        .values(values)
        .onConflictDoNothing({ target: forecastReviewsTable.predictionId })
        .returning({
          id: forecastReviewsTable.id,
          reviewStatus: forecastReviewsTable.reviewStatus,
        }),
    );
    inserted += claimed.length;
    graded += claimed.filter((row) => row.reviewStatus === "graded").length;
    excluded += claimed.filter((row) => row.reviewStatus === "excluded").length;
  }

  if (inserted > 0) {
    logger.info({ inserted, graded, excluded }, "Forecast reviews: completed");
  }
  return { inserted, graded, excluded };
}

export async function listForecastReviews(filters: {
  sport?: string;
  market?: string;
  segment?: ForecastSegment;
  qualification?: ForecastQualification;
  result?: string;
  limit?: number;
}) {
  const conditions = [];
  if (filters.sport) conditions.push(eq(forecastReviewsTable.sport, filters.sport));
  if (filters.market) conditions.push(eq(forecastReviewsTable.market, filters.market));
  if (filters.segment) conditions.push(eq(forecastReviewsTable.segment, filters.segment));
  if (filters.qualification) {
    conditions.push(eq(forecastReviewsTable.qualificationStatus, filters.qualification));
  }
  if (filters.result && filters.result !== "all") {
    conditions.push(eq(forecastReviewsTable.result, filters.result));
  }
  return db
    .select()
    .from(forecastReviewsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(forecastReviewsTable.reviewedAt), desc(forecastReviewsTable.id))
    .limit(filters.limit ?? 50);
}

export async function queryForecastMetrics(filters: {
  sport?: string;
  market?: string;
}): Promise<ForecastMetrics> {
  const conditions = [];
  if (filters.sport) conditions.push(eq(forecastReviewsTable.sport, filters.sport));
  if (filters.market) conditions.push(eq(forecastReviewsTable.market, filters.market));
  const rows = await db
    .select({
      reviewStatus: forecastReviewsTable.reviewStatus,
      result: forecastReviewsTable.result,
      segment: forecastReviewsTable.segment,
      qualificationStatus: forecastReviewsTable.qualificationStatus,
      sport: forecastReviewsTable.sport,
      market: forecastReviewsTable.market,
      modelProbability: forecastReviewsTable.modelProbability,
      unitsWonLost: forecastReviewsTable.unitsWonLost,
      units: forecastReviewsTable.units,
    })
    .from(forecastReviewsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return summarizeForecastRows(rows);
}