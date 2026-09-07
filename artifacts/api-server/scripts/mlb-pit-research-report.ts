/** Read-only reusable MLB PIT research summary; requires DATABASE_URL. */
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, gamesTable, mlbForecastEvaluationsTable, mlbForecastEvidenceTable } from "@workspace/db";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const cohort = args[0] ?? "LIVE_SHADOW";
const from = args[1];
const to = args[2];
if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
  throw new Error("Usage: report:mlb-pit [cohort] [YYYY-MM-DD from] [YYYY-MM-DD to]");
}
const rows = await db.select({
  count: sql<number>`count(*)::int`,
  avgBrier: sql<number | null>`avg(${mlbForecastEvaluationsTable.brierScore})`,
  avgLogLoss: sql<number | null>`avg(${mlbForecastEvaluationsTable.logLoss})`,
  avgBrierSkill: sql<number | null>`avg(${mlbForecastEvaluationsTable.brierSkill})`,
  avgCompleteness: sql<number | null>`avg(${mlbForecastEvidenceTable.dataQuality})`,
  avgTotalResidual: sql<number | null>`avg((${mlbForecastEvaluationsTable.residuals}->>'total')::double precision)`,
}).from(mlbForecastEvidenceTable)
  .leftJoin(mlbForecastEvaluationsTable, eq(mlbForecastEvaluationsTable.forecastEvidenceId, mlbForecastEvidenceTable.id))
  .innerJoin(gamesTable, eq(gamesTable.id, mlbForecastEvidenceTable.gameId))
  .where(and(eq(mlbForecastEvidenceTable.cohort, cohort), ...(from ? [gte(gamesTable.gameDate, from)] : []), ...(to ? [lte(gamesTable.gameDate, to)] : [])));
console.log(JSON.stringify({ schemaVersion: "mlb-pit-report-v1", readOnly: true, cohort, from: from ?? null, to: to ?? null, summary: rows[0] ?? null }, null, 2));