import { pgTable, serial, text, integer, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sportsTable } from "./sports";

export const marketsTable = pgTable(
  "markets",
  {
    id: serial("id").primaryKey(),
    // null sportId means the market applies to all sports
    sportId: integer("sport_id").references(() => sportsTable.id),
    slug: text("slug").notNull().unique(), // e.g. "moneyline", "spread", "total", "nrfi"
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("markets_slug_idx").on(t.slug),
    index("markets_sport_id_idx").on(t.sportId),
  ],
);

export type Market = typeof marketsTable.$inferSelect;
export type InsertMarket = typeof marketsTable.$inferInsert;
