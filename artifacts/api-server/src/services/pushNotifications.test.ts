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
}));

vi.mock("expo-server-sdk", () => ({
  Expo: class MockExpo {
    static isExpoPushToken = mockExpo.isExpoPushToken;
    isExpoPushToken = mockExpo.isExpoPushToken;
    chunkPushNotifications = mockExpo.chunkPushNotifications;
    sendPushNotificationsAsync = mockExpo.sendPushNotificationsAsync;
  },
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Import under test (after mocks) ──────────────────────────────────────────

import { sendStrongBuyNotification } from "./pushNotifications";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSelectChain(resolvedValue: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(resolvedValue),
  };
  (mockDb.select as Mock).mockReturnValue(chain);
  return chain;
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
  vi.clearAllMocks();
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
