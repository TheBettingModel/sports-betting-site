/**
 * Per-pick learning engine.
 *
 * Learning consumes a final grade for the exact published selection, never a
 * mutable home/away game outcome. Historical rows that lack the v2 decision
 * snapshot are reviewed but intentionally excluded from factor retraining.
 */

import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db,
  gamesTable,
  modelPredictionsTable,
  modelWeightsTable,
  pickResultsTable,
  publishedPicksTable,
} from "@workspace/db";
import type { FactorWeights } from "@workspace/db";
import { effectiveWeights, SPORT_DEFAULT_WEIGHTS } from "./model";
import { buildOutcomeReview, isDecisionSnapshot } from "./lossReview";
import { logger } from "../lib/logger";
import { isPerformanceEligiblePublishedPickSql } from "./legacyNcaafIntegrity";

const MIN_FACTOR_SAMPLE = 15;
const BRIER_RANDOM_BASELINE = 0.25;

/** Phase 1 safety contract: graded outcomes create evidence, never live edits. */
export const PRODUCTION_LEARNING_MODE = "frozen_research_only" as const;

export function productionLearningEvidence(input: {
  modelVersionId: number;
  cohort: string | null;
}) {
  return {
    mode: PRODUCTION_LEARNING_MODE,
    modelVersionId: input.modelVersionId,
    cohort: input.cohort ?? "legacy_unclassified",
    researchOnly: true,
    productionWeightsUpdated: false,
    productionConfidenceMultiplierUpdated: false,
  } as const;
}

interface LearningProfile {
  emaAlpha: number;
  minimumWeight: number;
  maximumWeight: number;
  useBaselineRelativeBounds: boolean;
  brierSeverityMaximum: number;
  confidenceMode: "legacy" | "calibration-gated";
}

const CALIBRATION_GATED_PROFILE: LearningProfile = {
  emaAlpha: 0.08,
  minimumWeight: 0.0005,
  maximumWeight: Number.POSITIVE_INFINITY,
  useBaselineRelativeBounds: true,
  brierSeverityMaximum: 1.5,
  confidenceMode: "calibration-gated",
};

/**
 * MLB deliberately retains the pre-v2 calibration response. Its outcomes still
 * flow through the immutable per-pick learner; only the sport's learning
 * sensitivity and confidence bounds use the established MLB profile.
 */
export const LEGACY_MLB_LEARNING_PROFILE: LearningProfile = {
  emaAlpha: 0.15,
  minimumWeight: 0.002,
  maximumWeight: 0.60,
  useBaselineRelativeBounds: false,
  brierSeverityMaximum: 2,
  confidenceMode: "legacy",
};

export function learningProfileForSport(sport: string): LearningProfile {
  return sport === "MLB" ? LEGACY_MLB_LEARNING_PROFILE : CALIBRATION_GATED_PROFILE;
}

export function emaForSport(sport: string, previous: number, next: number): number {
  const alpha = learningProfileForSport(sport).emaAlpha;
  return previous * (1 - alpha) + next * alpha;
}

function factorWeightKey(factor: string): string | null {
  const map: Record<string, string> = {
    record: "recordWeight",
    efg: "efgWeight",
    to: "toWeight",
    oreb: "orebWeight",
    def: "defWeight",
    form: "formWeight",
    netRating: "netRatingWeight",
    rest: "restWeight",
    trueShooting: "trueShootingWeight",
    possessionNetRating: "possessionNetRatingWeight",
    offensiveEfficiency: "offensiveEfficiencyWeight",
    defensiveEfficiency: "defensiveEfficiencyWeight",
    perimeter: "perimeterWeight",
    contextTurnover: "contextTurnoverWeight",
    reboundingInterior: "reboundingInteriorWeight",
    freeThrowGeneration: "freeThrowGenerationWeight",
    paceInteraction: "paceInteractionWeight",
    scheduleCompression: "scheduleCompressionWeight",
    travel: "travelWeight",
    availability: "availabilityWeight",
    pythagorean: "pythagoreanWeight",
    scoreDiff: "scoreDiffWeight",
    attackDef: "attackDefWeight",
    goalDiff: "goalDiffWeight",
    lastGoalDiff: "lastGoalDiffWeight",
  };
  return map[factor] ?? null;
}

function boundedWeight(value: number, baseline: number, profile: LearningProfile): number {
  if (!profile.useBaselineRelativeBounds) {
    return Math.max(profile.minimumWeight, Math.min(profile.maximumWeight, value));
  }
  const lower = Math.max(profile.minimumWeight, baseline * 0.5);
  const upper = Math.max(lower, baseline * 1.5);
  return Math.max(lower, Math.min(upper, value));
}

function boundedWeights(sport: string, stored: FactorWeights | null | undefined): FactorWeights {
  const baseline = SPORT_DEFAULT_WEIGHTS[sport] ?? SPORT_DEFAULT_WEIGHTS.MLB!;
  const effective = effectiveWeights(sport, stored);
  const profile = learningProfileForSport(sport);
  return Object.fromEntries(
    Object.entries(effective).map(([key, value]) => [
      key,
      boundedWeight(value, baseline[key] ?? value, profile),
    ]),
  );
}

export function nudgeWeights(input: {
  sport: string;
  current: FactorWeights | null | undefined;
  contributions: Record<string, unknown>;
  selection: string;
  result: "win" | "loss";
  modelProbability: number;
  sampleSize: number;
}): FactorWeights {
  const updated = boundedWeights(input.sport, input.current);
  const profile = learningProfileForSport(input.sport);
  if (input.sampleSize < MIN_FACTOR_SAMPLE) return updated;
  if (input.selection !== "home" && input.selection !== "away") return updated;

  const baseline = SPORT_DEFAULT_WEIGHTS[input.sport] ?? SPORT_DEFAULT_WEIGHTS.MLB!;
  const numeric = Object.entries(input.contributions)
    .filter((entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]),
    )
    .filter(([, value]) => Math.abs(value) >= 0.0001);
  const totalMagnitude = numeric.reduce((sum, [, value]) => sum + Math.abs(value), 0);
  if (totalMagnitude === 0) return updated;

  const selectedHome = input.selection === "home";
  const actualHome = input.result === "win" ? selectedHome : !selectedHome;
  const brier = (input.modelProbability - (input.result === "win" ? 1 : 0)) ** 2;
  const severity = Math.max(0.5, Math.min(profile.brierSeverityMaximum, brier / BRIER_RANDOM_BASELINE));

  for (const [factor, contribution] of numeric) {
    const key = factorWeightKey(factor);
    if (!key || !(key in updated)) continue;
    const baselineWeight = baseline[key] ?? updated[key] ?? 0.01;
    const factorCorrect = (contribution > 0) === actualHome;
    const magnitudeRatio = Math.abs(contribution) / totalMagnitude;
    const delta = profile.confidenceMode === "legacy"
      ? factorCorrect
        ? 0.004 * Math.max(0.25, Math.min(2, magnitudeRatio * 5)) * Math.max(0.25, 2 - severity)
        : -0.003 * Math.max(0.25, Math.min(2, magnitudeRatio * 5)) * severity
      : factorCorrect
        ? 0.0015 * Math.min(1, Math.max(0.1, magnitudeRatio)) * (2 - severity)
        : -0.0025 * Math.min(1, Math.max(0.1, magnitudeRatio)) * severity;
    updated[key] = boundedWeight((updated[key] ?? baselineWeight) + delta, baselineWeight, profile);
  }

  return updated;
}

export function nextConfidenceMultiplier(input: {
  sport: string;
  current: number;
  accuracy: number;
  brier: number;
  totalPredictions: number;
}): number {
  if (learningProfileForSport(input.sport).confidenceMode === "legacy") {
    if (input.accuracy > 0.58) return Math.min(1.3, input.current + 0.02);
    if (input.accuracy < 0.45) return Math.max(0.7, input.current - 0.02);
    // Ordinary results should not leave MLB indefinitely discounted or boosted
    // by a past cold/hot streak. Keep the legacy guardrails at the extremes,
    // but restore 10% of the remaining distance to neutral per learned result.
    return Math.max(0.7, Math.min(1.3, input.current + (1 - input.current) * 0.1));
  }
  // Poor probability calibration immediately removes any previous boost. This
  // prevents a stale high multiplier from keeping a struggling sport overconfident.
  if (input.brier > 0.28 || input.accuracy < 0.48) {
    return Math.max(0.7, Math.min(1, input.current) - 0.03);
  }
  if (input.totalPredictions >= 30 && input.brier < 0.22 && input.accuracy > 0.55) {
    return Math.min(1.15, input.current + 0.01);
  }
  return Math.max(0.8, Math.min(1.05, input.current + (1 - input.current) * 0.1));
}

function hasInsufficientEvidenceReview(value: unknown): boolean {
  return value != null
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as Record<string, unknown>).status === "insufficient_pregame_evidence";
}

/**
 * A result may be replayed only when the old validator falsely rejected a
 * complete immutable snapshot. Completed reviews are never replayed, and a
 * genuinely incomplete historical snapshot remains excluded.
 */
export function needsLearningProcessing(input: {
  learningProcessedAt: Date | null;
  learningReview: unknown;
  featureSnapshot: unknown;
}): boolean {
  return input.learningProcessedAt == null
    || (hasInsufficientEvidenceReview(input.learningReview)
      && isDecisionSnapshot(input.featureSnapshot));
}

/**
 * Review and learn from each newly graded decisive pick exactly once.
 */
export async function runLearning(): Promise<void> {
  const candidateRows = await db
    .select({
      pickResultId: pickResultsTable.id,
      result: pickResultsTable.result,
      finalScore: pickResultsTable.finalScore,
      clv: pickResultsTable.clv,
      learningProcessedAt: pickResultsTable.learningProcessedAt,
      learningReview: pickResultsTable.learningReview,
      pickId: publishedPicksTable.id,
      sport: publishedPicksTable.sport,
      selection: publishedPicksTable.selection,
      recommendation: publishedPicksTable.recommendation,
      predictionId: modelPredictionsTable.id,
      modelVersionId: modelPredictionsTable.modelVersionId,
      cohort: modelPredictionsTable.cohort,
      modelProbability: modelPredictionsTable.modelProbability,
      impliedProbability: modelPredictionsTable.impliedProbability,
      marketIntelligenceGrade: modelPredictionsTable.marketIntelligenceGrade,
      featureSnapshot: modelPredictionsTable.featureSnapshot,
      homeLineupConfirmed: gamesTable.homeLineupConfirmed,
      awayLineupConfirmed: gamesTable.awayLineupConfirmed,
      homeStarterName: gamesTable.homeStarterName,
      awayStarterName: gamesTable.awayStarterName,
      homeKeyInjuries: gamesTable.homeKeyInjuries,
      awayKeyInjuries: gamesTable.awayKeyInjuries,
      homeGoalieName: gamesTable.homeGoalieName,
      awayGoalieName: gamesTable.awayGoalieName,
    })
    .from(pickResultsTable)
    .innerJoin(publishedPicksTable, eq(pickResultsTable.pickId, publishedPicksTable.id))
    .innerJoin(modelPredictionsTable, eq(publishedPicksTable.predictionId, modelPredictionsTable.id))
    .innerJoin(gamesTable, eq(publishedPicksTable.gameId, gamesTable.id))
    .where(
      and(
        inArray(pickResultsTable.result, ["win", "loss"]),
         isPerformanceEligiblePublishedPickSql(publishedPicksTable.id),
          or(
            isNull(pickResultsTable.learningProcessedAt),
            // Before the snapshot-version fix, valid v3/v4 evidence was
            // marked as insufficient and claimed without learning. Replay
            // only that explicitly safe-to-retry state; genuinely incomplete
            // snapshots remain permanently excluded.
            and(
              sql`${pickResultsTable.learningReview}->>'status' = 'insufficient_pregame_evidence'`,
              sql`${modelPredictionsTable.featureSnapshot}->>'schemaVersion' IN ('2', '3', '4')`,
            ),
          ),
      ),
      )
      .orderBy(asc(pickResultsTable.gradedAt), asc(pickResultsTable.id));
  const rows = candidateRows.filter((row) => needsLearningProcessing({
    learningProcessedAt: row.learningProcessedAt,
    learningReview: row.learningReview,
    featureSnapshot: row.featureSnapshot,
  }));

  if (rows.length === 0) return;

  let reviewed = 0;
  for (const row of rows) {
    const processed = await db.transaction(async (tx) => {
      // Serialize claims by sport. Phase 1 intentionally performs no writes to
      // model_weights; the transaction persists research evidence only.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${row.sport}))`);
      const [claim] = await tx
        .update(pickResultsTable)
        .set({ learningProcessedAt: new Date() })
        .where(and(
          eq(pickResultsTable.id, row.pickResultId),
          eq(pickResultsTable.result, row.result),
          or(
            isNull(pickResultsTable.learningProcessedAt),
            sql`${pickResultsTable.learningReview}->>'status' = 'insufficient_pregame_evidence'`,
          ),
        ))
        .returning({ id: pickResultsTable.id });
      if (!claim) return false;

      const result = row.result as "win" | "loss";
      const review = {
        ...buildOutcomeReview({
        snapshot: row.featureSnapshot,
        selection: row.selection,
        result,
        modelProbability: row.modelProbability,
        impliedProbability: row.impliedProbability,
        clv: row.clv,
        currentAvailability: {
          homeLineupConfirmed: row.homeLineupConfirmed, awayLineupConfirmed: row.awayLineupConfirmed,
          homeStarterName: row.homeStarterName, awayStarterName: row.awayStarterName,
          homeKeyInjuries: row.homeKeyInjuries, awayKeyInjuries: row.awayKeyInjuries,
          homeGoalieName: row.homeGoalieName, awayGoalieName: row.awayGoalieName,
        },
        }),
        productionLearning: productionLearningEvidence({
          modelVersionId: row.modelVersionId,
          cohort: row.cohort,
        }),
      };

      if (!isDecisionSnapshot(row.featureSnapshot)) {
        await tx.update(pickResultsTable)
          .set({ learningReview: review })
          .where(eq(pickResultsTable.id, row.pickResultId));
        return false;
      }

      await tx.update(pickResultsTable).set({ learningReview: review }).where(eq(pickResultsTable.id, row.pickResultId));
      return true;
    });
    if (processed) reviewed++;
  }

  logger.info(
    {
      candidates: rows.length,
      reviewed,
      mode: PRODUCTION_LEARNING_MODE,
      productionMutations: 0,
    },
    "Learning freeze: research-only pick reviews completed",
  );
}