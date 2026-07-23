import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Tracks admin-created snoozes that silence recurring zero-game alerts
 * for a sport known to be in off-season. One active row per sport at most.
 * Snoozes expire automatically (the scheduler checks snoozedUntil before
 * raising alerts); admins can also remove them early via the admin API.
 */
export const sportSnoozesTable = pgTable(
  "sport_snoozes",
  {
    id: serial("id").primaryKey(),
    sport: text("sport").notNull().unique(), // one snooze per sport
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }).notNull(),
    snoozedBy: text("snoozed_by").notNull().default("admin"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sport_snoozes_sport_idx").on(t.sport),
    index("sport_snoozes_until_idx").on(t.snoozedUntil),
  ],
);

export type SportSnooze = typeof sportSnoozesTable.$inferSelect;
export type InsertSportSnooze = typeof sportSnoozesTable.$inferInsert;
