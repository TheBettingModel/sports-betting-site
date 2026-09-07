import { pgTable, serial, text, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Alerts raised when data quality issues are detected.
 * Examples: ESPN API returning no games, missing closing lines,
 * unexpected null features, duplicate records, stale data.
 * Alerts never trigger automatic model changes — they require review.
 */
export const dataQualityAlertsTable = pgTable(
  "data_quality_alerts",
  {
    id: serial("id").primaryKey(),
    alertType: text("alert_type").notNull(),   // e.g. "missing_closing_line", "stale_feed"
    sport: text("sport"),
    severity: text("severity").notNull().default("warning"), // info | warning | critical
    description: text("description").notNull(),
    isResolved: boolean("is_resolved").notNull().default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    // Raw context data for investigation
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("data_quality_alerts_type_idx").on(t.alertType),
    index("data_quality_alerts_resolved_idx").on(t.isResolved),
    index("data_quality_alerts_severity_idx").on(t.severity),
    index("data_quality_alerts_sport_idx").on(t.sport),
    index("data_quality_alerts_created_at_idx").on(t.createdAt),
  ],
);

export type DataQualityAlert = typeof dataQualityAlertsTable.$inferSelect;
export type InsertDataQualityAlert = typeof dataQualityAlertsTable.$inferInsert;
