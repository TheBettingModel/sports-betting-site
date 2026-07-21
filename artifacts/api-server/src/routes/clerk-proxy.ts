import { Router } from "express";
import type { Request, Response } from "express";

/**
 * Clerk proxy — forwards /api/__clerk/v1/* to Clerk's Frontend API.
 *
 * The mobile app bundle has EXPO_PUBLIC_CLERK_PROXY_URL baked in pointing to
 * this server. Without this proxy, Clerk cannot initialise and the app shows
 * a blank screen.
 *
 * Clerk Frontend API base: derived from the publishable key
 *   pk_test_cmVuZXdpbmctZmlsbHktNDkuY2xlcmsuYWNjb3VudHMuZGV2JA
 *   → renewing-filly-49.clerk.accounts.dev
 */
const CLERK_FRONTEND_API = "https://renewing-filly-49.clerk.accounts.dev";

const router = Router();

router.all("/__clerk/v1/*path", async (req: Request, res: Response) => {
  // Strip /api/__clerk prefix so we forward just /v1/...
  const clerkPath = req.path.replace(/^\/__clerk/, "");
  const targetUrl = `${CLERK_FRONTEND_API}${clerkPath}${req.url.includes("?") ? "?" + req.url.split("?")[1] : ""}`;

  // Forward all headers except host; cookies are critical for session continuity
  const forwardHeaders: Record<string, string> = {};
  const passthroughHeaders = [
    "content-type", "accept", "authorization", "cookie",
    "clerk-api-version", "x-clerk-auth-reason", "x-clerk-auth-status",
    "x-mobile-token", "user-agent", "origin", "referer",
  ];
  for (const h of passthroughHeaders) {
    const v = req.headers[h];
    if (v) forwardHeaders[h] = v as string;
  }
  if (!forwardHeaders["content-type"]) forwardHeaders["content-type"] = "application/json";

  try {
    const body =
      req.method !== "GET" && req.method !== "HEAD"
        ? JSON.stringify(req.body)
        : undefined;

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body,
    });

    const responseBody = await upstream.text();

    res.status(upstream.status);

    // Forward response headers — skip encoding/length headers since we've
    // already decoded the body via fetch (re-encoding mismatch corrupts JSON)
    const skipHeaders = new Set([
      "transfer-encoding", "content-encoding", "content-length",
      "connection", "keep-alive",
    ]);
    for (const [key, value] of upstream.headers.entries()) {
      if (skipHeaders.has(key.toLowerCase())) continue;
      res.setHeader(key, value);
    }

    res.send(responseBody);
  } catch (err: any) {
    res.status(502).json({ error: "Clerk proxy error", detail: err?.message });
  }
});

export default router;
