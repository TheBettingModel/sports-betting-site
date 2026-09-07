/**
 * User Preferences Routes
 *
 * GET  /api/preferences — returns current user's push notification preferences
 * PUT  /api/preferences — updates preferences
 *
 * Auth: Bearer JWT from Clerk (resolveSubscriberStatus).
 * Requires authentication; Pro subscribers can customise all fields.
 * Free users can read but not update sport filters or tier thresholds.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { resolveSubscriberStatus } from "../middleware/requireSubscriber";
import { db, userPreferencesTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

export const VALID_SPORTS = ["MLB", "NFL", "NBA", "WNBA", "NHL", "Soccer", "NCAAB", "NCAAF", "UFC"];
export const VALID_TIERS = ["Playable", "Strong Buy", "Elite"];

router.use("/preferences", resolveSubscriberStatus);

/** GET /api/preferences */
router.get("/preferences", async (req: Request, res: Response): Promise<void> => {
  const userId = req.subscriberStatus?.userId ?? null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [row] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId))
    .limit(1);

  res.json({
    notifSports: row?.notifSports ?? null,   // null = all sports
    notifMinTier: row?.notifMinTier ?? "Playable",
    notifEnabled: row?.notifEnabled ?? true,
    validSports: VALID_SPORTS,
    validTiers: VALID_TIERS,
  });
});

/** PUT /api/preferences */
router.put("/preferences", async (req: Request, res: Response): Promise<void> => {
  const userId = req.subscriberStatus?.userId ?? null;
  const isSubscribed = req.subscriberStatus?.isSubscribed ?? false;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!isSubscribed) {
    res.status(403).json({ error: "Pro subscription required to customise notification preferences" });
    return;
  }

  const { notifSports, notifMinTier, notifEnabled } = req.body as {
    notifSports?: string[] | null;
    notifMinTier?: string;
    notifEnabled?: boolean;
  };

  // Validate notifSports
  if (notifSports !== undefined && notifSports !== null) {
    if (!Array.isArray(notifSports)) {
      res.status(400).json({ error: "notifSports must be an array of sport keys or null" });
      return;
    }
    const invalid = notifSports.filter((s) => !VALID_SPORTS.includes(s));
    if (invalid.length > 0) {
      res.status(400).json({
        error: `Unknown sport(s): ${invalid.join(", ")}. Valid: ${VALID_SPORTS.join(", ")}`,
      });
      return;
    }
  }

  // Validate notifMinTier
  if (notifMinTier !== undefined && !VALID_TIERS.includes(notifMinTier)) {
    res.status(400).json({
      error: `Invalid tier: ${notifMinTier}. Valid: ${VALID_TIERS.join(", ")}`,
    });
    return;
  }

  // Validate notifEnabled
  if (notifEnabled !== undefined && typeof notifEnabled !== "boolean") {
    res.status(400).json({ error: "notifEnabled must be a boolean" });
    return;
  }

  // Build update payload — only update provided fields
  const updateSet: Partial<{
    notifSports: string[] | null;
    notifMinTier: string;
    notifEnabled: boolean;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (notifSports !== undefined) updateSet.notifSports = notifSports ?? null;
  if (notifMinTier !== undefined) updateSet.notifMinTier = notifMinTier;
  if (notifEnabled !== undefined) updateSet.notifEnabled = notifEnabled;

  await db
    .insert(userPreferencesTable)
    .values({
      userId,
      notifSports: notifSports ?? null,
      notifMinTier: notifMinTier ?? "Playable",
      notifEnabled: notifEnabled ?? true,
    })
    .onConflictDoUpdate({
      target: userPreferencesTable.userId,
      set: updateSet,
    });

  logger.info({ userId, notifSports, notifMinTier, notifEnabled }, "User preferences updated");

  const [updated] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId))
    .limit(1);

  res.json({
    notifSports: updated?.notifSports ?? null,
    notifMinTier: updated?.notifMinTier ?? "Playable",
    notifEnabled: updated?.notifEnabled ?? true,
    validSports: VALID_SPORTS,
    validTiers: VALID_TIERS,
  });
});

export default router;
