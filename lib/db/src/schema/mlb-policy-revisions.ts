import { pgTable, serial, text, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Immutable, administrator-approved recommendation policy changes for MLB
 * moneyline decisions. A revision never changes a previously written
 * prediction; new decisions reference this record instead.
 */
export const mlbPolicyRevisionsTable = pgTable(
  "mlb_policy_revisions",
  {
    id: serial("id").primaryKey(),
    revisionKey: text("revision_key").notNull(),
    sport: text("sport").notNull().default("MLB"),
    market: text("market").notNull().default("moneyline"),
    policyManifest: jsonb("policy_manifest").notNull(),
    policyHash: text("policy_hash").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mlb_policy_revisions_revision_key_unique").on(t.revisionKey),
    index("mlb_policy_revisions_activated_idx").on(t.activatedAt),
  ],
);

export type MlbPolicyRevision = typeof mlbPolicyRevisionsTable.$inferSelect;
export type InsertMlbPolicyRevision = typeof mlbPolicyRevisionsTable.$inferInsert;