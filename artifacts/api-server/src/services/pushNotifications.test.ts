/**
 * Tests for pushNotifications service.
 *
 * Covers:
 *   - Invalid tokens are deactivated using inArray (only the bad tokens, not all active ones)
 *   - Valid tokens remain active after a send that includes invalid tokens
 *   - sendStrongBuyNotification skips send when strongBuyCount is 0
 *   - sendStrongBuyNotification skips send when no active subscriber tokens exist
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

import { sendStrongBuyNotification } from "./pushNotifications";

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
});
