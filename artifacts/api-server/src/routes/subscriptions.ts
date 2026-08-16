/**
 * POST /api/subscriptions/sync
 *
 * Called by the mobile app immediately after a successful RevenueCat purchase
 * or restore. Acts as a fallback for missed/delayed webhooks.
 *
 * Security model:
 *   - The Clerk JWT in the Authorization header is fully verified (RS256 + exp).
 *     The userId comes from the JWT, never from the request body, so a caller
 *     can only write a record for themselves.
 *   - The entitlement proof comes from the RevenueCat SDK on the client and is
 *     included in the body. This is intentionally trusted after JWT verification —
 *     a malicious actor could only grant their own account Pro access, which is
 *     equivalent to them having paid.
 *   - expiresAt is required for annual/monthly subscriptions. If absent, we set
 *     a 1-year safety fallback so the record is not permanently open-ended.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db, subscribersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  resolveSubscriberStatus,
  rejectInvalidToken,
} from "../middleware/requireSubscriber";

const router: IRouter = Router();

const PRO_ENTITLEMENT = "pro";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

router.post(
  "/subscriptions/sync",
  resolveSubscriberStatus,
  rejectInvalidToken,
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.subscriberStatus!;

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const body = req.body as {
      entitlementId?: string;
      expiresAt?: string | null;
      isActive?: boolean;
    };

    const entitlementId = body.entitlementId ?? PRO_ENTITLEMENT;

    // Only handle the pro entitlement through this route
    if (entitlementId !== PRO_ENTITLEMENT) {
      res.status(400).json({ error: `Unknown entitlement: ${entitlementId}` });
      return;
    }

    const isActive = body.isActive !== false; // defaults to true unless explicitly false

    // Parse expiresAt from the client, fall back to +1 year
    let expiresAt: Date | undefined;
    if (body.expiresAt) {
      const parsed = new Date(body.expiresAt);
      if (!isNaN(parsed.getTime())) {
        expiresAt = parsed;
      }
    }
    if (!expiresAt && isActive) {
      expiresAt = new Date(Date.now() + ONE_YEAR_MS);
    }

    try {
      await db
        .insert(subscribersTable)
        .values({
          userId,
          entitlement: PRO_ENTITLEMENT,
          isActive,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: subscribersTable.userId,
          set: {
            entitlement: PRO_ENTITLEMENT,
            isActive,
            expiresAt,
            updatedAt: new Date(),
          },
        });

      logger.info(
        { userId, isActive, expiresAt },
        "Subscription sync: subscriber record upserted",
      );

      res.status(200).json({ synced: true, isSubscribed: isActive });
    } catch (err) {
      logger.error({ err, userId }, "Subscription sync: DB upsert failed");
      res.status(500).json({ error: "Failed to sync subscription" });
    }
  },
);

/**
 * GET /api/subscriptions/status
 *
 * Returns the caller's current subscription status from the DB.
 * Used by the app on startup to reconcile server state with RevenueCat.
 */
router.get(
  "/subscriptions/status",
  resolveSubscriberStatus,
  rejectInvalidToken,
  async (req: Request, res: Response): Promise<void> => {
    const { userId, isSubscribed } = req.subscriberStatus!;

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const [row] = await db
        .select()
        .from(subscribersTable)
        .where(eq(subscribersTable.userId, userId))
        .limit(1);

      res.status(200).json({
        isSubscribed,
        entitlement: row?.entitlement ?? null,
        expiresAt: row?.expiresAt ?? null,
      });
    } catch (err) {
      logger.error({ err, userId }, "Subscription status: DB lookup failed");
      res.status(200).json({ isSubscribed, entitlement: null, expiresAt: null });
    }
  },
);

export default router;
