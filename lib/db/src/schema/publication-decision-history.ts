import { boolean, index, integer, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { modelPredictionsTable } from "./model-predictions";
import { publishedPicksTable } from "./published-picks";

/** Immutable audit ledger for every distinct downstream publication state. */
export const publicationDecisionHistoryTable = pgTable(
  "publication_decision_history",
  {
    id: serial("id").primaryKey(),
    decisionHash: text("decision_hash").notNull(),
    previousDecisionHash: text("previous_decision_hash"),
    predictionId: integer("prediction_id").notNull().references(() => modelPredictionsTable.id),
    publishedPickId: integer("published_pick_id").notNull().references(() => publishedPicksTable.id),
    slateDate: text("slate_date").notNull(),
    publicationStatus: text("publication_status").notNull(),
    publicationReasonCode: text("publication_reason_code").notNull(),
    globalRank: integer("global_rank"),
    isPublic: boolean("is_public").notNull(),
    isPlayOfDay: boolean("is_play_of_day").notNull(),
    requestedUnits: real("requested_units").notNull(),
    approvedUnits: real("approved_units").notNull(),
    stakePolicyVersion: text("stake_policy_version").notNull(),
    approvalDecisionId: integer("approval_decision_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("publication_decision_history_hash_idx").on(t.decisionHash),
    index("publication_decision_history_slate_rank_idx").on(t.slateDate, t.globalRank),
    index("publication_decision_history_prediction_idx").on(t.predictionId),
  ],
);

export type PublicationDecisionHistory = typeof publicationDecisionHistoryTable.$inferSelect;
export type InsertPublicationDecisionHistory = typeof publicationDecisionHistoryTable.$inferInsert;