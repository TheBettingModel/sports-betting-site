import { createHash } from "node:crypto";
import { assertNoNcaafMarketShapedKeys } from "./ncaafFootballIntelligenceSnapshots";
import type { NcaafChronologicalReplayRow, NcaafReplayFeatures, NcaafTeamSummary } from "./ncaafChronologicalReplay";

/** Research-only NCAAF V4 expected score challenger.  This module deliberately
 * has no database writer, publication path, market input, or NFL dependency. */
export const NCAAF_V4_EXPECTED_SCORE_ID = "tbm-ncaaf-v4-expected-score";
export const NCAAF_V4_DATASET_VERSION = "ncaaf-v4-training-foundation-v2";
export const NCAAF_V4_FEATURE_SCHEMA_VERSION = "ncaaf-chronological-team-game-v2";
export const NCAAF_V4_REPLAY_AUDIT_CHECKSUM = "19d3fc3e914968a9b7fabbd132212a524c79d065f15800bfc9a8d38397c99d48";
export const NCAAF_V4_VALIDATION_WEEKS = Object.freeze([1, 2, 3, 4, 5, 6, 7] as const);
export const NCAAF_V4_OOS_FROM_WEEK = 8;
/** Read-only fallback when a legacy V2 row has no persisted week.  This
 * predeclared 2025 week-8 kickoff boundary is part of the configuration hash. */
export const NCAAF_V4_2025_OOS_KICKOFF_BOUNDARY = "2025-10-14T00:00:00.000Z";
export const NCAAF_V4_CONFIGURATION = Object.freeze({
  family: "validation-selected-linear-score-v1",
  candidates: Object.freeze([0, 4, 8]),
  shrinkageGames: 4,
  distribution: "normal-margin-total-v1",
});
type Targets = { homePoints?: number; awayPoints?: number; homeWin: 0 | 1; homeMargin: number; totalPoints: number };
export type V4LineageOrigin = Readonly<{
  gameId: string | null;
  season: number;
  effectiveAt: string | null;
}>;
export type V4Row = Pick<NcaafChronologicalReplayRow, "stableGameId" | "season" | "kickoffAt" | "features" | "checksum"> & {
  week: number | null;
  targets: Targets;
  lineageOrigins?: Readonly<Record<string, V4LineageOrigin>>;
  sourceAudit: Readonly<Record<string, unknown>>;
};
const canonical = (x: unknown): unknown => Array.isArray(x) ? x.map(canonical) : x && typeof x === "object"
  ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : x;
const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(canonical(x))).digest("hex");
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
/** V2's immutable margin/total labels exactly reconstruct integer scores.
 * Retaining that projection avoids rewriting checksum-bound historical rows. */
function scores(t: Targets) {
  const home = t.homePoints ?? (t.totalPoints + t.homeMargin) / 2;
  const away = t.awayPoints ?? (t.totalPoints - t.homeMargin) / 2;
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) throw new Error("Invalid immutable V4 score target projection");
  return { home, away };
}

export interface V4Split { training: readonly V4Row[]; validation: readonly V4Row[]; oos: readonly V4Row[]; checksum: string }
/** Strict, declared chronological split.  Missing week is a hard error rather
 * than silently assigning a game to a favorable cohort. */
export function splitNcaafV4Chronologically(rows: readonly V4Row[]): V4Split {
  const ordered = [...rows].sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.stableGameId.localeCompare(b.stableGameId));
  for (const row of ordered) if (row.week != null && (!Number.isInteger(row.week) || row.week < 1)) throw new Error(`V4 requires declared positive week: ${row.stableGameId}`);
  const isOos = (r: V4Row) => r.week == null ? r.kickoffAt >= NCAAF_V4_2025_OOS_KICKOFF_BOUNDARY : r.week >= NCAAF_V4_OOS_FROM_WEEK;
  const training = ordered.filter(r => r.season === 2023 || r.season === 2024);
  const validation = ordered.filter(r => r.season === 2025 && !isOos(r));
  const oos = ordered.filter(r => r.season === 2025 && isOos(r));
  if (!training.length || !validation.length || !oos.length || ordered.some(r => r.season < 2023 || r.season > 2025)) throw new Error("V4 split requires only nonempty 2023-25 cohorts");
  return Object.freeze({ training: Object.freeze(training), validation: Object.freeze(validation), oos: Object.freeze(oos),
    checksum: hash({ dataset: NCAAF_V4_DATASET_VERSION, rows: ordered.map(r => r.checksum), validationWeeks: NCAAF_V4_VALIDATION_WEEKS }) });
}
export function auditNcaafV4PitAndMarket(rows: readonly V4Row[]) {
  const audit = { rows: rows.length, sameGameLeakage: 0, futureGameLeakage: 0, futureSeasonLeakage: 0, postKickoffEvidence: 0, marketLeakage: 0, unresolvedLineage: 0, invalidReplayProof: 0 };
  const gamesById = new Map(rows.map((row) => [row.stableGameId, row]));
  for (const row of rows) {
    try { assertNoNcaafMarketShapedKeys(row.features, "v4.features"); } catch { audit.marketLeakage++; }
    const leakage = row.sourceAudit?.leakage as Record<string, unknown> | undefined;
    if (!row.sourceAudit
      || row.sourceAudit.featureFreeze !== "replayNcaafChronologically_before_targets"
      || row.sourceAudit.replayAuditChecksum !== NCAAF_V4_REPLAY_AUDIT_CHECKSUM
      || Number(row.sourceAudit.eligiblePitLineage) !== row.features.pitLineage.length
      || !leakage
      || Number(leakage.postKickoffPitExcluded ?? 0) !== 0
      || Number(leakage.postKickoffAvailabilityExcluded ?? 0) !== 0
      || Number(leakage.invalidPitExcluded ?? 0) !== 0) audit.invalidReplayProof++;
    const cutoff = new Date(row.kickoffAt).getTime();
    for (const item of row.features.pitLineage) {
      const origin = row.lineageOrigins?.[item.sourceId];
      if (!origin) {
        audit.unresolvedLineage++;
        continue;
      }
      if (origin.gameId === row.stableGameId) audit.sameGameLeakage++;
      const sourceGame = origin.gameId ? gamesById.get(origin.gameId) : undefined;
      if (sourceGame) {
        const sourceKickoff = new Date(sourceGame.kickoffAt).getTime();
        if (sourceKickoff >= cutoff) audit.futureGameLeakage++;
        if (sourceGame.season > row.season) audit.futureSeasonLeakage++;
      }
      if (origin.season > row.season) audit.futureSeasonLeakage++;
      if (origin.effectiveAt && new Date(origin.effectiveAt).getTime() >= cutoff) audit.futureGameLeakage++;
      if (item.effectiveAt.getTime() >= cutoff || item.capturedAt.getTime() >= cutoff) audit.postKickoffEvidence++;
      if (item.effectiveAt.getFullYear() > row.season || item.capturedAt.getFullYear() > row.season) audit.futureSeasonLeakage++;
    }
  }
  return Object.freeze(audit);
}

function state(s: NcaafTeamSummary, prior: NcaafTeamSummary, population: number, shrinkageGames: number) {
  const current = s.offensePointsPerGame; const previous = prior.offensePointsPerGame;
  const n = s.games; const w = n / (n + shrinkageGames);
  const fallback = previous ?? population;
  return { offense: w * (current ?? fallback) + (1 - w) * fallback,
    defense: w * (s.defensePointsAllowedPerGame ?? (prior.defensePointsAllowedPerGame ?? population)) + (1 - w) * (prior.defensePointsAllowedPerGame ?? population),
    games: n, missing: current == null ? 1 : 0 };
}
function vector(features: NcaafReplayFeatures, population: number) {
  const h = state(features.home.seasonToDate, features.home.priorSeason, population, NCAAF_V4_CONFIGURATION.shrinkageGames);
  const a = state(features.away.seasonToDate, features.away.priorSeason, population, NCAAF_V4_CONFIGURATION.shrinkageGames);
  // Each score gets its own offense and opposing-defense coefficient.
  return { home: [1, h.offense, a.defense, features.elo.difference / 100, features.context.homeField ? 1 : 0, h.games / 10, a.games / 10, h.missing, a.missing],
    away: [1, a.offense, h.defense, -features.elo.difference / 100, features.context.homeField ? -1 : 0, a.games / 10, h.games / 10, a.missing, h.missing], h, a };
}
function solve(a: number[][], b: number[]) { // Gauss-Jordan; dimensionality is fixed and small.
  const n = b.length; const x = a.map((r, i) => [...r, b[i]!]);
  for (let i = 0; i < n; i++) { let p = i; for (let j = i + 1; j < n; j++) if (Math.abs(x[j]![i]!) > Math.abs(x[p]![i]!)) p = j;
    [x[i], x[p]] = [x[p]!, x[i]!]; const d = x[i]![i]! || 1e-9; for (let k = i; k <= n; k++) x[i]![k]! /= d;
    for (let j = 0; j < n; j++) if (j !== i) { const f = x[j]![i]!; for (let k = i; k <= n; k++) x[j]![k]! -= f * x[i]![k]!; } }
  return x.map(r => r[n]!);
}
function fit(rows: readonly V4Row[], ridge = 0) {
  const population = mean(rows.flatMap(r => { const s = scores(r.targets); return [s.home, s.away]; })); const p = 9;
  const homeXtx = Array.from({ length: p }, () => Array(p).fill(0)), awayXtx = Array.from({ length: p }, () => Array(p).fill(0));
  const yh = Array(p).fill(0), ya = Array(p).fill(0);
  for (const row of rows) { const v = vector(row.features, population), s = scores(row.targets);
    for (const [x, y, target, xtx] of [[v.home, yh, s.home, homeXtx], [v.away, ya, s.away, awayXtx]] as const)
      for (let i = 0; i < p; i++) { y[i] += x[i]! * target; for (let j = 0; j < p; j++) xtx[i]![j] += x[i]! * x[j]!; } }
  for (let i = 1; i < p; i++) { homeXtx[i]![i]! += ridge; awayXtx[i]![i]! += ridge; }
  return { population, home: solve(homeXtx, yh), away: solve(awayXtx, ya) };
}
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);
const normalCdf = (x: number) => { const t = 1 / (1 + .2316419 * Math.abs(x)); const d = .3989423 * Math.exp(-x * x / 2); const q = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x >= 0 ? 1 - q : q; };
export const fairAmericanOdds = (probability: number) => probability <= 0 || probability >= 1 ? null : probability >= .5 ? Math.round(-100 * probability / (1 - probability)) : Math.round(100 * (1 - probability) / probability);

export interface V4Prediction { predictionId: string; gameId: string; sport: "NCAAF"; modelVersion: string; datasetVersion: string; featureSchemaVersion: string; featureCutoff: string; expectedHomePoints: number; expectedAwayPoints: number; expectedMargin: number; expectedTotal: number; homeWinProbability: number; awayWinProbability: number; scoreUncertainty: number; marginUncertainty: number; totalUncertainty: number; dataQuality: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT"; diagnostics: { currentGames: [number, number]; missingIndicators: number; configurationHash: string; parameterHash: string }; probabilityHomeCovers(line: number): number; probabilityAwayCovers(line: number): number; probabilityOver(line: number): number; probabilityUnder(line: number): number; }
export interface V4Metrics { homeMae: number; homeRmse: number; awayMae: number; awayRmse: number; marginMae: number; marginRmse: number; totalMae: number; totalRmse: number; brier: number; logLoss: number; count: number }
export function evaluateNcaafV4(predictions: readonly V4Prediction[], rows: readonly V4Row[]): V4Metrics {
  const byId = new Map(rows.map(r => [r.stableGameId, r])); const e: { h: number; a: number; m: number; t: number; p: number; y: number }[] = [];
  for (const p of predictions) { const r = byId.get(p.gameId); if (!r) throw new Error(`Prediction not in evaluation cohort: ${p.gameId}`); const s = scores(r.targets); e.push({ h: p.expectedHomePoints - s.home, a: p.expectedAwayPoints - s.away, m: p.expectedMargin - r.targets.homeMargin, t: p.expectedTotal - r.targets.totalPoints, p: p.homeWinProbability, y: r.targets.homeWin }); }
  const mae = (key: "h" | "a" | "m" | "t") => mean(e.map(x => Math.abs(x[key]))), rmse = (key: "h" | "a" | "m" | "t") => Math.sqrt(mean(e.map(x => x[key] ** 2)));
  return { homeMae: mae("h"), homeRmse: rmse("h"), awayMae: mae("a"), awayRmse: rmse("a"), marginMae: mae("m"), marginRmse: rmse("m"), totalMae: mae("t"), totalRmse: rmse("t"), brier: mean(e.map(x => (x.p - x.y) ** 2)), logLoss: mean(e.map(x => -(x.y * Math.log(clamp(x.p, 1e-12, 1 - 1e-12)) + (1 - x.y) * Math.log(clamp(1 - x.p, 1e-12, 1 - 1e-12))))), count: e.length };
}
export function ncaafV4Calibration(predictions: readonly V4Prediction[], rows: readonly V4Row[]) {
  const labels = new Map(rows.map(r => [r.stableGameId, r.targets.homeWin]));
  return [[.5,.55],[.55,.6],[.6,.65],[.65,.7],[.7,.75],[.75,.8],[.8,1.001]].map(([low, high]) => { const x = predictions.filter(p => Math.max(p.homeWinProbability, p.awayWinProbability) >= low && Math.max(p.homeWinProbability, p.awayWinProbability) < high); const predicted = mean(x.map(p => Math.max(p.homeWinProbability, p.awayWinProbability))); const observed = mean(x.map(p => p.homeWinProbability >= .5 ? labels.get(p.gameId) ?? 0 : 1 - (labels.get(p.gameId) ?? 0))); return { low, high, count: x.length, predicted: x.length ? predicted : null, observed: x.length ? observed : null, calibrationError: x.length ? Math.abs(predicted - observed) : null }; });
}
/** Predeclared, deliberately small model comparison.  It never reads OOS. */
export function compareNcaafV4Candidates(rows: readonly V4Row[]) {
  const split = splitNcaafV4Chronologically(rows);
  const evaluateParameters = (name: string, ridge: number) => {
    const p = fit(split.training, ridge); const predictions = split.validation.map(r => {
      const v = vector(r.features, p.population), hp = Math.max(0, dot(p.home, v.home)), ap = Math.max(0, dot(p.away, v.away));
      const prob = clamp(normalCdf((hp - ap) / 14), .001, .999);
      return { gameId: r.stableGameId, expectedHomePoints: hp, expectedAwayPoints: ap, expectedMargin: hp - ap, expectedTotal: hp + ap, homeWinProbability: prob } as V4Prediction;
    });
    return { name, ridge, parameters: p, validation: evaluateNcaafV4(predictions, split.validation) };
  };
  const candidates = [evaluateParameters("simple-expected-score-linear", 0), evaluateParameters("ridge-score-4", 4), evaluateParameters("ridge-score-8", 8)];
  const selected = [...candidates].sort((a, b) => a.validation.homeMae + a.validation.awayMae - b.validation.homeMae - b.validation.awayMae || a.name.localeCompare(b.name))[0]!;
  // A: global home/away scoring; B: shrunk offense/defense; C: Elo win probability;
  // D: the unregularized simple expected-score linear candidate.
  const homePop = mean(split.training.map(r => scores(r.targets).home)), awayPop = mean(split.training.map(r => scores(r.targets).away));
  const baseline = (name: string, fn: (r: V4Row) => [number, number, number]) => {
    const predictions = (cohort: readonly V4Row[]) => cohort.map(r => { const [h, a, prob] = fn(r); return { gameId: r.stableGameId, expectedHomePoints: h, expectedAwayPoints: a, expectedMargin: h - a, expectedTotal: h + a, homeWinProbability: prob } as V4Prediction; });
    return { name, validation: evaluateNcaafV4(predictions(split.validation), split.validation), oos: evaluateNcaafV4(predictions(split.oos), split.oos) };
  };
  const baselines = [
    baseline("A-historical-home-away-average", r => [homePop, awayPop, .5]),
    baseline("B-prior-offense-vs-defense", r => { const v = vector(r.features, (homePop + awayPop) / 2); return [(v.h.offense + v.a.defense) / 2, (v.a.offense + v.h.defense) / 2, .5]; }),
    baseline("C-pregame-elo-winner", r => { const p = 1 / (1 + 10 ** (-r.features.elo.difference / 400)); return [homePop, awayPop, p]; }),
    { name: "D-simple-expected-score-linear", validation: candidates[0]!.validation, oos: (() => { const p = candidates[0]!.parameters; const x = split.oos.map(r => { const v = vector(r.features, p.population), h = dot(p.home, v.home), a = dot(p.away, v.away); return { gameId: r.stableGameId, expectedHomePoints: h, expectedAwayPoints: a, expectedMargin: h - a, expectedTotal: h + a, homeWinProbability: clamp(normalCdf((h-a)/14), .001, .999) } as V4Prediction; }); return evaluateNcaafV4(x, split.oos); })() },
  ];
  return Object.freeze({ splitChecksum: split.checksum, candidates: Object.freeze(candidates.map(x => Object.freeze({ name: x.name, ridge: x.ridge, validation: x.validation }))), selected: Object.freeze({ name: selected.name, ridge: selected.ridge }), baselines: Object.freeze(baselines) });
}
export function trainNcaafV4(rows: readonly V4Row[]) {
  const split = splitNcaafV4Chronologically(rows); const selection = compareNcaafV4Candidates(rows); const parameters = fit(split.training, selection.selected.ridge);
  const residuals = split.training.map(r => { const v = vector(r.features, parameters.population); return { margin: r.targets.homeMargin - (dot(parameters.home, v.home) - dot(parameters.away, v.away)), total: r.targets.totalPoints - (dot(parameters.home, v.home) + dot(parameters.away, v.away)) }; });
  const sd = (key: "margin" | "total") => Math.sqrt(mean(residuals.map(r => r[key]! ** 2))) || 14;
  const marginSd = sd("margin"), totalSd = sd("total"), parameterHash = hash(parameters);
  const configurationHash = hash({ ...NCAAF_V4_CONFIGURATION, selected: selection.selected });
  const predict = (row: V4Row): V4Prediction => {
    assertNoNcaafMarketShapedKeys(row.features, "v4.features"); const v = vector(row.features, parameters.population);
    const hp = Math.max(0, dot(parameters.home, v.home)), ap = Math.max(0, dot(parameters.away, v.away)), margin = hp - ap, total = hp + ap;
    const uncertainty = 1 + (v.h.missing + v.a.missing) * .15 + Math.max(0, 4 - Math.min(v.h.games, v.a.games)) * .04;
    const ms = marginSd * uncertainty, ts = totalSd * uncertainty, home = clamp(normalCdf(margin / ms), .001, .999);
    const qMargin = (spread: number) => clamp(normalCdf((margin + spread) / ms), 0, 1);
    const qAwayMargin = (spread: number) => clamp(normalCdf((-margin + spread) / ms), 0, 1);
    const qTotal = (line: number) => clamp(normalCdf((total - line) / ts), 0, 1);
    const quality = v.h.games + v.a.games >= 10 && !v.h.missing && !v.a.missing ? "HIGH" : v.h.games + v.a.games >= 4 ? "MEDIUM" : v.h.games + v.a.games > 0 ? "LOW" : "INSUFFICIENT";
    return Object.freeze({ predictionId: hash([row.stableGameId, row.checksum, parameterHash]), gameId: row.stableGameId, sport: "NCAAF", modelVersion: NCAAF_V4_EXPECTED_SCORE_ID, datasetVersion: NCAAF_V4_DATASET_VERSION, featureSchemaVersion: NCAAF_V4_FEATURE_SCHEMA_VERSION, featureCutoff: row.kickoffAt, expectedHomePoints: hp, expectedAwayPoints: ap, expectedMargin: margin, expectedTotal: total, homeWinProbability: home, awayWinProbability: 1 - home, scoreUncertainty: (ms + ts) / 4, marginUncertainty: ms, totalUncertainty: ts, dataQuality: quality, diagnostics: { currentGames: [v.h.games, v.a.games] as [number, number], missingIndicators: v.h.missing + v.a.missing, configurationHash, parameterHash }, probabilityHomeCovers: qMargin, probabilityAwayCovers: qAwayMargin, probabilityOver: qTotal, probabilityUnder: (line: number) => 1 - qTotal(line) });
  };
  const validation = split.validation.map(predict), oos = split.oos.map(predict);
  const audit = auditNcaafV4PitAndMarket([...split.training, ...split.validation, ...split.oos]);
  if (Object.values(audit).some((x, i) => i > 0 && x !== 0)) throw new Error(`V4 PIT/market audit failed: ${JSON.stringify(audit)}`);
  return Object.freeze({ split, selection, parameters: Object.freeze(parameters), parameterHash, configurationHash, predict, validation, oos, validationMetrics: evaluateNcaafV4(validation, split.validation), oosMetrics: evaluateNcaafV4(oos, split.oos), calibration: ncaafV4Calibration(oos, split.oos), audit,
    immutableManifest: Object.freeze({ modelId: NCAAF_V4_EXPECTED_SCORE_ID, approval: "UNVALIDATED", champion: false, publication: false, datasetVersion: NCAAF_V4_DATASET_VERSION, splitChecksum: split.checksum, configurationHash, parameterHash, oosUntouchedDuringSelection: true, compatibility2026: "PARTIAL", generated2026Predictions: 0 }) });
}