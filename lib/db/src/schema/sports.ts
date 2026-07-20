import { pgTable, serial, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const sportsTable = pgTable(
  "sports",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(), // e.g. "nfl", "nba"
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("sports_slug_idx").on(t.slug)],
);

export type Sport = typeof sportsTable.$inferSelect;
export type InsertSport = typeof sportsTable.$inferInsert;
