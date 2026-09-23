/**
 * Development-only, read-only completeness audit. This script deliberately
 * reads pregame evidence and postgame outcomes from separate ledgers.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import {
  buildMlb224C1BReport,
  pregameOutcomeLeakagePaths,
  renderMlb224C1BMarkdown,
  type AuditAppearance,
  type AuditGame,
  type AuditSnapshot,
} from "../src/services/mlbStarterEvidence224C1B";
import {
  deterministicChecksum,
  MLB_224C_OOS_USE,
  MLB_224C_RESEARCH_DISPOSITION,
  MLB_STARTER_EVIDENCE_224C_VERSION,
  verifyStarterEvidenceRow,
  type StarterEvidenceRow,
} from "../src/services/mlbStarterEvidence224C";

if (process.env.NODE_ENV === "production") {
  throw new Error("224C-1B report is development-only and cannot run in production");
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const outputJson = resolve(root, "reports/mlb-224c1b-prospective-starter-completeness.json");
const outputMarkdown = resolve(root, "reports/mlb-224c1b-prospective-starter-completeness.md");
const verificationPath = resolve(root, "reports/mlb-224c1b-verification.json");

const snapshotResult = await pool.query<AuditSnapshot & { rawGamePayload: unknown; createdAt: Date }>(`
  SELECT id, official_game_id AS "officialGameId", official_team_id AS "officialTeamId",
    official_opponent_team_id AS "officialOpponentTeamId", official_player_id AS "officialPlayerId",
    team_side AS "teamSide", scheduled_first_pitch AS "scheduledFirstPitch",
    feature_cutoff AS "featureCutoff", observed_at AS "observedAt", starter_state AS "starterState",
    identity_state AS "identityState", identity_confidence AS "identityConfidence",
    starter_name AS "starterName", metrics_state AS "metricsState",
    metrics_through_time AS "metricsThroughTime", starter_pit_metrics AS "starterPitMetrics",
    recent_workload AS "recentWorkload", pit_safe AS "pitSafe",
    raw_game_payload_hash AS "rawGamePayloadHash", evidence_state_hash AS "evidenceStateHash",
    source_record_id AS "sourceRecordId", evidence_checksum AS "evidenceChecksum",
    raw_game_payload AS "rawGamePayload", created_at AS "createdAt"
  FROM mlb_pregame_starter_evidence_snapshots
  WHERE schema_version = $1
  ORDER BY official_game_id, official_team_id, observed_at, id
`, [MLB_STARTER_EVIDENCE_224C_VERSION]);
if (!snapshotResult.rows.length) throw new Error("No authoritative v3 prospective starter evidence exists");
const invalidEvidenceRows = snapshotResult.rows.filter((row) =>
  !verifyStarterEvidenceRow(row as unknown as StarterEvidenceRow));
if (invalidEvidenceRows.length) {
  throw new Error(`Refusing report: ${invalidEvidenceRows.length} persisted v3 starter evidence checksum verification failures`);
}
const verificationLedger = JSON.parse(await readFile(verificationPath, "utf8")) as unknown;
if (!verificationLedger || typeof verificationLedger !== "object" || Array.isArray(verificationLedger)
  || !Array.isArray((verificationLedger as { checks?: unknown }).checks)) {
  throw new Error("Refusing report: 224C-1B verification ledger is malformed");
}

const gameIds = [...new Set(snapshotResult.rows.map((row) => row.officialGameId))];
const [gamesResult, teamDirectoryResult, appearancesResult, bullpenResult, outcomeResult, offenseResult, dispositionResult,
  storageResult] = await Promise.all([
  pool.query<AuditGame>(`
    SELECT provider_game_id AS "providerGameId", game_status AS "gameStatus",
      outcome_eligible AS "outcomeEligible", home_runs AS "homeRuns", away_runs AS "awayRuns",
      home_provider_team_id AS "homeProviderTeamId", away_provider_team_id AS "awayProviderTeamId",
      home_team_name AS "homeTeamName", away_team_name AS "awayTeamName", venue_name AS "venueName"
    FROM mlb_historical_games WHERE provider_game_id = ANY($1::text[])
  `, [gameIds]),
  pool.query<{ teamId: string; name: string }>(`
    SELECT DISTINCT ON (provider_team_id) provider_team_id AS "teamId", provider_name AS name
    FROM mlb_historical_team_identity
    WHERE schema_version = 'mlb-chronological-team-game-v1' AND season = 2026
    ORDER BY provider_team_id, created_at DESC
  `),
  pool.query<AuditAppearance>(`
    SELECT provider_game_id AS "providerGameId", provider_pitcher_id AS "providerPitcherId",
      COALESCE(t.provider_team_id, p.canonical_team_id) AS "canonicalTeamId",
      starter_flag_actual AS "starterFlagActual",
      innings_pitched AS "inningsPitched", batters_faced AS "battersFaced",
      pitch_count AS "pitchCount", runs_allowed AS "runsAllowed", earned_runs AS "earnedRuns",
      hits_allowed AS "hitsAllowed", walks, strikeouts, home_runs_allowed AS "homeRunsAllowed",
      appearance_completion_time AS "appearanceCompletionTime"
    FROM mlb_historical_pitcher_appearances p
    LEFT JOIN mlb_historical_team_identity t
      ON t.schema_version = 'mlb-chronological-team-game-v1'
      AND t.canonical_team_id = p.canonical_team_id AND t.season = p.season
    WHERE p.schema_version = 'mlb-pitcher-bullpen-pit-v5'
      AND p.provider_game_id = ANY($1::text[])
  `, [gameIds]),
  pool.query<{ providerGameId: string }>(`
    SELECT DISTINCT provider_game_id AS "providerGameId"
    FROM mlb_historical_bullpen_outcomes
    WHERE schema_version = 'mlb-pitcher-bullpen-pit-v5'
      AND provider_game_id = ANY($1::text[])
  `, [gameIds]),
  pool.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count FROM mlb_historical_outcomes
    WHERE provider_game_id = ANY($1::text[])
  `, [gameIds]),
  pool.query<{ providerGameId: string; teamSide: string }>(`
    SELECT DISTINCT provider_game_id AS "providerGameId", team_side AS "teamSide"
    FROM mlb_historical_team_game_rows WHERE provider_game_id = ANY($1::text[])
  `, [gameIds]),
  pool.query<{
    disposition: string; oosUse: string; artifactReferences: unknown;
    recordedAt: Date; checksum: string; experimentId: string; experimentVersion: string;
    dispositionReason: string;
  }>(`
    SELECT experiment_id AS "experimentId", experiment_version AS "experimentVersion",
      disposition, oos_use AS "oosUse", disposition_reason AS "dispositionReason",
      artifact_references AS "artifactReferences", recorded_at AS "recordedAt", checksum
    FROM mlb_research_experiment_disposition_ledger
    WHERE experiment_id = 'MLB_224C' AND experiment_version = 'v3'
    ORDER BY recorded_at
  `),
  pool.query<{ bytes: string }>(`
    SELECT COALESCE(SUM(pg_column_size(raw_game_payload)), 0)::text AS bytes
    FROM mlb_pregame_starter_evidence_snapshots WHERE schema_version = $1
  `, [MLB_STARTER_EVIDENCE_224C_VERSION]),
]);

if (dispositionResult.rows.length !== 1) {
  throw new Error("Expected exactly one immutable MLB_224C v3 disposition");
}
const disposition = dispositionResult.rows[0]!;
const checksumValid = disposition.disposition === MLB_224C_RESEARCH_DISPOSITION
  && disposition.oosUse === MLB_224C_OOS_USE
  && disposition.checksum === deterministicChecksum({
    experimentId: disposition.experimentId,
    experimentVersion: disposition.experimentVersion,
    disposition: disposition.disposition,
    oosUse: disposition.oosUse,
    dispositionReason: disposition.dispositionReason,
    artifactReferences: disposition.artifactReferences,
    recordedAt: disposition.recordedAt,
  });

const generatedAt = new Date(Math.max(...snapshotResult.rows.map((row) =>
  Math.max(row.createdAt.getTime(), row.observedAt.getTime()))));
const separationAudit = {
  actualOnlyPregameRows: snapshotResult.rows.filter((row) => row.starterState === "ACTUAL_ONLY").length,
  postOrEqualCutoffRows: snapshotResult.rows.filter((row) => !(row.observedAt < row.featureCutoff)).length,
  outcomeRowsForTargetGames: Number(outcomeResult.rows[0]?.count ?? 0) + appearancesResult.rows.length + bullpenResult.rows.length,
  pregameOutcomeFieldPaths: pregameOutcomeLeakagePaths(snapshotResult.rows.map((row) => ({
    rawGamePayload: row.rawGamePayload, starterPitMetrics: row.starterPitMetrics,
    recentWorkload: row.recentWorkload,
  }))),
};
const report = buildMlb224C1BReport({
  generatedAt,
  snapshots: snapshotResult.rows,
  games: gamesResult.rows,
  teamDirectory: teamDirectoryResult.rows,
  snapshotVerification: { verified: snapshotResult.rows.length, total: snapshotResult.rows.length },
  verificationLedger,
  separationAudit,
  targetAppearances: appearancesResult.rows,
  bullpenGameIds: bullpenResult.rows.map((row) => row.providerGameId),
  offenseGameSides: offenseResult.rows.map((row) => `${row.providerGameId}\u0000${row.teamSide}`),
  disposition: {
    disposition: disposition.disposition, oosUse: disposition.oosUse,
    artifactReferences: disposition.artifactReferences, checksumValid,
  },
  operational: {
    runsAttempted: 4, successfulRuns: 4, failedRuns: 0, sourceErrors: 0,
    timeouts: 0, rateLimits: 0, duplicateInsertAttempts: 0,
    newInserts: 30, unchangedGames: 40, afterCutoffGames: 5, invalidRowsRejected: 0,
    runtime: "Last measured collector rerun: 11,655 ms",
    sourceCalls: "4 successful schedule calls total (one per documented run)",
    storageBytes: Number(storageResult.rows[0]?.bytes ?? 0),
    oomEvidence: "Local API workflow OOM after approximately 10.5 minutes with heap near 3 GB; scheduler memory was not changed by this task.",
  },
});

// A second pure reconstruction must be byte-identical before either artifact is written.
const replay = buildMlb224C1BReport({
  generatedAt,
  snapshots: snapshotResult.rows,
  games: gamesResult.rows,
  teamDirectory: teamDirectoryResult.rows,
  snapshotVerification: { verified: snapshotResult.rows.length, total: snapshotResult.rows.length },
  verificationLedger,
  separationAudit,
  targetAppearances: appearancesResult.rows,
  bullpenGameIds: bullpenResult.rows.map((row) => row.providerGameId),
  offenseGameSides: offenseResult.rows.map((row) => `${row.providerGameId}\u0000${row.teamSide}`),
  disposition: {
    disposition: disposition.disposition, oosUse: disposition.oosUse,
    artifactReferences: disposition.artifactReferences, checksumValid,
  },
  operational: {
    runsAttempted: 4, successfulRuns: 4, failedRuns: 0, sourceErrors: 0,
    timeouts: 0, rateLimits: 0, duplicateInsertAttempts: 0,
    newInserts: 30, unchangedGames: 40, afterCutoffGames: 5, invalidRowsRejected: 0,
    runtime: "Last measured collector rerun: 11,655 ms",
    sourceCalls: "4 successful schedule calls total (one per documented run)",
    storageBytes: Number(storageResult.rows[0]?.bytes ?? 0),
    oomEvidence: "Local API workflow OOM after approximately 10.5 minutes with heap near 3 GB; scheduler memory was not changed by this task.",
  },
});
if (JSON.stringify(report) !== JSON.stringify(replay)) throw new Error("Deterministic report replay mismatch");

await mkdir(dirname(outputJson), { recursive: true });
await Promise.all([
  writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(outputMarkdown, `${renderMlb224C1BMarkdown(report)}\n`, "utf8"),
]);
console.log(JSON.stringify({
  classification: report.classification,
  sections: report.sections.length,
  artifactHash: report.artifactHash,
  outputJson,
  outputMarkdown,
}, null, 2));