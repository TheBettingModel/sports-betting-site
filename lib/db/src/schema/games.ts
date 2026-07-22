import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gamesTable = pgTable("games", {
  id: text("id").primaryKey(), // ESPN event ID

  sport: text("sport").notNull(),
  league: text("league"),                   // sub-league label (e.g. "EPL", "MLS")

  homeTeamId: text("home_team_id"),         // ESPN numeric team ID — used for logo URLs
  awayTeamId: text("away_team_id"),

  homeTeamAbbr: text("home_team_abbr").notNull(),
  homeTeamName: text("home_team_name").notNull(),
  homeTeamRecord: text("home_team_record").notNull().default("0-0"),

  awayTeamAbbr: text("away_team_abbr").notNull(),
  awayTeamName: text("away_team_name").notNull(),
  awayTeamRecord: text("away_team_record").notNull().default("0-0"),

  gameTime: text("game_time").notNull(),
  gameDate: date("game_date", { mode: "string" }).notNull(),

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

  // Vegas lines (real from ESPN/DraftKings when available, otherwise estimated)
  vegasSpread: real("vegas_spread").notNull().default(0),
  vegasTotal: real("vegas_total").notNull().default(0),
  vegasHomeOdds: integer("vegas_home_odds").notNull().default(-110),
  vegasAwayOdds: integer("vegas_away_odds").notNull().default(-110),
  vegasDrawOdds: integer("vegas_draw_odds").notNull().default(0), // soccer only; 0 = N/A

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
