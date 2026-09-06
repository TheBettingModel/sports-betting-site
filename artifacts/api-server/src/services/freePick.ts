import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  dailyFreePicksTable,
  db,
  gamesTable,
  modelPredictionsTable,
  modelVersionsTable,
  publishedPicksTable,
} from "@workspace/db";
import { isPerformanceEligiblePublishedPickSql } from "./legacyNcaafIntegrity";

export type FreePickRow = {
  publishedPickId: number; gameId: string; sport: string; awayTeamName: string; awayTeamAbbr: string;
  awayTeamLogo: string | null; homeTeamName: string; homeTeamAbbr: string; homeTeamLogo: string | null;
  gameDate: string; startTime: string; status: string; market: string; selection: string; recommendation: string;
};

const freePickColumns = {
  publishedPickId: publishedPicksTable.id, gameId: gamesTable.id, sport: gamesTable.sport,
  awayTeamName: gamesTable.awayTeamName, awayTeamAbbr: gamesTable.awayTeamAbbr, awayTeamLogo: gamesTable.awayTeamLogo,
  homeTeamName: gamesTable.homeTeamName, homeTeamAbbr: gamesTable.homeTeamAbbr, homeTeamLogo: gamesTable.homeTeamLogo,
  gameDate: gamesTable.gameDate, startTime: gamesTable.gameTime, status: gamesTable.status,
  market: publishedPicksTable.market, selection: publishedPicksTable.selection, recommendation: publishedPicksTable.recommendation,
};

const eligiblePickWhere = (easternDate: string) =>
  and(
    eq(publishedPicksTable.isEffective, true),
    eq(publishedPicksTable.isPublic, true),
    eq(publishedPicksTable.publicationStatus, "PUBLISHED"),
    eq(publishedPicksTable.approvedUnits, 1),
    eq(modelVersionsTable.status, "production"),
    eq(modelPredictionsTable.cohort, "official"),
    eq(modelPredictionsTable.isChallenger, false),
    isPerformanceEligiblePublishedPickSql(publishedPicksTable.id),
    eq(publishedPicksTable.isPlayOfDay, false),
    sql`${publishedPicksTable.recommendation} IN ('Strong Buy', 'Buy')`,
    eq(gamesTable.gameDate, easternDate),
    eq(gamesTable.status, "upcoming"),
    // The games endpoint has a combined projection. Never select a game where
    // another effective market is a protected Top Pick, because that sibling
    // could otherwise be disclosed with the free market.
    sql`NOT EXISTS (
      SELECT 1 FROM published_picks AS pod_sibling
      WHERE pod_sibling.game_id = ${publishedPicksTable.gameId}
        AND pod_sibling.is_effective = true
        AND pod_sibling.is_play_of_day = true
    )`,
  );

async function findEligiblePickById(easternDate: string, publishedPickId: number): Promise<FreePickRow | null> {
  const [row] = await db
    .select(freePickColumns)
    .from(publishedPicksTable)
    .innerJoin(gamesTable, eq(gamesTable.id, publishedPicksTable.gameId))
    .innerJoin(modelPredictionsTable, eq(modelPredictionsTable.id, publishedPicksTable.predictionId))
    .innerJoin(modelVersionsTable, eq(modelVersionsTable.id, modelPredictionsTable.modelVersionId))
    .where(and(eq(publishedPicksTable.id, publishedPickId), eligiblePickWhere(easternDate)))
    .limit(1);
  return row ?? null;
}

/**
 * Resolves the single, durable free pick for a slate. Existing choices are
 * never replaced: when one becomes invalid it is deliberately withheld.
 */
export async function getDailyFreePick(easternDate: string): Promise<FreePickRow | null> {
  const [persisted] = await db
    .select({ publishedPickId: dailyFreePicksTable.publishedPickId })
    .from(dailyFreePicksTable)
    .where(eq(dailyFreePicksTable.easternDate, easternDate))
    .limit(1);

  if (persisted) return findEligiblePickById(easternDate, persisted.publishedPickId);

  const [candidate] = await db
    .select(freePickColumns)
    .from(publishedPicksTable)
    .innerJoin(gamesTable, eq(gamesTable.id, publishedPicksTable.gameId))
    .innerJoin(modelPredictionsTable, eq(modelPredictionsTable.id, publishedPicksTable.predictionId))
    .innerJoin(modelVersionsTable, eq(modelVersionsTable.id, modelPredictionsTable.modelVersionId))
    .where(eligiblePickWhere(easternDate))
    .orderBy(desc(gamesTable.finalModelScore), desc(gamesTable.modelScore), asc(publishedPicksTable.id))
    .limit(1);
  if (!candidate) return null;

  // A concurrent request may win the insertion; always return the persisted
  // decision in that case rather than independently exposing this candidate.
  await db
    .insert(dailyFreePicksTable)
    .values({ easternDate, publishedPickId: candidate.publishedPickId })
    .onConflictDoNothing();

  const [selected] = await db
    .select({ publishedPickId: dailyFreePicksTable.publishedPickId })
    .from(dailyFreePicksTable)
    .where(eq(dailyFreePicksTable.easternDate, easternDate))
    .limit(1);
  return selected ? findEligiblePickById(easternDate, selected.publishedPickId) : null;
}