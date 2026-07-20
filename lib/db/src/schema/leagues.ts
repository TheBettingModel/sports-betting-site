import { pgTable, serial, text, integer, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sportsTable } from "./sports";

export const leaguesTable = pgTable(
  "leagues",
  {
    id: serial("id").primaryKey(),
    sportId: integer("sport_id").notNull().references(() => sportsTable.id),
    slug: text("slug").notNull().unique(), // e.g. "nfl", "nba", "mlb"
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("leagues_slug_idx").on(t.slug),
    index("leagues_sport_id_idx").on(t.sportId),
  ],
);

export type League = typeof leaguesTable.$inferSelect;
export type InsertLeague = typeof leaguesTable.$inferInsert;
