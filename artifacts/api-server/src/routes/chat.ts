import { Router, type IRouter, type Request, type Response } from "express";
import { asc, eq } from "drizzle-orm";
import { CHAT_MESSAGE_MAX_LENGTH, chatMessagesTable, db, notificationPreferencesTable } from "@workspace/db";
import { isOwnerAccount, ownerDisplayName, rejectInvalidToken, resolveSubscriberStatus } from "../middleware/requireSubscriber";
import { sendChatMessageNotification } from "../services/pushNotifications";

const router: IRouter = Router();
router.use("/chat", resolveSubscriberStatus, rejectInvalidToken);

function requireSignedIn(req: Request, res: Response): string | null {
  const userId = req.subscriberStatus?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return userId;
}

function canUseChat(req: Request): boolean {
  return req.subscriberStatus?.isSubscribed === true || req.subscriberStatus?.isOwner === true;
}

router.get("/chat/access", async (req: Request, res: Response): Promise<void> => {
  const userId = requireSignedIn(req, res);
  if (!userId) return;
  const [preference] = await db
    .select({ chatNotificationsEnabled: notificationPreferencesTable.chatNotificationsEnabled })
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId))
    .limit(1);
  const canRead = canUseChat(req);
  res.json({
    canRead,
    canPost: req.subscriberStatus?.isOwner === true,
    isLocked: !canRead,
    chatNotificationsEnabled: preference?.chatNotificationsEnabled ?? true,
  });
});

router.get("/chat/messages", async (req: Request, res: Response): Promise<void> => {
  if (!requireSignedIn(req, res)) return;
  if (!canUseChat(req)) {
    res.status(403).json({ error: "Pro subscription required for chat" });
    return;
  }
  const messages = await db
    .select({
      id: chatMessagesTable.id,
      authorId: chatMessagesTable.authorId,
      authorDisplayName: chatMessagesTable.authorDisplayName,
      body: chatMessagesTable.body,
      createdAt: chatMessagesTable.createdAt,
    })
    .from(chatMessagesTable)
    .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.id));
  res.json({
    messages: messages.map((message) => ({
      ...message,
      // Normalize historical owner-authored messages to the current brand name
      // without rewriting the immutable message record.
      authorDisplayName: isOwnerAccount(message.authorId) ? "TBM" : message.authorDisplayName,
    })),
  });
});

router.post("/chat/messages", async (req: Request, res: Response): Promise<void> => {
  const userId = requireSignedIn(req, res);
  if (!userId) return;
  if (req.subscriberStatus?.isOwner !== true) {
    res.status(403).json({ error: "Only an owner may post chat messages" });
    return;
  }
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body || body.length > CHAT_MESSAGE_MAX_LENGTH) {
    res.status(400).json({ error: `body must be non-empty and at most ${CHAT_MESSAGE_MAX_LENGTH} characters` });
    return;
  }
  const [message] = await db
    .insert(chatMessagesTable)
    .values({ authorId: userId, authorDisplayName: ownerDisplayName(userId), body })
    .returning();
  // Notification failures must never change a successfully persisted message.
  void sendChatMessageNotification().catch(() => {
    // The notification service logs operational failures; persistence is final.
  });
  res.status(201).json({ message });
});

router.put("/chat/preferences", async (req: Request, res: Response): Promise<void> => {
  const userId = requireSignedIn(req, res);
  if (!userId) return;
  if (!canUseChat(req)) {
    res.status(403).json({ error: "Pro subscription required for chat preferences" });
    return;
  }
  const enabled = req.body?.chatNotificationsEnabled;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "chatNotificationsEnabled must be a boolean" });
    return;
  }
  await db.insert(notificationPreferencesTable).values({ userId, chatNotificationsEnabled: enabled })
    .onConflictDoUpdate({
      target: notificationPreferencesTable.userId,
      set: { chatNotificationsEnabled: enabled, updatedAt: new Date() },
    });
  res.json({ chatNotificationsEnabled: enabled });
});

export default router;