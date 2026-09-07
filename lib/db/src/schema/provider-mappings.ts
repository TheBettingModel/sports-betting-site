import { pgTable, serial, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Maps external provider IDs (ESPN, Rotowire, etc.) to TBM canonical integer IDs.
 * tbmEntityType: "sport" | "league" | "season" | "team" | "player" | "game" | "sportsbook"
 */
export const providerMappingsTable = pgTable(
  "provider_mappings",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(),         // e.g. "espn", "covers", "rotowire"
    entityType: text("entity_type").notNull(),    // e.g. "team", "player", "game"
    providerId: text("provider_id").notNull(),    // the external ID string
    tbmEntityType: text("tbm_entity_type").notNull(),
    tbmEntityId: integer("tbm_entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("provider_mappings_unique_idx").on(t.provider, t.entityType, t.providerId),
    index("provider_mappings_tbm_idx").on(t.tbmEntityType, t.tbmEntityId),
    index("provider_mappings_provider_idx").on(t.provider),
  ],
);

export type ProviderMapping = typeof providerMappingsTable.$inferSelect;
export type InsertProviderMapping = typeof providerMappingsTable.$inferInsert;
