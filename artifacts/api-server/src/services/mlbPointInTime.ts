/**
 * Research-only MLB point-in-time evidence writers.  This module never writes
 * model weights, games, published picks, results, or model predictions.
 */
import { createHash } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import {
  db, gamesTable, gameResultsTable, mlbFeatureSnapshotsTable,
  mlbForecastEvaluationsTable, mlbForecastEvidenceTable, mlbMarketSnapshotsTable,
  mlbOosCohortsTable, mlbRawProviderSnapshotsTable, mlbResearchLearningEvidenceTable,
  mlbLeagueRunEnvironmentTable, mlbStarterPregameSnapshotsTable, mlbBullpenPregameSnapshotsTable,
  mlbLineupRevisionsTable, mlbTeamOffenseOutcomesTable,
  mlbStarterOutcomesTable, mlbBullpenOutcomesTable,
  modelPredictionsTable,
} from "@workspace/db";
import type { FetchedGame } from "./espn";
import { fetchMlbResearchBoxscore, parseMlbBoxscorePitching, resolveMlbGamePk } from "./mlbBullpen";

export const MLB_PIT_QUALITY_STATES = [
  "VALID", "PARTIAL", "STALE", "MISSING", "UNAVAILABLE", "NOT_SUPPORTED",
  "NOT_APPLICABLE", "INVALID", "PROJECTED", "CONFIRMED",
] as const;
export type MlbPitQualityState = typeof MLB_PIT_QUALITY_STATES[number];

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}
export function evidenceHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
export function validPitTimestamp(value: Date, cutoff: Date, gameStart: Date): boolean {
  return Number.isFinite(value.getTime()) && value <= cutoff && cutoff < gameStart;
}
export function assertPregameEvidence(input: {
  retrievedAt: Date; effectiveAt?: Date | null; cutoff: Date; gameStart: Date;
}): void {
  if (!validPitTimestamp(input.retrievedAt, input.cutoff, input.gameStart)) {
    throw new Error("PIT evidence retrieval must be at or before cutoff, before game start");
  }
  if (input.effectiveAt && (!Number.isFinite(input.effectiveAt.getTime()) || input.effectiveAt > input.cutoff)) {
    throw new Error("PIT evidence effective time must be at or before cutoff");
  }
}
export function calculateResidual(actual: number | null | undefined, projected: number | null | undefined): number | null {
  return typeof actual === "number" && Number.isFinite(actual) && typeof projected === "number" && Number.isFinite(projected)
    ? actual - projected : null;
}
export function evaluateProbability(probability: number, homeWon: boolean, marketProbability?: number | null) {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error("Probability must be within [0, 1]");
  const outcome = homeWon ? 1 : 0;
  const clipped = Math.max(0.000001, Math.min(0.999999, probability));
  const brier = (probability - outcome) ** 2;
  const marketBrier = typeof marketProbability === "number" && Number.isFinite(marketProbability)
    ? (marketProbability - outcome) ** 2 : null;
  return { brier, logLoss: -(outcome ? Math.log(clipped) : Math.log(1 - clipped)), probabilityError: probability - outcome,
    marketBrier, brierSkill: marketBrier != null && marketBrier !== 0 ? 1 - brier / marketBrier : null };
}
export function noVig(homeOdds: number, awayOdds: number): { home: number; away: number } {
  const implied = (odds: number) => odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
  const home = implied(homeOdds); const away = implied(awayOdds); const total = home + away;
  if (!Number.isFinite(total) || total <= 0) throw new Error("Invalid market odds");
  return { home: home / total, away: away / total };
}
/** Research-market quality only; deliberately has no sports-feature consumer. */
export function classifyMlbResearchMarketQuality(input: {
  capturedAt: Date; gameStart: Date; homeOdds?: number; awayOdds?: number; sourceStale?: boolean;
}): MlbPitQualityState {
  if (!(input.capturedAt < input.gameStart) || input.homeOdds == null || input.awayOdds == null) return "UNAVAILABLE";
  if (!Number.isFinite(input.homeOdds) || !Number.isFinite(input.awayOdds) || input.homeOdds === 0 || input.awayOdds === 0) return "INVALID";
  if (input.sourceStale) return "STALE";
  const minutes = (input.gameStart.getTime() - input.capturedAt.getTime()) / 60_000;
  return minutes <= 30 ? "VALID" : minutes <= 120 ? "PARTIAL" : "STALE";
}
export function calculateClv(predictionOdds: number, closingOdds: number, selectionProbabilityAtClose: number): {
  priceClv: number; probabilityClv: number;
} {
  const implied = (odds: number) => odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
  return { priceClv: implied(closingOdds) - implied(predictionOdds), probabilityClv: selectionProbabilityAtClose - implied(predictionOdds) };
}
export function selectLatestEligibleMlbClosing<T extends {
  capturedAt: Date; price: number; isAvailable: boolean; isStale: boolean; marketStatus: string;
}>(rows: readonly T[], decisionAt: Date, gameStart: Date): T | null {
  return rows.filter((row) => row.isAvailable && !row.isStale && row.marketStatus === "open"
    && row.capturedAt >= decisionAt && row.capturedAt < gameStart && Number.isFinite(row.price))
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())[0] ?? null;
}

export interface CompletedMlbGame { completedAt: Date; homeRuns: number; awayRuns: number }
/** Pure, chronology-safe ledger. A game is included only when it completed before cutoff. */
export function buildLeagueRunEnvironment(games: readonly CompletedMlbGame[], cutoff: Date, window: "season_to_date" | "last_7d" | "last_14d" | "last_30d") {
  const days = window === "season_to_date" ? null : Number(window.slice(5, -1));
  const lower = days == null ? null : new Date(cutoff.getTime() - days * 86400000);
  const selected = games.filter((game) => game.completedAt < cutoff && (!lower || game.completedAt >= lower));
  const count = selected.length;
  const home = selected.reduce((sum, game) => sum + game.homeRuns, 0);
  const away = selected.reduce((sum, game) => sum + game.awayRuns, 0);
  return {
    window, cutoff: cutoff.toISOString(), sampleGames: count,
    runsPerTeamGame: count ? (home + away) / (2 * count) : null,
    homeRunsPerGame: count ? home / count : null, awayRunsPerGame: count ? away / count : null,
    inputHash: evidenceHash(selected.map((g) => [g.completedAt.toISOString(), g.homeRuns, g.awayRuns])),
  };
}
export async function persistLeagueRunEnvironment(gameId: string, season: number, cutoff: Date): Promise<void> {
  const rows = await db.select({ gradedAt: gameResultsTable.gradedAt, home: gameResultsTable.homeScore, away: gameResultsTable.awayScore })
    .from(gameResultsTable).innerJoin(gamesTable, eq(gamesTable.id, gameResultsTable.gameId))
    .where(and(eq(gamesTable.sport, "MLB"), lt(gameResultsTable.gradedAt, cutoff)));
  for (const window of ["season_to_date", "last_7d", "last_14d", "last_30d"] as const) {
    const ledger = buildLeagueRunEnvironment(rows.map((r) => ({ completedAt: r.gradedAt, homeRuns: r.home, awayRuns: r.away })), cutoff, window);
    await db.insert(mlbLeagueRunEnvironmentTable).values({
      schemaVersion: "mlb-pit-v1", season, targetGameId: gameId, cutoffAt: cutoff, window, sampleGames: ledger.sampleGames,
      runsPerTeamGame: ledger.runsPerTeamGame, homeRunsPerGame: ledger.homeRunsPerGame, awayRunsPerGame: ledger.awayRunsPerGame,
      homeRunsPerTeamGame: null, qualityState: ledger.sampleGames ? "VALID" : "UNAVAILABLE", inputHash: ledger.inputHash,
    }).onConflictDoNothing();
  }
}

/** Deduplicated raw source retention; failures are evidence, never fabricated data. */
export async function captureMlbRawSnapshot(input: {
  provider: string; providerEventId: string; gameId?: string; payload: unknown; retrievedAt: Date;
  effectiveAt?: Date | null; qualityState: MlbPitQualityState; providerRecordId?: string; providerError?: string | null;
}): Promise<void> {
  const payloadHash = evidenceHash(input.payload);
  await db.insert(mlbRawProviderSnapshotsTable).values({
    ...input, gameId: input.gameId ?? null, effectiveAt: input.effectiveAt ?? null,
    providerRecordId: input.providerRecordId ?? null, providerError: input.providerError ?? null, payloadHash,
  }).onConflictDoNothing();
}

/** Atomically idempotent canonical revision writer; final state is blocked post-start. */
export async function captureMlbFeatureRevision(input: {
  gameId: string; gameStart: Date; cutoff: Date; revisionKey: string; revisionState: "EARLY" | "UPDATED" | "FINAL_PREGAME";
  features: Record<string, unknown>; quality: Record<string, unknown>; completenessPct: number; rawPayloadHashes: Record<string, string>;
}): Promise<number | null> {
  assertPregameEvidence({ retrievedAt: input.cutoff, cutoff: input.cutoff, gameStart: input.gameStart });
  if (!Number.isFinite(input.completenessPct) || input.completenessPct < 0 || input.completenessPct > 100) throw new Error("Invalid completeness");
  const inputHash = evidenceHash({ features: input.features, quality: input.quality, rawPayloadHashes: input.rawPayloadHashes });
  const [row] = await db.insert(mlbFeatureSnapshotsTable).values({
    schemaVersion: "mlb-pit-v1", gameId: input.gameId, revisionKey: input.revisionKey, revisionState: input.revisionState,
    pointInTimeCutoff: input.cutoff, gameStartTime: input.gameStart, inputHash, features: input.features,
    quality: input.quality, completenessPct: input.completenessPct, rawPayloadHashes: input.rawPayloadHashes,
  }).onConflictDoNothing().returning({ id: mlbFeatureSnapshotsTable.id });
  return row?.id ?? null;
}

/** A final freeze is a separate immutable revision; it cannot be written at/after first pitch. */
export async function freezeMlbFinalPregame(input: Omit<Parameters<typeof captureMlbFeatureRevision>[0], "revisionState">): Promise<number | null> {
  const [existing] = await db.select({ id: mlbFeatureSnapshotsTable.id }).from(mlbFeatureSnapshotsTable)
    .where(and(eq(mlbFeatureSnapshotsTable.gameId, input.gameId), eq(mlbFeatureSnapshotsTable.revisionState, "FINAL_PREGAME"))).limit(1);
  if (existing) return null;
  return captureMlbFeatureRevision({ ...input, revisionState: "FINAL_PREGAME", revisionKey: `final:${input.revisionKey}` });
}

export async function captureMlbPregameComponents(input: {
  featureSnapshotId: number; gameId: string; cutoff: Date; starters: Record<string, any>; bullpen: Record<string, any> | null;
  lineups: Record<string, any> | null; forecast?: Record<string, any>;
}): Promise<void> {
  for (const side of ["home", "away"] as const) {
    const starter = input.starters[side] ?? null;
    const starterEstimate = input.forecast?.contributions?.startingPitcher?.details?.[side === "home" ? "homeStarterEstimate" : "awayStarterEstimate"];
    await db.insert(mlbStarterPregameSnapshotsTable).values({
      featureSnapshotId: input.featureSnapshotId, gameId: input.gameId, teamSide: side,
      providerPlayerId: starter?.playerId != null ? String(starter.playerId) : null, playerName: starter?.name ?? null,
      handedness: starter?.pitchHand ?? null, confirmationState: starter ? "PROJECTED" : "UNAVAILABLE",
      metrics: starter ?? {}, projectedInnings: starterEstimate?.innings ?? null, projectedRunsAllowed: starterEstimate?.rate != null && starterEstimate?.innings != null ? starterEstimate.rate * starterEstimate.innings / 9 : null, v4StarterQuality: starterEstimate?.rate ?? null,
      retrievedAt: input.cutoff, qualityState: starter ? "VALID" : "MISSING", rawPayloadHash: null,
    }).onConflictDoNothing();
    const pen = input.bullpen?.[side] ?? null;
    await db.insert(mlbBullpenPregameSnapshotsTable).values({
      featureSnapshotId: input.featureSnapshotId, gameId: input.gameId, teamSide: side,
      weightedPitches: pen?.weightedPitches ?? null, fatigueState: pen?.fatigueLabel ?? null,
      relievers: [], unsupportedFeatures: ["reliever_quality", "xFIP", "SIERA", "xERA"], qualityState: pen ? "VALID" : "MISSING",
      retrievedAt: input.cutoff, rawPayloadHash: null,
    }).onConflictDoNothing();
    const lineup = input.lineups?.[side] ?? null;
    await db.insert(mlbLineupRevisionsTable).values({
      featureSnapshotId: input.featureSnapshotId, gameId: input.gameId, teamSide: side,
      lineupState: lineup?.confirmed ? "CONFIRMED" : lineup ? "PARTIAL" : "UNAVAILABLE",
      confirmedAt: null, lineupCompletenessPct: lineup?.batterCount ? Math.min(100, lineup.batterCount / 9 * 100) : 0,
      players: lineup?.batters ?? [], aggregateFeatures: lineup ?? {}, qualityState: lineup ? "PARTIAL" : "MISSING",
      retrievedAt: input.cutoff, effectiveAt: null, rawPayloadHash: null,
    }).onConflictDoNothing();
  }
}

export async function captureMlbDecisionMarket(input: { gameId: string; cutoff: Date; homeOdds?: number; awayOdds?: number; source?: string }): Promise<void> {
  if (input.homeOdds == null || input.awayOdds == null) return;
  const fair = noVig(input.homeOdds, input.awayOdds);
  await db.insert(mlbMarketSnapshotsTable).values({
    gameId: input.gameId, sportsbook: input.source ?? "v4_decision_market", state: "PREDICTION_TIME",
    homeOdds: input.homeOdds, awayOdds: input.awayOdds, noVigHomeProbability: fair.home, noVigAwayProbability: fair.away,
    capturedAt: input.cutoff, pointInTimeCutoff: input.cutoff, source: input.source ?? "v4", qualityState: "VALID",
    rawPayloadHash: evidenceHash(input),
  }).onConflictDoNothing();
}

/** #214 research-only late market observation. Market evidence stays isolated
 * from sports features and is accepted only before the independently supplied
 * first-pitch time. Scheduler callers may use a bounded cadence, never a loop. */
export async function captureMlbResearchMarketObservation(input: {
  gameId: string; gameStart: Date; capturedAt: Date; state:
    | "EARLY_MARKET" | "MODEL_PREDICTION_MARKET" | "T_MINUS_120" | "T_MINUS_60"
    | "T_MINUS_30" | "T_MINUS_15" | "LATEST_PRE_FIRST_PITCH" | "CLOSING";
  sportsbook: string; homeOdds?: number; awayOdds?: number; source: string; qualityState?: MlbPitQualityState;
}): Promise<void> {
  if (!(input.capturedAt < input.gameStart)) throw new Error("market observation must precede first pitch");
  if (input.homeOdds == null || input.awayOdds == null) return;
  const fair = noVig(input.homeOdds, input.awayOdds);
  await db.insert(mlbMarketSnapshotsTable).values({
    gameId: input.gameId, sportsbook: input.sportsbook, state: input.state,
    homeOdds: input.homeOdds, awayOdds: input.awayOdds, noVigHomeProbability: fair.home, noVigAwayProbability: fair.away,
    capturedAt: input.capturedAt, pointInTimeCutoff: input.capturedAt, source: input.source,
    qualityState: input.qualityState ?? classifyMlbResearchMarketQuality(input), rawPayloadHash: evidenceHash(input),
  }).onConflictDoNothing();
}

/** Links only a stored V4 shadow forecast to its exact canonical evidence. */
export async function linkMlbV4Forecast(input: {
  predictionId: number; gameId: string; featureSnapshotId: number; cutoff: Date; modelVersion: string;
  configHash: string; forecast: Record<string, unknown>; contributions: Record<string, unknown>;
  dataQuality?: number; uncertainty?: number; cohort?: string;
}): Promise<number | null> {
  const [row] = await db.insert(mlbForecastEvidenceTable).values({
    ...input, modelId: "tbm-mlb-moneyline-v4", calibrationVersion: "mlb-v4-calibration-unfitted-v1",
    pointInTimeCutoff: input.cutoff,
    cohort: input.cohort ?? "LIVE_SHADOW", dataQuality: input.dataQuality ?? null, uncertainty: input.uncertainty ?? null,
  }).onConflictDoNothing().returning({ id: mlbForecastEvidenceTable.id });
  return row?.id ?? null;
}

/** Cohorts are append-only; callers must explicitly choose a rule, never infer legacy history. */
export async function assignMlbCohort(gameId: string, cohort: "DEVELOPMENT" | "VALIDATION" | "UNTOUCHED_OOS" | "LIVE_SHADOW", reason: string): Promise<void> {
  await db.insert(mlbOosCohortsTable).values({
    gameId, cohort, assignmentReason: reason, assignedAt: new Date(), immutable: true,
  }).onConflictDoNothing();
}

/** Outcome writer accepts only provider-parsed boxscore values; null stays null. */
export async function persistMlbPitchingOutcomes(input: {
  gameId: string; teamSide: "home" | "away"; starter: Record<string, any> | null; bullpen: Record<string, any>[];
  source: string; rawPayload: unknown; projectedInnings?: number | null; projectedRunsAllowed?: number | null;
}): Promise<void> {
  const hash = evidenceHash(input.rawPayload); const now = new Date();
  const starter = input.starter;
  await db.insert(mlbStarterOutcomesTable).values({
    gameId: input.gameId, teamSide: input.teamSide, providerPlayerId: starter?.playerId != null ? String(starter.playerId) : null,
    playerName: starter?.name ?? null, inningsPitched: starter?.inningsPitched ?? null, battersFaced: starter?.battersFaced ?? null,
    pitchCount: starter?.pitchCount ?? null, runsAllowed: starter?.runsAllowed ?? null, earnedRuns: starter?.earnedRuns ?? null,
    hits: starter?.hits ?? null, walks: starter?.walks ?? null, strikeouts: starter?.strikeouts ?? null, homeRunsAllowed: starter?.homeRunsAllowed ?? null,
    projectedInnings: input.projectedInnings ?? null, projectedRunsAllowed: input.projectedRunsAllowed ?? null,
    inningsResidual: calculateResidual(starter?.inningsPitched, input.projectedInnings), runsResidual: calculateResidual(starter?.runsAllowed, input.projectedRunsAllowed),
    source: input.source, qualityState: starter ? "VALID" : "UNAVAILABLE", rawPayloadHash: hash, capturedAt: now,
  }).onConflictDoNothing();
  const sum = (key: string) => input.bullpen.length && input.bullpen.every((p) => typeof p[key] === "number")
    ? input.bullpen.reduce((total, p) => total + p[key], 0) : null;
  await db.insert(mlbBullpenOutcomesTable).values({
    gameId: input.gameId, teamSide: input.teamSide, inningsPitched: sum("inningsPitched"), runsAllowed: sum("runsAllowed"),
    earnedRuns: sum("earnedRuns"), hits: sum("hits"), walks: sum("walks"), strikeouts: sum("strikeouts"), homeRunsAllowed: sum("homeRunsAllowed"),
    pitchCount: sum("pitchCount"), relievers: input.bullpen, projectedInnings: null, projectedRunsAllowed: null,
    inningsResidual: null, runsResidual: null, source: input.source, qualityState: input.bullpen.length ? "VALID" : "UNAVAILABLE",
    rawPayloadHash: hash, capturedAt: now,
  }).onConflictDoNothing();
}

/** Bounded completed-game provider capture; identity failures are retained as raw failure evidence. */
export async function captureCompletedMlbBoxscore(game: FetchedGame): Promise<void> {
  const resolved = await resolveMlbGamePk({
    gameDate: game.gameDate, homeAbbr: game.homeTeamAbbr, awayAbbr: game.awayTeamAbbr, startsAt: new Date(game.commenceTimeISO),
    homeTeamId: game.homeTeamId ?? null, awayTeamId: game.awayTeamId ?? null,
  });
  if (resolved.state !== "VALID") {
    await captureMlbRawSnapshot({ provider: "mlb_stats_api", providerEventId: game.espnId, gameId: game.espnId,
      payload: { reason: resolved.reason }, retrievedAt: new Date(), qualityState: "UNAVAILABLE", providerError: resolved.reason });
    return;
  }
  const result = await fetchMlbResearchBoxscore(resolved.gamePk);
  if (!result.boxscore) {
    await captureMlbRawSnapshot({ provider: "mlb_stats_api", providerEventId: String(resolved.gamePk), gameId: game.espnId,
      payload: { reason: result.error }, retrievedAt: new Date(), qualityState: "UNAVAILABLE", providerError: result.error });
    return;
  }
  await captureMlbRawSnapshot({ provider: "mlb_stats_api", providerEventId: String(resolved.gamePk), gameId: game.espnId,
    payload: result.boxscore, retrievedAt: new Date(), qualityState: "VALID" });
  for (const side of ["home", "away"] as const) {
    const parsed = parseMlbBoxscorePitching(result.boxscore.teams?.[side]);
    // Only use the exact feature snapshot linked to the forecast evidence,
    // never a latest-by-game pregame revision.
    const [linked] = await db.select({ featureSnapshotId: mlbForecastEvidenceTable.featureSnapshotId })
      .from(mlbForecastEvidenceTable).where(eq(mlbForecastEvidenceTable.gameId, game.espnId))
      .orderBy(mlbForecastEvidenceTable.id).limit(1);
    const [starterProjection] = linked ? await db.select({
      innings: mlbStarterPregameSnapshotsTable.projectedInnings, runs: mlbStarterPregameSnapshotsTable.projectedRunsAllowed,
    }).from(mlbStarterPregameSnapshotsTable).where(and(
      eq(mlbStarterPregameSnapshotsTable.featureSnapshotId, linked.featureSnapshotId),
      eq(mlbStarterPregameSnapshotsTable.teamSide, side),
    )).limit(1) : [];
    await persistMlbPitchingOutcomes({ gameId: game.espnId, teamSide: side, starter: parsed.starter, bullpen: parsed.bullpen,
      source: "mlb_stats_api", rawPayload: result.boxscore, projectedInnings: starterProjection?.innings ?? null,
      projectedRunsAllowed: starterProjection?.runs ?? null });
  }
}

/** Final outcome evaluator: reads final result and immutable forecast evidence only. */
export async function evaluateMlbForecastEvidence(forecastEvidenceId: number): Promise<void> {
  const [row] = await db.select({
    gameId: mlbForecastEvidenceTable.gameId, forecast: mlbForecastEvidenceTable.forecast,
    homeScore: gameResultsTable.homeScore, awayScore: gameResultsTable.awayScore,
    featureSnapshotId: mlbForecastEvidenceTable.featureSnapshotId, decisionAt: modelPredictionsTable.predictionTimestamp,
    decisionOdds: modelPredictionsTable.odds,
  }).from(mlbForecastEvidenceTable).innerJoin(gameResultsTable, eq(gameResultsTable.gameId, mlbForecastEvidenceTable.gameId))
    .leftJoin(modelPredictionsTable, eq(modelPredictionsTable.id, mlbForecastEvidenceTable.predictionId))
    .where(eq(mlbForecastEvidenceTable.id, forecastEvidenceId)).limit(1);
  if (!row) return;
  const outcomeHash = evidenceHash({ gameId: row.gameId, home: row.homeScore, away: row.awayScore, source: "game_results" });
  for (const [teamSide, runs] of [["home", row.homeScore], ["away", row.awayScore]] as const) {
    await db.insert(mlbTeamOffenseOutcomesTable).values({
      gameId: row.gameId, teamSide, runs, source: "game_results", qualityState: "PARTIAL",
      rawPayloadHash: outcomeHash, capturedAt: new Date(),
    }).onConflictDoNothing();
  }
  const forecast = row.forecast as Record<string, any>;
  const home = forecast?.expectedRuns?.home; const away = forecast?.expectedRuns?.away;
  const probability = forecast?.probability?.calibratedHome;
  if (![home, away, probability].every((v) => typeof v === "number" && Number.isFinite(v))) return;
  const [feature] = await db.select({ start: mlbFeatureSnapshotsTable.gameStartTime }).from(mlbFeatureSnapshotsTable)
    .where(eq(mlbFeatureSnapshotsTable.id, row.featureSnapshotId)).limit(1);
  const close = feature && row.decisionAt ? selectLatestEligibleMlbClosing(
    await db.select().from(mlbMarketSnapshotsTable).where(eq(mlbMarketSnapshotsTable.gameId, row.gameId))
      .then((rows) => rows.filter((market) => market.state !== "PREDICTION_TIME").map((market) => ({
        capturedAt: market.capturedAt, price: market.homeOdds ?? Number.NaN, isAvailable: market.homeOdds != null && market.awayOdds != null,
        isStale: market.qualityState === "STALE", marketStatus: "open", market,
      }))),
    row.decisionAt, feature.start,
  ) : null;
  const closeMarket = close?.market ?? null;
  const metrics = evaluateProbability(probability, row.homeScore > row.awayScore, closeMarket?.noVigHomeProbability ?? null);
  const residuals = { home: calculateResidual(row.homeScore, home), away: calculateResidual(row.awayScore, away),
    total: calculateResidual(row.homeScore + row.awayScore, home + away), margin: calculateResidual(row.homeScore - row.awayScore, home - away) };
  const [evaluation] = await db.insert(mlbForecastEvaluationsTable).values({
    forecastEvidenceId, gameId: row.gameId, outcome: { homeRuns: row.homeScore, awayRuns: row.awayScore, homeWon: row.homeScore > row.awayScore },
    residuals, brierScore: metrics.brier, logLoss: metrics.logLoss, probabilityError: metrics.probabilityError,
    marketBrierScore: metrics.marketBrier, brierSkill: metrics.brierSkill, calibrationBucket: `${Math.floor(probability * 10) * 10}-${Math.floor(probability * 10) * 10 + 9}`,
    marketEvaluation: closeMarket ? {
      decisionOdds: row.decisionOdds, closingHomeOdds: closeMarket.homeOdds, closingAwayOdds: closeMarket.awayOdds,
      closingAt: closeMarket.capturedAt.toISOString(), source: closeMarket.source,
      clv: row.decisionOdds != null ? calculateClv(row.decisionOdds, closeMarket.homeOdds!, closeMarket.noVigHomeProbability!).priceClv : null,
    } : { exclusionReason: "eligible_prestart_close_missing" }, evaluatedAt: new Date(),
  }).onConflictDoNothing().returning({ id: mlbForecastEvaluationsTable.id });
  if (evaluation) await db.insert(mlbResearchLearningEvidenceTable).values({
    forecastEvidenceId, evaluationId: evaluation.id, gameId: row.gameId, cohort: "LIVE_SHADOW",
    evidence: { residuals, metrics }, isolationState: "RESEARCH_ONLY",
  }).onConflictDoNothing();
}

export const MLB_FEATURE_STATUS = [
  ["fip", "ACTIVE", "Existing V4 starter input."], ["confirmed_lineup_ops", "ACTIVE", "Existing V4 input when provider confirms."],
  ["league_pit_run_environment", "CAPTURED_RESEARCH_ONLY", "Captured separately; not fed to V4."],
  ["travel", "AVAILABLE_NOT_USED", "Context only."], ["xera", "NOT_SUPPORTED", "No advanced provider integration."],
  ["statcast_barrel_pct", "NOT_SUPPORTED", "No Statcast integration."], ["oaa", "NOT_SUPPORTED", "No defensive feed."],
  ["advanced_pitcher_conventional", "CAPTURED_RESEARCH_ONLY", "Provider-neutral #214 evidence; no current model usage."],
  ["advanced_hitter_conventional", "CAPTURED_RESEARCH_ONLY", "Requires mapped MLB player ID and PIT timestamps."],
  ["advanced_hitter_platoon", "CAPTURED_RESEARCH_ONLY", "Provider-supported splits only; sample size retained."],
  ["advanced_lineup_aggregate", "CAPTURED_RESEARCH_ONLY", "Mapped player/order weighted research aggregate only."],
  ["advanced_bullpen_availability", "CAPTURED_RESEARCH_ONLY", "Objective pre-cutoff appearance usage; quality remains separate."],
  ["advanced_park_weather_context", "CAPTURED_RESEARCH_ONLY", "Captured context only; no new run adjustment."],
  ["advanced_pitch_repertoire", "PLANNED", "Requires an approved PIT-auditable provider adapter."],
  ["advanced_pitch_type_matchup", "NOT_SUPPORTED", "No approved provider-supported pitch-type hitter feed."],
  ["advanced_defense_drs_oaa", "NOT_SUPPORTED", "No approved defensive advanced metric provider."],
  ["advanced_baserunning_runs", "NOT_SUPPORTED", "No approved baserunning-runs provider."],
  ["advanced_umpire_effects", "NOT_SUPPORTED", "No reliable pregame PIT assignment/metric provider."],
] as const;
