import { Router } from "express";
import type { Request, Response } from "express";
import { authLimiter } from "../middleware/rateLimiter";

/**
 * Clerk proxy — forwards /api/__clerk/v1/* to Clerk's Frontend API.
 *
 * The mobile app bundle has EXPO_PUBLIC_CLERK_PROXY_URL baked in pointing to
 * this server. Without this proxy, Clerk cannot initialise and the app shows
 * a blank screen.
 *
 * The target Clerk API URL is derived from the CLERK_PUBLISHABLE_KEY env var
 * so it automatically routes to the dev instance during development and the
 * live instance in production (Replit swaps the key automatically on publish).
 */
function getClerkFrontendApi(): string {
  const key = process.env.CLERK_PUBLISHABLE_KEY ?? "";
  const suffix = key.replace(/^pk_(test|live)_/, "");
  if (suffix) {
    try {
      // Clerk encodes the frontend API domain as base64 in the publishable key
      const decoded = Buffer.from(suffix, "base64").toString("utf-8").replace(/\$+$/, "");
      // Only trust the decoded value if it is a real Clerk API domain
      if (decoded && decoded.includes(".clerk.accounts.")) {
        console.log(`[clerk-proxy] using key-derived API: ${decoded}`);
        return `https://${decoded}`;
      }
    } catch {}
  }
  // Fallback: known-good dev instance (matches the pk_test_ key baked into the bundle)
  console.log("[clerk-proxy] using hardcoded dev API");
  return "https://renewing-filly-49.clerk.accounts.dev";
}

const CLERK_FRONTEND_API = getClerkFrontendApi();

const router = Router();

router.use("/__clerk", authLimiter);

async function proxyToClerk(req: Request, res: Response, targetBase: string) {
  const clerkPath = req.path.replace(/^\/__clerk/, "");
  const targetUrl = `${targetBase}${clerkPath}${req.url.includes("?") ? "?" + req.url.split("?")[1] : ""}`;

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

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
    });

    const skipHeaders = new Set([
      "transfer-encoding", "content-encoding", "content-length",
      "connection", "keep-alive",
    ]);
    res.status(upstream.status);
    for (const [key, value] of upstream.headers.entries()) {
      if (skipHeaders.has(key.toLowerCase())) continue;
      res.setHeader(key, value);
    }

    const buf = await upstream.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (err: any) {
    res.status(502).json({ error: "Clerk proxy error", detail: err?.message });
  }
}

// Forward Clerk JS npm CDN requests (clerk.browser.js, etc.)
router.all("/__clerk/npm/*path", async (req: Request, res: Response) => {
  await proxyToClerk(req, res, CLERK_FRONTEND_API);
});

router.all("/__clerk/v1/*path", async (req: Request, res: Response) => {
  const clerkPath = req.path.replace(/^\/__clerk/, "");
  const targetUrl = `${CLERK_FRONTEND_API}${clerkPath}${req.url.includes("?") ? "?" + req.url.split("?")[1] : ""}`;

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
    // Re-encode the body in the same format the client sent.
    // The Clerk mobile SDK sends form-encoded data for most endpoints (sign_ins,
    // prepare_verification, etc.) — if we re-encode those as JSON the entire
    // JSON string lands as a single unknown parameter name and Clerk rejects with 422.
    let body: string | undefined;
    if (req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined) {
      const ct = ((req.headers["content-type"] as string) ?? "").toLowerCase();
      if (ct.includes("application/x-www-form-urlencoded")) {
        body = new URLSearchParams(req.body as Record<string, string>).toString();
      } else {
        body = JSON.stringify(req.body);
      }
    }

    const upstream = await fetch(targetUrl, { method: req.method, headers: forwardHeaders, body });
    const responseBody = await upstream.text();

    if (upstream.status >= 400) {
      console.error(`[clerk-proxy] ${req.method} ${clerkPath} → ${upstream.status}`, responseBody.slice(0, 1000));
    }

    res.status(upstream.status);
    const skipHeaders = new Set(["transfer-encoding", "content-encoding", "content-length", "connection", "keep-alive"]);
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
