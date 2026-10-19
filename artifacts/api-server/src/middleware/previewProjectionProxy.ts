import type { RequestHandler } from "express";

const projectionPaths = new Set([
  "/api/model/v4/projections",
  "/api/model/ncaaf/v4/projections",
  "/api/games/market-analytics",
]);

/** Development preview only, including Analytics market evidence. Preserve the subscriber JWT and let the live
 * server enforce entitlement; never substitute an empty workspace history. */
export function createPreviewProjectionProxy(
  upstream: string,
  fetchImpl: typeof fetch = fetch,
): RequestHandler {
  const origin = new URL(upstream);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Preview projection upstream must be an HTTPS origin");
  }
  return async (req, res, next) => {
    if (req.method !== "GET" || !projectionPaths.has(req.path)) {
      next();
      return;
    }
    try {
      const response = await fetchImpl(`${origin.origin}${req.originalUrl}`, {
        headers: {
          accept: "application/json",
          ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
        },
        redirect: "manual",
        signal: AbortSignal.timeout(45_000),
      });
      const body = Buffer.from(await response.arrayBuffer());
      if (response.ok) {
        if (!response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("Projection upstream did not return JSON");
        }
        const board = JSON.parse(body.toString());
        const fullSlate = req.path === "/api/model/v4/projections";
        const analytics = req.path === "/api/games/market-analytics";
        if (fullSlate && (!Array.isArray(board.fixtures) || !Array.isArray(board.projections))
          || analytics && !Array.isArray(board.games)
          || !fullSlate && !analytics && !Array.isArray(board.board)) {
          throw new Error("Projection upstream did not return a board");
        }
        req.log?.info({
          sport: board.sport, date: board.date,
          fixtures: board.fixtures?.length, projections: board.projections?.length,
          forecastedEvents: board.coverage?.forecastedEvents,
          marketGames: board.games?.length,
          publicObservations: board.games?.reduce((sum: number, game: { marketHistory: unknown[] }) =>
            sum + game.marketHistory.length, 0),
          sharpObservations: board.games?.reduce((sum: number, game: { sharpMoneyHistory: unknown[] }) =>
            sum + game.sharpMoneyHistory.length, 0),
          unavailable: board.fixtures?.filter((fixture: { availability: string }) =>
            fixture.availability === "UNAVAILABLE").map((fixture: {
              gameId: string; unavailableReason: string | null; eventStatus: string;
            }) => ({ gameId: fixture.gameId, reason: fixture.unavailableReason, status: fixture.eventStatus })),
        }, "Live projection response forwarded to development preview");
      }
      // Browser origin is intentionally not forwarded. This is a server-to-
      // server request, not an entitlement or authentication bypass.
      res.status(response.status);
      res.set("Cache-Control", "private, no-store");
      res.set("Vary", "Authorization");
      res.type(response.headers.get("content-type") ?? "application/json");
      res.send(body);
    } catch {
      res.status(502).json({ error: "Live projection API is unavailable. Please retry." });
    }
  };
}