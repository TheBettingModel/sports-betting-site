import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function createTestApp() {
  // Each test gets independent in-memory counters, just like a new process.
  vi.resetModules();
  const { apiLimiter, adminLimiter, sessionAuthLimiter, authLimiter } =
    await import("./rateLimiter");
  const app = express();
  app.use("/api", apiLimiter);
  app.get("/api/board", (_req, res) => res.json({ ok: true }));
  app.get("/api/subscriptions/status", (req, res) => {
    if (req.headers.authorization !== "Bearer test-viewer") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({ isPro: false });
  });
  app.post("/api/subscriptions/status", (_req, res) => res.sendStatus(405));
  app.post("/api/admin-test", adminLimiter, (_req, res) => res.sendStatus(401));
  app.post("/api/session-test", sessionAuthLimiter, (_req, res) => res.sendStatus(401));
  app.post("/api/auth-test", authLimiter, (_req, res) => res.sendStatus(401));
  return app;
}

describe("API rate-limit budget isolation", () => {
  beforeEach(() => vi.useRealTimers());

  it("keeps access verification available after board traffic reaches its limit", async () => {
    const app = await createTestApp();
    for (let i = 0; i < 120; i++) {
      expect((await request(app).get("/api/board")).status).toBe(200);
    }
    expect((await request(app).get("/api/board")).status).toBe(429);
    const status = await request(app).get("/api/subscriptions/status")
      .set("Authorization", "Bearer test-viewer");
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ isPro: false });
    const denied = await request(app).get("/api/subscriptions/status");
    expect(denied.status).toBe(401);
  });

  it("bounds access checks independently and returns a retry delay", async () => {
    const app = await createTestApp();
    for (let i = 0; i < 30; i++) {
      const response = await request(app).get("/api/subscriptions/status")
        .set("Authorization", "Bearer test-viewer");
      expect(response.status).toBe(200);
    }
    const blocked = await request(app).get("/api/subscriptions/status/");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(Number(blocked.headers["retry-after"])).toBeLessThanOrEqual(60);
    expect((await request(app).get("/api/board")).status).toBe(200);
  });

  it("does not count query strings, casing, or trailing slashes as different status budgets", async () => {
    const app = await createTestApp();
    for (let i = 0; i < 30; i++) {
      await request(app).get("/api/subscriptions/status?refresh=" + i);
    }
    expect((await request(app).get("/api/Subscriptions/Status/")).status).toBe(429);
    expect((await request(app).post("/api/subscriptions/status")).status).toBe(405);
  });

  it("ignores preflight requests without spending the browsing budget", async () => {
    const app = await createTestApp();
    for (let i = 0; i < 125; i++) await request(app).options("/api/board");
    expect((await request(app).get("/api/board")).status).toBe(200);
  });

  it.each([
    ["/api/admin-test", 30],
    ["/api/session-test", 10],
    ["/api/auth-test", 40],
  ])("preserves the stricter %s budget", async (path, limit) => {
    const app = await createTestApp();
    for (let i = 0; i < limit; i++) {
      expect((await request(app).post(path)).status).toBe(401);
    }
    expect((await request(app).post(path)).status).toBe(429);
  });
});
