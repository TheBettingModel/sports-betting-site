import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const status = vi.hoisted(() => ({ value: { userId: null as string | null, isSubscribed: false, isOwner: false, tokenRejected: false } }));
vi.mock("../middleware/requireSubscriber", () => ({
  resolveSubscriberStatus: (req: any, _res: any, next: any) => { req.subscriberStatus = status.value; next(); },
  rejectInvalidToken: (req: any, res: any, next: any) => req.subscriberStatus.tokenRejected ? res.status(401).json({ error: "Invalid or expired token" }) : next(),
}));
vi.mock("../services/ncaafV4GameDay", () => ({ getNcaafV4ProjectionBoard: vi.fn(async () => ({
  date: "2026-09-06", generatedAt: "2026-09-06T12:00:00.000Z", evidencePersistence: "response-only",
  model: { id: "tbm-ncaaf-v4-expected-score", modelStatus: "V4_PREVIEW", approvalStatus: "UNVALIDATED", publicationStatus: "PREVIEW_ONLY", configurationHash: "a", parameterHash: "b" }, board: [], exclusions: [], audit: {},
})) }));
import router from "./ncaaf-v4";
const app = () => { const value = express(); value.use("/api", router); return value; };

describe("NCAAF V4 preview authorization", () => {
  it("returns 401 for no authenticated user or a rejected token", async () => {
    status.value = { userId: null, isSubscribed: false, isOwner: false, tokenRejected: false };
    expect((await request(app()).get("/api/model/ncaaf/v4/projections")).status).toBe(401);
    status.value = { userId: null, isSubscribed: false, isOwner: false, tokenRejected: true };
    expect((await request(app()).get("/api/model/ncaaf/v4/projections")).status).toBe(401);
  });
  it("returns 403 for a signed-in inactive subscriber and permits owner/subscriber", async () => {
    status.value = { userId: "user", isSubscribed: false, isOwner: false, tokenRejected: false };
    expect((await request(app()).get("/api/model/ncaaf/v4/projections")).status).toBe(403);
    status.value = { userId: "user", isSubscribed: true, isOwner: false, tokenRejected: false };
    expect((await request(app()).get("/api/model/ncaaf/v4/projections?date=2026-09-06")).status).toBe(200);
    status.value = { userId: "owner", isSubscribed: false, isOwner: true, tokenRejected: false };
    expect((await request(app()).get("/api/model/ncaaf/v4/projections")).status).toBe(200);
  });
});