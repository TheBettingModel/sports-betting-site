import { pgTable, text, real, integer, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Per-sport factor weights that the learning engine updates after each graded game.
 * Keys vary by sport (see model.ts SPORT_DEFAULT_WEIGHTS for the full set).
 * Each value is a positive scalar bounded in [0.02, 0.60].
 *
 * MLB/NFL/NHL/NCAAF/NCAAB:
 *   recordWeight, pythagoreanWeight, formWeight, scoreDiffWeight, restWeight
 *
 * WNBA/NBA:
 *   recordWeight, efgWeight, toWeight, orebWeight, defWeight,
 *   formWeight, netRatingWeight, restWeight
 *
 * Soccer:
 *   recordWeight, attackDefWeight, goalDiffWeight,
 *   formWeight, lastGoalDiffWeight, restWeight
 */
export type FactorWeights = Record<string, number>;

export const modelWeightsTable = pgTable("model_weights", {
  id: serial("id").primaryKey(),
  sport: text("sport").notNull().unique(),

  // Rolling accuracy (exponential moving average)
  accuracyRate: real("accuracy_rate").notNull().default(0.5),
  totalPredictions: integer("total_predictions").notNull().default(0),
  correctPredictions: integer("correct_predictions").notNull().default(0),

  // Per-rating accuracy
  strongBuyAccuracy: real("strong_buy_accuracy").notNull().default(0.5),
  buyAccuracy: real("buy_accuracy").notNull().default(0.5),

  // Multiplier applied to model confidence deviation from 50%.
  // > 1.0 = model is performing well, amplify edges.
  // < 1.0 = model is underperforming, dampen edges.
  confidenceMultiplier: real("confidence_multiplier").notNull().default(1.0),

  // Per-factor learned weights. Null on first insert; bootstrapped from hardcoded
  // sport defaults on the first graded game and updated by the learning engine thereafter.
  factorWeights: jsonb("factor_weights").$type<FactorWeights>(),

  lastLearnedAt: timestamp("last_learned_at", { withTimezone: true }),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertModelWeightsSchema = createInsertSchema(modelWeightsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertModelWeights = z.infer<typeof insertModelWeightsSchema>;
export type ModelWeights = typeof modelWeightsTable.$inferSelect;
