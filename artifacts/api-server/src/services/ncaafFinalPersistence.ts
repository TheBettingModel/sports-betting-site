import { and, eq, sql } from "drizzle-orm";
import { db, gamesTable, gameResultsTable } from "@workspace/db";
import { reconcileNcaafFinal, type NcaafFinalInput, type NcaafFinalStore } from "./ncaafFinalIngestion";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type NcaafFixtureWriter = (tx: Transaction, pending: boolean) => Promise<void>;

/** Existing tables only. No imports from NFL and no startup/scheduler work.
 * Historical multi-source corrections are deliberately not exposed here. */
export function persistNcaafFetchedFinal(input: NcaafFinalInput, writer?: NcaafFixtureWriter, batchConflict = false) {
  const store: NcaafFinalStore = {
    transaction: (id, work) => db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"ncaaf-final:" + id}))`);
      return work({
        async read() {
          const [game] = await tx.select({
            id: gamesTable.id, sport: gamesTable.sport, status: gamesTable.status,
            homeTeamId: gamesTable.homeTeamId, awayTeamId: gamesTable.awayTeamId,
            startsAt: gamesTable.startsAt, homeScore: gamesTable.homeScore, awayScore: gamesTable.awayScore,
          }).from(gamesTable).where(eq(gamesTable.id, id)).for("update");
          if (!game) return null;
          const [result] = await tx.select({
            homeScore: gameResultsTable.homeScore, awayScore: gameResultsTable.awayScore,
            rawResultJson: gameResultsTable.rawResultJson,
          }).from(gameResultsTable).where(eq(gameResultsTable.gameId, id)).for("update");
          return { game, result: result ?? null };
        },
        ensureFixture: async pending => {
          if (!writer) return false;
          await writer(tx, pending);
          return true;
        },
        async writeGame(homeScore, awayScore) {
          await tx.update(gamesTable).set({ status: "final", homeScore, awayScore, updatedAt: new Date() })
            .where(and(eq(gamesTable.id, id), eq(gamesTable.sport, "NCAAF")));
        },
        async writeResult(homeScore, awayScore, rawResultJson, insert) {
          if (insert) await tx.insert(gameResultsTable).values({
            gameId: id, homeScore, awayScore, homeTeamWon: homeScore > awayScore,
            gradingSource: "espn", statusDetail: "Final", rawResultJson,
          });
          else await tx.update(gameResultsTable).set({
            homeScore, awayScore, homeTeamWon: homeScore > awayScore, rawResultJson, updatedAt: new Date(),
          }).where(eq(gameResultsTable.gameId, id));
        },
      });
    }),
  };
  return reconcileNcaafFinal(store, input, new Date().toISOString(), { batchConflict });
}
