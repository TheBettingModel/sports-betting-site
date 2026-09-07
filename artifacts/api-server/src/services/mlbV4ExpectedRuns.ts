import { createHash } from "node:crypto";

export const MLB_V4_RIDGE_LAMBDAS = Object.freeze([0, 1, 10] as const);
export const MLB_V4_NB2_ALPHAS = Object.freeze([0.10, 0.25, 0.50] as const);

export type FeatureValue = number | null | undefined;
export interface MlbSideFeatureVector {
  ownOffense: Readonly<Record<string, FeatureValue>>;
  leagueEnvironment: Readonly<Record<string, FeatureValue>>;
  opponentBullpen: Readonly<Record<string, FeatureValue>>;
}
export interface MlbSideFeatureSchema {
  ownOffense: readonly string[];
  leagueEnvironment: readonly string[];
  opponentBullpen: readonly string[];
}
export interface MlbTrainingRow {
  features: MlbSideFeatureVector;
  runs: number;
}
export interface FittedTransform {
  featureNames: string[];
  medians: number[];
  means: number[];
  standardDeviations: number[];
}
export type ExpectedRunsFamily = "ridge-linear" | "poisson" | "nb2";
export interface ExpectedRunsModel {
  modelFamily: ExpectedRunsFamily;
  featureSchema: MlbSideFeatureSchema;
  transform: FittedTransform;
  coefficients: number[];
  intercept: number;
  regularization: number;
  alpha: number | null;
  trainingRows: number;
  iterations: number;
  converged: boolean;
  objective: string;
}

const CATEGORY_ORDER = ["ownOffense", "leagueEnvironment", "opponentBullpen"] as const;
const PROHIBITED = [
  /starter/i, /pitcheridentity/i, /probablepitcher/i, /actualpitcher/i,
  /moneyline/i, /runline/i, /spread/i, /sportsbook/i, /pinnacle/i,
  /odds/i, /market/i, /consensus/i, /impliedprobability/i, /clv/i, /line movement/i,
  /target/i, /actualruns/i, /homeruns$/i, /awayruns$/i, /finalscore/i, /winner/i,
];

function normalizedKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** Rejects prohibited names at every depth, before any values reach a model. */
export function assertMlbSportsModelFirewall(value: unknown, path = "features"): void {
  if (value === null || value === undefined || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertMlbSportsModelFirewall(child, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const compact = normalizedKey(key);
    if (PROHIBITED.some((pattern) => pattern.test(compact))) {
      throw new Error(`Prohibited starter, market, or target field: ${path}.${key}`);
    }
    assertMlbSportsModelFirewall(child, `${path}.${key}`);
  }
}

function validateSchema(schema: MlbSideFeatureSchema): void {
  assertMlbSportsModelFirewall(schema);
  const all = CATEGORY_ORDER.flatMap((category) =>
    schema[category].map((name) => `${category}.${name}`));
  if (!all.length) throw new Error("MLB expected-runs feature schema is empty");
  if (new Set(all).size !== all.length) throw new Error("Duplicate MLB feature name");
  for (const category of CATEGORY_ORDER) {
    for (const name of schema[category]) {
      if (!name || PROHIBITED.some((pattern) => pattern.test(normalizedKey(name)))) {
        throw new Error(`Prohibited MLB feature name: ${category}.${name}`);
      }
    }
  }
}

/** Strict extraction: unknown/missing structural keys are errors; values may be missing for imputation. */
export function flattenMlbSideFeatures(
  vector: MlbSideFeatureVector,
  schema: MlbSideFeatureSchema,
): FeatureValue[] {
  validateSchema(schema);
  assertMlbSportsModelFirewall(vector);
  const root = vector as unknown as Record<string, unknown>;
  const rootKeys = Object.keys(root).sort();
  if (stableSerialize(rootKeys) !== stableSerialize([...CATEGORY_ORDER].sort())) {
    throw new Error("Side features must contain only own offense, league environment, and opponent bullpen");
  }
  const result: FeatureValue[] = [];
  for (const category of CATEGORY_ORDER) {
    const supplied = Object.keys(vector[category]).sort();
    const allowed = [...schema[category]].sort();
    if (stableSerialize(supplied) !== stableSerialize(allowed)) {
      throw new Error(`Feature allowlist mismatch in ${category}`);
    }
    for (const name of schema[category]) {
      const value = vector[category][name];
      if (value !== null && value !== undefined
        && (typeof value !== "number" || !Number.isFinite(value))) {
        throw new Error(`Non-finite MLB feature: ${category}.${name}`);
      }
      result.push(value);
    }
  }
  return result;
}

function median(values: number[]): number {
  if (!values.length) throw new Error("Cannot impute a feature missing from every training row");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Fits median imputation and population standardization using these rows only. */
export function fitMlbFeatureTransform(
  rows: readonly MlbSideFeatureVector[],
  schema: MlbSideFeatureSchema,
): FittedTransform {
  if (!rows.length) throw new Error("Training features are empty");
  const raw = rows.map((row) => flattenMlbSideFeatures(row, schema));
  const medians = raw[0].map((_, column) =>
    median(raw.map((row) => row[column]).filter((v): v is number => typeof v === "number")));
  const imputed = raw.map((row) => row.map((value, i) => value ?? medians[i]));
  const means = medians.map((_, i) => imputed.reduce((sum, row) => sum + row[i], 0) / imputed.length);
  const standardDeviations = means.map((mean, i) => {
    const sd = Math.sqrt(imputed.reduce((sum, row) => sum + (row[i] - mean) ** 2, 0) / imputed.length);
    return sd > 0 ? sd : 1;
  });
  return {
    featureNames: CATEGORY_ORDER.flatMap((category) =>
      schema[category].map((name) => `${category}.${name}`)),
    medians, means, standardDeviations,
  };
}

export function applyMlbFeatureTransform(
  vector: MlbSideFeatureVector,
  schema: MlbSideFeatureSchema,
  transform: FittedTransform,
): number[] {
  const values = flattenMlbSideFeatures(vector, schema);
  if (values.length !== transform.medians.length) throw new Error("Transform/schema dimension mismatch");
  return values.map((value, i) =>
    ((value ?? transform.medians[i]) - transform.means[i]) / transform.standardDeviations[i]);
}

function validateTraining(rows: readonly MlbTrainingRow[], schema: MlbSideFeatureSchema): void {
  if (!rows.length) throw new Error("Training rows are empty");
  for (const row of rows) {
    flattenMlbSideFeatures(row.features, schema);
    if (!Number.isFinite(row.runs) || row.runs < 0 || !Number.isInteger(row.runs)) {
      throw new Error("MLB run targets must be finite nonnegative integers");
    }
  }
}

function solve(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const augmented = matrix.map((row, i) => [...row, vector[i]]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) augmented[pivot][column] = 1e-12;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let j = column; j <= n; j++) augmented[column][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let j = column; j <= n; j++) augmented[row][j] -= factor * augmented[column][j];
    }
  }
  const answer = augmented.map((row) => row[n]);
  if (!answer.every(Number.isFinite)) throw new Error("Numerically invalid regression solution");
  return answer;
}

function ridgeWeighted(x: number[][], z: number[], weights: number[], lambda: number): number[] {
  const width = x[0].length;
  const matrix = Array.from({ length: width }, () => Array(width).fill(0));
  const rhs = Array(width).fill(0);
  for (let i = 0; i < x.length; i++) for (let j = 0; j < width; j++) {
    rhs[j] += weights[i] * x[i][j] * z[i];
    for (let k = 0; k < width; k++) matrix[j][k] += weights[i] * x[i][j] * x[i][k];
  }
  for (let j = 1; j < width; j++) matrix[j][j] += lambda;
  return solve(matrix, rhs);
}

function softplus(value: number): number {
  if (value > 35) return value;
  if (value < -35) return Math.exp(value);
  return Math.log1p(Math.exp(value));
}
function inverseSoftplus(value: number): number {
  if (value > 35) return value;
  return Math.log(Math.expm1(value) || 1e-12);
}
function dot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, value, i) => sum + value * b[i], 0);
}
function design(rows: readonly MlbTrainingRow[], schema: MlbSideFeatureSchema, t: FittedTransform) {
  return rows.map((row) => [1, ...applyMlbFeatureTransform(row.features, schema, t)]);
}

export function fitRidgeExpectedRuns(
  rows: readonly MlbTrainingRow[],
  schema: MlbSideFeatureSchema,
  validationRows: readonly MlbTrainingRow[] = [],
): ExpectedRunsModel {
  validateTraining(rows, schema);
  if (validationRows.length) validateTraining(validationRows, schema);
  const transform = fitMlbFeatureTransform(rows.map((row) => row.features), schema);
  const x = design(rows, schema, transform);
  const target = rows.map((row) => inverseSoftplus(row.runs));
  const candidates = MLB_V4_RIDGE_LAMBDAS.map((lambda) => {
    const beta = ridgeWeighted(x, target, Array(rows.length).fill(1), lambda);
    const scored = validationRows.length ? validationRows : rows;
    const mse = scored.reduce((sum, row) => {
      const predicted = softplus(dot(beta, [1, ...applyMlbFeatureTransform(row.features, schema, transform)]));
      return sum + (predicted - row.runs) ** 2;
    }, 0) / scored.length;
    return { lambda, beta, mse };
  }).sort((a, b) => a.mse - b.mse || a.lambda - b.lambda);
  const best = candidates[0];
  return {
    modelFamily: "ridge-linear", featureSchema: cloneSchema(schema), transform,
    intercept: best.beta[0], coefficients: best.beta.slice(1), regularization: best.lambda,
    alpha: null, trainingRows: rows.length, iterations: 1, converged: true,
    objective: "ridge least squares on inverse-softplus runs; unpenalized intercept",
  };
}

/**
 * Fits a final ridge model with an already-selected penalty.  Unlike
 * fitRidgeExpectedRuns this function performs no validation scoring or
 * hyperparameter selection, which makes it suitable for the pre-OOS refit.
 */
export function fitRidgeExpectedRunsFixed(
  rows: readonly MlbTrainingRow[],
  schema: MlbSideFeatureSchema,
  lambda: typeof MLB_V4_RIDGE_LAMBDAS[number],
): ExpectedRunsModel {
  if (!MLB_V4_RIDGE_LAMBDAS.includes(lambda)) throw new Error("Unapproved fixed ridge lambda");
  validateTraining(rows, schema);
  const transform = fitMlbFeatureTransform(rows.map((row) => row.features), schema);
  const x = design(rows, schema, transform);
  const beta = ridgeWeighted(x, rows.map((row) => inverseSoftplus(row.runs)),
    Array(rows.length).fill(1), lambda);
  return {
    modelFamily: "ridge-linear", featureSchema: cloneSchema(schema), transform,
    intercept: beta[0], coefficients: beta.slice(1), regularization: lambda,
    alpha: null, trainingRows: rows.length, iterations: 1, converged: true,
    objective: "ridge least squares on inverse-softplus runs; unpenalized intercept",
  };
}

function countObjective(rows: readonly MlbTrainingRow[], model: ExpectedRunsModel): number {
  return rows.reduce((sum, row) => {
    const mu = predictExpectedRuns(model, row.features);
    if (model.modelFamily === "nb2" && model.alpha) {
      const a = model.alpha;
      const size = 1 / a;
      return sum + logGamma(row.runs + size) - logGamma(size) - logGamma(row.runs + 1)
        + size * Math.log(size / (size + mu))
        + row.runs * Math.log(mu / (size + mu));
    }
    return sum + row.runs * Math.log(mu) - mu;
  }, 0);
}

// Deterministic Lanczos approximation, used only for transparent NB2 likelihood comparison.
function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (value < .5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const shifted = value - 1;
  let series = .9999999999998099;
  coefficients.forEach((coefficient, index) => { series += coefficient / (shifted + index + 1); });
  const t = shifted + coefficients.length - .5;
  return .5 * Math.log(2 * Math.PI) + (shifted + .5) * Math.log(t) - t + Math.log(series);
}

function fitLogLink(
  rows: readonly MlbTrainingRow[], schema: MlbSideFeatureSchema, transform: FittedTransform,
  lambda: number, alpha: number | null,
): Omit<ExpectedRunsModel, "modelFamily" | "objective"> {
  const x = design(rows, schema, transform);
  let beta = Array(x[0].length).fill(0);
  beta[0] = Math.log((rows.reduce((s, r) => s + r.runs, 0) + .5) / rows.length);
  let converged = false;
  let iteration = 0;
  for (; iteration < 100; iteration++) {
    const eta = x.map((row) => dot(beta, row));
    const mu = eta.map((value) => Math.exp(Math.max(-30, Math.min(30, value))));
    const weights = mu.map((value) => alpha === null ? value : value / (1 + alpha * value));
    const working = eta.map((value, i) => value + (rows[i].runs - mu[i]) / mu[i]);
    const next = ridgeWeighted(x, working, weights, lambda);
    const delta = Math.max(...next.map((value, i) => Math.abs(value - beta[i])));
    beta = next;
    if (delta < 1e-9) { converged = true; iteration++; break; }
  }
  return {
    featureSchema: cloneSchema(schema), transform, intercept: beta[0], coefficients: beta.slice(1),
    regularization: lambda, alpha, trainingRows: rows.length, iterations: iteration, converged,
  };
}

export function fitPoissonExpectedRuns(
  rows: readonly MlbTrainingRow[], schema: MlbSideFeatureSchema,
  validationRows: readonly MlbTrainingRow[] = [],
): ExpectedRunsModel {
  validateTraining(rows, schema);
  if (validationRows.length) validateTraining(validationRows, schema);
  const transform = fitMlbFeatureTransform(rows.map((r) => r.features), schema);
  const candidates = MLB_V4_RIDGE_LAMBDAS.map((lambda) => {
    const base = fitLogLink(rows, schema, transform, lambda, null);
    const model: ExpectedRunsModel = { ...base, modelFamily: "poisson", objective: "Poisson log-link ridge IRLS" };
    return { model, score: countObjective(validationRows.length ? validationRows : rows, model) };
  }).sort((a, b) => b.score - a.score || a.model.regularization - b.model.regularization);
  return candidates[0].model;
}

export function fitPoissonExpectedRunsFixed(
  rows: readonly MlbTrainingRow[],
  schema: MlbSideFeatureSchema,
  lambda: typeof MLB_V4_RIDGE_LAMBDAS[number],
): ExpectedRunsModel {
  if (!MLB_V4_RIDGE_LAMBDAS.includes(lambda)) throw new Error("Unapproved fixed Poisson lambda");
  validateTraining(rows, schema);
  const transform = fitMlbFeatureTransform(rows.map((row) => row.features), schema);
  return {
    ...fitLogLink(rows, schema, transform, lambda, null),
    modelFamily: "poisson", objective: "Poisson log-link ridge IRLS",
  };
}

export function isNb2OverdispersionJustified(rows: readonly MlbTrainingRow[]): boolean {
  if (rows.length < 20) return false;
  const mean = rows.reduce((sum, row) => sum + row.runs, 0) / rows.length;
  const variance = rows.reduce((sum, row) => sum + (row.runs - mean) ** 2, 0) / (rows.length - 1);
  return variance > mean * 1.10;
}

export function fitNb2ExpectedRuns(
  rows: readonly MlbTrainingRow[], schema: MlbSideFeatureSchema,
  validationRows: readonly MlbTrainingRow[] = [],
): ExpectedRunsModel {
  validateTraining(rows, schema);
  if (!isNb2OverdispersionJustified(rows)) throw new Error("NB2 requires justified training overdispersion");
  if (validationRows.length) validateTraining(validationRows, schema);
  const transform = fitMlbFeatureTransform(rows.map((r) => r.features), schema);
  const candidates = MLB_V4_NB2_ALPHAS.flatMap((alpha) =>
    MLB_V4_RIDGE_LAMBDAS.map((lambda) => {
      const base = fitLogLink(rows, schema, transform, lambda, alpha);
      const model: ExpectedRunsModel = { ...base, modelFamily: "nb2", objective: "NB2 log-link ridge IRLS" };
      return { model, score: countObjective(validationRows.length ? validationRows : rows, model) };
    }));
  candidates.sort((a, b) => b.score - a.score || (a.model.alpha! - b.model.alpha!)
    || a.model.regularization - b.model.regularization);
  return candidates[0].model;
}

export function fitNb2ExpectedRunsFixed(
  rows: readonly MlbTrainingRow[],
  schema: MlbSideFeatureSchema,
  lambda: typeof MLB_V4_RIDGE_LAMBDAS[number],
  alpha: typeof MLB_V4_NB2_ALPHAS[number],
): ExpectedRunsModel {
  if (!MLB_V4_RIDGE_LAMBDAS.includes(lambda) || !MLB_V4_NB2_ALPHAS.includes(alpha)) {
    throw new Error("Unapproved fixed NB2 hyperparameters");
  }
  validateTraining(rows, schema);
  if (!isNb2OverdispersionJustified(rows)) throw new Error("NB2 requires justified training overdispersion");
  const transform = fitMlbFeatureTransform(rows.map((row) => row.features), schema);
  return {
    ...fitLogLink(rows, schema, transform, lambda, alpha),
    modelFamily: "nb2", objective: "NB2 log-link ridge IRLS",
  };
}

export function predictExpectedRuns(model: ExpectedRunsModel, features: MlbSideFeatureVector): number {
  const x = applyMlbFeatureTransform(features, model.featureSchema, model.transform);
  const eta = model.intercept + dot(model.coefficients, x);
  const prediction = model.modelFamily === "ridge-linear" ? softplus(eta) : Math.exp(eta);
  if (!Number.isFinite(prediction) || prediction < 0) throw new Error("Invalid expected-runs prediction");
  return prediction;
}

export interface SimpleRunBaselines {
  league: number;
  homeAway: { home: number; away: number };
  shrunkOffense(teamRuns: number, teamGames: number, priorWeight: number, side: "home" | "away"): number;
}
export function fitSimpleRunBaselines(
  games: readonly { homeRuns: number; awayRuns: number }[],
): SimpleRunBaselines {
  if (!games.length) throw new Error("Baseline training games are empty");
  games.forEach((g) => {
    if (![g.homeRuns, g.awayRuns].every((v) => Number.isFinite(v) && v >= 0)) throw new Error("Invalid baseline runs");
  });
  const home = games.reduce((s, g) => s + g.homeRuns, 0) / games.length;
  const away = games.reduce((s, g) => s + g.awayRuns, 0) / games.length;
  const league = (home + away) / 2;
  return {
    league, homeAway: { home, away },
    shrunkOffense(teamRuns, teamGames, priorWeight, side) {
      if (teamRuns < 0 || teamGames < 0 || priorWeight < 0 || ![teamRuns, teamGames, priorWeight].every(Number.isFinite)) {
        throw new Error("Invalid offense shrinkage inputs");
      }
      const prior = side === "home" ? home : away;
      return (teamRuns + priorWeight * prior) / (teamGames + priorWeight || 1);
    },
  };
}

export interface CountDistribution {
  probabilities: number[];
  omittedTail: number;
  totalProbability: number;
}
export function countDistribution(
  mean: number, kind: "poisson" | "nb2" = "poisson", alpha = .25, tailTolerance = 1e-12,
): CountDistribution {
  if (!Number.isFinite(mean) || mean < 0) throw new Error("Count mean must be finite and nonnegative");
  if (!(tailTolerance > 0 && tailTolerance < 1)) throw new Error("Invalid tail tolerance");
  if (kind === "nb2" && (!Number.isFinite(alpha) || alpha <= 0)) throw new Error("NB2 alpha must be positive");
  if (mean === 0) return { probabilities: [1], omittedTail: 0, totalProbability: 1 };
  const probabilities: number[] = [];
  let p = kind === "poisson" ? Math.exp(-mean) : Math.pow(1 + alpha * mean, -1 / alpha);
  let sum = p;
  probabilities.push(p);
  for (let k = 0; 1 - sum > tailTolerance && k < 10000; k++) {
    p *= kind === "poisson"
      ? mean / (k + 1)
      : ((k + 1 / alpha) / (k + 1)) * ((alpha * mean) / (1 + alpha * mean));
    probabilities.push(p);
    sum += p;
  }
  if (1 - sum > tailTolerance * 1.01) throw new Error("Count distribution failed tail tolerance");
  return { probabilities, omittedTail: Math.max(0, 1 - sum), totalProbability: sum };
}

export interface GameScoreDistribution {
  home: CountDistribution;
  away: CountDistribution;
  exactScores: number[][];
  homeWinProbability: number;
  awayWinProbability: number;
  regulationTieProbability: number;
  normalizationFactor: number;
}
export function convolveIndependentScores(
  homeMean: number, awayMean: number,
  options: { kind?: "poisson" | "nb2"; alpha?: number; tailTolerance?: number } = {},
): GameScoreDistribution {
  const kind = options.kind ?? "poisson";
  const alpha = options.alpha ?? .25;
  const tolerance = options.tailTolerance ?? 1e-12;
  const home = countDistribution(homeMean, kind, alpha, tolerance / 2);
  const away = countDistribution(awayMean, kind, alpha, tolerance / 2);
  const normalizationFactor = home.totalProbability * away.totalProbability;
  const exactScores = home.probabilities.map((hp) =>
    away.probabilities.map((ap) => hp * ap / normalizationFactor));
  let homeStrict = 0, awayStrict = 0, tie = 0;
  exactScores.forEach((row, h) => row.forEach((p, a) => {
    if (h > a) homeStrict += p;
    else if (a > h) awayStrict += p;
    else tie += p;
  }));
  // MLB full games require a winner; extra-inning tie equity is allocated symmetrically.
  const homeWinProbability = homeStrict + tie / 2;
  const awayWinProbability = awayStrict + tie / 2;
  return { home, away, exactScores, homeWinProbability, awayWinProbability,
    regulationTieProbability: tie, normalizationFactor };
}

export interface ProjectedScoreContract {
  home_expected_runs_exact: number;
  away_expected_runs_exact: number;
  projected_total_exact: number;
  projected_margin_exact: number;
}
export function projectedScoreContract(home: number, away: number): ProjectedScoreContract {
  if (![home, away].every((v) => Number.isFinite(v) && v >= 0)) throw new Error("Invalid projected score");
  return {
    home_expected_runs_exact: home, away_expected_runs_exact: away,
    projected_total_exact: home + away, projected_margin_exact: home - away,
  };
}

export interface PlattCalibration { intercept: number; slope: number; iterations: number; converged: boolean }
function logit(p: number): number {
  const q = Math.max(1e-12, Math.min(1 - 1e-12, p));
  return Math.log(q / (1 - q));
}
function logistic(x: number): number {
  return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
}
export function fitPlattCalibration(
  rows: readonly { probability: number; outcome: 0 | 1 }[],
  lambda = 1e-6,
): PlattCalibration {
  if (!rows.length) throw new Error("Calibration rows are empty");
  rows.forEach((r) => {
    if (!(r.probability >= 0 && r.probability <= 1) || !Number.isFinite(r.probability)) throw new Error("Invalid probability");
  });
  let beta = [0, 1], converged = false, iterations = 0;
  const x = rows.map((r) => [1, logit(r.probability)]);
  for (; iterations < 100; iterations++) {
    const p = x.map((v) => logistic(dot(beta, v)));
    const weights = p.map((v) => Math.max(1e-9, v * (1 - v)));
    const z = x.map((v, i) => dot(beta, v) + (rows[i].outcome - p[i]) / weights[i]);
    const next = ridgeWeighted(x, z, weights, lambda);
    const delta = Math.max(Math.abs(next[0] - beta[0]), Math.abs(next[1] - beta[1]));
    beta = next;
    if (delta < 1e-10) { converged = true; iterations++; break; }
  }
  return { intercept: beta[0], slope: beta[1], iterations, converged };
}
export function applyPlattCalibration(calibration: PlattCalibration, probability: number): number {
  if (!(probability >= 0 && probability <= 1)) throw new Error("Invalid probability");
  return logistic(calibration.intercept + calibration.slope * logit(probability));
}

export function fairAmericanOdds(probability: number): number {
  if (!(probability > 0 && probability < 1) || !Number.isFinite(probability)) {
    throw new Error("Fair odds require probability strictly between zero and one");
  }
  if (probability === .5) return 100;
  return probability > .5 ? -100 * probability / (1 - probability) : 100 * (1 - probability) / probability;
}

export interface ErrorMetric { mae: number; rmse: number; bias: number; predictedMean: number; actualMean: number }
function errorMetric(predicted: number[], actual: number[]): ErrorMetric {
  const errors = predicted.map((v, i) => v - actual[i]);
  return {
    mae: errors.reduce((s, v) => s + Math.abs(v), 0) / errors.length,
    rmse: Math.sqrt(errors.reduce((s, v) => s + v * v, 0) / errors.length),
    bias: errors.reduce((s, v) => s + v, 0) / errors.length,
    predictedMean: predicted.reduce((s, v) => s + v, 0) / predicted.length,
    actualMean: actual.reduce((s, v) => s + v, 0) / actual.length,
  };
}
export function runMetrics(rows: readonly {
  predictedHome: number; predictedAway: number; actualHome: number; actualAway: number;
}[]) {
  if (!rows.length) throw new Error("Run metric rows are empty");
  const metric = (p: (r: typeof rows[number]) => number, a: (r: typeof rows[number]) => number) =>
    errorMetric(rows.map(p), rows.map(a));
  return {
    home: metric((r) => r.predictedHome, (r) => r.actualHome),
    away: metric((r) => r.predictedAway, (r) => r.actualAway),
    total: metric((r) => r.predictedHome + r.predictedAway, (r) => r.actualHome + r.actualAway),
    margin: metric((r) => r.predictedHome - r.predictedAway, (r) => r.actualHome - r.actualAway),
  };
}
export interface ReliabilityBucket {
  lower: number; upper: number; count: number; meanProbability: number; outcomeRate: number; warning: string | null;
}
export function reliabilityBuckets(
  rows: readonly { probability: number; outcome: 0 | 1 }[],
  boundaries: readonly number[] = [0, .5, .55, .6, .65, .7, .75, 1],
  minimumSample = 30,
): ReliabilityBucket[] {
  return boundaries.slice(0, -1).map((lower, i) => {
    const upper = boundaries[i + 1];
    const selected = rows.filter((r) => r.probability >= lower
      && (i === boundaries.length - 2 ? r.probability <= upper : r.probability < upper));
    return {
      lower, upper, count: selected.length,
      meanProbability: selected.length ? selected.reduce((s, r) => s + r.probability, 0) / selected.length : 0,
      outcomeRate: selected.length ? selected.reduce((s, r) => s + r.outcome, 0) / selected.length : 0,
      warning: selected.length < minimumSample ? "INSUFFICIENT_SAMPLE" : null,
    };
  });
}
export function probabilityMetrics(rows: readonly { probability: number; outcome: 0 | 1 }[]) {
  if (!rows.length) throw new Error("Probability metric rows are empty");
  rows.forEach((r) => {
    if (!(r.probability >= 0 && r.probability <= 1) || !Number.isFinite(r.probability)) throw new Error("Invalid probability");
  });
  const eps = 1e-15;
  const buckets = reliabilityBuckets(rows);
  return {
    brier: rows.reduce((s, r) => s + (r.probability - r.outcome) ** 2, 0) / rows.length,
    logLoss: rows.reduce((s, r) => {
      const p = Math.max(eps, Math.min(1 - eps, r.probability));
      return s - (r.outcome ? Math.log(p) : Math.log(1 - p));
    }, 0) / rows.length,
    accuracy: rows.filter((r) => (r.probability >= .5 ? 1 : 0) === r.outcome).length / rows.length,
    ece: buckets.reduce((s, b) => s + b.count / rows.length * Math.abs(b.meanProbability - b.outcomeRate), 0),
    reliability: buckets,
  };
}

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Cannot serialize non-finite number");
    if (value === undefined) return '"__undefined__"';
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) =>
    `${JSON.stringify(key)}:${stableSerialize(row[key])}`).join(",")}}`;
}
export function stableLocalHash(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}
export function serializeExpectedRunsModel(model: ExpectedRunsModel): string {
  return stableSerialize(model);
}
export function parseExpectedRunsModel(serialized: string): ExpectedRunsModel {
  const value = JSON.parse(serialized) as ExpectedRunsModel;
  if (!value || !["ridge-linear", "poisson", "nb2"].includes(value.modelFamily)
    || !Array.isArray(value.coefficients) || !Number.isFinite(value.intercept)) {
    throw new Error("Invalid expected-runs model serialization");
  }
  validateSchema(value.featureSchema);
  if (!value.coefficients.every(Number.isFinite)) throw new Error("Invalid model coefficients");
  return value;
}
function cloneSchema(schema: MlbSideFeatureSchema): MlbSideFeatureSchema {
  return {
    ownOffense: [...schema.ownOffense],
    leagueEnvironment: [...schema.leagueEnvironment],
    opponentBullpen: [...schema.opponentBullpen],
  };
}