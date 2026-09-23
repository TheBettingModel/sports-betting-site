import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  mlbHistoricalArtifactsTable,
  mlbHistoricalChronologyDecisionsTable,
  mlbHistoricalCompletionEvidenceTable,
  mlbHistoricalGamesTable,
  mlbHistoricalOutcomesTable,
  mlbHistoricalRawCompletionSnapshotsTable,
  mlbHistoricalSplitsTable,
  mlbHistoricalTeamGameRowsTable,
  mlbHistoricalTeamIdentityTable,
} from "@workspace/db";
import {
  MLB_HISTORICAL_APPEND_ONLY_TABLES,
} from "../src/services/mlbHistoricalAppendOnly";
import {
  buildMlbHistoricalCompletionFoundation,
  type CompletionFoundationGame,
} from "../src/services/mlbHistoricalCompletionFoundation";
import {
  MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY,
  MLB_HISTORICAL_CHRONOLOGY_RULE,
  MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
  MLB_HISTORICAL_COMPLETION_RESOLVER_VERSION,
  parseHistoricalMlbCompletionFeed,
  type HistoricalCompletionEvidence,
} from "../src/services/mlbHistoricalChronology";
import { stableHistoricalJson } from "../src/services/mlbHistoricalSource";

const ARTIFACT_KEY = MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY;
const SCHEMA_VERSION = MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION;
const V1_SCHEMA_VERSION = "mlb-chronological-team-game-v1";
const V1_SPLIT_VERSION = "mlb-chronological-split-2023-2026-v1";

function hash(value: unknown): string {
  return createHash("sha256").update(stableHistoricalJson(value)).digest("hex");
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function dateOnlyEt(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function payloadTerminal(evidencePayload: unknown): {
  count: number; firstStart: string | null; lastStart: string | null; lastEnd: string | null;
  terminalComplete: boolean;
} {
  const plays = Array.isArray(record(evidencePayload).plays) ? record(evidencePayload).plays : [];
  const normalized = plays.map((entry) => record(entry));
  const first = normalized.find((play) => typeof play.startTime === "string") ?? null;
  const last = normalized.at(-1) ?? null;
  return {
    count: normalized.length,
    firstStart: typeof first?.startTime === "string" ? first.startTime : null,
    lastStart: typeof last?.startTime === "string" ? last.startTime : null,
    lastEnd: typeof last?.endTime === "string" ? last.endTime : null,
    terminalComplete: last?.isComplete === true,
  };
}

const [artifact] = await db.select().from(mlbHistoricalArtifactsTable).where(and(
  eq(mlbHistoricalArtifactsTable.schemaVersion, SCHEMA_VERSION),
  eq(mlbHistoricalArtifactsTable.artifactKey, ARTIFACT_KEY),
)).limit(1);

const [games, persistedGames, evidenceRows, rawSnapshots, decisions, featureRows, outcomeRows, completionSplits, v1Splits, identities, v1Artifacts] = await Promise.all([
  db.select().from(mlbHistoricalGamesTable).where(eq(
    mlbHistoricalGamesTable.schemaVersion, V1_SCHEMA_VERSION,
  )).orderBy(asc(mlbHistoricalGamesTable.scheduledFirstPitch), asc(mlbHistoricalGamesTable.providerGameId)),
  db.select().from(mlbHistoricalGamesTable).where(eq(
    mlbHistoricalGamesTable.schemaVersion, SCHEMA_VERSION,
  )),
  db.select().from(mlbHistoricalCompletionEvidenceTable).where(and(
    eq(mlbHistoricalCompletionEvidenceTable.schemaVersion, SCHEMA_VERSION),
    eq(mlbHistoricalCompletionEvidenceTable.artifactKey, ARTIFACT_KEY),
  )),
  db.select().from(mlbHistoricalRawCompletionSnapshotsTable).where(and(
    eq(mlbHistoricalRawCompletionSnapshotsTable.schemaVersion, SCHEMA_VERSION),
    eq(mlbHistoricalRawCompletionSnapshotsTable.artifactKey, ARTIFACT_KEY),
  )),
  db.select().from(mlbHistoricalChronologyDecisionsTable).where(and(
    eq(mlbHistoricalChronologyDecisionsTable.schemaVersion, SCHEMA_VERSION),
    eq(mlbHistoricalChronologyDecisionsTable.artifactKey, ARTIFACT_KEY),
  )),
  db.select().from(mlbHistoricalTeamGameRowsTable).where(and(
    eq(mlbHistoricalTeamGameRowsTable.schemaVersion, SCHEMA_VERSION),
    eq(mlbHistoricalTeamGameRowsTable.artifactKey, ARTIFACT_KEY),
  )),
  db.select().from(mlbHistoricalOutcomesTable).where(and(
    eq(mlbHistoricalOutcomesTable.schemaVersion, SCHEMA_VERSION),
    eq(mlbHistoricalOutcomesTable.artifactKey, ARTIFACT_KEY),
  )),
  db.select().from(mlbHistoricalSplitsTable).where(eq(
    mlbHistoricalSplitsTable.schemaVersion, SCHEMA_VERSION,
  )),
  db.select().from(mlbHistoricalSplitsTable).where(and(
    eq(mlbHistoricalSplitsTable.schemaVersion, V1_SCHEMA_VERSION),
    eq(mlbHistoricalSplitsTable.splitVersion, V1_SPLIT_VERSION),
  )),
  db.select().from(mlbHistoricalTeamIdentityTable).where(eq(
    mlbHistoricalTeamIdentityTable.schemaVersion, V1_SCHEMA_VERSION,
  )),
  db.select().from(mlbHistoricalArtifactsTable).where(and(
    eq(mlbHistoricalArtifactsTable.schemaVersion, V1_SCHEMA_VERSION),
    eq(mlbHistoricalArtifactsTable.artifactKey, "mlb-historical-2023-2026-v1"),
  )),
]);

const evidenceByGame = new Map(evidenceRows.map((row) => [row.canonicalGameId, row]));
const gameById = new Map(games.map((game) => [game.canonicalGameId, game]));
const persistedGameById = new Map(persistedGames.map((game) => [game.canonicalGameId, game]));
const rawSnapshotByGame = new Map(rawSnapshots.map((row) => [row.canonicalGameId, row]));
const originalSplits = new Map(v1Splits.map((split) => [split.canonicalGameId, split.cohort as "TRAIN" | "VALIDATION" | "LOCKED_OOS"]));
const identityByProviderSeason = new Map(identities.map((identity) => [
  `${identity.provider}:${identity.providerTeamId}:${identity.season}`,
  identity.canonicalTeamId,
]));
// Splits do not carry an artifact key; their bound foundation checksum is their
// artifact identity, so do not let another chronology artifact affect this audit.
const artifactSplits = completionSplits.filter((split) =>
  split.foundationChecksum === (artifact?.foundationChecksum ?? "__missing_artifact__"));
const evidenceViolations = {
  hash: 0, identity: 0, resolver: 0, completionRule: 0, cutoffRule: 0,
  terminalConsistency: 0, timestampMasquerade: 0, confidenceMethodSource: 0,
};

for (const row of evidenceRows) {
  const payload = payloadTerminal(row.evidencePayload);
  const completion = iso(row.canonicalCompletionTime);
  const gameEnd = iso(row.gameEndTime);
  const terminalEnd = iso(row.lastPlayEndTime);
  const firstStart = iso(row.firstPlayStartTime);
  const expectedCompletion = row.finalStatus && gameEnd
    ? gameEnd
    : row.finalStatus && row.terminalPlayComplete && terminalEnd ? terminalEnd : null;
  const expectedSource = row.finalStatus && gameEnd
    ? "GAME_END_TIME"
    : row.finalStatus && row.terminalPlayComplete && terminalEnd ? "TERMINAL_PLAY_END_TIME" : "NONE";
  const expectedMethod = expectedSource === "GAME_END_TIME"
    ? "EXPLICIT_OFFICIAL_GAME_END"
    : expectedSource === "TERMINAL_PLAY_END_TIME"
      ? "OFFICIAL_FINAL_STATUS_PLUS_TERMINAL_PLAY_END" : "UNRESOLVED";
  const expectedConfidence = expectedSource === "GAME_END_TIME"
    ? "AUTHORITATIVE"
    : expectedSource === "TERMINAL_PLAY_END_TIME" ? "HIGH_CONFIDENCE_DERIVED" : "UNRESOLVED";
  const expectedCutoff = firstStart
    ? new Date(new Date(firstStart).getTime() - 1).toISOString()
    : null;
  const expectedPrecision = completion ? (/\.\d{3}Z$/.test(completion) ? "MILLISECOND" : "SECOND") : "UNKNOWN";
  if (row.evidenceHash !== hash(row.evidencePayload)) evidenceViolations.hash += 1;
  if (!gameById.has(row.canonicalGameId) || row.providerGameId !== gameById.get(row.canonicalGameId)?.providerGameId) evidenceViolations.identity += 1;
  if (row.resolverVersion !== MLB_HISTORICAL_COMPLETION_RESOLVER_VERSION) evidenceViolations.resolver += 1;
  if (completion !== expectedCompletion || row.completionTimeSource !== expectedSource
    || row.completionTimeMethod !== expectedMethod || row.completionTimeConfidence !== expectedConfidence
    || row.completionTimePrecision !== expectedPrecision || row.completionDateEt !== dateOnlyEt(row.canonicalCompletionTime)) {
    evidenceViolations.completionRule += 1;
  }
  if (iso(row.featureCutoff) !== expectedCutoff
    || row.featureCutoffSource !== (expectedCutoff ? "OFFICIAL_FIRST_PLAY_START_MINUS_1MS" : "UNRESOLVED")
    || row.featureCutoffConfidence !== (expectedCutoff ? "HIGH_CONFIDENCE_DERIVED" : "UNRESOLVED")
    || (expectedCutoff !== null && !(new Date(expectedCutoff) < new Date(firstStart!)))) evidenceViolations.cutoffRule += 1;
  if (row.playCount !== payload.count || firstStart !== payload.firstStart || iso(row.lastPlayStartTime) !== payload.lastStart
    || terminalEnd !== payload.lastEnd || row.terminalPlayComplete !== payload.terminalComplete) evidenceViolations.terminalConsistency += 1;
  if (completion !== null && (completion === iso(row.retrievedAt) || completion === iso(row.providerFinalSeenAt)
    || completion === iso(row.createdAt) || !["GAME_END_TIME", "TERMINAL_PLAY_END_TIME"].includes(row.completionTimeSource))) {
    evidenceViolations.timestampMasquerade += 1;
  }
  if ((row.completionTimeConfidence === "AUTHORITATIVE" && row.completionTimeMethod !== "EXPLICIT_OFFICIAL_GAME_END")
    || (row.completionTimeConfidence === "HIGH_CONFIDENCE_DERIVED" && row.completionTimeMethod !== "OFFICIAL_FINAL_STATUS_PLUS_TERMINAL_PLAY_END")
    || (row.completionTimeConfidence === "UNRESOLVED" && completion !== null)) evidenceViolations.confidenceMethodSource += 1;
}
let rawSnapshotViolations = 0;
for (const raw of rawSnapshots) {
  const game = gameById.get(raw.canonicalGameId);
  const evidence = evidenceByGame.get(raw.canonicalGameId);
  let payload: unknown;
  try {
    payload = JSON.parse(raw.rawBody);
  } catch {
    rawSnapshotViolations += 1;
    continue;
  }
  const rawHash = createHash("sha256").update(raw.rawBody, "utf8").digest("hex");
  const reparsed = game ? parseHistoricalMlbCompletionFeed(payload, {
    canonicalGameId: raw.canonicalGameId,
    providerGameId: raw.providerGameId,
    scheduledStartTime: game.scheduledFirstPitch.toISOString(),
    retrievedAt: raw.retrievedAt.toISOString(),
    endpoint: raw.endpoint,
  }) : null;
  if (!game || !evidence || !reparsed || raw.provider !== "MLB_STATS_API"
    || raw.httpStatus !== 200 || raw.byteLength !== Buffer.byteLength(raw.rawBody, "utf8")
    || rawHash !== raw.rawBodyHash || raw.rawBodyHash !== evidence.rawPayloadHash
    || raw.providerGameId !== evidence.providerGameId || raw.endpoint !== evidence.endpoint
    || iso(raw.retrievedAt) !== iso(evidence.retrievedAt)
    || reparsed.evidenceHash !== evidence.evidenceHash
    || stableHistoricalJson(reparsed.evidencePayload) !== stableHistoricalJson(evidence.evidencePayload)
    || reparsed.canonicalCompletionTime !== iso(evidence.canonicalCompletionTime)
    || reparsed.featureCutoff !== iso(evidence.featureCutoff)
    || reparsed.resolverVersion !== evidence.resolverVersion) {
    rawSnapshotViolations += 1;
  }
}

const sourceGames: CompletionFoundationGame[] = games.flatMap((game) => {
  const evidence = evidenceByGame.get(game.canonicalGameId);
  const homeCanonicalTeamId = identityByProviderSeason.get(
    `${game.provider}:${game.homeProviderTeamId}:${game.season}`,
  );
  const awayCanonicalTeamId = identityByProviderSeason.get(
    `${game.provider}:${game.awayProviderTeamId}:${game.season}`,
  );
  if (!evidence || !homeCanonicalTeamId || !awayCanonicalTeamId
    || game.homeRuns === null || game.awayRuns === null) return [];
  const normalizedEvidence: HistoricalCompletionEvidence = {
    canonicalGameId: evidence.canonicalGameId, providerGameId: evidence.providerGameId,
    endpoint: evidence.endpoint, retrievedAt: iso(evidence.retrievedAt)!, scheduledStartTime: iso(evidence.scheduledStartTime)!,
    actualStartTime: iso(evidence.actualStartTime), firstPlayStartTime: iso(evidence.firstPlayStartTime),
    lastPlayStartTime: iso(evidence.lastPlayStartTime), lastPlayEndTime: iso(evidence.lastPlayEndTime),
    gameEndTime: iso(evidence.gameEndTime), finalStatusTime: iso(evidence.finalStatusTime),
    providerFinalSeenAt: iso(evidence.providerFinalSeenAt)!, canonicalCompletionTime: iso(evidence.canonicalCompletionTime),
    completionTimeSource: evidence.completionTimeSource as HistoricalCompletionEvidence["completionTimeSource"],
    completionTimeMethod: evidence.completionTimeMethod as HistoricalCompletionEvidence["completionTimeMethod"],
    completionTimeConfidence: evidence.completionTimeConfidence as HistoricalCompletionEvidence["completionTimeConfidence"],
    completionTimePrecision: evidence.completionTimePrecision as HistoricalCompletionEvidence["completionTimePrecision"],
    featureCutoff: iso(evidence.featureCutoff), featureCutoffSource: evidence.featureCutoffSource as HistoricalCompletionEvidence["featureCutoffSource"],
    featureCutoffConfidence: evidence.featureCutoffConfidence as HistoricalCompletionEvidence["featureCutoffConfidence"],
    completionDateEt: evidence.completionDateEt, gameStatus: evidence.gameStatus, statusCode: evidence.statusCode,
    finalStatus: evidence.finalStatus, terminalPlayComplete: evidence.terminalPlayComplete, playCount: evidence.playCount,
    inningsPlayed: evidence.inningsPlayed, postponed: evidence.postponed, suspended: evidence.suspended,
    resumed: evidence.resumed, crossedMidnightUtc: evidence.crossedMidnightUtc, quarantineReason: evidence.quarantineReason,
    evidencePayload: record(evidence.evidencePayload), rawPayloadHash: evidence.rawPayloadHash, evidenceHash: evidence.evidenceHash,
    resolverVersion: evidence.resolverVersion as typeof MLB_HISTORICAL_COMPLETION_RESOLVER_VERSION,
  };
  return [{
    canonicalGameId: game.canonicalGameId, providerGameId: game.providerGameId, season: game.season,
    officialGameDate: iso(game.gameDate)!.slice(0, 10), scheduledFirstPitch: iso(game.scheduledFirstPitch)!,
    homeCanonicalTeamId, awayCanonicalTeamId,
    homeRuns: game.homeRuns, awayRuns: game.awayRuns, homeStarterId: game.homeStarterProviderPlayerId,
    awayStarterId: game.awayStarterProviderPlayerId, venueId: game.venueProviderId, venueName: game.venueName,
    gameStatus: game.gameStatus, inningsPlayed: game.inningsPlayed, doubleheaderStatus: game.doubleheaderStatus,
    gameNumber: game.gameNumber, suspended: game.suspended, resumed: game.resumed,
    sourcePayloadHash: game.sourcePayloadHash, evidence: normalizedEvidence,
  }];
});
const foundation = buildMlbHistoricalCompletionFoundation(sourceGames, originalSplits, { artifactKey: ARTIFACT_KEY });
const expectedDecisions = new Map(foundation.decisions.map((decision) => [decision.canonicalGameId, decision]));
const expectedRows = new Map(foundation.rows.map((row) => [`${row.canonicalGameId}:${row.teamSide}`, row]));
const expectedSplits = new Map(foundation.splits.map((split) => [split.canonicalGameId, split]));

const decisionViolations = decisions.filter((row) => {
  const expected = expectedDecisions.get(row.canonicalGameId);
  if (!expected) return true;
  const base = {
    schemaVersion: row.schemaVersion,
    artifactKey: row.artifactKey,
    canonicalGameId: row.canonicalGameId,
    providerGameId: row.providerGameId,
    season: row.season,
    featureCutoff: iso(row.featureCutoff),
    featureCutoffSource: row.featureCutoffSource,
    eligiblePriorGameCount: row.eligiblePriorGameCount,
    eligiblePriorGameIdsHash: row.eligiblePriorGameIdsHash,
    homePriorGameCount: row.homePriorGameCount,
    homePriorGameIdsHash: row.homePriorGameIdsHash,
    awayPriorGameCount: row.awayPriorGameCount,
    awayPriorGameIdsHash: row.awayPriorGameIdsHash,
    sameDayDecisions: row.sameDayDecisions,
    deniedReasonCounts: row.deniedReasonCounts,
    decisionRule: row.decisionRule,
  };
  const { decisionHash: _decisionHash, ...expectedBase } = expected;
  return stableHistoricalJson(base) !== stableHistoricalJson(expectedBase) || row.decisionHash !== expected.decisionHash;
}).length + [...expectedDecisions.keys()].filter((id) => !decisions.some((row) => row.canonicalGameId === id)).length;

const marketPattern = /moneyline|sportsbook|closing.?line|implied.?probability|odds|spread|over.?under/i;
const featureHashViolations = featureRows.filter((row) => {
  const expected = expectedRows.get(`${row.canonicalGameId}:${row.teamSide}`);
  return !expected || row.checksum !== expected.checksum;
}).length;
const featureCutoffBindingViolations = featureRows.filter((row) => {
  const evidence = evidenceByGame.get(row.canonicalGameId);
  return !evidence || iso(row.featureCutoff) !== iso(evidence.featureCutoff);
}).length;
const outcomeLeakage = featureRows.filter((row) => Object.keys(record(row.targets)).length !== 0
  || marketPattern.test(stableHistoricalJson({ core: row.coreFeatures, enhanced: row.enhancedFeatures }))
  || record(row.pitLineage).sportsbookFieldsPresent !== false).length;
const sides = new Map<string, Set<string>>();
for (const row of featureRows) (sides.get(row.canonicalGameId) ?? sides.set(row.canonicalGameId, new Set()).get(row.canonicalGameId)!).add(row.teamSide);
const sideCoverageViolations = [...sides.values()].filter((value) => value.size !== 2 || !value.has("home") || !value.has("away")).length
  + [...new Set(sourceGames.map((game) => game.canonicalGameId))].filter((id) => !sides.has(id)).length;
const outcomeHashViolations = outcomeRows.filter((row) => row.outcomeHash !== hash({
  schemaVersion: row.schemaVersion,
  artifactKey: row.artifactKey,
  canonicalGameId: row.canonicalGameId,
  providerGameId: row.providerGameId,
  season: row.season,
  homeRuns: row.homeRuns,
  awayRuns: row.awayRuns,
  winnerSide: row.winnerSide,
  runDifference: row.runDifference,
  gameTotal: row.gameTotal,
  inningsPlayed: row.inningsPlayed,
  extraInnings: row.extraInnings,
  settlementStatus: row.settlementStatus,
  completionTime: iso(row.completionTime),
  completionBoundaryState: row.completionBoundaryState,
  sourcePayloadHash: row.sourcePayloadHash,
})).length;
const outcomeCompletionBindingViolations = outcomeRows.filter((row) => {
  const evidence = evidenceByGame.get(row.canonicalGameId);
  return !evidence
    || iso(row.completionTime) !== iso(evidence.canonicalCompletionTime)
    || row.completionBoundaryState !== evidence.completionTimeConfidence;
}).length;
const outcomeIds = new Set(outcomeRows.map((row) => row.canonicalGameId));
const featureIds = new Set(sides.keys());
const outcomeCoverageViolations = [...featureIds].filter((id) => !outcomeIds.has(id)).length
  + [...outcomeIds].filter((id) => !featureIds.has(id)).length;
const splitViolations = artifactSplits.filter((split) => {
  const expected = expectedSplits.get(split.canonicalGameId);
  return !expected || split.foundationChecksum !== foundation.checksum || !split.immutable
    || split.cohort !== expected.cohort || split.assignmentRule !== expected.assignmentRule
    || split.assignmentHash !== expected.assignmentHash;
}).length + [...expectedSplits.keys()].filter((id) => !artifactSplits.some((split) => split.canonicalGameId === id)).length;
const v1LockedOos = new Set(v1Splits.filter((split) => split.cohort === "LOCKED_OOS").map((split) => split.canonicalGameId));
const completionLockedOos = artifactSplits.filter((split) => split.cohort === "LOCKED_OOS");
const lockedOosExpansion = completionLockedOos.filter((split) => !v1LockedOos.has(split.canonicalGameId)).length;
const gameIds = new Set(games.map((game) => game.canonicalGameId));
const coverageMismatch = (ids: Set<string>) => [...gameIds].filter((id) => !ids.has(id)).length
  + [...ids].filter((id) => !gameIds.has(id)).length;
const gameLedgerCoverage = {
  persistedGames: coverageMismatch(new Set(persistedGames.map((row) => row.canonicalGameId))),
  rawSnapshots: coverageMismatch(new Set(rawSnapshots.map((row) => row.canonicalGameId))),
  evidence: coverageMismatch(new Set(evidenceRows.map((row) => row.canonicalGameId))),
  decisions: coverageMismatch(new Set(decisions.map((row) => row.canonicalGameId))),
  outcomes: coverageMismatch(outcomeIds),
  featureGames: coverageMismatch(featureIds),
};
const persistedGameViolations = games.filter((game) => {
  const persisted = persistedGameById.get(game.canonicalGameId);
  const evidence = evidenceByGame.get(game.canonicalGameId);
  if (!persisted || !evidence) return true;
  const completionProvenance = record(record(persisted.provenance).completion);
  return persisted.provider !== game.provider
    || persisted.providerGameId !== game.providerGameId
    || persisted.season !== game.season
    || persisted.homeProviderTeamId !== game.homeProviderTeamId
    || persisted.awayProviderTeamId !== game.awayProviderTeamId
    || persisted.sourcePayloadHash !== game.sourcePayloadHash
    || iso(persisted.actualStartTime) !== iso(evidence.actualStartTime)
    || iso(persisted.completionTime) !== iso(evidence.canonicalCompletionTime)
    || completionProvenance.evidenceHash !== evidence.evidenceHash
    || completionProvenance.rawPayloadHash !== evidence.rawPayloadHash
    || completionProvenance.completionTimeMethod !== evidence.completionTimeMethod
    || completionProvenance.completionTimeConfidence !== evidence.completionTimeConfidence;
}).length;

const guardNames = MLB_HISTORICAL_APPEND_ONLY_TABLES.flatMap((table) => [
  `${table}_block_row_mutation`, `${table}_block_truncate`,
]);
const triggerResult = await db.execute(sql<{ tgname: string }>`select tgname from pg_trigger
  where not tgisinternal and tgname like 'mlb_historical_%_block_%'`);
const actualGuards = new Set(triggerResult.rows.map((row) => row.tgname));
const appendOnlyGuardViolations = guardNames.filter((name) => !actualGuards.has(name)).length;
const persistedFeatureByIdentity = new Map(featureRows.map((row) => [
  `${row.canonicalGameId}:${row.teamSide}`,
  row,
]));
const persistedDecisionByGame = new Map(decisions.map((row) => [row.canonicalGameId, row]));
const replayRows = foundation.rows.map((expected) => {
  const row = persistedFeatureByIdentity.get(`${expected.canonicalGameId}:${expected.teamSide}`);
  return [expected.canonicalGameId, expected.teamSide, row?.checksum ?? "__missing__"];
});
const replayDecisions = foundation.decisions.map((expected) => [
  expected.canonicalGameId,
  persistedDecisionByGame.get(expected.canonicalGameId)?.decisionHash ?? "__missing__",
]);
const persistedReplayChecksum = hash([replayRows, replayDecisions]);

const seasons = Object.fromEntries([...new Set(sourceGames.map((game) => game.season))].sort().map((season) => [
  String(season), {
    games: sourceGames.filter((game) => game.season === season).length,
    evidence: evidenceRows.filter((row) => gameById.get(row.canonicalGameId)?.season === season).length,
    decisions: decisions.filter((row) => row.season === season).length,
    rows: featureRows.filter((row) => row.season === season).length,
  },
]));
const specialCases = {
  suspended: evidenceRows.filter((row) => row.suspended).length,
  resumed: evidenceRows.filter((row) => row.resumed).length,
  postponed: evidenceRows.filter((row) => row.postponed).length,
  crossedMidnightUtc: evidenceRows.filter((row) => row.crossedMidnightUtc).length,
  doubleheaders: evidenceRows.filter((row) =>
    (row.gameNumber ?? 1) > 1 || (row.doubleheaderStatus ?? "N") !== "N").length,
  quarantined: evidenceRows.filter((row) => row.quarantineReason !== null).length,
  authoritative: evidenceRows.filter((row) => row.completionTimeConfidence === "AUTHORITATIVE").length,
  derived: evidenceRows.filter((row) => row.completionTimeConfidence === "HIGH_CONFIDENCE_DERIVED").length,
  unresolved: evidenceRows.filter((row) => row.completionTimeConfidence === "UNRESOLVED").length,
};
const v1Artifact = v1Artifacts.length === 1 ? v1Artifacts[0]! : null;
const expectedSourceManifest = v1Artifact ? {
  v1: {
    artifactKey: "mlb-historical-2023-2026-v1",
    schemaVersion: V1_SCHEMA_VERSION,
    sourceManifestHash: v1Artifact.sourceManifestHash,
    foundationChecksum: v1Artifact.foundationChecksum,
    replayChecksum: v1Artifact.replayChecksum,
  },
  evidence: [...evidenceRows].sort((left, right) =>
    left.canonicalGameId.localeCompare(right.canonicalGameId)).map((row) => ({
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
        rawBodyHash: rawSnapshotByGame.get(row.canonicalGameId)?.rawBodyHash ?? "__missing__",
        byteLength: rawSnapshotByGame.get(row.canonicalGameId)?.byteLength ?? -1,
      },
  })),
} : null;
const artifactViolations = !artifact || !expectedSourceManifest
  || stableHistoricalJson(artifact.sourceManifest) !== stableHistoricalJson(expectedSourceManifest)
  || artifact.sourceManifestHash !== hash(expectedSourceManifest)
  || artifact.foundationChecksum !== foundation.checksum || artifact.replayChecksum !== foundation.replayChecksum
  || iso(artifact.retrievalCutoff) !== (
    evidenceRows.length
      ? new Date(Math.max(...evidenceRows.map((row) => row.retrievedAt.getTime()))).toISOString()
      : null
  )
  || !artifact.status.startsWith("SEALED") ? 1 : 0;
const failureCount = Object.values(evidenceViolations).reduce((sum, value) => sum + value, 0)
  + rawSnapshotViolations + decisionViolations + featureHashViolations + featureCutoffBindingViolations
  + outcomeLeakage + sideCoverageViolations + outcomeHashViolations
  + outcomeCompletionBindingViolations
  + outcomeCoverageViolations + splitViolations + lockedOosExpansion + appendOnlyGuardViolations + artifactViolations
  + persistedGameViolations
  + Object.values(gameLedgerCoverage).reduce((sum, value) => sum + value, 0)
  + (persistedReplayChecksum === foundation.replayChecksum ? 0 : 1);
const result = {
  task: "224B-1", schemaVersion: SCHEMA_VERSION, artifactKey: ARTIFACT_KEY,
  coverage: { sourceGames: games.length, persistedGames: persistedGames.length, rawSnapshots: rawSnapshots.length, rawSnapshotBytes: rawSnapshots.reduce((sum, row) => sum + row.byteLength, 0), evidence: evidenceRows.length, decisions: decisions.length, featureRows: featureRows.length, outcomes: outcomeRows.length, seasons, sources: Object.fromEntries([...new Set(evidenceRows.map((row) => row.provider))].sort().map((source) => [source, evidenceRows.filter((row) => row.provider === source).length])), specialCases, foundation: foundation.summary },
  violations: { rawSnapshots: rawSnapshotViolations, evidence: evidenceViolations, persistedGames: persistedGameViolations, decisions: decisionViolations, featureChecksums: featureHashViolations, featureCutoffBinding: featureCutoffBindingViolations, outcomeLeakage, featureSideCoverage: sideCoverageViolations, outcomeHashes: outcomeHashViolations, outcomeCompletionBinding: outcomeCompletionBindingViolations, outcomeCoverage: outcomeCoverageViolations, gameLedgerCoverage, splits: splitViolations, v1LockedOosExpansion: lockedOosExpansion, artifact: artifactViolations, appendOnlyGuards: appendOnlyGuardViolations, persistedReplay: persistedReplayChecksum === foundation.replayChecksum ? 0 : 1 },
  checksums: { foundation: foundation.checksum, foundationReplay: foundation.replayChecksum, persistedReplay: persistedReplayChecksum, artifactFoundation: artifact?.foundationChecksum ?? null, artifactReplay: artifact?.replayChecksum ?? null },
  rule: MLB_HISTORICAL_CHRONOLOGY_RULE, expectedAppendOnlyGuards: guardNames.length,
  status: failureCount === 0 ? "PASS" : "FAIL",
};
console.log(JSON.stringify(result, null, 2));
if (result.status === "FAIL") process.exitCode = 1;