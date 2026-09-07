import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gamesTable = pgTable("games", {
  id: text("id").primaryKey(), // ESPN event ID

  sport: text("sport").notNull(),
  league: text("league"),                   // sub-league label (e.g. "EPL", "MLS")

  homeTeamId: text("home_team_id"),         // ESPN numeric team ID
  awayTeamId: text("away_team_id"),
  homeTeamLogo: text("home_team_logo"),     // ESPN CDN logo URL captured at ingestion time
  awayTeamLogo: text("away_team_logo"),

  homeTeamAbbr: text("home_team_abbr").notNull(),
  homeTeamName: text("home_team_name").notNull(),
  homeTeamRecord: text("home_team_record").notNull().default("0-0"),

  awayTeamAbbr: text("away_team_abbr").notNull(),
  awayTeamName: text("away_team_name").notNull(),
  awayTeamRecord: text("away_team_record").notNull().default("0-0"),

  gameTime: text("game_time").notNull(),
  gameDate: date("game_date", { mode: "string" }).notNull(),
  // Provider kickoff/first-pitch timestamp. Policy revisions require this
  // explicit cutoff instead of attempting to parse the display gameTime.
  startsAt: timestamp("starts_at", { withTimezone: true }),

  // upcoming | live | final
  status: text("status").notNull().default("upcoming"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),

  // Model projection
  homeWinPct: integer("home_win_pct").notNull().default(50),
  confidence: text("confidence").notNull().default("Medium"),
  projectedSpread: real("projected_spread").notNull().default(0),
  projectedTotal: real("projected_total").notNull().default(0),
  valueRating: text("value_rating").notNull().default("Neutral"),
  modelScore: integer("model_score").notNull().default(50),
  edge: real("edge").notNull().default(0),

  // Phase 1: enhanced model scoring
  confidenceNum: integer("confidence_num").notNull().default(50),
  units: real("units").notNull().default(1.0),
  priceAdjustment: real("price_adjustment").notNull().default(0),
  sharpScore: integer("sharp_score").notNull().default(0),
  sharpSignal: text("sharp_signal").notNull().default("No Signal"),
  finalModelScore: integer("final_model_score").notNull().default(50),
  finalModelTier: text("final_model_tier").notNull().default("Watchlist"),
  finalModelStars: integer("final_model_stars").notNull().default(2),
  podScore: real("pod_score").notNull().default(0),

  // Vegas lines (real from ESPN/DraftKings when available, otherwise estimated)
  vegasSpread: real("vegas_spread").notNull().default(0),
  vegasTotal: real("vegas_total").notNull().default(0),
  vegasHomeOdds: integer("vegas_home_odds").notNull().default(-110),
  vegasAwayOdds: integer("vegas_away_odds").notNull().default(-110),
  vegasDrawOdds: integer("vegas_draw_odds").notNull().default(0), // soccer only; 0 = N/A

  // Opening odds — written once on first insert, never overwritten on conflict.
  // Compared to current consensus odds to detect line movement direction.
  openingHomeOdds: integer("opening_home_odds"),
  openingAwayOdds: integer("opening_away_odds"),

  // Best available line across all tracked bookmakers for this game's pick side.
  // Updated each refresh; shows subscribers where to get the best price.
  bestLineBook: text("best_line_book"),
  bestLineOdds: integer("best_line_odds"),

  // MLB probable starters — fetched from MLB Stats API (free, no key).
  // Pitcher ERA is the single most predictive individual-game variable in baseball.
  homeStarterName: text("home_starter_name"),
  homeStarterEra:  real("home_starter_era"),
  homeStarterWhip: real("home_starter_whip"),
  homeStarterRecentEra: real("home_starter_recent_era"),  // ERA over last 3 starts
  homeStarterHand: text("home_starter_hand"),              // "L" or "R"
  awayStarterName: text("away_starter_name"),
  awayStarterEra:  real("away_starter_era"),
  awayStarterWhip: real("away_starter_whip"),
  awayStarterRecentEra: real("away_starter_recent_era"),
  awayStarterHand: text("away_starter_hand"),              // "L" or "R"

  // ── Phase 3: environmental signals ───────────────────────────────────────────

  // Weather (MLB/NFL outdoor venues — null for dome or unsupported sport)
  weatherWindMph:  real("weather_wind_mph"),
  weatherPrecipMm: real("weather_precip_mm"),
  weatherTotalAdj: real("weather_total_adj"),    // applied to projected total
  weatherIsDome:   boolean("weather_is_dome"),
  weatherSummary:  text("weather_summary"),

  // NHL goalie matchup — season stats for presumed starters
  homeGoalieName:    text("home_goalie_name"),
  homeGoalieSavePct: real("home_goalie_save_pct"),
  homeGoalieGaa:     real("home_goalie_gaa"),
  awayGoalieName:    text("away_goalie_name"),
  awayGoalieSavePct: real("away_goalie_save_pct"),
  awayGoalieGaa:     real("away_goalie_gaa"),

  // NFL injury impact — net probability adjustment + key-player summaries
  homeInjuryImpact: real("home_injury_impact"),
  awayInjuryImpact: real("away_injury_impact"),
  homeKeyInjuries:  text("home_key_injuries"),   // JSON array of "Name (POS, status)"
  awayKeyInjuries:  text("away_key_injuries"),

  // MLB bullpen fatigue — weighted relief pitch counts over last 3 days
  // Higher score = more fatigued bullpen. Null for non-MLB sports.
  homeBullpenFatigue: real("home_bullpen_fatigue"),
  awayBullpenFatigue: real("away_bullpen_fatigue"),
  homeBullpenLabel: text("home_bullpen_label"),   // "Fresh" | "Moderate" | "Tired" | "Exhausted"
  awayBullpenLabel: text("away_bullpen_label"),

  // MLB lineup confirmation — true when all 9 batting-order spots are locked in.
  // Posted 1–3 hours before first pitch; null / false before that.
  homeLineupConfirmed: boolean("home_lineup_confirmed"),
  awayLineupConfirmed: boolean("away_lineup_confirmed"),

  // Current MLB-only decision audit. This is refreshed with the mutable game
  // projection and is deliberately separate from immutable prediction history.
  // It gives operators the exact evidence and policy gates behind Neutral rows.
  mlbDecisionAudit: jsonb("mlb_decision_audit").$type<Record<string, unknown>>(),

  // Outcome tracking for learning
  predictionCorrect: boolean("prediction_correct"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertGameSchema = createInsertSchema(gamesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof gamesTable.$inferSelect;
