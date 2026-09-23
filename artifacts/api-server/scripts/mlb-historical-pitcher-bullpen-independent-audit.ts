import { createHash } from "node:crypto";
import { and, asc, eq, gt, sql } from "drizzle-orm";
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

/*
 * This audit intentionally shares no parser, replay, REAL-normalizer, or
 * hashing implementation with the materializer. Constants are repeated here
 * so importing this file cannot initialize any production PIT implementation.
 */
const CHRONOLOGY_SCHEMA = "mlb-completion-chronology-v3";
const CHRONOLOGY_ARTIFACT = "mlb-historical-2023-2026-completion-v3-raw-bound";
const RAW_SCHEMA = "mlb-pitcher-bullpen-pit-v1";
const RAW_ARTIFACT = "mlb-historical-2023-2026-pitcher-bullpen-pit-v1";
const PIT_SCHEMA = "mlb-pitcher-bullpen-pit-v5";
const PIT_ARTIFACT = "mlb-historical-2023-2026-pitcher-bullpen-pit-v5";
const SPLIT_VERSION = "mlb-completion-chronology-split-2023-2026-v3";
const PARSER_VERSION = "mlb-statsapi-boxscore-pitching-v1";
const REPLAY_VERSION = "mlb-pitcher-bullpen-pit-replay-v3";
const RAW_SOURCE_VERSION = "mlb-statsapi-v1-game-boxscore-exact-v1";
const DAY = 86_400_000;
const FIP_CONSTANT = 3.10;
const started = Date.now();

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type AnyRow = Record<string, unknown>;
type Appearance = {
  gameId: string; providerGameId: string; season: number; pitcherId: string; providerPitcherId: string;
  pitcherName: string; teamId: string; opponentId: string; order: number; starter: boolean;
  innings: number | null; outs: number | null; batters: number | null; runs: number | null;
  earned: number | null; hits: number | null; walks: number | null; hitBatters: number | null;
  strikeouts: number | null; homeRuns: number | null; pitches: number | null; strikes: number | null;
  throws: "L" | "R" | null; completion: string; sourceHash: string; rawHash: string;
};
type Bullpen = {
  gameId: string; providerGameId: string; season: number; teamId: string; opponentId: string;
  innings: number | null; outs: number | null; batters: number | null; runs: number | null;
  earned: number | null; hits: number | null; walks: number | null; hitBatters: number | null;
  strikeouts: number | null; homeRuns: number | null; pitches: number | null; strikes: number | null;
  relievers: number; completion: string; sourceHash: string; rawHash: string;
};
type Rate = {
  appearances: number; starts: number; innings: number | null; hitBatters: number | null;
  era: number | null; whip: number | null; kPct: number | null; bbPct: number | null;
  kMinusBbPct: number | null; hrRate: number | null; fip: number | null;
};

const violations: Record<string, number> = {
  coverage: 0, rawBody: 0, rawBinding: 0, parsing: 0, identities: 0,
  appearances: 0, bullpenOutcomes: 0, snapshotChronology: 0, pitcherSnapshots: 0,
  bullpenSnapshots: 0, eligibility: 0, sealedSplits: 0, lockedOos: 0,
  marketFields: 0, rowChecksums: 0, groupChecksums: 0, artifact: 0, appendOnlyGuards: 0,
};
const fail = (category: keyof typeof violations, count = 1) => { violations[category] += count; };
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;
const sideKey = (game: string, team: string) => `${game}\u0000${team}`;
const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as AnyRow;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
};
const hash = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
const hashBody = (body: string) => createHash("sha256").update(body, "utf8").digest("hex");
const real = (value: number | null | undefined) =>
  value === null || value === undefined ? null : Number(value.toPrecision(6));
const sameReal = (left: number | null, right: number | null) => real(left) === real(right);
const sameJson = (left: unknown, right: unknown) => stableJson(left) === stableJson(right);
const object = (value: unknown): AnyRow =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as AnyRow : {};
const finite = (value: unknown) => {
  const parsed = typeof value === "number" ? value
    : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const integer = (value: unknown) => {
  const parsed = finite(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
};
const innings = (value: unknown) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = /^(\d+)(?:\.([012]))?$/.exec(String(value).trim());
  return match ? Number(match[1]) + Number(match[2] ?? 0) / 3 : null;
};
const sum = <T>(rows: readonly T[], getter: (row: T) => number | null) =>
  rows.some((row) => getter(row) === null) ? null : rows.reduce((total, row) => total + Number(getter(row)), 0);
const strip = (row: AnyRow, checksum: string) => Object.fromEntries(Object.entries(row)
  .filter(([name]) => name !== "id" && name !== "createdAt" && name !== checksum)
  .map(([name, value]) => [name, value instanceof Date ? value.toISOString() : value]));
const emptyRate = (): Rate => ({
  appearances: 0, starts: 0, innings: null, hitBatters: null, era: null, whip: null,
  kPct: null, bbPct: null, kMinusBbPct: null, hrRate: null, fip: null,
});
const rate = (rows: readonly Bullpen[]): Rate => {
  if (rows.length === 0) return emptyRate();
  const ip = sum(rows, (row) => row.innings);
  const er = sum(rows, (row) => row.earned);
  const hits = sum(rows, (row) => row.hits);
  const walks = sum(rows, (row) => row.walks);
  const hbp = sum(rows, (row) => row.hitBatters);
  const strikeouts = sum(rows, (row) => row.strikeouts);
  const homers = sum(rows, (row) => row.homeRuns);
  const batters = sum(rows, (row) => row.batters);
  return {
    appearances: rows.length, starts: 0, innings: ip, hitBatters: hbp,
    era: ip && er !== null ? 9 * er / ip : null,
    whip: ip && hits !== null && walks !== null ? (hits + walks) / ip : null,
    kPct: batters && strikeouts !== null ? strikeouts / batters : null,
    bbPct: batters && walks !== null ? walks / batters : null,
    kMinusBbPct: batters && strikeouts !== null && walks !== null ? (strikeouts - walks) / batters : null,
    hrRate: batters && homers !== null ? homers / batters : null,
    fip: ip && homers !== null && walks !== null && hbp !== null && strikeouts !== null
      ? (13 * homers + 3 * (walks + hbp) - 2 * strikeouts) / ip + FIP_CONSTANT : null,
  };
};
const previousDates = (date: string, count: number) => {
  const base = new Date(`${date}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const prior = new Date(base);
    prior.setUTCDate(prior.getUTCDate() - index - 1);
    return prior.toISOString().slice(0, 10);
  });
};
const rateFieldsEqual = (actual: {
  innings: number | null; era: number | null; whip: number | null; kPct: number | null;
  bbPct: number | null; kMinusBbPct: number | null; hrRate: number | null; fip: number | null;
}, expected: Rate) =>
  sameReal(actual.innings, expected.innings) && sameReal(actual.era, expected.era)
  && sameReal(actual.whip, expected.whip) && sameReal(actual.kPct, expected.kPct)
  && sameReal(actual.bbPct, expected.bbPct) && sameReal(actual.kMinusBbPct, expected.kMinusBbPct)
  && sameReal(actual.hrRate, expected.hrRate) && sameReal(actual.fip, expected.fip);

const [
  artifacts, chronologyArtifacts, games, evidence, offense, splits, rawMetadata,
] = await Promise.all([
  db.select().from(mlbHistoricalArtifactsTable).where(and(
    eq(mlbHistoricalArtifactsTable.schemaVersion, PIT_SCHEMA),
    eq(mlbHistoricalArtifactsTable.artifactKey, PIT_ARTIFACT),
  )),
  db.select().from(mlbHistoricalArtifactsTable).where(and(
    eq(mlbHistoricalArtifactsTable.schemaVersion, CHRONOLOGY_SCHEMA),
    eq(mlbHistoricalArtifactsTable.artifactKey, CHRONOLOGY_ARTIFACT),
  )),
  db.select().from(mlbHistoricalGamesTable).where(eq(
    mlbHistoricalGamesTable.schemaVersion, CHRONOLOGY_SCHEMA,
  )).orderBy(asc(mlbHistoricalGamesTable.scheduledFirstPitch), asc(mlbHistoricalGamesTable.providerGameId)),
  db.select().from(mlbHistoricalCompletionEvidenceTable).where(and(
    eq(mlbHistoricalCompletionEvidenceTable.schemaVersion, CHRONOLOGY_SCHEMA),
    eq(mlbHistoricalCompletionEvidenceTable.artifactKey, CHRONOLOGY_ARTIFACT),
  )),
  db.select().from(mlbHistoricalTeamGameRowsTable).where(and(
    eq(mlbHistoricalTeamGameRowsTable.schemaVersion, CHRONOLOGY_SCHEMA),
    eq(mlbHistoricalTeamGameRowsTable.artifactKey, CHRONOLOGY_ARTIFACT),
  )),
  db.select().from(mlbHistoricalSplitsTable).where(and(
    eq(mlbHistoricalSplitsTable.schemaVersion, CHRONOLOGY_SCHEMA),
    eq(mlbHistoricalSplitsTable.splitVersion, SPLIT_VERSION),
  )),
  db.select({
    id: mlbHistoricalRawBoxscoreSnapshotsTable.id,
    canonicalGameId: mlbHistoricalRawBoxscoreSnapshotsTable.canonicalGameId,
    providerGameId: mlbHistoricalRawBoxscoreSnapshotsTable.providerGameId,
    endpoint: mlbHistoricalRawBoxscoreSnapshotsTable.endpoint,
    retrievedAt: mlbHistoricalRawBoxscoreSnapshotsTable.retrievedAt,
    rawBodyHash: mlbHistoricalRawBoxscoreSnapshotsTable.rawBodyHash,
    byteLength: mlbHistoricalRawBoxscoreSnapshotsTable.byteLength,
    sourceManifestHash: mlbHistoricalRawBoxscoreSnapshotsTable.sourceManifestHash,
    checksum: mlbHistoricalRawBoxscoreSnapshotsTable.checksum,
  }).from(mlbHistoricalRawBoxscoreSnapshotsTable).where(and(
    eq(mlbHistoricalRawBoxscoreSnapshotsTable.schemaVersion, RAW_SCHEMA),
    eq(mlbHistoricalRawBoxscoreSnapshotsTable.artifactKey, RAW_ARTIFACT),
  )).orderBy(asc(mlbHistoricalRawBoxscoreSnapshotsTable.canonicalGameId)),
]);

const artifact = artifacts.length === 1 ? artifacts[0]! : null;
const chronologyArtifact = chronologyArtifacts.length === 1 ? chronologyArtifacts[0]! : null;
const gameById = new Map(games.map((row) => [row.canonicalGameId, row]));
const evidenceByGame = new Map(evidence.map((row) => [row.canonicalGameId, row]));
const offenseBySide = new Map(offense.map((row) => [`${row.canonicalGameId}:${row.teamSide}`, row]));
const splitByGame = new Map(splits.map((row) => [row.canonicalGameId, row]));
if (games.length !== 9_393 || gameById.size !== 9_393 || evidence.length !== 9_393
  || evidenceByGame.size !== 9_393 || offense.length !== 18_786 || offenseBySide.size !== 18_786
  || rawMetadata.length !== 9_393 || new Set(rawMetadata.map((row) => row.canonicalGameId)).size !== 9_393) {
  fail("coverage");
}
if (!chronologyArtifact || splits.length !== 9_073 || splitByGame.size !== 9_073
  || splits.some((row) => !row.immutable || row.foundationChecksum !== chronologyArtifact.foundationChecksum
    || !gameById.has(row.canonicalGameId))) fail("sealedSplits");

const appearances: Appearance[] = [];
const parsedBullpens: Bullpen[] = [];
let reparsedGames = 0;
let rawBytes = 0;
let lastRawId = 0;
const RAW_BATCH = 25;
for (;;) {
  const batch = await db.select().from(mlbHistoricalRawBoxscoreSnapshotsTable).where(and(
    eq(mlbHistoricalRawBoxscoreSnapshotsTable.schemaVersion, RAW_SCHEMA),
    eq(mlbHistoricalRawBoxscoreSnapshotsTable.artifactKey, RAW_ARTIFACT),
    gt(mlbHistoricalRawBoxscoreSnapshotsTable.id, lastRawId),
  )).orderBy(asc(mlbHistoricalRawBoxscoreSnapshotsTable.id)).limit(RAW_BATCH);
  if (!batch.length) break;
  lastRawId = batch.at(-1)!.id;
  for (const source of batch) {
    rawBytes += source.byteLength;
    const game = gameById.get(source.canonicalGameId);
    const completion = evidenceByGame.get(source.canonicalGameId);
    const home = offenseBySide.get(`${source.canonicalGameId}:home`);
    const away = offenseBySide.get(`${source.canonicalGameId}:away`);
    const endpoint = `https://statsapi.mlb.com/api/v1/game/${source.providerGameId}/boxscore`;
    const bodyDigest = hashBody(source.rawBody);
    if (!game || !completion || !home || !away || source.provider !== "MLB_STATS_API"
      || source.providerGameId !== game?.providerGameId || source.endpoint !== endpoint
      || source.httpStatus !== 200 || source.byteLength !== Buffer.byteLength(source.rawBody, "utf8")
      || source.rawBodyHash !== bodyDigest) fail("rawBody");
    const manifest = {
      sourceVersion: RAW_SOURCE_VERSION, provider: "MLB_STATS_API",
      canonicalGameId: source.canonicalGameId, providerGameId: source.providerGameId,
      endpoint: source.endpoint, retrievedAt: source.retrievedAt.toISOString(),
      rawBodyHash: source.rawBodyHash, byteLength: source.byteLength,
    };
    const rawBase = {
      schemaVersion: source.schemaVersion, artifactKey: source.artifactKey,
      canonicalGameId: source.canonicalGameId, provider: source.provider,
      providerGameId: source.providerGameId, endpoint: source.endpoint,
      retrievedAt: source.retrievedAt.toISOString(), httpStatus: source.httpStatus,
      contentType: source.contentType, rawBodyHash: source.rawBodyHash,
      byteLength: source.byteLength, sourceManifestHash: source.sourceManifestHash,
      provenance: source.provenance,
    };
    if (source.sourceManifestHash !== hash(manifest) || source.checksum !== hash(rawBase)) fail("rawBinding");
    if (!game || !completion || !home || !away
      || completion.canonicalCompletionTime === null || completion.quarantineReason !== null) continue;
    let payload: unknown;
    try { payload = JSON.parse(source.rawBody); } catch { fail("parsing"); continue; }
    const sourceHash = hash(payload);
    const teams = object(object(payload).teams);
    let parseFailed = false;
    for (const side of ["away", "home"] as const) {
      const team = object(teams[side]);
      const players = object(team.players);
      const pitcherIds = Array.isArray(team.pitchers) ? team.pitchers : [];
      const teamId = side === "home" ? home.canonicalTeamId : away.canonicalTeamId;
      const opponentId = side === "home" ? away.canonicalTeamId : home.canonicalTeamId;
      const sideRows: Appearance[] = [];
      for (const rawId of pitcherIds) {
        const id = integer(rawId);
        if (id === null) continue;
        const player = object(players[`ID${id}`]);
        const person = object(player.person);
        const pitching = object(object(player.stats).pitching);
        if (!Object.keys(pitching).length) continue;
        const hand = object(person.pitchHand).code ?? object(player.pitchHand).code;
        const ip = innings(pitching.inningsPitched);
        sideRows.push({
          gameId: game.canonicalGameId, providerGameId: game.providerGameId, season: game.season,
          pitcherId: `mlb:${id}`, providerPitcherId: String(id),
          pitcherName: typeof person.fullName === "string" ? person.fullName : `MLB ${id}`,
          teamId, opponentId, order: sideRows.length + 1, starter: sideRows.length === 0,
          innings: ip, outs: ip === null ? null : Math.round(ip * 3),
          batters: integer(pitching.battersFaced), runs: integer(pitching.runs),
          earned: integer(pitching.earnedRuns), hits: integer(pitching.hits),
          walks: integer(pitching.baseOnBalls), hitBatters: integer(pitching.hitBatsmen),
          strikeouts: integer(pitching.strikeOuts), homeRuns: integer(pitching.homeRuns),
          pitches: integer(pitching.numberOfPitches), strikes: integer(pitching.strikes),
          throws: hand === "L" || hand === "R" ? hand : null,
          completion: completion.canonicalCompletionTime.toISOString(), sourceHash, rawHash: source.rawBodyHash,
        });
      }
      if (!sideRows.length) parseFailed = true;
      appearances.push(...sideRows);
      const relief = sideRows.slice(1);
      const bullpenInnings = sum(relief, (row) => row.innings);
      parsedBullpens.push({
        gameId: game.canonicalGameId, providerGameId: game.providerGameId, season: game.season,
        teamId, opponentId, innings: bullpenInnings,
        outs: bullpenInnings === null ? null : Math.round(bullpenInnings * 3),
        batters: sum(relief, (row) => row.batters), runs: sum(relief, (row) => row.runs),
        earned: sum(relief, (row) => row.earned), hits: sum(relief, (row) => row.hits),
        walks: sum(relief, (row) => row.walks), hitBatters: sum(relief, (row) => row.hitBatters),
        strikeouts: sum(relief, (row) => row.strikeouts), homeRuns: sum(relief, (row) => row.homeRuns),
        pitches: sum(relief, (row) => row.pitches), strikes: sum(relief, (row) => row.strikes),
        relievers: relief.length, completion: completion.canonicalCompletionTime.toISOString(),
        sourceHash, rawHash: source.rawBodyHash,
      });
    }
    if (parseFailed) fail("parsing");
    else reparsedGames++;
  }
}
if (reparsedGames !== 9_390 || parsedBullpens.length !== 18_780) fail("coverage");

const [
  identities, persistedAppearances, persistedBullpens, pitcherSnapshots,
  bullpenSnapshots, eligibility,
] = await Promise.all([
  db.select().from(mlbHistoricalPitcherIdentitiesTable).where(and(
    eq(mlbHistoricalPitcherIdentitiesTable.schemaVersion, PIT_SCHEMA),
    eq(mlbHistoricalPitcherIdentitiesTable.artifactKey, PIT_ARTIFACT),
  )),
  db.select().from(mlbHistoricalPitcherAppearancesTable).where(and(
    eq(mlbHistoricalPitcherAppearancesTable.schemaVersion, PIT_SCHEMA),
    eq(mlbHistoricalPitcherAppearancesTable.artifactKey, PIT_ARTIFACT),
  )),
  db.select().from(mlbHistoricalBullpenOutcomesTable).where(and(
    eq(mlbHistoricalBullpenOutcomesTable.schemaVersion, PIT_SCHEMA),
    eq(mlbHistoricalBullpenOutcomesTable.artifactKey, PIT_ARTIFACT),
  )),
  db.select().from(mlbHistoricalPregamePitcherSnapshotsTable).where(and(
    eq(mlbHistoricalPregamePitcherSnapshotsTable.schemaVersion, PIT_SCHEMA),
    eq(mlbHistoricalPregamePitcherSnapshotsTable.artifactKey, PIT_ARTIFACT),
  )),
  db.select().from(mlbHistoricalPregameBullpenSnapshotsTable).where(and(
    eq(mlbHistoricalPregameBullpenSnapshotsTable.schemaVersion, PIT_SCHEMA),
    eq(mlbHistoricalPregameBullpenSnapshotsTable.artifactKey, PIT_ARTIFACT),
  )),
  db.select().from(mlbHistoricalPitchingEligibilityTable).where(and(
    eq(mlbHistoricalPitchingEligibilityTable.schemaVersion, PIT_SCHEMA),
    eq(mlbHistoricalPitchingEligibilityTable.artifactKey, PIT_ARTIFACT),
  )),
]);
if (pitcherSnapshots.length !== 18_786 || bullpenSnapshots.length !== 18_786
  || eligibility.length !== 9_393) fail("coverage");

const expectedAppearanceByKey = new Map(appearances.map((row) => [sideKey(row.gameId, `${row.teamId}\u0000${row.order}`), row]));
const actualAppearanceByKey = new Map(persistedAppearances.map((row) =>
  [sideKey(row.canonicalGameId, `${row.canonicalTeamId}\u0000${row.appearanceOrder}`), row]));
if (expectedAppearanceByKey.size !== appearances.length || actualAppearanceByKey.size !== persistedAppearances.length
  || appearances.length !== persistedAppearances.length) fail("appearances");
for (const [key, expected] of expectedAppearanceByKey) {
  const row = actualAppearanceByKey.get(key);
  const expectedMissingness = {
    conventionalOutcomeIncomplete: [expected.innings, expected.batters, expected.runs, expected.earned,
      expected.hits, expected.walks, expected.strikeouts, expected.homeRuns].some((value) => value === null),
    pitchCountMissing: expected.pitches === null, throwsMissing: expected.throws === null,
  };
  if (!row || row.schemaVersion !== PIT_SCHEMA || row.artifactKey !== PIT_ARTIFACT
    || row.providerGameId !== expected.providerGameId || row.season !== expected.season
    || row.canonicalPitcherId !== expected.pitcherId || row.providerPitcherId !== expected.providerPitcherId
    || row.canonicalTeamId !== expected.teamId || row.opponentCanonicalTeamId !== expected.opponentId
    || row.appearanceOrder !== expected.order || row.starterFlagActual !== expected.starter
    || !sameReal(row.inningsPitched, expected.innings) || row.outsRecorded !== expected.outs
    || row.battersFaced !== expected.batters || row.runsAllowed !== expected.runs
    || row.earnedRuns !== expected.earned || row.hitsAllowed !== expected.hits || row.walks !== expected.walks
    || row.hitBatters !== expected.hitBatters || row.strikeouts !== expected.strikeouts
    || row.homeRunsAllowed !== expected.homeRuns || row.pitchCount !== expected.pitches || row.strikes !== expected.strikes
    || iso(row.appearanceCompletionTime) !== expected.completion || row.source !== PARSER_VERSION
    || row.sourceHash !== expected.sourceHash || !sameJson(row.missingness, expectedMissingness)
    || !sameJson(row.provenance, { rawBoxscoreHash: expected.rawHash, outcomeOnly: true })) fail("appearances");
}

const identityByKey = new Map(identities.map((row) => [sideKey(row.canonicalGameId, row.canonicalPitcherId), row]));
if (identityByKey.size !== identities.length || identities.length !== appearances.length) fail("identities");
for (const expected of appearances) {
  const row = identityByKey.get(sideKey(expected.gameId, expected.pitcherId));
  const persistedAppearance = actualAppearanceByKey.get(sideKey(expected.gameId, `${expected.teamId}\u0000${expected.order}`));
  if (!row || row.canonicalPitcherId !== `mlb:${row.providerPitcherId}`
    || row.providerPitcherId !== expected.providerPitcherId || row.pitcherName !== expected.pitcherName
    || row.canonicalTeamId !== expected.teamId || row.season !== expected.season || row.throws !== expected.throws
    || row.provider !== "MLB_STATS_API" || row.resolutionState !== "RESOLVED_PROVIDER_ID"
    || row.resolutionRule !== "MLB_STATS_API_PERSON_ID_EXACT" || row.ambiguous
    || !sameJson(row.sourceHashes, { boxscore: expected.sourceHash })
    || !sameJson(row.provenance, { appearanceChecksum: persistedAppearance?.outcomeChecksum, fuzzyMatching: false })) {
    fail("identities");
  }
}

const expectedBullpenByKey = new Map(parsedBullpens.map((row) => [sideKey(row.gameId, row.teamId), row]));
const actualBullpenByKey = new Map(persistedBullpens.map((row) => [sideKey(row.canonicalGameId, row.canonicalTeamId), row]));
if (expectedBullpenByKey.size !== parsedBullpens.length || actualBullpenByKey.size !== persistedBullpens.length
  || parsedBullpens.length !== persistedBullpens.length) fail("bullpenOutcomes");
for (const [key, expected] of expectedBullpenByKey) {
  const row = actualBullpenByKey.get(key);
  const conventional = [expected.innings, expected.batters, expected.runs, expected.earned,
    expected.hits, expected.walks, expected.strikeouts, expected.homeRuns];
  if (!row || row.providerGameId !== expected.providerGameId || row.season !== expected.season
    || row.opponentCanonicalTeamId !== expected.opponentId || !sameReal(row.bullpenInnings, expected.innings)
    || row.bullpenOutsRecorded !== expected.outs || row.bullpenBattersFaced !== expected.batters
    || row.bullpenRuns !== expected.runs || row.bullpenEarnedRuns !== expected.earned
    || row.bullpenHits !== expected.hits || row.bullpenWalks !== expected.walks
    || row.bullpenHitBatters !== expected.hitBatters || row.bullpenStrikeouts !== expected.strikeouts
    || row.bullpenHomeRuns !== expected.homeRuns || row.relieversUsed !== expected.relievers
    || row.bullpenPitchCount !== expected.pitches || row.bullpenStrikes !== expected.strikes
    || row.highLeverageUsage !== null || iso(row.gameCompletionTime) !== expected.completion
    || !sameJson(row.sourceHashes, { boxscore: expected.sourceHash })
    || !sameJson(row.missingness, {
      conventionalOutcomeIncomplete: conventional.some((value) => value === null),
      pitchCountMissing: expected.pitches === null,
    }) || !sameJson(row.provenance, { rawBoxscoreHash: expected.rawHash, outcomeOnly: true })) {
    fail("bullpenOutcomes");
  }
}

const bullpenHistory = new Map<string, Bullpen[]>();
const reliefDates = new Map<string, Map<string, Map<string, Set<string>>>>();
const actualStarter = new Set<string>();
for (const appearance of appearances) {
  if (appearance.starter) actualStarter.add(sideKey(appearance.gameId, appearance.teamId));
  else {
    const date = gameById.get(appearance.gameId)!.gameDate.toISOString().slice(0, 10);
    const byDate = reliefDates.get(appearance.teamId) ?? new Map<string, Map<string, Set<string>>>();
    const pitchers = byDate.get(date) ?? new Map<string, Set<string>>();
    const pitcherGames = pitchers.get(appearance.pitcherId) ?? new Set<string>();
    pitcherGames.add(appearance.gameId);
    pitchers.set(appearance.pitcherId, pitcherGames);
    byDate.set(date, pitchers);
    reliefDates.set(appearance.teamId, byDate);
  }
}
for (const bullpen of parsedBullpens) {
  const rows = bullpenHistory.get(bullpen.teamId) ?? [];
  rows.push(bullpen);
  bullpenHistory.set(bullpen.teamId, rows);
}
for (const rows of bullpenHistory.values()) rows.sort((a, b) =>
  a.completion.localeCompare(b.completion) || a.gameId.localeCompare(b.gameId));
const pitcherSnapshotByKey = new Map(pitcherSnapshots.map((row) => [sideKey(row.canonicalGameId, row.canonicalTeamId), row]));
const bullpenSnapshotByKey = new Map(bullpenSnapshots.map((row) => [sideKey(row.canonicalGameId, row.canonicalTeamId), row]));
const replayChecksums: string[] = [];
const orderedGames = [...games].sort((a, b) =>
  (iso(evidenceByGame.get(a.canonicalGameId)?.featureCutoff) ?? "")
    .localeCompare(iso(evidenceByGame.get(b.canonicalGameId)?.featureCutoff) ?? "")
  || a.canonicalGameId.localeCompare(b.canonicalGameId));
for (const game of orderedGames) for (const side of ["away", "home"] as const) {
  const offenseRow = offenseBySide.get(`${game.canonicalGameId}:${side}`);
  const opponent = offenseBySide.get(`${game.canonicalGameId}:${side === "home" ? "away" : "home"}`);
  const completion = evidenceByGame.get(game.canonicalGameId);
  if (!offenseRow || !opponent || !completion?.featureCutoff) { fail("coverage"); continue; }
  const teamId = offenseRow.canonicalTeamId;
  const cutoff = completion.featureCutoff;
  const cutoffIso = cutoff.toISOString();
  const prior = (bullpenHistory.get(teamId) ?? []).filter((row) => {
    const source = evidenceByGame.get(row.gameId);
    return source?.finalStatus && !source.quarantineReason && source.canonicalCompletionTime !== null
      && source.canonicalCompletionTime < cutoff;
  });
  const season = prior.filter((row) => row.season === game.season);
  const window = (days: number) => prior.filter((row) =>
    (cutoff.getTime() - new Date(row.completion).getTime()) / DAY <= days);
  const one = window(1), two = window(2), three = window(3);
  const countConsecutive = (days: number) => {
    const dates = previousDates(game.gameDate.toISOString().slice(0, 10), days);
    const priorIds = new Set(prior.map((row) => row.gameId));
    const byDate = reliefDates.get(teamId) ?? new Map<string, Map<string, Set<string>>>();
    const sets = dates.map((date) => new Set([...(byDate.get(date) ?? new Map<string, Set<string>>())]
      .filter(([, gameIds]) => [...gameIds].some((id) => priorIds.has(id)))
      .map(([pitcher]) => pitcher)));
    if (!sets.length) return 0;
    return [...sets[0]!].filter((pitcher) => sets.every((set) => set.has(pitcher))).length;
  };
  const pitches3 = sum(three, (row) => row.pitches);
  const fatigue = pitches3 === null ? "UNKNOWN" : pitches3 >= 120 ? "VERY_TIRED"
    : pitches3 >= 80 ? "TIRED" : pitches3 >= 40 ? "WORKED" : three.length ? "NORMAL" : "AVAILABLE";
  const seasonRate = rate(season);
  const last3 = rate(prior.slice(-3)), last5 = rate(prior.slice(-5)), last10 = rate(prior.slice(-10));
  const sourceGameIds = [...new Set(prior.map((row) => row.gameId))].sort();
  if (sourceGameIds.includes(game.canonicalGameId) || sourceGameIds.some((id) => {
    const source = evidenceByGame.get(id);
    return !source?.canonicalCompletionTime || !(source.canonicalCompletionTime < cutoff);
  })) fail("snapshotChronology");
  const starterState = actualStarter.has(sideKey(game.canonicalGameId, teamId)) ? "ACTUAL_ONLY" : "UNKNOWN";
  const missingness = {
    starterUnknown: starterState === "UNKNOWN", starterActualOnly: starterState === "ACTUAL_ONLY",
    starterSmallSample: true, pitchCountMissing: prior.some((row) => row.pitches === null),
    bullpenIdentityIncomplete: true, bullpenWorkloadIncomplete: prior.some((row) => row.pitches === null),
    pitcherFipUnavailable: true, bullpenFipUnavailable: seasonRate.fip === null,
    advancedMetricsUnavailable: true, marketDataExcluded: true,
  };
  const bullpen = {
    season: seasonRate, last3, last5, last10,
    pitchesLast1d: sum(one, (row) => row.pitches), pitchesLast2d: sum(two, (row) => row.pitches),
    pitchesLast3d: pitches3, inningsLast1d: sum(one, (row) => row.innings),
    inningsLast2d: sum(two, (row) => row.innings), inningsLast3d: sum(three, (row) => row.innings),
    relieversUsedLast1d: sum(one, (row) => row.relievers), relieversUsedLast2d: sum(two, (row) => row.relievers),
    backToBackRelievers: countConsecutive(2), threeDayRelievers: countConsecutive(3),
    fatigueState: fatigue, statThroughTime: prior.at(-1)?.completion ?? null,
  };
  const replayBase = {
    schemaVersion: REPLAY_VERSION, gameId: game.canonicalGameId, teamId,
    opponentId: opponent.canonicalTeamId, season: game.season, featureCutoff: cutoffIso,
    starterIdentityState: starterState, pregameStarterId: null,
    pitcher: {
      career: emptyRate(), season: emptyRate(), recent3: emptyRate(), recent5: emptyRate(), recent10: emptyRate(),
      daysSinceLastAppearance: null, daysSinceLastStart: null, lastAppearancePitchCount: null,
      lastStartPitchCount: null, lastStartInnings: null, priorType: "UNAVAILABLE", statThroughTime: null,
    },
    bullpen, sourceGameIds, missingness,
  };
  const replayChecksum = hash(replayBase);
  replayChecksums.push(replayChecksum);
  const split = splitByGame.get(game.canonicalGameId);
  const pitcherRow = pitcherSnapshotByKey.get(sideKey(game.canonicalGameId, teamId));
  if (!pitcherRow || pitcherRow.opponentCanonicalTeamId !== opponent.canonicalTeamId
    || pitcherRow.season !== game.season || iso(pitcherRow.featureCutoff) !== cutoffIso
    || pitcherRow.statThroughTime !== null || pitcherRow.pregameStarterId !== null
    || pitcherRow.starterIdentityState !== starterState || pitcherRow.starterHandedness !== null
    || pitcherRow.starterRoleState !== "UNKNOWN_PREGAME"
    || [pitcherRow.starterSeasonInnings, pitcherRow.starterSeasonEra, pitcherRow.starterSeasonWhip,
      pitcherRow.starterSeasonKPct, pitcherRow.starterSeasonBbPct, pitcherRow.starterSeasonKMinusBbPct,
      pitcherRow.starterSeasonHrRate, pitcherRow.starterSeasonFip, pitcherRow.starterRecentInnings,
      pitcherRow.starterRecentEra, pitcherRow.starterRecentWhip, pitcherRow.starterRecentKPct,
      pitcherRow.starterRecentBbPct, pitcherRow.starterDaysRest, pitcherRow.starterLastStartInnings,
      pitcherRow.starterLastStartPitchCount].some((value) => value !== null)
    || !sameJson(pitcherRow.starterRecentWorkload, { lastAppearancePitchCount: null, recent3: emptyRate() })
    || pitcherRow.sourceAppearanceCount !== 0 || pitcherRow.starterSampleSize !== 0
    || pitcherRow.starterPriorState !== "UNAVAILABLE" || !sameReal(pitcherRow.starterFeatureCompleteness, 0)
    || !sameJson(pitcherRow.advancedMetricStates, { fip: "UNAVAILABLE", other: "UNAVAILABLE" })
    || !sameJson(pitcherRow.missingness, missingness)
    || !sameJson(pitcherRow.provenance, {
      replayChecksum, actualStarterNeverPromoted: true, sealedCoreSplit: split?.cohort ?? null,
      splitState: split ? "SEALED_CORE_SPLIT" : "NO_SEALED_CORE_SPLIT",
    }) || !sameJson(pitcherRow.sourceHashes, { replay: replayChecksum, sourceGameIds })) fail("pitcherSnapshots");
  const bullpenRow = bullpenSnapshotByKey.get(sideKey(game.canonicalGameId, teamId));
  const complete = seasonRate.appearances >= 3 && !missingness.bullpenWorkloadIncomplete
    && seasonRate.innings !== null && seasonRate.era !== null && seasonRate.whip !== null && pitches3 !== null;
  if (!bullpenRow || bullpenRow.opponentCanonicalTeamId !== opponent.canonicalTeamId
    || bullpenRow.season !== game.season || iso(bullpenRow.featureCutoff) !== cutoffIso
    || iso(bullpenRow.statThroughTime) !== bullpen.statThroughTime
    || !rateFieldsEqual({
      innings: bullpenRow.bullpenSeasonInnings, era: bullpenRow.bullpenSeasonEra,
      whip: bullpenRow.bullpenSeasonWhip, kPct: bullpenRow.bullpenSeasonKPct,
      bbPct: bullpenRow.bullpenSeasonBbPct, kMinusBbPct: bullpenRow.bullpenSeasonKMinusBbPct,
      hrRate: bullpenRow.bullpenSeasonHrRate, fip: bullpenRow.bullpenSeasonFip,
    }, seasonRate)
    || !sameReal(bullpenRow.bullpenLast3Innings, last3.innings)
    || !sameReal(bullpenRow.bullpenLast5Innings, last5.innings)
    || !sameReal(bullpenRow.bullpenLast10Era, last10.era)
    || bullpenRow.bullpenPitchesLast1d !== bullpen.pitchesLast1d
    || bullpenRow.bullpenPitchesLast2d !== bullpen.pitchesLast2d
    || bullpenRow.bullpenPitchesLast3d !== bullpen.pitchesLast3d
    || !sameReal(bullpenRow.bullpenInningsLast1d, bullpen.inningsLast1d)
    || !sameReal(bullpenRow.bullpenInningsLast2d, bullpen.inningsLast2d)
    || !sameReal(bullpenRow.bullpenInningsLast3d, bullpen.inningsLast3d)
    || bullpenRow.relieversUsedLast1d !== bullpen.relieversUsedLast1d
    || bullpenRow.relieversUsedLast2d !== bullpen.relieversUsedLast2d
    || bullpenRow.backToBackRelievers !== bullpen.backToBackRelievers
    || bullpenRow.threeDayRelievers !== bullpen.threeDayRelievers
    || bullpenRow.bullpenFatigueState !== fatigue || bullpenRow.sourceGameCount !== sourceGameIds.length
    || bullpenRow.bullpenSampleSize !== seasonRate.appearances
    || bullpenRow.bullpenPriorState !== (seasonRate.appearances ? "CURRENT_SEASON_SAMPLE" : "LEAGUE_PRIOR_REQUIRED")
    || !sameReal(bullpenRow.bullpenFeatureCompleteness, complete ? 1 : 0)
    || !sameJson(bullpenRow.relieverAvailability, { state: "UNAVAILABLE_NO_ROSTER_EVIDENCE" })
    || !sameJson(bullpenRow.missingness, missingness)
    || !sameJson(bullpenRow.provenance, {
      replayChecksum, targetGameUsageExcluded: true, sealedCoreSplit: split?.cohort ?? null,
      splitState: split ? "SEALED_CORE_SPLIT" : "NO_SEALED_CORE_SPLIT",
    }) || !sameJson(bullpenRow.sourceHashes, { replay: replayChecksum, sourceGameIds })) fail("bullpenSnapshots");
}

const eligibilityByGame = new Map(eligibility.map((row) => [row.canonicalGameId, row]));
for (const game of games) {
  const row = eligibilityByGame.get(game.canonicalGameId);
  const completion = evidenceByGame.get(game.canonicalGameId);
  const home = offenseBySide.get(`${game.canonicalGameId}:home`);
  const away = offenseBySide.get(`${game.canonicalGameId}:away`);
  const split = splitByGame.get(game.canonicalGameId);
  const chronologySafe = Boolean(completion?.canonicalCompletionTime && !completion.quarantineReason);
  const offenseEligible = chronologySafe && home?.eligibilityState === "CORE_ELIGIBLE"
    && away?.eligibilityState === "CORE_ELIGIBLE";
  const bullpenEligible = offenseEligible && Boolean(home && away
    && bullpenSnapshotByKey.get(sideKey(game.canonicalGameId, home.canonicalTeamId))?.bullpenFeatureCompleteness === 1
    && bullpenSnapshotByKey.get(sideKey(game.canonicalGameId, away.canonicalTeamId))?.bullpenFeatureCompleteness === 1);
  const reasons = [
    ...(!chronologySafe ? ["CHRONOLOGY_QUARANTINED"] : []),
    ...(!offenseEligible ? ["OFFENSE_CORE_INELIGIBLE"] : []),
    ...(!split ? ["NO_SEALED_CORE_SPLIT"] : []),
    "NO_LEGITIMATE_PREGAME_STARTER_EVIDENCE",
    ...(!bullpenEligible ? ["INSUFFICIENT_COMPLETE_PRIOR_BULLPEN_STATE"] : []),
  ];
  if (!row || row.providerGameId !== game.providerGameId || row.season !== game.season
    || iso(row.featureCutoff) !== iso(completion?.featureCutoff) || row.coreOffenseEligible !== offenseEligible
    || row.pitcherCoreEligible || row.bullpenCoreEligible !== bullpenEligible || row.fullCoreEligible
    || row.enhancedEligible || row.quarantined !== !chronologySafe
    || row.eligibilityTier !== (bullpenEligible ? "BULLPEN_CORE_ELIGIBLE"
      : offenseEligible ? "CORE_OFFENSE_ELIGIBLE" : "INELIGIBLE")
    || !sameJson(row.reasonCodes, reasons)
    || !sameJson(row.missingness, { pregameStarterEvidence: true, enhancedFeatures: true })
    || !sameJson(row.provenance, {
      chronologyArtifact: CHRONOLOGY_ARTIFACT, split: split?.cohort ?? null,
      splitState: split ? "SEALED_CORE_SPLIT" : "NO_SEALED_CORE_SPLIT",
    }) || !sameJson(row.sourceHashes, {
      chronology: chronologyArtifact?.foundationChecksum,
      offenseHome: home?.checksum, offenseAway: away?.checksum,
    })) fail("eligibility");
}
const locked = splits.filter((row) => row.cohort === "LOCKED_OOS");
const pitLocked = eligibility.filter((row) => (row.provenance as { split?: unknown }).split === "LOCKED_OOS");
if (locked.length !== 2_012 || pitLocked.length !== 2_012
  || pitLocked.some((row) => splitByGame.get(row.canonicalGameId)?.cohort !== "LOCKED_OOS")) fail("lockedOos");

const marketKeys = new Set(["moneyline", "runline", "total", "odds", "impliedprobability", "market",
  "marketconsensus", "sportsbook", "pinnacle", "openingprice", "closingprice", "linemovement", "clv", "marketedge"]);
const marketCount = (value: unknown): number => {
  if (!value || typeof value !== "object") return 0;
  if (Array.isArray(value)) return value.reduce((count, child) => count + marketCount(child), 0);
  return Object.entries(value as AnyRow).reduce((count, [name, child]) =>
    count + Number(marketKeys.has(name.replace(/[^a-z0-9]/gi, "").toLowerCase())) + marketCount(child), 0);
};
violations.marketFields = marketCount({ identities, persistedAppearances, persistedBullpens,
  pitcherSnapshots, bullpenSnapshots, eligibility });

const groups = [
  ["identities", identities, "checksum"],
  ["appearances", persistedAppearances, "outcomeChecksum"],
  ["bullpens", persistedBullpens, "outcomeChecksum"],
  ["pitcherSnapshots", pitcherSnapshots, "checksum"],
  ["bullpenSnapshots", bullpenSnapshots, "checksum"],
  ["eligibility", eligibility, "checksum"],
] as const;
for (const [, rows, checksum] of groups) for (const row of rows) {
  const record = row as unknown as AnyRow;
  if (hash(strip(record, checksum)) !== record[checksum]) fail("rowChecksums");
}
const foundation = hash(Object.fromEntries(groups.map(([name, rows, checksum]) =>
  [name, rows.map((row) => String((row as unknown as AnyRow)[checksum])).sort()])));
const replayChecksum = hash(replayChecksums);
if (!artifact || artifact.foundationChecksum !== foundation || artifact.replayChecksum !== replayChecksum) {
  fail("groupChecksums");
}
const sourceManifest = chronologyArtifact ? {
  chronology: {
    schemaVersion: CHRONOLOGY_SCHEMA, artifactKey: CHRONOLOGY_ARTIFACT,
    sourceManifestHash: chronologyArtifact.sourceManifestHash,
    foundationChecksum: chronologyArtifact.foundationChecksum,
    replayChecksum: chronologyArtifact.replayChecksum,
  },
  boxscores: rawMetadata.map((row) => ({
    canonicalGameId: row.canonicalGameId, providerGameId: row.providerGameId, endpoint: row.endpoint,
    retrievedAt: row.retrievedAt.toISOString(), rawBodyHash: row.rawBodyHash, byteLength: row.byteLength,
    sourceManifestHash: row.sourceManifestHash, checksum: row.checksum,
  })),
  rawArchive: { schemaVersion: RAW_SCHEMA, artifactKey: RAW_ARTIFACT },
  parser: PARSER_VERSION, replay: REPLAY_VERSION,
  starterEvidence: "NONE_AVAILABLE_ACTUAL_ONLY_SEPARATED",
} : null;
const retrievalCutoff = rawMetadata.length
  ? new Date(Math.max(...rawMetadata.map((row) => row.retrievedAt.getTime()))).toISOString() : null;
if (!artifact || !sourceManifest || artifact.status !== "SEALED_PITCHER_BULLPEN_FOUNDATION"
  || artifact.sourceManifestHash !== hash(sourceManifest) || !sameJson(artifact.sourceManifest, sourceManifest)
  || iso(artifact.retrievalCutoff) !== retrievalCutoff) fail("artifact");

const guardedTables = [
  "mlb_historical_artifacts", "mlb_historical_games", "mlb_historical_team_identity",
  "mlb_historical_team_game_rows", "mlb_historical_outcomes", "mlb_historical_completion_evidence",
  "mlb_historical_raw_completion_snapshots", "mlb_historical_chronology_decisions",
  "mlb_historical_exclusions", "mlb_historical_splits", "mlb_historical_raw_boxscore_snapshots",
  "mlb_historical_pitcher_identities", "mlb_historical_pitcher_appearances",
  "mlb_historical_bullpen_outcomes", "mlb_historical_pregame_pitcher_snapshots",
  "mlb_historical_pregame_bullpen_snapshots", "mlb_historical_pitching_eligibility",
];
const triggerResult = await db.execute(sql<{
  table_name: string; trigger_name: string; tgtype: number; function_name: string;
}>`select c.relname as table_name, t.tgname as trigger_name, t.tgtype::int as tgtype,
          p.proname as function_name
   from pg_trigger t
   join pg_class c on c.oid = t.tgrelid
   join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal and c.relname like 'mlb_historical_%'`);
const triggerByName = new Map(triggerResult.rows.map((row) => [row.trigger_name, row]));
for (const table of guardedTables) {
  const rowGuard = triggerByName.get(`${table}_block_row_mutation`);
  const truncateGuard = triggerByName.get(`${table}_block_truncate`);
  if (!rowGuard || rowGuard.table_name !== table || rowGuard.function_name !== "prevent_mlb_historical_mutation"
    || rowGuard.tgtype !== 27) fail("appendOnlyGuards");
  if (!truncateGuard || truncateGuard.table_name !== table
    || truncateGuard.function_name !== "prevent_mlb_historical_mutation" || truncateGuard.tgtype !== 34) {
    fail("appendOnlyGuards");
  }
}

const failureCount = Object.values(violations).reduce((total, count) => total + count, 0);
const result = {
  task: "224B-2", verifier: "independent-persisted-v1", schemaVersion: PIT_SCHEMA,
  artifactKey: PIT_ARTIFACT,
  coverage: {
    games: games.length, rawBoxscores: rawMetadata.length, rawBytes, chronologySafeReparsedGames: reparsedGames,
    pitcherSnapshots: pitcherSnapshots.length, bullpenSnapshots: bullpenSnapshots.length,
    eligibility: eligibility.length, appearances: persistedAppearances.length,
    bullpenOutcomes: persistedBullpens.length,
  },
  eligibility: {
    offense: eligibility.filter((row) => row.coreOffenseEligible).length,
    pitcher: eligibility.filter((row) => row.pitcherCoreEligible).length,
    bullpen: eligibility.filter((row) => row.bullpenCoreEligible).length,
    full: eligibility.filter((row) => row.fullCoreEligible).length,
    enhanced: eligibility.filter((row) => row.enhancedEligible).length,
    lockedOos: locked.length, lockedOosExpansion: Math.max(0, pitLocked.length - locked.length),
  },
  checksums: {
    rebuiltFoundation: foundation, persistedFoundation: artifact?.foundationChecksum ?? null,
    rebuiltReplay: replayChecksum, persistedReplay: artifact?.replayChecksum ?? null,
    rebuiltSourceManifest: sourceManifest ? hash(sourceManifest) : null,
    persistedSourceManifest: artifact?.sourceManifestHash ?? null,
  },
  invariants: {
    fixedFipConstant: FIP_CONSTANT, elapsedDayWindows: [1, 2, 3],
    fatiguePitchThresholds: [40, 80, 120], expectedAppendOnlyTriggers: guardedTables.length * 2,
  },
  violations, elapsedMilliseconds: Date.now() - started, status: failureCount === 0 ? "PASS" : "FAIL",
};
console.log(JSON.stringify(result, null, 2));
if (result.status === "FAIL") process.exitCode = 1;