import { describe, expect, it } from "vitest";
import * as net from "node:net";
import * as http from "node:http";
import * as https from "node:https";
import * as dns from "node:dns";
import * as child from "node:child_process";
import { db } from "@workspace/db";
import { fetchSportGamesByDate } from "../../src/services/espn";
import { assertSafeImport, expectedBlock, state } from "./guard.mjs";

describe("NFL offline execution boundary", () => {
  it("has no inherited connection strings, credentials, or production flags", () => {
    expect(Object.keys(process.env).filter(k =>
      /(?:DATABASE|PGHOST|PGUSER|PGPASSWORD|PGPORT|PGDATABASE|SECRET|TOKEN|API_KEY|CLERK|REVENUECAT|TBM_PREVIEW)/i.test(k),
    )).toEqual([]);
    expect(process.env.NODE_ENV).toBe("test");
    expect(process.env.SCHEDULER_ENABLED).toBe("false");
    expect(state.installed).toBe(true);
  });

  it.each([
    ["fetch", () => fetch("https://example.invalid")],
    ["HTTP", () => http.get("http://example.invalid")],
    ["HTTPS", () => https.get("https://example.invalid")],
    ["TCP", () => net.connect({ port: 5432 })],
    ["DNS", () => dns.lookup("example.invalid", () => {})],
    ["server startup", () => net.createServer().listen(0)],
    ["subprocess", () => child.execFile("node", ["--version"], () => {})],
    ["database", () => db.select()],
    ["ESPN", () => fetchSportGamesByDate("NFL", "20260914")],
  ])("rejects %s before any I/O", (_name, attempt) => {
    expect(() => expectedBlock(attempt)).toThrow("NFL_OFFLINE_BLOCKED:");
    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0].expected).toBe(true);
  });

  it.each([
    "/workspace/src/index.ts",
    "/workspace/src/app.ts",
    "/workspace/src/services/scheduler.ts",
    "/workspace/src/services/grading-runner.ts",
    "/workspace/src/services/nflV4Prospective.ts",
    "/workspace/src/services/v4FullSlate.ts",
    "/workspace/src/middleware/previewProjectionProxy.ts",
    "/workspace/scripts/run-cloud-pipeline-once.ts",
    "pg",
    "postgres",
    "node-cron",
  ])("rejects forbidden module %s", source => {
    expect(() => assertSafeImport(source)).toThrow("NFL_OFFLINE_FORBIDDEN_IMPORT");
  });

  it("actually aliases the database and provider before NFL imports", async () => {
    const { createNflV4Engine } = await import("../../src/services/nflV4");
    const artifact = (await import("../../../../model-artifacts/v4/nfl-v4-core.json")).default;
    const engine = createNflV4Engine(artifact);
    await expectedBlock(async () => {
      // collectEvidence is forbidden even though pure prediction is allowed.
      await expect(engine.collectEvidence("offline-only", new Date())).rejects.toThrow("NFL_OFFLINE_BLOCKED:database.query");
    });
  });
});
