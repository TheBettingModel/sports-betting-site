import { and, eq, gte, lt } from "drizzle-orm";
import {
  db,
  gamesTable,
  ncaafFeatureSnapshotsTable,
  ncaafFootballIntelligenceSnapshotsTable,
  ncaafGameEvidenceTable,
  ncaafTeamGamePerformanceTable,
  v4ForecastVersionsTable,
} from "@workspace/db";
import { ncaafRollingEasternBounds, ncaafRollingProjectionDates } from "./ncaafProductionEvidenceCycle";

export type HealthGameRow = {
  eventId: string;
  kickoffAt: Date;
  gameStatus: string | null;
  evidenceStatus: string;
  evidenceCapturedAt: Date | null;
  featureCreatedAt: Date | null;
  featureValid: boolean;
  intelligenceCreatedAt: Date | null;
  intelligenceValid: boolean;
  forecastPredictedAt: Date | null;
  forecastValid: boolean;
  homeFbs: boolean | null;
  awayFbs: boolean | null;
};

function easternDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value);
}

function emptyDay(date: string) {
  return {
    date, scheduledGames: 0, fbsVsFbsGames: 0, eligibilityProvableGames: 0,
    validEvidenceSnapshots: 0, validIntelligenceSnapshots: 0, v4Forecasts: 0,
    unavailable: 0, unavailableReasons: {} as Record<string, number>,
    latestEvidenceAt: null as string | null, latestProjectionAt: null as string | null,
    stale: false, kickoffFrozenGames: 0, awaitingFinalGames: 0, gradedFinalGames: 0,
  };
}

/**
 * Pure aggregation intentionally treats unknown division and invalid artifacts
 * as unavailable. In particular, names, conferences, and model presence never
 * establish FBS eligibility.
 */
export function summarizeNcaafV4Health(rows: HealthGameRow[], now: Date, dates: string[]) {
  const byDate = new Map(dates.map((date) => [date, emptyDay(date)]));
  for (const row of rows) {
    const date = easternDate(row.kickoffAt);
    const day = byDate.get(date);
    if (!day) continue;
    day.scheduledGames++;
    const fbs = row.homeFbs === true && row.awayFbs === true;
    if (fbs) { day.fbsVsFbsGames++; day.eligibilityProvableGames++; }
    if (row.evidenceStatus === "observed" && row.evidenceCapturedAt && row.evidenceCapturedAt <= now) day.validEvidenceSnapshots++;
    if (row.intelligenceValid) day.validIntelligenceSnapshots++;
    if (row.forecastValid) day.v4Forecasts++;
    if (row.kickoffAt <= now) {
      if (row.forecastValid) {
        day.kickoffFrozenGames++;
        if (row.gameStatus?.toLowerCase() === "final") day.gradedFinalGames++;
        else day.awaitingFinalGames++;
      }
    }
    const reasons: string[] = [];
    if (!fbs) reasons.push(row.homeFbs === null || row.awayFbs === null ? "FBS_ELIGIBILITY_UNPROVABLE" : "NON_FBS_MATCHUP");
    if (row.evidenceStatus !== "observed") reasons.push("INVALID_EVIDENCE_SNAPSHOT");
    if (!row.intelligenceValid) reasons.push("INVALID_INTELLIGENCE_SNAPSHOT");
    if (!row.forecastValid) reasons.push(row.kickoffAt <= now ? "NO_PREGAME_V4_FORECAST" : "V4_FORECAST_UNAVAILABLE");
    for (const reason of reasons) day.unavailableReasons[reason] = (day.unavailableReasons[reason] ?? 0) + 1;
    if (reasons.length) day.unavailable++;
    if (row.evidenceCapturedAt) {
      const evidence = row.evidenceCapturedAt.toISOString();
      if (!day.latestEvidenceAt || evidence > day.latestEvidenceAt) day.latestEvidenceAt = evidence;
    }
    if (row.forecastPredictedAt) {
      const projection = row.forecastPredictedAt.toISOString();
      if (!day.latestProjectionAt || projection > day.latestProjectionAt) day.latestProjectionAt = projection;
    }
  }
  for (const day of byDate.values()) {
    const latest = [day.latestEvidenceAt, day.latestProjectionAt].filter(Boolean).map((x) => Date.parse(x!));
    day.stale = latest.length === 0 || Math.max(...latest) < now.getTime() - 30 * 60_000;
  }
  const days = [...byDate.values()];
  const totals = days.reduce((out, day) => {
    for (const key of ["scheduledGames", "fbsVsFbsGames", "eligibilityProvableGames", "validEvidenceSnapshots",
      "validIntelligenceSnapshots", "v4Forecasts", "unavailable", "kickoffFrozenGames", "awaitingFinalGames", "gradedFinalGames"] as const) {
      out[key] += day[key];
    }
    for (const [reason, count] of Object.entries(day.unavailableReasons)) out.unavailableReasons[reason] = (out.unavailableReasons[reason] ?? 0) + count;
    if (day.latestEvidenceAt && (!out.latestEvidenceAt || day.latestEvidenceAt > out.latestEvidenceAt)) out.latestEvidenceAt = day.latestEvidenceAt;
    if (day.latestProjectionAt && (!out.latestProjectionAt || day.latestProjectionAt > out.latestProjectionAt)) out.latestProjectionAt = day.latestProjectionAt;
    return out;
  }, { scheduledGames: 0, fbsVsFbsGames: 0, eligibilityProvableGames: 0, validEvidenceSnapshots: 0,
    validIntelligenceSnapshots: 0, v4Forecasts: 0, unavailable: 0, kickoffFrozenGames: 0,
    awaitingFinalGames: 0, gradedFinalGames: 0, unavailableReasons: {} as Record<string, number>,
    latestEvidenceAt: null as string | null, latestProjectionAt: null as string | null,
    stale: false });
  const latestTotals = [totals.latestEvidenceAt, totals.latestProjectionAt].filter(Boolean).map((value) => Date.parse(value!));
  totals.stale = latestTotals.length === 0 || Math.max(...latestTotals) < now.getTime() - 30 * 60_000;
  return { asOf: now.toISOString(), days, totals };
}

export async function getNcaafV4HealthReport(now = new Date()) {
  const dates = ncaafRollingProjectionDates(now);
  const { start, end } = ncaafRollingEasternBounds(now);
  const [schedule, evidence, features, intelligence, forecasts, performance] = await Promise.all([
    db.select({ eventId: gamesTable.id, kickoffAt: gamesTable.startsAt,
      gameStatus: gamesTable.status, homeTeamId: gamesTable.homeTeamId,
      awayTeamId: gamesTable.awayTeamId }).from(gamesTable).where(and(
      eq(gamesTable.sport, "NCAAF"), gte(gamesTable.startsAt, start), lt(gamesTable.startsAt, end))),
    db.select({ eventId: ncaafGameEvidenceTable.providerEventId, kickoffAt: ncaafGameEvidenceTable.kickoffAt,
      gameStatus: ncaafGameEvidenceTable.gameStatus, evidenceStatus: ncaafGameEvidenceTable.evidenceStatus,
      capturedAt: ncaafGameEvidenceTable.capturedAt, homeTeamId: ncaafGameEvidenceTable.homeProviderTeamId,
      awayTeamId: ncaafGameEvidenceTable.awayProviderTeamId }).from(ncaafGameEvidenceTable).where(and(
      gte(ncaafGameEvidenceTable.kickoffAt, start), lt(ncaafGameEvidenceTable.kickoffAt, end))),
    db.select({ eventId: ncaafFeatureSnapshotsTable.targetEventId, createdAt: ncaafFeatureSnapshotsTable.createdAt,
      quality: ncaafFeatureSnapshotsTable.quality }).from(ncaafFeatureSnapshotsTable),
    db.select({ eventId: ncaafFootballIntelligenceSnapshotsTable.targetEventId, createdAt: ncaafFootballIntelligenceSnapshotsTable.createdAt,
      quality: ncaafFootballIntelligenceSnapshotsTable.qualityReadiness }).from(ncaafFootballIntelligenceSnapshotsTable),
    db.select({ eventId: v4ForecastVersionsTable.gameId, predictedAt: v4ForecastVersionsTable.predictedAt,
      eventStart: v4ForecastVersionsTable.eventStart, dataCutoff: v4ForecastVersionsTable.dataCutoff }).from(v4ForecastVersionsTable)
      .where(and(gte(v4ForecastVersionsTable.eventStart, start), lt(v4ForecastVersionsTable.eventStart, end))),
    db.select({ eventId: ncaafTeamGamePerformanceTable.providerEventId, teamId: ncaafTeamGamePerformanceTable.providerTeamId,
      classification: ncaafTeamGamePerformanceTable.competitionClassification }).from(ncaafTeamGamePerformanceTable),
  ]);
  const latest = <T extends { eventId: string; createdAt?: Date | null; predictedAt?: Date | null }>(items: T[]) => {
    const map = new Map<string, T>();
    for (const item of items) if (!map.has(item.eventId) || (item.createdAt ?? item.predictedAt)! > (map.get(item.eventId)!.createdAt ?? map.get(item.eventId)!.predictedAt)!) map.set(item.eventId, item);
    return map;
  };
  const featureMap = latest(features.map((x) => ({ ...x, createdAt: x.createdAt })));
  const intelligenceMap = latest(intelligence.map((x) => ({ ...x, createdAt: x.createdAt })));
  const forecastMap = latest(forecasts.map((x) => ({
    ...x,
    eventId: x.eventId.replace(/^NCAAF-/, ""),
    predictedAt: x.predictedAt,
  })));
  const fbs = new Map<string, boolean>();
  for (const row of performance) {
    if (row.classification === "FBS") fbs.set(row.teamId, true);
    else if (row.classification === "FCS" || row.classification === "OTHER") fbs.set(row.teamId, false);
  }
  const latestEvidence = new Map<string, typeof evidence[number]>();
  for (const game of evidence) {
    const prior = latestEvidence.get(game.eventId);
    if (!prior || game.capturedAt > prior.capturedAt) latestEvidence.set(game.eventId, game);
  }
  const rows: HealthGameRow[] = [];
  for (const scheduled of schedule) {
    if (!scheduled.kickoffAt) continue;
    const normalizedEventId = scheduled.eventId.replace(/^NCAAF-/, "");
    const game = latestEvidence.get(normalizedEventId);
    const feature = featureMap.get(normalizedEventId);
    const intel = intelligenceMap.get(normalizedEventId);
    const forecast = forecastMap.get(normalizedEventId);
    const quality = feature?.quality as { status?: string } | null;
    const readiness = intel?.quality as { state?: string } | null;
    const homeTeamId = game?.homeTeamId ?? scheduled.homeTeamId;
    const awayTeamId = game?.awayTeamId ?? scheduled.awayTeamId;
    rows.push({ eventId: normalizedEventId, kickoffAt: scheduled.kickoffAt,
      gameStatus: game?.gameStatus ?? scheduled.gameStatus,
      evidenceStatus: game?.evidenceStatus ?? "missing", evidenceCapturedAt: game?.capturedAt ?? null,
      featureCreatedAt: feature?.createdAt ?? null, featureValid: quality?.status === "ready"
        && !!feature?.createdAt && feature.createdAt <= scheduled.kickoffAt,
      intelligenceCreatedAt: intel?.createdAt ?? null, intelligenceValid: readiness?.state === "READY"
        && !!intel?.createdAt && intel.createdAt <= scheduled.kickoffAt,
      forecastPredictedAt: forecast?.predictedAt ?? null,
      forecastValid: !!forecast && forecast.predictedAt < forecast.eventStart && forecast.dataCutoff <= forecast.predictedAt,
      homeFbs: homeTeamId ? (fbs.get(homeTeamId) ?? null) : null,
      awayFbs: awayTeamId ? (fbs.get(awayTeamId) ?? null) : null });
  }
  return summarizeNcaafV4Health(rows, now, dates);
}