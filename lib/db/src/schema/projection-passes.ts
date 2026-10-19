import { pgTable, text, timestamp, jsonb, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** One server-owned rolling grant per Clerk identity; never editable as preferences. */
export const projectionPassesTable = pgTable("projection_passes", {
  userId: text("user_id").primaryKey(),
  gameId: text("game_id").notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
}, table => [
  check("projection_pass_duration", sql`${table.expiresAt} = ${table.claimedAt} + interval '24 hours'`),
]);
