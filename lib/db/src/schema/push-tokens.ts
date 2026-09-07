import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Stores Expo push tokens per user.
 * A user can have multiple tokens (multiple devices).
 * Tokens are deactivated rather than deleted so auditing is preserved.
 */
export const pushTokensTable = pgTable(
  "push_tokens",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    token: text("token").notNull(),
    platform: text("platform"), // "ios" | "android" | "web"
    isActive: boolean("is_active").notNull().default(true),
    /** Last delivery outcome from Expo receipt API: "ok" | "DeviceNotRegistered" | "InvalidCredentials" | "MessageTooBig" | "MessageRateExceeded" | null */
    lastDeliveryStatus: text("last_delivery_status"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("push_tokens_user_token_idx").on(table.userId, table.token),
  ],
);

export type PushToken = typeof pushTokensTable.$inferSelect;
export type InsertPushToken = typeof pushTokensTable.$inferInsert;
