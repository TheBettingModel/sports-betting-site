/**
 * Subscriber auth middleware.
 *
 * Reads the Clerk JWT from `Authorization: Bearer <token>`, verifies it
 * using Clerk's JWKS endpoint (full RS256 signature + exp check), then looks
 * up the `sub` (Clerk user ID) in the `subscribers` table to determine
 * whether the caller holds an active "pro" entitlement.
 *
 * The result is attached to `req.subscriberStatus` so downstream route
 * handlers can gate premium data.
 *
 * JWKS URL is derived at startup from the CLERK_PUBLISHABLE_KEY env var:
 *   pk_test_<base64>  →  https://<decoded>/.well-known/jwks.json
 */

import type { Request, Response, NextFunction } from "express";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import { eq } from "drizzle-orm";
import { db, subscribersTable } from "@workspace/db";
import { logger } from "../lib/logger";

export interface SubscriberStatus {
  userId: string | null;
  isSubscribed: boolean;
  isOwner: boolean;
  /**
   * True when a Bearer token was present in the request but failed
   * signature verification (expired, tampered, wrong issuer, etc.).
   * Use this to return 401 on endpoints that require authentication,
   * rather than silently serving non-subscriber content.
   */
  tokenRejected: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      subscriberStatus?: SubscriberStatus;
    }
  }
}

// ---------------------------------------------------------------------------
// Admin user IDs — always treated as Pro subscribers, bypassing the DB check.
// These are the app owner / partner accounts; add new IDs here as needed.
// ---------------------------------------------------------------------------
const OWNER_USER_IDS = new Set([
  "user_3GmXMcCGzqs1c5aD1snP08e7Frx", // Jacques (owner)
  "user_3GyCCHwnYB9sIByophLiunxGtMf", // Partner (jjmaclellan24@gmail.com)
]);
export const OWNER_ACCOUNT_IDS = [...OWNER_USER_IDS];

/** The only server-side owner authorization check. */
export function isOwnerAccount(userId: string | null | undefined): boolean {
  return !!userId && OWNER_USER_IDS.has(userId);
}

export function ownerDisplayName(userId: string): string {
  if (isOwnerAccount(userId)) return "TBM";
  return "Owner";
}

// ---------------------------------------------------------------------------
// Clerk JWKS setup — fetched ONCE at startup, cached locally.
// Replit's production environment has intermittent outbound TLS connectivity,
// so doing a remote JWKS fetch on every request causes frequent 401s.
// We fetch the JWKS JSON once, build a local key set, and verify entirely
// in-process from then on. Keys are refreshed every 6 hours in the background.
// ---------------------------------------------------------------------------

// The mobile app and clerk-proxy both always use the dev Clerk instance
// (renewing-filly-49.clerk.accounts.dev) regardless of what CLERK_PUBLISHABLE_KEY
// is set to in the environment. In production, CLERK_PUBLISHABLE_KEY decodes to a
// Replit-proxy domain (clerk.<app>.replit.app) that doesn't contain ".clerk.accounts.",
// so the clerk-proxy falls back to the hardcoded dev Clerk API — and the mobile app
// has the same dev key baked in as a fallback. This means ALL JWTs are signed by the
// dev Clerk instance. JWKS verification must use the same instance.
//
// Mirror the clerk-proxy logic exactly: only use the decoded domain if it contains
// ".clerk.accounts." — otherwise fall back to the hardcoded dev JWKS URL.
const FALLBACK_JWKS_URL = "https://renewing-filly-49.clerk.accounts.dev/.well-known/jwks.json";

function buildClerkJwksUrl(): string {
  const key = process.env["CLERK_PUBLISHABLE_KEY"] ?? process.env["VITE_CLERK_PUBLISHABLE_KEY"] ?? "";
  if (key) {
    const b64 = key.replace(/^pk_(test|live)_/, "");
    try {
      const domain = Buffer.from(b64, "base64").toString("utf-8").replace(/\$+$/, "");
      // Only trust the decoded domain if it is a real Clerk accounts domain.
      // Replit-managed live keys decode to clerk.<app>.replit.app which is NOT
      // a real Clerk API host — fall through to the hardcoded fallback in that case.
      if (domain && domain.includes(".clerk.accounts.")) {
        return `https://${domain}/.well-known/jwks.json`;
      }
    } catch { /* fall through */ }
  }
  return FALLBACK_JWKS_URL;
}

type LocalJWKS = ReturnType<typeof createLocalJWKSet>;

let _localJwks: LocalJWKS | null = null;
let _jwksUrl: string | null = null;
let _lastFetchedAt = 0;
const JWKS_REFRESH_MS = 6 * 60 * 60 * 1000; // 6 hours

async function fetchAndCacheJwks(): Promise<void> {
  const url = _jwksUrl ?? buildClerkJwksUrl();
  if (!url) return;
  _jwksUrl = url;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`JWKS fetch returned ${res.status}`);
    const json = await res.json() as JSONWebKeySet;
    _localJwks = createLocalJWKSet(json);
    _lastFetchedAt = Date.now();
    logger.info({ jwksUrl: url }, "Clerk JWKS fetched and cached locally");
  } catch (err) {
    logger.warn({ err, jwksUrl: url }, "Clerk JWKS fetch failed — will retry on next request");
  }
}

/**
 * TEST HELPER — directly seeds the JWKS key set used for JWT verification.
 * Only call this from test files; production code should call initJwks() instead.
 */
export function _setLocalJwksForTest(jwks: LocalJWKS | null): void {
  _localJwks = jwks;
}

/** Call once at server startup to warm the JWKS cache. */
export async function initJwks(): Promise<void> {
  const url = buildClerkJwksUrl();
  if (!url) {
    logger.warn("CLERK_PUBLISHABLE_KEY not set — JWT verification disabled");
    return;
  }
  _jwksUrl = url;
  await fetchAndCacheJwks();
}

function getLocalJwks(): LocalJWKS | null {
  // Refresh in background if stale, but don't block the current request
  if (_jwksUrl && Date.now() - _lastFetchedAt > JWKS_REFRESH_MS) {
    fetchAndCacheJwks().catch(() => {/* already logged inside */});
  }
  return _localJwks;
}

// ---------------------------------------------------------------------------
// JWT verification
// ---------------------------------------------------------------------------

/**
 * Verifies the Clerk JWT using the locally cached JWKS key set (no outbound
 * network call per request). Returns the `sub` (user ID) claim on success.
 *
 * `rejected` is true only when a token was present AND its signature/expiry
 * is definitively invalid — callers use this to return 401. Network or cache
 * errors fail open (non-subscriber) rather than hard-rejecting.
 */
async function verifyClerkJwt(token: string): Promise<{ userId: string | null; rejected: boolean }> {
  const jwks = getLocalJwks();
  if (!jwks) {
    // Cache not yet populated (startup fetch failed). Attempt a one-off fetch
    // now, then retry. Fail open so one bad startup doesn't block all users.
    await fetchAndCacheJwks();
    const retried = getLocalJwks();
    if (!retried) return { userId: null, rejected: false };
    return verifyClerkJwt(token);
  }

  try {
    const { payload } = await jwtVerify(token, jwks);
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    return { userId, rejected: userId === null };
  } catch (err) {
    // Distinguish genuine JWT errors (expired, bad signature) from local errors
    const message = err instanceof Error ? err.message : String(err);
    const isJwtError =
      message.includes("expired") ||
      message.includes("signature") ||
      message.includes("invalid") ||
      message.includes("audience") ||
      message.includes("claim");
    if (isJwtError) {
      logger.debug({ err }, "JWT rejected — bad token");
      return { userId: null, rejected: true };
    }
    // Unexpected error (shouldn't happen with local JWKS) — fail open
    logger.warn({ err }, "JWT verification unexpected error — treating as no token");
    return { userId: null, rejected: false };
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Resolves subscriber status from the bearer token and attaches it to `req`.
 * Never rejects — on any error the caller is treated as a non-subscriber.
 *
 * Sets `req.subscriberStatus.tokenRejected = true` when a token was present
 * but failed verification, so downstream handlers can distinguish between
 * "no token" and "bad token" and return 401 for the latter.
 */
export async function resolveSubscriberStatus(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers["authorization"] ?? "";

  let userId: string | null = null;
  let isSubscribed = false;
  let isOwner = false;
  let tokenRejected = false;

  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const result = await verifyClerkJwt(token);
    userId = result.userId;
    tokenRejected = result.rejected;

    if (userId) {
      // Owner accounts always have Pro access — no DB lookup needed.
      if (isOwnerAccount(userId)) {
        isSubscribed = true;
        isOwner = true;
      } else {
        try {
          const [row] = await db
            .select({ isActive: subscribersTable.isActive, expiresAt: subscribersTable.expiresAt })
            .from(subscribersTable)
            .where(eq(subscribersTable.userId, userId))
            .limit(1);

          // Primary check: isActive flag (kept current by RevenueCat webhooks).
          // Secondary check: expiresAt acts as a safety net — if the webhook
          // hasn't fired yet but the subscription window has passed, lock it out.
          const webhookSaysActive = row?.isActive === true;
          const notYetExpired =
            !row?.expiresAt || row.expiresAt.getTime() > Date.now();
          isSubscribed = webhookSaysActive && notYetExpired;

          if (webhookSaysActive && !notYetExpired) {
            logger.info(
              { userId, expiresAt: row?.expiresAt },
              "Subscriber marked active but expiresAt is in the past — treating as lapsed",
            );
          }
        } catch (err) {
          // DB error → treat as non-subscriber; don't block the request
          logger.warn({ err }, "Subscriber lookup failed; treating as non-subscriber");
        }
      } // end else (non-admin)
    }
  }

  req.subscriberStatus = { userId, isSubscribed, isOwner, tokenRejected };
  next();
}

/**
 * Guard middleware: returns 401 when a Bearer token was supplied but failed
 * JWT verification (expired, tampered signature, wrong issuer, etc.).
 *
 * Place this *after* `resolveSubscriberStatus` on any endpoint where an
 * invalid token should be rejected outright rather than silently downgraded
 * to a non-subscriber response.
 *
 * Requests with *no* token pass through — they receive the unauthenticated
 * (non-subscriber) response from the route handler.
 */
export function rejectInvalidToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.subscriberStatus?.tokenRejected) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  next();
}
