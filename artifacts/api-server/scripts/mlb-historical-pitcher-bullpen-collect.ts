import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  MLB_HISTORICAL_CHRONOLOGY_V3_SCHEMA_VERSION,
  mlbHistoricalGamesTable,
  mlbHistoricalRawBoxscoreSnapshotsTable,
} from "@workspace/db";
import {
  MLB_PITCHER_BULLPEN_RAW_ARTIFACT_KEY,
  MLB_PITCHER_BULLPEN_RAW_SCHEMA_VERSION,
  mlbBoxscoreSnapshotBinding,
  mlbPitchingArtifactHash,
} from "../src/services/mlbHistoricalPitchingArtifact";

const concurrency = Math.max(1, Math.min(12, Number(process.env.MLB_PITCHING_CONCURRENCY ?? 8)));
const limit = process.env.MLB_HISTORICAL_PITCHING_LIMIT
  ? Math.max(1, Number(process.env.MLB_HISTORICAL_PITCHING_LIMIT))
  : null;
const MAX_ATTEMPTS = 5;

async function fetchExact(url: string) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "TheBettingModel-Historical-Research/1.0" },
        signal: AbortSignal.timeout(30_000),
      });
      const rawBody = await response.text();
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`retryable HTTP ${response.status}`);
        }
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      JSON.parse(rawBody);
      return {
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

async function mapConcurrent<T, R>(values: readonly T[], worker: (value: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await worker(values[index]!);
    }
  }));
  return output;
}

const games = await db.select({
  canonicalGameId: mlbHistoricalGamesTable.canonicalGameId,
  providerGameId: mlbHistoricalGamesTable.providerGameId,
}).from(mlbHistoricalGamesTable).where(eq(
  mlbHistoricalGamesTable.schemaVersion,
  MLB_HISTORICAL_CHRONOLOGY_V3_SCHEMA_VERSION,
)).orderBy(asc(mlbHistoricalGamesTable.scheduledFirstPitch), asc(mlbHistoricalGamesTable.providerGameId));
if (games.length !== 9_393) throw new Error(`Expected sealed chronology to contain 9393 games, found ${games.length}`);

const existing = await db.select({
  canonicalGameId: mlbHistoricalRawBoxscoreSnapshotsTable.canonicalGameId,
  providerGameId: mlbHistoricalRawBoxscoreSnapshotsTable.providerGameId,
}).from(mlbHistoricalRawBoxscoreSnapshotsTable).where(and(
  eq(mlbHistoricalRawBoxscoreSnapshotsTable.schemaVersion, MLB_PITCHER_BULLPEN_RAW_SCHEMA_VERSION),
  eq(mlbHistoricalRawBoxscoreSnapshotsTable.artifactKey, MLB_PITCHER_BULLPEN_RAW_ARTIFACT_KEY),
));
const existingByGame = new Map(existing.map((entry) => [entry.canonicalGameId, entry.providerGameId]));
if (existingByGame.size !== existing.length) throw new Error("Duplicate persisted boxscore game identities");
for (const game of games) {
  const provider = existingByGame.get(game.canonicalGameId);
  if (provider !== undefined && provider !== game.providerGameId) {
    throw new Error(`Persisted boxscore provider identity mismatch for ${game.canonicalGameId}`);
  }
}
const pending = games.filter((game) => !existingByGame.has(game.canonicalGameId));
const selected = limit === null ? pending : pending.slice(0, limit);
console.log(JSON.stringify({ games: games.length, existing: existing.length, pending: pending.length, selected: selected.length, concurrency }));

let collected = 0;
for (let offset = 0; offset < selected.length; offset += 100) {
  const batch = selected.slice(offset, offset + 100);
  const rows = await mapConcurrent(batch, async (game) => {
    const endpoint = `https://statsapi.mlb.com/api/v1/game/${game.providerGameId}/boxscore`;
    const response = await fetchExact(endpoint);
    const rawBodyHash = createHash("sha256").update(response.rawBody, "utf8").digest("hex");
    const byteLength = Buffer.byteLength(response.rawBody, "utf8");
    const binding = mlbBoxscoreSnapshotBinding({
      canonicalGameId: game.canonicalGameId,
      providerGameId: game.providerGameId,
      endpoint,
      retrievedAt: response.retrievedAt,
      rawBodyHash,
      byteLength,
    });
    const base = {
      schemaVersion: MLB_PITCHER_BULLPEN_RAW_SCHEMA_VERSION,
      artifactKey: MLB_PITCHER_BULLPEN_RAW_ARTIFACT_KEY,
      canonicalGameId: game.canonicalGameId,
      provider: "MLB_STATS_API",
      providerGameId: game.providerGameId,
      endpoint,
      retrievedAt: response.retrievedAt,
      httpStatus: response.httpStatus,
      contentType: response.contentType,
      rawBodyHash,
      byteLength,
      sourceManifestHash: binding.sourceManifestHash,
      provenance: binding.manifest,
    };
    return {
      ...base,
      rawBody: response.rawBody,
      checksum: mlbPitchingArtifactHash(base),
    };
  });
  await db.insert(mlbHistoricalRawBoxscoreSnapshotsTable).values(rows.map((entry) => ({
    ...entry,
    retrievedAt: new Date(entry.retrievedAt),
  })));
  collected += rows.length;
  console.log(JSON.stringify({ collected, selected: selected.length, totalPersisted: existing.length + collected }));
}

console.log(`Pitcher/bullpen boxscore collection finished: ${existing.length + collected}/${games.length}`);