import { createHash } from "node:crypto";
import { and, eq, gt, gte, inArray, lt, lte } from "drizzle-orm";
import {
  db, gamesTable, ncaafCfbdTeamMappingsTable, ncaafFootballIntelligenceSnapshotsTable,
  ncaafGameEvidenceTable, ncaafMarketObservationsTable, ncaafV4GameDayMarketEvidenceTable, ncaafV4GameDayPredictionsTable,
} from "@workspace/db";
import type { NcaafReplayFeatures } from "./ncaafChronologicalReplay";
import {
  buildNcaafV42026FeatureBridge, NCAAF_V4_2026_FBS_UNIVERSE_PROOF, type NcaafSafeTeamMapping,
  type NcaafV42026ChallengerInput,
} from "./ncaafV42026FeatureBridge";
import {
  NCAAF_V4_DATASET_VERSION, NCAAF_V4_EXPECTED_SCORE_ID, NCAAF_V4_FEATURE_SCHEMA_VERSION,
  fairAmericanOdds, type V4Prediction,
} from "./ncaafV4ExpectedScore";
import { NCAAF_V4_CANONICAL_BASELINE_D } from "./ncaafV4DistinctChallenger";

export const NCAAF_V4_GAME_DAY_STATUS = Object.freeze({
  modelStatus: "V4_PREVIEW", approvalStatus: "UNVALIDATED", publicationStatus: "PREVIEW_ONLY",
} as const);
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const cdf = (x: number) => { const t = 1 / (1 + .2316419 * Math.abs(x)), d = .3989423 * Math.exp(-x * x / 2), q = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x >= 0 ? 1 - q : q; };

/** The Baseline D parameters are copied from the immutable reconciliation
 * manifest, never fit or recalibrated at request time. */
export function predictFrozenNcaafV4(input: NcaafV42026ChallengerInput): V4Prediction {
  const f = input.features as NcaafReplayFeatures;
  const p = NCAAF_V4_CANONICAL_BASELINE_D.parameters;
  const state = (current: NcaafReplayFeatures["home"]["seasonToDate"], prior: NcaafReplayFeatures["home"]["priorSeason"]) => {
    const games = current.games, weight = games / (games + 4), population = p.population;
    const offense = weight * (current.offensePointsPerGame ?? (prior.offensePointsPerGame ?? population)) + (1 - weight) * (prior.offensePointsPerGame ?? population);
    const defense = weight * (current.defensePointsAllowedPerGame ?? (prior.defensePointsAllowedPerGame ?? population)) + (1 - weight) * (prior.defensePointsAllowedPerGame ?? population);
    return { offense, defense, games, missing: Number(current.offensePointsPerGame == null) };
  };
  const home = state(f.home.seasonToDate, f.home.priorSeason), away = state(f.away.seasonToDate, f.away.priorSeason);
  const homeVector = [1, home.offense, away.defense, f.elo.difference / 100, f.context.homeField ? 1 : 0, home.games / 10, away.games / 10, home.missing, away.missing];
  const awayVector = [1, away.offense, home.defense, -f.elo.difference / 100, f.context.homeField ? -1 : 0, away.games / 10, home.games / 10, away.missing, home.missing];
  const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, item, i) => sum + item * b[i]!, 0);
  const expectedHomePoints = Math.max(0, dot(p.home, homeVector)), expectedAwayPoints = Math.max(0, dot(p.away, awayVector));
  const expectedMargin = expectedHomePoints - expectedAwayPoints, expectedTotal = expectedHomePoints + expectedAwayPoints;
  // Frozen historical margin RMSE; the declared low-sample/missing inflation is
  // the same Baseline D formula and is not a live calibration.
  const baseMarginSd = 17.73646710672768, baseTotalSd = 16.16472189732905;
  const uncertainty = 1 + (home.missing + away.missing) * .15 + Math.max(0, 4 - Math.min(home.games, away.games)) * .04;
  const marginUncertainty = baseMarginSd * uncertainty, totalUncertainty = baseTotalSd * uncertainty;
  const homeWinProbability = clamp(cdf(expectedMargin / marginUncertainty), .001, .999);
  const qMargin = (line: number) => clamp(cdf((expectedMargin + line) / marginUncertainty), 0, 1);
  const qTotal = (line: number) => clamp(cdf((expectedTotal - line) / totalUncertainty), 0, 1);
  const dataQuality = home.games + away.games >= 10 && !home.missing && !away.missing ? "HIGH" : home.games + away.games >= 4 ? "MEDIUM" : home.games + away.games > 0 ? "LOW" : "INSUFFICIENT";
  return Object.freeze({
    predictionId: hash({ gameId: input.stableGameId, featureChecksum: input.checksum, featureCutoff: input.featureCutoff, configurationHash: NCAAF_V4_CANONICAL_BASELINE_D.configurationHash, parameterHash: NCAAF_V4_CANONICAL_BASELINE_D.parameterHash }),
    gameId: input.stableGameId, sport: "NCAAF", modelVersion: "D-simple-expected-score-linear", datasetVersion: NCAAF_V4_DATASET_VERSION, featureSchemaVersion: NCAAF_V4_FEATURE_SCHEMA_VERSION, featureCutoff: input.featureCutoff,
    expectedHomePoints, expectedAwayPoints, expectedMargin, expectedTotal, homeWinProbability, awayWinProbability: 1 - homeWinProbability,
    scoreUncertainty: (marginUncertainty + totalUncertainty) / 4, marginUncertainty, totalUncertainty, dataQuality,
    diagnostics: { currentGames: [home.games, away.games] as [number, number], missingIndicators: home.missing + away.missing, configurationHash: NCAAF_V4_CANONICAL_BASELINE_D.configurationHash, parameterHash: NCAAF_V4_CANONICAL_BASELINE_D.parameterHash },
    probabilityHomeCovers: qMargin, probabilityAwayCovers: (line: number) => 1 - qMargin(-line), probabilityOver: qTotal, probabilityUnder: (line: number) => 1 - qTotal(line),
  });
}

export type V4MarketIdentity = "EXACT_ID_MATCH" | "EXACT_CANONICAL_MATCH" | "SAFE_TEAM_TIME_MATCH" | "AMBIGUOUS" | "UNMATCHED";
export type V4MarketRootCause = "SAFE_MATCH" | "NO_CURRENT_MARKET" | "STALE_MARKET" | "INCOMPLETE_COHERENT_SNAPSHOT" | "AMBIGUOUS_MATCH" | "REJECTED_UNSAFE_IDENTITY";
export type NcaafV4MarketRow = { id?: number; gameEvidenceId: number | null; marketKey: string; selection: string; price: number | null; line: number | null; bookmakerProviderId: string; bookmakerName: string | null; capturedAt: Date; isMatchedToGame: boolean; marketIdentityStatus: string; payload?: unknown; };
const usableLegacyIdentity = new Set(["matched_exact", "matched_alias"]);
export function classifyV4MarketIdentity(row: NcaafV4MarketRow): V4MarketIdentity {
  if (!row.isMatchedToGame || row.gameEvidenceId == null) return row.marketIdentityStatus.includes("ambiguous") ? "AMBIGUOUS" : "UNMATCHED";
  return row.marketIdentityStatus === "matched_exact" ? "EXACT_CANONICAL_MATCH"
    : row.marketIdentityStatus === "matched_alias" ? "SAFE_TEAM_TIME_MATCH"
      : usableLegacyIdentity.has(row.marketIdentityStatus) ? "SAFE_TEAM_TIME_MATCH" : "UNMATCHED";
}
const teamKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
/** The stored link alone is not enough: re-prove ordered teams, NCAAF sport,
 * kickoff and neutral-site context from the immutable provider payload. */
export function safeCurrentMarketSnapshot(rows: readonly NcaafV4MarketRow[], game: { id: number; homeTeamName: string | null; awayTeamName: string | null; kickoffAt: Date | null; neutralSite: boolean | null }, now: Date) {
  if (!game.kickoffAt || !game.homeTeamName || !game.awayTeamName) return { classification: "UNMATCHED" as const, rootCause: "REJECTED_UNSAFE_IDENTITY" as const, rows: [] as NcaafV4MarketRow[] };
  const kickoffAt = game.kickoffAt, homeTeamName = game.homeTeamName, awayTeamName = game.awayTeamName;
  const considered = rows.filter(row => row.gameEvidenceId === game.id);
  if (!considered.length) return { classification: "UNMATCHED" as const, rootCause: "NO_CURRENT_MARKET" as const, rows: [] as NcaafV4MarketRow[] };
  if (considered.some(row => classifyV4MarketIdentity(row) === "AMBIGUOUS")) return { classification: "AMBIGUOUS" as const, rootCause: "AMBIGUOUS_MATCH" as const, rows: [] as NcaafV4MarketRow[] };
  const current = considered.filter(row => row.capturedAt < kickoffAt && row.capturedAt <= now && now.getTime() - row.capturedAt.getTime() <= 30 * 60_000);
  if (!current.length && considered.some(row => now.getTime() - row.capturedAt.getTime() > 30 * 60_000)) return { classification: "UNMATCHED" as const, rootCause: "STALE_MARKET" as const, rows: [] as NcaafV4MarketRow[] };
  const valid = current.filter(row => {
    if (row.gameEvidenceId !== game.id || classifyV4MarketIdentity(row) === "UNMATCHED" || classifyV4MarketIdentity(row) === "AMBIGUOUS" || row.capturedAt >= kickoffAt || now.getTime() - row.capturedAt.getTime() > 30 * 60_000) return false;
    const root = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
    const event = root.event && typeof root.event === "object" ? root.event as Record<string, unknown> : {};
    const sport = typeof event.sport_key === "string" ? event.sport_key : "";
    const home = typeof event.home_team === "string" ? event.home_team : "";
    const away = typeof event.away_team === "string" ? event.away_team : "";
    const kickoff = typeof event.commence_time === "string" ? new Date(event.commence_time) : null;
    const neutral = event.neutral_site;
    return sport.includes("ncaaf") && teamKey(home) === teamKey(homeTeamName) && teamKey(away) === teamKey(awayTeamName)
      && kickoff != null && Number.isFinite(kickoff.getTime()) && Math.abs(kickoff.getTime() - kickoffAt.getTime()) <= 6 * 60 * 60_000
      && (game.neutralSite !== true || neutral === true);
  });
  const classifications = new Set(valid.map(classifyV4MarketIdentity));
  if (classifications.size !== 1) return { classification: "UNMATCHED" as const, rootCause: "REJECTED_UNSAFE_IDENTITY" as const, rows: [] as NcaafV4MarketRow[] };
  const grouped = new Map<string, NcaafV4MarketRow[]>();
  for (const row of valid) { const key = `${row.bookmakerProviderId}:${row.capturedAt.toISOString()}`; grouped.set(key, [...(grouped.get(key) ?? []), row]); }
  const snapshots = [...grouped.values()].filter(value => value.some(x => x.marketKey === "h2h") && value.some(x => x.marketKey === "spreads") && value.some(x => x.marketKey === "totals"))
    .sort((a, b) => b[0]!.capturedAt.getTime() - a[0]!.capturedAt.getTime() || a[0]!.bookmakerProviderId.localeCompare(b[0]!.bookmakerProviderId));
  if (!snapshots.length) return { classification: "UNMATCHED" as const, rootCause: valid.length ? "INCOMPLETE_COHERENT_SNAPSHOT" as const : "REJECTED_UNSAFE_IDENTITY" as const, rows: [] as NcaafV4MarketRow[] };
  return { classification: [...classifications][0]!, rootCause: "SAFE_MATCH" as const, rows: snapshots[0]! };
}
const implied = (price: number) => price < 0 ? -price / (-price + 100) : 100 / (price + 100);
export function twoWayNoVig(first: number, second: number) {
  const a = implied(first), b = implied(second), total = a + b;
  return total > 0 && Number.isFinite(total) ? { first: a / total, second: b / total } : null;
}
function easternDate(now: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
function validRequestedDate(value: unknown, now: Date) {
  if (value == null) return easternDate(now);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T12:00:00Z`).getTime())) throw new Error("date must be YYYY-MM-DD");
  return value;
}
export const normalNcaafV4GameDayDate = (now = new Date()) => easternDate(now);
/** The sole persistence guard for the normal production path. */
export const mayPersistNcaafV4GameDayDate = (date: string, now = new Date()) => date === normalNcaafV4GameDayDate(now);
/** Write-time safety predicate; kept pure so kickoff races are regression-testable. */
export const isNcaafV4PredictionWriteEligible = (date: string, kickoffAt: Date | string, writeNow: Date) =>
  mayPersistNcaafV4GameDayDate(date, writeNow) && new Date(kickoffAt) > writeNow;
export function ncaafV4SnapshotSetFingerprint(snapshots: readonly { id: number; schemaVersion: string; targetProvider: string; targetEventId: string; kickoffAt: Date; dataCutoffAt: Date; inputHash: string }[]) {
  return hash(snapshots.map(snapshot => ({
    id: snapshot.id, schemaVersion: snapshot.schemaVersion, targetProvider: snapshot.targetProvider,
    targetEventId: snapshot.targetEventId, kickoffAt: snapshot.kickoffAt.toISOString(),
    dataCutoffAt: snapshot.dataCutoffAt.toISOString(), inputHash: snapshot.inputHash,
  })).sort((a, b) => `${a.targetProvider}:${a.targetEventId}:${a.id}`.localeCompare(`${b.targetProvider}:${b.targetEventId}:${b.id}`)));
}
const FORECAST_CACHE_TTL_MS = 2 * 60_000;
const MARKET_CACHE_TTL_MS = 60_000;
type CacheEntry<T> = { key: string; createdAt: Date; expiresAt: Date; value: T };
const forecastCache = new Map<string, CacheEntry<unknown>>();
const marketCache = new Map<string, CacheEntry<NcaafV4MarketRow[]>>();
/** Completed, PIT-safe sports computation. Market observations are intentionally
 * absent so a market refresh cannot change a frozen forecast. */
const sportsOutputCache = new Map<string, CacheEntry<{
  bridge: ReturnType<typeof buildNcaafV42026FeatureBridge>;
  frozenByGameId: ReadonlyMap<string, V4Prediction>;
}>>();
/** Test/admin support only; cache lifetime and all metadata are observable in board profiling. */
export function clearNcaafV4GameDayCaches() { forecastCache.clear(); marketCache.clear(); sportsOutputCache.clear(); }
function cached<T>(cache: Map<string, CacheEntry<T>>, key: string, now: Date): CacheEntry<T> | null {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= now) { if (entry) cache.delete(key); return null; }
  return entry;
}
export function ncaafV4MarketHealth(rows: readonly NcaafV4MarketRow[], boards: readonly { marketMatch: { classification: string; rootCause: V4MarketRootCause } }[], _now: Date) {
  const count = (cause: V4MarketRootCause) => boards.filter(x => x.marketMatch.rootCause === cause).length;
  const safeMatches = count("SAFE_MATCH");
  const rootCauses = [...new Set(boards.map(x => x.marketMatch.rootCause))].map(rootCause => ({ rootCause, count: count(rootCause) }))
    .sort((a, b) => b.count - a.count || a.rootCause.localeCompare(b.rootCause));
  return { observationsConsidered: rows.length, eligibleForecasts: boards.length, safeMatches,
    unmatchedGames: boards.filter(x => x.marketMatch.classification === "UNMATCHED").length,
    ambiguousGames: count("AMBIGUOUS_MATCH"), staleGames: count("STALE_MARKET"),
    rejectedGames: count("REJECTED_UNSAFE_IDENTITY") + count("INCOMPLETE_COHERENT_SNAPSHOT"),
    safeMatchRate: boards.length ? safeMatches / boards.length : 0, rootCauses };
}
export async function persistTodayPredictions(
  date: string, now: Date, bridge: ReturnType<typeof buildNcaafV42026FeatureBridge>,
  marketAttachments: readonly { predictionId: string; identity: string; rows: readonly NcaafV4MarketRow[] }[],
  writeClock: () => Date = () => new Date(),
) {
  // Diagnostic and future requests are strictly read-only. The caller only
  // supplies pre-kickoff bridge targets, so this also cannot backfill finals.
  const writeNow = writeClock();
  if (!mayPersistNcaafV4GameDayDate(date, writeNow) || !bridge.predictions.length) return 0;
  const rows = bridge.predictions.flatMap((prediction) => {
    const input = bridge.inputs.find(x => x.stableGameId === prediction.gameId)!;
    // This is intentionally a fresh write-time check, not the request start.
    if (!isNcaafV4PredictionWriteEligible(date, input.kickoffAt, writeNow)) return [];
    const frozen = predictFrozenNcaafV4(input);
    return [{
      predictionId: frozen.predictionId, gameId: prediction.gameId, canonicalGameId: prediction.espnGameId ?? prediction.gameId,
      sport: "NCAAF", gameDate: date, kickoffAt: new Date(prediction.predictionTimestamp === "" ? input.kickoffAt : input.kickoffAt),
      featureCutoff: new Date(input.featureCutoff), modelName: NCAAF_V4_EXPECTED_SCORE_ID, modelVersion: frozen.modelVersion,
      configurationHash: String(frozen.diagnostics.configurationHash), parameterHash: String(frozen.diagnostics.parameterHash),
      featureSchemaVersion: frozen.featureSchemaVersion, featureSnapshotHash: input.checksum, predictionHash: frozen.predictionId,
      homeTeamId: prediction.cfbdHomeTeamId, awayTeamId: prediction.cfbdAwayTeamId,
      expectedHomePoints: frozen.expectedHomePoints, expectedAwayPoints: frozen.expectedAwayPoints, expectedMargin: frozen.expectedMargin,
      expectedTotal: frozen.expectedTotal, homeWinProbability: frozen.homeWinProbability, awayWinProbability: frozen.awayWinProbability,
      fairHomeMoneyline: fairAmericanOdds(frozen.homeWinProbability), fairAwayMoneyline: fairAmericanOdds(frozen.awayWinProbability),
      marginUncertainty: frozen.marginUncertainty, totalUncertainty: frozen.totalUncertainty, dataQuality: frozen.dataQuality,
      ...NCAAF_V4_GAME_DAY_STATUS, sourceAudit: input.sourceAudit,
    }];
  });
  if (!rows.length) return 0;
  await db.insert(ncaafV4GameDayPredictionsTable).values(rows).onConflictDoNothing();
  const evidence = await db.select({ id: ncaafV4GameDayPredictionsTable.id, predictionId: ncaafV4GameDayPredictionsTable.predictionId })
    .from(ncaafV4GameDayPredictionsTable).where(inArray(ncaafV4GameDayPredictionsTable.predictionId, rows.map(x => x.predictionId)));
  const evidenceIdByPrediction = new Map(evidence.map(x => [x.predictionId, x.id]));
  const eligiblePredictionIds = new Set(rows.map(row => row.predictionId));
  const links = marketAttachments.filter(attachment => eligiblePredictionIds.has(attachment.predictionId)).flatMap(attachment => attachment.rows
    .filter(row => row.id != null)
    .map(row => ({ predictionEvidenceId: evidenceIdByPrediction.get(attachment.predictionId)!, marketObservationId: row.id!,
      marketIdentity: attachment.identity, capturedAt: row.capturedAt,
      evidenceHash: hash({ observationId: row.id, identity: attachment.identity, capturedAt: row.capturedAt.toISOString() }) })))
    .filter(x => x.predictionEvidenceId != null);
  if (links.length) await db.insert(ncaafV4GameDayMarketEvidenceTable).values(links).onConflictDoNothing();
  return rows.length;
}
/** IANA-zone midnight boundaries; never use a fixed EDT/EST offset. */
export function easternDayBounds(date: string): { start: Date; end: Date } {
  const midnight = (calendarDate: string) => {
    // UTC midnight is still the preceding evening in ET, which has the same
    // offset as the requested local midnight even on the fall DST transition.
    const noon = new Date(`${calendarDate}T00:00:00.000Z`);
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "longOffset" })
      .formatToParts(noon).find(x => x.type === "timeZoneName")?.value;
    const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset ?? "");
    if (!match) throw new Error("Unable to resolve America/New_York offset");
    const minutes = (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "+" ? 1 : -1);
    return new Date(Date.UTC(Number(calendarDate.slice(0, 4)), Number(calendarDate.slice(5, 7)) - 1, Number(calendarDate.slice(8, 10))) - minutes * 60_000);
  };
  const next = new Date(`${date}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: midnight(date), end: midnight(next.toISOString().slice(0, 10)) };
}

/** Read-only, current-market attachment. No prediction, registry, pick, or
 * publication table is written; immutable prediction linkage is returned. */
export async function getNcaafV4ProjectionBoard(dateValue: unknown, now = new Date()) {
  const startedAt = performance.now();
  const phase = { scheduleRetrievalMs: 0, historicalFeatureReconstructionMs: 0, featureBridgeMs: 0, v4InferenceMs: 0, marketRetrievalMs: 0, marketMatchingMs: 0, persistenceMs: 0, responseSerializationMs: 0 };
  const date = validRequestedDate(dateValue, now);
  const { start, end } = easternDayBounds(date);
  const snapshotRows = await db.select().from(ncaafFootballIntelligenceSnapshotsTable).where(and(
    eq(ncaafFootballIntelligenceSnapshotsTable.season, 2026), gt(ncaafFootballIntelligenceSnapshotsTable.kickoffAt, now),
    gte(ncaafFootballIntelligenceSnapshotsTable.kickoffAt, start), lt(ncaafFootballIntelligenceSnapshotsTable.kickoffAt, end),
  ));
  // The newest valid pre-kickoff feature cutoff is authoritative per event.
  const snapshotByEvent = new Map<string, typeof snapshotRows[number]>();
  for (const row of snapshotRows) {
    const prior = snapshotByEvent.get(row.targetEventId);
    if (!prior || row.dataCutoffAt > prior.dataCutoffAt || (row.dataCutoffAt.getTime() === prior.dataCutoffAt.getTime() && row.id > prior.id)) snapshotByEvent.set(row.targetEventId, row);
  }
  const snapshots = [...snapshotByEvent.values()];
  const eventIds = [...new Set(snapshots.map(x => x.targetEventId))];
  // The forecast cache is keyed by the actual newest usable feature cutoff,
  // not wall-clock request time. A newer cutoff naturally invalidates it.
  const usableCutoffs = snapshots.map(x => x.dataCutoffAt.getTime()).filter(value => value <= now.getTime());
  const latestCutoff = new Date(usableCutoffs.length ? Math.max(...usableCutoffs) : now.getTime());
  // Include every selected snapshot identity, not merely the maximum cutoff:
  // a replacement or a newly eligible game can otherwise share that cutoff.
  const snapshotSetFingerprint = ncaafV4SnapshotSetFingerprint(snapshots);
  const historyCacheKey = `ncaaf-v4:sports:${date}:${latestCutoff.toISOString()}:${snapshotSetFingerprint}:${NCAAF_V4_FEATURE_SCHEMA_VERSION}:${NCAAF_V4_CANONICAL_BASELINE_D.configurationHash}:${NCAAF_V4_CANONICAL_BASELINE_D.parameterHash}`;
  const cachedSportsCandidate = cached(sportsOutputCache, historyCacheKey, now);
  // A cached pregame computation is never served after any included kickoff.
  const savedSports = cachedSportsCandidate && [...cachedSportsCandidate.value.frozenByGameId.values()]
    .every(prediction => new Date(prediction.featureCutoff).getTime() <= now.getTime())
    && cachedSportsCandidate.value.bridge.inputs.every(input => new Date(input.kickoffAt) > now)
    ? cachedSportsCandidate : null;
  if (!savedSports && cachedSportsCandidate) sportsOutputCache.delete(historyCacheKey);
  const savedHistory = cached(forecastCache, historyCacheKey, now);
  const historyStartedAt = performance.now();
  const [historyResult, mappings, scheduleRows, incumbents] = await Promise.all([
    savedHistory?.value as any ?? db.select().from(ncaafGameEvidenceTable).where(and(
      inArray(ncaafGameEvidenceTable.season, [2025, 2026]),
      eq(ncaafGameEvidenceTable.gameStatus, "final"),
      lt(ncaafGameEvidenceTable.kickoffAt, latestCutoff),
    )),
    db.select().from(ncaafCfbdTeamMappingsTable).where(eq(ncaafCfbdTeamMappingsTable.season, 2026)),
    eventIds.length ? db.select().from(ncaafGameEvidenceTable).where(and(eq(ncaafGameEvidenceTable.provider, "espn"), inArray(ncaafGameEvidenceTable.providerEventId, eventIds))) : [],
    eventIds.length ? db.select().from(gamesTable).where(inArray(gamesTable.id, eventIds)) : [],
  ]);
  if (!savedHistory) forecastCache.set(historyCacheKey, { key: historyCacheKey, createdAt: now, expiresAt: new Date(now.getTime() + FORECAST_CACHE_TTL_MS), value: historyResult });
  phase.historicalFeatureReconstructionMs = performance.now() - historyStartedAt;
  phase.scheduleRetrievalMs = historyStartedAt - startedAt;
  const evidence = historyResult as any[];
  const scheduleByEvent = new Map<string, typeof scheduleRows[number]>();
  for (const row of scheduleRows) {
    const prior = scheduleByEvent.get(row.providerEventId);
    if (!prior || row.capturedAt > prior.capturedAt || (row.capturedAt.getTime() === prior.capturedAt.getTime() && row.id > prior.id)) scheduleByEvent.set(row.providerEventId, row);
  }
  const marketKey = `ncaaf-v4:market:${date}:${scheduleRows.map(x => x.id).sort((a, b) => a - b).join(",")}`;
  const savedMarkets = cached(marketCache, marketKey, now);
  const marketStartedAt = performance.now();
  // Keep one hour of stale diagnostics beyond the strict 30-minute attachment
  // window. This is enough to explain STALE_MARKET without loading the ledger's
  // full historical payload population.
  const marketDiagnosticFloor = new Date(now.getTime() - 90 * 60_000);
  const marketRows = savedMarkets?.value ?? (scheduleRows.length ? await db.select({
    id: ncaafMarketObservationsTable.id, gameEvidenceId: ncaafMarketObservationsTable.gameEvidenceId,
    marketKey: ncaafMarketObservationsTable.marketKey, selection: ncaafMarketObservationsTable.selection,
    price: ncaafMarketObservationsTable.price, line: ncaafMarketObservationsTable.line,
    bookmakerProviderId: ncaafMarketObservationsTable.bookmakerProviderId, bookmakerName: ncaafMarketObservationsTable.bookmakerName,
    capturedAt: ncaafMarketObservationsTable.capturedAt, isMatchedToGame: ncaafMarketObservationsTable.isMatchedToGame,
    marketIdentityStatus: ncaafMarketObservationsTable.marketIdentityStatus, payload: ncaafMarketObservationsTable.payload,
  }).from(ncaafMarketObservationsTable)
    .where(and(inArray(ncaafMarketObservationsTable.gameEvidenceId, scheduleRows.map(x => x.id)),
      gte(ncaafMarketObservationsTable.capturedAt, marketDiagnosticFloor), lte(ncaafMarketObservationsTable.capturedAt, now))) : []);
  if (!savedMarkets) marketCache.set(marketKey, { key: marketKey, createdAt: now, expiresAt: new Date(now.getTime() + MARKET_CACHE_TTL_MS), value: marketRows });
  phase.marketRetrievalMs = performance.now() - marketStartedAt;
  const bridgeStartedAt = performance.now();
  const bridge = savedSports?.value.bridge ?? buildNcaafV42026FeatureBridge({
    snapshots, evidence, mappings: mappings.map(x => ({ ...x, ...(x.evidence as object) })) as NcaafSafeTeamMapping[], fbsUniverseProof: NCAAF_V4_2026_FBS_UNIVERSE_PROOF, assessedAt: now, predict: predictFrozenNcaafV4,
  });
  const frozenByGameId = savedSports?.value.frozenByGameId ?? new Map(bridge.inputs.map(input => [input.stableGameId, predictFrozenNcaafV4(input)]));
  if (!savedSports) sportsOutputCache.set(historyCacheKey, {
    key: historyCacheKey, createdAt: now, expiresAt: new Date(now.getTime() + FORECAST_CACHE_TTL_MS),
    value: { bridge, frozenByGameId },
  });
  phase.featureBridgeMs = performance.now() - bridgeStartedAt;
  const evidenceByEvent = new Map<string, typeof evidence[number]>();
  for (const row of evidence.filter(x => x.provider === "espn")) {
    const prior = evidenceByEvent.get(row.providerEventId);
    if (!prior || row.capturedAt > prior.capturedAt || (row.capturedAt.getTime() === prior.capturedAt.getTime() && row.id > prior.id)) evidenceByEvent.set(row.providerEventId, row);
  }
  const incumbentById = new Map(incumbents.map(x => [x.id, x]));
  const marketAttachments: { predictionId: string; identity: string; rows: readonly NcaafV4MarketRow[] }[] = [];
  const inferenceStartedAt = performance.now();
  const boards = bridge.predictions.map(prediction => {
    const snapshot = snapshots.find(x => x.id === prediction.snapshotId)!;
    const game = scheduleByEvent.get(snapshot.targetEventId) ?? evidenceByEvent.get(snapshot.targetEventId);
    const selectedMarket = game ? safeCurrentMarketSnapshot(marketRows, game, now) : { classification: "UNMATCHED" as const, rootCause: "REJECTED_UNSAFE_IDENTITY" as const, rows: [] };
    const identity = selectedMarket.classification;
    const usable = identity !== "AMBIGUOUS" && identity !== "UNMATCHED";
    const p = bridge.inputs.find(x => x.stableGameId === prediction.gameId)!;
    const frozen = frozenByGameId.get(p.stableGameId)!;
    const market = usable ? selectedMarket.rows : [];
    if (market.length) marketAttachments.push({ predictionId: frozen.predictionId, identity, rows: market });
    const moneyline = market.filter(x => x.marketKey === "h2h" && x.price != null);
    const home = moneyline.find(x => x.selection === game?.homeTeamName), away = moneyline.find(x => x.selection === game?.awayTeamName);
    const noVig = home && away ? twoWayNoVig(home.price!, away.price!) : null;
    const edge = noVig ? frozen.homeWinProbability - noVig.first : null;
    const spread = market.find(x => x.marketKey === "spreads" && x.selection === game?.homeTeamName && x.line != null)
      ?? market.find(x => x.marketKey === "spreads" && x.line != null);
    const total = market.find(x => x.marketKey === "totals" && x.selection.toLowerCase() === "over" && x.line != null)
      ?? market.find(x => x.marketKey === "totals" && x.line != null);
    const opinion = edge == null || frozen.dataQuality === "INSUFFICIENT" ? "NEUTRAL" : edge >= .05 ? "BUY" : edge >= .02 ? "LEAN" : edge <= -.05 ? "FADE" : "NEUTRAL";
    const incumbent = incumbentById.get(snapshot.targetEventId);
    const incumbentAgreement = !incumbent ? "NO_INCUMBENT_FORECAST" : ((Number(incumbent.edge) >= 0) === (frozen.homeWinProbability >= .5) ? "AGREE" : "DISAGREE");
    return { gameId: prediction.gameId, predictionId: frozen.predictionId, predictionHash: frozen.predictionId, kickoffAt: snapshot.kickoffAt.toISOString(), awayTeam: game?.awayTeamName ?? null, homeTeam: game?.homeTeamName ?? null, neutralSite: game?.neutralSite ?? null,
      ...NCAAF_V4_GAME_DAY_STATUS, model: { id: NCAAF_V4_EXPECTED_SCORE_ID, version: frozen.modelVersion, configurationHash: frozen.diagnostics.configurationHash, parameterHash: frozen.diagnostics.parameterHash, featureSchema: frozen.featureSchemaVersion, featureCutoff: frozen.featureCutoff, dataQuality: frozen.dataQuality, expectedHomePoints: frozen.expectedHomePoints, expectedAwayPoints: frozen.expectedAwayPoints, expectedMargin: frozen.expectedMargin, expectedTotal: frozen.expectedTotal, homeWinProbability: frozen.homeWinProbability, awayWinProbability: frozen.awayWinProbability, fairHomeMoneyline: fairAmericanOdds(frozen.homeWinProbability), fairAwayMoneyline: fairAmericanOdds(frozen.awayWinProbability), marginUncertainty: frozen.marginUncertainty, totalUncertainty: frozen.totalUncertainty },
      marketMatch: { classification: identity, attachable: usable, matchReason: selectedMarket.rootCause, rootCause: selectedMarket.rootCause }, market: { moneyline: home && away ? { bookmaker: home.bookmakerName ?? home.bookmakerProviderId, capturedAt: home.capturedAt.toISOString(), homeOdds: home.price, awayOdds: away.price, noVigHomeProbability: noVig?.first ?? null, noVigAwayProbability: noVig?.second ?? null } : null, spread: spread ? { bookmaker: spread.bookmakerName ?? spread.bookmakerProviderId, capturedAt: spread.capturedAt.toISOString(), selection: spread.selection, line: spread.line, odds: spread.price } : null, total: total ? { bookmaker: total.bookmakerName ?? total.bookmakerProviderId, capturedAt: total.capturedAt.toISOString(), selection: total.selection, line: total.line, odds: total.price } : null },
      comparison: { moneylineHomeEdge: edge, spread: spread ? { projectedHomeMargin: frozen.expectedMargin, line: spread.line, difference: frozen.expectedMargin + (spread.line ?? 0) } : null, total: total ? { projectedTotal: frozen.expectedTotal, line: total.line, difference: frozen.expectedTotal - (total.line ?? 0) } : null }, v4ModelOpinion: usable ? opinion : "NEUTRAL", recommendationReason: usable ? (edge == null ? "two-way current moneyline unavailable" : "current no-vig moneyline comparison") : `market identity ${identity}; fail closed`, incumbentAgreement,
      status: usable && frozen.dataQuality !== "INSUFFICIENT" ? "ELIGIBLE_FOR_PREVIEW" : identity === "AMBIGUOUS" ? "AMBIGUOUS_MARKET" : identity === "UNMATCHED" ? "UNMATCHED_MARKET" : "INSUFFICIENT_DATA",
    };
  }).sort((a, b) => (b.comparison.moneylineHomeEdge ?? -Infinity) - (a.comparison.moneylineHomeEdge ?? -Infinity) || a.kickoffAt.localeCompare(b.kickoffAt) || a.gameId.localeCompare(b.gameId))
    .map((row, index) => ({ rank: index + 1, ...row }));
  phase.v4InferenceMs = performance.now() - inferenceStartedAt;
  const persistStartedAt = performance.now();
  const persisted = await persistTodayPredictions(date, now, bridge, marketAttachments);
  phase.persistenceMs = performance.now() - persistStartedAt;
  const matchingStartedAt = performance.now();
  const marketHealth = ncaafV4MarketHealth(marketRows, boards, now);
  phase.marketMatchingMs = performance.now() - matchingStartedAt;
  phase.responseSerializationMs = performance.now() - startedAt - Object.values(phase).reduce((sum, value) => sum + value, 0);
  return { date, generatedAt: now.toISOString(), model: { id: NCAAF_V4_EXPECTED_SCORE_ID, ...NCAAF_V4_GAME_DAY_STATUS, configurationHash: NCAAF_V4_CANONICAL_BASELINE_D.configurationHash, parameterHash: NCAAF_V4_CANONICAL_BASELINE_D.parameterHash }, evidencePersistence: `append-only prospective prediction ledger; attempted ${persisted} deterministic inserts`, board: boards, exclusions: bridge.exclusions, audit: { ...bridge.audit, marketHealth, profiling: { phasesMs: phase, totalMs: performance.now() - startedAt, caches: { sportsForecast: { key: historyCacheKey, hit: Boolean(savedSports), createdAt: (cached(sportsOutputCache, historyCacheKey, now)?.createdAt ?? now).toISOString(), expiresAt: (cached(sportsOutputCache, historyCacheKey, now)?.expiresAt ?? now).toISOString(), featureCutoff: latestCutoff.toISOString(), invalidation: "feature cutoff/configuration/parameter/schema change or 2 minute TTL" }, market: { key: marketKey, hit: Boolean(savedMarkets), createdAt: (cached(marketCache, marketKey, now)?.createdAt ?? now).toISOString(), expiresAt: (cached(marketCache, marketKey, now)?.expiresAt ?? now).toISOString(), invalidation: "schedule identity change or 60 second TTL" } } } } };
}