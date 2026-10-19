import { describe, expect, it, vi } from "vitest";
import { createPreviewProjectionProxy } from "./previewProjectionProxy";

function response() {
  const res = {
    status: vi.fn(), set: vi.fn(), type: vi.fn(), send: vi.fn(), json: vi.fn(),
  };
  for (const fn of Object.values(res)) fn.mockReturnValue(res);
  return res;
}
describe("preview projection forwarding", () => {
  it("preserves JWT, query and live forecasts, without forwarding browser origin", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"fixtures":[],"projections":[{"eventId":"NCAAF-123"}]}',
      { headers: { "content-type": "application/json" } }));
    const proxy = createPreviewProjectionProxy("https://live.example", fetcher);
    const res = response();
    await proxy({ method: "GET", path: "/api/model/v4/projections",
      originalUrl: "/api/model/v4/projections?sport=NCAAF&date=2026-10-03",
      headers: { authorization: "Bearer test-session", origin: "https://preview.example" },
    } as never, res as never, vi.fn());
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://live.example/api/model/v4/projections?sport=NCAAF&date=2026-10-03");
    expect(fetcher.mock.calls[0]?.[1].headers).toEqual({ accept: "application/json", authorization: "Bearer test-session" });
    expect(JSON.parse(res.send.mock.calls[0]?.[0].toString()).projections).toHaveLength(1);
  });
  it("preserves subscription denial rather than using local forecasts", async () => {
    const proxy = createPreviewProjectionProxy("https://live.example",
      vi.fn().mockResolvedValue(new Response('{"error":"Active subscription required"}', { status: 403 })));
    const res = response();
    await proxy({ method: "GET", path: "/api/model/v4/projections",
      originalUrl: "/api/model/v4/projections", headers: {},
    } as never, res as never, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it("fails explicitly on transport errors", async () => {
    const proxy = createPreviewProjectionProxy("https://live.example", vi.fn().mockRejectedValue(new Error("offline")));
    const res = response();
    await proxy({ method: "GET", path: "/api/model/v4/projections",
      originalUrl: "/api/model/v4/projections", headers: {},
    } as never, res as never, vi.fn());
    expect(res.status).toHaveBeenCalledWith(502);
  });
  it("does not forward admin or write requests", async () => {
    const fetcher = vi.fn();
    const proxy = createPreviewProjectionProxy("https://live.example", fetcher);
    const next = vi.fn();
    for (const req of [{ method: "GET", path: "/api/admin/status" },
      { method: "POST", path: "/api/model/v4/projections" }]) {
      await proxy(req as never, response() as never, next);
    }
    expect(next).toHaveBeenCalledTimes(2);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["NFL", "NCAAF", "NBA", "NCAAMB", "MLB", "NHL", "SOCCER", "WNBA"])(
    "forwards %s without sport-specific local database fallbacks", async (sport) => {
      const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        sport, fixtures: [], projections: [],
      }), { headers: { "content-type": "application/json" } }));
      const proxy = createPreviewProjectionProxy("https://live.example", fetcher);
      const res = response();
      await proxy({ method: "GET", path: "/api/model/v4/projections",
        originalUrl: `/api/model/v4/projections?sport=${sport}&date=2026-10-04`, headers: {},
      } as never, res as never, vi.fn());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(JSON.parse(res.send.mock.calls[0]?.[0].toString()).sport).toBe(sport);
    });
  it("forwards Analytics history from the same live source with its subscriber JWT", async () => {
    const board = { date: "2026-10-03", games: [{ gameId: "NFL-123",
      marketHistory: [{ sportsbook: "DraftKings", capturedAt: "2026-10-03T19:00:00Z" }],
      sharpMoneyHistory: [{ sportsbook: "Pinnacle", capturedAt: "2026-10-03T20:00:00Z" }],
    }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(board),
      { headers: { "content-type": "application/json" } }));
    const proxy = createPreviewProjectionProxy("https://live.example", fetcher);
    const res = response();
    await proxy({ method: "GET", path: "/api/games/market-analytics",
      originalUrl: "/api/games/market-analytics?date=2026-10-03",
      headers: { authorization: "Bearer subscriber" },
    } as never, res as never, vi.fn());
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://live.example/api/games/market-analytics?date=2026-10-03");
    expect(JSON.parse(res.send.mock.calls[0]?.[0].toString())).toEqual(board);
    expect(fetcher.mock.calls[0]?.[1].headers.authorization).toBe("Bearer subscriber");
  });
  it.each([
    ["text/html", "<html>wrong server</html>"],
    ["application/json", '{"error":"not a board"}'],
    ["application/json", '{"fixtures":'],
  ])("rejects %s failures instead of returning a false empty slate", async (contentType, body) => {
    const proxy = createPreviewProjectionProxy("https://live.example",
      vi.fn().mockResolvedValue(new Response(body, { headers: { "content-type": contentType } })));
    const res = response();
    await proxy({ method: "GET", path: "/api/model/v4/projections",
      originalUrl: "/api/model/v4/projections", headers: {},
    } as never, res as never, vi.fn());
    expect(res.status).toHaveBeenCalledWith(502);
  });
});