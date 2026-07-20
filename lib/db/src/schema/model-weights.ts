import { pgTable, text, real, integer, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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

  // Multiplier applied to model confidence deviation from 50%
  // > 1.0 = model is overconfident and being pulled back
  // < 1.0 = model is underconfident and being amplified
  confidenceMultiplier: real("confidence_multiplier").notNull().default(1.0),

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
