import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  MLB_HISTORICAL_APPEND_ONLY_SQL,
  MLB_HISTORICAL_APPEND_ONLY_TABLES,
} from "../src/services/mlbHistoricalAppendOnly";

await db.transaction(async (tx) => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"mlb-historical-append-only-guards"}))`);
  await tx.execute(sql.raw(MLB_HISTORICAL_APPEND_ONLY_SQL));
});

console.log(`Installed append-only guards on ${MLB_HISTORICAL_APPEND_ONLY_TABLES.length} MLB historical tables`);