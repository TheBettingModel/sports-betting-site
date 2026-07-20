import { pgTable, serial, text, integer, real, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { gamesTable } from "./games";
import { sportsbooksTable } from "./sportsbooks";
import { marketsTable } from "./markets";

export const oddsSnapshotsTable = pgTable(
  "odds_snapshots",
  {
    id: serial("id").primaryKey(),
    gameId: text("game_id").notNull().references(() => gamesTable.id),
    // nullable — ESPN data may not map to a sportsbook record
    sportsbookId: integer("sportsbook_id").references(() => sportsbooksTable.id),
    marketId: integer("market_id").notNull().references(() => marketsTable.id),
    // "home" | "away" | "over" | "under" | "draw"
    selection: text("selection").notNull(),
    price: integer("price").notNull(),    // American odds e.g. -110
    line: real("line"),                   // spread or total value
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    source: text("source").notNull().default("espn"),
    // "open" | "suspended" | "closed"
    marketStatus: text("market_status").notNull().default("open"),
    isAvailable: boolean("is_available").notNull().default(true),
    isStale: boolean("is_stale").notNull().default(false),
    isBestAvailable: boolean("is_best_available").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("odds_snapshots_game_id_idx").on(t.gameId),
    index("odds_snapshots_captured_at_idx").on(t.capturedAt),
    index("odds_snapshots_game_market_idx").on(t.gameId, t.marketId),
    index("odds_snapshots_sportsbook_idx").on(t.sportsbookId),
  ],
);

export type OddsSnapshot = typeof oddsSnapshotsTable.$inferSelect;
export type InsertOddsSnapshot = typeof oddsSnapshotsTable.$inferInsert;
