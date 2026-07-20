/**
 * Unit tests for requireSubscriber middleware.
 *
 * Verifies that:
 *   - A request with no token gets userId=null, isSubscribed=false, tokenRejected=false
 *   - A request with an invalid/expired token gets userId=null, tokenRejected=true
 *   - A request with a valid token gets the userId from the JWT sub claim
 *   - rejectInvalidToken returns 401 when tokenRejected is true
 *   - rejectInvalidToken passes through when tokenRejected is false
 *   - rejectInvalidToken passes through when there is no token (no subscriberStatus set
 *     for tokenRejected)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import express, { type Application, type Request, type Response } from "express";
import request from "supertest";

// ── Hoisted mock state ────────────────────────────────────────────────────────

const { mockJwtVerify, mockCreateRemoteJWKSet, mockDbSelect } = vi.hoisted(() => {
  // Provide a valid-format Clerk publishable key so buildClerkJwksUrl() returns
  // a non-null URL and the JWKS path is exercised in tests.
  // Format: pk_test_<base64(domain + "$")>
  // base64("clerk.test.example.com$") = "Y2xlcmsubGVzdC5leGFtcGxlLmNvbSQ="
  const fakeB64 = Buffer.from("clerk.test.example.com$").toString("base64");
  process.env["CLERK_PUBLISHABLE_KEY"] = `pk_test_${fakeB64}`;

  return {
    mockJwtVerify: vi.fn(),
    mockCreateRemoteJWKSet: vi.fn(),
    mockDbSelect: vi.fn(),
  };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("jose", () => ({
  jwtVerify: mockJwtVerify,
  createRemoteJWKSet: mockCreateRemoteJWKSet,
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
  },
  subscribersTable: { userId: "userId", isActive: "isActive" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, _val) => ({ col: _col, val: _val })),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Import under test (after mocks) ──────────────────────────────────────────

import { resolveSubscriberStatus, rejectInvalidToken } from "./requireSubscriber";

// ── Test helpers ──────────────────────────────────────────────────────────────

function buildApp(extraMiddleware?: express.RequestHandler): Application {
  const app = express();
  app.use(express.json());
  app.get("/test", resolveSubscriberStatus, ...(extraMiddleware ? [extraMiddleware] : []), (req: Request, res: Response) => {
    res.json(req.subscriberStatus ?? {});
  });
  return app;
}

function buildGuardApp(): Application {
  const app = express();
  app.use(express.json());
  app.get("/test", resolveSubscriberStatus, rejectInvalidToken, (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
  return app;
}

/** Make the DB select chain resolve with the given rows */
function mockDb(rows: Array<{ isActive: boolean }>) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: JWKS set is a no-op object (truthy so verification is attempted)
  mockCreateRemoteJWKSet.mockReturnValue({});
  // Default: DB returns no subscriber row
  mockDb([]);
});

describe("resolveSubscriberStatus", () => {
  it("sets tokenRejected=false and userId=null when no Authorization header is present", async () => {
    const res = await request(buildApp()).get("/test");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: null,
      isSubscribed: false,
      tokenRejected: false,
    });
  });

  it("sets tokenRejected=true when the JWT signature is invalid", async () => {
    mockJwtVerify.mockRejectedValue(new Error("JWTSignatureVerificationFailed"));

    const res = await request(buildApp())
      .get("/test")
      .set("Authorization", "Bearer tampered.jwt.token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: null,
      isSubscribed: false,
      tokenRejected: true,
    });
  });

  it("sets tokenRejected=true when the JWT is expired", async () => {
    mockJwtVerify.mockRejectedValue(new Error("JWTExpired"));

    const res = await request(buildApp())
      .get("/test")
      .set("Authorization", "Bearer expired.jwt.token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: null,
      isSubscribed: false,
      tokenRejected: true,
    });
  });

  it("sets userId from the sub claim and isSubscribed=true for a valid token with active subscription", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: "user_abc123" } });
    mockDb([{ isActive: true }]);

    const res = await request(buildApp())
      .get("/test")
      .set("Authorization", "Bearer valid.jwt.token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: "user_abc123",
      isSubscribed: true,
      tokenRejected: false,
    });
  });

  it("sets userId but isSubscribed=false for a valid token with no active subscription", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: "user_free" } });
    mockDb([{ isActive: false }]);

    const res = await request(buildApp())
      .get("/test")
      .set("Authorization", "Bearer valid.jwt.token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: "user_free",
      isSubscribed: false,
      tokenRejected: false,
    });
  });

  it("sets userId but isSubscribed=false for a valid token when subscriber row is missing", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: "user_new" } });
    mockDb([]);

    const res = await request(buildApp())
      .get("/test")
      .set("Authorization", "Bearer valid.jwt.token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: "user_new",
      isSubscribed: false,
      tokenRejected: false,
    });
  });
});

describe("rejectInvalidToken", () => {
  it("returns 401 when a tampered token was rejected", async () => {
    mockJwtVerify.mockRejectedValue(new Error("JWTSignatureVerificationFailed"));

    const res = await request(buildGuardApp())
      .get("/test")
      .set("Authorization", "Bearer tampered.jwt.token");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Invalid") });
  });

  it("returns 401 when an expired token was rejected", async () => {
    mockJwtVerify.mockRejectedValue(new Error("JWTExpired"));

    const res = await request(buildGuardApp())
      .get("/test")
      .set("Authorization", "Bearer expired.jwt.token");

    expect(res.status).toBe(401);
  });

  it("passes through when no token is present (unauthenticated request)", async () => {
    const res = await request(buildGuardApp()).get("/test");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it("passes through when a valid token is verified", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: "user_valid" } });
    mockDb([{ isActive: true }]);

    const res = await request(buildGuardApp())
      .get("/test")
      .set("Authorization", "Bearer valid.jwt.token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});
