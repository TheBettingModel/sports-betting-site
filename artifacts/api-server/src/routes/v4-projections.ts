import { Router, type IRouter } from "express";
import { TBM_V4_PUBLIC_SPORTS, type TbmV4Sport } from "../services/v4Platform";
import { DbV4ForecastLedger, discoverV4Slate, runFullSlateV4 } from "../services/v4FullSlate";
import { rankOfficialV4Candidates } from "../services/v4OfficialPublication";
import { db, gamesTable, modelPredictionsTable, publishedPicksTable, v4ForecastVersionsTable } from "@workspace/db";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { rejectInvalidToken, resolveSubscriberStatus } from "../middleware/requireSubscriber";

const router: IRouter = Router();
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function easternDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

function publicUnavailableReason(reason: string): string {
  if (reason === "EVENT_ALREADY_STARTED") return "Game has started and no valid pregame projection was saved.";
  if (reason === "INSUFFICIENT_PREGAME_EVIDENCE") return "Insufficient pregame evidence for a legitimate projection.";
  if (reason === "LIVE_INPUT_MATERIALIZATION_FAILED") return "Required pregame inputs could not be validated.";
  if (reason === "INVALID_CUTOFF") return "The event start time could not be validated.";
  if (reason === "UNRESOLVED_IDENTITY") return "The event participants could not be resolved.";
  if (reason === "NO_ELIGIBLE_V4_ARTIFACT") return "No eligible V4 model is available for this event.";
  return "A legitimate pregame projection is unavailable.";
}

function isValidPregameSnapshot(
  payload: Record<string, unknown>,
  event: { gameId: string; sport: string; eventStart: string | null },
): payload is Record<string, unknown> {
  const predictedAt = payload["predictionTimestamp"];
  return payload["gameId"] === event.gameId
    && payload["sport"] === event.sport
    && typeof payload["predictionId"] === "string"
    && typeof payload["modelVersion"] === "string"
    && typeof payload["approvalState"] === "string"
    && typeof predictedAt === "string"
    && Number.isFinite(Date.parse(predictedAt))
    && event.eventStart !== null
    && Date.parse(predictedAt) < Date.parse(event.eventStart);
}

router.get("/model/v4/projections", resolveSubscriberStatus, rejectInvalidToken, async (req, res) => {
  if (req.subscriberStatus?.isSubscribed !== true && req.subscriberStatus?.isOwner !== true) {
    res.status(403).json({ error: "Active subscription required" });
    return;
  }
  const sportValue = String(req.query["sport"] ?? "").toUpperCase();
  if (!(TBM_V4_PUBLIC_SPORTS as readonly string[]).includes(sportValue)) {
    res.status(400).json({ error: "sport must be one of the supported V4 sports" });
    return;
  }
  const date = String(req.query["date"] ?? easternDate(new Date()));
  if (!DATE_PATTERN.test(date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }
  const sport = sportValue as TbmV4Sport;
  const persistedSport = sport === "SOCCER" ? "Soccer" : sport;
  const events = await discoverV4Slate(sport, date);
  const snapshotLedger = new DbV4ForecastLedger();
  const coverage = await runFullSlateV4({
    // Persist immutable validating/developing forecasts so a legitimate
    // pregame projection remains visible after kickoff. SHADOW cannot cross
    // the official publication boundary. Request refreshes intentionally do
    // not create scheduler-run rows.
    sport, sportDate: date, now: new Date(), mode: "SHADOW", events,
    ledger: {
      persist: (forecast, eventStart) => snapshotLedger.persist(forecast, eventStart),
      persistRun: async () => undefined,
    },
  });
  const eventById = new Map(events.map((event) => [event.gameId, event]));
  const gameMetadata = events.length ? await db.select({
    eventId: gamesTable.id,
    homeParticipantAbbr: gamesTable.homeTeamAbbr,
    awayParticipantAbbr: gamesTable.awayTeamAbbr,
    homeParticipantLogo: gamesTable.homeTeamLogo,
    awayParticipantLogo: gamesTable.awayTeamLogo,
    homeStarterName: gamesTable.homeStarterName,
    homeStarterEra: gamesTable.homeStarterEra,
    homeStarterWhip: gamesTable.homeStarterWhip,
    awayStarterName: gamesTable.awayStarterName,
    awayStarterEra: gamesTable.awayStarterEra,
    awayStarterWhip: gamesTable.awayStarterWhip,
  }).from(gamesTable).where(inArray(
    gamesTable.id,
    events.map((event) => event.gameId),
  )) : [];
  const gameMetadataById = new Map(gameMetadata.map((game) => [game.eventId, game]));
  // A completed event must never trigger live generation. It can only be
  // displayed when an exact immutable pregame forecast survives validation.
  const startedEvents = events.filter((event) => event.eventStart !== null && new Date(event.eventStart) <= new Date());
  const snapshotRows = startedEvents.length ? await db.select({
    sport: v4ForecastVersionsTable.sport,
    gameId: v4ForecastVersionsTable.gameId,
    eventStart: v4ForecastVersionsTable.eventStart,
    predictedAt: v4ForecastVersionsTable.predictedAt,
    forecastPayload: v4ForecastVersionsTable.forecastPayload,
  }).from(v4ForecastVersionsTable).where(and(
    eq(v4ForecastVersionsTable.sport, sport),
    inArray(v4ForecastVersionsTable.gameId, startedEvents.map((event) => event.gameId)),
    lt(v4ForecastVersionsTable.predictedAt, v4ForecastVersionsTable.eventStart),
  )).orderBy(desc(v4ForecastVersionsTable.predictedAt)) : [];
  const snapshotByGameId = new Map<string, typeof coverage.forecasts[number]>();
  for (const snapshot of snapshotRows) {
    const event = eventById.get(snapshot.gameId);
    if (!event || snapshotByGameId.has(snapshot.gameId)
      || snapshot.eventStart.toISOString() !== event.eventStart
      || !isValidPregameSnapshot(snapshot.forecastPayload, event)) continue;
    snapshotByGameId.set(snapshot.gameId, snapshot.forecastPayload as unknown as typeof coverage.forecasts[number]);
  }
  const forecasts = [
    ...coverage.forecasts,
    ...[...snapshotByGameId.entries()]
      .filter(([gameId]) => !coverage.forecasts.some((forecast) => forecast.gameId === gameId))
      .map(([, forecast]) => forecast),
  ];
  const failureByGameId = new Map(coverage.failures.map((failure) => [failure.gameId, failure.reason]));
  const unresolvedFailures = coverage.failures.filter((failure) => !snapshotByGameId.has(failure.gameId));
  // Official fields are read only from the persisted publication decision. A
  // live re-computation may show a projection, but can never invent a pick.
  const persisted = forecasts.length ? await db.select({
    v4PredictionId: sql<string>`${modelPredictionsTable.featureSnapshot}->>'v4PredictionId'`,
    pickId: publishedPicksTable.id,
    isPublic: publishedPicksTable.isPublic,
    status: publishedPicksTable.publicationStatus,
    rank: publishedPicksTable.globalRank,
    units: publishedPicksTable.approvedUnits,
    isPotd: publishedPicksTable.isPlayOfDay,
    reason: publishedPicksTable.exclusionReasonCode,
  }).from(modelPredictionsTable).leftJoin(publishedPicksTable, and(
    eq(publishedPicksTable.predictionId, modelPredictionsTable.id),
    eq(publishedPicksTable.isEffective, true),
  )).where(inArray(
    sql<string>`${modelPredictionsTable.featureSnapshot}->>'v4PredictionId'`,
    forecasts.map((forecast) => forecast.predictionId),
  )) : [];
  const persistedByForecast = new Map(persisted.map(row => [row.v4PredictionId, row]));
  const officialPicks = await db.select({
    eventId: publishedPicksTable.gameId, role: publishedPicksTable.isPlayOfDay,
    rank: publishedPicksTable.globalRank, units: publishedPicksTable.approvedUnits,
    status: publishedPicksTable.publicationStatus, selection: publishedPicksTable.selection,
    market: publishedPicksTable.market, odds: publishedPicksTable.odds,
    modelProbability: modelPredictionsTable.modelProbability,
    fairProbability: modelPredictionsTable.fairProbability,
    modelId: sql<string | null>`${modelPredictionsTable.featureSnapshot}->>'modelId'`,
    modelVersion: sql<string | null>`${modelPredictionsTable.featureSnapshot}->>'modelVersion'`,
    artifactId: sql<string | null>`${modelPredictionsTable.featureSnapshot}->>'artifactId'`,
    artifactHash: sql<string | null>`${modelPredictionsTable.featureSnapshot}->>'artifactHash'`,
    inputHash: sql<string | null>`${modelPredictionsTable.featureSnapshot}->>'inputHash'`,
    marketEvidenceId: sql<string | null>`${modelPredictionsTable.featureSnapshot}->>'marketEvidenceId'`,
    homeParticipant: gamesTable.homeTeamName, awayParticipant: gamesTable.awayTeamName,
    homeParticipantAbbr: gamesTable.homeTeamAbbr, awayParticipantAbbr: gamesTable.awayTeamAbbr,
    homeParticipantLogo: gamesTable.homeTeamLogo, awayParticipantLogo: gamesTable.awayTeamLogo,
  }).from(publishedPicksTable).innerJoin(modelPredictionsTable,
    eq(modelPredictionsTable.id, publishedPicksTable.predictionId))
    .innerJoin(gamesTable, eq(gamesTable.id, publishedPicksTable.gameId))
    .where(and(eq(modelPredictionsTable.cohort, "official"), eq(publishedPicksTable.isEffective, true),
      eq(publishedPicksTable.isPublic, true), eq(publishedPicksTable.publicationStatus, "PUBLISHED"),
      sql`${modelPredictionsTable.featureSnapshot} ? 'v4PredictionId'`,
      sql`DATE(${gamesTable.startsAt} AT TIME ZONE 'America/New_York') = ${date}`,
      eq(modelPredictionsTable.sport, persistedSport)));
  // This read-only board has no locked market/slot transaction or exact
  // approval-ledger record. It consequently emits projections only. Keeping
  // that fact explicit is safer than treating engine approval as publication
  // approval, and makes client POTD computation impossible.
  const officialByPredictionId = new Map(rankOfficialV4Candidates(forecasts.map((forecast) => ({
    forecast,
    exactApproval: false,
    publicationEligible: false,
    rankScore: Number.NaN,
  }))).map((decision) => [decision.predictionId, decision]));
  res.json({
    sport,
    date,
    lifecycleDisclaimer: "Model projections are not official TBM picks unless officialPickStatus is OFFICIAL_TBM_PLAY.",
    coverage: {
      scheduledEvents: coverage.scheduledEvents,
      eligibleEvents: coverage.eligibleEvents,
      forecastedEvents: forecasts.length,
      failedEvents: Math.max(0, coverage.eligibleEvents - forecasts.length),
      forecastCoveragePct: coverage.eligibleEvents ? forecasts.length / coverage.eligibleEvents * 100 : 100,
      failures: unresolvedFailures,
    },
    fixtures: events.map((event) => {
      const metadata = gameMetadataById.get(event.gameId);
      const available = forecasts.some((forecast) => forecast.gameId === event.gameId);
      return {
        gameId: event.gameId,
        sport: event.sport,
        eventStart: event.eventStart,
        homeParticipant: {
          id: event.homeParticipantId,
          name: event.homeParticipantName,
          abbreviation: metadata?.homeParticipantAbbr ?? null,
          logo: metadata?.homeParticipantLogo ?? null,
        },
        awayParticipant: {
          id: event.awayParticipantId,
          name: event.awayParticipantName,
          abbreviation: metadata?.awayParticipantAbbr ?? null,
          logo: metadata?.awayParticipantLogo ?? null,
        },
        availability: available ? "AVAILABLE" : "UNAVAILABLE",
        unavailableReason: available ? null : publicUnavailableReason(
          failureByGameId.get(event.gameId) ?? event.failureReason ?? "CONTRACT_FAILURE",
        ),
      };
    }),
    officialPicks: officialPicks.map((pick) => ({
      ...pick, role: pick.role ? "TOP_PLAY" : "QUALIFIED_PLAY",
    })),
    projections: forecasts.map((forecast) => {
      const event = eventById.get(forecast.gameId);
      const metadata = gameMetadataById.get(forecast.gameId);
       const official = officialByPredictionId.get(forecast.predictionId)!;
       const stored = persistedByForecast.get(forecast.predictionId);
       const role = stored?.isPublic && stored.status === "PUBLISHED"
         ? stored.isPotd ? "TOP_PLAY" : "QUALIFIED_PLAY" : "PROJECTION";
      return {
        eventId: forecast.gameId,
        sport: forecast.sport,
        eventStart: event?.eventStart ?? null,
        homeParticipant: event?.homeParticipantName ?? null,
        awayParticipant: event?.awayParticipantName ?? null,
        homeParticipantAbbr: metadata?.homeParticipantAbbr ?? null,
        awayParticipantAbbr: metadata?.awayParticipantAbbr ?? null,
        homeParticipantLogo: metadata?.homeParticipantLogo ?? null,
        awayParticipantLogo: metadata?.awayParticipantLogo ?? null,
        homeStarterName: metadata?.homeStarterName ?? null,
        homeStarterEra: metadata?.homeStarterEra ?? null,
        homeStarterWhip: metadata?.homeStarterWhip ?? null,
        awayStarterName: metadata?.awayStarterName ?? null,
        awayStarterEra: metadata?.awayStarterEra ?? null,
        awayStarterWhip: metadata?.awayStarterWhip ?? null,
        modelVersion: forecast.modelVersion,
        lifecycleStatus: forecast.approvalState === "PRODUCTION_APPROVED"
          ? "V4_APPROVED" : forecast.approvalState === "PROVISIONAL" ? "V4_PROVISIONAL" : "V4_VALIDATING",
        expectedHomeScore: forecast.expectedHomeScore ?? null,
        expectedAwayScore: forecast.expectedAwayScore ?? null,
        expectedMargin: forecast.expectedMargin ?? null,
        expectedTotal: forecast.expectedTotal ?? null,
        homeWinProbability: forecast.homeWinProbability ?? null,
        drawProbability: forecast.drawProbability ?? null,
        awayWinProbability: forecast.awayWinProbability ?? null,
        projectedWinner: forecast.homeWinProbability == null || forecast.awayWinProbability == null
          ? null
          : forecast.drawProbability != null
            && forecast.drawProbability >= forecast.homeWinProbability
            && forecast.drawProbability >= forecast.awayWinProbability
            ? "DRAW"
            : forecast.homeWinProbability >= forecast.awayWinProbability ? "HOME" : "AWAY",
        forecastTimestamp: forecast.predictionTimestamp,
         officialRole: role,
         officialRank: stored?.isPublic ? stored.rank : null,
         units: stored?.isPublic ? stored.units ?? 0 : 0,
         officialPickStatus: role === "PROJECTION"
          ? "NO_OFFICIAL_PLAY" : "OFFICIAL_TBM_PLAY",
         officialFailureReason: role === "PROJECTION"
           ? stored?.reason ?? official.failureReason
           : null,
      };
    }),
  });
});

export default router;