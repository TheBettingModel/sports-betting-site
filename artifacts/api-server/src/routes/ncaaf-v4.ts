import { Router, type IRouter } from "express";
import { GetNcaafV4ProjectionsQueryParams, GetNcaafV4ProjectionsResponse } from "@workspace/api-zod";
import { rejectInvalidToken, resolveSubscriberStatus } from "../middleware/requireSubscriber";
import { getNcaafV4ProjectionBoard } from "../services/ncaafV4GameDay";

const router: IRouter = Router();
/** Deliberate subscriber/mobile boundary: never serialize the owner evidence
 * board (PIT metadata, hashes, IDs, diagnostics, or cache/audit data). */
export function toSubscriberNcaafV4Board(owner: Awaited<ReturnType<typeof getNcaafV4ProjectionBoard>>) {
  return {
    date: owner.date,
    modelStatus: owner.model.modelStatus,
    approvalStatus: owner.model.approvalStatus,
    publicationStatus: owner.model.publicationStatus,
    disclaimer: "Unvalidated V4 preview; not an official production play.",
    board: owner.board.map(row => ({
      kickoffAt: row.kickoffAt, awayTeam: row.awayTeam, homeTeam: row.homeTeam,
      v4ModelOpinion: row.v4ModelOpinion,
      model: {
        expectedHomePoints: row.model.expectedHomePoints, expectedAwayPoints: row.model.expectedAwayPoints,
        homeWinProbability: row.model.homeWinProbability, awayWinProbability: row.model.awayWinProbability,
        fairHomeMoneyline: row.model.fairHomeMoneyline, fairAwayMoneyline: row.model.fairAwayMoneyline,
      },
      market: { moneyline: row.market.moneyline && {
        capturedAt: row.market.moneyline.capturedAt, homeOdds: row.market.moneyline.homeOdds, awayOdds: row.market.moneyline.awayOdds,
      }, spread: row.market.spread && { capturedAt: row.market.spread.capturedAt, selection: row.market.spread.selection, line: row.market.spread.line, odds: row.market.spread.odds },
        total: row.market.total && { capturedAt: row.market.total.capturedAt, selection: row.market.total.selection, line: row.market.total.line, odds: row.market.total.odds } },
      comparison: { moneylineHomeEdge: row.comparison.moneylineHomeEdge },
      disclaimer: "Unvalidated V4 preview; not an official production play.",
    })),
  };
}

/** Preview-only V4 board. This route intentionally has no mutation, wager,
 * registry, or publication side effect. */
router.get("/model/ncaaf/v4/projections", resolveSubscriberStatus, rejectInvalidToken, async (req, res): Promise<void> => {
  try {
    if (!req.subscriberStatus?.userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!req.subscriberStatus.isSubscribed && !req.subscriberStatus.isOwner) {
      res.status(403).json({ error: "Active subscription required for NCAAF V4 previews" });
      return;
    }
    const query = GetNcaafV4ProjectionsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "date must be YYYY-MM-DD" });
      return;
    }
    res.json(GetNcaafV4ProjectionsResponse.parse(toSubscriberNcaafV4Board(await getNcaafV4ProjectionBoard(query.data.date))));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to build NCAAF V4 projection board";
    if (message === "date must be YYYY-MM-DD") {
      res.status(400).json({ error: message });
      return;
    }
    req.log?.error({ error }, "NCAAF V4 projection board failed");
    // Do not disclose evidence, cache, or provider failure details to a
    // subscriber endpoint.
    res.status(500).json({ error: "Unable to build NCAAF V4 projection board" });
  }
});

export default router;