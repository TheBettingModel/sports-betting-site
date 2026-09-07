import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { teamsTable } from "./teams";

export const playersTable = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").references(() => teamsTable.id), // nullable — free agents
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    position: text("position"),
    jerseyNumber: text("jersey_number"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("players_team_id_idx").on(t.teamId),
    index("players_last_name_idx").on(t.lastName),
  ],
);

export type Player = typeof playersTable.$inferSelect;
export type InsertPlayer = typeof playersTable.$inferInsert;
