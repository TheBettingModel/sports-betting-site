import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  GUARDED_SERVING_APPEND_ONLY_SQL,
  GUARDED_SERVING_APPEND_ONLY_TABLES,
} from "../src/services/guardedServing/appendOnlyGuards";

await db.transaction(async (tx) => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"guarded-serving-append-only-guards"}))`);
  await tx.execute(sql.raw(GUARDED_SERVING_APPEND_ONLY_SQL));
});
process.stdout.write(`Installed append-only guards on ${GUARDED_SERVING_APPEND_ONLY_TABLES.length} guarded-serving tables\n`);