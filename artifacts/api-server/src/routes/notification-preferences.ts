/**
 * Notification Preferences Routes
 *
 * GET  /api/notification-preferences  — get the user's sport alert preferences
 * PUT  /api/notification-preferences  — update the user's sport alert preferences
 *
 * Auth: Bearer JWT from Clerk (resolveSubscriberStatus).
 * Only Pro subscribers can customise preferences; free users get defaults.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { resolveSubscriberStatus } from "../middleware/requireSubscriber";
import { db, notificationPreferencesTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { ACTIVE_PRODUCT_SPORTS } from "../services/sportScope";

const router: IRouter = Router();

const ALL_SPORTS: string[] = [...ACTIVE_PRODUCT_SPORTS];

router.use("/notification-preferences", resolveSubscriberStatus);

/** GET /api/notification-preferences */
router.get("/notification-preferences", async (req: Request, res: Response): Promise<void> => {
  const userId = req.subscriberStatus?.userId ?? null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [row] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId))
    .limit(1);

  res.json({
    enabledSports: row?.enabledSports ?? null, // null = all sports (default)
    allSports: ALL_SPORTS,
  });
});

/** PUT /api/notification-preferences */
router.put("/notification-preferences", async (req: Request, res: Response): Promise<void> => {
  const userId = req.subscriberStatus?.userId ?? null;
  const isSubscribed = req.subscriberStatus?.isSubscribed ?? false;

  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isSubscribed) { res.status(403).json({ error: "Pro subscription required to customise notifications" }); return; }

  const { enabledSports } = req.body as { enabledSports: string[] | null };

  // Validate: must be null or an array of known sports
  if (enabledSports !== null) {
    if (!Array.isArray(enabledSports)) {
      res.status(400).json({ error: "enabledSports must be an array or null" });
      return;
    }
    const invalid = enabledSports.filter((s) => !ALL_SPORTS.includes(s));
    if (invalid.length) {
      res.status(400).json({ error: `Unknown sport(s): ${invalid.join(", ")}. Valid: ${ALL_SPORTS.join(", ")}` });
      return;
    }
  }

  await db
    .insert(notificationPreferencesTable)
    .values({ userId, enabledSports: enabledSports ?? null })
    .onConflictDoUpdate({
      target: notificationPreferencesTable.userId,
      set: { enabledSports: enabledSports ?? null, updatedAt: new Date() },
    });

  logger.info({ userId, enabledSports }, "Notification preferences updated");
  res.json({ enabledSports, allSports: ALL_SPORTS });
});

export default router;
