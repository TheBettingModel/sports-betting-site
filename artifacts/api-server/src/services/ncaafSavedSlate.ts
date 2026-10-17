import {
  stableHash, validateCanonicalV4Forecast,
  type CanonicalV4Forecast, type V4ArtifactIdentity,
} from "./v4Platform";
import type { DiscoveredV4Event, FullSlateCoverage } from "./v4FullSlate";

export type SavedNcaafForecast = {
  gameId: string;
  predictionId: string;
  eventStart: Date;
  predictedAt: Date;
  dataCutoff: Date;
  featureSnapshotId: string;
  featureHash: string;
  forecastHash: string;
  forecastPayload: Record<string, unknown>;
};

/** Validate persisted evidence without executing a model or changing its output.
 * The caller supplies at most the latest exact-artifact row per fixture.
 * An invalid latest row fails closed; do not search history for a convenient one.
 */
export function buildSavedNcaafCoverage(input: {
  events: readonly DiscoveredV4Event[];
  rows: readonly SavedNcaafForecast[];
  identity: V4ArtifactIdentity | undefined;
  sportDate: string;
  now: Date;
}): FullSlateCoverage {
  const byGame = new Map(input.rows.map(row => [row.gameId, row]));
  const forecasts: CanonicalV4Forecast[] = [];
  const failures: FullSlateCoverage["failures"][number][] = [];
  for (const event of input.events) {
    if (event.sport !== "NCAAF" || event.eligibility !== "ELIGIBLE") {
      failures.push({ gameId: event.gameId, reason: event.failureReason ?? "UNSUPPORTED_EVENT_TYPE" });
      continue;
    }
    const row = byGame.get(event.gameId);
    try {
      if (!row || input.identity?.sport !== "NCAAF") throw new Error("NO_SNAPSHOT");
      const forecast = row.forecastPayload as unknown as CanonicalV4Forecast;
      const predicted = Date.parse(forecast.predictionTimestamp);
      const cutoff = Date.parse(forecast.dataCutoff);
      const kickoff = Date.parse(event.eventStart ?? "");
      if (!Number.isFinite(input.now.getTime())
        || !Number.isFinite(predicted) || !Number.isFinite(cutoff) || !Number.isFinite(kickoff)
        || cutoff > predicted || predicted >= kickoff || predicted > input.now.getTime()
        || row.eventStart.getTime() !== kickoff || row.predictedAt.getTime() !== predicted
        || row.dataCutoff.getTime() !== cutoff || row.predictionId !== forecast.predictionId
        || typeof forecast.predictionId !== "string" || !forecast.predictionId
        || typeof row.featureSnapshotId !== "string" || !row.featureSnapshotId
        || typeof row.featureHash !== "string" || !row.featureHash
        || !["UNVALIDATED", "SHADOW", "PROVISIONAL", "PRODUCTION_APPROVED"].includes(forecast.approvalState)
        || !["EXPERIMENTAL", "DEVELOPING", "VALIDATED", "MATURE"].includes(forecast.maturity)
        || !Array.isArray(forecast.qualityFlags)
        || !forecast.qualityFlags.every(flag => typeof flag === "string")
        || stableHash(forecast) !== row.forecastHash
        || ![forecast.expectedHomeScore, forecast.expectedAwayScore,
          forecast.homeWinProbability, forecast.awayWinProbability].every(Number.isFinite)) {
        throw new Error("INVALID_SNAPSHOT");
      }
      validateCanonicalV4Forecast(forecast, {
        gameId: event.gameId, eventStart: event.eventStart!, dataCutoff: row.dataCutoff.toISOString(),
        predictionTimestamp: row.predictedAt.toISOString(), sourceEvidenceTimes: [],
        featureSnapshotId: row.featureSnapshotId, featureHash: row.featureHash, input: null,
      }, input.identity);
      forecasts.push(forecast);
    } catch {
      failures.push({
        gameId: event.gameId,
        reason: event.eventStart && Date.parse(event.eventStart) <= input.now.getTime()
          ? "EVENT_ALREADY_STARTED" : "NO_VALID_SAVED_PREGAME_PROJECTION",
      });
    }
  }
  const eligibleEvents = input.events.filter(event => event.sport === "NCAAF"
    && event.eligibility === "ELIGIBLE").length;
  return {
    runId: stableHash({ source: "saved-ncaaf-slate", date: input.sportDate,
      predictions: forecasts.map(forecast => forecast.predictionId) }),
    sport: "NCAAF", sportDate: input.sportDate, scheduledEvents: input.events.length,
    eligibleEvents, forecastedEvents: forecasts.length,
    failedEvents: eligibleEvents - forecasts.length,
    forecastCoveragePct: eligibleEvents ? forecasts.length / eligibleEvents * 100 : 100,
    forecasts, failures,
  };
}
