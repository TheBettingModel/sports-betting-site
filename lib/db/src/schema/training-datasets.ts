import { pgTable, serial, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Reproducible training dataset manifests.
 * The checksum allows detecting if the same logical dataset
 * has been built before, preventing duplicate training runs.
 */
export const trainingDatasetsTable = pgTable(
  "training_datasets",
  {
    id: serial("id").primaryKey(),
    sport: text("sport").notNull(),
    market: text("market").notNull(),
    // Array of season IDs included
    includedSeasons: jsonb("included_seasons").notNull(),
    // { featureName: version }
    featureVersions: jsonb("feature_versions").notNull(),
    // Description of the outcome being predicted
    outcomeDefinition: text("outcome_definition").notNull(),
    // Rules applied to prevent leakage
    dataCutoffRules: jsonb("data_cutoff_rules").notNull(),
    rowCount: integer("row_count").notNull(),
    // { featureName: { missingCount, missingPct } }
    missingDataReport: jsonb("missing_data_report"),
    // Versions of upstream data sources used
    sourceVersions: jsonb("source_versions"),
    // SHA-256 of the ordered dataset rows
    checksum: text("checksum").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("training_datasets_sport_market_idx").on(t.sport, t.market),
    index("training_datasets_checksum_idx").on(t.checksum),
  ],
);

export type TrainingDataset = typeof trainingDatasetsTable.$inferSelect;
export type InsertTrainingDataset = typeof trainingDatasetsTable.$inferInsert;
