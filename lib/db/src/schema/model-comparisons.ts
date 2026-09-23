import { pgTable, serial, text, integer, jsonb, date, timestamp, index } from "drizzle-orm/pg-core";
import { modelVersionsTable } from "./model-versions";

/**
 * Side-by-side champion vs challenger comparison record.
 * Created when a challenger has enough graded predictions to evaluate.
 */
export const modelComparisonsTable = pgTable(
  "model_comparisons",
  {
    id: serial("id").primaryKey(),
    championVersionId: integer("champion_version_id").notNull().references(() => modelVersionsTable.id),
    challengerVersionId: integer("challenger_version_id").notNull().references(() => modelVersionsTable.id),
    sport: text("sport").notNull(),
    market: text("market").notNull(),
    comparisonPeriodStart: date("comparison_period_start", { mode: "string" }).notNull(),
    comparisonPeriodEnd: date("comparison_period_end", { mode: "string" }).notNull(),
    // Full metric breakdown for each version
    championMetrics: jsonb("champion_metrics"),
    challengerMetrics: jsonb("challenger_metrics"),
    // champion_better | challenger_better | inconclusive | pending
    verdict: text("verdict").notNull().default("pending"),
    sampleSize: integer("sample_size").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("model_comparisons_champion_idx").on(t.championVersionId),
    index("model_comparisons_challenger_idx").on(t.challengerVersionId),
    index("model_comparisons_sport_market_idx").on(t.sport, t.market),
    index("model_comparisons_verdict_idx").on(t.verdict),
  ],
);

export type ModelComparison = typeof modelComparisonsTable.$inferSelect;
export type InsertModelComparison = typeof modelComparisonsTable.$inferInsert;
