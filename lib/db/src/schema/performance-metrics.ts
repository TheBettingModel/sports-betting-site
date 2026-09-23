import { pgTable, serial, text, integer, real, boolean, date, timestamp, index } from "drizzle-orm/pg-core";
import { modelVersionsTable } from "./model-versions";

/**
 * Pre-aggregated performance metric rows broken down by every
 * dimension combination the spec requires. Always include sample_size
 * alongside every metric value. Rows are replaced on each analytics refresh.
 *
 * Dimension columns are nullable — null means "all values" for that dimension.
 */
export const performanceMetricsTable = pgTable(
  "performance_metrics",
  {
    id: serial("id").primaryKey(),
    modelVersionId: integer("model_version_id").notNull().references(() => modelVersionsTable.id),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),

    // ── Dimension filters (all nullable = "all") ──────────────────────
    sport: text("sport"),
    league: text("league"),
    market: text("market"),
    season: text("season"),
    month: text("month"),                         // YYYY-MM
    oddsBucket: text("odds_bucket"),              // e.g. "-200 to -151", "+101 to +150"
    edgeBucket: text("edge_bucket"),              // e.g. "0–3%", "3–6%"
    confidenceBucket: text("confidence_bucket"),  // High | Medium | Low
    grade: text("grade"),
    recommendation: text("recommendation"),
    sportsbook: text("sportsbook"),
    favoriteOrUnderdog: text("favorite_or_underdog"), // favorite | underdog
    homeOrAway: text("home_or_away"),                 // home | away
    timeBeforeGame: text("time_before_game"),          // e.g. ">24h", "1–24h", "<1h"
    isPlayOfDay: boolean("is_play_of_day"),
    hasSharpSignal: boolean("has_sharp_signal"),
    injuryCertainty: text("injury_certainty"),         // confirmed | questionable | none
    marketMovement: text("market_movement"),           // steam | reverse | neutral

    // ── Core metrics ──────────────────────────────────────────────────
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    pushes: integer("pushes").notNull().default(0),
    voids: integer("voids").notNull().default(0),
    totalPicks: integer("total_picks").notNull().default(0),
    sampleSize: integer("sample_size").notNull().default(0),

    // Financial
    unitsWon: real("units_won").notNull().default(0),
    unitsLost: real("units_lost").notNull().default(0),
    netUnits: real("net_units").notNull().default(0),
    roi: real("roi"),                        // net_units / units_risked
    maxDrawdown: real("max_drawdown"),
    avgOdds: real("avg_odds"),

    // Probabilistic
    winRate: real("win_rate"),
    clvAverage: real("clv_average"),
    posClvRate: real("pos_clv_rate"),        // % of picks with positive CLV
    brierScore: real("brier_score"),
    logLoss: real("log_loss"),
    accuracy: real("accuracy"),             // correct direction %
    calibrationError: real("calibration_error"), // mean absolute calibration error

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("perf_metrics_model_version_idx").on(t.modelVersionId),
    index("perf_metrics_sport_idx").on(t.sport),
    index("perf_metrics_market_idx").on(t.market),
    index("perf_metrics_period_idx").on(t.periodStart, t.periodEnd),
    index("perf_metrics_computed_at_idx").on(t.computedAt),
    index("perf_metrics_recommendation_idx").on(t.recommendation),
  ],
);

export type PerformanceMetric = typeof performanceMetricsTable.$inferSelect;
export type InsertPerformanceMetric = typeof performanceMetricsTable.$inferInsert;
