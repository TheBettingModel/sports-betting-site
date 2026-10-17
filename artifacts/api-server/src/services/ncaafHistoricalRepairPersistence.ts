import type { pool as SharedPool } from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import { gamesTable, gameResultsTable } from "@workspace/db/schema";
import { reconcileNcaafFinal } from "./ncaafFinalIngestion";
import type { RepairApproval, RepairSnapshot, RepairStore } from "./ncaafHistoricalRepair";

type Pool = typeof SharedPool;
/** Inject an explicitly configured pool. No default DB, environment lookup,
 * application startup, network fetch, scheduler integration or executable CLI. */
export function createNcaafHistoricalRepairStore(pool: Pool): RepairStore {
  const database = drizzle(pool);
  let approved: RepairApproval["target"] | null = null;
  return {
    async verifyTarget(expected: RepairApproval["target"]) {
      if (!expected.host || !expected.database || !expected.role || pool.options.host !== expected.host
        || pool.options.database !== expected.database || pool.options.user !== expected.role
        || pool.options.connectionString) throw new Error("EXPLICIT_APPROVED_POOL_BINDING_REQUIRED");
      const { rows } = await pool.query(`SELECT current_database() AS database, current_user AS role,
        r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,r.rolinherit,
        (SELECT count(*)::int FROM pg_auth_members WHERE member=r.oid) AS memberships
        FROM pg_roles r WHERE r.rolname=current_user`);
      const r = rows[0];
      if (!r || r.database !== expected.database || r.role !== expected.role
        || ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls", "rolinherit"].some(k => r[k])
        || r.memberships !== 0) throw new Error("RESTRICTED_REPAIR_ROLE_REQUIRED");
      approved = { ...expected };
    },
    transaction: (id, work) => {
      if (!approved || pool.options.host !== approved.host || pool.options.database !== approved.database
        || pool.options.user !== approved.role || pool.options.connectionString) throw new Error("REPAIR_TARGET_NOT_VERIFIED");
      return database.transaction(async tx => {
      if (!/^NCAAF-[1-9]\d*$/.test(id)) throw new Error("NCAAF_ONLY_REPAIR");
      if (!approved || pool.options.host !== approved.host || pool.options.database !== approved.database
        || pool.options.user !== approved.role || pool.options.connectionString) throw new Error("REPAIR_TARGET_NOT_VERIFIED");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"ncaaf-final:" + id}))`);
      const time = await tx.execute(sql`SELECT current_timestamp AS observed_at, current_database() AS database, current_user AS role`);
      if (time.rows[0]?.database !== approved.database || time.rows[0]?.role !== approved.role) throw new Error("REPAIR_TRANSACTION_TARGET_CHANGED");
      const observed = time.rows[0]!.observed_at;
      const observedAt = (observed instanceof Date ? observed : new Date(String(observed))).toISOString();
      const read = async (): Promise<RepairSnapshot | null> => {
        const [game] = await tx.select().from(gamesTable).where(eq(gamesTable.id, id)).for("update");
        if (!game) return null;
        const [result] = await tx.select().from(gameResultsTable).where(eq(gameResultsTable.gameId, id)).for("update");
        const raw = result ? (await tx.execute(sql`SELECT raw_result_json IS NULL AS sql_null,
          md5(raw_result_json::text) AS raw_md5 FROM game_results WHERE game_id=${id}`)).rows[0] : null;
        const native = (await tx.execute(sql`SELECT to_jsonb(g) AS game,
          (SELECT to_jsonb(r) FROM game_results r WHERE r.game_id=g.id) AS result
          FROM games g WHERE g.id=${id}`)).rows[0];
        return JSON.parse(JSON.stringify({
          game, result: result ?? null, rawIsSqlNull: raw?.sql_null ?? null, rawMd5: raw?.raw_md5 ?? null,
          native,
        })) as RepairSnapshot;
      };
      return work({
        observedAt, read,
        async reconcile(input, asOf) {
          const outcome = await reconcileNcaafFinal({
            transaction: async (_id, execute) => {
              if (_id !== id) throw new Error("REPAIR_TRANSACTION_ID_MISMATCH");
              return execute({
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
                async ensureFixture() { return false; },
                async writeGame(homeScore, awayScore) {
                  await tx.update(gamesTable).set({ status: "final", homeScore, awayScore, updatedAt: new Date(observedAt) })
                    .where(and(eq(gamesTable.id, id), eq(gamesTable.sport, "NCAAF")));
                },
                async writeResult(homeScore, awayScore, rawResultJson, insert) {
                  // Explicit columns keep timestamp/identity defaults protected.
                  // Drizzle's all-column DEFAULT insert would require INSERT
                  // grants on every column, even fields we never supply.
                  if (insert) await tx.execute(sql`INSERT INTO game_results
                    (game_id, home_score, away_score, home_team_won, grading_source, status_detail, raw_result_json)
                    VALUES (${id}, ${homeScore}, ${awayScore}, ${homeScore > awayScore},
                      'espn', 'Final', ${JSON.stringify(rawResultJson)}::jsonb)`);
                  else await tx.update(gameResultsTable).set({
                    homeScore, awayScore, homeTeamWon: homeScore > awayScore, rawResultJson, updatedAt: new Date(observedAt),
                  }).where(eq(gameResultsTable.gameId, id));
                },
              });
            },
          }, input, asOf);
          return outcome.outcome;
        },
        async attach(receipt) {
          const before = await read();
          if (!before?.result || before.game.sport !== "NCAAF") throw new Error("REPAIR_RECEIPT_TARGET_MISSING");
          const raw = before.result.rawResultJson;
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("RECONCILIATION_PROVENANCE_REQUIRED");
          // Preserve native microseconds; a JS Date would truncate a new
          // result's SQL-default timestamp and invalidate the post-image hash.
          await tx.update(gameResultsTable).set({ rawResultJson: { ...raw, tbmNcaafHistoricalRepair: receipt },
            updatedAt: before.native?.result ? sql`${String(before.native.result.updated_at)}::timestamptz`
              : new Date(String(before.result.updatedAt)) }).where(eq(gameResultsTable.gameId, id));
        },
        async restore(before) {
          if (before.game.id !== id || before.game.sport !== "NCAAF" || !before.result
            || before.result.gameId !== id) throw new Error("UNSAFE_REPAIR_RESTORE");
          await tx.update(gamesTable).set({
            status: String(before.game.status), homeScore: before.game.homeScore as number | null,
            awayScore: before.game.awayScore as number | null,
            updatedAt: before.native ? sql`${String(before.native.game.updated_at)}::timestamptz` : new Date(String(before.game.updatedAt)),
          }).where(and(eq(gamesTable.id, id), eq(gamesTable.sport, "NCAAF")));
          const raw = before.result.rawResultJson;
          await tx.update(gameResultsTable).set({
            homeScore: Number(before.result.homeScore), awayScore: Number(before.result.awayScore),
            homeTeamWon: before.result.homeTeamWon as boolean,
            rawResultJson: raw === null && before.rawIsSqlNull === false ? sql`'null'::jsonb` : raw,
            updatedAt: before.native?.result ? sql`${String(before.native.result.updated_at)}::timestamptz` : new Date(String(before.result.updatedAt)),
          }).where(and(eq(gameResultsTable.gameId, id), eq(gameResultsTable.id, Number(before.result.id))));
        },
      });
      });
    },
  };
}
