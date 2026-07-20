import {
  pgTable,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Tracks RevenueCat subscriber status per user.
 * Updated via POST /api/webhooks/revenuecat events.
 * userId matches the Clerk user ID used as RevenueCat app_user_id.
 */
export const subscribersTable = pgTable("subscribers", {
  userId: text("user_id").primaryKey(),
  entitlement: text("entitlement").notNull().default("pro"),
  isActive: boolean("is_active").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Subscriber = typeof subscribersTable.$inferSelect;
export type InsertSubscriber = typeof subscribersTable.$inferInsert;
