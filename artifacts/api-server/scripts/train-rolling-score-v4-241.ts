import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { asc, isNotNull } from "drizzle-orm";
import { db, gamesTable } from "@workspace/db";
import {
  materializeRollingScoreTraining,
  trainRollingScoreV4,
  type CompletedScoreGame,
} from "../src/services/rollingScoreV4";
import type { TbmV4Sport } from "../src/services/v4Platform";

const SPORTS = ["NFL", "WNBA", "SOCCER"] as const satisfies readonly TbmV4Sport[];
const trainedAt = "2026-09-07T00:00:00.000Z";
const rows = await db.select({
  id: gamesTable.id, sport: gamesTable.sport,
  homeTeamId: gamesTable.homeTeamId, awayTeamId: gamesTable.awayTeamId,
  startsAt: gamesTable.startsAt, gameDate: gamesTable.gameDate,
  homeScore: gamesTable.homeScore, awayScore: gamesTable.awayScore,
}).from(gamesTable).where(isNotNull(gamesTable.homeScore)).orderBy(asc(gamesTable.gameDate), asc(gamesTable.id));

const completed = rows.flatMap((row): CompletedScoreGame[] => {
  if (!row.homeTeamId || !row.awayTeamId || row.homeScore == null || row.awayScore == null) return [];
  const dateText = typeof row.gameDate === "string"
    ? row.gameDate
    : row.gameDate.toISOString().slice(0, 10);
  const start = row.startsAt ?? new Date(`${dateText}T12:00:00.000Z`);
  const completedAt = row.startsAt
    ? new Date(start.getTime() + 6 * 60 * 60 * 1000)
    : new Date(new Date(`${dateText}T00:00:00.000Z`).getTime() + 86_400_000);
  return [{
    gameId: row.id, sport: row.sport.toUpperCase(),
    homeTeamId: row.homeTeamId, awayTeamId: row.awayTeamId,
    eventStart: start.toISOString(),
    // Conservative next-day availability prevents same-day ordering assumptions
    // when the provider start timestamp was absent historically.
    completedAt: completedAt.toISOString(),
    homeScore: row.homeScore, awayScore: row.awayScore,
  }];
});

const outputDir = resolve(process.cwd(), "../../model-artifacts/v4");
await mkdir(outputDir, { recursive: true });
const summary = [];
for (const sport of SPORTS) {
  const vectors = materializeRollingScoreTraining(sport, completed);
  try {
    const artifact = trainRollingScoreV4(sport, vectors, trainedAt);
    const path = resolve(outputDir, `${sport.toLowerCase()}-v4-core-score.json`);
    await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    summary.push({ sport, status: "BUILT", vectors: vectors.length, artifactHash: artifact.artifactHash, metrics: artifact.metrics });
  } catch (error) {
    summary.push({ sport, status: "BLOCKED", vectors: vectors.length, reason: error instanceof Error ? error.message : "UNKNOWN" });
  }
}
console.log(JSON.stringify(summary, null, 2));