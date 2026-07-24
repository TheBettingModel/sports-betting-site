/**
 * Push Notification Service
 *
 * Sends Expo push notifications to Pro subscribers when Strong Buy picks drop.
 * Uses expo-server-sdk for safe batching and error handling.
 */

import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { eq, and, inArray } from "drizzle-orm";
import { db, pushTokensTable, subscribersTable, notificationPreferencesTable, userPreferencesTable } from "@workspace/db";
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
// Tier ordering for minimum tier filtering
const TIER_ORDER: Record<string, number> = {
  Playable: 1,
  "Strong Buy": 2,
  Elite: 3,
};

export async function sendStrongBuyNotification(
  strongBuyCount: number,
  topPick?: string,
  sport?: string,
  tier?: string,
): Promise<void> {
  if (strongBuyCount === 0) return;

  const tokenRows = await getActiveSubscriberTokens();
  if (tokenRows.length === 0) {
    logger.info("Push: no active subscriber tokens, skipping");
    return;
  }

  // Load notification preferences for all users that have tokens
  const userIds = [...new Set(tokenRows.map((r) => r.userId))];
  const [prefRows, userPrefRows] = await Promise.all([
    db
      .select()
      .from(notificationPreferencesTable)
      .where(inArray(notificationPreferencesTable.userId, userIds)),
    db
      .select()
      .from(userPreferencesTable)
      .where(inArray(userPreferencesTable.userId, userIds)),
  ]);
  const prefByUser = new Map(prefRows.map((p) => [p.userId, p.enabledSports]));
  const userPrefByUser = new Map(userPrefRows.map((p) => [p.userId, p]));

  const title =
    strongBuyCount === 1
      ? "🔥 1 Strong Buy pick is live"
      : `🔥 ${strongBuyCount} Strong Buy picks are live`;

  const body = topPick
    ? `Top pick: ${topPick} — open the app to see full analysis`
    : "Open the app to see today's model picks";

  // Build messages, filtering invalid tokens and sport preferences
  const messages: Array<ExpoPushMessage & { _token: string; _userId: string }> = [];
  const invalidTokens: string[] = [];
  let skippedByPreference = 0;

  for (const { userId, token } of tokenRows) {
    if (!Expo.isExpoPushToken(token)) {
      invalidTokens.push(token);
      continue;
    }

    // Apply user_preferences: master switch and tier threshold
    const userPref = userPrefByUser.get(userId);
    if (userPref) {
      // Skip if user has disabled all notifications
      if (!userPref.notifEnabled) {
        skippedByPreference++;
        continue;
      }

      // Skip if pick tier is below the user's minimum tier
      if (tier && userPref.notifMinTier) {
        const pickTierRank = TIER_ORDER[tier] ?? 1;
        const minTierRank = TIER_ORDER[userPref.notifMinTier] ?? 1;
        if (pickTierRank < minTierRank) {
          skippedByPreference++;
          continue;
        }
      }

      // Apply notif_sports from user_preferences (overrides notif prefs table if set)
      if (sport && userPref.notifSports !== null && userPref.notifSports !== undefined) {
        if (!userPref.notifSports.includes(sport)) {
          skippedByPreference++;
          continue;
        }
      }
    }

    // Apply per-sport preference from legacy notification_preferences table
    if (sport && !userPref) {
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
      _userId: userId,
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

  // Build clean messages (strip internal fields)
  const cleanMessages: ExpoPushMessage[] = messages.map(({ _token: _, _userId: __, ...m }) => m);

  // Send in batches (Expo SDK handles chunking)
  const chunks = expo.chunkPushNotifications(cleanMessages);
  // Track chunk → token/userId mapping for receipt storage
  const chunkMeta: Array<{ token: string; userId: string }>[] = expo.chunkPushNotifications(
    messages.map((m) => ({ to: m._token })),
  ).map((_chunk, i) =>
    messages
      .slice(
        i * 100, // Expo max chunk size is 100
        (i + 1) * 100,
      )
      .map((m) => ({ token: m._token, userId: m._userId })),
  );

  let sent = 0;
  let failed = 0;
  const pendingForReceipts: Array<{ receiptId: string; token: string; userId: string }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const meta = chunkMeta[i]!;
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, idx) => {
        if (ticket.status === "ok") {
          sent++;
          pendingForReceipts.push({
            receiptId: ticket.id,
            token: meta[idx]!.token,
            userId: meta[idx]!.userId,
          });
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
    void storePushReceipts(pendingForReceipts);
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
