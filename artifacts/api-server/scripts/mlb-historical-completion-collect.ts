import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import {
  MLB_HISTORICAL_SCHEMA_VERSION,
  mlbHistoricalCompletionEvidenceTable,
  mlbHistoricalGamesTable,
  mlbHistoricalRawCompletionSnapshotsTable,
} from "@workspace/db/schema";
import { and, asc, eq } from "drizzle-orm";
import {
  MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY,
  MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
  parseHistoricalMlbCompletionFeed,
} from "../src/services/mlbHistoricalChronology";

const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.MLB_COMPLETION_CONCURRENCY ?? 8)));
const LIMIT = process.env.MLB_HISTORICAL_COMPLETION_LIMIT
  ? Math.max(1, Number(process.env.MLB_HISTORICAL_COMPLETION_LIMIT))
  : null;
const MAX_ATTEMPTS = 5;
const RAW_FEED_FIELDS = [
  "gameData", "status", "abstractGameState", "codedGameState", "detailedState",
  "datetime", "dateTime", "originalDate", "officialDate", "gameEndDate",
  "resumeDate", "resumedFromDate", "liveData", "linescore", "currentInning",
  "scheduledInnings", "plays", "allPlays", "about", "atBatIndex", "inning",
  "halfInning", "startTime", "endTime", "isComplete", "result", "eventType",
  "awayScore", "homeScore",
].join(",");

async function fetchJsonWithRetry(url: string): Promise<{
  payload: unknown;
  rawBody: string;
  retrievedAt: string;
  httpStatus: number;
  contentType: string | null;
}> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "TheBettingModel-Historical-Research/1.0" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          await new Promise((resolve) => setTimeout(resolve, attempt * attempt * 1_000));
          continue;
        }
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const rawBody = await response.text();
      const payload: unknown = JSON.parse(rawBody);
      return {
        payload,
        rawBody,
        retrievedAt: new Date().toISOString(),
        httpStatus: response.status,
        contentType: response.headers.get("content-type"),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * attempt * 1_000));
      }
    }
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index]!);
    }
  }));
  return results;
}

const allGames = await db.select({
  canonicalGameId: mlbHistoricalGamesTable.canonicalGameId,
  providerGameId: mlbHistoricalGamesTable.providerGameId,
  scheduledFirstPitch: mlbHistoricalGamesTable.scheduledFirstPitch,
  gameNumber: mlbHistoricalGamesTable.gameNumber,
  doubleheaderStatus: mlbHistoricalGamesTable.doubleheaderStatus,
  suspended: mlbHistoricalGamesTable.suspended,
  resumed: mlbHistoricalGamesTable.resumed,
}).from(mlbHistoricalGamesTable).where(eq(
  mlbHistoricalGamesTable.schemaVersion,
  MLB_HISTORICAL_SCHEMA_VERSION,
)).orderBy(
  asc(mlbHistoricalGamesTable.scheduledFirstPitch),
  asc(mlbHistoricalGamesTable.providerGameId),
);

const existing = await db.select({
  canonicalGameId: mlbHistoricalRawCompletionSnapshotsTable.canonicalGameId,
}).from(mlbHistoricalRawCompletionSnapshotsTable).where(and(
  eq(mlbHistoricalRawCompletionSnapshotsTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION),
  eq(mlbHistoricalRawCompletionSnapshotsTable.artifactKey, MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY),
));
const existingIds = new Set(existing.map((row) => row.canonicalGameId));
const pending = allGames.filter((game) => !existingIds.has(game.canonicalGameId));
const selected = LIMIT === null ? pending : pending.slice(0, LIMIT);

console.log(JSON.stringify({
  totalGames: allGames.length,
  alreadyCollected: existing.length,
  pending: pending.length,
  selected: selected.length,
  concurrency: CONCURRENCY,
}));

let collected = 0;
for (let offset = 0; offset < selected.length; offset += 100) {
  const batch = selected.slice(offset, offset + 100);
  const evidence = await mapConcurrent(batch, async (game) => {
    const endpoint = `https://statsapi.mlb.com/api/v1.1/game/${game.providerGameId}/feed/live?fields=${encodeURIComponent(RAW_FEED_FIELDS)}`;
    const response = await fetchJsonWithRetry(endpoint);
    const rawBodyHash = createHash("sha256").update(response.rawBody, "utf8").digest("hex");
    return {
      game,
      rawBody: response.rawBody,
      rawBodyHash,
      httpStatus: response.httpStatus,
      contentType: response.contentType,
      parsed: parseHistoricalMlbCompletionFeed(response.payload, {
        canonicalGameId: game.canonicalGameId,
        providerGameId: game.providerGameId,
        scheduledStartTime: game.scheduledFirstPitch.toISOString(),
        retrievedAt: response.retrievedAt,
        endpoint,
      }),
    };
  });

  await db.transaction(async (tx) => {
    await tx.insert(mlbHistoricalRawCompletionSnapshotsTable).values(evidence.map((row) => ({
      schemaVersion: MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
      artifactKey: MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY,
      canonicalGameId: row.parsed.canonicalGameId,
      provider: "MLB_STATS_API",
      providerGameId: row.parsed.providerGameId,
      endpoint: row.parsed.endpoint,
      retrievedAt: new Date(row.parsed.retrievedAt),
      httpStatus: row.httpStatus,
      contentType: row.contentType,
      rawBody: row.rawBody,
      rawBodyHash: row.rawBodyHash,
      byteLength: Buffer.byteLength(row.rawBody, "utf8"),
    })));
    await tx.insert(mlbHistoricalCompletionEvidenceTable).values(evidence.map(({ game, parsed, rawBodyHash }) => ({
      schemaVersion: MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
      artifactKey: MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY,
      canonicalGameId: parsed.canonicalGameId,
      provider: "MLB_STATS_API",
      providerGameId: parsed.providerGameId,
      endpoint: parsed.endpoint,
      retrievedAt: new Date(parsed.retrievedAt),
      scheduledStartTime: new Date(parsed.scheduledStartTime),
      actualStartTime: parsed.actualStartTime ? new Date(parsed.actualStartTime) : null,
      firstPlayStartTime: parsed.firstPlayStartTime ? new Date(parsed.firstPlayStartTime) : null,
      lastPlayStartTime: parsed.lastPlayStartTime ? new Date(parsed.lastPlayStartTime) : null,
      lastPlayEndTime: parsed.lastPlayEndTime ? new Date(parsed.lastPlayEndTime) : null,
      gameEndTime: parsed.gameEndTime ? new Date(parsed.gameEndTime) : null,
      finalStatusTime: parsed.finalStatusTime ? new Date(parsed.finalStatusTime) : null,
      providerFinalSeenAt: new Date(parsed.providerFinalSeenAt),
      canonicalCompletionTime: parsed.canonicalCompletionTime
        ? new Date(parsed.canonicalCompletionTime)
        : null,
      completionTimeSource: parsed.completionTimeSource,
      completionTimeMethod: parsed.completionTimeMethod,
      completionTimeConfidence: parsed.completionTimeConfidence,
      completionTimePrecision: parsed.completionTimePrecision,
      featureCutoff: parsed.featureCutoff ? new Date(parsed.featureCutoff) : null,
      featureCutoffSource: parsed.featureCutoffSource,
      featureCutoffConfidence: parsed.featureCutoffConfidence,
      completionDateEt: parsed.completionDateEt,
      gameStatus: parsed.gameStatus,
      statusCode: parsed.statusCode,
      finalStatus: parsed.finalStatus,
      terminalPlayComplete: parsed.terminalPlayComplete,
      playCount: parsed.playCount,
      inningsPlayed: parsed.inningsPlayed,
      gameNumber: game.gameNumber,
      doubleheaderStatus: game.doubleheaderStatus,
      postponed: parsed.postponed,
      suspended: parsed.suspended || game.suspended,
      resumed: parsed.resumed || game.resumed,
      crossedMidnightUtc: parsed.crossedMidnightUtc,
      quarantineReason: parsed.quarantineReason,
      evidencePayload: parsed.evidencePayload,
      rawPayloadHash: rawBodyHash,
      evidenceHash: parsed.evidenceHash,
      resolverVersion: parsed.resolverVersion,
    })));
  });

  collected += batch.length;
  console.log(JSON.stringify({
    collected,
    selected: selected.length,
    totalPersisted: existing.length + collected,
    lastProviderGameId: batch.at(-1)?.providerGameId,
  }));
}

console.log(`Completion collection finished: ${existing.length + collected}/${allGames.length}`);