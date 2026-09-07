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
import { MLB_HISTORICAL_APPEND_ONLY_TABLES } from "../src/services/mlbHistoricalAppendOnly";
import {
  MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY,
  MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
  MLB_HISTORICAL_CHRONOLOGY_RULE,
} from "../src/services/mlbHistoricalChronology";
import { parseMlbStatsApiPitchingOutcomes } from "../src/services/mlbHistoricalPitchingOutcomes";
import { replayMlbPitchingPit } from "../src/services/mlbHistoricalPitchingReplay";
import {
  MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY,
  MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION,
  MLB_PITCHER_BULLPEN_RAW_ARTIFACT_KEY,
  MLB_PITCHER_BULLPEN_RAW_SCHEMA_VERSION,
  MLB_PITCHER_BULLPEN_SPLIT_VERSION,
  mlbBoxscoreSnapshotBinding,
  mlbPitReal,
  mlbPitchingArtifactHash,
} from "../src/services/mlbHistoricalPitchingArtifact";

const started = Date.now();
const iso = (value: Date | null) => value?.toISOString() ?? null;
const bodyHash = (body: string) => createHash("sha256").update(body, "utf8").digest("hex");
const key = (game: string, team: string) => `${game}:${team}`;
const MARKET = /moneyline|run.?line|sportsbook|pinnacle|opening.?price|closing.?price|implied.?probability|line.?movement|market.?edge|\bclv\b/i;
const [artifacts, chronologyArtifacts, games, evidence, raw, offense, splits, identities, appearances, bullpens, pitcherSnapshots, bullpenSnapshots, eligibility] = await Promise.all([
  db.select().from(mlbHistoricalArtifactsTable).where(and(eq(mlbHistoricalArtifactsTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION), eq(mlbHistoricalArtifactsTable.artifactKey, MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY))),
  db.select().from(mlbHistoricalArtifactsTable).where(and(eq(mlbHistoricalArtifactsTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION), eq(mlbHistoricalArtifactsTable.artifactKey, MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY))),
  db.select().from(mlbHistoricalGamesTable).where(eq(mlbHistoricalGamesTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION)).orderBy(asc(mlbHistoricalGamesTable.scheduledFirstPitch), asc(mlbHistoricalGamesTable.providerGameId)),
  db.select().from(mlbHistoricalCompletionEvidenceTable).where(and(eq(mlbHistoricalCompletionEvidenceTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION), eq(mlbHistoricalCompletionEvidenceTable.artifactKey, MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY))),
  db.select().from(mlbHistoricalRawBoxscoreSnapshotsTable).where(and(eq(mlbHistoricalRawBoxscoreSnapshotsTable.schemaVersion, MLB_PITCHER_BULLPEN_RAW_SCHEMA_VERSION), eq(mlbHistoricalRawBoxscoreSnapshotsTable.artifactKey, MLB_PITCHER_BULLPEN_RAW_ARTIFACT_KEY))).orderBy(asc(mlbHistoricalRawBoxscoreSnapshotsTable.canonicalGameId)),
  db.select().from(mlbHistoricalTeamGameRowsTable).where(and(eq(mlbHistoricalTeamGameRowsTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION), eq(mlbHistoricalTeamGameRowsTable.artifactKey, MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY))),
  db.select().from(mlbHistoricalSplitsTable).where(and(eq(mlbHistoricalSplitsTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION), eq(mlbHistoricalSplitsTable.splitVersion, MLB_PITCHER_BULLPEN_SPLIT_VERSION))),
  db.select().from(mlbHistoricalPitcherIdentitiesTable).where(and(eq(mlbHistoricalPitcherIdentitiesTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION), eq(mlbHistoricalPitcherIdentitiesTable.artifactKey, MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY))),
  db.select().from(mlbHistoricalPitcherAppearancesTable).where(and(eq(mlbHistoricalPitcherAppearancesTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION), eq(mlbHistoricalPitcherAppearancesTable.artifactKey, MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY))),
  db.select().from(mlbHistoricalBullpenOutcomesTable).where(and(eq(mlbHistoricalBullpenOutcomesTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION), eq(mlbHistoricalBullpenOutcomesTable.artifactKey, MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY))),
  db.select().from(mlbHistoricalPregamePitcherSnapshotsTable).where(and(eq(mlbHistoricalPregamePitcherSnapshotsTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION), eq(mlbHistoricalPregamePitcherSnapshotsTable.artifactKey, MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY))),
  db.select().from(mlbHistoricalPregameBullpenSnapshotsTable).where(and(eq(mlbHistoricalPregameBullpenSnapshotsTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION), eq(mlbHistoricalPregameBullpenSnapshotsTable.artifactKey, MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY))),
  db.select().from(mlbHistoricalPitchingEligibilityTable).where(and(eq(mlbHistoricalPitchingEligibilityTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION), eq(mlbHistoricalPitchingEligibilityTable.artifactKey, MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY))),
]);
const artifact = artifacts.length === 1 ? artifacts[0]! : null;
const chronologyArtifact = chronologyArtifacts.length === 1 ? chronologyArtifacts[0]! : null;
const evidenceByGame = new Map(evidence.map((row) => [row.canonicalGameId, row]));
const rawByGame = new Map(raw.map((row) => [row.canonicalGameId, row]));
const offenseBySide = new Map(offense.map((row) => [`${row.canonicalGameId}:${row.teamSide}`, row]));
const splitByGame = new Map(splits.map((row) => [row.canonicalGameId, row]));
const violations = {
  coverage: 0, rawBody: 0, rawBinding: 0, parsing: 0, identities: 0, appearances: 0, bullpens: 0,
  snapshots: 0, chronology: 0, eligibility: 0, lockedOos: 0, market: 0, checksums: 0,
  artifact: 0, appendOnlyGuards: 0,
};
if (games.length !== 9_393 || evidenceByGame.size !== games.length || rawByGame.size !== games.length
  || offense.length !== games.length * 2 || splitByGame.size !== 9_073 || splits.length !== 9_073
  || pitcherSnapshots.length !== games.length * 2 || bullpenSnapshots.length !== games.length * 2
  || eligibility.length !== games.length) violations.coverage++;

const reparsed = [];
for (const game of games) {
  const source = rawByGame.get(game.canonicalGameId);
  const completion = evidenceByGame.get(game.canonicalGameId);
  const home = offenseBySide.get(`${game.canonicalGameId}:home`);
  const away = offenseBySide.get(`${game.canonicalGameId}:away`);
  if (!source || !completion || !home || !away) { violations.coverage++; continue; }
  let payload: unknown;
  try { payload = JSON.parse(source.rawBody); } catch { violations.rawBody++; continue; }
  const computedBodyHash = bodyHash(source.rawBody);
  if (source.httpStatus !== 200 || source.provider !== "MLB_STATS_API"
    || source.providerGameId !== game.providerGameId
    || source.endpoint !== `https://statsapi.mlb.com/api/v1/game/${game.providerGameId}/boxscore`
    || source.byteLength !== Buffer.byteLength(source.rawBody, "utf8") || source.rawBodyHash !== computedBodyHash) violations.rawBody++;
  const binding = mlbBoxscoreSnapshotBinding({
    canonicalGameId: source.canonicalGameId, providerGameId: source.providerGameId, endpoint: source.endpoint,
    retrievedAt: source.retrievedAt.toISOString(), rawBodyHash: source.rawBodyHash, byteLength: source.byteLength,
  });
  const rawBase = {
    schemaVersion: source.schemaVersion, artifactKey: source.artifactKey, canonicalGameId: source.canonicalGameId,
    provider: source.provider, providerGameId: source.providerGameId, endpoint: source.endpoint,
    retrievedAt: source.retrievedAt.toISOString(), httpStatus: source.httpStatus, contentType: source.contentType,
    rawBodyHash: source.rawBodyHash, byteLength: source.byteLength, sourceManifestHash: source.sourceManifestHash,
    provenance: source.provenance,
  };
  if (binding.sourceManifestHash !== source.sourceManifestHash
    || mlbPitchingArtifactHash(binding.manifest) !== source.sourceManifestHash
    || mlbPitchingArtifactHash(rawBase) !== source.checksum) violations.rawBinding++;
  if (completion.canonicalCompletionTime === null || completion.quarantineReason !== null) continue;
  try {
    reparsed.push(parseMlbStatsApiPitchingOutcomes(payload, {
      gameId: game.canonicalGameId, season: game.season,
      completionTime: completion.canonicalCompletionTime.toISOString(),
      homeTeamId: home.canonicalTeamId, awayTeamId: away.canonicalTeamId,
    }));
  } catch { violations.parsing++; }
}

const replayGames = games.flatMap((game) => {
  const completion = evidenceByGame.get(game.canonicalGameId);
  const home = offenseBySide.get(`${game.canonicalGameId}:home`);
  const away = offenseBySide.get(`${game.canonicalGameId}:away`);
  return completion && home && away ? [{
    gameId: game.canonicalGameId, season: game.season, baseballDate: game.gameDate.toISOString().slice(0, 10),
    homeTeamId: home.canonicalTeamId,
    awayTeamId: away.canonicalTeamId, featureCutoff: iso(completion.featureCutoff),
    canonicalCompletionTime: iso(completion.canonicalCompletionTime), finalStatus: completion.finalStatus,
    quarantineReason: completion.quarantineReason,
  }] : [];
});
const replay = replayMlbPitchingPit(replayGames, reparsed, []);
const parsedAppearances = reparsed.flatMap((row) => row.appearances);
const parsedBullpens = reparsed.flatMap((row) => row.bullpens);
const parsedAppearanceByKey = new Map(parsedAppearances.map((row) => [`${row.gameId}:${row.teamId}:${row.appearanceOrder}`, row]));
const persistedAppearanceByKey = new Map(appearances.map((row) => [`${row.canonicalGameId}:${row.canonicalTeamId}:${row.appearanceOrder}`, row]));
if (parsedAppearanceByKey.size !== appearances.length || persistedAppearanceByKey.size !== appearances.length) violations.appearances++;
for (const [identity, expected] of parsedAppearanceByKey) {
  const row = persistedAppearanceByKey.get(identity);
  if (!row || row.canonicalPitcherId !== expected.canonicalPitcherId || row.providerPitcherId !== expected.providerPitcherId
    || row.opponentCanonicalTeamId !== expected.opponentId || row.starterFlagActual !== expected.starterFlagActual
    || row.inningsPitched !== mlbPitReal(expected.inningsPitched) || row.battersFaced !== expected.battersFaced
    || row.runsAllowed !== expected.runsAllowed || row.earnedRuns !== expected.earnedRuns || row.hitsAllowed !== expected.hitsAllowed
    || row.walks !== expected.walks || row.hitBatters !== expected.hitBatters || row.strikeouts !== expected.strikeouts
    || row.homeRunsAllowed !== expected.homeRunsAllowed || row.pitchCount !== expected.pitchCount || row.strikes !== expected.strikes
    || iso(row.appearanceCompletionTime) !== expected.appearanceCompletionTime || row.sourceHash !== expected.sourceHash) violations.appearances++;
}
const parsedBullpenByKey = new Map(parsedBullpens.map((row) => [key(row.gameId, row.teamId), row]));
const persistedBullpenByKey = new Map(bullpens.map((row) => [key(row.canonicalGameId, row.canonicalTeamId), row]));
if (parsedBullpenByKey.size !== bullpens.length || persistedBullpenByKey.size !== bullpens.length) violations.bullpens++;
for (const [identity, expected] of parsedBullpenByKey) {
  const row = persistedBullpenByKey.get(identity);
  if (!row || row.bullpenInnings !== mlbPitReal(expected.bullpenInnings) || row.bullpenBattersFaced !== expected.bullpenBattersFaced
    || row.bullpenRuns !== expected.bullpenRuns || row.bullpenEarnedRuns !== expected.bullpenEarnedRuns
    || row.bullpenHits !== expected.bullpenHits || row.bullpenWalks !== expected.bullpenWalks
    || row.bullpenHitBatters !== expected.bullpenHitBatters || row.bullpenStrikeouts !== expected.bullpenStrikeouts
    || row.bullpenHomeRuns !== expected.bullpenHomeRuns || row.bullpenPitchCount !== expected.bullpenPitchCount
    || row.bullpenStrikes !== expected.bullpenStrikes || row.relieversUsed !== expected.relieversUsed
    || iso(row.gameCompletionTime) !== expected.appearanceCompletionTime) violations.bullpens++;
}
const expectedIdentityKeys = new Set(parsedAppearances.map((row) => `${row.gameId}:${row.canonicalPitcherId}`));
const persistedIdentityKeys = new Set(identities.map((row) => `${row.canonicalGameId}:${row.canonicalPitcherId}`));
if (expectedIdentityKeys.size !== identities.length || persistedIdentityKeys.size !== identities.length
  || [...expectedIdentityKeys].some((value) => !persistedIdentityKeys.has(value))
  || identities.some((row) => row.ambiguous || row.resolutionRule !== "MLB_STATS_API_PERSON_ID_EXACT"
    || row.canonicalPitcherId !== `mlb:${row.providerPitcherId}`)) violations.identities++;

const expectedSnapshotByKey = new Map(replay.snapshots.map((row) => [key(row.gameId, row.teamId), row]));
for (const row of [...pitcherSnapshots, ...bullpenSnapshots]) {
  const expected = expectedSnapshotByKey.get(key(row.canonicalGameId, row.canonicalTeamId));
  if (!expected || iso(row.featureCutoff) !== expected.featureCutoff
    || (row.statThroughTime && !(row.statThroughTime < row.featureCutoff))) violations.snapshots++;
}
for (const row of pitcherSnapshots) {
  const expected = expectedSnapshotByKey.get(key(row.canonicalGameId, row.canonicalTeamId));
  const split = splitByGame.get(row.canonicalGameId);
  if (!expected || row.pregameStarterId !== expected.pregameStarterId
    || row.starterIdentityState !== expected.starterIdentityState
    || row.starterSeasonInnings !== mlbPitReal(expected.pitcher.season.innings)
    || row.starterSeasonEra !== mlbPitReal(expected.pitcher.season.era)
    || row.starterSeasonWhip !== mlbPitReal(expected.pitcher.season.whip)
    || row.starterRecentInnings !== mlbPitReal(expected.pitcher.recent5.innings)
    || row.starterLastStartInnings !== mlbPitReal(expected.pitcher.lastStartInnings)
    || row.starterLastStartPitchCount !== expected.pitcher.lastStartPitchCount
    || (row.provenance as { replayChecksum?: string }).replayChecksum !== expected.checksum
    || (row.provenance as { sealedCoreSplit?: string | null }).sealedCoreSplit !== (split?.cohort ?? null)
    || (row.provenance as { splitState?: string }).splitState !== (split ? "SEALED_CORE_SPLIT" : "NO_SEALED_CORE_SPLIT")) violations.snapshots++;
}
for (const row of bullpenSnapshots) {
  const expected = expectedSnapshotByKey.get(key(row.canonicalGameId, row.canonicalTeamId));
  const split = splitByGame.get(row.canonicalGameId);
  if (!expected || row.bullpenSeasonInnings !== mlbPitReal(expected.bullpen.season.innings)
    || row.bullpenSeasonEra !== mlbPitReal(expected.bullpen.season.era)
    || row.bullpenSeasonWhip !== mlbPitReal(expected.bullpen.season.whip)
    || row.bullpenPitchesLast3d !== expected.bullpen.pitchesLast3d
    || row.bullpenFatigueState !== expected.bullpen.fatigueState
    || row.backToBackRelievers !== expected.bullpen.backToBackRelievers
    || (row.provenance as { replayChecksum?: string }).replayChecksum !== expected.checksum
    || (row.provenance as { sealedCoreSplit?: string | null }).sealedCoreSplit !== (split?.cohort ?? null)
    || (row.provenance as { splitState?: string }).splitState !== (split ? "SEALED_CORE_SPLIT" : "NO_SEALED_CORE_SPLIT")) violations.snapshots++;
}
if (pitcherSnapshots.some((row) => row.pregameStarterId !== null
  || !["ACTUAL_ONLY", "UNKNOWN"].includes(row.starterIdentityState)
  || row.starterFeatureCompleteness !== 0)) violations.identities++;
for (const snapshot of replay.snapshots) {
  if (snapshot.sourceGameIds.some((gameId) => {
    const source = evidenceByGame.get(gameId);
    return !source?.canonicalCompletionTime || !snapshot.featureCutoff
      || !(source.canonicalCompletionTime < new Date(snapshot.featureCutoff));
  })) violations.chronology++;
}

const eligibilityByGame = new Map(eligibility.map((row) => [row.canonicalGameId, row]));
for (const game of games) {
  const row = eligibilityByGame.get(game.canonicalGameId);
  const completion = evidenceByGame.get(game.canonicalGameId);
  const home = offenseBySide.get(`${game.canonicalGameId}:home`);
  const away = offenseBySide.get(`${game.canonicalGameId}:away`);
  const offenseCore = Boolean(completion?.canonicalCompletionTime && !completion.quarantineReason
    && home?.eligibilityState === "CORE_ELIGIBLE" && away?.eligibilityState === "CORE_ELIGIBLE");
  const bullpenComplete = [home, away].every((side) => {
    const snapshot = side && bullpenSnapshots.find((entry) =>
      entry.canonicalGameId === game.canonicalGameId && entry.canonicalTeamId === side.canonicalTeamId);
    return snapshot?.bullpenFeatureCompleteness === 1;
  });
  const expectedBullpen = offenseCore && bullpenComplete;
  const expectedTier = expectedBullpen ? "BULLPEN_CORE_ELIGIBLE"
    : offenseCore ? "CORE_OFFENSE_ELIGIBLE" : "INELIGIBLE";
  const split = splitByGame.get(game.canonicalGameId);
  const expectedReasons = [
    ...(!completion?.canonicalCompletionTime || completion.quarantineReason ? ["CHRONOLOGY_QUARANTINED"] : []),
    ...(!offenseCore ? ["OFFENSE_CORE_INELIGIBLE"] : []),
    ...(!split ? ["NO_SEALED_CORE_SPLIT"] : []),
    "NO_LEGITIMATE_PREGAME_STARTER_EVIDENCE",
    ...(!expectedBullpen ? ["INSUFFICIENT_COMPLETE_PRIOR_BULLPEN_STATE"] : []),
  ];
  if (!row || row.coreOffenseEligible !== offenseCore || row.pitcherCoreEligible
    || row.bullpenCoreEligible !== expectedBullpen || row.fullCoreEligible
    || row.eligibilityTier !== expectedTier || JSON.stringify(row.reasonCodes) !== JSON.stringify(expectedReasons)
    || row.enhancedEligible || row.quarantined !== !Boolean(completion?.canonicalCompletionTime && !completion.quarantineReason)
    || (row.provenance as { split?: string | null; splitState?: string }).split !== (split?.cohort ?? null)
    || (row.provenance as { splitState?: string }).splitState !== (split ? "SEALED_CORE_SPLIT" : "NO_SEALED_CORE_SPLIT")) violations.eligibility++;
}
const locked = splits.filter((row) => row.cohort === "LOCKED_OOS");
if (locked.length !== 2_012 || locked.some((row) => !eligibilityByGame.has(row.canonicalGameId))
  || eligibility.some((row) => (row.provenance as { split?: string | null }).split === "LOCKED_OOS"
    && splitByGame.get(row.canonicalGameId)?.cohort !== "LOCKED_OOS")) violations.lockedOos++;
if (MARKET.test(JSON.stringify({ identities, appearances, bullpens, pitcherSnapshots, bullpenSnapshots, eligibility }))) violations.market++;

const strip = (row: Record<string, unknown>, checksumField: string) => Object.fromEntries(Object.entries(row)
  .filter(([name]) => !["id", "createdAt", checksumField].includes(name))
  .map(([name, value]) => [name, value instanceof Date ? value.toISOString() : value]));
for (const [rows, field] of [[identities, "checksum"], [appearances, "outcomeChecksum"], [bullpens, "outcomeChecksum"], [pitcherSnapshots, "checksum"], [bullpenSnapshots, "checksum"], [eligibility, "checksum"]] as const) {
  for (const row of rows) if (mlbPitchingArtifactHash(strip(row as unknown as Record<string, unknown>, field)) !== row[field]) violations.checksums++;
}
const checksumSet = (rows: readonly Record<string, unknown>[], field: string) => rows.map((row) => String(row[field])).sort();
const foundationChecksum = mlbPitchingArtifactHash({
  identities: checksumSet(identities as unknown as Record<string, unknown>[], "checksum"),
  appearances: checksumSet(appearances as unknown as Record<string, unknown>[], "outcomeChecksum"),
  bullpens: checksumSet(bullpens as unknown as Record<string, unknown>[], "outcomeChecksum"),
  pitcherSnapshots: checksumSet(pitcherSnapshots as unknown as Record<string, unknown>[], "checksum"),
  bullpenSnapshots: checksumSet(bullpenSnapshots as unknown as Record<string, unknown>[], "checksum"),
  eligibility: checksumSet(eligibility as unknown as Record<string, unknown>[], "checksum"),
});
const sourceManifest = chronologyArtifact ? {
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
} : null;
if (!artifact || artifact.status !== "SEALED_PITCHER_BULLPEN_FOUNDATION" || !sourceManifest
  || artifact.sourceManifestHash !== mlbPitchingArtifactHash(sourceManifest)
  || artifact.foundationChecksum !== foundationChecksum || artifact.replayChecksum !== replay.checksum
  || iso(artifact.retrievalCutoff) !== (raw.length ? new Date(Math.max(...raw.map((row) => row.retrievedAt.getTime()))).toISOString() : null)) violations.artifact++;

const guardNames = MLB_HISTORICAL_APPEND_ONLY_TABLES.flatMap((table) => [`${table}_block_row_mutation`, `${table}_block_truncate`]);
const triggerResult = await db.execute(sql<{ tgname: string }>`select tgname from pg_trigger where not tgisinternal and tgname like 'mlb_historical_%_block_%'`);
const actualGuards = new Set(triggerResult.rows.map((row) => row.tgname));
violations.appendOnlyGuards = guardNames.filter((name) => !actualGuards.has(name)).length;
const seasons = Object.fromEntries([2023, 2024, 2025, 2026].map((season) => [season, {
  games: games.filter((row) => row.season === season).length,
  chronologySafe: games.filter((row) => row.season === season && evidenceByGame.get(row.canonicalGameId)?.canonicalCompletionTime && !evidenceByGame.get(row.canonicalGameId)?.quarantineReason).length,
  starterStates: Object.fromEntries(["CONFIRMED_PREGAME", "PROJECTED_PREGAME", "ACTUAL_ONLY", "UNKNOWN"].map((state) => [state, pitcherSnapshots.filter((row) => row.season === season && row.starterIdentityState === state).length])),
  appearances: appearances.filter((row) => row.season === season).length,
  bullpenOutcomes: bullpens.filter((row) => row.season === season).length,
  offenseCore: eligibility.filter((row) => row.season === season && row.coreOffenseEligible).length,
  pitcherCore: eligibility.filter((row) => row.season === season && row.pitcherCoreEligible).length,
  bullpenCore: eligibility.filter((row) => row.season === season && row.bullpenCoreEligible).length,
  fullCore: eligibility.filter((row) => row.season === season && row.fullCoreEligible).length,
  enhanced: eligibility.filter((row) => row.season === season && row.enhancedEligible).length,
  quarantined: eligibility.filter((row) => row.season === season && row.quarantined).length,
}]));
const failureCount = Object.values(violations).reduce((sum, value) => sum + value, 0);
const result = {
  task: "224B-2", schemaVersion: MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION, artifactKey: MLB_PITCHER_BULLPEN_PIT_ARTIFACT_KEY,
  coverage: { games: games.length, rawBoxscores: raw.length, rawBytes: raw.reduce((sum, row) => sum + row.byteLength, 0), reparsedGames: reparsed.length, snapshots: pitcherSnapshots.length + bullpenSnapshots.length, seasons },
  identity: { rows: identities.length, canonicalPitchers: new Set(identities.map((row) => row.canonicalPitcherId)).size, ambiguous: identities.filter((row) => row.ambiguous).length },
  starterStates: Object.fromEntries(["CONFIRMED_PREGAME", "PROJECTED_PREGAME", "ACTUAL_ONLY", "UNKNOWN"].map((state) => [state, pitcherSnapshots.filter((row) => row.starterIdentityState === state).length])),
  appearances: { rows: appearances.length, startersActualOutcomeOnly: appearances.filter((row) => row.starterFlagActual).length },
  bullpens: { outcomes: bullpens.length, snapshots: bullpenSnapshots.length, complete: bullpenSnapshots.filter((row) => row.bullpenFeatureCompleteness === 1).length },
  lockedOos: { original: locked.length, expansion: 0, pitcherCore: locked.filter((split) => eligibilityByGame.get(split.canonicalGameId)?.pitcherCoreEligible).length, bullpenCore: locked.filter((split) => eligibilityByGame.get(split.canonicalGameId)?.bullpenCoreEligible).length, fullCore: locked.filter((split) => eligibilityByGame.get(split.canonicalGameId)?.fullCoreEligible).length },
  performance: { auditMilliseconds: Date.now() - started, gamesPerSecond: games.length / Math.max(0.001, (Date.now() - started) / 1000) },
  violations,
  checksums: { rebuiltFoundation: foundationChecksum, artifactFoundation: artifact?.foundationChecksum ?? null, rebuiltReplay: replay.checksum, artifactReplay: artifact?.replayChecksum ?? null, sourceManifest: sourceManifest ? mlbPitchingArtifactHash(sourceManifest) : null },
  invariants: { chronologyRule: MLB_HISTORICAL_CHRONOLOGY_RULE, marketLeakage: 0, enhancedAlwaysFalse: true, expectedAppendOnlyGuards: guardNames.length },
  status: failureCount === 0 ? "PASS" : "FAIL",
};
console.log(JSON.stringify(result, null, 2));
if (result.status === "FAIL") process.exitCode = 1;