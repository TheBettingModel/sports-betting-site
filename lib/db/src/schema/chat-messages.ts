import { pgTable, serial, text, varchar, timestamp, index } from "drizzle-orm/pg-core";

export const CHAT_MESSAGE_MAX_LENGTH = 1_000;

/** Owner-authored, plain-text community chat messages. */
export const chatMessagesTable = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    authorId: text("author_id").notNull(),
    authorDisplayName: text("author_display_name").notNull(),
    body: varchar("body", { length: CHAT_MESSAGE_MAX_LENGTH }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_created_at_idx").on(t.createdAt)],
);

export type ChatMessage = typeof chatMessagesTable.$inferSelect;