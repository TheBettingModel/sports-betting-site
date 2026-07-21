import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { generalLimiter } from "./middleware/rateLimiter";

const app: Express = express();

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

// Temporary: serve distribution cert for expo.dev setup (remove after upload)
app.get("/dist-cert-tbm", (_req, res) => {
  res.download(path.join(__dirname, "../REMOVED_APPLE_DISTRIBUTION_ARTIFACT"), "REMOVED_APPLE_DISTRIBUTION_ARTIFACT");
});

// Rate limiting — applied before routing so all /api endpoints are covered
app.use("/api", generalLimiter);
app.use("/api", router);

export default app;
