import { pgTable, serial, text, integer, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { publishedPicksTable } from "./published-picks";

/**
 * Append-only eligibility decisions for historical published picks.
 *
 * Source predictions, publications, and results remain immutable. Consumers of
 * performance evidence must use this ledger to exclude an ineligible pick.
 */
export const publishedPickPerformanceClassificationsTable = pgTable(
  "published_pick_performance_classifications",
  {
    id: serial("id").primaryKey(),
    publishedPickId: integer("published_pick_id")
      .notNull()
      .references(() => publishedPicksTable.id),
    classification: text("classification").notNull(),
    reasonCode: text("reason_code").notNull(),
    performanceEligible: boolean("performance_eligible").notNull(),
    classifiedAt: timestamp("classified_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("published_pick_performance_classifications_pick_idx").on(t.publishedPickId),
    index("published_pick_performance_classifications_eligible_idx").on(t.performanceEligible),
    // Reconciliation is repeatable without ever updating historical evidence.
    uniqueIndex("published_pick_performance_classifications_identity_unique").on(
      t.publishedPickId,
      t.classification,
      t.reasonCode,
    ),
  ],
);

export type PublishedPickPerformanceClassification =
  typeof publishedPickPerformanceClassificationsTable.$inferSelect;