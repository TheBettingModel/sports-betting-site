import { index, integer, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { gamesTable } from "./games";
import { spreadPredictionsTable } from "./spread-predictions";

/** Isolated outcome ledger for spread shadow/production observations. */
export const spreadPredictionResultsTable = pgTable(
  "spread_prediction_results",
  {
    id: serial("id").primaryKey(),
    predictionId: integer("prediction_id").notNull().references(() => spreadPredictionsTable.id),
    gameId: text("game_id").notNull().references(() => gamesTable.id),
    result: text("result").notNull(), // win | loss | push | void | postponed
    finalScore: text("final_score").notNull(),
    predictedHomeMargin: real("predicted_home_margin"),
    actualHomeMargin: real("actual_home_margin"),
    residual: real("residual"),
    residualConvention: text("residual_convention"),
    closingLine: real("closing_line"),
    closingPrice: integer("closing_price"),
    clv: real("clv"),
    unitsWonLost: real("units_won_lost").notNull().default(0),
    settledAt: timestamp("settled_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("spread_prediction_results_prediction_idx").on(t.predictionId),
    index("spread_prediction_results_game_idx").on(t.gameId),
    index("spread_prediction_results_settled_at_idx").on(t.settledAt),
  ],
);

export type SpreadPredictionResult = typeof spreadPredictionResultsTable.$inferSelect;
export type InsertSpreadPredictionResult = typeof spreadPredictionResultsTable.$inferInsert;