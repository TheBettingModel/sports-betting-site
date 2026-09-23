import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import express, { type Application } from "express";
import request from "supertest";

const { resolve, sendChatMessageNotification, select, insert } = vi.hoisted(() => ({
  resolve: vi.fn(),
  sendChatMessageNotification: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("../middleware/requireSubscriber", () => ({
  resolveSubscriberStatus: resolve,
  isOwnerAccount: (id: string) => id === "owner-one" || id === "owner-two",
  rejectInvalidToken: (req: any, res: any, next: any) => req.subscriberStatus?.tokenRejected ? res.status(401).json({ error: "Invalid or expired token" }) : next(),
  ownerDisplayName: (id: string) => id === "owner-one" || id === "owner-two" ? "TBM" : "Owner",
}));
vi.mock("../services/pushNotifications", () => ({ sendChatMessageNotification }));
vi.mock("@workspace/db", () => ({
  db: { select, insert },
  CHAT_MESSAGE_MAX_LENGTH: 1000,
  chatMessagesTable: { id: "id", authorId: "author", authorDisplayName: "name", body: "body", createdAt: "created" },
  notificationPreferencesTable: { userId: "user", chatNotificationsEnabled: "chat" },
}));

import chatRouter from "./chat";

function dbQuery(rows: unknown[]) {
  const q: any = {};
  q.from = vi.fn(() => q); q.where = vi.fn(() => q); q.orderBy = vi.fn(() => q); q.limit = vi.fn(async () => rows);
  // Drizzle SELECT without limit is awaitable.
  q.then = (resolveThen: any) => Promise.resolve(rows).then(resolveThen);
  return q;
}
function app(): Application {
  const value = express();
  value.use(express.json());
  value.use("/api", chatRouter);
  return value;
}
function status(userId: string | null, isSubscribed = false, isOwner = false, tokenRejected = false) {
  (resolve as Mock).mockImplementation((req, _res, next) => { req.subscriberStatus = { userId, isSubscribed, isOwner, tokenRejected }; next(); });
}
beforeEach(() => {
  vi.clearAllMocks();
  select.mockReturnValue(dbQuery([]));
  insert.mockReturnValue({ values: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 1, body: "hello" }]), onConflictDoUpdate: vi.fn(async () => undefined) })) });
  sendChatMessageNotification.mockResolvedValue(undefined);
});

describe("chat authorization and content boundaries", () => {
  it("rejects unauthenticated and rejected-token access", async () => {
    status(null);
    expect((await request(app()).get("/api/chat/access")).status).toBe(401);
    status(null, false, false, true);
    expect((await request(app()).get("/api/chat/access")).status).toBe(401);
  });
  it("returns free access metadata only and forbids free or lapsed message reads", async () => {
    status("free");
    const access = await request(app()).get("/api/chat/access");
    expect(access.body).toEqual({ canRead: false, canPost: false, isLocked: true, chatNotificationsEnabled: true });
    expect(access.body.messages).toBeUndefined();
    expect((await request(app()).get("/api/chat/messages")).status).toBe(403);
    status("lapsed", false);
    expect((await request(app()).get("/api/chat/messages")).status).toBe(403);
  });
  it("allows active Pro reads but never posting", async () => {
    status("pro", true);
    select.mockReturnValueOnce(dbQuery([{ id: 4, body: "server text" }]));
    expect((await request(app()).get("/api/chat/messages")).status).toBe(200);
    expect((await request(app()).post("/api/chat/messages").send({ body: "nope" })).status).toBe(403);
  });
  it("normalizes historical owner messages to TBM", async () => {
    status("pro", true);
    select.mockReturnValueOnce(dbQuery([
      { id: 4, authorId: "owner-one", authorDisplayName: "Jacques", body: "old message", createdAt: "2026-09-01T00:00:00.000Z" },
      { id: 5, authorId: "subscriber", authorDisplayName: "Subscriber", body: "reply", createdAt: "2026-09-01T00:01:00.000Z" },
    ]));
    const response = await request(app()).get("/api/chat/messages");
    expect(response.body.messages.map((message: any) => message.authorDisplayName)).toEqual(["TBM", "Subscriber"]);
  });
  it.each(["owner-one", "owner-two"])("allows approved owner %s to post and triggers body-free notification", async (owner) => {
    status(owner, true, true);
    expect((await request(app()).post("/api/chat/messages").send({ body: " hello " })).status).toBe(201);
    expect(sendChatMessageNotification).toHaveBeenCalledWith();
  });
  it("rejects non-owners and invalid bodies", async () => {
    status("not-owner", true, false);
    expect((await request(app()).post("/api/chat/messages").send({ body: "hi" })).status).toBe(403);
    status("owner-one", true, true);
    expect((await request(app()).post("/api/chat/messages").send({ body: "   " })).status).toBe(400);
    expect((await request(app()).post("/api/chat/messages").send({ body: "x".repeat(1001) })).status).toBe(400);
  });
  it("keeps the chat preference Pro-only", async () => {
    status("free");
    expect((await request(app()).put("/api/chat/preferences").send({ chatNotificationsEnabled: false })).status).toBe(403);
    status("pro", true);
    expect((await request(app()).put("/api/chat/preferences").send({ chatNotificationsEnabled: false })).body).toEqual({ chatNotificationsEnabled: false });
  });
});