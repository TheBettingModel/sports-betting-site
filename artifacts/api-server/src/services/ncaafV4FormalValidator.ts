import { createHash } from "node:crypto";
import {
  evaluateNcaafV4, trainNcaafV4, type V4Metrics, type V4Prediction, type V4Row,
  NCAAF_V4_DATASET_VERSION, NCAAF_V4_EXPECTED_SCORE_ID, NCAAF_V4_FEATURE_SCHEMA_VERSION,
} from "./ncaafV4ExpectedScore";
import { loadNcaafV4TrainingRows } from "./ncaafV4TrainingLoader";
import { NCAAF_V4_CANONICAL_BASELINE_D } from "./ncaafV4DistinctChallenger";

/** Development-only, read-only evidence generator for #223. It has no registry,
 * publication, database-write, or prediction-generation side effect. */
export const NCAAF_V4_FORMAL_VALIDATION_VERSION = "ncaaf-v4-formal-validation-v1";
export const NCAAF_V4_FROZEN_IDENTITY = Object.freeze({
  sport: "NCAAF", modelId: NCAAF_V4_EXPECTED_SCORE_ID,
  configurationHash: NCAAF_V4_CANONICAL_BASELINE_D.configurationHash,
  parameterHash: NCAAF_V4_CANONICAL_BASELINE_D.parameterHash,
  datasetVersion: NCAAF_V4_DATASET_VERSION, featureSchemaVersion: NCAAF_V4_FEATURE_SCHEMA_VERSION,
  splitChecksum: NCAAF_V4_CANONICAL_BASELINE_D.trainingData.splitChecksum,
  trainingWindow: "2023-2024", validationWindow: "2025 weeks 1-7", oosWindow: "2025 week 8+",
  prospectiveEvaluationVersion: "ncaaf-v4-2026-bridge-v1",
  evaluationCodeVersion: NCAAF_V4_FORMAL_VALIDATION_VERSION,
  // Fixed evidence identity, rather than a clock read, keeps a rerun reproducible.
  evaluationTimestamp: "2026-09-04T14:15:00.000Z",
  calibrationVersion: "identity-or-validation-fitted-platt-temperature-v1",
  distributionVersion: "normal-margin-total-v1",
});
export const NCAAF_V4_ADVANCEMENT_GATES = Object.freeze({
  maximumOosBrier: .25, maximumOosLogLoss: .7, maximumCalibrationBrierDegradation: .005,
  maximumCalibrationLogLossDegradation: .01,
  requirements: Object.freeze(["frozenIdentity", "pitAndMarket", "canonicalOos", "probabilityIntegrity", "queryIntegrity"]),
});

type Calibration = Readonly<{ name: "identity" | "platt" | "temperature"; parameters: Readonly<Record<string, number>>; validation: V4Metrics; oos: V4Metrics }>;
const mean = (x: readonly number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const clamp = (x: number) => Math.max(.001, Math.min(.999, x));
const logit = (p: number) => Math.log(clamp(p) / (1 - clamp(p)));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const canonical = (x: unknown): unknown => Array.isArray(x) ? x.map(canonical) : x && typeof x === "object"
  ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => String(a).localeCompare(String(b))).map(([k, v]) => [k, canonical(v)]) as [string, unknown][]) : x;
const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(canonical(x))).digest("hex");
const freeze = <T>(x: T): T => { if (x && typeof x === "object" && !Object.isFrozen(x)) { Object.freeze(x); for (const v of Object.values(x as object)) freeze(v); } return x; };

function calibrated(predictions: readonly V4Prediction[], a: number, b: number): V4Prediction[] {
  return predictions.map(p => ({ ...p, homeWinProbability: clamp(sigmoid(a * logit(p.homeWinProbability) + b)),
    awayWinProbability: 1 - clamp(sigmoid(a * logit(p.homeWinProbability) + b)) } as V4Prediction));
}
/** Fits only the supplied validation set.  Deliberately accepts no OOS rows. */
export function fitNcaafV4ValidationPlatt(validation: readonly V4Prediction[], rows: readonly V4Row[]) {
  const labels = new Map(rows.map(r => [r.stableGameId, r.targets.homeWin])); let a = 1, b = 0;
  for (let i = 0; i < 30; i++) { let g0 = 0, g1 = 0, h00 = 1e-4, h01 = 0, h11 = 1e-4;
    for (const p of validation) { const x = logit(p.homeWinProbability), q = sigmoid(a * x + b), d = q - (labels.get(p.gameId) ?? 0), w = q * (1 - q); g0 += d * x; g1 += d; h00 += w * x * x; h01 += w * x; h11 += w; }
    const det = h00 * h11 - h01 * h01; a -= (h11 * g0 - h01 * g1) / det; b -= (-h01 * g0 + h00 * g1) / det;
  } return freeze({ a, b });
}
function reliability(predictions: readonly V4Prediction[], rows: readonly V4Row[]) {
  const labels = new Map(rows.map(r => [r.stableGameId, r.targets.homeWin]));
  const bands = [[.5,.55],[.55,.6],[.6,.65],[.65,.7],[.7,.75],[.75,.8],[.8,1.001]];
  const buckets = bands.map(([low, high]) => { const xs = predictions.map(p => ({ p: Math.max(p.homeWinProbability, p.awayWinProbability), y: p.homeWinProbability >= .5 ? labels.get(p.gameId)! : 1 - labels.get(p.gameId)! })).filter(x => x.p >= low && x.p < high); const predicted = mean(xs.map(x => x.p)), observed = mean(xs.map(x => x.y)); return freeze({ low, high, count: xs.length, predicted: xs.length ? predicted : null, observed: xs.length ? observed : null, error: xs.length ? Math.abs(predicted - observed) : null }); });
  const nonempty = buckets.filter(x => x.error != null);
  return freeze({ buckets, ece: nonempty.reduce((s, x) => s + x.count * x.error!, 0) / Math.max(1, predictions.length), mce: Math.max(0, ...nonempty.map(x => x.error!)) });
}
function residuals(predictions: readonly V4Prediction[], rows: readonly V4Row[]) {
  const by = new Map(predictions.map(p => [p.gameId, p]));
  const stats = (name: string, values: number[]) => { const sorted = [...values].sort((a, b) => a - b), m = mean(values), sd = Math.sqrt(mean(values.map(x => (x - m) ** 2))), q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
    return freeze({ name, mean: m, sd, skew: mean(values.map(x => ((x - m) / Math.max(sd, 1e-12)) ** 3)), quantiles: freeze({ p05: q(.05), p25: q(.25), p50: q(.5), p75: q(.75), p95: q(.95) }), tails: freeze({ absoluteOver15: values.filter(x => Math.abs(x) >= 15).length, absoluteOver25: values.filter(x => Math.abs(x) >= 25).length }) }); };
  const entries = rows.map(r => { const p = by.get(r.stableGameId)!; const h = r.targets.homePoints ?? (r.targets.totalPoints + r.targets.homeMargin) / 2, a = r.targets.awayPoints ?? (r.targets.totalPoints - r.targets.homeMargin) / 2; return { row: r, prediction: p, home: p.expectedHomePoints - h, away: p.expectedAwayPoints - a, margin: p.expectedMargin - r.targets.homeMargin, total: p.expectedTotal - r.targets.totalPoints }; });
  return freeze({ statistics: freeze(["home", "away", "margin", "total"].map(k => stats(k, entries.map(x => x[k as "home" | "away" | "margin" | "total"])))),
    topOutliers: freeze({ margin: freeze([...entries].sort((a,b) => Math.abs(b.margin)-Math.abs(a.margin)).slice(0,10).map(x => freeze({ gameId:x.row.stableGameId, error:x.margin, week:x.row.week, dataQuality:x.prediction.dataQuality }))), total: freeze([...entries].sort((a,b) => Math.abs(b.total)-Math.abs(a.total)).slice(0,10).map(x => freeze({ gameId:x.row.stableGameId, error:x.total, week:x.row.week, dataQuality:x.prediction.dataQuality }))), score: freeze([...entries].sort((a,b) => Math.max(Math.abs(b.home),Math.abs(b.away))-Math.max(Math.abs(a.home),Math.abs(a.away))).slice(0,10).map(x => freeze({ gameId:x.row.stableGameId, homeError:x.home, awayError:x.away, week:x.row.week }))) }) });
}
function bucketMetrics(predictions: readonly V4Prediction[], rows: readonly V4Row[]) {
  const pairs = rows.map(r => ({ r, p: predictions.find(p => p.gameId === r.stableGameId)! }));
  const band = (x: number, cuts: number[]) => `${cuts.find(c => x < c) ?? "+"}`;
  const group = (name: string, fn: (x: typeof pairs[number]) => string) => freeze({ name, buckets: freeze([...pairs.reduce((m, x) => { const k = fn(x); m.set(k, [...(m.get(k) ?? []), x]); return m; }, new Map<string, typeof pairs>())].sort(([a],[b]) => a.localeCompare(b)).map(([bucket, x]) => freeze({ bucket, count:x.length, metrics:evaluateNcaafV4(x.map(y=>y.p), x.map(y=>y.r)) }))) });
  return freeze(["week","earlyLate","site","dataQuality","sample","probability","margin","total","score"].map(name => group(name, x => ({
    week:`week-${x.r.week}`, earlyLate:(x.r.week ?? 99) <= 3 ? "early" : "late", site:x.r.features.context.neutralSite ? "neutral" : "home", dataQuality:x.p.dataQuality,
    sample:band(Math.min(x.r.features.home.seasonToDate.games,x.r.features.away.seasonToDate.games),[3,6]), probability:band(Math.max(x.p.homeWinProbability,x.p.awayWinProbability),[.55,.6,.65,.7,.75,.8]), margin:band(Math.abs(x.p.expectedMargin),[3,7,14]), total:band(x.p.expectedTotal,[45,52.5,60]), score:band(Math.max(x.p.expectedHomePoints,x.p.expectedAwayPoints),[20,30,40]),
  } as Record<string,string>)[name]!)));
}
function integrity(predictions: readonly V4Prediction[]) {
  let invalid = 0, queryFailures = 0; for (const p of predictions) { if (![p.homeWinProbability,p.awayWinProbability,p.expectedHomePoints,p.expectedAwayPoints,p.marginUncertainty,p.totalUncertainty].every(Number.isFinite) || p.homeWinProbability <= 0 || p.homeWinProbability >= 1 || Math.abs(p.homeWinProbability + p.awayWinProbability - 1) > 1e-9 || p.marginUncertainty <= 0 || p.totalUncertainty <= 0) invalid++;
    const h = [-7.5,-3.5,3.5].map(x => p.probabilityHomeCovers(x)), t = [45.5,52.5,60.5].map(x => p.probabilityOver(x)); if (!(h[0]! <= h[1]! && h[1]! <= h[2]! && t[0]! >= t[1]! && t[1]! >= t[2]!) || Math.abs(p.probabilityHomeCovers(-3.5) + p.probabilityAwayCovers(3.5) - 1) > 1e-9) queryFailures++; }
  return freeze({ invalidPredictions: invalid, queryFailures, valid: invalid === 0 && queryFailures === 0 });
}
export function validateNcaafV4Formal(rows: readonly V4Row[], options: { readonly expectedIdentity?: Partial<Record<keyof typeof NCAAF_V4_FROZEN_IDENTITY, string>> } = {}) {
  const trained = trainNcaafV4(rows), expected = { ...NCAAF_V4_FROZEN_IDENTITY, ...options.expectedIdentity };
  const actual = { sport:"NCAAF", modelId:NCAAF_V4_EXPECTED_SCORE_ID, configurationHash:trained.configurationHash, parameterHash:trained.parameterHash, datasetVersion:NCAAF_V4_DATASET_VERSION, featureSchemaVersion:NCAAF_V4_FEATURE_SCHEMA_VERSION, splitChecksum:trained.split.checksum };
  const immutable = Object.entries(expected).filter(([k]) => k in actual).every(([k,v]) => actual[k as keyof typeof actual] === v);
  if (!immutable) throw new Error(`NCAAF V4 frozen identity mismatch: expected ${hash(expected)}, actual ${hash(actual)}`);
  const raw = { name:"identity" as const, parameters:freeze({}), validation:trained.validationMetrics, oos:trained.oosMetrics };
  const platt = fitNcaafV4ValidationPlatt(trained.validation, trained.split.validation), plattCandidate = { name:"platt" as const, parameters:platt, validation:evaluateNcaafV4(calibrated(trained.validation,platt.a,platt.b),trained.split.validation), oos:evaluateNcaafV4(calibrated(trained.oos,platt.a,platt.b),trained.split.oos) };
  const temperatures = [.9,.95,1.05,1.1].map(t => ({ t, validation:evaluateNcaafV4(calibrated(trained.validation,1/t,0),trained.split.validation) })).sort((a,b)=>a.validation.logLoss-b.validation.logLoss || a.t-b.t);
  const temperature = temperatures[0]!, temperatureCandidate = { name:"temperature" as const, parameters:freeze({ temperature:temperature.t }), validation:temperature.validation, oos:evaluateNcaafV4(calibrated(trained.oos,1/temperature.t,0),trained.split.oos) };
  const candidates: Calibration[] = [raw,plattCandidate,temperatureCandidate]; const eligible = candidates.filter(x => x.name !== "identity" && x.validation.logLoss < raw.validation.logLoss && x.validation.brier < raw.validation.brier && x.oos.logLoss <= raw.oos.logLoss + NCAAF_V4_ADVANCEMENT_GATES.maximumCalibrationLogLossDegradation && x.oos.brier <= raw.oos.brier + NCAAF_V4_ADVANCEMENT_GATES.maximumCalibrationBrierDegradation);
  const selected = eligible.sort((a,b)=>
    (a.validation.logLoss + a.validation.brier) - (b.validation.logLoss + b.validation.brier)
    || a.name.localeCompare(b.name))[0] ?? raw;
  const probability = integrity(trained.oos), canonical = NCAAF_V4_CANONICAL_BASELINE_D.oos, reconciled = Object.entries(canonical).filter(([k]) => k !== "count").every(([k,v]) => Math.abs((trained.oosMetrics[k as keyof V4Metrics] as number) - v) < 1e-8);
  const { rows: auditedRows, ...violations } = trained.audit;
  const gates = freeze({ frozenIdentity:immutable, pitAndMarket:auditedRows === rows.length && Object.values(violations).every(x=>x===0), canonicalOos:reconciled, probabilityIntegrity:probability.invalidPredictions===0, queryIntegrity:probability.queryFailures===0 });
  return freeze({ identity:freeze({ ...NCAAF_V4_FROZEN_IDENTITY, evaluationHash:hash({ ...NCAAF_V4_FROZEN_IDENTITY, ...actual }) }), actualIdentity:freeze(actual), baselineComparison:trained.selection.baselines, validation:freeze({ metrics:trained.validationMetrics, calibration:reliability(trained.validation,trained.split.validation), residuals:residuals(trained.validation,trained.split.validation), buckets:bucketMetrics(trained.validation,trained.split.validation) }), oos:freeze({ metrics:trained.oosMetrics, calibration:reliability(trained.oos,trained.split.oos), residuals:residuals(trained.oos,trained.split.oos), buckets:bucketMetrics(trained.oos,trained.split.oos) }), calibration:freeze({ fittingCohort:"validation-only", candidates:freeze(candidates), selected:selected.name, decision:selected.name === "identity" ? "identity-default" : "validation-improved-oos-not-materially-degraded" }), integrity:probability, audit:trained.audit, gates:freeze({ ...gates, pass:Object.values(gates).every(x => x === true) }), immutableManifest:trained.immutableManifest });
}
/** Loader convenience only; remains read-only. */
export async function loadAndValidateNcaafV4Formal() { return validateNcaafV4Formal(await loadNcaafV4TrainingRows()); }