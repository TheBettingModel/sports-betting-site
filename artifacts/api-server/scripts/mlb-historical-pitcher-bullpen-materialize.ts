import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  mlbHistoricalArtifactsTable,
  mlbHistoricalBullpenOutcomesTable,
  mlbHistoricalCompletionEvidenceTable,
  mlbHistoricalGamesTable,
  mlbHistoricalPitcherAppearancesTable,
  mlbHistoricalPitcherIdentitiesTable,
  mlbHistoricalPitchingEligibilityTable,
  mlbHistoricalPregameBullpenSnapshotsTable,
  mlbHistoricalPregamePitcherSnapshotsTable,
  mlbHistoricalRawBoxscoreSnapshotsTable,
  mlbHistoricalSplitsTable,
  mlbHistoricalTeamGameRowsTable,
} from "@workspace/db";
import { MLB_HISTORICAL_APPEND_ONLY_SQL } from "../src/services/mlbHistoricalAppendOnly";
import {
  MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY,
  MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
} from "../src/services/mlbHistoricalChronology";
import { parseMlbStatsApiPitchingOutcomes } from "../src/services/mlbHistoricalPitchingOutcomes";
import { replayMlbPitchingPit } from "../src/services/mlbHistoricalPitchingReplay";
import {
  MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY,
  MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION,
  MLB_PITCHER_BULLPEN_RAW_ARTIFACT_KEY,
  MLB_PITCHER_BULLPEN_RAW_SCHEMA_VERSION,
  MLB_PITCHER_BULLPEN_SPLIT_VERSION,
  mlbPitReal,
  mlbPitchingArtifactHash,
} from "../src/services/mlbHistoricalPitchingArtifact";

const startedAt = Date.now();
const BATCH_SIZE = 250;
const iso = (value: Date | null) => value?.toISOString() ?? null;
const rawHash = (body: string) => createHash("sha256").update(body, "utf8").digest("hex");
async function batches<T>(rows: readonly T[], insert: (batch: readonly T[]) => Promise<unknown>) {
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) await insert(rows.slice(offset, offset + BATCH_SIZE));
}
const checksumSet = (rows: readonly { checksum?: string; outcomeChecksum?: string }[]) =>
  rows.map((row) => row.checksum ?? row.outcomeChecksum ?? "__missing__").sort();

const [chronologyArtifacts, games, evidence, raw, offenseRows, splits] = await Promise.all([
  db.select().from(mlbHistoricalArtifactsTable).where(and(
    eq(mlbHistoricalArtifactsTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION),
    eq(mlbHistoricalArtifactsTable.artifactKey, MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY),
  )),
  db.select().from(mlbHistoricalGamesTable).where(eq(
    mlbHistoricalGamesTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
  )).orderBy(asc(mlbHistoricalGamesTable.scheduledFirstPitch), asc(mlbHistoricalGamesTable.providerGameId)),
  db.select().from(mlbHistoricalCompletionEvidenceTable).where(and(
    eq(mlbHistoricalCompletionEvidenceTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION),
    eq(mlbHistoricalCompletionEvidenceTable.artifactKey, MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY),
  )),
  db.select().from(mlbHistoricalRawBoxscoreSnapshotsTable).where(and(
    eq(mlbHistoricalRawBoxscoreSnapshotsTable.schemaVersion, MLB_PITCHER_BULLPEN_RAW_SCHEMA_VERSION),
    eq(mlbHistoricalRawBoxscoreSnapshotsTable.artifactKey, MLB_PITCHER_BULLPEN_RAW_ARTIFACT_KEY),
  )).orderBy(asc(mlbHistoricalRawBoxscoreSnapshotsTable.canonicalGameId)),
  db.select().from(mlbHistoricalTeamGameRowsTable).where(and(
    eq(mlbHistoricalTeamGameRowsTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION),
    eq(mlbHistoricalTeamGameRowsTable.artifactKey, MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY),
  )),
  db.select().from(mlbHistoricalSplitsTable).where(and(
    eq(mlbHistoricalSplitsTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION),
    eq(mlbHistoricalSplitsTable.splitVersion, MLB_PITCHER_BULLPEN_SPLIT_VERSION),
  )),
]);
const chronologyArtifact = chronologyArtifacts.length === 1 ? chronologyArtifacts[0]! : null;
if (!chronologyArtifact?.status.startsWith("SEALED")) throw new Error("Exact sealed v3 chronology artifact is required");
if (games.length !== 9_393) throw new Error(`Expected 9393 chronology games, found ${games.length}`);

const unique = <T>(rows: readonly T[], key: (row: T) => string, name: string) => {
  const map = new Map(rows.map((row) => [key(row), row]));
  if (map.size !== rows.length) throw new Error(`${name} is not one-to-one`);
  return map;
};
const evidenceByGame = unique(evidence, (row) => row.canonicalGameId, "completion evidence");
const rawByGame = unique(raw, (row) => row.canonicalGameId, "raw boxscores");
const offenseBySide = unique(offenseRows, (row) => `${row.canonicalGameId}:${row.teamSide}`, "offense rows");
const splitByGame = unique(splits, (row) => row.canonicalGameId, "sealed splits");
if (evidenceByGame.size !== games.length || rawByGame.size !== games.length || offenseRows.length !== games.length * 2
  || splitByGame.size !== 9_073 || splits.length !== 9_073
  || [...splitByGame.keys()].some((gameId) => !evidenceByGame.has(gameId))) {
  throw new Error(`Exact source coverage required (games=${games.length}, evidence=${evidence.length}, raw=${raw.length}, offense=${offenseRows.length}, sealedCoreSplits=${splits.length}/9073)`);
}
if (splits.some((row) => !row.immutable || row.foundationChecksum !== chronologyArtifact.foundationChecksum)) {
  throw new Error("v3 split is not immutably bound to the sealed chronology artifact");
}

const parsed = [];
for (const game of games) {
  const boxscore = rawByGame.get(game.canonicalGameId)!;
  const completion = evidenceByGame.get(game.canonicalGameId)!;
  if (boxscore.providerGameId !== game.providerGameId || boxscore.httpStatus !== 200
    || boxscore.byteLength !== Buffer.byteLength(boxscore.rawBody, "utf8")
    || boxscore.rawBodyHash !== rawHash(boxscore.rawBody)) throw new Error(`Invalid raw boxscore binding for ${game.canonicalGameId}`);
  if (completion.canonicalCompletionTime === null || completion.quarantineReason !== null) continue;
  parsed.push(parseMlbStatsApiPitchingOutcomes(JSON.parse(boxscore.rawBody), {
    gameId: game.canonicalGameId,
    season: game.season,
    completionTime: completion.canonicalCompletionTime.toISOString(),
    homeTeamId: offenseBySide.get(`${game.canonicalGameId}:home`)!.canonicalTeamId,
    awayTeamId: offenseBySide.get(`${game.canonicalGameId}:away`)!.canonicalTeamId,
  }));
}
const replayGames = games.map((game) => {
  const completion = evidenceByGame.get(game.canonicalGameId)!;
  return {
    gameId: game.canonicalGameId,
    season: game.season,
    baseballDate: game.gameDate.toISOString().slice(0, 10),
    homeTeamId: offenseBySide.get(`${game.canonicalGameId}:home`)!.canonicalTeamId,
    awayTeamId: offenseBySide.get(`${game.canonicalGameId}:away`)!.canonicalTeamId,
    featureCutoff: iso(completion.featureCutoff),
    canonicalCompletionTime: iso(completion.canonicalCompletionTime),
    finalStatus: completion.finalStatus,
    quarantineReason: completion.quarantineReason,
  };
});
if (replayGames.some((game) => game.featureCutoff === null)) throw new Error("All games require an exact pregame feature cutoff");
const replay = replayMlbPitchingPit(replayGames, parsed, []);
if (replay.snapshots.length !== games.length * 2) throw new Error("Replay did not produce exactly two snapshots per game");

const providerByGame = new Map(games.map((game) => [game.canonicalGameId, game.providerGameId]));
const rawSourceByGame = new Map(raw.map((entry) => [entry.canonicalGameId, entry]));
const appearances = parsed.flatMap((entry) => entry.appearances).map((entry) => {
  const base = {
    schemaVersion: MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION, artifactKey: MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY,
    canonicalGameId: entry.gameId, providerGameId: providerByGame.get(entry.gameId)!,
    season: entry.season, canonicalPitcherId: entry.canonicalPitcherId, providerPitcherId: entry.providerPitcherId,
    canonicalTeamId: entry.teamId, opponentCanonicalTeamId: entry.opponentId, appearanceOrder: entry.appearanceOrder,
    starterFlagActual: entry.starterFlagActual, inningsPitched: mlbPitReal(entry.inningsPitched),
    outsRecorded: entry.inningsPitched === null ? null : Math.round(entry.inningsPitched * 3),
    battersFaced: entry.battersFaced, runsAllowed: entry.runsAllowed, earnedRuns: entry.earnedRuns,
    hitsAllowed: entry.hitsAllowed, walks: entry.walks, hitBatters: entry.hitBatters, strikeouts: entry.strikeouts,
    homeRunsAllowed: entry.homeRunsAllowed, pitchCount: entry.pitchCount, strikes: entry.strikes,
    appearanceCompletionTime: entry.appearanceCompletionTime, source: entry.source, sourceHash: entry.sourceHash,
    missingness: {
      conventionalOutcomeIncomplete: [entry.inningsPitched, entry.battersFaced, entry.runsAllowed, entry.earnedRuns,
        entry.hitsAllowed, entry.walks, entry.strikeouts, entry.homeRunsAllowed].some((value) => value === null),
      pitchCountMissing: entry.pitchCount === null, throwsMissing: entry.throws === null,
    },
    provenance: { rawBoxscoreHash: rawSourceByGame.get(entry.gameId)!.rawBodyHash, outcomeOnly: true },
  };
  return { ...base, outcomeChecksum: mlbPitchingArtifactHash(base) };
});
const bullpens = parsed.flatMap((entry) => entry.bullpens).map((entry) => {
  const conventional = [entry.bullpenInnings, entry.bullpenBattersFaced, entry.bullpenRuns, entry.bullpenEarnedRuns,
    entry.bullpenHits, entry.bullpenWalks, entry.bullpenStrikeouts, entry.bullpenHomeRuns];
  const base = {
    schemaVersion: MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION, artifactKey: MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY,
    canonicalGameId: entry.gameId, providerGameId: providerByGame.get(entry.gameId)!,
    season: entry.season, canonicalTeamId: entry.teamId, opponentCanonicalTeamId: entry.opponentId,
    bullpenInnings: mlbPitReal(entry.bullpenInnings),
    bullpenOutsRecorded: entry.bullpenInnings === null ? null : Math.round(entry.bullpenInnings * 3),
    bullpenBattersFaced: entry.bullpenBattersFaced, bullpenRuns: entry.bullpenRuns,
    bullpenEarnedRuns: entry.bullpenEarnedRuns, bullpenHits: entry.bullpenHits, bullpenWalks: entry.bullpenWalks,
    bullpenHitBatters: entry.bullpenHitBatters, bullpenStrikeouts: entry.bullpenStrikeouts,
    bullpenHomeRuns: entry.bullpenHomeRuns, relieversUsed: entry.relieversUsed,
    bullpenPitchCount: entry.bullpenPitchCount, bullpenStrikes: entry.bullpenStrikes, highLeverageUsage: null,
    gameCompletionTime: entry.appearanceCompletionTime, sourceHashes: { boxscore: entry.sourceHash },
    missingness: { conventionalOutcomeIncomplete: conventional.some((value) => value === null), pitchCountMissing: entry.bullpenPitchCount === null },
    provenance: { rawBoxscoreHash: rawSourceByGame.get(entry.gameId)!.rawBodyHash, outcomeOnly: true },
  };
  return { ...base, outcomeChecksum: mlbPitchingArtifactHash(base) };
});
const appearanceByKey = new Map(appearances.map((row) => [`${row.canonicalGameId}:${row.canonicalTeamId}:${row.canonicalPitcherId}`, row]));
const identities = parsed.flatMap((entry) => entry.appearances).map((entry) => {
  const base = {
    schemaVersion: MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION, artifactKey: MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY,
    canonicalPitcherId: entry.canonicalPitcherId, provider: "MLB_STATS_API", providerPitcherId: entry.providerPitcherId,
    pitcherName: entry.pitcherName, canonicalGameId: entry.gameId, canonicalTeamId: entry.teamId,
    providerTeamId: null, throws: entry.throws, season: entry.season, resolutionState: "RESOLVED_PROVIDER_ID",
    resolutionRule: "MLB_STATS_API_PERSON_ID_EXACT", ambiguous: false, sourceHashes: { boxscore: entry.sourceHash },
    provenance: { appearanceChecksum: appearanceByKey.get(`${entry.gameId}:${entry.teamId}:${entry.canonicalPitcherId}`)!.outcomeChecksum, fuzzyMatching: false },
  };
  return { ...base, checksum: mlbPitchingArtifactHash(base) };
});

const pitcherSnapshots = replay.snapshots.map((entry) => {
  const base = {
    schemaVersion: MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION, artifactKey: MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY,
    canonicalGameId: entry.gameId, season: entry.season, canonicalTeamId: entry.teamId,
    opponentCanonicalTeamId: entry.opponentId, featureCutoff: entry.featureCutoff!,
    statThroughTime: entry.pitcher.statThroughTime, pregameStarterId: entry.pregameStarterId,
    starterIdentityState: entry.starterIdentityState, starterHandedness: null, starterRoleState: "UNKNOWN_PREGAME",
    starterSeasonInnings: mlbPitReal(entry.pitcher.season.innings), starterSeasonEra: mlbPitReal(entry.pitcher.season.era),
    starterSeasonWhip: mlbPitReal(entry.pitcher.season.whip), starterSeasonKPct: mlbPitReal(entry.pitcher.season.kPct),
    starterSeasonBbPct: mlbPitReal(entry.pitcher.season.bbPct), starterSeasonKMinusBbPct: mlbPitReal(entry.pitcher.season.kMinusBbPct),
    starterSeasonHrRate: mlbPitReal(entry.pitcher.season.hrRate), starterSeasonFip: mlbPitReal(entry.pitcher.season.fip),
    starterRecentInnings: mlbPitReal(entry.pitcher.recent5.innings), starterRecentEra: mlbPitReal(entry.pitcher.recent5.era),
    starterRecentWhip: mlbPitReal(entry.pitcher.recent5.whip), starterRecentKPct: mlbPitReal(entry.pitcher.recent5.kPct),
    starterRecentBbPct: mlbPitReal(entry.pitcher.recent5.bbPct),
    starterDaysRest: entry.pitcher.daysSinceLastStart === null ? null : Math.floor(entry.pitcher.daysSinceLastStart),
    starterLastStartInnings: mlbPitReal(entry.pitcher.lastStartInnings), starterLastStartPitchCount: entry.pitcher.lastStartPitchCount,
    starterRecentWorkload: { lastAppearancePitchCount: entry.pitcher.lastAppearancePitchCount, recent3: entry.pitcher.recent3 },
    sourceAppearanceCount: entry.pitcher.career.appearances, starterSampleSize: entry.pitcher.season.appearances,
    starterPriorState: entry.pitcher.priorType, starterFeatureCompleteness: mlbPitReal(entry.pregameStarterId ? 1 : 0)!,
    advancedMetricStates: { fip: entry.pitcher.season.fip === null ? "UNAVAILABLE" : "RECONSTRUCTED_PIT_SAFE", other: "UNAVAILABLE" },
    missingness: entry.missingness,
    provenance: {
      replayChecksum: entry.checksum, actualStarterNeverPromoted: true,
      sealedCoreSplit: splitByGame.get(entry.gameId)?.cohort ?? null,
      splitState: splitByGame.has(entry.gameId) ? "SEALED_CORE_SPLIT" : "NO_SEALED_CORE_SPLIT",
    },
    sourceHashes: { replay: entry.checksum, sourceGameIds: entry.sourceGameIds },
  };
  return { ...base, checksum: mlbPitchingArtifactHash(base) };
});
const bullpenSnapshots = replay.snapshots.map((entry) => {
  const complete = entry.bullpen.season.appearances >= 3 && !entry.missingness.bullpenWorkloadIncomplete
    && entry.bullpen.season.innings !== null && entry.bullpen.season.era !== null
    && entry.bullpen.season.whip !== null && entry.bullpen.pitchesLast3d !== null;
  const base = {
    schemaVersion: MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION, artifactKey: MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY,
    canonicalGameId: entry.gameId, season: entry.season, canonicalTeamId: entry.teamId,
    opponentCanonicalTeamId: entry.opponentId, featureCutoff: entry.featureCutoff!, statThroughTime: entry.bullpen.statThroughTime,
    bullpenSeasonInnings: mlbPitReal(entry.bullpen.season.innings), bullpenSeasonEra: mlbPitReal(entry.bullpen.season.era),
    bullpenSeasonWhip: mlbPitReal(entry.bullpen.season.whip), bullpenSeasonKPct: mlbPitReal(entry.bullpen.season.kPct),
    bullpenSeasonBbPct: mlbPitReal(entry.bullpen.season.bbPct), bullpenSeasonKMinusBbPct: mlbPitReal(entry.bullpen.season.kMinusBbPct),
    bullpenSeasonHrRate: mlbPitReal(entry.bullpen.season.hrRate), bullpenSeasonFip: mlbPitReal(entry.bullpen.season.fip),
    bullpenLast3Innings: mlbPitReal(entry.bullpen.last3.innings), bullpenLast5Innings: mlbPitReal(entry.bullpen.last5.innings),
    bullpenLast10Era: mlbPitReal(entry.bullpen.last10.era), bullpenPitchesLast1d: entry.bullpen.pitchesLast1d,
    bullpenPitchesLast2d: entry.bullpen.pitchesLast2d, bullpenPitchesLast3d: entry.bullpen.pitchesLast3d,
    bullpenInningsLast1d: mlbPitReal(entry.bullpen.inningsLast1d), bullpenInningsLast2d: mlbPitReal(entry.bullpen.inningsLast2d),
    bullpenInningsLast3d: mlbPitReal(entry.bullpen.inningsLast3d), relieversUsedLast1d: entry.bullpen.relieversUsedLast1d,
    relieversUsedLast2d: entry.bullpen.relieversUsedLast2d, backToBackRelievers: entry.bullpen.backToBackRelievers,
    threeDayRelievers: entry.bullpen.threeDayRelievers, bullpenFatigueState: entry.bullpen.fatigueState,
    sourceGameCount: entry.sourceGameIds.length, bullpenSampleSize: entry.bullpen.season.appearances,
    bullpenPriorState: entry.bullpen.season.appearances ? "CURRENT_SEASON_SAMPLE" : "LEAGUE_PRIOR_REQUIRED",
    bullpenFeatureCompleteness: mlbPitReal(complete ? 1 : 0)!, relieverAvailability: { state: "UNAVAILABLE_NO_ROSTER_EVIDENCE" },
    missingness: entry.missingness,
    provenance: {
      replayChecksum: entry.checksum, targetGameUsageExcluded: true,
      sealedCoreSplit: splitByGame.get(entry.gameId)?.cohort ?? null,
      splitState: splitByGame.has(entry.gameId) ? "SEALED_CORE_SPLIT" : "NO_SEALED_CORE_SPLIT",
    },
    sourceHashes: { replay: entry.checksum, sourceGameIds: entry.sourceGameIds },
  };
  return { ...base, checksum: mlbPitchingArtifactHash(base) };
});
const bullpenSnapshotBySide = new Map(bullpenSnapshots.map((row) => [`${row.canonicalGameId}:${row.canonicalTeamId}`, row]));
const eligibility = games.map((game) => {
  const completion = evidenceByGame.get(game.canonicalGameId)!;
  const home = offenseBySide.get(`${game.canonicalGameId}:home`)!;
  const away = offenseBySide.get(`${game.canonicalGameId}:away`)!;
  const chronologySafe = completion.canonicalCompletionTime !== null && completion.quarantineReason === null;
  const coreOffenseEligible = chronologySafe && home.eligibilityState === "CORE_ELIGIBLE" && away.eligibilityState === "CORE_ELIGIBLE";
  const pitcherCoreEligible = false;
  const bullpenCoreEligible = coreOffenseEligible && [home, away].every((row) =>
    bullpenSnapshotBySide.get(`${game.canonicalGameId}:${row.canonicalTeamId}`)?.bullpenFeatureCompleteness === 1);
  const fullCoreEligible = coreOffenseEligible && pitcherCoreEligible && bullpenCoreEligible;
  const sealedSplit = splitByGame.get(game.canonicalGameId);
  const reasonCodes = [
    ...(!chronologySafe ? ["CHRONOLOGY_QUARANTINED"] : []),
    ...(!coreOffenseEligible ? ["OFFENSE_CORE_INELIGIBLE"] : []),
    ...(!sealedSplit ? ["NO_SEALED_CORE_SPLIT"] : []),
    "NO_LEGITIMATE_PREGAME_STARTER_EVIDENCE",
    ...(!bullpenCoreEligible ? ["INSUFFICIENT_COMPLETE_PRIOR_BULLPEN_STATE"] : []),
  ];
  const base = {
    schemaVersion: MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION, artifactKey: MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY,
    canonicalGameId: game.canonicalGameId, providerGameId: game.providerGameId, season: game.season,
    featureCutoff: completion.featureCutoff!.toISOString(), coreOffenseEligible, pitcherCoreEligible,
    bullpenCoreEligible, fullCoreEligible, enhancedEligible: false, quarantined: !chronologySafe,
    eligibilityTier: fullCoreEligible ? "FULL_CORE_ELIGIBLE" : bullpenCoreEligible ? "BULLPEN_CORE_ELIGIBLE"
      : coreOffenseEligible ? "CORE_OFFENSE_ELIGIBLE" : "INELIGIBLE",
    reasonCodes, missingness: { pregameStarterEvidence: true, enhancedFeatures: true },
    provenance: {
      chronologyArtifact: MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY,
      split: sealedSplit?.cohort ?? null,
      splitState: sealedSplit ? "SEALED_CORE_SPLIT" : "NO_SEALED_CORE_SPLIT",
    },
    sourceHashes: { chronology: chronologyArtifact.foundationChecksum, offenseHome: home.checksum, offenseAway: away.checksum },
  };
  return { ...base, checksum: mlbPitchingArtifactHash(base) };
});
const groups = { identities, appearances, bullpens, pitcherSnapshots, bullpenSnapshots, eligibility };
const foundationChecksum = mlbPitchingArtifactHash(Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, checksumSet(rows)])));
const sourceManifest = {
  chronology: {
    schemaVersion: MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION, artifactKey: MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY,
    sourceManifestHash: chronologyArtifact.sourceManifestHash, foundationChecksum: chronologyArtifact.foundationChecksum,
    replayChecksum: chronologyArtifact.replayChecksum,
  },
  boxscores: raw.map((entry) => ({
    canonicalGameId: entry.canonicalGameId, providerGameId: entry.providerGameId, endpoint: entry.endpoint,
    retrievedAt: entry.retrievedAt.toISOString(), rawBodyHash: entry.rawBodyHash, byteLength: entry.byteLength,
    sourceManifestHash: entry.sourceManifestHash, checksum: entry.checksum,
  })),
  rawArchive: {
    schemaVersion: MLB_PITCHER_BULLPEN_RAW_SCHEMA_VERSION,
    artifactKey: MLB_PITCHER_BULLPEN_RAW_ARTIFACT_KEY,
  },
  parser: "mlb-statsapi-boxscore-pitching-v1", replay: "mlb-pitcher-bullpen-pit-replay-v3",
  starterEvidence: "NONE_AVAILABLE_ACTUAL_ONLY_SEPARATED",
};
const sourceManifestHash = mlbPitchingArtifactHash(sourceManifest);
let status = "SEALED_PITCHER_BULLPEN_FOUNDATION";

await db.transaction(async (tx) => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY}))`);
  const existing = await tx.select().from(mlbHistoricalArtifactsTable).where(and(
    eq(mlbHistoricalArtifactsTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION),
    eq(mlbHistoricalArtifactsTable.artifactKey, MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY),
  ));
  if (existing.length > 1) throw new Error("Multiple pitcher/bullpen artifacts found");
  if (existing.length === 1) {
    const artifact = existing[0]!;
    if (artifact.status !== "SEALED_PITCHER_BULLPEN_FOUNDATION" || artifact.sourceManifestHash !== sourceManifestHash
      || artifact.foundationChecksum !== foundationChecksum || artifact.replayChecksum !== replay.checksum) {
      throw new Error("Existing sealed pitcher/bullpen artifact differs from deterministic rebuild");
    }
    const persisted = await Promise.all([
      tx.select({ checksum: mlbHistoricalPitcherIdentitiesTable.checksum }).from(mlbHistoricalPitcherIdentitiesTable).where(and(eq(mlbHistoricalPitcherIdentitiesTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION), eq(mlbHistoricalPitcherIdentitiesTable.artifactKey, MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY))),
      tx.select({ outcomeChecksum: mlbHistoricalPitcherAppearancesTable.outcomeChecksum }).from(mlbHistoricalPitcherAppearancesTable).where(and(eq(mlbHistoricalPitcherAppearancesTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION), eq(mlbHistoricalPitcherAppearancesTable.artifactKey, MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY))),
      tx.select({ outcomeChecksum: mlbHistoricalBullpenOutcomesTable.outcomeChecksum }).from(mlbHistoricalBullpenOutcomesTable).where(and(eq(mlbHistoricalBullpenOutcomesTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION), eq(mlbHistoricalBullpenOutcomesTable.artifactKey, MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY))),
      tx.select({ checksum: mlbHistoricalPregamePitcherSnapshotsTable.checksum }).from(mlbHistoricalPregamePitcherSnapshotsTable).where(and(eq(mlbHistoricalPregamePitcherSnapshotsTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION), eq(mlbHistoricalPregamePitcherSnapshotsTable.artifactKey, MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY))),
      tx.select({ checksum: mlbHistoricalPregameBullpenSnapshotsTable.checksum }).from(mlbHistoricalPregameBullpenSnapshotsTable).where(and(eq(mlbHistoricalPregameBullpenSnapshotsTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION), eq(mlbHistoricalPregameBullpenSnapshotsTable.artifactKey, MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY))),
      tx.select({ checksum: mlbHistoricalPitchingEligibilityTable.checksum }).from(mlbHistoricalPitchingEligibilityTable).where(and(eq(mlbHistoricalPitchingEligibilityTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION), eq(mlbHistoricalPitchingEligibilityTable.artifactKey, MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY))),
    ]);
    const persistedChecksum = mlbPitchingArtifactHash(Object.fromEntries(Object.keys(groups).map((key, index) => [key, checksumSet(persisted[index]!)])));
    if (persistedChecksum !== foundationChecksum) throw new Error("Existing sealed rows do not exactly match artifact checksum");
    await tx.execute(sql.raw(MLB_HISTORICAL_APPEND_ONLY_SQL));
    status = "VERIFIED_SEALED_ARTIFACT";
    return;
  }
  const sealedAt = new Date();
  await tx.insert(mlbHistoricalArtifactsTable).values({
    schemaVersion: MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION, artifactKey: MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY,
    sourceManifest, sourceManifestHash, foundationChecksum, replayChecksum: replay.checksum,
    retrievalCutoff: new Date(Math.max(...raw.map((entry) => entry.retrievedAt.getTime()))),
    status: "SEALED_PITCHER_BULLPEN_FOUNDATION", sealedAt,
  });
  await batches(identities, (batch) => tx.insert(mlbHistoricalPitcherIdentitiesTable).values(batch));
  await batches(appearances, (batch) => tx.insert(mlbHistoricalPitcherAppearancesTable).values(batch.map((row) => ({ ...row, appearanceCompletionTime: new Date(row.appearanceCompletionTime) }))));
  await batches(bullpens, (batch) => tx.insert(mlbHistoricalBullpenOutcomesTable).values(batch.map((row) => ({ ...row, gameCompletionTime: new Date(row.gameCompletionTime) }))));
  await batches(pitcherSnapshots, (batch) => tx.insert(mlbHistoricalPregamePitcherSnapshotsTable).values(batch.map((row) => ({ ...row, featureCutoff: new Date(row.featureCutoff), statThroughTime: row.statThroughTime ? new Date(row.statThroughTime) : null }))));
  await batches(bullpenSnapshots, (batch) => tx.insert(mlbHistoricalPregameBullpenSnapshotsTable).values(batch.map((row) => ({ ...row, featureCutoff: new Date(row.featureCutoff), statThroughTime: row.statThroughTime ? new Date(row.statThroughTime) : null }))));
  await batches(eligibility, (batch) => tx.insert(mlbHistoricalPitchingEligibilityTable).values(batch.map((row) => ({ ...row, featureCutoff: new Date(row.featureCutoff) }))));
  await tx.execute(sql.raw(MLB_HISTORICAL_APPEND_ONLY_SQL));
});

console.log(JSON.stringify({
  task: "224B-2", schemaVersion: MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION,
  artifactKey: MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY, status, sourceManifestHash,
  foundationChecksum, replayChecksum: replay.checksum,
  coverage: Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length])),
  parsedGames: parsed.length, quarantinedGames: games.length - parsed.length,
  providerCount: new Set(raw.map((entry) => entry.provider)).size,
  buildDurationMilliseconds: Date.now() - startedAt,
  seasons: Object.fromEntries([2023, 2024, 2025, 2026].map((season) => [season, {
    games: games.filter((game) => game.season === season).length,
    parsedGames: games.filter((game) => {
      const completion = evidenceByGame.get(game.canonicalGameId)!;
      return game.season === season && completion.canonicalCompletionTime && !completion.quarantineReason;
    }).length,
    coreOffense: eligibility.filter((row) => row.season === season && row.coreOffenseEligible).length,
    bullpenCore: eligibility.filter((row) => row.season === season && row.bullpenCoreEligible).length,
    pitcherCore: eligibility.filter((row) => row.season === season && row.pitcherCoreEligible).length,
    missingPregameStarter: pitcherSnapshots.filter((row) => row.season === season && row.missingness.starterUnknown).length,
    incompleteBullpenWorkload: bullpenSnapshots.filter((row) => row.season === season && row.missingness.bullpenWorkloadIncomplete).length,
  }])),
}));