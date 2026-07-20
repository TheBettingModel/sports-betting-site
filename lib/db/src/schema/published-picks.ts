import { pgTable, serial, text, integer, real, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { modelPredictionsTable } from "./model-predictions";
import { gamesTable } from "./games";

/**
 * Picks that have been published to users.
 * Linked to an immutable model_prediction snapshot.
 */
export const publishedPicksTable = pgTable(
  "published_picks",
  {
    id: serial("id").primaryKey(),
    predictionId: integer("prediction_id").notNull().references(() => modelPredictionsTable.id),
    gameId: text("game_id").notNull().references(() => gamesTable.id),

    sport: text("sport").notNull(),
    market: text("market").notNull(),
    selection: text("selection").notNull(),
    odds: integer("odds"),
    units: real("units").notNull().default(1.0),

    recommendation: text("recommendation").notNull(), // Strong Buy | Buy | Neutral | Fade
    confidence: text("confidence").notNull(),

    isPlayOfDay: boolean("is_play_of_day").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(true),

    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("published_picks_game_id_idx").on(t.gameId),
    index("published_picks_prediction_id_idx").on(t.predictionId),
    index("published_picks_published_at_idx").on(t.publishedAt),
    index("published_picks_sport_idx").on(t.sport),
    index("published_picks_pod_idx").on(t.isPlayOfDay),
  ],
);

export type PublishedPick = typeof publishedPicksTable.$inferSelect;
export type InsertPublishedPick = typeof publishedPicksTable.$inferInsert;
