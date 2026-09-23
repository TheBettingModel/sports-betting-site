import { pgTable, text, jsonb, timestamp, index, boolean } from "drizzle-orm/pg-core";

/**
 * Per-user push notification sport preferences.
 * Pro subscribers can opt into or out of alerts for specific sports.
 * Default: all sports enabled (null = use defaults).
 *
 * enabledSports: string[] | null
 *   - null  → all sports enabled (default)
 *   - []    → all sports disabled (user turned off all)
 *   - ['MLB', 'NFL'] → only these sports enabled
 */
export const notificationPreferencesTable = pgTable(
  "notification_preferences",
  {
    userId: text("user_id").primaryKey(),
    enabledSports: jsonb("enabled_sports").$type<string[] | null>().default(null),
    // Kept separate from pick/sport alert choices.
    chatNotificationsEnabled: boolean("chat_notifications_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("notification_prefs_user_idx").on(t.userId),
  ],
);

export type NotificationPreference = typeof notificationPreferencesTable.$inferSelect;
export type InsertNotificationPreference = typeof notificationPreferencesTable.$inferInsert;
