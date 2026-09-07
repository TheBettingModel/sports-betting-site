import { pgTable, serial, text, integer, boolean, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { gamesTable } from "./games";

export const gameResultsTable = pgTable(
  "game_results",
  {
    id: serial("id").primaryKey(),
    gameId: text("game_id").notNull().references(() => gamesTable.id),
    homeScore: integer("home_score").notNull(),
    awayScore: integer("away_score").notNull(),
    homeTeamWon: boolean("home_team_won").notNull(),
    overtimes: integer("overtimes").notNull().default(0),
    statusDetail: text("status_detail"), // e.g. "Final", "Final/OT"
    attendance: integer("attendance"),
    gradedAt: timestamp("graded_at", { withTimezone: true }).notNull().defaultNow(),
    gradingSource: text("grading_source").notNull().default("espn"),
    rawResultJson: jsonb("raw_result_json"), // full ESPN response payload
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("game_results_game_id_idx").on(t.gameId),
    index("game_results_graded_at_idx").on(t.gradedAt),
  ],
);

export type GameResult = typeof gameResultsTable.$inferSelect;
export type InsertGameResult = typeof gameResultsTable.$inferInsert;
