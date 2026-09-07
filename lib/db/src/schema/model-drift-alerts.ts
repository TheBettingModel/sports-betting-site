import { pgTable, serial, text, integer, real, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { modelVersionsTable } from "./model-versions";

/**
 * Alerts raised when a model's live behaviour drifts beyond
 * configured thresholds. Never triggers automatic model changes.
 * Drift types: feature_drift | prediction_drift | edge_drift |
 *              calibration_drift | roi_drift | clv_drift |
 *              missing_data_rate | confidence_drift
 */
export const modelDriftAlertsTable = pgTable(
  "model_drift_alerts",
  {
    id: serial("id").primaryKey(),
    modelVersionId: integer("model_version_id").notNull().references(() => modelVersionsTable.id),
    // feature_drift | prediction_drift | edge_drift | calibration_drift | roi_drift | clv_drift
    alertType: text("alert_type").notNull(),
    metricName: text("metric_name").notNull(),
    baselineValue: real("baseline_value").notNull(), // 30-day baseline
    currentValue: real("current_value").notNull(),   // recent 7-day value
    threshold: real("threshold").notNull(),          // configured limit
    severity: text("severity").notNull().default("warning"), // warning | critical
    isResolved: boolean("is_resolved").notNull().default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("model_drift_alerts_model_version_idx").on(t.modelVersionId),
    index("model_drift_alerts_type_idx").on(t.alertType),
    index("model_drift_alerts_resolved_idx").on(t.isResolved),
    index("model_drift_alerts_severity_idx").on(t.severity),
    index("model_drift_alerts_created_at_idx").on(t.createdAt),
  ],
);

export type ModelDriftAlert = typeof modelDriftAlertsTable.$inferSelect;
export type InsertModelDriftAlert = typeof modelDriftAlertsTable.$inferInsert;
