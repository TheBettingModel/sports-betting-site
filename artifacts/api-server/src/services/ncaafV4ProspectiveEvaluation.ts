import type { NcaafV42026InternalPrediction } from "./ncaafV42026FeatureBridge";
import type { V4Metrics } from "./ncaafV4ExpectedScore";

export const NCAAF_V4_PROSPECTIVE_EVALUATION_VERSION = "ncaaf-v4-prospective-evaluation-v1";

export type NcaafV4ProspectiveOutcome = Readonly<{
  gameId: string;
  kickoffAt: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  capturedAt: Date;
}>;
export type NcaafV4FrozenProspectivePrediction = NcaafV42026InternalPrediction & Readonly<{
  scheduledKickoffAt: string;
}>;

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const clamp = (value: number) => Math.max(1e-12, Math.min(1 - 1e-12, value));

/** Pure #223 grader. It cannot reconstruct a forecast after kickoff and has no
 * database, registry, market, publication, wager, or unit side effect. */
export function evaluateNcaafV4Prospective(
  predictions: readonly NcaafV4FrozenProspectivePrediction[],
  outcomes: readonly NcaafV4ProspectiveOutcome[],
  evaluatedAt: Date,
  outOfDomain = 0,
) {
  if (!Number.isFinite(evaluatedAt.getTime())) throw new Error("Prospective evaluation requires a valid evaluatedAt");
  const predictionIds = new Set<string>();
  for (const prediction of predictions) {
    if (!prediction.gameId || predictionIds.has(prediction.gameId)) throw new Error(`Duplicate or missing prospective prediction gameId: ${prediction.gameId}`);
    predictionIds.add(prediction.gameId);
    const cutoff = new Date(prediction.featureCutoff);
    const generated = new Date(prediction.predictionTimestamp);
    const scheduledKickoff = new Date(prediction.scheduledKickoffAt);
    if (!Number.isFinite(cutoff.getTime()) || !Number.isFinite(generated.getTime()) || !Number.isFinite(scheduledKickoff.getTime())
      || cutoff >= scheduledKickoff || generated >= scheduledKickoff
      || ![prediction.expectedHomePoints, prediction.expectedAwayPoints, prediction.expectedMargin,
        prediction.expectedTotal, prediction.homeWinProbability, prediction.awayWinProbability,
        prediction.marginUncertainty, prediction.totalUncertainty].every(Number.isFinite)
      || prediction.homeWinProbability <= 0 || prediction.homeWinProbability >= 1
      || prediction.awayWinProbability <= 0 || prediction.awayWinProbability >= 1
      || Math.abs(prediction.homeWinProbability + prediction.awayWinProbability - 1) > 1e-9
      || prediction.marginUncertainty <= 0 || prediction.totalUncertainty <= 0) {
      throw new Error(`Malformed prospective prediction: ${prediction.gameId}`);
    }
  }
  const outcomeByGame = new Map<string, NcaafV4ProspectiveOutcome>();
  for (const outcome of outcomes) {
    if (!outcome.gameId || outcomeByGame.has(outcome.gameId)) throw new Error(`Duplicate or conflicting prospective outcome gameId: ${outcome.gameId}`);
    if (!Number.isFinite(outcome.kickoffAt.getTime()) || !Number.isFinite(outcome.capturedAt.getTime())
      || (outcome.homeScore != null && (!Number.isInteger(outcome.homeScore) || outcome.homeScore < 0))
      || (outcome.awayScore != null && (!Number.isInteger(outcome.awayScore) || outcome.awayScore < 0))) {
      throw new Error(`Malformed prospective outcome: ${outcome.gameId}`);
    }
    outcomeByGame.set(outcome.gameId, outcome);
  }
  const graded: Array<{ prediction: NcaafV42026InternalPrediction; outcome: NcaafV4ProspectiveOutcome }> = [];
  let pending = 0;
  let invalidAfterCutoff = 0;
  for (const prediction of predictions) {
    const outcome = outcomeByGame.get(prediction.gameId);
    if (!outcome) {
      pending++;
      continue;
    }
    const cutoff = new Date(prediction.featureCutoff);
    const generated = new Date(prediction.predictionTimestamp);
    const scheduledKickoff = new Date(prediction.scheduledKickoffAt);
    if (scheduledKickoff.getTime() !== outcome.kickoffAt.getTime()) throw new Error(`Outcome kickoff conflicts with frozen ledger: ${prediction.gameId}`);
    if (cutoff >= scheduledKickoff || generated >= scheduledKickoff) {
      invalidAfterCutoff++;
      continue;
    }
    if (outcome.status.toLowerCase() !== "final" || outcome.homeScore == null || outcome.awayScore == null || outcome.capturedAt > evaluatedAt) {
      pending++;
      continue;
    }
    if (outcome.capturedAt < outcome.kickoffAt) throw new Error(`Final outcome predates kickoff: ${outcome.gameId}`);
    graded.push({ prediction, outcome });
  }
  const errors = graded.map(({ prediction, outcome }) => {
    const home = outcome.homeScore!;
    const away = outcome.awayScore!;
    const homeWin = home > away ? 1 : 0;
    return {
      home: prediction.expectedHomePoints - home,
      away: prediction.expectedAwayPoints - away,
      margin: prediction.expectedMargin - (home - away),
      total: prediction.expectedTotal - (home + away),
      probability: prediction.homeWinProbability,
      homeWin,
    };
  });
  const mae = (key: "home" | "away" | "margin" | "total") => mean(errors.map(error => Math.abs(error[key])));
  const rmse = (key: "home" | "away" | "margin" | "total") => Math.sqrt(mean(errors.map(error => error[key] ** 2)));
  const metrics: V4Metrics | null = graded.length ? {
    homeMae: mae("home"), homeRmse: rmse("home"),
    awayMae: mae("away"), awayRmse: rmse("away"),
    marginMae: mae("margin"), marginRmse: rmse("margin"),
    totalMae: mae("total"), totalRmse: rmse("total"),
    brier: mean(errors.map(error => (error.probability - error.homeWin) ** 2)),
    logLoss: mean(errors.map(error => -(error.homeWin * Math.log(clamp(error.probability))
      + (1 - error.homeWin) * Math.log(clamp(1 - error.probability))))),
    count: graded.length,
  } : null;
  return Object.freeze({
    version: NCAAF_V4_PROSPECTIVE_EVALUATION_VERSION,
    evaluatedAt: evaluatedAt.toISOString(),
    cohorts: Object.freeze({
      PREGAME_FROZEN_PENDING: pending,
      PREGAME_FROZEN_GRADED: graded.length,
      INVALID_AFTER_CUTOFF: invalidAfterCutoff,
      OUT_OF_DOMAIN: outOfDomain,
    }),
    metrics: metrics ? Object.freeze(metrics) : null,
    evidenceClassification: graded.length === 0 ? "INCONCLUSIVE" as const : "CONSISTENCY_REVIEW_REQUIRED" as const,
  });
}