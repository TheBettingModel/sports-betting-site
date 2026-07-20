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
import { createRemoteJWKSet, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db, subscribersTable } from "@workspace/db";
import { logger } from "../lib/logger";

export interface SubscriberStatus {
  userId: string | null;
  isSubscribed: boolean;
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
// Clerk JWKS setup — derived from CLERK_PUBLISHABLE_KEY
// ---------------------------------------------------------------------------

function buildClerkJwksUrl(): string | null {
  const key = process.env["CLERK_PUBLISHABLE_KEY"] ?? process.env["VITE_CLERK_PUBLISHABLE_KEY"] ?? "";
  if (!key) return null;

  // Strip the pk_test_ / pk_live_ prefix, then base64-decode to get the domain
  const b64 = key.replace(/^pk_(test|live)_/, "");
  try {
    const domain = Buffer.from(b64, "base64").toString("utf-8").replace(/\$$/, "");
    return `https://${domain}/.well-known/jwks.json`;
  } catch {
    return null;
  }
}

// Lazy-initialized so tests can mock `jose` before the module resolves the JWKS.
let _jwksUrl: string | null | undefined;
let _jwks: ReturnType<typeof createRemoteJWKSet> | null | undefined;

function getJwks(): { jwksUrl: string | null; jwks: ReturnType<typeof createRemoteJWKSet> | null } {
  if (_jwksUrl === undefined) {
    _jwksUrl = buildClerkJwksUrl();
    _jwks = _jwksUrl ? createRemoteJWKSet(new URL(_jwksUrl)) : null;
    if (_jwksUrl) {
      logger.info({ jwksUrl: _jwksUrl }, "Clerk JWKS configured");
    } else {
      logger.warn("CLERK_PUBLISHABLE_KEY not set — JWT verification disabled, all callers treated as non-subscribers");
    }
  }
  return { jwksUrl: _jwksUrl, jwks: _jwks ?? null };
}

// ---------------------------------------------------------------------------
// JWT verification
// ---------------------------------------------------------------------------

/**
 * Verifies the Clerk JWT and returns the `sub` (user ID) claim, or null when
 * the token is missing, malformed, expired, or has an invalid signature.
 *
 * Also returns a boolean indicating whether verification was *attempted* but
 * failed (as opposed to simply having no token). Callers use this to decide
 * whether to return 401 (bad token supplied) vs. 200 non-subscriber content
 * (no token supplied).
 */
async function verifyClerkJwt(token: string): Promise<{ userId: string | null; rejected: boolean }> {
  const { jwksUrl, jwks } = getJwks();
  if (!jwks) {
    // JWKS not configured — cannot verify. Treat as no token so the app stays
    // usable in dev environments without Clerk keys set.
    return { userId: null, rejected: false };
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      // Clerk uses the frontend API URL as the issuer
      issuer: jwksUrl ? jwksUrl.replace("/.well-known/jwks.json", "") : undefined,
    });
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    return { userId, rejected: userId === null };
  } catch (err) {
    // Expired, bad signature, wrong issuer, etc. — token was present but invalid
    logger.debug({ err }, "JWT verification failed");
    return { userId: null, rejected: true };
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
  let tokenRejected = false;

  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const result = await verifyClerkJwt(token);
    userId = result.userId;
    tokenRejected = result.rejected;

    if (userId) {
      try {
        const [row] = await db
          .select({ isActive: subscribersTable.isActive })
          .from(subscribersTable)
          .where(eq(subscribersTable.userId, userId))
          .limit(1);
        isSubscribed = row?.isActive === true;
      } catch (err) {
        // DB error → treat as non-subscriber; don't block the request
        logger.warn({ err }, "Subscriber lookup failed; treating as non-subscriber");
      }
    }
  }

  req.subscriberStatus = { userId, isSubscribed, tokenRejected };
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
