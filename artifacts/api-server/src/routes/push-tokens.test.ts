/**
 * Tests for POST/DELETE /api/push-tokens route auth.
 *
 * Verifies that:
 *   - Requests without a valid Clerk JWT receive 401
 *   - Requests with a valid JWT and missing token body receive 400
 *   - Requests with a valid JWT and a token body succeed (200)
 *   - The same shared resolveSubscriberStatus middleware used by the rest of
 *     the API is what gates these routes (no separate JWT logic)
 *   - A user whose subscription is currently inactive can still register a
 *     token (registration only requires auth, not an active subscription)
 *   - Once the subscription is active and a token is registered, notifications
 *     will be directed to that token (covered via service-layer tests)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import express, { type Application } from "express";
import request from "supertest";

// ── Hoisted mock state ────────────────────────────────────────────────────────

const { mockResolveSubscriberStatus, mockRegisterPushToken, mockDeregisterPushToken } =
  vi.hoisted(() => ({
    mockResolveSubscriberStatus: vi.fn(),
    mockRegisterPushToken: vi.fn(),
    mockDeregisterPushToken: vi.fn(),
  }));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../middleware/requireSubscriber", () => ({
  resolveSubscriberStatus: mockResolveSubscriberStatus,
}));

vi.mock("../services/pushNotifications", () => ({
  registerPushToken: mockRegisterPushToken,
  deregisterPushToken: mockDeregisterPushToken,
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Import under test (after mocks) ──────────────────────────────────────────

import pushTokensRouter from "./push-tokens";

// ── Test helpers ──────────────────────────────────────────────────────────────

function buildApp(): Application {
  const app = express();
  app.use(express.json());
  app.use("/api", pushTokensRouter);
  return app;
}

/** Simulate resolveSubscriberStatus setting userId (authenticated, active subscriber) */
function withAuth(userId: string) {
  (mockResolveSubscriberStatus as Mock).mockImplementation((_req, _res, next) => {
    _req.subscriberStatus = { userId, isSubscribed: true };
    next();
  });
}

/** Simulate resolveSubscriberStatus for an authenticated user with an inactive subscription */
function withAuthInactiveSub(userId: string) {
  (mockResolveSubscriberStatus as Mock).mockImplementation((_req, _res, next) => {
    _req.subscriberStatus = { userId, isSubscribed: false };
    next();
  });
}

/** Simulate resolveSubscriberStatus setting userId=null (unauthenticated) */
function withNoAuth() {
  (mockResolveSubscriberStatus as Mock).mockImplementation((_req, _res, next) => {
    _req.subscriberStatus = { userId: null, isSubscribed: false };
    next();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockRegisterPushToken.mockResolvedValue(undefined);
  mockDeregisterPushToken.mockResolvedValue(undefined);
});

describe("POST /api/push-tokens", () => {
  it("returns 401 when JWT is missing or invalid", async () => {
    withNoAuth();
    const app = buildApp();
    const res = await request(app)
      .post("/api/push-tokens")
      .send({ token: "ExponentPushToken[abc]" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when token body is missing", async () => {
    withAuth("user-123");
    const app = buildApp();
    const res = await request(app).post("/api/push-tokens").send({});
    expect(res.status).toBe(400);
  });

  it("registers token and returns 200 when authenticated with valid body", async () => {
    withAuth("user-123");
    const app = buildApp();
    const res = await request(app)
      .post("/api/push-tokens")
      .send({ token: "ExponentPushToken[abc]", platform: "ios" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockRegisterPushToken).toHaveBeenCalledWith(
      "user-123",
      "ExponentPushToken[abc]",
      "ios",
    );
  });

  it("uses the shared resolveSubscriberStatus middleware (not a separate verifier)", async () => {
    withAuth("user-456");
    const app = buildApp();
    await request(app)
      .post("/api/push-tokens")
      .send({ token: "ExponentPushToken[xyz]" });
    // The shared middleware must have been called
    expect(mockResolveSubscriberStatus).toHaveBeenCalledTimes(1);
  });

  it("registers a token for a user with an inactive subscription (registration requires auth, not active sub)", async () => {
    // A user whose subscription has lapsed can still register their device token.
    // The route only checks for a valid userId from the JWT — not whether their
    // subscription is currently active.  Notification delivery is gated separately
    // at send time via the SQL join on subscribersTable.isActive=true.
    withAuthInactiveSub("lapsed-user");
    const app = buildApp();
    const res = await request(app)
      .post("/api/push-tokens")
      .send({ token: "ExponentPushToken[lapsed-device]", platform: "android" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockRegisterPushToken).toHaveBeenCalledWith(
      "lapsed-user",
      "ExponentPushToken[lapsed-device]",
      "android",
    );
  });

  it("registers a new token after app re-install for an active subscriber", async () => {
    // Simulates: subscriber uninstalls and reinstalls the app.
    // They get a new Expo push token on fresh install and call POST /api/push-tokens.
    // The route must pass the new token to registerPushToken, which upserts it.
    withAuth("returning-user");
    const app = buildApp();
    const res = await request(app)
      .post("/api/push-tokens")
      .send({ token: "ExponentPushToken[fresh-install]", platform: "ios" });

    expect(res.status).toBe(200);
    expect(mockRegisterPushToken).toHaveBeenCalledWith(
      "returning-user",
      "ExponentPushToken[fresh-install]",
      "ios",
    );
  });

  it("returns 500 when registerPushToken throws", async () => {
    withAuth("user-err");
    mockRegisterPushToken.mockRejectedValue(new Error("DB error"));
    const app = buildApp();
    const res = await request(app)
      .post("/api/push-tokens")
      .send({ token: "ExponentPushToken[abc]" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to register token" });
  });
});

describe("DELETE /api/push-tokens", () => {
  it("returns 401 when unauthenticated", async () => {
    withNoAuth();
    const app = buildApp();
    const res = await request(app)
      .delete("/api/push-tokens")
      .send({ token: "ExponentPushToken[abc]" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when token is missing", async () => {
    withAuth("user-123");
    const app = buildApp();
    const res = await request(app).delete("/api/push-tokens").send({});
    expect(res.status).toBe(400);
  });

  it("deregisters token and returns 200 when authenticated", async () => {
    withAuth("user-123");
    const app = buildApp();
    const res = await request(app)
      .delete("/api/push-tokens")
      .send({ token: "ExponentPushToken[abc]" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockDeregisterPushToken).toHaveBeenCalledWith(
      "user-123",
      "ExponentPushToken[abc]",
    );
  });

  it("returns 500 when deregisterPushToken throws", async () => {
    withAuth("user-err");
    mockDeregisterPushToken.mockRejectedValue(new Error("DB error"));
    const app = buildApp();
    const res = await request(app)
      .delete("/api/push-tokens")
      .send({ token: "ExponentPushToken[abc]" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to deregister token" });
  });
});
