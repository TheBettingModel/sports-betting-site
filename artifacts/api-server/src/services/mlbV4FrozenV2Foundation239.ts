import { MLB_224C_FEATURE_SCHEMA } from "./mlbExpectedRuns224C";
import {
  applyMlbFeatureTransform,
  fitMlbFeatureTransform,
  flattenMlbSideFeatures,
  stableLocalHash,
  type FittedTransform,
  type MlbSideFeatureSchema,
  type MlbSideFeatureVector,
} from "./mlbV4ExpectedRuns";
import {
  MLB_V4_FEATURE_DEFINITIONS,
  MLB_V4_FEATURE_ORDER,
  type AdapterEnvelope,
} from "./mlbV4InputContract238";

export const MLB_V4_FROZEN_V2_CONTRACT_ID = "mlb-v4-frozen-parity-baseline-v2";
export const MLB_V4_FROZEN_V2_CONTRACT_VERSION = 2;
export const MLB_V4_FROZEN_V2_LIVE_SCHEMA = "mlb-v4-parity-baseline-input-v2";
export const MLB_V4_FROZEN_V2_HISTORICAL_SCHEMA = "mlb-v4-moneyline-237-flat-38-v1";

export const MLB_V4_FROZEN_V2_SCHEMA: MlbSideFeatureSchema = Object.freeze({
  ownOffense: Object.freeze(["priorGames", "seasonGames", "seasonRunsPerGame"]),
  leagueEnvironment: Object.freeze(["isHome"]),
  opponentBullpen: Object.freeze([]),
});

export const MLB_V4_FROZEN_V2_FEATURE_ORDER = Object.freeze([
  "homeMinusAway.ownOffense.priorGames",
  "homeMinusAway.ownOffense.seasonGames",
  "homeMinusAway.ownOffense.seasonRunsPerGame",
  "homeMinusAway.leagueEnvironment.isHome",
] as const);
export const MLB_V4_FROZEN_V2_FEATURE_ORDER_HASH =
  stableLocalHash(MLB_V4_FROZEN_V2_FEATURE_ORDER);

export type V2Disposition = "RETAINED" | "DROPPED";
export type V2DropReason =
  | "LIVE_WINDOW_CROSSES_SEASONS"
  | "LIVE_HOME_AWAY_SPLIT_DEFECT"
  | "LIVE_LEAGUE_BINDING_NOT_EXACT"
  | "LIVE_FIELD_NOT_AVAILABLE"
  | "LIVE_BULLPEN_DUPLICATION_AND_NULL_COERCION";

const retained = new Set<string>(MLB_V4_FROZEN_V2_FEATURE_ORDER);
export const MLB_V4_FROZEN_V2_DISPOSITIONS = Object.freeze(
  MLB_V4_FEATURE_DEFINITIONS.map((definition) => {
    const keep = retained.has(definition.canonicalName);
    let reasonCode: V2DropReason | null = null;
    if (!keep) {
      if (/runsPerGame(5|10|20|30)$/.test(definition.researchName)) {
        reasonCode = "LIVE_WINDOW_CROSSES_SEASONS";
      } else if (definition.researchName === "ownOffense.homeAwayRunsPerGame") {
        reasonCode = "LIVE_HOME_AWAY_SPLIT_DEFECT";
      } else if (definition.researchName === "leagueEnvironment.seasonRunsPerTeamGame") {
        reasonCode = "LIVE_LEAGUE_BINDING_NOT_EXACT";
      } else if (definition.provenanceClass === "HISTORICAL_PIT_AND_DEFECTIVE_LIVE_ANALOG") {
        reasonCode = "LIVE_BULLPEN_DUPLICATION_AND_NULL_COERCION";
      } else {
        reasonCode = "LIVE_FIELD_NOT_AVAILABLE";
      }
    }
    return Object.freeze({
      canonicalName: definition.canonicalName,
      source238Status: definition.status,
      disposition: keep ? "RETAINED" as const : "DROPPED" as const,
      reasonCode,
      reassessment: keep
        ? "V2 binds both adapters to the same raw definition and fits a new TRAIN-only transform."
        : definition.mappingNote,
    });
  }),
);
export const MLB_V4_FROZEN_V2_DISPOSITION_HASH =
  stableLocalHash(MLB_V4_FROZEN_V2_DISPOSITIONS);

export const MLB_V4_FROZEN_V2_DEFINITIONS = Object.freeze(
  MLB_V4_FEATURE_DEFINITIONS
    .filter((definition) => retained.has(definition.canonicalName))
    .map((definition) => Object.freeze({
      canonicalName: definition.canonicalName,
      researchName: definition.researchName,
      dtype: "number" as const,
      unit: definition.unit,
      allowedRange: definition.allowedRange,
      semantics: definition.semantics,
      orientation: "HOME_MINUS_AWAY" as const,
      historicalSource: definition.historicalSourcePath,
      liveSource: `features.{side}.${definition.researchName}`,
      rawTransform: "IDENTITY" as const,
      modelTransform: "TRAIN_MEDIAN_IMPUTE_POPULATION_ZSCORE_PER_SIDE_THEN_HOME_MINUS_AWAY" as const,
      missingness: "RAW_NULL_PRESERVED_THEN_FROZEN_TRAIN_MEDIAN" as const,
      pitRule: "ALL_SOURCE_EVIDENCE_AT_OR_BEFORE_FEATURE_CUTOFF" as const,
      semanticParity: "PASS" as const,
      unitParity: "PASS" as const,
      orientationParity: "PASS" as const,
      missingnessParity: "PASS" as const,
      transformParity: "PASS_WITH_V2_TRAIN_FITTED_ARTIFACT" as const,
      pitParity: "PASS" as const,
    })),
);

const contractBody = Object.freeze({
  contractId: MLB_V4_FROZEN_V2_CONTRACT_ID,
  contractVersion: MLB_V4_FROZEN_V2_CONTRACT_VERSION,
  state: "FROZEN_BASELINE_CONTRACT" as const,
  historicalSchema: MLB_V4_FROZEN_V2_HISTORICAL_SCHEMA,
  liveSchema: MLB_V4_FROZEN_V2_LIVE_SCHEMA,
  featureOrder: MLB_V4_FROZEN_V2_FEATURE_ORDER,
  featureOrderHash: MLB_V4_FROZEN_V2_FEATURE_ORDER_HASH,
  definitions: MLB_V4_FROZEN_V2_DEFINITIONS,
  dispositionsHash: MLB_V4_FROZEN_V2_DISPOSITION_HASH,
  normalization: "A separately hashed artifact fit exclusively from TRAIN side rows is mandatory",
  target: Object.freeze({
    name: "homeWin",
    dtype: "binary",
    positiveClass: "HOME_WIN",
    derivation: "final home runs > final away runs",
    ties: "REJECT",
    featureUse: "PROHIBITED",
    availability: "HISTORICAL_FINAL_ONLY",
  }),
  outputOrientation: "P(HOME_WIN), P(AWAY_WIN)",
});
export const MLB_V4_FROZEN_V2_CONTRACT = Object.freeze({
  ...contractBody,
  contractHash: stableLocalHash(contractBody),
});
export const MLB_V4_FROZEN_V2_HISTORICAL_ADAPTER_HASH = stableLocalHash({
  contractHash: MLB_V4_FROZEN_V2_CONTRACT.contractHash,
  kind: "HISTORICAL",
  schema: MLB_V4_FROZEN_V2_HISTORICAL_SCHEMA,
  protocol: "STRICT_38_SOURCE_TO_RETAINED_4_RAW_SIDES_V1",
});
export const MLB_V4_FROZEN_V2_LIVE_ADAPTER_HASH = stableLocalHash({
  contractHash: MLB_V4_FROZEN_V2_CONTRACT.contractHash,
  kind: "LIVE",
  schema: MLB_V4_FROZEN_V2_LIVE_SCHEMA,
  protocol: "STRICT_RETAINED_4_RAW_SIDES_V1",
});
export const MLB_V4_FROZEN_V2_TARGET_HASH = stableLocalHash(contractBody.target);

type Json = Record<string, unknown>;
const MARKET = /^(odds|moneyline|runline|spread|total|sportsbook|market|price|vig|clv|edge|pinnacle)$/i;
const OUTCOME = /^(actualstarter|actuallineup|actualruns|homeruns|awayruns|finalscore|winner|result|target)$/i;
const OTHER_SPORT = /^(nfl|ncaaf|nba|wnba|nhl|soccer|ufc)/i;

function firewall(value: unknown, path = "$"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((entry, index) => firewall(entry, `${path}[${index}]`));
  for (const [key, child] of Object.entries(value as Json)) {
    const compact = key.replace(/[^a-z0-9]/gi, "");
    if (MARKET.test(compact)) fail("MARKET_FIREWALL", `${path}.${key}`);
    if (OUTCOME.test(compact)) fail("OUTCOME_FIREWALL", `${path}.${key}`);
    if (OTHER_SPORT.test(compact)) fail("CROSS_SPORT_FIREWALL", `${path}.${key}`);
    firewall(child, `${path}.${key}`);
  }
}

export type V2FailureCode =
  | "SCHEMA_MISMATCH" | "MARKET_FIREWALL" | "OUTCOME_FIREWALL" | "CROSS_SPORT_FIREWALL"
  | "PIT_PROVENANCE_INCOMPLETE" | "PIT_TIMESTAMP_INVALID" | "PIT_CHRONOLOGY_INVALID"
  | "FEATURE_SHAPE_INVALID" | "FEATURE_VALUE_INVALID" | "FEATURE_RANGE_INVALID"
  | "NORMALIZATION_BINDING_INVALID" | "SPLIT_INVALID" | "BENCHMARK_FIREWALL"
  | "TARGET_INVALID" | "TRAINING_GATE_CLOSED";

export class MlbV4V2ContractError extends Error {
  constructor(public readonly code: V2FailureCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "MlbV4V2ContractError";
  }
}
function fail(code: V2FailureCode, detail: string): never {
  throw new MlbV4V2ContractError(code, detail);
}

function chronology(input: AdapterEnvelope): void {
  if (input.sourceEvidenceComplete !== true || input.sourceEvidenceTimes.length === 0) {
    fail("PIT_PROVENANCE_INCOMPLETE", "complete non-empty source evidence is required");
  }
  const timestamps = [
    input.featureCutoff, input.predictionTime, input.scheduledFirstPitch, ...input.sourceEvidenceTimes,
  ];
  if (timestamps.some((value) => !Number.isFinite(Date.parse(value)))) {
    fail("PIT_TIMESTAMP_INVALID", "all timestamps must be ISO-parseable");
  }
  const cutoff = Date.parse(input.featureCutoff);
  if (input.sourceEvidenceTimes.some((value) => Date.parse(value) > cutoff)
    || cutoff > Date.parse(input.predictionTime)
    || Date.parse(input.predictionTime) >= Date.parse(input.scheduledFirstPitch)) {
    fail("PIT_CHRONOLOGY_INVALID", "evidence <= cutoff <= prediction < first pitch is required");
  }
}

function subset(source: MlbSideFeatureVector, side: "home" | "away"): MlbSideFeatureVector {
  const values: MlbSideFeatureVector = {
    ownOffense: {
      priorGames: source.ownOffense.priorGames,
      seasonGames: source.ownOffense.seasonGames,
      seasonRunsPerGame: source.ownOffense.seasonRunsPerGame,
    },
    leagueEnvironment: { isHome: source.leagueEnvironment.isHome },
    opponentBullpen: {},
  };
  const flat = flattenMlbSideFeatures(values, MLB_V4_FROZEN_V2_SCHEMA);
  flat.forEach((value, index) => {
    if (value !== null && value !== undefined && (!Number.isFinite(value) || value < 0)) {
      fail("FEATURE_RANGE_INVALID", `${side}.${MLB_V4_FROZEN_V2_FEATURE_ORDER[index]}`);
    }
    if (index === 3 && value !== 0 && value !== 1) {
      fail("FEATURE_RANGE_INVALID", `${side}.leagueEnvironment.isHome`);
    }
  });
  return values;
}

function exactKeys(value: unknown, expected: readonly string[], path: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("FEATURE_SHAPE_INVALID", `${path} must be an object`);
  }
  const actual = Object.keys(value as Json).sort();
  if (stableLocalHash(actual) !== stableLocalHash([...expected].sort())) {
    fail("FEATURE_SHAPE_INVALID", `${path} allowlist mismatch`);
  }
}

export interface V2HistoricalInput extends AdapterEnvelope {
  schemaVersion: typeof MLB_V4_FROZEN_V2_HISTORICAL_SCHEMA;
  home: MlbSideFeatureVector;
  away: MlbSideFeatureVector;
}
export interface V2LiveSide {
  ownOffense: {
    priorGames: number | null;
    seasonGames: number | null;
    seasonRunsPerGame: number | null;
  };
  leagueEnvironment: { isHome: 0 | 1 };
}
export interface V2LiveInput extends AdapterEnvelope {
  schemaVersion: typeof MLB_V4_FROZEN_V2_LIVE_SCHEMA;
  pitSafe: true;
  features: { home: V2LiveSide; away: V2LiveSide };
}
export interface V2CanonicalVector {
  contractHash: string;
  gameId: string;
  scheduledFirstPitch: string;
  featureCutoff: string;
  evidenceTier: AdapterEnvelope["evidenceTier"];
  home: MlbSideFeatureVector;
  away: MlbSideFeatureVector;
  rawHomeThenAway: readonly (number | null | undefined)[];
  rawHomeMinusAway: readonly (number | null)[];
  vectorHash: string;
  provenanceHash: string;
}

function adapt(kind: "HISTORICAL" | "LIVE", input: AdapterEnvelope,
  homeSource: MlbSideFeatureVector, awaySource: MlbSideFeatureVector): V2CanonicalVector {
  firewall(input);
  if (input.evidenceTier === "INELIGIBLE") {
    fail("FEATURE_SHAPE_INVALID", "INELIGIBLE evidence tier cannot materialize a vector");
  }
  chronology(input);
  const home = subset(homeSource, "home");
  const away = subset(awaySource, "away");
  const homeRaw = flattenMlbSideFeatures(home, MLB_V4_FROZEN_V2_SCHEMA);
  const awayRaw = flattenMlbSideFeatures(away, MLB_V4_FROZEN_V2_SCHEMA);
  const rawHomeMinusAway = homeRaw.map((value, index) =>
    value == null || awayRaw[index] == null ? null : value - awayRaw[index]!);
  const rawHomeThenAway = Object.freeze([...homeRaw, ...awayRaw]);
  const vectorHash = stableLocalHash({
    contractHash: MLB_V4_FROZEN_V2_CONTRACT.contractHash, rawHomeThenAway, rawHomeMinusAway,
  });
  const provenanceHash = stableLocalHash({
    kind, gameId: input.gameId, featureCutoff: input.featureCutoff,
    predictionTime: input.predictionTime, scheduledFirstPitch: input.scheduledFirstPitch,
    evidenceTier: input.evidenceTier, sourceEvidenceTimes: input.sourceEvidenceTimes,
    sourceEvidenceComplete: input.sourceEvidenceComplete, vectorHash,
  });
  return Object.freeze({
    contractHash: MLB_V4_FROZEN_V2_CONTRACT.contractHash, gameId: input.gameId,
    scheduledFirstPitch: input.scheduledFirstPitch, featureCutoff: input.featureCutoff,
    evidenceTier: input.evidenceTier, home, away, rawHomeThenAway,
    rawHomeMinusAway: Object.freeze(rawHomeMinusAway), vectorHash, provenanceHash,
  });
}

export function adaptHistoricalMlbV4V2(input: V2HistoricalInput): V2CanonicalVector {
  if (input.schemaVersion !== MLB_V4_FROZEN_V2_HISTORICAL_SCHEMA) {
    fail("SCHEMA_MISMATCH", "historical schema");
  }
  try {
    flattenMlbSideFeatures(input.home, MLB_224C_FEATURE_SCHEMA);
    flattenMlbSideFeatures(input.away, MLB_224C_FEATURE_SCHEMA);
  } catch (error) {
    fail("FEATURE_SHAPE_INVALID", error instanceof Error ? error.message : "historical source vector");
  }
  return adapt("HISTORICAL", input, input.home, input.away);
}
export function adaptLiveMlbV4V2(input: V2LiveInput): V2CanonicalVector {
  if (input.schemaVersion !== MLB_V4_FROZEN_V2_LIVE_SCHEMA || input.pitSafe !== true) {
    fail("SCHEMA_MISMATCH", "live v2 schema/PIT binding");
  }
  exactKeys(input.features, ["home", "away"], "features");
  for (const sideName of ["home", "away"] as const) {
    exactKeys(input.features[sideName], ["ownOffense", "leagueEnvironment"], `features.${sideName}`);
    exactKeys(input.features[sideName].ownOffense,
      ["priorGames", "seasonGames", "seasonRunsPerGame"], `features.${sideName}.ownOffense`);
    exactKeys(input.features[sideName].leagueEnvironment, ["isHome"],
      `features.${sideName}.leagueEnvironment`);
  }
  const side = (value: V2LiveSide): MlbSideFeatureVector => ({
    ownOffense: value.ownOffense,
    leagueEnvironment: value.leagueEnvironment,
    opponentBullpen: {},
  });
  return adapt("LIVE", input, side(input.features.home), side(input.features.away));
}

export type V2Cohort = "TRAIN" | "VALIDATION" | "HISTORICAL_BENCHMARK_ONLY";
export interface V2DatasetGame {
  vector: V2CanonicalVector;
  scheduledFirstPitch: string;
  cohort: V2Cohort;
  homeRuns: number;
  awayRuns: number;
  featureSnapshotHash: string;
}
export interface V2Dataset {
  contractHash: string;
  games: readonly V2DatasetGame[];
  cohortCounts: Readonly<Record<V2Cohort, number>>;
  cohortHashes: Readonly<Record<V2Cohort, string>>;
  datasetHash: string;
  consumedBenchmarkIdsHash: string;
}

export function materializeMlbV4V2Dataset(
  input: readonly V2DatasetGame[],
  consumedBenchmarkIds: ReadonlySet<string>,
): V2Dataset {
  if (!input.length) fail("SPLIT_INVALID", "dataset is empty");
  const games = [...input].sort((a, b) =>
    a.scheduledFirstPitch.localeCompare(b.scheduledFirstPitch) || a.vector.gameId.localeCompare(b.vector.gameId));
  if (new Set(games.map((game) => game.vector.gameId)).size !== games.length) {
    fail("SPLIT_INVALID", "duplicate game");
  }
  for (const game of games) {
    if (game.vector.contractHash !== MLB_V4_FROZEN_V2_CONTRACT.contractHash
      || game.scheduledFirstPitch !== game.vector.scheduledFirstPitch
      || !Number.isFinite(Date.parse(game.scheduledFirstPitch))) {
      fail("SPLIT_INVALID", `invalid binding for ${game.vector.gameId}`);
    }
    if (![game.homeRuns, game.awayRuns].every((value) =>
      Number.isInteger(value) && value >= 0) || game.homeRuns === game.awayRuns) {
      fail("TARGET_INVALID", game.vector.gameId);
    }
    const consumed = consumedBenchmarkIds.has(game.vector.gameId);
    if (consumed !== (game.cohort === "HISTORICAL_BENCHMARK_ONLY")) {
      fail("BENCHMARK_FIREWALL", `${game.vector.gameId} benchmark disposition mismatch`);
    }
  }
  const bounds = (cohort: V2Cohort) => games.filter((game) => game.cohort === cohort);
  const train = bounds("TRAIN"), validation = bounds("VALIDATION"), benchmark = bounds("HISTORICAL_BENCHMARK_ONLY");
  if (!train.length || !validation.length || !benchmark.length
    || train.at(-1)!.scheduledFirstPitch >= validation[0]!.scheduledFirstPitch
    || validation.at(-1)!.scheduledFirstPitch >= benchmark[0]!.scheduledFirstPitch) {
    fail("SPLIT_INVALID", "requires non-empty chronological TRAIN < VALIDATION < HISTORICAL_BENCHMARK_ONLY");
  }
  const cohortIds = (cohort: V2Cohort) =>
    games.filter((game) => game.cohort === cohort).map((game) => game.vector.gameId);
  const cohortCounts = Object.freeze({
    TRAIN: train.length, VALIDATION: validation.length, HISTORICAL_BENCHMARK_ONLY: benchmark.length,
  });
  const cohortHashes = Object.freeze({
    TRAIN: stableLocalHash(cohortIds("TRAIN")),
    VALIDATION: stableLocalHash(cohortIds("VALIDATION")),
    HISTORICAL_BENCHMARK_ONLY: stableLocalHash(cohortIds("HISTORICAL_BENCHMARK_ONLY")),
  });
  const consumedBenchmarkIdsHash = stableLocalHash([...consumedBenchmarkIds].sort());
  const body = {
    contractHash: MLB_V4_FROZEN_V2_CONTRACT.contractHash,
    rows: games.map((game) => ({
      gameId: game.vector.gameId, scheduledFirstPitch: game.scheduledFirstPitch,
      cohort: game.cohort, vectorHash: game.vector.vectorHash,
      featureSnapshotHash: game.featureSnapshotHash,
      target: game.homeRuns > game.awayRuns ? 1 : 0,
    })),
    cohortCounts, cohortHashes, consumedBenchmarkIdsHash,
  };
  return Object.freeze({
    contractHash: MLB_V4_FROZEN_V2_CONTRACT.contractHash,
    games: Object.freeze(games), cohortCounts, cohortHashes,
    datasetHash: stableLocalHash(body), consumedBenchmarkIdsHash,
  });
}

export interface V2NormalizationArtifact {
  artifactType: "MLB_V4_V2_TRAIN_FITTED_NORMALIZATION";
  contractHash: string;
  datasetHash: string;
  trainCohortHash: string;
  trainingGameCount: number;
  trainingSideRowCount: number;
  transform: FittedTransform;
  transformHash: string;
  artifactHash: string;
}

export function fitMlbV4V2Normalization(dataset: V2Dataset): V2NormalizationArtifact {
  const train = dataset.games.filter((game) => game.cohort === "TRAIN");
  if (!train.length || dataset.contractHash !== MLB_V4_FROZEN_V2_CONTRACT.contractHash) {
    fail("NORMALIZATION_BINDING_INVALID", "TRAIN and exact contract binding required");
  }
  const transform = fitMlbFeatureTransform(
    train.flatMap((game) => [game.vector.home, game.vector.away]),
    MLB_V4_FROZEN_V2_SCHEMA,
  );
  const transformHash = stableLocalHash(transform);
  const base = {
    artifactType: "MLB_V4_V2_TRAIN_FITTED_NORMALIZATION" as const,
    contractHash: dataset.contractHash, datasetHash: dataset.datasetHash,
    trainCohortHash: dataset.cohortHashes.TRAIN,
    trainingGameCount: train.length, trainingSideRowCount: train.length * 2,
    transform, transformHash,
  };
  return Object.freeze({ ...base, artifactHash: stableLocalHash(base) });
}

export function applyMlbV4V2Normalization(
  vector: V2CanonicalVector,
  artifact: V2NormalizationArtifact,
): readonly number[] {
  if (vector.contractHash !== MLB_V4_FROZEN_V2_CONTRACT.contractHash
    || artifact.contractHash !== vector.contractHash
    || artifact.transformHash !== stableLocalHash(artifact.transform)
    || artifact.artifactHash !== stableLocalHash({
      artifactType: artifact.artifactType, contractHash: artifact.contractHash,
      datasetHash: artifact.datasetHash, trainCohortHash: artifact.trainCohortHash,
      trainingGameCount: artifact.trainingGameCount, trainingSideRowCount: artifact.trainingSideRowCount,
      transform: artifact.transform, transformHash: artifact.transformHash,
    })) {
    fail("NORMALIZATION_BINDING_INVALID", "normalization artifact hash or contract mismatch");
  }
  const home = applyMlbFeatureTransform(vector.home, MLB_V4_FROZEN_V2_SCHEMA, artifact.transform);
  const away = applyMlbFeatureTransform(vector.away, MLB_V4_FROZEN_V2_SCHEMA, artifact.transform);
  return Object.freeze(home.map((value, index) => value - away[index]!));
}

export const MLB_V4_V2_TRAINING_GATE_REQUIREMENTS = Object.freeze([
  "EXACT_CONTRACT_HASH",
  "NONEMPTY_CHRONOLOGICAL_COHORTS",
  "CONSUMED_BENCHMARK_QUARANTINED",
  "TRAIN_FITTED_NORMALIZATION_HASH_VERIFIED",
  "ZERO_MISSING_NORMALIZED_VALUES",
  "ZERO_PIT_MARKET_OUTCOME_CROSS_SPORT_VIOLATIONS",
] as const);
export function evaluateMlbV4V2TrainingGate(
  dataset: V2Dataset | null,
  artifact: V2NormalizationArtifact | null,
): Readonly<{ open: boolean; reasonCodes: readonly string[]; proofHash: string }> {
  const reasons: string[] = [];
  if (!dataset) reasons.push("DEVELOPMENT_DATASET_NOT_PROVIDED");
  if (!artifact) reasons.push("TRAIN_NORMALIZATION_NOT_PROVIDED");
  if (dataset && artifact) {
    if (dataset.contractHash !== MLB_V4_FROZEN_V2_CONTRACT.contractHash) reasons.push("CONTRACT_HASH_MISMATCH");
    if (artifact.datasetHash !== dataset.datasetHash
      || artifact.trainCohortHash !== dataset.cohortHashes.TRAIN) reasons.push("NORMALIZATION_DATASET_MISMATCH");
    try {
      for (const game of dataset.games.filter((row) => row.cohort !== "HISTORICAL_BENCHMARK_ONLY")) {
        if (applyMlbV4V2Normalization(game.vector, artifact).some((value) => !Number.isFinite(value))) {
          reasons.push("NONFINITE_MODEL_VECTOR");
          break;
        }
      }
    } catch {
      reasons.push("NORMALIZATION_ARTIFACT_INVALID");
    }
  }
  const result = { open: reasons.length === 0, reasonCodes: Object.freeze(reasons) };
  return Object.freeze({ ...result, proofHash: stableLocalHash({
    requirements: MLB_V4_V2_TRAINING_GATE_REQUIREMENTS,
    contractHash: MLB_V4_FROZEN_V2_CONTRACT.contractHash,
    datasetHash: dataset?.datasetHash ?? null, artifactHash: artifact?.artifactHash ?? null, ...result,
  }) });
}

export const MLB_V4_V2_DEFAULT_TRAINING_GATE = evaluateMlbV4V2TrainingGate(null, null);
export const MLB_V4_V2_EVIDENCE_TIERS = Object.freeze({
  BASELINE_CORE: "ELIGIBLE_FOR_V2",
  STARTER_CORE: "BASELINE_FIELDS_ONLY_STARTER_FIELDS_IGNORED",
  ENHANCED: "BASELINE_FIELDS_ONLY_ENHANCED_FIELDS_IGNORED",
  INELIGIBLE: "REJECT",
});

// Compile-time guard: Task 238 remains the immutable 38-field source inventory.
if (MLB_V4_FEATURE_ORDER.length !== 38
  || MLB_V4_FROZEN_V2_DISPOSITIONS.length !== MLB_V4_FEATURE_ORDER.length
  || MLB_224C_FEATURE_SCHEMA.ownOffense.length !== 8) {
  throw new Error("Task 238 source inventory changed; create a new contract version");
}