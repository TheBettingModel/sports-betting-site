import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { generalLimiter } from "./middleware/rateLimiter";

const app: Express = express();
let startupReady = false;

export function markStartupReady(): void {
  startupReady = true;
}

// Trust the Replit reverse proxy so IP-based rate limiting works correctly.
app.set("trust proxy", 1);

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
app.use(cors());
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

// Temporary: serve distribution cert for expo.dev setup (remove after upload)
app.get("/dist-cert-tbm", (_req, res) => {
  res.download(path.join(__dirname, "../REMOVED_APPLE_DISTRIBUTION_ARTIFACT"), "REMOVED_APPLE_DISTRIBUTION_ARTIFACT");
});
app.get("/dist-profile-tbm", (_req, res) => {
  res.download(path.join(__dirname, "../REMOVED_APPLE_PROVISIONING_ARTIFACT"), "TheBettingModel.mobileprovision");
});

// Rate limiting — applied before routing so all /api endpoints are covered
app.use("/api", generalLimiter);
app.use("/api", router);

export default app;
