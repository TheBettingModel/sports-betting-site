import {
  MLB_V4_NB2_ALPHAS,
  MLB_V4_RIDGE_LAMBDAS,
  convolveIndependentScores,
  fairAmericanOdds,
  probabilityMetrics,
  projectedScoreContract,
  runMetrics,
  stableLocalHash,
  stableSerialize,
  type ExpectedRunsFamily,
  type ExpectedRunsModel,
  type MlbSideFeatureSchema,
} from "./mlbV4ExpectedRuns";

export const MLB_239_FRAMEWORK_VERSION = "mlb-v4-challenger-239-v1";
export const MLB_239_NORMALIZATION_VERSION = "mlb-v4-normalization-239-v1";
export const MLB_239_DISTRIBUTION_VERSION = "independent-count-tie-split-239-v1";
export const MLB_239_OUTPUT_VERSION = "mlb-v4-shadow-output-239-v1";
export const MLB_239_CURRENT_CHAMPION = "tbm-mlb-moneyline-v1";

export type CandidateFamilyDeclaration = Readonly<{
  family: ExpectedRunsFamily;
  ridgeLambdas: readonly number[];
  nb2Alphas: readonly number[];
  selectionMetric: "VALIDATION_RUN_LOG_LIKELIHOOD" | "VALIDATION_RUN_MSE";
}>;

export const MLB_239_CANDIDATE_FAMILIES: readonly CandidateFamilyDeclaration[] =
  Object.freeze([
    Object.freeze({
      family: "ridge-linear",
      ridgeLambdas: MLB_V4_RIDGE_LAMBDAS,
      nb2Alphas: Object.freeze([]),
      selectionMetric: "VALIDATION_RUN_MSE",
    }),
    Object.freeze({
      family: "poisson",
      ridgeLambdas: MLB_V4_RIDGE_LAMBDAS,
      nb2Alphas: Object.freeze([]),
      selectionMetric: "VALIDATION_RUN_LOG_LIKELIHOOD",
    }),
    Object.freeze({
      family: "nb2",
      ridgeLambdas: MLB_V4_RIDGE_LAMBDAS,
      nb2Alphas: MLB_V4_NB2_ALPHAS,
      selectionMetric: "VALIDATION_RUN_LOG_LIKELIHOOD",
    }),
  ]);

export interface GateApprovedDataset {
  readonly datasetId: string;
  readonly datasetHash: string;
  readonly inputContractVersion: string;
  readonly sport: "MLB";
  readonly approved: true;
  readonly approvalId: string;
  readonly approvedAt: string;
  readonly chronology: "POINT_IN_TIME";
  readonly marketFree: true;
}

export interface FrozenCohortBinding {
  readonly training: Readonly<{ start: string; end: string }>;
  readonly validation: Readonly<{ start: string; end: string }>;
  readonly historicalBenchmarkOnly: Readonly<{ start: string; end: string }>;
  readonly gameIdsHash: string;
}

export interface DeterministicTrainingConfiguration {
  readonly version: "mlb-v4-training-239-v1";
  readonly randomSeed: 239;
  readonly rowOrder: "GAME_ID_ASC_HOME_THEN_AWAY";
  readonly numericRuntime: "IEEE754_BINARY64";
  readonly candidates: readonly CandidateFamilyDeclaration[];
  readonly cohort: FrozenCohortBinding;
  readonly dataset: GateApprovedDataset;
  readonly configurationHash: string;
}

function assertIso(value: string, name: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${name} must be an ISO timestamp`);
}

/** Creates a plan only. This framework deliberately never starts training. */
export function createDeterministicTrainingConfiguration(input: {
  dataset: GateApprovedDataset;
  cohort: Omit<FrozenCohortBinding, "gameIdsHash">;
  orderedGameIds: readonly string[];
}): Readonly<DeterministicTrainingConfiguration> {
  if (!input.dataset.approved || input.dataset.sport !== "MLB"
    || !input.dataset.marketFree || input.dataset.chronology !== "POINT_IN_TIME") {
    throw new Error("Training requires a gate-approved, market-free MLB PIT dataset");
  }
  if (!input.dataset.datasetId || !/^[a-f0-9]{64}$/i.test(input.dataset.datasetHash)
    || !input.dataset.approvalId) {
    throw new Error("Dataset approval identity is incomplete");
  }
  const windows = [
    input.cohort.training,
    input.cohort.validation,
    input.cohort.historicalBenchmarkOnly,
  ];
  windows.forEach((window, index) => {
    assertIso(window.start, `cohort[${index}].start`);
    assertIso(window.end, `cohort[${index}].end`);
    if (window.start >= window.end) throw new Error("Cohort windows must be nonempty");
  });
  if (!(input.cohort.training.end <= input.cohort.validation.start
    && input.cohort.validation.end <= input.cohort.historicalBenchmarkOnly.start)) {
    throw new Error("Training, validation, and benchmark-only cohorts must be chronological and disjoint");
  }
  if (!input.orderedGameIds.length
    || input.orderedGameIds.some((id, index) => !id
      || (index > 0 && id <= input.orderedGameIds[index - 1]!))) {
    throw new Error("Cohort game IDs must be nonempty, unique, and ascending");
  }
  const base = {
    version: "mlb-v4-training-239-v1" as const,
    randomSeed: 239 as const,
    rowOrder: "GAME_ID_ASC_HOME_THEN_AWAY" as const,
    numericRuntime: "IEEE754_BINARY64" as const,
    candidates: MLB_239_CANDIDATE_FAMILIES,
    cohort: {
      ...input.cohort,
      gameIdsHash: stableLocalHash(input.orderedGameIds),
    },
    dataset: input.dataset,
  };
  return deepFreeze({ ...base, configurationHash: stableLocalHash(base) });
}

export interface FrozenNormalizationArtifact {
  readonly version: typeof MLB_239_NORMALIZATION_VERSION;
  readonly featureSchema: MlbSideFeatureSchema;
  readonly featureNames: readonly string[];
  readonly medians: readonly number[];
  readonly means: readonly number[];
  readonly standardDeviations: readonly number[];
  readonly normalizationHash: string;
}

export interface FrozenExpectedRunsArtifact {
  readonly frameworkVersion: typeof MLB_239_FRAMEWORK_VERSION;
  readonly artifactId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly datasetHash: string;
  readonly configurationHash: string;
  readonly normalization: FrozenNormalizationArtifact;
  readonly model: ExpectedRunsModel;
  readonly parameterHash: string;
  readonly artifactHash: string;
}

export function freezeExpectedRunsArtifact(input: {
  artifactId: string;
  modelId: string;
  modelVersion: string;
  datasetHash: string;
  configurationHash: string;
  model: ExpectedRunsModel;
}): Readonly<FrozenExpectedRunsArtifact> {
  if (![input.artifactId, input.modelId, input.modelVersion].every(Boolean)
    || ![input.datasetHash, input.configurationHash].every((hash) => /^[a-f0-9]{64}$/i.test(hash))) {
    throw new Error("Artifact identity or hashes are invalid");
  }
  const transform = input.model.transform;
  const dimensions = [transform.featureNames.length, transform.medians.length,
    transform.means.length, transform.standardDeviations.length, input.model.coefficients.length];
  if (!dimensions.every((size) => size === dimensions[0])
    || ![...transform.medians, ...transform.means, ...transform.standardDeviations,
      ...input.model.coefficients, input.model.intercept].every(Number.isFinite)
    || transform.standardDeviations.some((value) => value <= 0)) {
    throw new Error("Model and normalization dimensions are invalid");
  }
  const normalizationBase = {
    version: MLB_239_NORMALIZATION_VERSION as typeof MLB_239_NORMALIZATION_VERSION,
    featureSchema: input.model.featureSchema,
    featureNames: transform.featureNames,
    medians: transform.medians,
    means: transform.means,
    standardDeviations: transform.standardDeviations,
  };
  const normalization = {
    ...normalizationBase,
    normalizationHash: stableLocalHash(normalizationBase),
  };
  const parameterHash = stableLocalHash({
    family: input.model.modelFamily, intercept: input.model.intercept,
    coefficients: input.model.coefficients, regularization: input.model.regularization,
    alpha: input.model.alpha,
  });
  const base = {
    frameworkVersion: MLB_239_FRAMEWORK_VERSION as typeof MLB_239_FRAMEWORK_VERSION,
    artifactId: input.artifactId,
    modelId: input.modelId,
    modelVersion: input.modelVersion,
    datasetHash: input.datasetHash,
    configurationHash: input.configurationHash,
    normalization,
    model: input.model,
    parameterHash,
  };
  return deepFreeze({ ...base, artifactHash: stableLocalHash(base) });
}

export interface Mlb239RunOutput {
  readonly schemaVersion: typeof MLB_239_OUTPUT_VERSION;
  readonly sport: "MLB";
  readonly gameId: string;
  readonly featureSnapshotId: string;
  readonly featureHash: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly configurationHash: string;
  readonly normalizationHash: string;
  readonly parameterHash: string;
  readonly generatedAt: string;
  readonly homeExpectedRunsExact: number;
  readonly awayExpectedRunsExact: number;
  readonly projectedTotalExact: number;
  readonly projectedMarginExact: number;
  readonly homeWinProbability: number;
  readonly awayWinProbability: number;
  readonly regulationTieProbability: number;
  readonly distributionVersion: typeof MLB_239_DISTRIBUTION_VERSION;
  readonly distributionFormula: "P(H>A)+0.5*P(H=A)";
  readonly officialUnits: 0;
  readonly publicationStatus: "NOT_PUBLISHABLE";
  readonly marketFree: true;
  readonly forecastHash: string;
}

const FORBIDDEN_MARKET_KEY = /(market|odds|moneyline|sportsbook|price|line|edge|ev|clv|units|impliedprobability)/i;
export function assertMarketFree239(value: unknown, path = "$"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((child, index) => assertMarketFree239(child, `${path}[${index}]`));
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_MARKET_KEY.test(key.replace(/[^a-z0-9]/gi, ""))) {
      throw new Error(`Market field forbidden in forecast input: ${path}.${key}`);
    }
    assertMarketFree239(child, `${path}.${key}`);
  }
}

export function buildMlb239RunOutput(input: {
  gameId: string;
  featureSnapshotId: string;
  featureHash: string;
  generatedAt: string;
  homeExpectedRuns: number;
  awayExpectedRuns: number;
  artifact: FrozenExpectedRunsArtifact;
  distribution: Readonly<{ kind: "poisson" | "nb2"; alpha?: number; tailTolerance?: number }>;
  featurePayload: unknown;
}): Readonly<Mlb239RunOutput> {
  assertMarketFree239(input.featurePayload);
  assertIso(input.generatedAt, "generatedAt");
  if (!input.gameId || !input.featureSnapshotId || !/^[a-f0-9]{64}$/i.test(input.featureHash)) {
    throw new Error("Forecast feature identity is incomplete");
  }
  const score = projectedScoreContract(input.homeExpectedRuns, input.awayExpectedRuns);
  const distribution = convolveIndependentScores(input.homeExpectedRuns, input.awayExpectedRuns, input.distribution);
  const base = {
    schemaVersion: MLB_239_OUTPUT_VERSION as typeof MLB_239_OUTPUT_VERSION,
    sport: "MLB" as const,
    gameId: input.gameId,
    featureSnapshotId: input.featureSnapshotId,
    featureHash: input.featureHash,
    modelId: input.artifact.modelId,
    modelVersion: input.artifact.modelVersion,
    artifactId: input.artifact.artifactId,
    artifactHash: input.artifact.artifactHash,
    configurationHash: input.artifact.configurationHash,
    normalizationHash: input.artifact.normalization.normalizationHash,
    parameterHash: input.artifact.parameterHash,
    generatedAt: input.generatedAt,
    homeExpectedRunsExact: score.home_expected_runs_exact,
    awayExpectedRunsExact: score.away_expected_runs_exact,
    projectedTotalExact: score.projected_total_exact,
    projectedMarginExact: score.projected_margin_exact,
    homeWinProbability: distribution.homeWinProbability,
    awayWinProbability: distribution.awayWinProbability,
    regulationTieProbability: distribution.regulationTieProbability,
    distributionVersion: MLB_239_DISTRIBUTION_VERSION as typeof MLB_239_DISTRIBUTION_VERSION,
    distributionFormula: "P(H>A)+0.5*P(H=A)" as const,
    officialUnits: 0 as const,
    publicationStatus: "NOT_PUBLISHABLE" as const,
    marketFree: true as const,
  };
  return deepFreeze({ ...base, forecastHash: stableLocalHash(base) });
}

export interface Mlb239ExecutorIdentity {
  readonly sport: "MLB";
  readonly modelId: string;
  readonly modelVersion: string;
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly configurationHash: string;
  readonly normalizationHash: string;
  readonly parameterHash: string;
  readonly outputSchemaVersion: typeof MLB_239_OUTPUT_VERSION;
}

export function validateExactLiveExecutor239(
  identity: Mlb239ExecutorIdentity,
  artifact: FrozenExpectedRunsArtifact,
): true {
  const expected: Mlb239ExecutorIdentity = {
    sport: "MLB",
    modelId: artifact.modelId,
    modelVersion: artifact.modelVersion,
    artifactId: artifact.artifactId,
    artifactHash: artifact.artifactHash,
    configurationHash: artifact.configurationHash,
    normalizationHash: artifact.normalization.normalizationHash,
    parameterHash: artifact.parameterHash,
    outputSchemaVersion: MLB_239_OUTPUT_VERSION,
  };
  if (stableSerialize(identity) !== stableSerialize(expected)) {
    throw new Error("Live executor does not exactly match frozen challenger identity");
  }
  return true;
}

export interface Mlb239ShadowRecord {
  readonly recordId: string;
  readonly idempotencyKey: string;
  readonly forecast: Mlb239RunOutput;
  readonly recordedAt: string;
  readonly officialUnits: 0;
  readonly publicationStatus: "NOT_PUBLISHABLE";
}

export class InMemoryMlb239ShadowStore {
  readonly #records = new Map<string, Readonly<Mlb239ShadowRecord>>();

  append(forecast: Mlb239RunOutput, recordedAt: string): Readonly<Mlb239ShadowRecord> {
    validateForecast(forecast);
    assertIso(recordedAt, "recordedAt");
    const idempotencyKey = stableLocalHash({
      gameId: forecast.gameId, featureSnapshotId: forecast.featureSnapshotId,
      artifactHash: forecast.artifactHash,
    });
    const existing = this.#records.get(idempotencyKey);
    if (existing) {
      if (existing.forecast.forecastHash !== forecast.forecastHash) {
        throw new Error("Conflicting shadow forecast for immutable idempotency key");
      }
      return existing;
    }
    const base = {
      idempotencyKey, forecast: clone(forecast), recordedAt,
      officialUnits: 0 as const, publicationStatus: "NOT_PUBLISHABLE" as const,
    };
    const record = deepFreeze({ recordId: stableLocalHash(base), ...base });
    this.#records.set(idempotencyKey, record);
    return record;
  }

  list(): readonly Readonly<Mlb239ShadowRecord>[] {
    return Object.freeze([...this.#records.values()]);
  }
}

export interface Mlb239FinalOutcome {
  readonly gameId: string;
  readonly status: "FINAL";
  readonly homeRuns: number;
  readonly awayRuns: number;
  readonly completedAt: string;
  readonly outcomeHash: string;
}

export function pairMlb239FinalOutcome(forecast: Mlb239RunOutput, outcome: Mlb239FinalOutcome) {
  validateForecast(forecast);
  if (forecast.gameId !== outcome.gameId || outcome.status !== "FINAL"
    || ![outcome.homeRuns, outcome.awayRuns].every((value) =>
      Number.isInteger(value) && value >= 0)
    || outcome.outcomeHash !== stableLocalHash({
      gameId: outcome.gameId, status: outcome.status, homeRuns: outcome.homeRuns,
      awayRuns: outcome.awayRuns, completedAt: outcome.completedAt,
    })) {
    throw new Error("Final outcome is invalid or does not match forecast");
  }
  const base = { forecastHash: forecast.forecastHash, outcomeHash: outcome.outcomeHash,
    gameId: forecast.gameId };
  return deepFreeze({ ...base, pairHash: stableLocalHash(base), forecast, outcome });
}

export function evaluateMlb239Pairs(pairs: readonly ReturnType<typeof pairMlb239FinalOutcome>[]) {
  if (!pairs.length) throw new Error("No final outcome pairs");
  if (new Set(pairs.map((pair) => pair.forecast.forecastHash)).size !== pairs.length) {
    throw new Error("Duplicate forecasts in metric cohort");
  }
  const run = runMetrics(pairs.map(({ forecast, outcome }) => ({
    predictedHome: forecast.homeExpectedRunsExact,
    predictedAway: forecast.awayExpectedRunsExact,
    actualHome: outcome.homeRuns,
    actualAway: outcome.awayRuns,
  })));
  const probability = probabilityMetrics(pairs.map(({ forecast, outcome }) => ({
    probability: forecast.homeWinProbability,
    outcome: (outcome.homeRuns > outcome.awayRuns ? 1 : 0) as 0 | 1,
  })));
  return deepFreeze({ sampleSize: pairs.length, runs: run, probability,
    cohortHash: stableLocalHash(pairs.map((pair) => pair.pairHash).sort()) });
}

/** Market data is accepted only here, downstream of the already-hashed forecast. */
export function compareMlb239ToMarket(
  forecast: Mlb239RunOutput,
  market: Readonly<{ homeAmerican: number; awayAmerican: number; capturedAt: string }>,
) {
  validateForecast(forecast);
  const implied = (odds: number) => odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
  if (![market.homeAmerican, market.awayAmerican].every((odds) =>
    Number.isFinite(odds) && odds !== 0) || !Number.isFinite(Date.parse(market.capturedAt))) {
    throw new Error("Invalid downstream market");
  }
  const home = implied(market.homeAmerican);
  const away = implied(market.awayAmerican);
  const sum = home + away;
  const noVigHome = home / sum;
  return deepFreeze({
    forecastHash: forecast.forecastHash,
    capturedAt: market.capturedAt,
    noVigHome,
    homeProbabilityEdge: forecast.homeWinProbability - noVigHome,
    fairHomeAmerican: fairAmericanOdds(forecast.homeWinProbability),
    downstreamOnly: true as const,
    officialUnits: 0 as const,
    publicationStatus: "NOT_PUBLISHABLE" as const,
  });
}

export function evaluateMlb239Calibration(rows: readonly {
  rawProbability: number;
  calibratedProbability: number;
  outcome: 0 | 1;
}[]) {
  if (!rows.length) throw new Error("Calibration evaluation rows are empty");
  const raw = probabilityMetrics(rows.map((row) => ({
    probability: row.rawProbability, outcome: row.outcome,
  })));
  const calibrated = probabilityMetrics(rows.map((row) => ({
    probability: row.calibratedProbability, outcome: row.outcome,
  })));
  return deepFreeze({
    sampleSize: rows.length, raw, calibrated,
    deltas: { brier: calibrated.brier - raw.brier, logLoss: calibrated.logLoss - raw.logLoss,
      ece: calibrated.ece - raw.ece },
  });
}

export interface Mlb239ReadinessEvidence {
  readonly pipeline: { readonly collectorHealthy: boolean; readonly pitIntegrity: boolean };
  readonly model: { readonly artifactFrozen: boolean; readonly executorExact: boolean; readonly reproducible: boolean };
  readonly shadow: { readonly forecasts: number; readonly immutable: boolean; readonly marketFree: boolean };
  readonly evidence: { readonly finalPairs: number; readonly metricsFrozen: boolean; readonly calibrationEvaluated: boolean };
}

export function buildMlb239Readiness(input: Mlb239ReadinessEvidence) {
  const pipelineReady = input.pipeline.collectorHealthy && input.pipeline.pitIntegrity;
  const modelReady = input.model.artifactFrozen && input.model.executorExact && input.model.reproducible;
  const shadowReady = input.shadow.forecasts > 0 && input.shadow.immutable && input.shadow.marketFree;
  const evidenceReady = input.evidence.finalPairs > 0 && input.evidence.metricsFrozen
    && input.evidence.calibrationEvaluated;
  return deepFreeze({
    frameworkVersion: MLB_239_FRAMEWORK_VERSION,
    pipeline: { ready: pipelineReady, evidence: input.pipeline },
    model: { ready: modelReady, evidence: input.model },
    shadow: { ready: shadowReady, evidence: input.shadow },
    evidence: { ready: evidenceReady, evidence: input.evidence },
    promotion: {
      ready: false as const,
      possible: false as const,
      status: "IMPOSSIBLE_IN_NON_PRODUCTION_FRAMEWORK" as const,
      champion: MLB_239_CURRENT_CHAMPION,
    },
    productionChanged: false as const,
  });
}

function validateForecast(forecast: Mlb239RunOutput): void {
  if (forecast.sport !== "MLB" || forecast.schemaVersion !== MLB_239_OUTPUT_VERSION
    || forecast.officialUnits !== 0 || forecast.publicationStatus !== "NOT_PUBLISHABLE"
    || forecast.marketFree !== true) {
    throw new Error("Only market-free, nonpublishable MLB shadow forecasts are accepted");
  }
  const { forecastHash: _hash, ...base } = forecast;
  if (stableLocalHash(base) !== forecast.forecastHash) throw new Error("Forecast hash mismatch");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
  }
  return value;
}