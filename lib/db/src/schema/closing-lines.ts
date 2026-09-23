import { pgTable, serial, text, integer, real, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { gamesTable } from "./games";
import { marketsTable } from "./markets";

export const closingLinesTable = pgTable(
  "closing_lines",
  {
    id: serial("id").primaryKey(),
    gameId: text("game_id").notNull().references(() => gamesTable.id),
    marketId: integer("market_id").notNull().references(() => marketsTable.id),
    // "home" | "away" | "over" | "under" | "draw"
    selection: text("selection").notNull(),

    // Line history
    openingPrice: integer("opening_price"),
    openingLine: real("opening_line"),
    closingPrice: integer("closing_price"),
    closingLine: real("closing_line"),
    consensusLine: real("consensus_line"),     // average across books
    sharpBookLine: real("sharp_book_line"),    // e.g. Pinnacle
    bestAvailableLine: real("best_available_line"),
    priceAtPrediction: integer("price_at_prediction"),
    lineAtPrediction: real("line_at_prediction"),
    priceAtPublication: integer("price_at_publication"),
    lineAtPublication: real("line_at_publication"),

    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("closing_lines_game_market_selection_idx").on(t.gameId, t.marketId, t.selection),
    index("closing_lines_game_id_idx").on(t.gameId),
  ],
);

export type ClosingLine = typeof closingLinesTable.$inferSelect;
export type InsertClosingLine = typeof closingLinesTable.$inferInsert;
