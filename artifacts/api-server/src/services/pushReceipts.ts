/**
 * Expo Push Receipt Checker
 *
 * Expo's push delivery is a two-phase flow:
 *   1. sendPushNotificationsAsync → returns tickets (immediate, pre-delivery)
 *   2. getPushNotificationReceiptsAsync → returns receipts (post-delivery, ~minutes later)
 *
 * Receipts with status="error" and details.error="DeviceNotRegistered" mean
 * the device token is permanently invalid and should be deactivated so we stop
 * sending to it on every subsequent batch.
 *
 * Receipt IDs are persisted to the push_receipts table so they survive server
 * restarts and are processed exactly once. Rows older than 24 h are considered
 * expired and skipped (Expo's receipts TTL is 24 h).
 */

import { Expo } from "expo-server-sdk";
import { eq, and, inArray, lt, gte } from "drizzle-orm";
import { db, pushTokensTable, pushReceiptsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const expo = new Expo();

const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000; // 15 minutes — Expo needs time to populate
const RECEIPT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours — Expo's stated TTL

/**
 * Persist receipt IDs returned by a push send so they can be checked later.
 * Call this after every expo.sendPushNotificationsAsync().
 *
 * @param entries - Array of { receiptId, token, userId } from the Expo tickets
 */
export async function storePushReceipts(
  entries: Array<{ receiptId: string; token: string; userId?: string }>,
): Promise<void> {
  if (entries.length === 0) return;

  try {
    await db.insert(pushReceiptsTable).values(
      entries.map((e) => ({
        receiptId: e.receiptId,
        userId: e.userId ?? "unknown",
        token: e.token,
        checked: false,
        sentAt: new Date(),
      })),
    ).onConflictDoNothing(); // receipt_id unique — ignore duplicate sends
    logger.debug({ count: entries.length }, "Push receipts: stored pending receipts");
  } catch (err) {
    logger.warn({ err }, "Push receipts: failed to persist receipt IDs — will not retry");
  }
}

/**
 * Check all unchecked receipts that are old enough (>15 min) for Expo to have
 * populated their delivery status. Deactivates tokens that returned
 * DeviceNotRegistered and marks all checked rows in the DB.
 *
 * Skips receipts older than 24 h (expired per Expo's TTL) — marks them checked
 * with status="expired" so they are not retried.
 *
 * Safe to call from multiple scheduled jobs; rows are processed idempotently.
 */
export async function checkPendingPushReceipts(): Promise<void> {
  const now = new Date();
  const cutoffReady = new Date(now.getTime() - RECEIPT_CHECK_DELAY_MS);
  const cutoffExpiry = new Date(now.getTime() - RECEIPT_EXPIRY_MS);

  // Mark expired rows so they are not retried
  const expired = await db
    .update(pushReceiptsTable)
    .set({ checked: true, status: "expired", checkedAt: now })
    .where(
      and(
        eq(pushReceiptsTable.checked, false),
        lt(pushReceiptsTable.sentAt, cutoffExpiry),
      ),
    )
    .returning({ id: pushReceiptsTable.id });

  if (expired.length > 0) {
    logger.info({ count: expired.length }, "Push receipts: marked expired rows");
  }

  // Fetch unchecked rows that are old enough to have been populated by Expo
  const pending = await db
    .select({
      id: pushReceiptsTable.id,
      receiptId: pushReceiptsTable.receiptId,
      token: pushReceiptsTable.token,
    })
    .from(pushReceiptsTable)
    .where(
      and(
        eq(pushReceiptsTable.checked, false),
        lt(pushReceiptsTable.sentAt, cutoffReady),
        gte(pushReceiptsTable.sentAt, cutoffExpiry),
      ),
    )
    .limit(500); // process at most 500 at a time to avoid oversized Expo requests

  if (pending.length === 0) {
    return;
  }

  logger.info({ count: pending.length }, "Push receipts: checking delivery status");

  const receiptIdToRow = new Map(pending.map((r) => [r.receiptId, r]));
  const receiptIds = [...receiptIdToRow.keys()];

  const tokensToDeactivate: string[] = [];
  const updates: Array<{
    id: number;
    status: string;
    errorDetails?: Record<string, unknown>;
  }> = [];

  try {
    const chunks = expo.chunkPushNotificationReceiptIds(receiptIds);
    for (const chunk of chunks) {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const [receiptId, receipt] of Object.entries(receipts)) {
        const row = receiptIdToRow.get(receiptId);
        if (!row) continue;

        if (receipt.status === "ok") {
          updates.push({ id: row.id, status: "ok" });
        } else if (receipt.status === "error") {
          const errorCode = (receipt.details as Record<string, unknown> | undefined)?.error as string | undefined;
          const errorDetails = receipt.details as Record<string, unknown> | undefined;

          updates.push({ id: row.id, status: "error", errorDetails: errorDetails ?? {} });

          if (errorCode === "DeviceNotRegistered" || errorCode === "InvalidCredentials") {
            tokensToDeactivate.push(row.token);
          } else if (errorCode === "MessageTooBig") {
            logger.warn({ receiptId, token: row.token }, "Push receipts: MessageTooBig — reduce payload size");
          } else if (errorCode === "MessageRateExceeded") {
            logger.warn({ receiptId, token: row.token }, "Push receipts: MessageRateExceeded — slow send rate");
          } else {
            logger.warn({ receiptId, errorCode, errorDetails }, "Push receipts: unhandled error code");
          }
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "Push receipts: failed to fetch from Expo — will retry next cycle");
    return; // Don't mark as checked on error — retry next cycle
  }

  // Build a token → delivery status map for ALL receipt outcomes so every
  // token gets an accurate last_delivery_status regardless of error type.
  const tokenDeliveryStatus = new Map<string, string>();
  for (const update of updates) {
    const row = pending.find((p) => p.id === update.id);
    if (!row) continue;
    if (update.status === "ok") {
      tokenDeliveryStatus.set(row.token, "ok");
    } else {
      const errorCode =
        (update.errorDetails as Record<string, unknown> | undefined)?.error as string | undefined;
      tokenDeliveryStatus.set(row.token, errorCode ?? "unknown");
    }
  }

  // Deactivate tokens with permanent errors
  if (tokensToDeactivate.length > 0) {
    for (const token of tokensToDeactivate) {
      const status = tokenDeliveryStatus.get(token) ?? "DeviceNotRegistered";
      await db
        .update(pushTokensTable)
        .set({ isActive: false, lastDeliveryStatus: status, updatedAt: new Date() })
        .where(eq(pushTokensTable.token, token));
    }
    logger.info({ deactivated: tokensToDeactivate.length }, "Push receipts: deactivated invalid tokens");
  }

  // Update last_delivery_status for ALL other tokens (ok, MessageTooBig, MessageRateExceeded, etc.)
  const deactivatedSet = new Set(tokensToDeactivate);
  const remainingStatusEntries = [...tokenDeliveryStatus.entries()].filter(
    ([token]) => !deactivatedSet.has(token),
  );

  for (const [token, status] of remainingStatusEntries) {
    await db
      .update(pushTokensTable)
      .set({ lastDeliveryStatus: status, updatedAt: new Date() })
      .where(eq(pushTokensTable.token, token));
  }

  // Mark processed rows as checked in the DB
  if (updates.length > 0) {
    const checkedAt = new Date();
    for (const update of updates) {
      await db
        .update(pushReceiptsTable)
        .set({
          checked: true,
          status: update.status,
          errorDetails: update.errorDetails ?? null,
          checkedAt,
        })
        .where(eq(pushReceiptsTable.id, update.id));
    }
  }

  logger.info(
    {
      checked: updates.length,
      deactivated: tokensToDeactivate.length,
      remaining: pending.length - updates.length,
    },
    "Push receipts: check complete",
  );
}
