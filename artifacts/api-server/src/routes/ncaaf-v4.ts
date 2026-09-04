import { Router, type IRouter } from "express";
import { GetNcaafV4ProjectionsQueryParams, GetNcaafV4ProjectionsResponse } from "@workspace/api-zod";
import { rejectInvalidToken, resolveSubscriberStatus } from "../middleware/requireSubscriber";
import { getNcaafV4ProjectionBoard } from "../services/ncaafV4GameDay";

const router: IRouter = Router();

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
    res.json(GetNcaafV4ProjectionsResponse.parse(await getNcaafV4ProjectionBoard(query.data.date)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to build NCAAF V4 projection board";
    if (message === "date must be YYYY-MM-DD") {
      res.status(400).json({ error: message });
      return;
    }
    req.log?.error({ error }, "NCAAF V4 projection board failed");
    res.status(500).json({ error: message });
  }
});

export default router;