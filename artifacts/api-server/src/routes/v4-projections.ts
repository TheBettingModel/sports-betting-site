import { Router, type IRouter } from "express";
import { TBM_V4_SPORTS, type TbmV4Sport } from "../services/v4Platform";
import { discoverV4Slate, runFullSlateV4 } from "../services/v4FullSlate";
import { rankOfficialV4Candidates } from "../services/v4OfficialPublication";
import { db, gamesTable, modelPredictionsTable, publishedPicksTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { rejectInvalidToken, resolveSubscriberStatus } from "../middleware/requireSubscriber";

const router: IRouter = Router();
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function easternDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

router.get("/model/v4/projections", resolveSubscriberStatus, rejectInvalidToken, async (req, res) => {
  if (req.subscriberStatus?.isSubscribed !== true && req.subscriberStatus?.isOwner !== true) {
    res.status(403).json({ error: "Active subscription required" });
    return;
  }
  const sportValue = String(req.query["sport"] ?? "").toUpperCase();
  if (!TBM_V4_SPORTS.includes(sportValue as TbmV4Sport)) {
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
  const coverage = await runFullSlateV4({
    sport, sportDate: date, now: new Date(), mode: "DRY_RUN", events,
  });
  const eventById = new Map(events.map((event) => [event.gameId, event]));
  // Official fields are read only from the persisted publication decision. A
  // live re-computation may show a projection, but can never invent a pick.
  const persisted = coverage.forecasts.length ? await db.select({
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
  )).where(sql`${modelPredictionsTable.featureSnapshot}->>'v4PredictionId' = ANY(${coverage.forecasts.map((f) => f.predictionId)})`) : [];
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
  const officialByPredictionId = new Map(rankOfficialV4Candidates(coverage.forecasts.map((forecast) => ({
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
      forecastedEvents: coverage.forecastedEvents,
      failedEvents: coverage.failedEvents,
      forecastCoveragePct: coverage.forecastCoveragePct,
      failures: coverage.failures,
    },
    officialPicks: officialPicks.map((pick) => ({
      ...pick, role: pick.role ? "TOP_PLAY" : "QUALIFIED_PLAY",
    })),
    projections: coverage.forecasts.map((forecast) => {
      const event = eventById.get(forecast.gameId);
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