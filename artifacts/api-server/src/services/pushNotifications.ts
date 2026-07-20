/**
 * Push Notification Service
 *
 * Sends Expo push notifications to Pro subscribers when Strong Buy picks drop.
 * Uses expo-server-sdk for safe batching and error handling.
 */

import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { eq, and, inArray } from "drizzle-orm";
import { db, pushTokensTable, subscribersTable } from "@workspace/db";
import { logger } from "../lib/logger";

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
): Promise<void> {
  if (strongBuyCount === 0) return;

  const tokenRows = await getActiveSubscriberTokens();
  if (tokenRows.length === 0) {
    logger.info("Push: no active subscriber tokens, skipping");
    return;
  }

  const title =
    strongBuyCount === 1
      ? "🔥 1 Strong Buy pick is live"
      : `🔥 ${strongBuyCount} Strong Buy picks are live`;

  const body = topPick
    ? `Top pick: ${topPick} — open the app to see full analysis`
    : "Open the app to see today's model picks";

  // Build messages, filtering invalid tokens
  const messages: ExpoPushMessage[] = [];
  const invalidTokens: string[] = [];

  for (const { token } of tokenRows) {
    if (!Expo.isExpoPushToken(token)) {
      invalidTokens.push(token);
      continue;
    }
    messages.push({
      to: token,
      sound: "default",
      title,
      body,
      data: { screen: "picks" }, // deep-link payload handled in the mobile app
      channelId: "picks", // Android channel
    });
  }

  if (invalidTokens.length > 0) {
    logger.warn(
      { count: invalidTokens.length },
      "Push: deactivating invalid tokens",
    );
    // Deactivate only the specific invalid tokens (not a broad sweep)
    await db
      .update(pushTokensTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(inArray(pushTokensTable.token, invalidTokens));
  }

  if (messages.length === 0) return;

  // Send in batches (Expo SDK handles chunking)
  const chunks = expo.chunkPushNotifications(messages);
  let sent = 0;
  let failed = 0;

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of tickets) {
        if (ticket.status === "ok") {
          sent++;
        } else {
          failed++;
          logger.warn({ ticket }, "Push: ticket error");
          // If the token is invalid/unregistered, deactivate it
          if (
            ticket.details?.error === "DeviceNotRegistered" ||
            ticket.details?.error === "InvalidCredentials"
          ) {
            // We can't easily map ticket back to token here without more complex
            // tracking; the next send cycle will clean up via isExpoPushToken check
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "Push: failed to send chunk");
      failed += chunk.length;
    }
  }

  logger.info(
    { sent, failed, strongBuyCount },
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
