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
 * We store pending receipt IDs in memory (keyed by receiptId → token) and
 * process them on a delayed schedule. Receipt IDs expire after 24h per Expo's
 * documentation.
 */

import { Expo } from "expo-server-sdk";
import { inArray } from "drizzle-orm";
import { db, pushTokensTable } from "@workspace/db";
import { logger } from "../lib/logger";

const expo = new Expo();

interface PendingReceipt {
  receiptId: string;
  token: string;
  storedAt: Date;
}

// In-memory store of receipt IDs waiting to be checked.
// Entries older than 24h are pruned to avoid unbounded growth.
const pendingReceipts: PendingReceipt[] = [];
const RECEIPT_EXPIRY_MS = 24 * 60 * 60 * 1000;
const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Record receipt IDs returned by a push send so they can be checked later.
 * Call this after every expo.sendPushNotificationsAsync().
 */
export function storePushReceipts(entries: Array<{ receiptId: string; token: string }>): void {
  const now = new Date();
  for (const e of entries) {
    pendingReceipts.push({ ...e, storedAt: now });
  }
}

/**
 * Check all pending receipts that are old enough (>15m) for the delivery
 * status to have been populated by Expo. Deactivates any tokens that
 * returned DeviceNotRegistered.
 *
 * Call this from the scheduler (e.g. during the result-grading or
 * analytics-refresh job) so it runs in the background without blocking.
 */
export async function checkPendingPushReceipts(): Promise<void> {
  const now = Date.now();

  // Prune expired entries (>24h)
  const before = pendingReceipts.length;
  const expired = pendingReceipts.filter(
    (r) => now - r.storedAt.getTime() > RECEIPT_EXPIRY_MS,
  );
  for (const r of expired) {
    pendingReceipts.splice(pendingReceipts.indexOf(r), 1);
  }

  // Only process receipts that are old enough for Expo to have populated them
  const ready = pendingReceipts.filter(
    (r) => now - r.storedAt.getTime() >= RECEIPT_CHECK_DELAY_MS,
  );

  if (ready.length === 0) {
    if (before !== pendingReceipts.length) {
      logger.info({ pruned: before - pendingReceipts.length }, "Push receipts: pruned expired entries");
    }
    return;
  }

  const receiptIdToToken = new Map(ready.map((r) => [r.receiptId, r.token]));
  const receiptIds = [...receiptIdToToken.keys()];

  let checked = 0;
  const tokensToDeactivate: string[] = [];

  try {
    const chunks = expo.chunkPushNotificationReceiptIds(receiptIds);
    for (const chunk of chunks) {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const [id, receipt] of Object.entries(receipts)) {
        checked++;
        if (
          receipt.status === "error" &&
          (receipt.details?.error === "DeviceNotRegistered" ||
            receipt.details?.error === "InvalidCredentials")
        ) {
          const token = receiptIdToToken.get(id);
          if (token) tokensToDeactivate.push(token);
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "Push receipts: failed to fetch receipts — will retry next cycle");
    return; // Don't remove from pending on error — retry next cycle
  }

  // Deactivate bad tokens
  if (tokensToDeactivate.length > 0) {
    await db
      .update(pushTokensTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(inArray(pushTokensTable.token, tokensToDeactivate));

    logger.info({ deactivated: tokensToDeactivate.length }, "Push receipts: deactivated invalid tokens");
  }

  // Remove processed entries from pending list
  const processedIds = new Set(receiptIds);
  for (let i = pendingReceipts.length - 1; i >= 0; i--) {
    if (processedIds.has(pendingReceipts[i]!.receiptId)) {
      pendingReceipts.splice(i, 1);
    }
  }

  logger.info(
    { checked, deactivated: tokensToDeactivate.length, remaining: pendingReceipts.length },
    "Push receipts: check complete",
  );
}
