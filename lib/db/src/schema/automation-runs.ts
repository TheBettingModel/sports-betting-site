import { pgTable, serial, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { modelVersionsTable } from "./model-versions";

/**
 * Execution log for all scheduled and manual automation jobs.
 * Every job write is idempotent-safe: jobs check this table before
 * processing to avoid duplicate predictions/snapshots/grades.
 */
export const automationRunsTable = pgTable(
  "automation_runs",
  {
    id: serial("id").primaryKey(),
    jobName: text("job_name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // running | completed | failed | skipped
    status: text("status").notNull().default("running"),
    recordsProcessed: integer("records_processed").notNull().default(0),
    errorDetails: text("error_details"),
    retryCount: integer("retry_count").notNull().default(0),
    // null for jobs not tied to a specific model
    modelVersionId: integer("model_version_id").references(() => modelVersionsTable.id),
    // { sourceName: lastFetchedAt } freshness of each data source used
    dataSourceFreshness: jsonb("data_source_freshness"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("automation_runs_job_name_idx").on(t.jobName),
    index("automation_runs_status_idx").on(t.status),
    index("automation_runs_started_at_idx").on(t.startedAt),
  ],
);

export type AutomationRun = typeof automationRunsTable.$inferSelect;
export type InsertAutomationRun = typeof automationRunsTable.$inferInsert;
