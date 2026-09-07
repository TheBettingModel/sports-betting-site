import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { trainNflV4, type NflHistoricalGame } from "../src/services/nflV4";

type SourceEvent = {
  sourceEventId: string;
  eventStart: string;
  completionTime: string;
  homeParticipantId: string;
  awayParticipantId: string;
  homeParticipantName: string;
  awayParticipantName: string;
  homeScore: number;
  awayScore: number;
};

const root = resolve(process.cwd(), "../..");
const sourcePath = resolve(root, "data/v4/historical/espn-nfl-2022-2026.json");
const outputPath = resolve(root, "model-artifacts/v4/nfl-v4-core.json");
const source = JSON.parse(await readFile(sourcePath, "utf8")) as SourceEvent[];
const excludedParticipants = new Set(["AFC", "NFC"]);
const eligible = source.filter((game) =>
  !excludedParticipants.has(game.homeParticipantName)
  && !excludedParticipants.has(game.awayParticipantName));
const quarantined = source.filter((game) =>
  excludedParticipants.has(game.homeParticipantName)
  || excludedParticipants.has(game.awayParticipantName));
const games: NflHistoricalGame[] = eligible.map((game) => ({
  gameId: game.sourceEventId,
  eventStart: game.eventStart,
  completedAt: game.completionTime,
  homeTeamId: game.homeParticipantId,
  awayTeamId: game.awayParticipantId,
  homeScore: game.homeScore,
  awayScore: game.awayScore,
}));
const artifact = trainNflV4(games, "2026-09-07T12:00:00.000Z");
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  modelId: artifact.modelId,
  version: artifact.modelVersion,
  artifactHash: artifact.artifactHash,
  contractHash: artifact.featureContractHash,
  cohortHash: artifact.trainingCohortHash,
  rows: {
    training: artifact.trainingRows,
    validation: artifact.validationRows,
    oos: artifact.oosRows,
  },
  metrics: artifact.metrics,
  selected: artifact.candidates.find((candidate) => candidate.selected),
  source: {
    rawGames: source.length,
    canonicalGames: source.length,
    pitEligibleClubGames: eligible.length,
    quarantinedGames: quarantined.length,
    quarantineReasons: { PRO_BOWL_NON_CLUB_EVENT: quarantined.length },
  },
}, null, 2));