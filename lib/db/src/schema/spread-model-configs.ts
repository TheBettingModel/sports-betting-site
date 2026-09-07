import { jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Registry for the independent spread models.
 *
 * Spread models intentionally do not share the moneyline model version
 * lifecycle. A row remains in shadow until its own out-of-sample gates pass.
 */
export const spreadModelConfigsTable = pgTable(
  "spread_model_configs",
  {
    id: serial("id").primaryKey(),
    sport: text("sport").notNull(),
    modelKey: text("model_key").notNull(),
    modelVersion: text("model_version").notNull(),
    status: text("status").notNull().default("shadow"), // shadow | challenger | production | retired
    configHash: text("config_hash").notNull(),
    parameters: jsonb("parameters").notNull(),
    validationMetrics: jsonb("validation_metrics"),
    gatePolicy: jsonb("gate_policy").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("spread_model_configs_sport_model_key_idx").on(t.sport, t.modelKey),
    uniqueIndex("spread_model_configs_sport_version_idx").on(t.sport, t.modelVersion),
  ],
);

export type SpreadModelConfig = typeof spreadModelConfigsTable.$inferSelect;
export type InsertSpreadModelConfig = typeof spreadModelConfigsTable.$inferInsert;