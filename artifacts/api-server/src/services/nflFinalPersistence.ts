import { and, eq, sql } from "drizzle-orm";
import { db, gamesTable, gameResultsTable } from "@workspace/db";
import { reconcileNflFinal, type NflFinalInput, type NflFinalStore } from "./nflFinalIngestion";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type NflFixtureWriter = (tx: Transaction, pending: boolean) => Promise<void>;

/** No startup work. Invoked only by the existing refresh/recovery entry points. */
export function persistNflFetchedFinal(input: NflFinalInput, writer?: NflFixtureWriter, batchConflict = false) {
  const store: NflFinalStore = {
    transaction: (id, work) => db.transaction(async tx => {
      // Transaction-scoped and pinned: safe on Neon pooled connections.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"nfl-final:" + id}))`);
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
        async ensureFixture(pending) {
          if (!writer) return false;
          await writer(tx, pending);
          return true;
        },
        async quarantineFixture() {
          await tx.update(gamesTable).set({
            status: "final", homeScore: null, awayScore: null, updatedAt: new Date(),
          }).where(and(eq(gamesTable.id, id), eq(gamesTable.sport, "NFL")));
        },
        async writeGame(homeScore, awayScore) {
          await tx.update(gamesTable).set({ status: "final", homeScore, awayScore, updatedAt: new Date() })
            .where(and(eq(gamesTable.id, id), eq(gamesTable.sport, "NFL")));
        },
        async writeResult(homeScore, awayScore, rawResultJson, insert) {
          if (insert) {
            await tx.insert(gameResultsTable).values({
              gameId: id, homeScore, awayScore, homeTeamWon: homeScore > awayScore,
              gradingSource: "espn", statusDetail: "Final", rawResultJson,
            });
          } else {
            // Keep original grading source, grade time and raw payload keys.
            await tx.update(gameResultsTable).set({
              homeScore, awayScore, homeTeamWon: homeScore > awayScore, rawResultJson, updatedAt: new Date(),
            }).where(eq(gameResultsTable.gameId, id));
          }
        },
        async writeQuarantine(rawResultJson) {
          await tx.update(gameResultsTable).set({ rawResultJson, updatedAt: new Date() })
            .where(eq(gameResultsTable.gameId, id));
        },
      });
    }),
  };
  return reconcileNflFinal(store, input, new Date().toISOString(), batchConflict);
}
