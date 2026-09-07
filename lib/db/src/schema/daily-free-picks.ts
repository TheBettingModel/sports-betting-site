import { pgTable, date, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { publishedPicksTable } from "./published-picks";

/** Immutable free-pick choice for an Eastern sports day. */
export const dailyFreePicksTable = pgTable(
  "daily_free_picks",
  {
    easternDate: date("eastern_date", { mode: "string" }).primaryKey(),
    publishedPickId: integer("published_pick_id")
      .notNull()
      .references(() => publishedPicksTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("daily_free_picks_published_pick_unique").on(t.publishedPickId)],
);

export type DailyFreePick = typeof dailyFreePicksTable.$inferSelect;