import { Router, type IRouter } from "express";
import { TBM_V4_SPORTS, type TbmV4Sport } from "../services/v4Platform";
import { discoverV4Slate, runFullSlateV4 } from "../services/v4FullSlate";

const router: IRouter = Router();
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function easternDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

router.get("/model/v4/projections", async (req, res) => {
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
  const events = await discoverV4Slate(sport, date);
  const coverage = await runFullSlateV4({
    sport, sportDate: date, now: new Date(), mode: "DRY_RUN", events,
  });
  const eventById = new Map(events.map((event) => [event.gameId, event]));
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
    projections: coverage.forecasts.map((forecast) => {
      const event = eventById.get(forecast.gameId);
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
        officialPickStatus: forecast.approvalState === "PRODUCTION_APPROVED"
          ? "NO_OFFICIAL_PLAY" : "NOT_PUBLICATION_ELIGIBLE",
      };
    }),
  });
});

export default router;