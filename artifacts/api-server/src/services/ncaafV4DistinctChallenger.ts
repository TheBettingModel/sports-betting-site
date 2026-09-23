import { createHash } from "node:crypto";
import { assertNoNcaafMarketShapedKeys } from "./ncaafFootballIntelligenceSnapshots";
import { auditNcaafV4PitAndMarket, evaluateNcaafV4, splitNcaafV4Chronologically, type V4Metrics, type V4Prediction, type V4Row } from "./ncaafV4ExpectedScore";
import type { NcaafReplayFeatures, NcaafTeamSummary } from "./ncaafChronologicalReplay";

/** #222B is deliberately isolated from the V4 champion and registry. */
export const NCAAF_V4_DISTINCT_CHALLENGER_ID = "tbm-ncaaf-v4-distinct-expanded-ridge-huber";
export const NCAAF_V4_DISTINCT_CONFIGURATION = Object.freeze({
  featureSchema: "ncaaf-chronological-team-game-v2-expanded-pit-safe",
  shrinkageGrid: Object.freeze([2, 4, 8]),
  ridgeGrid: Object.freeze([12, 36]),
  families: Object.freeze(["expanded-ridge", "expanded-huber-irls"]),
  selection: "validation: marginMae, brier, logLoss; then totalMae; deterministic-name",
  calibration: "validation-fitted-platt-or-identity",
  bootstrapReplicates: 1000,
});

/** Immutable Baseline D reconciliation.  The table used fixed sigma=14 while
 * final V4 used training-RMSE uncertainty plus missing/sample inflation. */
export const NCAAF_V4_CANONICAL_BASELINE_D = Object.freeze({
  artifact: "reports/ncaaf-v4-expected-score-engine-2026-09-04-v5.json",
  definition: "D-simple-expected-score-linear; unregularized 9-feature score regressions",
  trainingData: Object.freeze({ datasetVersion: "ncaaf-v4-training-foundation-v2", featureSchemaVersion: "ncaaf-chronological-team-game-v2", trainingSeasons: [2023, 2024], trainingRows: 1590, validation: "2025 weeks 1-7", validationRows: 398, oos: "2025 week 8+", oosRows: 410, splitChecksum: "7cee52d5188179d81a177aa55b9ac54e06211f11ed8a5b0d29b032ff94095abc" }),
  features: Object.freeze(["intercept", "own shrunk season offense", "opponent shrunk season defense", "signed pregame Elo difference / 100", "home-field indicator", "own games / 10", "opponent games / 10", "own offense missing indicator", "opponent offense missing indicator"]),
  configurationHash: "212a6c78431a181821106721877155745724d3619ec63cf5424f098b07f9ae86",
  parameterHash: "792ba805aaa666cfc23b4d304dfca3f6fab4194535c7909eab2cfb1041288d81",
  parameters: Object.freeze({ population: 26.75377358490566, home: [-11.284640418764887, .7065291857711262, .6770761047168204, 3.238166931711907, 2.857558473807069, 1.5562489683604726, -1.141354401811279, 2.765905815639973, .2379189460597022], away: [-6.390629393488659, .5580070209466887, .6579598163903937, 3.614514496162292, 1.0437802354578911, -2.579561874362595, 2.965556586994427, -1.6553424913644657, -3.259891712038205] }),
  validation: Object.freeze({ homeMae: 10.287789973117736, homeRmse: 12.874284947623016, awayMae: 8.978018169051618, awayRmse: 11.054095929130463, marginMae: 13.83860742671156, marginRmse: 17.73646710672768, totalMae: 12.883931882198755, totalRmse: 16.16472189732905, brier: .19456976319930142, logLoss: .5680802771897671, count: 398 }),
  probabilityReconciliation: "baseline table fixed normal margin sigma=14; final V4 derives training margin RMSE and applies declared sample/missing uncertainty multiplier",
  oos: Object.freeze({ homeMae: 9.282625676397423, awayMae: 8.498563584442126, marginMae: 12.500839176319078, totalMae: 12.939009077926592, brier: .18002337158123566, logLoss: .534791746210304, count: 410 }),
  tableProbabilityMetrics: Object.freeze({ brier: .17828391985262818, logLoss: .5279580658139891 }),
});
export const NCAAF_V4_DISTINCT_STABILITY_GATE = Object.freeze({ minimumRowsPerEligibleBucket: 20, maximumEligibleMarginMaeRange: 10, maximumEligibleBrierRange: .15, requiredDimensions: ["week", "earlyLater", "site", "dataQuality", "probabilityBand", "sampleCountBand"], rule: "Every dimension needs at least two eligible >=20-row buckets; eligible margin-MAE and Brier ranges must not exceed declared maxima. Smaller buckets are reported but not evidence." });

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const normalCdf = (x: number) => { const t = 1 / (1 + .2316419 * Math.abs(x)), d = .3989423 * Math.exp(-x * x / 2), q = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x >= 0 ? 1 - q : q; };
const solve = (a: number[][], b: number[]) => { const n = b.length, x = a.map((r, i) => [...r, b[i]!]); for (let i = 0; i < n; i++) { let pivot = i; for (let j = i + 1; j < n; j++) if (Math.abs(x[j]![i]!) > Math.abs(x[pivot]![i]!)) pivot = j; [x[i], x[pivot]] = [x[pivot]!, x[i]!]; const d = x[i]![i]! || 1e-9; for (let k = i; k <= n; k++) x[i]![k]! /= d; for (let j = 0; j < n; j++) if (j !== i) { const f = x[j]![i]!; for (let k = i; k <= n; k++) x[j]![k]! -= f * x[i]![k]!; } } return x.map(r => r[n]!); };
const targetScores = (r: V4Row) => ({ home: r.targets.homePoints ?? (r.targets.totalPoints + r.targets.homeMargin) / 2, away: r.targets.awayPoints ?? (r.targets.totalPoints - r.targets.homeMargin) / 2 });

function summary(s: NcaafTeamSummary, prior: NcaafTeamSummary, population: number, k: number) {
  const n = s.games, w = n / (n + k), offFallback = prior.offensePointsPerGame ?? population, defFallback = prior.defensePointsAllowedPerGame ?? population;
  return { off: w * (s.offensePointsPerGame ?? offFallback) + (1 - w) * offFallback, def: w * (s.defensePointsAllowedPerGame ?? defFallback) + (1 - w) * defFallback, n, missing: s.offensePointsPerGame == null || s.defensePointsAllowedPerGame == null ? 1 : 0 };
}
function expanded(features: NcaafReplayFeatures, population: number, k: number, home: boolean) {
  const own = home ? features.home : features.away, opp = home ? features.away : features.home;
  const s = summary(own.seasonToDate, own.priorSeason, population, k), o = summary(opp.seasonToDate, opp.priorSeason, population, k);
  const recent = (x: typeof own) => summary(x.last3, x.priorSeason, population, k);
  const r3 = recent(own), r5 = summary(own.last5, own.priorSeason, population, k);
  const adj = summary(own.opponentAdjusted, own.priorSeason, 0, k);
  const elo = (home ? features.elo.difference : -features.elo.difference) / 100;
  const field = features.context.homeField ? (home ? 1 : -1) : 0;
  // Named, prospectively reconstructable families: season/recent/trend/prior,
  // opponent adjustment, Elo/context, sample/missing and two matchup interactions.
  return [1, s.off, o.def, r3.off, r5.off, r3.off - s.off, r3.def - s.def,
    own.priorSeason.offensePointsPerGame ?? population, own.priorSeason.defensePointsAllowedPerGame ?? population,
    adj.off, adj.def, elo, field, s.n / 10, o.n / 10, s.missing, o.missing,
    (s.off - population) * (o.def - population) / 100, (s.off - o.off) / 10,
    Math.min(s.n, o.n) < 3 ? 1 : 0];
}
type Parameters = { population: number; means: number[]; scales: number[]; home: number[]; away: number[]; marginSd: number };
function design(rows: readonly V4Row[], population: number, k: number, home: boolean) { return rows.map(r => expanded(r.features, population, k, home)); }
function fitWeighted(x: number[][], y: number[], ridge: number, weights?: number[]) {
  const p = x[0]!.length, a = Array.from({ length: p }, () => Array(p).fill(0)), b = Array(p).fill(0);
  for (let r = 0; r < x.length; r++) { const w = weights?.[r] ?? 1; for (let i = 0; i < p; i++) { b[i] += w * x[r]![i]! * y[r]!; for (let j = 0; j < p; j++) a[i]![j]! += w * x[r]![i]! * x[r]![j]!; } }
  for (let i = 1; i < p; i++) a[i]![i]! += ridge;
  return solve(a, b);
}
function fit(rows: readonly V4Row[], k: number, ridge: number, huber: boolean): Parameters {
  const population = mean(rows.flatMap(r => { const t = targetScores(r); return [t.home, t.away]; })), rawH = design(rows, population, k, true), rawA = design(rows, population, k, false);
  const means = rawH[0]!.map((_, i) => i ? mean([...rawH, ...rawA].map(x => x[i]!)) : 0);
  const scales = means.map((m, i) => i ? Math.max(.1, Math.sqrt(mean([...rawH, ...rawA].map(x => (x[i]! - m) ** 2))) ) : 1);
  const norm = (x: number[]) => x.map((v, i) => i ? (v - means[i]!) / scales[i]! : v);
  const xh = rawH.map(norm), xa = rawA.map(norm), yh = rows.map(r => targetScores(r).home), ya = rows.map(r => targetScores(r).away);
  const robust = (x: number[][], y: number[]) => { let beta = fitWeighted(x, y, ridge); if (huber) for (let i = 0; i < 8; i++) { const residual = y.map((v, j) => v - dot(beta, x[j]!)), scale = Math.max(1, 1.4826 * mean(residual.map(v => Math.abs(v)))); beta = fitWeighted(x, y, ridge, residual.map(v => Math.min(1, 1.5 * scale / Math.max(Math.abs(v), 1e-9)))); } return beta; };
  const home = robust(xh, yh), away = robust(xa, ya);
  const errors = rows.map((r, i) => r.targets.homeMargin - (dot(home, xh[i]!) - dot(away, xa[i]!)));
  return { population, means, scales, home, away, marginSd: Math.max(1, Math.sqrt(mean(errors.map(e => e * e)))) };
}
function predict(params: Parameters, row: V4Row, k: number): V4Prediction {
  assertNoNcaafMarketShapedKeys(row.features, "ncaaf-v4-distinct.features");
  const norm = (x: number[]) => x.map((v, i) => i ? (v - params.means[i]!) / params.scales[i]! : v);
  const h = norm(expanded(row.features, params.population, k, true)), a = norm(expanded(row.features, params.population, k, false));
  const hp = Math.max(0, dot(params.home, h)), ap = Math.max(0, dot(params.away, a),), margin = hp - ap;
  const sample = Math.min(row.features.home.seasonToDate.games, row.features.away.seasonToDate.games);
  const sd = params.marginSd * (sample < 3 ? 1.12 : 1);
  const probability = clamp(normalCdf(margin / sd), .001, .999);
  return { gameId: row.stableGameId, expectedHomePoints: hp, expectedAwayPoints: ap, expectedMargin: margin, expectedTotal: hp + ap, homeWinProbability: probability, awayWinProbability: 1 - probability, marginUncertainty: sd } as V4Prediction;
}
export type DistinctCandidate = { name: string; family: "expanded-ridge" | "expanded-huber-irls"; k: number; ridge: number; validation: V4Metrics; parameters: Parameters };
const score = (m: V4Metrics) => m.marginMae * 4 + m.brier * 100 + m.logLoss * 10 + m.totalMae;
function platt(validation: readonly V4Prediction[], rows: readonly V4Row[]) {
  let a = 1, b = 0; const y = new Map(rows.map(r => [r.stableGameId, r.targets.homeWin]));
  for (let iter = 0; iter < 30; iter++) { let g0 = 0, g1 = 0, h00 = 1e-4, h01 = 0, h11 = 1e-4; for (const p of validation) { const x = Math.log(p.homeWinProbability / (1 - p.homeWinProbability)), q = 1 / (1 + Math.exp(-(a * x + b))), d = q - (y.get(p.gameId) ?? 0), w = q * (1 - q); g0 += d * x; g1 += d; h00 += w * x * x; h01 += w * x; h11 += w; } const det = h00 * h11 - h01 * h01; a -= (h11 * g0 - h01 * g1) / det; b -= (-h01 * g0 + h00 * g1) / det; } return { a, b };
}
function calibrate(predictions: readonly V4Prediction[], p: { a: number; b: number }) { return predictions.map(x => { const logit = Math.log(x.homeWinProbability / (1 - x.homeWinProbability)), home = clamp(1 / (1 + Math.exp(-(p.a * logit + p.b))), .001, .999); return { ...x, homeWinProbability: home, awayWinProbability: 1 - home } as V4Prediction; }); }
function deltas(metrics: V4Metrics) { return Object.fromEntries(["homeMae", "awayMae", "marginMae", "totalMae", "brier", "logLoss"].map(key => { const b = NCAAF_V4_CANONICAL_BASELINE_D.oos[key as keyof typeof NCAAF_V4_CANONICAL_BASELINE_D.oos] as number, value = metrics[key as keyof V4Metrics] as number; return [key, { absolute: value - b, percent: (value - b) / b * 100 }]; })); }
/** Deterministic paired bootstrap over OOS game errors, never used in selection. */
export function pairedBootstrapClassification(challenger: readonly V4Prediction[], baseline: readonly V4Prediction[], rows: readonly V4Row[], replicates = 1000) {
  const labels = new Map(rows.map(r => [r.stableGameId, r.targets])); const by = new Map(baseline.map(p => [p.gameId, p]));
  let seed = 0x222b; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const diffs = challenger.map(c => { const r = labels.get(c.gameId)!, b = by.get(c.gameId)!; return Math.abs(c.expectedMargin - r.homeMargin) - Math.abs(b.expectedMargin - r.homeMargin); });
  let wins = 0; for (let i = 0; i < replicates; i++) if (mean(diffs.map(() => diffs[Math.floor(rand() * diffs.length)]!)) < 0) wins++;
  const probabilityImproves = wins / replicates;
  return Object.freeze({ replicates, probabilityImproves, classification: probabilityImproves >= .975 ? "ROBUST" : probabilityImproves >= .75 ? "PROMISING" : probabilityImproves >= .4 ? "INCONCLUSIVE" : "NEGATIVE" });
}
/** Validation-only stability diagnostic for the frozen validation winner. */
export function analyzeNcaafV4DistinctValidationStability(predictions: readonly V4Prediction[], rows: readonly V4Row[]) {
  const pairs = rows.map(row => ({ row, prediction: predictions.find(p => p.gameId === row.stableGameId) })).filter((x): x is { row: V4Row; prediction: V4Prediction } => x.prediction != null);
  if (pairs.length !== rows.length) throw new Error("Validation stability requires exactly one prediction per validation row");
  const quality = (r: V4Row) => { const h = r.features.home.seasonToDate, a = r.features.away.seasonToDate, n = h.games + a.games, missing = Number(h.offensePointsPerGame == null || h.defensePointsAllowedPerGame == null) + Number(a.offensePointsPerGame == null || a.defensePointsAllowedPerGame == null); return n >= 10 && !missing ? "HIGH" : n >= 4 ? "MEDIUM" : n ? "LOW" : "INSUFFICIENT"; };
  const group = (name: string, key: (x: typeof pairs[number]) => string) => { const all = new Map<string, typeof pairs>(); for (const x of pairs) { const k = key(x); all.set(k, [...(all.get(k) ?? []), x]); } const buckets = [...all].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, values]) => ({ bucket, count: values.length, metrics: evaluateNcaafV4(values.map(x => x.prediction), values.map(x => x.row)) })); const eligible = buckets.filter(x => x.count >= NCAAF_V4_DISTINCT_STABILITY_GATE.minimumRowsPerEligibleBucket), marginMaeRange = eligible.length ? Math.max(...eligible.map(x => x.metrics.marginMae)) - Math.min(...eligible.map(x => x.metrics.marginMae)) : null, brierRange = eligible.length ? Math.max(...eligible.map(x => x.metrics.brier)) - Math.min(...eligible.map(x => x.metrics.brier)) : null; return { name, buckets, eligibleBuckets: eligible.map(x => x.bucket), marginMaeRange, brierRange, pass: eligible.length >= 2 && marginMaeRange != null && brierRange != null && marginMaeRange <= NCAAF_V4_DISTINCT_STABILITY_GATE.maximumEligibleMarginMaeRange && brierRange <= NCAAF_V4_DISTINCT_STABILITY_GATE.maximumEligibleBrierRange }; };
  const band = (p: number) => p < .55 ? ".50-.55" : p < .6 ? ".55-.60" : p < .65 ? ".60-.65" : p < .7 ? ".65-.70" : p < .75 ? ".70-.75" : p < .8 ? ".75-.80" : ".80-1.00";
  const dimensions = [group("week", x => `week-${x.row.week ?? "missing"}`), group("earlyLater", x => (x.row.week ?? 99) <= 3 ? "early-weeks-1-3" : "later-weeks-4-7"), group("site", x => x.row.features.context.neutralSite ? "neutral" : "home"), group("dataQuality", x => quality(x.row)), group("probabilityBand", x => band(Math.max(x.prediction.homeWinProbability, x.prediction.awayWinProbability))), group("sampleCountBand", x => { const n = Math.min(x.row.features.home.seasonToDate.games, x.row.features.away.seasonToDate.games); return n < 3 ? "0-2" : n < 6 ? "3-5" : "6+"; })];
  return Object.freeze({ gate: NCAAF_V4_DISTINCT_STABILITY_GATE, dimensions, pass: dimensions.every(x => x.pass) });
}
export function trainNcaafV4DistinctChallenger(rows: readonly V4Row[]) {
  const audit = auditNcaafV4PitAndMarket(rows);
  if (Object.values(audit).some((v, i) => i > 0 && v !== 0)) throw new Error(`Distinct challenger PIT/market audit failed: ${JSON.stringify(audit)}`);
  const split = splitNcaafV4Chronologically(rows);
  const candidates: DistinctCandidate[] = NCAAF_V4_DISTINCT_CONFIGURATION.shrinkageGrid.flatMap(k => NCAAF_V4_DISTINCT_CONFIGURATION.families.map(family => {
    const ridge = family === "expanded-ridge" ? 36 : 12, parameters = fit(split.training, k, ridge, family === "expanded-huber-irls");
    return { name: `${family}-k${k}-r${ridge}`, family: family as DistinctCandidate["family"], k, ridge, parameters, validation: evaluateNcaafV4(split.validation.map(r => predict(parameters, r, k)), split.validation) };
  }));
  const winner = [...candidates].sort((a, b) => score(a.validation) - score(b.validation) || a.name.localeCompare(b.name))[0]!;
  const validationRaw = split.validation.map(r => predict(winner.parameters, r, winner.k)), plattParameters = platt(validationRaw, split.validation);
  const validationCalibrated = calibrate(validationRaw, plattParameters);
  const useCalibration = evaluateNcaafV4(validationCalibrated, split.validation).logLoss < winner.validation.logLoss;
  const stability = analyzeNcaafV4DistinctValidationStability(useCalibration ? validationCalibrated : validationRaw, split.validation);
  // OOS is first read only after winner/configuration/calibration are frozen above.
  const oosRaw = split.oos.map(r => predict(winner.parameters, r, winner.k)), oosCalibrated = calibrate(oosRaw, plattParameters);
  const oosMetrics = evaluateNcaafV4(useCalibration ? oosCalibrated : oosRaw, split.oos);
  const configurationHash = hash({ ...NCAAF_V4_DISTINCT_CONFIGURATION, winner: { name: winner.name, k: winner.k, ridge: winner.ridge }, useCalibration });
  const rawMetrics = evaluateNcaafV4(oosRaw, split.oos), calibratedMetrics = evaluateNcaafV4(oosCalibrated, split.oos);
  return Object.freeze({ split, audit, candidates: candidates.map(c => ({ name: c.name, family: c.family, k: c.k, ridge: c.ridge, validation: c.validation })), winner: { name: winner.name, family: winner.family, k: winner.k, ridge: winner.ridge }, selectionRationale: { scorecard: NCAAF_V4_DISTINCT_CONFIGURATION.selection, selectedByValidationOnly: true, stabilityGatePassed: stability.pass, stabilityGate: NCAAF_V4_DISTINCT_STABILITY_GATE }, frozen: { configurationHash, parameterHash: hash(winner.parameters), calibration: useCalibration ? { kind: "platt", ...plattParameters } : { kind: "identity" } }, validation: { raw: winner.validation, calibrated: evaluateNcaafV4(validationCalibrated, split.validation), stability }, oos: { raw: rawMetrics, calibrated: calibratedMetrics, selected: oosMetrics, deltas: { raw: deltas(rawMetrics), calibrated: deltas(calibratedMetrics), selected: deltas(oosMetrics) } }, predictions: { validationRaw, oosRaw, oosCalibrated }, predictFrozen: (row: V4Row) => useCalibration ? calibrate([predict(winner.parameters, row, winner.k)], plattParameters)[0]! : predict(winner.parameters, row, winner.k), immutableManifest: { modelId: NCAAF_V4_DISTINCT_CHALLENGER_ID, approval: "UNVALIDATED", champion: false, publication: false, oosUntouchedDuringSelection: true } });
}