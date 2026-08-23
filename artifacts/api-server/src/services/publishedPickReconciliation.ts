import { and, desc, eq, sql } from "drizzle-orm";
import { db, publishedPicksTable } from "@workspace/db";
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
  const unresolved = await db.execute(sql`
    SELECT game_id, market
    FROM published_picks
    GROUP BY game_id, market
    HAVING COUNT(*) FILTER (WHERE is_effective = true) = 0
  `);

  for (const group of unresolved.rows as Array<{ game_id: string; market: string }>) {
    await db.transaction(async (tx) => {
      await tx.execute(publishedPickEffectivenessLock(group.game_id, group.market));

      // A current publisher may have won the lock first. Preserve its current
      // choice rather than overwriting it with an older legacy decision.
      const [existingEffective] = await tx
        .select({ id: publishedPicksTable.id })
        .from(publishedPicksTable)
        .where(and(
          eq(publishedPicksTable.gameId, group.game_id),
          eq(publishedPicksTable.market, group.market),
          eq(publishedPicksTable.isEffective, true),
        ))
        .limit(1);
      if (existingEffective) return;

      const [latestLegacyPick] = await tx
        .select({ id: publishedPicksTable.id })
        .from(publishedPicksTable)
        .where(and(
          eq(publishedPicksTable.gameId, group.game_id),
          eq(publishedPicksTable.market, group.market),
        ))
        .orderBy(desc(publishedPicksTable.publishedAt), desc(publishedPicksTable.id))
        .limit(1);
      if (!latestLegacyPick) return;

      await tx
        .update(publishedPicksTable)
        .set({ isEffective: true })
        .where(eq(publishedPicksTable.id, latestLegacyPick.id));
    });
  }

  logger.info("Legacy published-pick effectiveness reconciliation completed");
}