/**
 * Push Token Routes
 *
 * POST /api/push-tokens        — register a device token for the authenticated user
 * DELETE /api/push-tokens      — deregister a device token
 *
 * Auth: Bearer JWT from Clerk, verified by the shared resolveSubscriberStatus
 * middleware (same JWKS source + issuer checks used by the rest of the API).
 * userId is read from req.subscriberStatus set by that middleware.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { resolveSubscriberStatus } from "../middleware/requireSubscriber";
import { registerPushToken, deregisterPushToken } from "../services/pushNotifications";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// All push-token routes require a verified Clerk session
router.use("/push-tokens", resolveSubscriberStatus);

// ── POST /api/push-tokens ─────────────────────────────────────────────────────

router.post("/push-tokens", async (req: Request, res: Response): Promise<void> => {
  const userId = req.subscriberStatus?.userId ?? null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { token, platform } = req.body as {
    token?: string;
    platform?: string;
  };

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token is required" });
    return;
  }

  try {
    await registerPushToken(userId, token, platform);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, userId }, "Failed to register push token");
    res.status(500).json({ error: "Failed to register token" });
  }
});

// ── DELETE /api/push-tokens ───────────────────────────────────────────────────

router.delete("/push-tokens", async (req: Request, res: Response): Promise<void> => {
  const userId = req.subscriberStatus?.userId ?? null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { token } = req.body as { token?: string };

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token is required" });
    return;
  }

  try {
    await deregisterPushToken(userId, token);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, userId }, "Failed to deregister push token");
    res.status(500).json({ error: "Failed to deregister token" });
  }
});

export default router;
