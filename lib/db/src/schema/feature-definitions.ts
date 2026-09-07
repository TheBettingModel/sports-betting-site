import { pgTable, serial, text, integer, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Versioned catalog of all features used by TBM models.
 * New versions create new rows; old versions are never deleted
 * so historical predictions remain reproducible.
 */
export const featureDefinitionsTable = pgTable(
  "feature_definitions",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    description: text("description"),
    // float | integer | boolean | categorical
    dataType: text("data_type").notNull().default("float"),
    // null = applies to all sports
    sport: text("sport"),
    // null = applies to all markets
    market: text("market"),
    source: text("source").notNull(),       // e.g. "espn", "rotowire", "derived"
    calculationMethod: text("calculation_method"),
    // when it becomes available relative to game time
    availabilityTiming: text("availability_timing"), // e.g. "24h_before", "game_time"
    // zero | mean | drop | error
    missingValuePolicy: text("missing_value_policy").notNull().default("mean"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("feature_definitions_name_version_idx").on(t.name, t.version),
    index("feature_definitions_sport_idx").on(t.sport),
    index("feature_definitions_active_idx").on(t.isActive),
  ],
);

export type FeatureDefinition = typeof featureDefinitionsTable.$inferSelect;
export type InsertFeatureDefinition = typeof featureDefinitionsTable.$inferInsert;
