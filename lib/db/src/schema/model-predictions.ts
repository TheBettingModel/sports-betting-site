import { sql } from "drizzle-orm";
import { pgTable, serial, text, integer, real, boolean, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { gamesTable } from "./games";
import { modelVersionsTable } from "./model-versions";
import { mlbPolicyRevisionsTable } from "./mlb-policy-revisions";
import { sportsbooksTable } from "./sportsbooks";

/**
 * Immutable prediction snapshot created before each game starts.
 * Records must never be modified after creation. Grade and result
 * are written to pick_results, not here.
 */
export const modelPredictionsTable = pgTable(
  "model_predictions",
  {
    id: serial("id").primaryKey(),
    gameId: text("game_id").notNull().references(() => gamesTable.id),
    modelVersionId: integer("model_version_id").notNull().references(() => modelVersionsTable.id),
    // Null is the original model decision. A non-null revision creates a new,
    // immutable recommendation decision without rewriting the original.
    policyRevisionId: integer("policy_revision_id").references(() => mlbPolicyRevisionsTable.id),
    supersedesPredictionId: integer("supersedes_prediction_id"),
    sport: text("sport").notNull(),
    market: text("market").notNull(),
    // "home" | "away" | "over" | "under" | "draw"
    selection: text("selection").notNull(),

    // Odds at prediction time
    odds: integer("odds"),
    sportsbookId: integer("sportsbook_id").references(() => sportsbooksTable.id),

    // Probabilities
    modelProbability: real("model_probability").notNull(),   // raw model output 0–1
    impliedProbability: real("implied_probability"),         // derived from odds
    fairProbability: real("fair_probability"),               // after vig removal

    // Edge and value
    edge: real("edge").notNull(),
    confidence: text("confidence").notNull(),               // High | Medium | Low
    grade: text("grade"),                                   // A/B/C/D/F
    recommendation: text("recommendation").notNull(),        // Strong Buy | Buy | Neutral | Fade

    // Sizing
    units: real("units").notNull().default(1.0),

    // Universal scoring (TBM proprietary)
    podScore: real("pod_score"),
    finalRating: real("final_rating"),
    marketIntelligenceGrade: text("market_intelligence_grade"),

    // Market signals
    sharpSignals: jsonb("sharp_signals"),      // { steamMove, reverseLineMovement, publicPct }
    lineShoppingInfo: jsonb("line_shopping_info"), // best available price across books

    // Feature snapshot — exact values used; never updated
    featureSnapshot: jsonb("feature_snapshot").notNull(),

    // Timestamps
    predictionTimestamp: timestamp("prediction_timestamp", { withTimezone: true }).notNull(),
    dataCutoffTimestamp: timestamp("data_cutoff_timestamp", { withTimezone: true }).notNull(),

    // Challenger flag — true = not shown publicly
    isChallenger: boolean("is_challenger").notNull().default(false),

    // Immutable research/publication cohort for new predictions. Null is
    // reserved for legacy rows so historical records are not reclassified.
    // official = exact publication approval existed at prediction time
    // shadow = stored for research without publication permission
    cohort: text("cohort"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // No updatedAt — this record is immutable
  },
  (t) => [
    index("model_predictions_game_id_idx").on(t.gameId),
    index("model_predictions_model_version_idx").on(t.modelVersionId),
    index("model_predictions_policy_revision_idx").on(t.policyRevisionId),
    index("model_predictions_sport_idx").on(t.sport),
    index("model_predictions_prediction_ts_idx").on(t.predictionTimestamp),
    index("model_predictions_challenger_idx").on(t.isChallenger),
    index("model_predictions_cohort_idx").on(t.cohort),
    // Original snapshots retain the historic three-part identity. PostgreSQL
    // treats NULL as distinct in a regular unique index, so use partial
    // indexes to preserve that invariant while allowing versioned revisions.
    uniqueIndex("model_predictions_original_identity_unique").on(
      t.gameId,
      t.modelVersionId,
      t.market,
    ).where(sql`${t.policyRevisionId} IS NULL AND ${t.cohort} IS DISTINCT FROM 'official'`),
    uniqueIndex("model_predictions_revision_identity_unique").on(
      t.gameId,
      t.modelVersionId,
      t.market,
      t.policyRevisionId,
    ).where(sql`${t.policyRevisionId} IS NOT NULL`),
  ],
);

export type ModelPrediction = typeof modelPredictionsTable.$inferSelect;
export type InsertModelPrediction = typeof modelPredictionsTable.$inferInsert;
