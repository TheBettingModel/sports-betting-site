import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";

/**
 * All writers that can select an effective pick use this exact advisory-lock
 * statement. It keeps rollout reconciliation and normal publication from
 * choosing competing current decisions for the same game and market.
 */
export function publishedPickEffectivenessLock(gameId: string, market: string) {
  return sql`SELECT pg_advisory_xact_lock(hashtext(${`${gameId}:${market}`}))`;
}

/**
 * Writers take a shared rollout lock while choosing an effective pick. Startup
 * reconciliation takes the matching exclusive lock, preventing a writer from
 * racing its one-statement legacy backfill without serializing normal writers
 * against each other.
 */
export function publishedPickEffectivenessWriterLock() {
  return sql`SELECT pg_advisory_xact_lock_shared(hashtext('published-picks-effective-rollout'))`;
}

function publishedPickEffectivenessReconciliationLock() {
  return sql`SELECT pg_advisory_xact_lock(hashtext('published-picks-effective-rollout'))`;
}

/**
 * Select one current decision for each legacy game/market that was created
 * before `published_picks.is_effective` existed. The production schema adds
 * that column with a false default, letting the partial unique index be
 * created without rewriting or deleting historical rows.
 *
 * This is intentionally data-only (no schema DDL) and safe to run on every
 * startup. It never changes an existing effective decision, results, or audit
 * history. For an unresolved group, newest publishedAt wins; id breaks ties.
 */
export async function reconcileLegacyPublishedPickEffectiveness(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(publishedPickEffectivenessReconciliationLock());
    // During a rolling deployment, an older API binary does not yet take the
    // rollout advisory lock. This transaction-scoped table lock conflicts with
    // its inserts and updates, so the winner selection below cannot race an
    // old writer into violating the partial unique index.
    await tx.execute(sql`LOCK TABLE published_picks IN SHARE ROW EXCLUSIVE MODE`);
    await tx.execute(sql`
      WITH unresolved_groups AS (
        SELECT game_id, market
        FROM published_picks
        GROUP BY game_id, market
        HAVING COUNT(*) FILTER (WHERE is_effective = true) = 0
      ),
      selected_legacy_picks AS (
        SELECT DISTINCT ON (pick.game_id, pick.market) pick.id
        FROM published_picks AS pick
        INNER JOIN unresolved_groups AS unresolved
          ON unresolved.game_id = pick.game_id
         AND unresolved.market = pick.market
        ORDER BY pick.game_id, pick.market, pick.published_at DESC NULLS LAST, pick.id DESC
      )
      UPDATE published_picks AS pick
      SET is_effective = true
      FROM selected_legacy_picks AS selected
      WHERE pick.id = selected.id
    `);
  });

  logger.info("Legacy published-pick effectiveness reconciliation completed");
}