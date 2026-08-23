import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./services/scheduler";
import { initJwks } from "./middleware/requireSubscriber";
import { recoverStaleGames, syncGameResults, runGrading } from "./services/grading-runner";
import { runLearning } from "./services/learning";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

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

/**
 * Apply any pending schema additions that are safe to run idempotently at
 * startup. Uses ADD COLUMN IF NOT EXISTS so running against an already-migrated
 * database is a no-op. This ensures production DBs pick up new nullable columns
 * without a separate migration step.
 */
async function applyStartupMigrations(): Promise<void> {
  try {
    await db.execute(
      sql`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS last_delivery_status TEXT`,
    );
    logger.info("Startup migrations: push_tokens.last_delivery_status ensured");
  } catch (err) {
    logger.warn({ err }, "Startup migrations: push_tokens column check failed — non-fatal");
  }
  try {
    await db.execute(sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS home_starter_hand TEXT`);
    await db.execute(sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS away_starter_hand TEXT`);
    logger.info("Startup migrations: games starter hand columns ensured");
  } catch (err) {
    logger.warn({ err }, "Startup migrations: games starter hand columns failed — non-fatal");
  }
  try {
    await db.execute(sql`
      ALTER TABLE pick_results
      ADD COLUMN IF NOT EXISTS learning_review JSONB,
      ADD COLUMN IF NOT EXISTS learning_processed_at TIMESTAMP
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS pick_results_learning_unprocessed_idx
      ON pick_results (result, graded_at)
      WHERE learning_processed_at IS NULL
    `);
    logger.info("Startup migrations: pick-results learning review fields ensured");
  } catch (err) {
    logger.warn({ err }, "Startup migrations: pick-results learning fields failed — non-fatal");
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Ensure schema additions are present (idempotent — safe on every restart)
  applyStartupMigrations().catch((err) =>
    logger.warn({ err }, "Startup migrations failed — continuing"),
  );

  // Pre-fetch Clerk JWKS once so all subsequent JWT verifications are local
  // (avoids per-request outbound TLS to Clerk which fails intermittently in prod)
  initJwks().catch((err) => logger.warn({ err }, "JWKS init failed"));

  // Start automation scheduler after server is up
  if (process.env["NODE_ENV"] !== "test") {
    startScheduler();

    // On startup, immediately recover any games that finished while the server
    // was down (stale = non-final status from a past date), then grade pending
    // picks. This ensures restarts after overnight downtime don't leave the
    // Record tab empty until the hourly scheduler fires.
    void (async () => {
      try {
        await recoverStaleGames();
        await syncGameResults();
        const graded = await runGrading();
        // Grading establishes the immutable result. Learning only consumes
        // those already-graded rows and is idempotent per pick result.
        await runLearning();
        if (graded > 0) {
          logger.info({ graded }, "Startup: graded picks from stale games");
        }
      } catch (err) {
        logger.warn({ err }, "Startup: catch-up grading failed — non-fatal");
      }
    })();
  }
});
