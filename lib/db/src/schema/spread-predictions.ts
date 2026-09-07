import { boolean, index, integer, jsonb, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { gamesTable } from "./games";

/**
 * Immutable, sport-isolated spread candidate ledger.
 *
 * One row is a complete two-sided market observation and one model decision.
 * It is deliberately separate from model_predictions so spread shadow rows
 * cannot enter moneyline grading, learning, units, or notifications.
 */
export const spreadPredictionsTable = pgTable(
  "spread_predictions",
  {
    id: serial("id").primaryKey(),
    gameId: text("game_id").notNull().references(() => gamesTable.id),
    sport: text("sport").notNull(),
    modelKey: text("model_key").notNull(),
    modelVersion: text("model_version").notNull(),
    selection: text("selection").notNull(), // home | away
    teamAbbr: text("team_abbr").notNull().default(""),

    // Exact two-sided sportsbook market used for the decision.
    sportsbook: text("sportsbook").notNull(),
    openingLine: real("opening_line"),
    openingPrice: integer("opening_price"),
    currentLine: real("current_line").notNull(),
    currentPrice: integer("current_price").notNull(),
    opposingLine: real("opposing_line").notNull(),
    opposingPrice: integer("opposing_price").notNull(),
    recommendedLine: real("recommended_line").notNull(),
    recommendedPrice: integer("recommended_price").notNull(),
    closingLine: real("closing_line"),
    closingPrice: integer("closing_price"),
    lineSource: text("line_source").notNull().default("the-odds-api"),
    priceSource: text("price_source").notNull().default("the-odds-api"),
    sourceCapturedAt: timestamp("source_captured_at", { withTimezone: true }).notNull(),

    // Independent expected-margin distribution outputs.
    expectedHomeMargin: real("expected_home_margin").notNull(),
    marginStandardDeviation: real("margin_standard_deviation").notNull(),
    modelProbability: real("model_probability").notNull(),
    noVigProbability: real("no_vig_probability").notNull(),
    fairPrice: integer("fair_price").notNull(),
    edge: real("edge").notNull(),
    expectedValue: real("expected_value").notNull(),
    pushProbability: real("push_probability").notNull().default(0),
    uncertainty: real("uncertainty").notNull(),
    confidence: text("confidence").notNull(),
    recommendation: text("recommendation").notNull(),
    units: real("units").notNull().default(0),

    // Gate state is recorded, not inferred later from mutable configuration.
    priceQualified: boolean("price_qualified").notNull().default(false),
    promotionEligible: boolean("promotion_eligible").notNull().default(false),
    gateStatus: text("gate_status").notNull().default("shadow"),
    gateReasons: jsonb("gate_reasons").notNull(),
    featureSnapshot: jsonb("feature_snapshot").notNull(),
    dataCutoffAt: timestamp("data_cutoff_at", { withTimezone: true }).notNull(),
    predictedAt: timestamp("predicted_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("spread_predictions_game_id_idx").on(t.gameId),
    index("spread_predictions_sport_model_idx").on(t.sport, t.modelKey, t.modelVersion),
    index("spread_predictions_predicted_at_idx").on(t.predictedAt),
    index("spread_predictions_gate_idx").on(t.promotionEligible, t.gateStatus),
    uniqueIndex("spread_predictions_observation_idx").on(
      t.gameId,
      t.modelKey,
      t.selection,
      t.currentLine,
      t.currentPrice,
      t.predictedAt,
    ),
  ],
);

export type SpreadPrediction = typeof spreadPredictionsTable.$inferSelect;
export type InsertSpreadPrediction = typeof spreadPredictionsTable.$inferInsert;