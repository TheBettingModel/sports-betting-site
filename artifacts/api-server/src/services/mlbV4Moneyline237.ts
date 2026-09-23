import {
  applyMlbFeatureTransform,
  assertMlbSportsModelFirewall,
  fitMlbFeatureTransform,
  probabilityMetrics,
  stableLocalHash,
  type FittedTransform,
  type MlbSideFeatureSchema,
  type MlbSideFeatureVector,
} from "./mlbV4ExpectedRuns";

export const MLB_237_LOGISTIC_LAMBDAS = Object.freeze([0.01, 0.1, 1, 10] as const);
export interface MoneylineGameRow {
  home: MlbSideFeatureVector; away: MlbSideFeatureVector; homeWon: 0 | 1;
}
export interface MoneylineTransform { sideTransform: FittedTransform; featureNames: string[] }
export interface MoneylineModel {
  transform: MoneylineTransform; coefficients: number[]; intercept: number;
  lambda: number; iterations: number; converged: boolean; objective: number; trainingRows: number;
}
export interface MoneylineCandidateScore {
  id: string; family: string; lambda: number; alpha?: number | null; validation: ReturnType<typeof probabilityMetrics>;
  integrityIssues: number; numericalIssues: number; worstFoldLogLoss: number; deterministic: boolean; coefficientSimplicity?: number;
}

const sigmoid = (x: number) => x >= 0 ? 1 / (1 + Math.exp(-Math.min(x, 35))) : Math.exp(Math.max(x, -35)) / (1 + Math.exp(Math.max(x, -35)));
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, i) => s + v * b[i]!, 0);

function validateRows(rows: readonly MoneylineGameRow[], schema: MlbSideFeatureSchema): void {
  if (!rows.length) throw new Error("Moneyline training rows are empty");
  for (const row of rows) {
    assertMlbSportsModelFirewall({ home: row.home, away: row.away });
    if (row.homeWon !== 0 && row.homeWon !== 1) throw new Error("Moneyline outcome must be binary");
  }
}

/** Fits imputation/standardization only on supplied TRAIN game sides. */
export function fitMoneylineTransform(rows: readonly MoneylineGameRow[], schema: MlbSideFeatureSchema): MoneylineTransform {
  validateRows(rows, schema);
  const sideTransform = fitMlbFeatureTransform(rows.flatMap((r) => [r.home, r.away]), schema);
  return { sideTransform, featureNames: sideTransform.featureNames.map((name) => `homeMinusAway.${name}`) };
}
export function gameFeatures(row: Pick<MoneylineGameRow, "home" | "away">, schema: MlbSideFeatureSchema, transform: MoneylineTransform): number[] {
  const home = applyMlbFeatureTransform(row.home, schema, transform.sideTransform);
  const away = applyMlbFeatureTransform(row.away, schema, transform.sideTransform);
  if (home.length !== away.length) throw new Error("Moneyline feature dimension mismatch");
  return home.map((value, index) => value - away[index]!);
}
function objective(x: number[][], y: number[], beta: number[], lambda: number): number {
  let value = 0;
  for (let i = 0; i < x.length; i++) {
    const z = beta[0]! + dot(beta.slice(1), x[i]!);
    value += z > 0 ? Math.log1p(Math.exp(-z)) + (1 - y[i]!) * z : Math.log1p(Math.exp(z)) - y[i]! * z;
  }
  return value / x.length + lambda * beta.slice(1).reduce((s, v) => s + v * v, 0) / 2;
}
/** Deterministic bounded batch-gradient solver with backtracking and L2 penalty. */
export function fitRegularizedMoneyline(
  rows: readonly MoneylineGameRow[], schema: MlbSideFeatureSchema, lambda: number,
): MoneylineModel {
  if (!(lambda >= 0 && Number.isFinite(lambda))) throw new Error("Invalid logistic penalty");
  const transform = fitMoneylineTransform(rows, schema);
  const x = rows.map((r) => gameFeatures(r, schema, transform));
  const y = rows.map((r) => r.homeWon);
  let beta = Array(x[0]!.length + 1).fill(0);
  let current = objective(x, y, beta, lambda), converged = false, iterations = 0;
  for (; iterations < 5000; iterations++) {
    const gradient = Array(beta.length).fill(0);
    x.forEach((row, i) => {
      const error = sigmoid(beta[0]! + dot(beta.slice(1), row)) - y[i]!;
      gradient[0] += error / x.length;
      row.forEach((v, j) => { gradient[j + 1] += error * v / x.length; });
    });
    for (let j = 1; j < gradient.length; j++) gradient[j] += lambda * beta[j]!;
    const maxGradient = Math.max(...gradient.map(Math.abs));
    if (maxGradient < 1e-6) { converged = true; break; }
    let step = 1, next = beta.map((v, j) => Math.max(-30, Math.min(30, v - step * gradient[j]!)));
    let nextObjective = objective(x, y, next, lambda);
    while (nextObjective > current && step > 1e-10) {
      step /= 2; next = beta.map((v, j) => Math.max(-30, Math.min(30, v - step * gradient[j]!)));
      nextObjective = objective(x, y, next, lambda);
    }
    if (step <= 1e-10) throw new Error("Logistic optimization failed bounded line search");
    const maxChange = Math.max(...next.map((value, index) => Math.abs(value - beta[index]!)));
    const improvement = current - nextObjective;
    beta = next; current = nextObjective;
    // A line search may reach floating-point resolution before a tiny gradient
    // threshold; require both negligible movement and objective improvement.
    if (maxChange < 1e-9 && improvement >= 0 && improvement < 1e-12) {
      converged = true;
      iterations++;
      break;
    }
  }
  if (!Number.isFinite(current) || !beta.every(Number.isFinite)) throw new Error("Numerically invalid logistic model");
  return { transform, intercept: beta[0]!, coefficients: beta.slice(1), lambda, iterations, converged, objective: current, trainingRows: rows.length };
}
export function predictMoneyline(model: MoneylineModel, row: Pick<MoneylineGameRow, "home" | "away">, schema: MlbSideFeatureSchema): number {
  const p = sigmoid(model.intercept + dot(model.coefficients, gameFeatures(row, schema, model.transform)));
  if (!Number.isFinite(p) || p <= 0 || p >= 1) throw new Error("Invalid moneyline probability");
  return p;
}

export function rocAuc(rows: readonly { probability: number; outcome: 0 | 1 }[]): number {
  if (!rows.length || rows.some((row) => !Number.isFinite(row.probability)
    || row.probability < 0 || row.probability > 1 || (row.outcome !== 0 && row.outcome !== 1))) {
    throw new Error("Invalid AUC rows");
  }
  const positives = rows.filter((row) => row.outcome === 1).length;
  const negatives = rows.length - positives;
  if (!positives || !negatives) throw new Error("AUC requires both outcome classes");
  const sorted = [...rows].sort((a, b) => a.probability - b.probability || a.outcome - b.outcome);
  let positiveRankSum = 0;
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end]!.probability === sorted[start]!.probability) end++;
    const averageRank = ((start + 1) + end) / 2;
    for (let index = start; index < end; index++) {
      if (sorted[index]!.outcome === 1) positiveRankSum += averageRank;
    }
    start = end;
  }
  return (positiveRankSum - positives * (positives + 1) / 2) / (positives * negatives);
}

export const MLB_237_SELECTION_RULE = Object.freeze({
  eligibility: "zero integrity/numerical issues and deterministic rebuild",
  order: ["validation log loss", "validation Brier", "validation ECE", "temporal stability", "simplicity"],
  gates: { beatsTrainNaivePriorOnValidationLogLoss: true, beatsTrainNaivePriorOnValidationBrier: true, maxEce: .05, noCatastrophicTemporalFoldFailure: true },
  usesRoi: false,
});
export function selectMoneylineCandidate(candidates: readonly MoneylineCandidateScore[], naive: ReturnType<typeof probabilityMetrics>): MoneylineCandidateScore | null {
  const eligible = candidates.filter((c) => c.integrityIssues === 0 && c.numericalIssues === 0 && c.deterministic
    && c.validation.logLoss < naive.logLoss && c.validation.brier < naive.brier && c.validation.ece <= .05
    && Number.isFinite(c.worstFoldLogLoss) && c.worstFoldLogLoss <= naive.logLoss + .10);
  return [...eligible].sort((a, b) => a.validation.logLoss - b.validation.logLoss || a.validation.brier - b.validation.brier
    || a.validation.ece - b.validation.ece || a.worstFoldLogLoss - b.worstFoldLogLoss || (a.coefficientSimplicity ?? 0) - (b.coefficientSimplicity ?? 0) || a.id.localeCompare(b.id))[0] ?? null;
}
export function modelHash(model: MoneylineModel): string { return stableLocalHash(model); }