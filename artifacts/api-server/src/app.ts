import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { generalLimiter } from "./middleware/rateLimiter";
import { bootstrapTask241V4Engines } from "./services/v4EngineBootstrap241";

const app: Express = express();
let startupReady = false;
bootstrapTask241V4Engines();

function configuredOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set((env["CORS_ALLOWED_ORIGINS"] ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean));
}

export function markStartupReady(): void {
  startupReady = true;
}

// One trusted reverse-proxy hop works for Render/Vercel and Replit preview.
app.set("trust proxy", Number(process.env["TRUST_PROXY_HOPS"] ?? 1));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  next();
});
const allowedOrigins = configuredOrigins();
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)
      || (process.env["NODE_ENV"] !== "production"
        && (/^https?:\/\/localhost(?::\d+)?$/.test(origin)
          || /^https:\/\/[a-z0-9-]+\.replit\.dev$/i.test(origin)))) {
      callback(null, true);
      return;
    }
    callback(new Error("CORS_ORIGIN_REJECTED"));
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Bind the production port before database reconciliation so the artifact
// supervisor does not kill a healthy process while it waits on production
// locks. Only the platform health endpoint is available until startup is
// complete; all user-facing API traffic remains fail-closed.
app.use("/api", (req, res, next) => {
  if (req.path === "/healthz" || startupReady) {
    next();
    return;
  }
  res.status(503).json({
    error: "Service temporarily unavailable",
    code: "STARTUP_IN_PROGRESS",
  });
});

// Rate limiting — applied before routing so all /api endpoints are covered
app.use("/api", generalLimiter);
app.use("/api", router);

export default app;
