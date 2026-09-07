import { pgTable, serial, text, integer, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sportsTable } from "./sports";
import { leaguesTable } from "./leagues";

export const teamsTable = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    sportId: integer("sport_id").notNull().references(() => sportsTable.id),
    leagueId: integer("league_id").notNull().references(() => leaguesTable.id),
    abbr: text("abbr").notNull(),        // canonical abbreviation e.g. "MIL"
    name: text("name").notNull(),        // e.g. "Brewers"
    city: text("city").notNull(),        // e.g. "Milwaukee"
    fullName: text("full_name").notNull(), // e.g. "Milwaukee Brewers"
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("teams_league_abbr_idx").on(t.leagueId, t.abbr),
    index("teams_sport_id_idx").on(t.sportId),
    index("teams_league_id_idx").on(t.leagueId),
  ],
);

export type Team = typeof teamsTable.$inferSelect;
export type InsertTeam = typeof teamsTable.$inferInsert;
