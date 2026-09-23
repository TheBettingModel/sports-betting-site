/**
 * Disabled manual-development entry point for #224C. It has only an explicitly
 * enabled development package command and no scheduler registration.
 *
 * To use locally: MLB_STARTER_EVIDENCE_224C_MANUAL=1 tsx this-file YYYY-MM-DD
 */
import { db, mlbPregameStarterEvidenceSnapshotsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  collectProspectiveOfficialMlbStarterEvidence,
  MLB_STARTER_EVIDENCE_224C_VERSION,
  type OfficialMlbSchedule,
} from "../src/services/mlbStarterEvidence224C";

if (process.env.MLB_STARTER_EVIDENCE_224C_MANUAL !== "1") {
  throw new Error("Disabled #224C manual collector. Set MLB_STARTER_EVIDENCE_224C_MANUAL=1 explicitly.");
}
const date = process.argv.slice(2).find((argument) => /^\d{4}-\d{2}-\d{2}$/.test(argument));
if (!date) throw new Error("Usage: ...mlb-starter-evidence-224c-manual.ts YYYY-MM-DD");

const result = await collectProspectiveOfficialMlbStarterEvidence(date, {
  client: {
    async getSchedule(url): Promise<OfficialMlbSchedule> {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`MLB Stats API schedule request failed: ${response.status}`);
      return response.json() as Promise<OfficialMlbSchedule>;
    },
  },
  repository: {
    async existingStateHashes(gameIds) {
      if (!gameIds.length) return new Set<string>();
      const rows = await db.select({
        officialGameId: mlbPregameStarterEvidenceSnapshotsTable.officialGameId,
        evidenceStateHash: mlbPregameStarterEvidenceSnapshotsTable.evidenceStateHash,
      }).from(mlbPregameStarterEvidenceSnapshotsTable)
        .where(and(
          eq(mlbPregameStarterEvidenceSnapshotsTable.schemaVersion, MLB_STARTER_EVIDENCE_224C_VERSION),
          inArray(mlbPregameStarterEvidenceSnapshotsTable.officialGameId, [...gameIds]),
        ));
      return new Set(rows.filter((row) => row.evidenceStateHash !== null)
        .map((row) => `${row.officialGameId}:${row.evidenceStateHash}`));
    },
    async append(rows) {
      if (!rows.length) return 0;
      const inserted = await db.insert(mlbPregameStarterEvidenceSnapshotsTable)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: mlbPregameStarterEvidenceSnapshotsTable.id });
      return inserted.length;
    },
  },
});
console.log(JSON.stringify(result, null, 2));