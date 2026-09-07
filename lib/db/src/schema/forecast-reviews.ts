import { pgTable, serial, text, integer, real, boolean, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { modelPredictionsTable } from "./model-predictions";
import { gamesTable } from "./games";

/**
 * Immutable outcome ledger for every completed model prediction.
 *
 * This is intentionally separate from pick_results: forecast-only outcomes
 * are useful for calibration and policy coverage, but must never become
 * subscriber-pick learning inputs.
 */
export const forecastReviewsTable = pgTable(
  "forecast_reviews",
  {
    id: serial("id").primaryKey(),
    predictionId: integer("prediction_id").notNull().references(() => modelPredictionsTable.id),
    gameId: text("game_id").notNull().references(() => gamesTable.id),
    modelVersionId: integer("model_version_id").notNull(),

    sport: text("sport").notNull(),
    market: text("market").notNull(),
    selection: text("selection").notNull(),
    recommendation: text("recommendation").notNull(),
    confidence: text("confidence").notNull(),
    odds: integer("odds"),
    units: real("units").notNull(),
    modelProbability: real("model_probability").notNull(),
    impliedProbability: real("implied_probability"),
    fairProbability: real("fair_probability"),
    edge: real("edge").notNull(),

    // "published" means public to subscribers. Private Neutral/Fade rows are
    // deliberately classified as forecast_only for policy coverage reporting.
    segment: text("segment").notNull(), // published | forecast_only
    qualificationStatus: text("qualification_status").notNull(), // qualified | passed
    publishedPickId: integer("published_pick_id"),
    isChallenger: boolean("is_challenger").notNull(),

    // The exact pregame evidence is copied into this immutable review row.
    featureSnapshot: jsonb("feature_snapshot").notNull(),
    snapshotSchemaVersion: integer("snapshot_schema_version"),
    predictionTimestamp: timestamp("prediction_timestamp", { withTimezone: true }).notNull(),
    gameStartsAt: timestamp("game_starts_at", { withTimezone: true }),

    // Bump when review eligibility semantics change. Derived legacy rows can be
    // safely rebuilt without touching prediction, pick, or learning records.
    reviewVersion: integer("review_version").notNull().default(2),

    // excluded rows document why a completed prediction was not eligible for
    // outcome metrics without inventing a result from later data.
    reviewStatus: text("review_status").notNull(), // graded | excluded
    exclusionReason: text("exclusion_reason"),
    result: text("result"), // win | loss | push | void | postponed
    unitsWonLost: real("units_won_lost"),
    finalScore: text("final_score"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("forecast_reviews_prediction_id_idx").on(t.predictionId),
    index("forecast_reviews_game_id_idx").on(t.gameId),
    index("forecast_reviews_sport_market_idx").on(t.sport, t.market),
    index("forecast_reviews_status_idx").on(t.reviewStatus),
    index("forecast_reviews_result_idx").on(t.result),
    index("forecast_reviews_segment_idx").on(t.segment, t.qualificationStatus),
    index("forecast_reviews_reviewed_at_idx").on(t.reviewedAt),
  ],
);

export type ForecastReview = typeof forecastReviewsTable.$inferSelect;
export type InsertForecastReview = typeof forecastReviewsTable.$inferInsert;