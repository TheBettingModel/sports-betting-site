import { and, asc, desc, eq } from "drizzle-orm";
import {
  db,
  gamesTable,
  v4ForecastVersionsTable,
  v4FullSlateRunsTable,
} from "@workspace/db";
import {
  canonicalV4EngineRegistry,
  routeV4Forecast,
  stableHash,
  type CanonicalV4Forecast,
  type TbmV4Sport,
  type V4EngineRegistry,
} from "./v4Platform";
import { fetchSportGamesByDate } from "./espn";

export type FullSlateMode = "DRY_RUN" | "SHADOW" | "PRODUCTION";
export type ForecastFailureReason =
  | "UNRESOLVED_IDENTITY"
  | "UNSUPPORTED_EVENT_TYPE"
  | "INVALID_CUTOFF"
  | "NO_ELIGIBLE_V4_ARTIFACT"
  | "CONTRACT_FAILURE"
  | "INSUFFICIENT_PREGAME_EVIDENCE"
  | string;

export type DiscoveredV4Event = Readonly<{
  gameId: string;
  sport: TbmV4Sport;
  eventStart: string | null;
  homeParticipantId: string | null;
  awayParticipantId: string | null;
  homeParticipantName: string;
  awayParticipantName: string;
  eligibility: "ELIGIBLE" | "INELIGIBLE";
  failureReason: ForecastFailureReason | null;
}>;

export type FullSlateCoverage = Readonly<{
  runId: string;
  sport: TbmV4Sport;
  sportDate: string;
  scheduledEvents: number;
  eligibleEvents: number;
  forecastedEvents: number;
  failedEvents: number;
  forecastCoveragePct: number;
  failures: readonly { gameId: string; reason: string }[];
  forecasts: readonly CanonicalV4Forecast[];
}>;

export interface V4ForecastLedger {
  persist(forecast: CanonicalV4Forecast, eventStart: string): Promise<{ version: number; created: boolean }>;
  persistRun(run: FullSlateCoverage, mode: FullSlateMode, startedAt: string, completedAt: string): Promise<void>;
}

function canonicalSport(dbSport: string): TbmV4Sport | null {
  const normalized = dbSport.toUpperCase();
  if (normalized === "SOCCER") return "SOCCER";
  if (normalized === "NCAAB") return "NCAAMB";
  return ["MLB", "NCAAF", "NFL", "NBA", "WNBA", "NHL", "UFC"].includes(normalized)
    ? normalized as TbmV4Sport : null;
}

export function classifyDiscoveredEvent(input: {
  gameId: string;
  sport: string;
  eventStart: Date | null;
  homeParticipantId: string | null;
  awayParticipantId: string | null;
  homeParticipantName: string;
  awayParticipantName: string;
}): DiscoveredV4Event | null {
  const sport = canonicalSport(input.sport);
  if (!sport) return null;
  const failureReason = !input.eventStart
    ? "INVALID_CUTOFF"
    : !input.homeParticipantId || !input.awayParticipantId
      ? "UNRESOLVED_IDENTITY"
      : null;
  return {
    gameId: input.gameId,
    sport,
    eventStart: input.eventStart?.toISOString() ?? null,
    homeParticipantId: input.homeParticipantId,
    awayParticipantId: input.awayParticipantId,
    homeParticipantName: input.homeParticipantName,
    awayParticipantName: input.awayParticipantName,
    eligibility: failureReason ? "INELIGIBLE" : "ELIGIBLE",
    failureReason,
  };
}

export async function discoverV4Slate(sport: TbmV4Sport, sportDate: string): Promise<DiscoveredV4Event[]> {
  const dbSport = sport === "SOCCER" ? "Soccer" : sport === "NCAAMB" ? "NCAAB" : sport;
  const rows = await db.select({
    gameId: gamesTable.id,
    sport: gamesTable.sport,
    eventStart: gamesTable.startsAt,
    homeParticipantId: gamesTable.homeTeamId,
    awayParticipantId: gamesTable.awayTeamId,
    homeParticipantName: gamesTable.homeTeamName,
    awayParticipantName: gamesTable.awayTeamName,
  }).from(gamesTable).where(and(
    eq(gamesTable.sport, dbSport),
    eq(gamesTable.gameDate, sportDate),
  )).orderBy(asc(gamesTable.startsAt), asc(gamesTable.id));
  const incompleteNflRows = sport === "NFL" && rows.some((row) =>
    !row.eventStart || !row.homeParticipantId || !row.awayParticipantId);
  const nflSchedule = incompleteNflRows
    ? await fetchSportGamesByDate("NFL", sportDate.replaceAll("-", ""))
    : [];
  const nflById = new Map(nflSchedule.map((game) => [game.espnId, game]));
  return rows.flatMap((row) => {
    const provider = nflById.get(row.gameId);
    const event = classifyDiscoveredEvent({
      ...row,
      eventStart: row.eventStart ?? (provider ? new Date(provider.commenceTimeISO) : null),
      homeParticipantId: row.homeParticipantId ?? provider?.homeTeamId ?? null,
      awayParticipantId: row.awayParticipantId ?? provider?.awayTeamId ?? null,
      homeParticipantName: row.homeParticipantName || provider?.homeTeamName || "",
      awayParticipantName: row.awayParticipantName || provider?.awayTeamName || "",
    });
    return event ? [event] : [];
  });
}

function routeFailureReason(reason: string): ForecastFailureReason {
  if (reason === "NO_REGISTERED_V4_ENGINE") return "NO_ELIGIBLE_V4_ARTIFACT";
  if (/IDENTITY/.test(reason)) return "UNRESOLVED_IDENTITY";
  if (/HISTORY|EVIDENCE|PREGAME_INPUT|NO_ELIGIBLE_PIT_INPUT/.test(reason)) {
    return "INSUFFICIENT_PREGAME_EVIDENCE";
  }
  if (/START|CUTOFF|CHRONOLOGY/.test(reason)) return "INVALID_CUTOFF";
  return "CONTRACT_FAILURE";
}

export async function runFullSlateV4(input: {
  sport: TbmV4Sport;
  sportDate: string;
  now: Date;
  mode: FullSlateMode;
  events: readonly DiscoveredV4Event[];
  registry?: V4EngineRegistry;
  ledger?: V4ForecastLedger;
}): Promise<FullSlateCoverage> {
  const startedAt = input.now.toISOString();
  const failures = input.events
    .filter((event) => event.eligibility === "INELIGIBLE")
    .map((event) => ({ gameId: event.gameId, reason: event.failureReason ?? "UNSUPPORTED_EVENT_TYPE" }));
  const eligible = input.events.filter((event) => event.eligibility === "ELIGIBLE");
  const forecasts: CanonicalV4Forecast[] = [];
  for (const event of eligible) {
    const routed = await routeV4Forecast(
      input.registry ?? canonicalV4EngineRegistry,
      input.sport,
      event.gameId,
      input.now,
    );
    if (routed.disposition === "NO_FORECAST") {
      failures.push({ gameId: event.gameId, reason: routeFailureReason(routed.reason) });
      continue;
    }
    forecasts.push(routed.forecast);
    if (input.mode !== "DRY_RUN" && input.ledger && event.eventStart) {
      await input.ledger.persist(routed.forecast, event.eventStart);
    }
  }
  const eligibleEvents = eligible.length;
  const coverage: FullSlateCoverage = {
    runId: stableHash({
      sport: input.sport, sportDate: input.sportDate, mode: input.mode,
      startedAt, gameIds: input.events.map((event) => event.gameId),
    }),
    sport: input.sport,
    sportDate: input.sportDate,
    scheduledEvents: input.events.length,
    eligibleEvents,
    forecastedEvents: forecasts.length,
    failedEvents: eligibleEvents - forecasts.length,
    forecastCoveragePct: eligibleEvents ? forecasts.length / eligibleEvents * 100 : 100,
    failures,
    forecasts,
  };
  if (input.mode !== "DRY_RUN" && input.ledger) {
    await input.ledger.persistRun(coverage, input.mode, startedAt, new Date().toISOString());
  }
  return coverage;
}

export class DbV4ForecastLedger implements V4ForecastLedger {
  async persist(forecast: CanonicalV4Forecast, eventStart: string) {
    const predictedAt = new Date(forecast.predictionTimestamp);
    const start = new Date(eventStart);
    if (predictedAt >= start) throw new Error("POST_START_FORECAST_REJECTED");
    return db.transaction(async (transaction) => {
      const [same] = await transaction.select({
        predictionId: v4ForecastVersionsTable.predictionId,
        version: v4ForecastVersionsTable.version,
      }).from(v4ForecastVersionsTable)
        .where(eq(v4ForecastVersionsTable.predictionId, forecast.predictionId)).limit(1);
      if (same) return { version: same.version, created: false };
      const [latest] = await transaction.select({
        predictionId: v4ForecastVersionsTable.predictionId,
        version: v4ForecastVersionsTable.version,
      }).from(v4ForecastVersionsTable).where(and(
        eq(v4ForecastVersionsTable.sport, forecast.sport),
        eq(v4ForecastVersionsTable.gameId, forecast.gameId),
      )).orderBy(desc(v4ForecastVersionsTable.version)).limit(1);
      const version = (latest?.version ?? 0) + 1;
      await transaction.insert(v4ForecastVersionsTable).values({
        predictionId: forecast.predictionId,
        sport: forecast.sport,
        gameId: forecast.gameId,
        version,
        supersedesPredictionId: latest?.predictionId ?? null,
        modelId: forecast.modelId,
        modelVersion: forecast.modelVersion,
        artifactHash: forecast.artifactHash,
        contractId: forecast.contractId,
        contractHash: forecast.contractHash,
        featureSnapshotId: forecast.featureSnapshotId,
        featureHash: forecast.featureHash,
        dataCutoff: new Date(forecast.dataCutoff),
        predictedAt,
        eventStart: start,
        approvalState: forecast.approvalState,
        maturity: forecast.maturity,
        forecastStatus: forecast.approvalState === "PRODUCTION_APPROVED"
          ? "V4_APPROVED" : forecast.approvalState === "PROVISIONAL" ? "V4_PROVISIONAL" : "V4_VALIDATING",
        officialPickStatus: forecast.approvalState === "PRODUCTION_APPROVED"
          ? "NO_OFFICIAL_PLAY" : "NOT_PUBLICATION_ELIGIBLE",
        forecastPayload: forecast as unknown as Record<string, unknown>,
        forecastHash: stableHash(forecast),
      });
      return { version, created: true };
    });
  }

  async persistRun(run: FullSlateCoverage, mode: FullSlateMode, startedAt: string, completedAt: string) {
    await db.insert(v4FullSlateRunsTable).values({
      runId: run.runId,
      sport: run.sport,
      sportDate: run.sportDate,
      mode,
      scheduledEvents: run.scheduledEvents,
      eligibleEvents: run.eligibleEvents,
      forecastedEvents: run.forecastedEvents,
      failedEvents: run.failedEvents,
      coverageBasisPoints: Math.round(run.forecastCoveragePct * 100),
      failures: [...run.failures],
      startedAt: new Date(startedAt),
      completedAt: new Date(completedAt),
    }).onConflictDoNothing();
  }
}