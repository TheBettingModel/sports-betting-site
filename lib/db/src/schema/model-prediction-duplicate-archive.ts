import { pgTable, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Legacy immutable archive retained from the earlier prediction-identity
 * cleanup. It remains in the schema so publish-time reconciliation never
 * mistakes it for a rename target when adding policy revisions.
 */
export const modelPredictionDuplicateArchiveTable = pgTable(
  "model_prediction_duplicate_archive",
  {
    predictionId: integer("prediction_id").primaryKey(),
    archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull(),
  },
);