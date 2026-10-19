import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const mocks = vi.hoisted(() => ({
  view: vi.fn(), claim: vi.fn(),
  principal: { userId: "free-test-user" as string | null, isSubscribed: false, isOwner: false, tokenRejected: false },
}));
vi.mock("../middleware/requireSubscriber", () => ({
  resolveSubscriberStatus: (req: any, _res: any, next: any) => { req.subscriberStatus = { ...mocks.principal }; next(); },
  rejectInvalidToken: (req: any, res: any, next: any) => req.subscriberStatus.tokenRejected
    ? res.status(401).json({ error: "Invalid token" }) : next(),
}));
vi.mock("../services/projectionPass", () => ({
  getProjectionPassView: mocks.view, claimProjectionPass: mocks.claim,
  ProjectionPassError: class extends Error { constructor(public code: string, message: string) { super(message); } },
}));
import router from "./projection-pass";
import { ProjectionPassError } from "../services/projectionPass";

let server: Server, origin: string;
const emptyView = { serverTime: "2026-10-19T17:00:00Z", canClaim: true, gameId: null,
  claimedAt: null, expiresAt: null, games: [], selectedGame: null, projection: null };
beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(mocks.principal, { userId: "free-test-user", isSubscribed: false, isOwner: false, tokenRejected: false });
  mocks.view.mockResolvedValue(emptyView); mocks.claim.mockResolvedValue(emptyView);
  const app = express(); app.use(express.json());
  app.use((req: any, _res, next) => { req.log = { error: vi.fn() }; next(); });
  app.use(router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address(); origin = `http://127.0.0.1:${typeof address === "object" ? address!.port : 0}`;
});
afterEach(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
const post = (body: unknown) => fetch(origin + "/projection-pass", { method: "POST",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("Projection Pass HTTP boundary (synthetic unit principals)", () => {
  it("requires a real authenticated identity before any service call", async () => {
    mocks.principal.userId = null;
    expect((await fetch(origin + "/projection-pass")).status).toBe(401);
    expect((await post({ gameId: "one", confirm: true })).status).toBe(401);
    expect(mocks.view).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("rejects invalid tokens", async () => {
    mocks.principal.tokenRejected = true;
    expect((await fetch(origin + "/projection-pass")).status).toBe(401);
    expect(mocks.view).not.toHaveBeenCalled();
  });
  it("uses no-store and never turns a fresh access check into a 304", async () => {
    const first = await fetch(origin + "/projection-pass");
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(first.headers.get("vary")).toContain("Authorization");
    const second = await fetch(origin + "/projection-pass", { headers: { "If-None-Match": first.headers.get("etag")! } });
    expect(second.status).toBe(200); expect(mocks.view).toHaveBeenCalledTimes(2);
    expect(mocks.view).toHaveBeenCalledWith("free-test-user");
  });
  it.each([{ gameId: "one" }, { gameId: "one", confirm: false },
    { gameId: "one", confirm: true, userId: "another-account" }, { gameId: "", confirm: true }])("requires explicit confirmation with strict input %j", async body => {
    expect((await post(body)).status).toBe(400); expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("binds the write to the server-verified identity", async () => {
    expect((await post({ gameId: "one", confirm: true })).status).toBe(200);
    expect(mocks.claim).toHaveBeenCalledExactlyOnceWith("free-test-user", "one");
  });
  it("never spends a Pro member's pass", async () => {
    mocks.principal.isSubscribed = true;
    expect((await post({ gameId: "one", confirm: true })).status).toBe(409);
    expect(mocks.claim).not.toHaveBeenCalled();
    const view = await (await fetch(origin + "/projection-pass")).json() as { canClaim: boolean };
    expect(view.canClaim).toBe(false);
  });
  it("returns clear conflicts without exposing another game's data", async () => {
    mocks.claim.mockRejectedValue(new ProjectionPassError("GAME_STARTED", "Game started; your pass was not used."));
    const response = await post({ gameId: "one", confirm: true });
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ code: "GAME_STARTED", error: "Game started; your pass was not used." });
  });
  it("fails closed on database errors and does not expose internals", async () => {
    mocks.view.mockRejectedValue(new Error("private SQL details"));
    const response = await fetch(origin + "/projection-pass");
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private SQL");
  });
});
