import { Router } from "express";
import { ClaimProjectionPassBody } from "@workspace/api-zod";
import { resolveSubscriberStatus, rejectInvalidToken } from "../middleware/requireSubscriber";
import { claimProjectionPass, getProjectionPassView, ProjectionPassError } from "../services/projectionPass";

const router = Router();
router.use("/projection-pass", resolveSubscriberStatus, rejectInvalidToken, (req, res, next) => {
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  res.set("Cache-Control", "private, no-store");
  res.set("Vary", "Authorization");
  if (!req.subscriberStatus?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  next();
});
router.get("/projection-pass", async (req, res) => {
  try {
    const view = await getProjectionPassView(req.subscriberStatus!.userId!);
    res.json({ ...view, canClaim: view.canClaim && !req.subscriberStatus!.isSubscribed && !req.subscriberStatus!.isOwner });
  }
  catch (err) { req.log.error({ err }, "Projection Pass access check failed"); res.status(503).json({ error: "Unable to verify your Projection Pass. Please try again." }); }
});
router.post("/projection-pass", async (req, res) => {
  if (req.subscriberStatus!.isSubscribed || req.subscriberStatus!.isOwner) {
    res.status(409).json({ code: "PRO_NOT_REQUIRED", error: "Pro members already have access to every projection." }); return;
  }
  const parsed = ClaimProjectionPassBody.strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Choose one game and explicitly confirm the free unlock." }); return; }
  try { res.json(await claimProjectionPass(req.subscriberStatus!.userId!, parsed.data.gameId)); }
  catch (err) {
    if (err instanceof ProjectionPassError) { res.status(409).json({ code: err.code, error: err.message }); return; }
    req.log.error({ err }, "Projection Pass claim failed");
    res.status(503).json({ error: "We couldn't unlock this game. Please refresh your pass status before trying again." });
  }
});
export default router;
