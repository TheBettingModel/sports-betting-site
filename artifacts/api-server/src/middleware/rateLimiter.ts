import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";

/**
 * General API rate limit — applied to all /api routes.
 * A board fans out across sports and refreshes on resume. A short window
 * permits normal browsing without a fifteen-minute lockout after a burst.
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down and try again later." },
  skip: (req) => req.method === "OPTIONS",
});

/**
 * Access verification must not share the board's request budget. This only
 * isolates transport throttling: the route still verifies identity and the
 * server-owned subscription before granting access.
 */
export const subscriptionStatusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many access checks — please wait a moment and try again." },
});

export const apiLimiter: RequestHandler = (req, res, next) => {
  const isSubscriptionStatus = req.method === "GET"
    && /^\/subscriptions\/status\/?$/i.test(req.path);
  return (isSubscriptionStatus ? subscriptionStatusLimiter : generalLimiter)(req, res, next);
};

/**
 * Strict limit for admin routes — brute-forcing a master key should be
 * practically impossible within a window.
 */
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many admin requests." },
});

/**
 * Extra-strict limit specifically for the session-creation endpoint
 * (POST /api/admin/session). After 10 failed attempts within 15 minutes,
 * further requests are blocked. This makes brute-forcing the master key
 * from a single IP effectively impossible.
 */
export const sessionAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only count failed (non-2xx) attempts
  message: { error: "Too many failed login attempts — please wait 15 minutes before trying again." },
});

/**
 * Auth / Clerk proxy limit — tighter than general to slow down credential
 * stuffing against the sign-in endpoint.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts — please wait and try again." },
});
