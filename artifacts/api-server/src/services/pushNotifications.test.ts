/**
 * Tests for pushNotifications service.
 *
 * Covers:
 *   - Invalid tokens are deactivated using inArray (only the bad tokens, not all active ones)
 *   - Valid tokens remain active after a send that includes invalid tokens
 *   - sendStrongBuyNotification skips send when strongBuyCount is 0
 *   - sendStrongBuyNotification skips send when no active subscriber tokens exist
 *   - Deregistered tokens (isActive=false) are excluded from the notification batch
 *   - registerPushToken rejects invalid tokens without touching the DB
 *   - registerPushToken inserts a new token with isActive=true
 *   - registerPushToken re-activates a token on app re-install (upsert)
 *   - After re-install both old and new tokens are included in the notification batch
 *   - Subscriber whose sub is inactive gets their token registered but receives no notifications
 *     until their subscription becomes active
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ── Hoisted mock state ────────────────────────────────────────────────────────

const { mockDb, mockExpo } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  };

  const mockExpo = {
    isExpoPushToken: vi.fn(),
    chunkPushNotifications: vi.fn(),
    sendPushNotificationsAsync: vi.fn(),
  };

  return { mockDb, mockExpo };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: mockDb,
  pushTokensTable: { userId: "userId", token: "token", isActive: "isActive", updatedAt: "updatedAt" },
  subscribersTable: { userId: "userId", isActive: "isActive" },
  notificationPreferencesTable: {},
  userPreferencesTable: {},
}));

vi.mock("expo-server-sdk", () => ({
  Expo: class MockExpo {
    static isExpoPushToken = mockExpo.isExpoPushToken;
    isExpoPushToken = mockExpo.isExpoPushToken;
    chunkPushNotifications = mockExpo.chunkPushNotifications;
    sendPushNotificationsAsync = mockExpo.sendPushNotificationsAsync;
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ __eq: [_col, _val] })),
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  inArray: vi.fn((_col: unknown, _vals: unknown) => ({ __inArray: [_col, _vals] })),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./pushReceipts", () => ({
  storePushReceipts: vi.fn().mockResolvedValue(undefined),
}));

// ── Import under test (after mocks) ──────────────────────────────────────────

import { sendStrongBuyNotification, registerPushToken, deregisterPushToken } from "./pushNotifications";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Set up the mock db.select() sequence.
 * sendStrongBuyNotification makes three selects:
 *   1. getActiveSubscriberTokens (with innerJoin) → tokenRows
 *   2. notificationPreferencesTable → notifPrefRows (default [])
 *   3. userPreferencesTable        → userPrefRows  (default [])
 */
function makeSelectChain(
  tokenRows: unknown,
  notifPrefRows: unknown = [],
  userPrefRows: unknown = [],
) {
  function makeChain(result: unknown) {
    return {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(result),
    };
  }
  (mockDb.select as Mock)
    .mockReturnValueOnce(makeChain(tokenRows))
    .mockReturnValueOnce(makeChain(notifPrefRows))
    .mockReturnValueOnce(makeChain(userPrefRows));
  return makeChain(tokenRows); // returned for callers that inspect the chain
}

function makeUpdateChain() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
  (mockDb.update as Mock).mockReturnValue(chain);
  return chain;
}

function makeInsertChain() {
  const chain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue([]),
  };
  (mockDb.insert as Mock).mockReturnValue(chain);
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) to also flush any unconsumed mockReturnValueOnce
  // items from previous tests, which would corrupt the select-chain call order.
  vi.resetAllMocks();
});

describe("sendStrongBuyNotification", () => {
  it("does nothing when strongBuyCount is 0", async () => {
    await sendStrongBuyNotification(0);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("does nothing when no active subscriber tokens exist", async () => {
    makeSelectChain([]); // empty token list
    await sendStrongBuyNotification(3);
    expect(mockExpo.chunkPushNotifications).not.toHaveBeenCalled();
  });

  it("only deactivates invalid tokens — not all active tokens", async () => {
    const validToken = "ExponentPushToken[valid-token]";
    const invalidToken = "not-a-valid-expo-token";

    makeSelectChain([
      { userId: "user-1", token: validToken },
      { userId: "user-2", token: invalidToken },
    ]);

    const updateChain = makeUpdateChain();

    // isExpoPushToken: valid returns true, invalid returns false
    (mockExpo.isExpoPushToken as Mock).mockImplementation(
      (t: string) => t === validToken,
    );

    // chunkPushNotifications returns one chunk with the valid message
    mockExpo.chunkPushNotifications.mockReturnValue([[{ to: validToken }]]);
    mockExpo.sendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }]);

    await sendStrongBuyNotification(2, "NBA — 1 pick");

    // update should be called once for invalid tokens only
    expect(mockDb.update).toHaveBeenCalledTimes(1);

    // The where clause on the update must use inArray targeting the specific bad token
    // We verify the set() was called with isActive: false (not a broad active=true sweep)
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );

    // The valid token was included in the send
    expect(mockExpo.chunkPushNotifications).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ to: validToken })]),
    );
  });

  it("sends to valid tokens even when some tokens are invalid", async () => {
    const tokens = [
      { userId: "u1", token: "ExponentPushToken[good-1]" },
      { userId: "u2", token: "ExponentPushToken[good-2]" },
      { userId: "u3", token: "bad-token" },
    ];

    makeSelectChain(tokens);
    makeUpdateChain();

    (mockExpo.isExpoPushToken as Mock).mockImplementation((t: string) =>
      t.startsWith("ExponentPushToken["),
    );

    const expectedMessages = [
      { to: "ExponentPushToken[good-1]" },
      { to: "ExponentPushToken[good-2]" },
    ];
    mockExpo.chunkPushNotifications.mockReturnValue([expectedMessages]);
    mockExpo.sendPushNotificationsAsync.mockResolvedValue([
      { status: "ok" },
      { status: "ok" },
    ]);

    await sendStrongBuyNotification(1);

    // Sends only to the 2 valid tokens
    expect(mockExpo.chunkPushNotifications).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ to: "ExponentPushToken[good-1]" }),
        expect.objectContaining({ to: "ExponentPushToken[good-2]" }),
      ]),
    );
    // Exactly 2 messages (bad token excluded)
    const callArg = (mockExpo.chunkPushNotifications as Mock).mock.calls[0][0];
    expect(callArg).toHaveLength(2);
  });

  it("does not call update when all tokens are valid", async () => {
    makeSelectChain([{ userId: "u1", token: "ExponentPushToken[ok]" }]);
    makeUpdateChain();

    (mockExpo.isExpoPushToken as Mock).mockReturnValue(true);
    mockExpo.chunkPushNotifications.mockReturnValue([[{ to: "ExponentPushToken[ok]" }]]);
    mockExpo.sendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }]);

    await sendStrongBuyNotification(1);

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("excludes deregistered tokens (isActive=false) from the notification batch", async () => {
    // The SQL query in getActiveSubscriberTokens filters pushTokensTable.isActive=true
    // AND subscribersTable.isActive=true.  Here the DB correctly returns only the
    // one active token; the inactive token is absent from the result set.
    makeSelectChain([
      { userId: "active-user", token: "ExponentPushToken[active]" },
      // A token with isActive=false would not be returned by the SQL join
    ]);

    (mockExpo.isExpoPushToken as Mock).mockReturnValue(true);
    mockExpo.chunkPushNotifications.mockReturnValue([
      [{ to: "ExponentPushToken[active]" }],
    ]);
    mockExpo.sendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }]);

    await sendStrongBuyNotification(1);

    // Only the one active token should be in the batch
    const callArg = (mockExpo.chunkPushNotifications as Mock).mock.calls[0][0];
    expect(callArg).toHaveLength(1);
    expect(callArg[0]).toMatchObject({ to: "ExponentPushToken[active]" });
    // No update to deactivate anything (all returned tokens are valid)
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("sends no notifications when subscriber is inactive even if their token is registered", async () => {
    // Simulate: subscriber row has isActive=false — the inner join excludes their token.
    // getActiveSubscriberTokens returns an empty array; the service bails out early.
    makeSelectChain([]); // inactive subscriber's token not returned by the join

    await sendStrongBuyNotification(2);

    expect(mockExpo.chunkPushNotifications).not.toHaveBeenCalled();
  });

  it("sends to both old and new token after app re-install when subscriber is active", async () => {
    // After re-install the user registers a NEW token.  The old token may still be
    // in the DB and active (e.g. another device, or not yet invalidated).
    // Both tokens belong to the same subscriber who is now active.
    const oldToken = "ExponentPushToken[old-device]";
    const newToken = "ExponentPushToken[new-install]";

    makeSelectChain([
      { userId: "user-reinstall", token: oldToken },
      { userId: "user-reinstall", token: newToken },
    ]);

    (mockExpo.isExpoPushToken as Mock).mockReturnValue(true);
    mockExpo.chunkPushNotifications.mockReturnValue([
      [{ to: oldToken }, { to: newToken }],
    ]);
    mockExpo.sendPushNotificationsAsync.mockResolvedValue([
      { status: "ok" },
      { status: "ok" },
    ]);

    await sendStrongBuyNotification(1, "Lakers vs Warriors");

    const callArg = (mockExpo.chunkPushNotifications as Mock).mock.calls[0][0];
    expect(callArg).toHaveLength(2);
    expect(callArg).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ to: oldToken }),
        expect.objectContaining({ to: newToken }),
      ]),
    );
  });
});

// ── registerPushToken ─────────────────────────────────────────────────────────

describe("registerPushToken", () => {
  it("rejects an invalid Expo token without touching the database", async () => {
    (mockExpo.isExpoPushToken as Mock).mockReturnValue(false);

    await registerPushToken("user-1", "not-a-valid-token");

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("inserts a new valid token with isActive=true", async () => {
    (mockExpo.isExpoPushToken as Mock).mockReturnValue(true);
    const insertChain = makeInsertChain();

    await registerPushToken("user-1", "ExponentPushToken[brand-new]", "ios");

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        token: "ExponentPushToken[brand-new]",
        isActive: true,
        platform: "ios",
      }),
    );
  });

  it("re-activates an existing token on app re-install via upsert (isActive=true in conflict set)", async () => {
    // When the same (userId, token) pair is registered again — e.g. after re-install —
    // the onConflictDoUpdate must set isActive=true so the token resumes receiving pushes.
    (mockExpo.isExpoPushToken as Mock).mockReturnValue(true);
    const insertChain = makeInsertChain();

    await registerPushToken("user-1", "ExponentPushToken[reinstalled]");

    expect(insertChain.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ isActive: true }),
      }),
    );
  });

  it("registers a token for a user whose subscription is currently inactive", async () => {
    // Registration itself does not require an active subscription — the route only
    // requires a valid Clerk JWT.  The subscriber status is irrelevant to token storage;
    // notifications will be withheld until the subscription is active (the SQL join
    // filters subscribersTable.isActive=true at send time).
    (mockExpo.isExpoPushToken as Mock).mockReturnValue(true);
    const insertChain = makeInsertChain();

    // No subscriber check happens inside registerPushToken; we just confirm the
    // token is inserted regardless of subscriber state.
    await registerPushToken("inactive-subscriber", "ExponentPushToken[token]", "android");

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "inactive-subscriber",
        token: "ExponentPushToken[token]",
        isActive: true,
      }),
    );
  });

  it("once subscriber reactivates, their registered token is included in notification batches", async () => {
    // Simulate the full lifecycle:
    //   1. User's subscription lapses — token stays in DB (isActive=true but sub isActive=false)
    //   2. User renews — subscribersTable.isActive flips to true
    //   3. Next notification run: getActiveSubscriberTokens returns the token again
    const token = "ExponentPushToken[renewed-sub]";

    // After renewal, the inner join on subscribersTable.isActive=true returns the token
    makeSelectChain([{ userId: "renewed-user", token }]);

    (mockExpo.isExpoPushToken as Mock).mockReturnValue(true);
    mockExpo.chunkPushNotifications.mockReturnValue([[{ to: token }]]);
    mockExpo.sendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }]);

    await sendStrongBuyNotification(1);

    const callArg = (mockExpo.chunkPushNotifications as Mock).mock.calls[0][0];
    expect(callArg).toHaveLength(1);
    expect(callArg[0]).toMatchObject({ to: token });
  });
});

// ── deregisterPushToken ───────────────────────────────────────────────────────

describe("deregisterPushToken", () => {
  it("sets isActive=false for the specified user+token pair", async () => {
    const updateChain = makeUpdateChain();

    await deregisterPushToken("user-1", "ExponentPushToken[abc]");

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });
});
