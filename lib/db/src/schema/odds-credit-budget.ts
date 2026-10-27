import { sql } from "drizzle-orm";
import { boolean, check, date, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const oddsApiCreditStateTable = pgTable("odds_api_credit_state", {
  scope: text("scope").primaryKey(),
  month: date("month", { mode: "string" }).notNull(),
  day: date("day", { mode: "string" }).notNull(),
  used: integer("used").notNull().default(0),
  outstanding: integer("outstanding").notNull().default(0),
  dayUsed: integer("day_used").notNull().default(0),
  providerUsed: integer("provider_used").notNull().default(0),
  providerRemaining: integer("provider_remaining").notNull().default(100_000),
  pricingFault: boolean("pricing_fault").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  check("odds_api_credit_state_used_check", sql`${table.used} >= 0`),
  check("odds_api_credit_state_outstanding_check", sql`${table.outstanding} >= 0`),
  check("odds_api_credit_state_day_used_check", sql`${table.dayUsed} >= 0`),
  check("odds_api_credit_state_provider_used_check", sql`${table.providerUsed} >= 0`),
  check("odds_api_credit_state_provider_remaining_check", sql`${table.providerRemaining} >= 0`),
]);

export const oddsApiCollectionStateTable = pgTable("odds_api_collection_state", {
  scope: text("scope").notNull().references(() => oddsApiCreditStateTable.scope),
  feed: text("feed").notNull(),
  nextAllowedAt: timestamp("next_allowed_at", { withTimezone: true }).notNull(),
  leaseId: text("lease_id"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  payload: jsonb("payload"),
}, (table) => [primaryKey({ columns: [table.scope, table.feed] })]);
