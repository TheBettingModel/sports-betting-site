import { sql } from "drizzle-orm";
import { pgTable, serial, text, integer, real, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { modelPredictionsTable } from "./model-predictions";
import { gamesTable } from "./games";
import { mlbPolicyRevisionsTable } from "./mlb-policy-revisions";

/**
 * Picks that have been published to users.
 * Linked to an immutable model_prediction snapshot.
 */
export const publishedPicksTable = pgTable(
  "published_picks",
  {
    id: serial("id").primaryKey(),
    predictionId: integer("prediction_id").notNull().references(() => modelPredictionsTable.id),
    policyRevisionId: integer("policy_revision_id").references(() => mlbPolicyRevisionsTable.id),
    supersedesPickId: integer("supersedes_pick_id"),
    supersededByPickId: integer("superseded_by_pick_id"),
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
    // Existing rows receive false when this column is first published. A
    // data-only reconciliation then selects the latest legacy pick per market
    // before the API accepts requests, avoiding a unique-index collision.
    isEffective: boolean("is_effective").notNull().default(false),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),

    // Publication-decision contract. These are nullable for legacy rows, whose
    // historic publication state cannot be inferred safely during migration.
    publicationStatus: text("publication_status"),
    publicationReasonCode: text("publication_reason_code"),
    exclusionReasonCode: text("exclusion_reason_code"),
    selectedSideEdge: real("selected_side_edge"),
    rankScore: real("rank_score"),
    globalRank: integer("global_rank"),
    requestedUnits: real("requested_units"),
    approvedUnits: real("approved_units"),
    stakePolicyVersion: text("stake_policy_version"),
    stakeReason: text("stake_reason"),
    decisionTimestamp: timestamp("decision_timestamp", { withTimezone: true }),
    dataCutoff: timestamp("data_cutoff", { withTimezone: true }),
    gameStart: timestamp("game_start", { withTimezone: true }),

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
    index("published_picks_policy_revision_idx").on(t.policyRevisionId),
    // Supports ranked publication-queue reads without indexing audit details.
    index("published_picks_publication_rank_idx").on(t.publicationStatus, t.globalRank),
    // The effective recommendation is a durable database invariant, not only
    // an application convention. Superseded rows remain queryable for audit.
    uniqueIndex("published_picks_one_effective_game_market_unique")
      .on(t.gameId, t.market)
      .where(sql`${t.isEffective} = true`),
    index("published_picks_published_at_idx").on(t.publishedAt),
    index("published_picks_sport_idx").on(t.sport),
    index("published_picks_pod_idx").on(t.isPlayOfDay),
  ],
);

export type PublishedPick = typeof publishedPicksTable.$inferSelect;
export type InsertPublishedPick = typeof publishedPicksTable.$inferInsert;
