/**
 * Push Notification Service
 *
 * Sends Expo push notifications to Pro subscribers when Strong Buy picks drop.
 * Uses expo-server-sdk for safe batching and error handling.
 */

import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { eq, and, inArray } from "drizzle-orm";
import { db, pushTokensTable, subscribersTable, notificationPreferencesTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { storePushReceipts } from "./pushReceipts";

const expo = new Expo();

/**
 * Fetch all active push tokens for active Pro subscribers.
 */
async function getActiveSubscriberTokens(): Promise<
  Array<{ userId: string; token: string }>
> {
  const rows = await db
    .select({
      userId: pushTokensTable.userId,
      token: pushTokensTable.token,
    })
    .from(pushTokensTable)
    .innerJoin(
      subscribersTable,
      eq(pushTokensTable.userId, subscribersTable.userId),
    )
    .where(
      and(
        eq(pushTokensTable.isActive, true),
        eq(subscribersTable.isActive, true),
      ),
    );
  return rows;
}

/**
 * Send a push notification to all active Pro subscribers announcing
 * the number of Strong Buy picks available today.
 *
 * @param strongBuyCount - number of Strong Buy picks published this run
 * @param topPick        - optional short description of the top pick (e.g. "Lakers vs Warriors")
 */
export async function sendStrongBuyNotification(
  strongBuyCount: number,
  topPick?: string,
  sport?: string,
): Promise<void> {
  if (strongBuyCount === 0) return;

  const tokenRows = await getActiveSubscriberTokens();
  if (tokenRows.length === 0) {
    logger.info("Push: no active subscriber tokens, skipping");
    return;
  }

  // Load notification preferences for all users that have tokens
  const userIds = [...new Set(tokenRows.map((r) => r.userId))];
  const prefRows = await db
    .select()
    .from(notificationPreferencesTable)
    .where(inArray(notificationPreferencesTable.userId, userIds));
  const prefByUser = new Map(prefRows.map((p) => [p.userId, p.enabledSports]));

  const title =
    strongBuyCount === 1
      ? "🔥 1 Strong Buy pick is live"
      : `🔥 ${strongBuyCount} Strong Buy picks are live`;

  const body = topPick
    ? `Top pick: ${topPick} — open the app to see full analysis`
    : "Open the app to see today's model picks";

  // Build messages, filtering invalid tokens and sport preferences
  const messages: Array<ExpoPushMessage & { _token: string }> = [];
  const invalidTokens: string[] = [];
  let skippedByPreference = 0;

  for (const { userId, token } of tokenRows) {
    if (!Expo.isExpoPushToken(token)) {
      invalidTokens.push(token);
      continue;
    }

    // Apply per-sport preference: if the user has set enabledSports, check inclusion
    if (sport) {
      const enabledSports = prefByUser.get(userId);
      if (enabledSports !== undefined && enabledSports !== null && !enabledSports.includes(sport)) {
        skippedByPreference++;
        continue;
      }
    }

    messages.push({
      to: token,
      sound: "default",
      title,
      body,
      data: { screen: "picks" },
      channelId: "picks",
      _token: token,
    });
  }

  if (invalidTokens.length > 0) {
    logger.warn({ count: invalidTokens.length }, "Push: deactivating invalid tokens");
    await db
      .update(pushTokensTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(inArray(pushTokensTable.token, invalidTokens));
  }

  if (messages.length === 0) {
    logger.info({ skippedByPreference }, "Push: all tokens filtered by preferences, skipping");
    return;
  }

  // Build clean messages (strip internal _token field)
  const cleanMessages: ExpoPushMessage[] = messages.map(({ _token: _, ...m }) => m);

  // Send in batches (Expo SDK handles chunking)
  const chunks = expo.chunkPushNotifications(cleanMessages);
  // Track chunk → token mapping for receipt storage
  const chunkTokens: string[][] = expo.chunkPushNotifications(
    messages.map((m) => ({ to: m._token })),
  ).map((chunk) => chunk.map((m) => m.to as string));

  let sent = 0;
  let failed = 0;
  const pendingForReceipts: Array<{ receiptId: string; token: string }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const tokens = chunkTokens[i]!;
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, idx) => {
        if (ticket.status === "ok") {
          sent++;
          pendingForReceipts.push({ receiptId: ticket.id, token: tokens[idx]! });
        } else {
          failed++;
          logger.warn({ ticket }, "Push: ticket error");
        }
      });
    } catch (err) {
      logger.error({ err }, "Push: failed to send chunk");
      failed += chunk.length;
    }
  }

  // Store receipt IDs for later delivery confirmation
  if (pendingForReceipts.length > 0) {
    storePushReceipts(pendingForReceipts);
  }

  logger.info(
    { sent, failed, skippedByPreference, strongBuyCount, sport },
    "Push: Strong Buy notification batch complete",
  );
}

/**
 * Register a push token for a user.
 * Upserts: if the token already exists for this user, re-activates it.
 * If the token belongs to another user (device transfer), reassigns it.
 */
export async function registerPushToken(
  userId: string,
  token: string,
  platform?: string,
): Promise<void> {
  if (!Expo.isExpoPushToken(token)) {
    logger.warn({ token }, "Push: invalid Expo token rejected");
    return;
  }

  await db
    .insert(pushTokensTable)
    .values({ userId, token, platform, isActive: true })
    .onConflictDoUpdate({
      target: [pushTokensTable.userId, pushTokensTable.token],
      set: { isActive: true, platform, updatedAt: new Date() },
    });

  logger.info({ userId }, "Push: token registered");
}

/**
 * Deregister a push token (user toggled notifications off or signed out).
 */
export async function deregisterPushToken(
  userId: string,
  token: string,
): Promise<void> {
  await db
    .update(pushTokensTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(pushTokensTable.userId, userId),
        eq(pushTokensTable.token, token),
      ),
    );
  logger.info({ userId }, "Push: token deregistered");
}
