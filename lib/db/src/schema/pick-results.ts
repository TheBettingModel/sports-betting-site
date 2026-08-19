import { pgTable, serial, text, integer, real, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { publishedPicksTable } from "./published-picks";

/**
 * Graded outcome for each published pick.
 * Re-grades create an audit record in grade_audit — the result field
 * may be updated only with an accompanying audit entry.
 */
export const pickResultsTable = pgTable(
  "pick_results",
  {
    id: serial("id").primaryKey(),
    pickId: integer("pick_id").notNull().references(() => publishedPicksTable.id),

    // win | loss | push | void | postponed | pending
    result: text("result").notNull().default("pending"),

    unitsRisked: real("units_risked").notNull(),
    unitsWonLost: real("units_won_lost").notNull().default(0),

    finalScore: text("final_score"),      // e.g. "3-1"
    closingPrice: integer("closing_price"),
    closingLine: real("closing_line"),

    // Closing-line value: positive = beat the closing line
    clv: real("clv"),

    gradedAt: timestamp("graded_at", { withTimezone: true }),
    gradingSource: text("grading_source"),

    // Append-only array of override history objects:
    // [{ timestamp, previousResult, newResult, reason, performedBy }]
    gradeAudit: jsonb("grade_audit").notNull().default([]),

    // Immutable-prediction outcome review written by the learning engine after
    // a decisive grade. It records evidence, not a claimed causal explanation.
    learningReview: jsonb("learning_review").$type<Record<string, unknown>>(),
    learningProcessedAt: timestamp("learning_processed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("pick_results_pick_id_idx").on(t.pickId),
    index("pick_results_result_idx").on(t.result),
    index("pick_results_graded_at_idx").on(t.gradedAt),
    index("pick_results_learning_processed_idx").on(t.learningProcessedAt),
  ],
);

export type PickResult = typeof pickResultsTable.$inferSelect;
export type InsertPickResult = typeof pickResultsTable.$inferInsert;
