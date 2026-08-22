/**
 * POST /api/webhooks/revenuecat
 *
 * Receives RevenueCat webhook events and upserts subscriber status.
 * Validates the shared secret from the `Authorization: Bearer <secret>` header.
 *
 * RevenueCat webhook docs:
 *   https://www.revenuecat.com/docs/integrations/webhooks
 *
 * The following event types update entitlement status:
 *   INITIAL_PURCHASE, RENEWAL, PRODUCT_CHANGE, BILLING_ISSUE_DETECTED_WITHOUT_GRACE_PERIOD
 *   EXPIRATION, CANCELLATION, SUBSCRIBER_ALIAS
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, subscribersTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const WEBHOOK_SECRET = process.env["REVENUECAT_WEBHOOK_SECRET"] ?? "";

if (!WEBHOOK_SECRET) {
  logger.error(
    "REVENUECAT_WEBHOOK_SECRET is not set — all inbound RevenueCat webhooks will be rejected. " +
      "Set this env var from the RevenueCat dashboard → Project Settings → Integrations → Webhooks.",
  );
}

// RevenueCat sends "Authorization: Bearer <secret>"
function validateSecret(req: Request, res: Response): boolean {
  if (!WEBHOOK_SECRET) {
    // Fail closed: reject every request when the secret is not configured
    res.status(503).json({
      error: "Webhook secret not configured — set REVENUECAT_WEBHOOK_SECRET",
    });
    return false;
  }
  const authHeader = req.headers["authorization"] ?? "";
  const token = (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "").trim();
  if (token !== WEBHOOK_SECRET.trim()) {
    logger.warn({
      tokenLength: token.length,
      secretLength: WEBHOOK_SECRET.trim().length,
    }, "RevenueCat webhook auth failed");
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

/**
 * Events that indicate the user has made a purchase and may hold entitlement.
 * We still require explicit entitlement proof in the payload before marking active.
 */
const PURCHASE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "NON_RENEWING_PURCHASE",
]);

/**
 * Events that explicitly revoke entitlement.
 */
const REVOKE_EVENTS = new Set([
  "EXPIRATION",
  "CANCELLATION",
  "BILLING_ISSUE_DETECTED_WITHOUT_GRACE_PERIOD",
]);

/** The entitlement identifier we gate premium picks on. */
const PRO_ENTITLEMENT = "pro";

router.post("/webhooks/revenuecat", async (req: Request, res: Response): Promise<void> => {
  if (!validateSecret(req, res)) return;

  const body = req.body as Record<string, unknown>;

  // RevenueCat wraps everything in an `event` key
  const event = (body.event ?? body) as Record<string, unknown>;

  const type = event["type"] as string | undefined;
  const appUserId = (event["app_user_id"] ?? event["original_app_user_id"]) as string | undefined;
  const expiresAtMs = event["expiration_at_ms"] as number | null | undefined;
  const entitlements = event["entitlement_ids"] as string[] | null | undefined;

  if (!type || !appUserId) {
    logger.warn({ body }, "RevenueCat webhook missing type or app_user_id");
    // Return 200 so RevenueCat doesn't retry with malformed payloads
    res.status(200).json({ received: true, skipped: true });
    return;
  }

  const isPurchaseEvent = PURCHASE_EVENTS.has(type);
  const isRevokeEvent = REVOKE_EVENTS.has(type);

  if (!isPurchaseEvent && !isRevokeEvent) {
    // SUBSCRIBER_ALIAS and other informational events — no entitlement change
    logger.info({ type, appUserId }, "RevenueCat webhook: informational event (no-op)");
    res.status(200).json({ received: true, skipped: true });
    return;
  }

  const expiresAt = expiresAtMs ? new Date(expiresAtMs) : null;

  if (isRevokeEvent) {
    // Unconditionally mark inactive — the user's subscription has lapsed
    await db
      .insert(subscribersTable)
      .values({
        userId: appUserId,
        entitlement: PRO_ENTITLEMENT,
        isActive: false,
        expiresAt: expiresAt ?? undefined,
      })
      .onConflictDoUpdate({
        target: subscribersTable.userId,
        set: {
          isActive: false,
          expiresAt: expiresAt ?? undefined,
          updatedAt: new Date(),
        },
      });

    logger.info({ type, appUserId, expiresAt }, "RevenueCat webhook: entitlement revoked");
    res.status(200).json({ received: true });
    return;
  }

  // isPurchaseEvent: only grant active status when the payload explicitly
  // lists pro entitlement. A purchase event without entitlement data
  // (e.g. a non-Pro product) should not unlock premium picks.
  const hasProEntitlement =
    Array.isArray(entitlements) && entitlements.includes(PRO_ENTITLEMENT);

  if (!hasProEntitlement) {
    logger.info(
      { type, appUserId, entitlements },
      "RevenueCat webhook: purchase event lacks pro entitlement — no-op",
    );
    res.status(200).json({ received: true, skipped: true });
    return;
  }

  await db
    .insert(subscribersTable)
    .values({
      userId: appUserId,
      entitlement: PRO_ENTITLEMENT,
      isActive: true,
      expiresAt: expiresAt ?? undefined,
    })
    .onConflictDoUpdate({
      target: subscribersTable.userId,
      set: {
        entitlement: PRO_ENTITLEMENT,
        isActive: true,
        expiresAt: expiresAt ?? undefined,
        updatedAt: new Date(),
      },
    });

  logger.info(
    { type, appUserId, expiresAt },
    "RevenueCat webhook: pro entitlement granted",
  );

  res.status(200).json({ received: true });
});

export default router;
