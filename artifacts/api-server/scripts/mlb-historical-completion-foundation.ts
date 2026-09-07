import {
  MLB_HISTORICAL_SCHEMA_VERSION,
  db,
  mlbHistoricalArtifactsTable,
  mlbHistoricalChronologyDecisionsTable,
  mlbHistoricalCompletionEvidenceTable,
  mlbHistoricalExclusionsTable,
  mlbHistoricalGamesTable,
  mlbHistoricalOutcomesTable,
  mlbHistoricalRawCompletionSnapshotsTable,
  mlbHistoricalSplitsTable,
  mlbHistoricalTeamGameRowsTable,
  mlbHistoricalTeamIdentityTable,
} from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { MLB_HISTORICAL_APPEND_ONLY_SQL } from "../src/services/mlbHistoricalAppendOnly";
import {
  buildMlbHistoricalCompletionFoundation,
  type CompletionFoundationGame,
} from "../src/services/mlbHistoricalCompletionFoundation";
import type { HistoricalSplit } from "../src/services/mlbHistoricalPitFoundation";
import {
  MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY,
  MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
  type HistoricalCompletionEvidence,
} from "../src/services/mlbHistoricalChronology";
import { historicalPayloadHash } from "../src/services/mlbHistoricalSource";

const V1_ARTIFACT_KEY = "mlb-historical-2023-2026-v1";
const V1_SPLIT_VERSION = "mlb-chronological-split-2023-2026-v1";
const CHRONOLOGY_SPLIT_VERSION = "mlb-completion-chronology-split-2023-2026-v3";
const ARTIFACT_KEY = MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY;
const BATCH_SIZE = 200;

async function insertBatches<T>(
  rows: readonly T[],
  insert: (batch: readonly T[]) => Promise<unknown>,
  batchSize = BATCH_SIZE,
): Promise<void> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error(`Invalid insert batch size: ${batchSize}`);
  }
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    if (!batch.length) throw new Error("Refusing an empty historical insert batch");
    await insert(batch);
  }
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function evidenceFromRow(row: typeof mlbHistoricalCompletionEvidenceTable.$inferSelect): HistoricalCompletionEvidence {
  return {
    canonicalGameId: row.canonicalGameId,
    providerGameId: row.providerGameId,
    endpoint: row.endpoint,
    retrievedAt: row.retrievedAt.toISOString(),
    scheduledStartTime: row.scheduledStartTime.toISOString(),
    actualStartTime: iso(row.actualStartTime),
    firstPlayStartTime: iso(row.firstPlayStartTime),
    lastPlayStartTime: iso(row.lastPlayStartTime),
    lastPlayEndTime: iso(row.lastPlayEndTime),
    gameEndTime: iso(row.gameEndTime),
    finalStatusTime: iso(row.finalStatusTime),
    providerFinalSeenAt: row.providerFinalSeenAt.toISOString(),
    canonicalCompletionTime: iso(row.canonicalCompletionTime),
    completionTimeSource: row.completionTimeSource as HistoricalCompletionEvidence["completionTimeSource"],
    completionTimeMethod: row.completionTimeMethod as HistoricalCompletionEvidence["completionTimeMethod"],
    completionTimeConfidence: row.completionTimeConfidence as HistoricalCompletionEvidence["completionTimeConfidence"],
    completionTimePrecision: row.completionTimePrecision as HistoricalCompletionEvidence["completionTimePrecision"],
    featureCutoff: iso(row.featureCutoff),
    featureCutoffSource: row.featureCutoffSource as HistoricalCompletionEvidence["featureCutoffSource"],
    featureCutoffConfidence: row.featureCutoffConfidence as HistoricalCompletionEvidence["featureCutoffConfidence"],
    completionDateEt: row.completionDateEt,
    gameStatus: row.gameStatus,
    statusCode: row.statusCode,
    finalStatus: row.finalStatus,
    terminalPlayComplete: row.terminalPlayComplete,
    playCount: row.playCount,
    inningsPlayed: row.inningsPlayed,
    postponed: row.postponed,
    suspended: row.suspended,
    resumed: row.resumed,
    crossedMidnightUtc: row.crossedMidnightUtc,
    quarantineReason: row.quarantineReason,
    evidencePayload: row.evidencePayload as Record<string, unknown>,
    rawPayloadHash: row.rawPayloadHash,
    evidenceHash: row.evidenceHash,
    resolverVersion: row.resolverVersion as HistoricalCompletionEvidence["resolverVersion"],
  };
}

async function main(): Promise<void> {
  const [
    sourceArtifacts,
    v1Games,
    evidenceRows,
    rawSnapshots,
    v1Identities,
    v1Exclusions,
    v1Splits,
  ] = await Promise.all([
    db.select().from(mlbHistoricalArtifactsTable).where(and(
      eq(mlbHistoricalArtifactsTable.schemaVersion, MLB_HISTORICAL_SCHEMA_VERSION),
      eq(mlbHistoricalArtifactsTable.artifactKey, V1_ARTIFACT_KEY),
    )),
    db.select().from(mlbHistoricalGamesTable).where(eq(
      mlbHistoricalGamesTable.schemaVersion, MLB_HISTORICAL_SCHEMA_VERSION,
    )).orderBy(asc(mlbHistoricalGamesTable.scheduledFirstPitch), asc(mlbHistoricalGamesTable.providerGameId)),
    db.select().from(mlbHistoricalCompletionEvidenceTable).where(and(
      eq(mlbHistoricalCompletionEvidenceTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION),
      eq(mlbHistoricalCompletionEvidenceTable.artifactKey, ARTIFACT_KEY),
    )).orderBy(asc(mlbHistoricalCompletionEvidenceTable.canonicalGameId)),
    db.select({
      canonicalGameId: mlbHistoricalRawCompletionSnapshotsTable.canonicalGameId,
      providerGameId: mlbHistoricalRawCompletionSnapshotsTable.providerGameId,
      endpoint: mlbHistoricalRawCompletionSnapshotsTable.endpoint,
      retrievedAt: mlbHistoricalRawCompletionSnapshotsTable.retrievedAt,
      rawBodyHash: mlbHistoricalRawCompletionSnapshotsTable.rawBodyHash,
      byteLength: mlbHistoricalRawCompletionSnapshotsTable.byteLength,
    }).from(mlbHistoricalRawCompletionSnapshotsTable).where(and(
      eq(mlbHistoricalRawCompletionSnapshotsTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION),
      eq(mlbHistoricalRawCompletionSnapshotsTable.artifactKey, ARTIFACT_KEY),
    )).orderBy(asc(mlbHistoricalRawCompletionSnapshotsTable.canonicalGameId)),
    db.select().from(mlbHistoricalTeamIdentityTable).where(eq(
      mlbHistoricalTeamIdentityTable.schemaVersion, MLB_HISTORICAL_SCHEMA_VERSION,
    )),
    db.select().from(mlbHistoricalExclusionsTable).where(and(
      eq(mlbHistoricalExclusionsTable.schemaVersion, MLB_HISTORICAL_SCHEMA_VERSION),
      eq(mlbHistoricalExclusionsTable.artifactKey, V1_ARTIFACT_KEY),
    )),
    db.select().from(mlbHistoricalSplitsTable).where(and(
      eq(mlbHistoricalSplitsTable.schemaVersion, MLB_HISTORICAL_SCHEMA_VERSION),
      eq(mlbHistoricalSplitsTable.splitVersion, V1_SPLIT_VERSION),
    )),
  ]);
  const v1Artifact = sourceArtifacts.at(0);
  if (!v1Artifact || sourceArtifacts.length !== 1 || v1Artifact.status !== "SEALED_PARTIAL_FOUNDATION") {
    throw new Error(`Expected exactly one sealed v1 artifact: ${V1_ARTIFACT_KEY}`);
  }

  const evidenceByGame = new Map(evidenceRows.map((row) => [row.canonicalGameId, row]));
  const rawSnapshotByGame = new Map(rawSnapshots.map((row) => [row.canonicalGameId, row]));
  if (evidenceByGame.size !== evidenceRows.length || evidenceByGame.size !== v1Games.length
    || rawSnapshotByGame.size !== rawSnapshots.length || rawSnapshotByGame.size !== v1Games.length) {
    throw new Error(
      `Raw snapshots and completion evidence must cover v1 games exactly once `
      + `(games=${v1Games.length}, snapshots=${rawSnapshots.length}, evidence=${evidenceRows.length})`,
    );
  }
  for (const evidence of evidenceRows) {
    const raw = rawSnapshotByGame.get(evidence.canonicalGameId);
    if (!raw || raw.providerGameId !== evidence.providerGameId || raw.endpoint !== evidence.endpoint
      || raw.retrievedAt.getTime() !== evidence.retrievedAt.getTime()
      || raw.rawBodyHash !== evidence.rawPayloadHash) {
      throw new Error(`Raw snapshot does not bind completion evidence for ${evidence.canonicalGameId}`);
    }
  }
  const identityByProviderSeason = new Map(v1Identities.map((identity) => [
    `${identity.provider}:${identity.providerTeamId}:${identity.season}`, identity,
  ]));
  const originalSplits = new Map(v1Splits.map((split) => [
    split.canonicalGameId, split.cohort as HistoricalSplit,
  ]));
  if (originalSplits.size !== v1Splits.length) {
    throw new Error("v1 split input is not one-to-one by canonical game ID");
  }

  const sourceGames: CompletionFoundationGame[] = v1Games.map((game) => {
    const evidence = evidenceByGame.get(game.canonicalGameId);
    const home = identityByProviderSeason.get(`${game.provider}:${game.homeProviderTeamId}:${game.season}`);
    const away = identityByProviderSeason.get(`${game.provider}:${game.awayProviderTeamId}:${game.season}`);
    if (!evidence || !home || !away || game.homeRuns === null || game.awayRuns === null) {
      throw new Error(`Cannot losslessly map v1 game ${game.canonicalGameId} into completion foundation`);
    }
    return {
      canonicalGameId: game.canonicalGameId,
      providerGameId: game.providerGameId,
      season: game.season,
      officialGameDate: game.gameDate.toISOString().slice(0, 10),
      scheduledFirstPitch: game.scheduledFirstPitch.toISOString(),
      homeCanonicalTeamId: home.canonicalTeamId,
      awayCanonicalTeamId: away.canonicalTeamId,
      homeRuns: game.homeRuns,
      awayRuns: game.awayRuns,
      homeStarterId: game.homeStarterProviderPlayerId,
      awayStarterId: game.awayStarterProviderPlayerId,
      venueId: game.venueProviderId,
      venueName: game.venueName,
      gameStatus: game.gameStatus,
      inningsPlayed: game.inningsPlayed,
      doubleheaderStatus: game.doubleheaderStatus,
      gameNumber: game.gameNumber,
      suspended: game.suspended,
      resumed: game.resumed,
      sourcePayloadHash: game.sourcePayloadHash,
      evidence: evidenceFromRow(evidence),
    };
  });
  const foundation = buildMlbHistoricalCompletionFoundation(sourceGames, originalSplits, {
    artifactKey: ARTIFACT_KEY,
  });
  const orderedEvidence = [...evidenceRows].sort((left, right) =>
    left.canonicalGameId.localeCompare(right.canonicalGameId));
  const sourceManifest = {
    v1: {
      artifactKey: V1_ARTIFACT_KEY,
      schemaVersion: MLB_HISTORICAL_SCHEMA_VERSION,
      sourceManifestHash: v1Artifact.sourceManifestHash,
      foundationChecksum: v1Artifact.foundationChecksum,
      replayChecksum: v1Artifact.replayChecksum,
    },
    evidence: orderedEvidence.map((row) => ({
      canonicalGameId: row.canonicalGameId,
      providerGameId: row.providerGameId,
      endpoint: row.endpoint,
      retrievedAt: row.retrievedAt.toISOString(),
      resolverVersion: row.resolverVersion,
      evidenceHash: row.evidenceHash,
      rawPayloadHash: row.rawPayloadHash,
      rawSnapshot: {
        table: "mlb_historical_raw_completion_snapshots",
        canonicalGameId: row.canonicalGameId,
        rawBodyHash: rawSnapshotByGame.get(row.canonicalGameId)!.rawBodyHash,
        byteLength: rawSnapshotByGame.get(row.canonicalGameId)!.byteLength,
      },
    })),
  };
  const sourceManifestHash = historicalPayloadHash(sourceManifest);
  let reusedSealedArtifact = false;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ARTIFACT_KEY}))`);
    const existing = await tx.select().from(mlbHistoricalArtifactsTable).where(and(
      eq(mlbHistoricalArtifactsTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION),
      eq(mlbHistoricalArtifactsTable.artifactKey, ARTIFACT_KEY),
    ));
    if (existing.length > 1) throw new Error(`Multiple chronology artifacts found for ${ARTIFACT_KEY}`);
    if (existing.length === 1) {
      const artifact = existing[0]!;
      if (artifact.status !== "SEALED_COMPLETION_FOUNDATION"
        || artifact.sourceManifestHash !== sourceManifestHash
        || artifact.foundationChecksum !== foundation.checksum
        || artifact.replayChecksum !== foundation.replayChecksum) {
        throw new Error(`Sealed artifact ${ARTIFACT_KEY} does not match this immutable foundation`);
      }
      await tx.execute(sql.raw(MLB_HISTORICAL_APPEND_ONLY_SQL));
      reusedSealedArtifact = true;
      return;
    }

    const sealedAt = new Date();
    const evidenceRetrievalCutoff = new Date(Math.max(
      ...evidenceRows.map((row) => row.retrievedAt.getTime()),
    ));
    await tx.insert(mlbHistoricalArtifactsTable).values({
      schemaVersion: MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
      artifactKey: ARTIFACT_KEY,
      sourceManifest,
      sourceManifestHash,
      foundationChecksum: foundation.checksum,
      replayChecksum: foundation.replayChecksum,
      retrievalCutoff: evidenceRetrievalCutoff,
      status: "SEALED_COMPLETION_FOUNDATION",
      sealedAt,
    });
    await insertBatches(v1Games, (batch) => tx.insert(mlbHistoricalGamesTable).values(batch.map((game) => {
      const evidence = evidenceByGame.get(game.canonicalGameId)!;
      return {
        ...game,
        id: undefined,
        schemaVersion: MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
        actualStartTime: evidence.actualStartTime,
        completionTime: evidence.canonicalCompletionTime,
        provenance: {
          v1Provenance: game.provenance,
          completion: {
            evidenceHash: evidence.evidenceHash,
            rawPayloadHash: evidence.rawPayloadHash,
            completionTimeSource: evidence.completionTimeSource,
            completionTimeMethod: evidence.completionTimeMethod,
            completionTimeConfidence: evidence.completionTimeConfidence,
          },
        },
      };
    })));
    await insertBatches(v1Identities, (batch) => tx.insert(mlbHistoricalTeamIdentityTable).values(batch.map((row) => ({
      ...row, id: undefined, schemaVersion: MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
    }))));
    await insertBatches(foundation.rows, (batch) => tx.insert(mlbHistoricalTeamGameRowsTable).values(batch.map((row) => ({
      ...row,
      targets: {},
      scheduledFirstPitch: new Date(row.scheduledFirstPitch),
      featureCutoff: row.featureCutoff ? new Date(row.featureCutoff) : null,
    }))));
    await insertBatches(foundation.games, (batch) => tx.insert(mlbHistoricalOutcomesTable).values(batch.map((game) => {
      const base = {
        schemaVersion: MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
        artifactKey: ARTIFACT_KEY,
        canonicalGameId: game.canonicalGameId,
        providerGameId: game.providerGameId,
        season: game.season,
        homeRuns: game.homeRuns,
        awayRuns: game.awayRuns,
        winnerSide: game.homeRuns === game.awayRuns ? "TIE" : game.homeRuns > game.awayRuns ? "HOME" : "AWAY",
        runDifference: game.homeRuns - game.awayRuns,
        gameTotal: game.homeRuns + game.awayRuns,
        inningsPlayed: game.inningsPlayed,
        extraInnings: (game.inningsPlayed ?? 9) > 9,
        settlementStatus: "FINAL_PROVIDER_OUTCOME",
        completionTime: game.evidence.canonicalCompletionTime,
        completionBoundaryState: game.evidence.completionTimeConfidence,
        sourcePayloadHash: game.sourcePayloadHash,
      };
      return {
        ...base,
        completionTime: base.completionTime ? new Date(base.completionTime) : null,
        outcomeHash: historicalPayloadHash(base),
      };
    })));
    await insertBatches(foundation.decisions, (batch) => tx.insert(mlbHistoricalChronologyDecisionsTable).values(batch.map((row) => ({
      ...row, featureCutoff: row.featureCutoff ? new Date(row.featureCutoff) : null,
    }))));
    await insertBatches(v1Exclusions, (batch) => tx.insert(mlbHistoricalExclusionsTable).values(batch.map((row) => {
      const evidence = { v1ArtifactKey: V1_ARTIFACT_KEY, v1Evidence: row.evidence };
      return {
        schemaVersion: MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
        artifactKey: ARTIFACT_KEY, provider: row.provider, providerGameId: row.providerGameId,
        season: row.season, reasonCode: row.reasonCode, reasonDetail: row.reasonDetail,
        evidence, evidenceHash: historicalPayloadHash(evidence),
      };
    })));
    await insertBatches(foundation.splits, (batch) => tx.insert(mlbHistoricalSplitsTable).values(batch.map((split) => ({
      schemaVersion: MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
      splitVersion: CHRONOLOGY_SPLIT_VERSION, canonicalGameId: split.canonicalGameId, cohort: split.cohort,
      assignedAt: sealedAt, assignmentRule: split.assignmentRule, immutable: true,
      foundationChecksum: foundation.checksum, assignmentHash: split.assignmentHash,
    }))));
    await tx.execute(sql.raw(MLB_HISTORICAL_APPEND_ONLY_SQL));
  });
  console.log(JSON.stringify({
    artifactKey: ARTIFACT_KEY, sourceManifestHash, checksum: foundation.checksum,
    games: foundation.games.length, rows: foundation.rows.length, decisions: foundation.decisions.length,
    splits: foundation.splits.length, exclusions: v1Exclusions.length,
    summary: foundation.summary,
    status: reusedSealedArtifact ? "VERIFIED_SEALED_ARTIFACT" : "SEALED_COMPLETION_FOUNDATION",
  }));
}

await main();