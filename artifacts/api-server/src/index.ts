import app, { markStartupReady } from "./app";
import { logger } from "./lib/logger";
import { runStartupCatchUp, startScheduler } from "./services/scheduler";
import { initJwks } from "./middleware/requireSubscriber";
import { reconcileLegacyPublishedPickEffectiveness } from "./services/publishedPickReconciliation";
import { applyMlbFavoritePriceCapRepair } from "./services/mlbPolicyRevisions";
import { reconcileMlbProductionRegistry } from "./services/modelRegistryReconciliation";
import { ensureEstablishedMoneylineApprovals } from "./services/marketApproval";
import { ensureProductionChampionSnapshots } from "./services/productionChampion";
import { reconcileLegacyNcaafPerformanceEligibility } from "./services/legacyNcaafIntegrity";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateGuardedServingStartup } from "./services/guardedServing/startupValidation";

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
  try {
    await db.execute(sql`
      ALTER TABLE model_weights
      ADD COLUMN IF NOT EXISTS mlb_confidence_recovery_normalized_at TIMESTAMPTZ
    `);
    logger.info("Startup migrations: MLB confidence recovery marker ensured");
  } catch (err) {
    logger.warn({ err }, "Startup migrations: MLB confidence recovery marker failed — non-fatal");
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS forecast_reviews (
        id SERIAL PRIMARY KEY,
        prediction_id INTEGER NOT NULL REFERENCES model_predictions(id),
        game_id TEXT NOT NULL REFERENCES games(id),
        model_version_id INTEGER NOT NULL,
        sport TEXT NOT NULL,
        market TEXT NOT NULL,
        selection TEXT NOT NULL,
        recommendation TEXT NOT NULL,
        confidence TEXT NOT NULL,
        odds INTEGER,
        units REAL NOT NULL,
        model_probability REAL NOT NULL,
        implied_probability REAL,
        fair_probability REAL,
        edge REAL NOT NULL,
        segment TEXT NOT NULL,
        qualification_status TEXT NOT NULL,
        published_pick_id INTEGER,
        is_challenger BOOLEAN NOT NULL,
        feature_snapshot JSONB NOT NULL,
        snapshot_schema_version INTEGER,
        prediction_timestamp TIMESTAMPTZ NOT NULL,
        game_starts_at TIMESTAMPTZ,
        review_version INTEGER NOT NULL DEFAULT 1,
        review_status TEXT NOT NULL,
        exclusion_reason TEXT,
        result TEXT,
        units_won_lost REAL,
        final_score TEXT,
        reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT forecast_reviews_prediction_id_unique UNIQUE (prediction_id)
      )
    `);
    await db.execute(sql`
      ALTER TABLE forecast_reviews
      ADD COLUMN IF NOT EXISTS review_version INTEGER NOT NULL DEFAULT 1
    `);
    // Version 1 inferred start time from the mutable games row. Rebuild only
    // those original v1-derived rows so every retained review uses immutable
    // start evidence without rewriting already-corrected immutable reviews.
    await db.execute(sql`
      UPDATE forecast_reviews
      SET review_version = 1
      WHERE review_version < 2
        AND feature_snapshot->>'gameStartsAt' IS NULL
    `);
    // Version 5 material-pregame revisions were initially omitted from the
    // shared decision-evidence validator. Rebuild only those derived rows so
    // valid revisions enter coverage metrics under the corrected validator.
    await db.execute(sql`
      UPDATE forecast_reviews
      SET review_version = 1
      WHERE review_version < 2
        AND review_status = 'excluded'
        AND exclusion_reason = 'invalid_or_incomplete_snapshot'
        AND feature_snapshot->>'schemaVersion' = '5'
    `);
    await db.execute(sql`DELETE FROM forecast_reviews WHERE review_version < 2`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS forecast_reviews_game_id_idx ON forecast_reviews (game_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS forecast_reviews_sport_market_idx ON forecast_reviews (sport, market)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS forecast_reviews_status_idx ON forecast_reviews (review_status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS forecast_reviews_segment_idx ON forecast_reviews (segment, qualification_status)`);
    logger.info("Startup migrations: forecast review ledger ensured");
  } catch (err) {
    logger.warn({ err }, "Startup migrations: forecast review ledger failed — non-fatal");
  }
}

async function startServer(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    app.listen(port, (err) => {
      if (err) {
        reject(err);
        return;
      }
      logger.info({ port }, "Server listening; startup reconciliation pending");
      resolve();
    });
  }).catch((err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });

  // Production schema changes are applied by Replit's managed publish step.
  // Running DDL here can wait indefinitely on a table lock during a rolling
  // deployment, preventing the server from opening its port before the
  // platform's startup deadline. Keep the idempotent fallback for local
  // development only.
  if (process.env["NODE_ENV"] !== "production") {
    await applyStartupMigrations();
  }
  try {
    await reconcileMlbProductionRegistry();
  } catch (err) {
    logger.error({ err }, "MLB production model registry reconciliation failed");
    process.exit(1);
  }
  try {
    const guardedServing = await validateGuardedServingStartup();
    logger.info({ event: "guarded_serving_startup_validated", ...guardedServing }, "Guarded serving startup validation complete");
  } catch (err) {
    logger.error({ err }, "Guarded serving startup validation failed closed");
    process.exit(1);
  }
  try {
    const approvals = await ensureEstablishedMoneylineApprovals();
    logger.info({ approvals }, "Established moneyline publication approvals reconciled");
  } catch (err) {
    logger.error({ err }, "Established moneyline approval reconciliation failed");
    process.exit(1);
  }
  try {
    const championSnapshots = await ensureProductionChampionSnapshots();
    logger.info(
      { championSnapshots },
      "Production champion configuration snapshots checked",
    );
  } catch (err) {
    logger.error({ err }, "Production champion snapshot reconciliation failed");
    process.exit(1);
  }
  // This data-only reconciliation runs after the managed schema publish and
  // before traffic or schedulers can consume published picks. It makes the
  // new partial uniqueness guarantee deployable against legacy overlaps.
  try {
    await reconcileLegacyPublishedPickEffectiveness();
  } catch (err) {
    logger.error({ err }, "Legacy published-pick reconciliation failed");
    process.exit(1);
  }
  try {
    const classified = await reconcileLegacyNcaafPerformanceEligibility();
    logger.info({ classified }, "Legacy NCAAF performance eligibility reconciled");
  } catch (err) {
    logger.error({ err }, "Legacy NCAAF performance eligibility reconciliation failed");
    process.exit(1);
  }
  try {
    const repair = await applyMlbFavoritePriceCapRepair();
    logger.info(
      {
        revisionKey: repair.revision.revisionKey,
        createdPredictions: repair.createdPredictions,
        effectivePicks: repair.effectivePicks,
        skipped: repair.skipped,
      },
      "MLB favorite-price cap repair completed",
    );
  } catch (err) {
    logger.error({ err }, "MLB favorite-price cap repair failed");
    process.exit(1);
  }

  markStartupReady();
  logger.info({ port }, "Startup reconciliation complete; API ready");

  // Pre-fetch Clerk JWKS once so all subsequent JWT verifications are local
  // (avoids per-request outbound TLS to Clerk which fails intermittently in prod)
  initJwks().catch((err) => logger.warn({ err }, "JWKS init failed"));

  // Start automation scheduler only after startup reconciliation succeeds.
  if (process.env["NODE_ENV"] !== "test"
    && process.env["SCHEDULER_ENABLED"] !== "false") {
    startScheduler();

    // On startup, immediately recover any games that finished while the server
    // was down (stale = non-final status from a past date), then grade pending
    // picks. This ensures restarts after overnight downtime don't leave the
    // Record tab empty until the hourly scheduler fires.
    // Use the scheduler's heavy-job group so startup recovery cannot overlap
    // odds ingestion, hourly grading, or analytics refresh.
    void runStartupCatchUp();
  }
}

void startServer();
