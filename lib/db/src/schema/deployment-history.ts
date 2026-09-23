import { pgTable, serial, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { modelVersionsTable } from "./model-versions";

/**
 * Audit log for every model lifecycle action requiring MAH approval.
 * Covers: deploy, rollback, retire, threshold_change, regrade,
 *         delete_data, provider_change, unit_sizing_change, pod_rule_change.
 */
export const deploymentHistoryTable = pgTable(
  "deployment_history",
  {
    id: serial("id").primaryKey(),
    modelVersionId: integer("model_version_id").references(() => modelVersionsTable.id),
    action: text("action").notNull(),
    previousStatus: text("previous_status"),
    newStatus: text("new_status"),
    performedBy: text("performed_by").notNull(),
    approvedBy: text("approved_by"),
    notes: text("notes"),
    // Any additional context (threshold values, rollback target, etc.)
    metadata: jsonb("metadata"),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deployment_history_model_version_idx").on(t.modelVersionId),
    index("deployment_history_action_idx").on(t.action),
    index("deployment_history_performed_at_idx").on(t.performedAt),
  ],
);

export type DeploymentHistory = typeof deploymentHistoryTable.$inferSelect;
export type InsertDeploymentHistory = typeof deploymentHistoryTable.$inferInsert;
