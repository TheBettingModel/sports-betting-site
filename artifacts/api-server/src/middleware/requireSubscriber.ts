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

const JWKS_URL = buildClerkJwksUrl();
const JWKS = JWKS_URL ? createRemoteJWKSet(new URL(JWKS_URL)) : null;

if (JWKS_URL) {
  logger.info({ jwksUrl: JWKS_URL }, "Clerk JWKS configured");
} else {
  logger.warn("CLERK_PUBLISHABLE_KEY not set — JWT verification disabled, all callers treated as non-subscribers");
}

// ---------------------------------------------------------------------------
// JWT verification
// ---------------------------------------------------------------------------

/**
 * Verifies the Clerk JWT and returns the `sub` (user ID) claim.
 * Returns null when the token is missing, malformed, expired, or the
 * signature cannot be verified.
 */
async function verifyClerkJwt(token: string): Promise<string | null> {
  if (!JWKS) return null;

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      // Clerk uses the frontend API URL as the issuer
      issuer: JWKS_URL ? JWKS_URL.replace("/.well-known/jwks.json", "") : undefined,
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch (err) {
    // Expired, bad signature, wrong issuer, etc. — treat as unauthenticated
    logger.debug({ err }, "JWT verification failed");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Resolves subscriber status from the bearer token and attaches it to `req`.
 * Never rejects — on any error the caller is treated as a non-subscriber.
 */
export async function resolveSubscriberStatus(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers["authorization"] ?? "";

  let userId: string | null = null;
  let isSubscribed = false;

  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    userId = await verifyClerkJwt(token);

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

  req.subscriberStatus = { userId, isSubscribed };
  next();
}
