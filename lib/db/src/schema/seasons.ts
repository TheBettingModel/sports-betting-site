import { pgTable, serial, text, integer, boolean, date, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { leaguesTable } from "./leagues";

export const seasonsTable = pgTable(
  "seasons",
  {
    id: serial("id").primaryKey(),
    leagueId: integer("league_id").notNull().references(() => leaguesTable.id),
    year: integer("year").notNull(), // e.g. 2026
    label: text("label").notNull(), // e.g. "2025-26" or "2026"
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("seasons_league_year_idx").on(t.leagueId, t.year),
    index("seasons_league_id_idx").on(t.leagueId),
  ],
);

export type Season = typeof seasonsTable.$inferSelect;
export type InsertSeason = typeof seasonsTable.$inferInsert;
