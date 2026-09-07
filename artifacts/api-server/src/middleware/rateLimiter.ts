import rateLimit from "express-rate-limit";

/**
 * General API rate limit — applied to all /api routes.
 * Generous enough for normal use; stops runaway scrapers and retry storms.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down and try again later." },
  skip: (req) => req.method === "OPTIONS",
});

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
