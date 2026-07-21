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
