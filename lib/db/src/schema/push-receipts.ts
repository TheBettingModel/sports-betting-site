import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Stores Expo push receipt IDs so we can check delivery status after ~15–30 min.
 * Receipts with status="error" and details.error="DeviceNotRegistered" indicate
 * permanently invalid tokens that should be deactivated.
 *
 * Flow:
 *   1. sendPushNotificationsAsync returns tickets with receipt IDs
 *   2. We insert rows here with checked=false
 *   3. A scheduled job calls getReceipts on unchecked rows
 *   4. Rows are marked checked=true with status and error_details stored
 */
export const pushReceiptsTable = pgTable(
  "push_receipts",
  {
    id: serial("id").primaryKey(),
    receiptId: text("receipt_id").notNull(),
    userId: text("user_id").notNull(),
    token: text("token").notNull(),
    checked: boolean("checked").notNull().default(false),
    status: text("status"), // "ok" | "error" | null (unchecked)
    errorDetails: jsonb("error_details").$type<Record<string, unknown>>(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("push_receipts_receipt_id_idx").on(table.receiptId),
  ],
);

export type PushReceipt = typeof pushReceiptsTable.$inferSelect;
export type InsertPushReceipt = typeof pushReceiptsTable.$inferInsert;
