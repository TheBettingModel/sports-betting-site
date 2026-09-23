import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchSportGamesByDate, type FetchedGame } from "../src/services/espn";
import {
  materializeRollingScoreTraining,
  buildRollingScoreHistorySeed,
  trainRollingScoreV4,
  type CompletedScoreGame,
} from "../src/services/rollingScoreV4";
import { stableHash, type TbmV4Sport } from "../src/services/v4Platform";

type TeamSport = "MLB" | "NFL" | "NBA" | "WNBA" | "NHL" | "NCAAMB";
type SourceEvent = Readonly<{
  source: "ESPN_SCOREBOARD";
  sourceEventId: string;
  sport: TeamSport;
  sourceSportKey: string;
  eventStart: string;
  completionTime: string;
  completionTimeKind: "CONSERVATIVE_BOUND";
  homeParticipantId: string;
  awayParticipantId: string;
  homeParticipantName: string;
  awayParticipantName: string;
  homeScore: number;
  awayScore: number;
  sourceStatus: "final";
  sourceDate: string;
  retrievedAt: string;
  reconstruction: string;
  pitConfidence: "BASIC_ROLLING_HIGH";
}>;

const TRAINED_AT = "2026-09-07T02:00:00.000Z";
const RETRIEVED_AT = new Date().toISOString();
const OUTPUT = resolve(process.cwd(), "../../data/v4/historical");
const ARTIFACTS = resolve(process.cwd(), "../../model-artifacts/v4");
const requested = (process.env["V4_SPORTS"] ?? "MLB,NFL,NBA,WNBA,NHL,NCAAMB")
  .split(",").map((value) => value.trim().toUpperCase())
  .filter((value): value is TeamSport =>
    ["MLB", "NFL", "NBA", "WNBA", "NHL", "NCAAMB"].includes(value));
const refresh = process.env["V4_REFRESH"] === "1";
const concurrency = Number(process.env["V4_CONCURRENCY"] ?? "12");

const configurations: Record<TeamSport, {
  providerKey: string;
  ranges: Array<[string, string]>;
  completionHours: number;
}> = {
  MLB: {
    providerKey: "MLB", completionHours: 12,
    ranges: [["2022-03-25", "2022-11-06"], ["2023-03-25", "2023-11-05"], ["2024-03-20", "2024-11-02"], ["2025-03-18", "2025-11-02"]],
  },
  NFL: {
    providerKey: "NFL", completionHours: 12,
    ranges: [["2022-09-01", "2023-02-15"], ["2023-09-01", "2024-02-15"], ["2024-09-01", "2025-02-15"], ["2025-09-01", "2026-02-15"]],
  },
  NBA: {
    providerKey: "NBA", completionHours: 12,
    ranges: [["2022-10-01", "2023-06-30"], ["2023-10-01", "2024-06-30"], ["2024-10-01", "2025-06-30"], ["2025-10-01", "2026-06-30"]],
  },
  WNBA: {
    providerKey: "WNBA", completionHours: 12,
    ranges: [["2022-05-01", "2022-10-31"], ["2023-05-01", "2023-10-31"], ["2024-05-01", "2024-10-31"], ["2025-05-01", "2025-10-31"], ["2026-05-01", "2026-09-06"]],
  },
  NHL: {
    providerKey: "NHL", completionHours: 12,
    ranges: [["2022-10-01", "2023-06-30"], ["2023-10-01", "2024-06-30"], ["2024-10-01", "2025-06-30"], ["2025-10-01", "2026-06-30"]],
  },
  NCAAMB: {
    providerKey: "NCAAB", completionHours: 12,
    ranges: [["2022-11-01", "2023-04-15"], ["2023-11-01", "2024-04-15"], ["2024-11-01", "2025-04-15"], ["2025-11-01", "2026-04-15"]],
  },
};

function dates(ranges: Array<[string, string]>): string[] {
  return ranges.flatMap(([start, end]) => {
    const values: string[] = [];
    for (let cursor = new Date(`${start}T12:00:00.000Z`), last = new Date(`${end}T12:00:00.000Z`);
      cursor <= last; cursor = new Date(cursor.getTime() + 86_400_000)) {
      values.push(cursor.toISOString().slice(0, 10).replaceAll("-", ""));
    }
    return values;
  });
}

async function pooledMap<T, U>(values: readonly T[], limit: number, task: (value: T) => Promise<U>): Promise<U[]> {
  const output = new Array<U>(values.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, values.length)) }, async () => {
    while (true) {
      const current = index++;
      if (current >= values.length) return;
      output[current] = await task(values[current]!);
    }
  }));
  return output;
}

function normalize(sport: TeamSport, providerKey: string, game: FetchedGame, completionHours: number): SourceEvent | null {
  if (game.status !== "final" || game.homeScore == null || game.awayScore == null
    || !game.homeTeamId || !game.awayTeamId || !Date.parse(game.commenceTimeISO)) return null;
  return {
    source: "ESPN_SCOREBOARD",
    sourceEventId: game.espnId,
    sport,
    sourceSportKey: providerKey,
    eventStart: new Date(game.commenceTimeISO).toISOString(),
    completionTime: new Date(Date.parse(game.commenceTimeISO) + completionHours * 3_600_000).toISOString(),
    completionTimeKind: "CONSERVATIVE_BOUND",
    homeParticipantId: game.homeTeamId,
    awayParticipantId: game.awayTeamId,
    homeParticipantName: game.homeTeamName,
    awayParticipantName: game.awayTeamName,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    sourceStatus: "final",
    sourceDate: game.gameDate,
    retrievedAt: RETRIEVED_AT,
    reconstruction: `Outcome availability conservatively bounded at event_start+${completionHours}h; no market or hindsight-sensitive fields retained.`,
    pitConfidence: "BASIC_ROLLING_HIGH",
  };
}

function dedupe(rows: readonly SourceEvent[]) {
  const exact = new Map<string, SourceEvent>();
  let duplicates = 0;
  let conflicts = 0;
  for (const row of rows) {
    const existing = exact.get(row.sourceEventId);
    if (!existing) exact.set(row.sourceEventId, row);
    else if (stableHash({ ...existing, retrievedAt: null }) === stableHash({ ...row, retrievedAt: null })) duplicates++;
    else conflicts++;
  }
  return {
    rows: [...exact.values()].sort((a, b) => Date.parse(a.eventStart) - Date.parse(b.eventStart) || a.sourceEventId.localeCompare(b.sourceEventId)),
    duplicates,
    conflicts,
  };
}

await mkdir(OUTPUT, { recursive: true });
await mkdir(ARTIFACTS, { recursive: true });
const ledger = [];
for (const sport of requested) {
  const config = configurations[sport];
  const cachePath = resolve(OUTPUT, `espn-${sport.toLowerCase()}-2022-2026.json`);
  let sourceRows: SourceEvent[];
  if (!refresh) {
    try {
      sourceRows = JSON.parse(await readFile(cachePath, "utf8")) as SourceEvent[];
    } catch {
      sourceRows = [];
    }
  } else {
    sourceRows = [];
  }
  if (!sourceRows.length) {
    const requestedDates = dates(config.ranges);
    const daily = await pooledMap(requestedDates, concurrency, async (date) => {
      try {
        const games = await fetchSportGamesByDate(config.providerKey, date, { throwOnError: true });
        return games.flatMap((game) => {
          const row = normalize(sport, config.providerKey, game, config.completionHours);
          return row ? [row] : [];
        });
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
        try {
          const games = await fetchSportGamesByDate(config.providerKey, date, { throwOnError: true });
          return games.flatMap((game) => {
            const row = normalize(sport, config.providerKey, game, config.completionHours);
            return row ? [row] : [];
          });
        } catch {
          return [];
        }
      }
    });
    sourceRows = daily.flat();
  }
  const canonical = dedupe(sourceRows);
  await writeFile(cachePath, `${JSON.stringify(canonical.rows, null, 2)}\n`, "utf8");
  const completed: CompletedScoreGame[] = canonical.rows.map((row) => ({
    gameId: row.sourceEventId,
    sport: row.sport,
    homeTeamId: row.homeParticipantId,
    awayTeamId: row.awayParticipantId,
    eventStart: row.eventStart,
    completedAt: row.completionTime,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
  }));
  const vectors = materializeRollingScoreTraining(sport as TbmV4Sport, completed);
  try {
    const artifact = trainRollingScoreV4(
      sport as TbmV4Sport, vectors, TRAINED_AT, buildRollingScoreHistorySeed(completed),
    );
    await writeFile(resolve(ARTIFACTS, `${sport.toLowerCase()}-v4-core-score.json`),
      `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    ledger.push({
      sport, status: "BUILT", requestedDates: dates(config.ranges).length,
      rawSourceEvents: sourceRows.length, duplicateEvents: canonical.duplicates,
      conflictingEvents: canonical.conflicts, canonicalEvents: canonical.rows.length,
      pitEligibleEvents: canonical.rows.length, trainingRows: artifact.trainingRows,
      validationRows: artifact.validationRows, artifactHash: artifact.artifactHash,
      metrics: artifact.metrics,
    });
  } catch (error) {
    await rm(resolve(ARTIFACTS, `${sport.toLowerCase()}-v4-core-score.json`), { force: true });
    ledger.push({
      sport, status: "REJECTED", requestedDates: dates(config.ranges).length,
      rawSourceEvents: sourceRows.length, duplicateEvents: canonical.duplicates,
      conflictingEvents: canonical.conflicts, canonicalEvents: canonical.rows.length,
      pitEligibleEvents: canonical.rows.length, trainingRows: Math.floor(vectors.length * .8),
      validationRows: vectors.length - Math.floor(vectors.length * .8),
      reason: error instanceof Error ? error.message : "UNKNOWN",
    });
  }
}
await writeFile(resolve(OUTPUT, "task-243-team-sport-ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
console.log(JSON.stringify(ledger, null, 2));