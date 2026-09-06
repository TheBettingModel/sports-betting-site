import {
  db, mlbPregameStarterEvidenceSnapshotsTable, mlbV4EvaluationsTable,
  mlbV4PregameFeaturesTable, mlbV4ShadowForecastsTable,
  ncaafV4GameDayPredictionsTable,
} from "@workspace/db";
import { evaluateModelReview } from "./reviewEvaluator";
import { loadModelReviewPolicy } from "./reviewPolicyRegistry";

function observedDays(dates: Date[]): number {
  if (!dates.length) return 0;
  const values = dates.map((date) => date.getTime());
  return Math.max(1, Math.ceil((Math.max(...values) - Math.min(...values)) / 86_400_000));
}

/** Evaluates current immutable evidence only; it never writes approval state. */
export async function evaluateCurrentCandidates() {
  const [mlbForecasts, mlbEvaluations, mlbStarters, mlbFeatures, ncaafPredictions, mlbPolicy, ncaafPolicy] = await Promise.all([
    db.select().from(mlbV4ShadowForecastsTable),
    db.select().from(mlbV4EvaluationsTable),
    db.select({
      playerId: mlbPregameStarterEvidenceSnapshotsTable.officialPlayerId,
      teamId: mlbPregameStarterEvidenceSnapshotsTable.officialTeamId,
    }).from(mlbPregameStarterEvidenceSnapshotsTable),
    db.select({
      pitSafe: mlbV4PregameFeaturesTable.pitSafe,
      createdAt: mlbV4PregameFeaturesTable.createdAt,
    }).from(mlbV4PregameFeaturesTable),
    db.select().from(ncaafV4GameDayPredictionsTable),
    loadModelReviewPolicy("MLB"),
    loadModelReviewPolicy("NCAAF"),
  ]);
  const mlbTeams = new Set(mlbStarters.map((row) => row.teamId));
  const ncaafTeams = new Set(ncaafPredictions.flatMap((row) => [row.homeTeamId, row.awayTeamId]));
  const mlb = evaluateModelReview(mlbPolicy, {
    gradedSample: mlbEvaluations.length,
    prospectiveSample: mlbForecasts.length,
    teamDiversity: mlbTeams.size,
    opponentDiversity: mlbTeams.size,
    starterOrQbDiversity: new Set(mlbStarters.map((row) => row.playerId).filter(Boolean)).size,
    observationDays: observedDays(mlbFeatures.map((row) => row.createdAt)),
    calibrationPassed: false,
    clvPassed: mlbEvaluations.length > 0 && mlbEvaluations.every((row) => row.clv != null),
    pitPassed: mlbFeatures.length > 0 && mlbFeatures.every((row) => row.pitSafe),
    leakagePassed: false,
    runtimeHealthy: mlbForecasts.length > 0,
    runtimeReproducible: mlbForecasts.length > 0,
    inputComplete: mlbFeatures.some((row) => row.pitSafe),
    publicationCompatible: true,
    marketSamples: { moneyline: mlbForecasts.length },
    knownLimitations: ["calibration_unfitted", "leakage_review_not_recorded_in_approval_ledger"],
  });
  const ncaaf = evaluateModelReview(ncaafPolicy, {
    gradedSample: 0,
    prospectiveSample: ncaafPredictions.length,
    teamDiversity: ncaafTeams.size,
    opponentDiversity: ncaafTeams.size,
    starterOrQbDiversity: null,
    observationDays: observedDays(ncaafPredictions.map((row) => row.createdAt)),
    calibrationPassed: false,
    clvPassed: false,
    pitPassed: ncaafPredictions.length > 0
      && ncaafPredictions.every((row) => row.featureCutoff < row.kickoffAt),
    leakagePassed: false,
    runtimeHealthy: ncaafPredictions.length > 0,
    runtimeReproducible: ncaafPredictions.length > 0,
    inputComplete: ncaafPredictions.some((row) => row.dataQuality !== "INSUFFICIENT"),
    publicationCompatible: true,
    marketSamples: {
      moneyline: ncaafPredictions.length,
      spread: ncaafPredictions.length,
      total: ncaafPredictions.length,
    },
    knownLimitations: ["preview_only", "unvalidated", "no_legitimate_graded_inventory"],
  });
  return { MLB: mlb, NCAAF: ncaaf };
}