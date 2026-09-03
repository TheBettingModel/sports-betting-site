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
        return new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
      },
    });
    const response = await client.request("games", { year: 2026, week: 1 });
    expect(authorization).toBe("Bearer private-cfbd-key");
    expect(JSON.stringify(response)).not.toContain("private-cfbd-key");
    expect(response.requestIdentity).toBe("games?week=1&year=2026");
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
      apiKey: "key", fetcher: async () => new Response(JSON.stringify("not-a-payload"), { status: 200 }),
    });
    await expect(client.request("teams")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("reports partial availability safely for object-shaped endpoints", async () => {
    const client = createCollegeFootballDataClient({
      apiKey: "key", fetcher: async () => new Response(JSON.stringify({ updated: true }), { status: 200 }),
    });
    await expect(probeCollegeFootballDataCapability("teams", client)).resolves.toMatchObject({
      provider: "college_football_data", status: "partial", httpStatus: 200, shape: "object",
    });
  });
});