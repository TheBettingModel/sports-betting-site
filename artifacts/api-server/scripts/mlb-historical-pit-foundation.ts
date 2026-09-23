import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  db,
  mlbHistoricalArtifactsTable,
  mlbHistoricalExclusionsTable,
  mlbHistoricalGamesTable,
  mlbHistoricalOutcomesTable,
  mlbHistoricalSplitsTable,
  mlbHistoricalTeamGameRowsTable,
  mlbHistoricalTeamIdentityTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { MLB_HISTORICAL_APPEND_ONLY_SQL } from "../src/services/mlbHistoricalAppendOnly";
import { buildMlbHistoricalPitFoundation } from "../src/services/mlbHistoricalPitFoundation";
import { fetchHistoricalMlbSchedule, historicalPayloadHash } from "../src/services/mlbHistoricalSource";

const ARTIFACT_KEY = "mlb-historical-2023-2026-v1";
const SPLIT_VERSION = "mlb-chronological-split-2023-2026-v1";
const RETRIEVAL_CUTOFF = "2026-09-04";
const SEASONS = [
  { season: 2023, startDate: "2023-03-01", endDate: "2023-11-30" },
  { season: 2024, startDate: "2024-03-01", endDate: "2024-11-30" },
  { season: 2025, startDate: "2025-03-01", endDate: "2025-11-30" },
  { season: 2026, startDate: "2026-03-01", endDate: RETRIEVAL_CUTOFF },
] as const;

async function insertBatches<T>(
  rows: readonly T[],
  insert: (batch: T[]) => Promise<unknown>,
  batchSize = 250,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    await insert(rows.slice(offset, offset + batchSize));
  }
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const sourceRows = [];
  const sourceRequests = [];
  for (const range of SEASONS) {
    const result = await fetchHistoricalMlbSchedule(range);
    sourceRows.push(...result.rows.filter((row) => row.season === range.season));
    sourceRequests.push({
      season: range.season,
      startDate: range.startDate,
      endDate: range.endDate,
      retrievedAt: result.retrievedAt,
      requestUrl: result.requestUrl,
      payloadHash: result.payloadHash,
      parsedRows: result.rows.length,
    });
    console.log(`Fetched MLB ${range.season}: ${result.rows.length} schedule rows`);
  }

  const foundation = buildMlbHistoricalPitFoundation(sourceRows, { artifactKey: ARTIFACT_KEY });
  const retrievedAt = new Date();
  const sourceManifest = sourceRequests.map(({ season, startDate, endDate, requestUrl, payloadHash, parsedRows }) => ({
    season, startDate, endDate, requestUrl, payloadHash, parsedRows,
  }));
  const sourceManifestHash = historicalPayloadHash(sourceManifest);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ARTIFACT_KEY}))`);
    const [existingArtifact] = await tx.select().from(mlbHistoricalArtifactsTable)
      .where(eq(mlbHistoricalArtifactsTable.artifactKey, ARTIFACT_KEY)).limit(1);
    if (existingArtifact && (
      existingArtifact.sourceManifestHash !== sourceManifestHash
      || existingArtifact.foundationChecksum !== foundation.checksum
      || existingArtifact.replayChecksum !== foundation.replayChecksum
    )) {
      throw new Error(
        `Historical artifact ${ARTIFACT_KEY} is sealed; changed source inputs require a new artifact key`,
      );
    }
    if (existingArtifact) {
      await tx.execute(sql.raw(MLB_HISTORICAL_APPEND_ONLY_SQL));
      return;
    }

    await tx.insert(mlbHistoricalArtifactsTable).values({
      artifactKey: ARTIFACT_KEY,
      sourceManifest,
      sourceManifestHash,
      foundationChecksum: foundation.checksum,
      replayChecksum: foundation.replayChecksum,
      retrievalCutoff: new Date(`${RETRIEVAL_CUTOFF}T23:59:59Z`),
      status: "SEALED_PARTIAL_FOUNDATION",
      sealedAt: retrievedAt,
    });

    await insertBatches(foundation.games, (batch) => tx.insert(mlbHistoricalGamesTable).values(
    batch.map((game) => ({
      canonicalGameId: game.canonicalGameId,
      provider: "mlb_stats_api",
      providerGameId: game.source.providerGameId,
      season: game.source.season,
      gameType: game.source.gameType,
      gameDate: new Date(`${game.source.gameDate}T00:00:00Z`),
      scheduledFirstPitch: new Date(game.source.scheduledFirstPitch),
      actualStartTime: game.source.actualStartTime ? new Date(game.source.actualStartTime) : null,
      completionTime: game.source.completionTime ? new Date(game.source.completionTime) : null,
      homeProviderTeamId: game.source.home.providerTeamId,
      awayProviderTeamId: game.source.away.providerTeamId,
      homeTeamName: game.source.home.name,
      awayTeamName: game.source.away.name,
      venueProviderId: game.source.venue?.providerVenueId ?? null,
      venueName: game.source.venue?.name ?? null,
      homeStarterProviderPlayerId: game.source.probableStarters.home?.providerPlayerId ?? null,
      awayStarterProviderPlayerId: game.source.probableStarters.away?.providerPlayerId ?? null,
      homeStarterName: game.source.probableStarters.home?.name ?? null,
      awayStarterName: game.source.probableStarters.away?.name ?? null,
      homeStarterState: game.source.starterState.home,
      awayStarterState: game.source.starterState.away,
      homeRuns: game.source.homeRuns,
      awayRuns: game.source.awayRuns,
      inningsPlayed: game.source.inningsPlayed,
      gameStatus: game.source.detailedStatus,
      gameNumber: game.source.gameNumber,
      doubleheaderStatus: game.source.doubleheaderStatus,
      postseason: game.source.postseason,
      neutralSite: game.source.neutralSite,
      suspended: game.source.suspended,
      resumed: game.source.resumed,
      outcomeEligible: game.outcomeEligible,
      sourcePayloadHash: game.source.payloadHash,
      sourceRetrievedAt: retrievedAt,
      provenance: {
        sourceVersion: "mlb-stats-api-history-v1",
        reconstructionRule: "official provider IDs and final schedule outcomes only",
        pregameStarterBoundary: game.source.starterState,
      },
    })),
  ).onConflictDoNothing());

    await insertBatches(foundation.games, (batch) => tx.insert(mlbHistoricalOutcomesTable).values(
    batch.map((game) => {
      const homeRuns = game.source.homeRuns!;
      const awayRuns = game.source.awayRuns!;
      const outcome = {
        canonicalGameId: game.canonicalGameId,
        homeRuns,
        awayRuns,
        inningsPlayed: game.source.inningsPlayed,
        sourcePayloadHash: game.source.payloadHash,
      };
      return {
        artifactKey: ARTIFACT_KEY,
        canonicalGameId: game.canonicalGameId,
        providerGameId: game.source.providerGameId,
        season: game.source.season,
        homeRuns,
        awayRuns,
        winnerSide: homeRuns === awayRuns ? "TIE" : homeRuns > awayRuns ? "HOME" : "AWAY",
        runDifference: homeRuns - awayRuns,
        gameTotal: homeRuns + awayRuns,
        inningsPlayed: game.source.inningsPlayed,
        extraInnings: (game.source.inningsPlayed ?? 9) > 9,
        settlementStatus: "FINAL_PROVIDER_OUTCOME",
        completionTime: game.source.completionTime ? new Date(game.source.completionTime) : null,
        completionBoundaryState: game.source.chronologyState,
        sourcePayloadHash: game.source.payloadHash,
        outcomeHash: historicalPayloadHash(outcome),
      };
    }),
  ).onConflictDoNothing());

  const teamIdentities = new Map<string, {
    providerTeamId: string;
    season: number;
    providerName: string;
    sourcePayloadHash: string;
  }>();
  for (const game of foundation.games) {
    for (const side of ["home", "away"] as const) {
      const team = game.source[side];
      teamIdentities.set(`${game.source.season}:${team.providerTeamId}`, {
        providerTeamId: team.providerTeamId,
        season: game.source.season,
        providerName: team.name,
        sourcePayloadHash: game.source.payloadHash,
      });
    }
  }
    await insertBatches([...teamIdentities.values()], (batch) =>
    tx.insert(mlbHistoricalTeamIdentityTable).values(batch.map((team) => ({
      provider: "mlb_stats_api",
      providerTeamId: team.providerTeamId,
      season: team.season,
      canonicalTeamId: `mlb-team:${team.providerTeamId}`,
      franchiseId: `mlb-franchise:${team.providerTeamId}`,
      abbreviation: null,
      providerName: team.providerName,
      resolutionState: "RESOLVED",
      resolutionRule: "EXACT_MLB_TEAM_ID",
      sourcePayloadHash: team.sourcePayloadHash,
    }))).onConflictDoNothing());

    await insertBatches(foundation.rows, (batch) =>
    tx.insert(mlbHistoricalTeamGameRowsTable).values(batch.map((row) => ({
      ...row,
      targets: {},
      scheduledFirstPitch: new Date(row.scheduledFirstPitch),
      featureCutoff: new Date(row.featureCutoff),
    }))).onConflictDoNothing());

  const sourceById = new Map(sourceRows.map((row) => [row.providerGameId, row]));
    await insertBatches(foundation.exclusions, (batch) =>
    tx.insert(mlbHistoricalExclusionsTable).values(batch.flatMap((excluded) =>
      excluded.reasons.map((reasonCode) => {
        const source = sourceById.get(excluded.providerGameId);
        const evidence = {
          providerGameId: excluded.providerGameId,
          status: source?.detailedStatus ?? null,
          gameType: source?.gameType ?? null,
          gameDate: source?.gameDate ?? null,
        };
        return {
          artifactKey: ARTIFACT_KEY,
          provider: "mlb_stats_api",
          providerGameId: excluded.providerGameId,
          season: source?.season ?? null,
          reasonCode,
          reasonDetail: `Historical row excluded by ${reasonCode}`,
          evidence,
          evidenceHash: historicalPayloadHash(evidence),
        };
      }),
    )).onConflictDoNothing());

    await insertBatches(foundation.splits, (batch) =>
    tx.insert(mlbHistoricalSplitsTable).values(batch.map((split) => ({
      splitVersion: SPLIT_VERSION,
      canonicalGameId: split.canonicalGameId,
      cohort: split.cohort,
      assignedAt: new Date(`${RETRIEVAL_CUTOFF}T23:59:59Z`),
      assignmentRule: split.assignmentRule,
      immutable: true,
      foundationChecksum: foundation.checksum,
      assignmentHash: split.assignmentHash,
    }))).onConflictDoNothing());

    await tx.execute(sql.raw(MLB_HISTORICAL_APPEND_ONLY_SQL));
  });

  const report = {
    task: "224B",
    classification: "C — PARTIAL FOUNDATION",
    trainingSafe: false,
    pitSafetyStatus: "UNVERIFIED_COMPLETION_BOUNDARIES",
    artifactKey: ARTIFACT_KEY,
    schemaVersion: "mlb-chronological-team-game-v1",
    splitVersion: SPLIT_VERSION,
    retrievalCutoff: RETRIEVAL_CUTOFF,
    sourceRequests,
    sourceManifestHash,
    summary: foundation.summary,
    checksum: foundation.checksum,
    replayChecksum: foundation.replayChecksum,
    starterBoundary: "Final historical schedule probablePitcher is ACTUAL_ONLY, never CONFIRMED_PREGAME",
    lineupBoundary: "UNAVAILABLE historically; prospective-only",
    weatherBoundary: "UNAVAILABLE historically; prospective-only",
    marketFirewall: "Sportsbook data is absent from every historical sports feature row",
    completionBoundary: "Normal-game date ordering is a reconstructable proxy; no row is claimed PIT-safe for training until completion times are proven",
    buildStartedAt: startedAt.toISOString(),
    buildCompletedAt: new Date().toISOString(),
  };
  const outputPath = resolve(process.cwd(), "../../reports/mlb-historical-pit-foundation-2026-09-04.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

await main();