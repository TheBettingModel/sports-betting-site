import { afterEach, describe, expect, it, vi } from "vitest";
import { getWnbaTeamStats } from "./teamStats";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WNBA modeled-date season isolation", () => {
  it("requests and caches historical seasons independently", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/schedule")) {
        return new Response(JSON.stringify({ events: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        results: { stats: { categories: [] } },
      }), { status: 200 });
    }));

    const prior = await getWnbaTeamStats("20", "2025-07-10");
    const current = await getWnbaTeamStats("20", "2026-07-10");
    const callsBeforeCachedRead = urls.length;
    const priorCached = await getWnbaTeamStats("20", "2025-07-10");

    expect(prior?.evidence?.sourceSeason).toBe(2025);
    expect(current?.evidence?.sourceSeason).toBe(2026);
    expect(priorCached?.evidence?.sourceSeason).toBe(2025);
    expect(urls.length).toBe(callsBeforeCachedRead);
    expect(urls.some((url) => url.includes("season=2025"))).toBe(true);
    expect(urls.some((url) => url.includes("season=2026"))).toBe(true);
  });
});