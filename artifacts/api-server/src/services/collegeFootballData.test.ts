import { describe, expect, it } from "vitest";
import {
  CollegeFootballDataError,
  createCollegeFootballDataClient,
  probeCollegeFootballDataCapability,
} from "./collegeFootballData";

describe("CollegeFootballData server transport", () => {
  it("uses bearer auth without exposing the key in returned metadata", async () => {
    let authorization = "";
    const client = createCollegeFootballDataClient({
      apiKey: "private-cfbd-key",
      fetcher: async (_url, init) => {
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return new Response(JSON.stringify([{ id: 1 }]), {
          status: 200, headers: { "content-type": "application/json" },
        });
      },
    });
    const response = await client.request("games", { year: 2026, week: 1 });
    expect(authorization).toBe("Bearer private-cfbd-key");
    expect(JSON.stringify(response)).not.toContain("private-cfbd-key");
    expect(response.requestIdentity).toBe("games?week=1&year=2026");
    expect(response.transport).toMatchObject({
      status: 200, contentType: "json", byteLength: 10, retryCount: 0, failureCategory: null,
    });
  });

  it("returns a typed error for a bounded 429", async () => {
    const client = createCollegeFootballDataClient({
      apiKey: "key", maxAttempts: 1, fetcher: async () => new Response("busy", { status: 429 }),
    });
    await expect(client.request("teams")).rejects.toMatchObject({
      name: CollegeFootballDataError.name, code: "HTTP", httpStatus: 429,
    });
  });

  it("rejects invalid provider JSON shapes", async () => {
    const client = createCollegeFootballDataClient({
      apiKey: "key",
      fetcher: async () => new Response(JSON.stringify("not-a-payload"), {
        status: 200, headers: { "content-type": "application/json" },
      }),
    });
    await expect(client.request("teams")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("reports partial availability safely for object-shaped endpoints", async () => {
    const client = createCollegeFootballDataClient({
      apiKey: "key",
      fetcher: async () => new Response(JSON.stringify({ updated: true }), {
        status: 200, headers: { "content-type": "application/json" },
      }),
    });
    await expect(probeCollegeFootballDataCapability("teams", client)).resolves.toMatchObject({
      provider: "college_football_data", status: "partial", httpStatus: 200, shape: "object",
    });
  });

  it("reads and classifies an HTML upstream response without retaining its body", async () => {
    let calls = 0;
    const client = createCollegeFootballDataClient({
      apiKey: "key", maxAttempts: 2, sleep: async () => undefined, random: () => 0,
      fetcher: async () => {
        calls++;
        return new Response("<html>gateway diagnostic</html>", {
          status: 200, headers: { "content-type": "text/html" },
        });
      },
    });
    await expect(client.request("teams")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      metadata: { status: 200, contentType: "html", byteLength: 31, retryCount: 1, failureCategory: "html_response" },
    });
    expect(calls).toBe(2);
  });

  it("does not retry deterministic 4xx, 204, or content-type mismatch responses", async () => {
    for (const response of [
      new Response("nope", { status: 400 }),
      new Response(null, { status: 204 }),
      new Response('{"items":[]}', { status: 200, headers: { "content-type": "text/plain" } }),
    ]) {
      let calls = 0;
      const client = createCollegeFootballDataClient({
        apiKey: "key", sleep: async () => undefined,
        fetcher: async () => { calls++; return response.clone(); },
      });
      await expect(client.request("teams")).rejects.toBeInstanceOf(CollegeFootballDataError);
      expect(calls).toBe(1);
    }
  });

  it("retries malformed JSON with deterministic exponential jitter", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const client = createCollegeFootballDataClient({
      apiKey: "key", maxAttempts: 3, random: () => 0, sleep: async (ms) => { sleeps.push(ms); },
      fetcher: async () => {
        calls++;
        return calls === 3
          ? new Response("[]", { headers: { "content-type": "application/json" } })
          : new Response('{"cut":', { headers: { "content-type": "application/json" } });
      },
    });
    await expect(client.request("teams")).resolves.toMatchObject({ transport: { retryCount: 2 } });
    expect(sleeps).toEqual([50, 100]);
  });
});