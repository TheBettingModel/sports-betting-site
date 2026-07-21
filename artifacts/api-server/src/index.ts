import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./services/scheduler";
import { initJwks } from "./middleware/requireSubscriber";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Pre-fetch Clerk JWKS once so all subsequent JWT verifications are local
  // (avoids per-request outbound TLS to Clerk which fails intermittently in prod)
  initJwks().catch((err) => logger.warn({ err }, "JWKS init failed"));

  // Start automation scheduler after server is up
  if (process.env["NODE_ENV"] !== "test") {
    startScheduler();
  }
});
