import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * Per-user push notification preferences for Pro subscribers.
 *
 * notif_sports: string[] | null
 *   - null  → all sports enabled (default)
 *   - []    → all sports disabled
 *   - ['MLB', 'NFL'] → only these sports enabled
 *
 * notif_min_tier: minimum pick tier to trigger a notification
 *   - 'Playable'  → Playable, Strong Buy, Elite (all picks)
 *   - 'Strong Buy' → Strong Buy, Elite only
 *   - 'Elite'     → Elite only
 *
 * notif_enabled: master switch; false = no push notifications regardless of sports
 */
export const userPreferencesTable = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  notifSports: jsonb("notif_sports").$type<string[] | null>().default(null),
  notifMinTier: text("notif_min_tier").notNull().default("Playable"),
  notifEnabled: boolean("notif_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type UserPreference = typeof userPreferencesTable.$inferSelect;
export type InsertUserPreference = typeof userPreferencesTable.$inferInsert;
