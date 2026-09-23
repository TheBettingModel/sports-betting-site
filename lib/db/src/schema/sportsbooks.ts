import { pgTable, serial, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const sportsbooksTable = pgTable(
  "sportsbooks",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(), // e.g. "draftkings", "fanduel", "pinnacle"
    name: text("name").notNull(),
    isSharp: boolean("is_sharp").notNull().default(false), // sharp book (Pinnacle, Circa, etc.)
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sportsbooks_slug_idx").on(t.slug)],
);

export type Sportsbook = typeof sportsbooksTable.$inferSelect;
export type InsertSportsbook = typeof sportsbooksTable.$inferInsert;
