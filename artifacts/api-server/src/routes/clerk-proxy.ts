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

  // Forward safe headers; drop host so Clerk accepts the request
  const forwardHeaders: Record<string, string> = {
    "content-type": req.headers["content-type"] ?? "application/json",
    accept: req.headers["accept"] ?? "application/json",
  };
  if (req.headers["authorization"]) {
    forwardHeaders["authorization"] = req.headers["authorization"] as string;
  }
  if (req.headers["clerk-api-version"]) {
    forwardHeaders["clerk-api-version"] = req.headers["clerk-api-version"] as string;
  }
  if (req.headers["x-clerk-auth-reason"]) {
    forwardHeaders["x-clerk-auth-reason"] = req.headers["x-clerk-auth-reason"] as string;
  }

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

    // Forward status and key headers back to the client
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);

    res.send(responseBody);
  } catch (err: any) {
    res.status(502).json({ error: "Clerk proxy error", detail: err?.message });
  }
});

export default router;
