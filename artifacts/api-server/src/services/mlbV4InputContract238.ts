import { MLB_224C_FEATURE_SCHEMA } from "./mlbExpectedRuns224C";
import {
  flattenMlbSideFeatures,
  stableLocalHash,
  type FeatureValue,
  type MlbSideFeatureVector,
} from "./mlbV4ExpectedRuns";
import { MLB_V4_INPUT_SCHEMA, type EvidenceTier } from "./mlbV4LiveFoundation";

export const MLB_V4_CONTRACT_ID = "mlb-v4-model-input-contract-v1";
export const MLB_V4_CONTRACT_VERSION = 1;
export const MLB_V4_PARITY_TOLERANCE = 1e-12;
export const MLB_237_RESEARCH_SCHEMA = "mlb-v4-moneyline-237-flat-38-v1";
export const MLB_237_RESEARCH_TRANSFORM_HASH = "3677ed49c9e711ea5cde8796e0b4700007c0bf3769b197d2814200b9fa11d6f1";

const GROUPS = ["ownOffense", "leagueEnvironment", "opponentBullpen"] as const;
type Group = typeof GROUPS[number];
export type ParityStatus = "PASS" | "FAIL" | "PARTIAL" | "NOT_AVAILABLE" | "PROSPECTIVE_ONLY";

const RATE_FEATURES = new Set([
  "runsPerGame5", "runsPerGame10", "runsPerGame20", "runsPerGame30",
  "seasonRunsPerGame", "homeAwayRunsPerGame", "runsPerTeamGame7d",
  "runsPerTeamGame14d", "runsPerTeamGame30d", "seasonRunsPerTeamGame",
]);
const DECIMAL_FEATURES = new Set([
  "bullpenSeasonKPct", "bullpenSeasonBbPct", "bullpenSeasonKMinusBbPct",
  "bullpenSeasonHrRate", "bullpenFeatureCompleteness",
]);
const COUNT_FEATURES = new Set([
  "priorGames", "seasonGames", "relieversUsedLast1d", "relieversUsedLast2d",
  "backToBackRelievers", "threeDayRelievers", "sourceGameCount", "bullpenSampleSize",
]);

export interface MlbV4FeatureDefinition {
  canonicalName: string;
  researchName: string;
  historicalSourcePath: string;
  liveSourcePath: string | null;
  dtype: "number";
  unit: "binary" | "count" | "runs_per_game" | "innings" | "pitches" | "decimal_rate"
    | "earned_runs_per_9_innings" | "baserunners_per_inning" | "fielding_independent_runs_per_9";
  semantics: string;
  allowedRange: Readonly<{ minimum: number | null; maximum: number | null; finite: true }>;
  orientation: "HOME_MINUS_AWAY";
  rawAdapterTransform: "IDENTITY";
  requiredModelTransform: "TRAIN_MEDIAN_IMPUTE_POPULATION_ZSCORE_PER_SIDE_THEN_HOME_MINUS_AWAY";
  missingPolicy: "RAW_NULL_THEN_FROZEN_TRAIN_MEDIAN_REQUIRED";
  pitRequirement: "SOURCE_BEFORE_FEATURE_CUTOFF";
  provenanceClass: "HISTORICAL_PIT_AND_LIVE_PREGAME" | "HISTORICAL_PIT_ONLY"
    | "HISTORICAL_PIT_AND_DEFECTIVE_LIVE_ANALOG";
  sourceEvidenceType: "TEAM_COMPLETION_LEDGER" | "LEAGUE_COMPLETION_LEDGER" | "BULLPEN_BOXSCORE_REPLAY";
  historicalVersion: typeof MLB_237_RESEARCH_SCHEMA;
  liveVersion: typeof MLB_V4_INPUT_SCHEMA;
  semanticParity: ParityStatus;
  unitParity: ParityStatus;
  transformParity: ParityStatus;
  pitParity: ParityStatus;
  status: ParityStatus;
  mappingNote: string;
}

function unit(name: string): MlbV4FeatureDefinition["unit"] {
  if (name === "isHome") return "binary";
  if (COUNT_FEATURES.has(name)) return "count";
  if (name.toLowerCase().includes("innings")) return "innings";
  if (name.toLowerCase().includes("pitches")) return "pitches";
  if (name.toLowerCase().includes("whip")) return "baserunners_per_inning";
  if (name.toLowerCase().includes("fip")) return "fielding_independent_runs_per_9";
  if (name.toLowerCase().includes("era")) return "earned_runs_per_9_innings";
  if (DECIMAL_FEATURES.has(name)) return "decimal_rate";
  if (RATE_FEATURES.has(name)) return "runs_per_game";
  return "count";
}

function allowedRange(name: string): MlbV4FeatureDefinition["allowedRange"] {
  if (name === "isHome" || name === "bullpenFeatureCompleteness") {
    return Object.freeze({ minimum: 0, maximum: 1, finite: true as const });
  }
  if (name === "bullpenSeasonKMinusBbPct") {
    return Object.freeze({ minimum: -1, maximum: 1, finite: true as const });
  }
  if (DECIMAL_FEATURES.has(name)) {
    return Object.freeze({ minimum: 0, maximum: 1, finite: true as const });
  }
  if (name === "bullpenSeasonFip") {
    return Object.freeze({ minimum: null, maximum: null, finite: true as const });
  }
  return Object.freeze({ minimum: 0, maximum: null, finite: true as const });
}

type Mapping = Readonly<{
  liveSourcePath: string | null;
  semanticParity: ParityStatus;
  note: string;
}>;
function mapping(group: Group, name: string): Mapping {
  if (group === "ownOffense") {
    if (name === "priorGames" || name === "seasonGames") return {
      liveSourcePath: "features.{side}.offense.currentSeason.games",
      semanticParity: "PASS",
      note: "Both sources count completed target-season team games before cutoff.",
    };
    const rolling = /^runsPerGame(5|10|20|30)$/.exec(name);
    if (rolling) return {
      liveSourcePath: `features.{side}.offense.rolling.games${rolling[1]}.runsPerGame`,
      semanticParity: "FAIL",
      note: "Historical rolling windows reset by target season; live model-input-v4 windows span prior seasons.",
    };
    if (name === "seasonRunsPerGame") return {
      liveSourcePath: "features.{side}.offense.currentSeason.runsPerGame",
      semanticParity: "PASS",
      note: "Both sources aggregate target-season runs over completed games before cutoff.",
    };
    return {
      liveSourcePath: "features.{side}.offense.currentSeason{Home|Away}.runsPerGame",
      semanticParity: "FAIL",
      note: "The live v4 materializer compares stored lowercase team sides to uppercase HOME, so every current home-team home split is empty.",
    };
  }
  if (group === "leagueEnvironment") {
    if (name === "isHome") return {
      liveSourcePath: "derived from features.{side} identity",
      semanticParity: "PASS",
      note: "The historical scalar is exactly one for home and zero for away; live side identity derives the same scalar.",
    };
    if (name === "seasonRunsPerTeamGame") return {
      liveSourcePath: "features.leagueContext.runsPerTeamGame",
      semanticParity: "FAIL",
      note: "The live runtime selects a latest league row without binding target game, season, or window; season-to-date semantics are not preserved.",
    };
    return {
      liveSourcePath: null,
      semanticParity: "NOT_AVAILABLE",
      note: "model-input-v4 does not preserve the required league sample count or named 7/14/30-day window.",
    };
  }
  const bullpenPaths: Readonly<Record<string, string>> = Object.freeze({
    bullpenLast5Innings: "features.{side}.opponentBullpen.rolling.games5.innings",
    bullpenLast10Era: "features.{side}.opponentBullpen.rolling.games10.era",
    bullpenPitchesLast1d: "features.{side}.opponentBullpen.workload.days1.pitches",
    bullpenPitchesLast3d: "features.{side}.opponentBullpen.workload.days3.pitches",
    bullpenInningsLast1d: "features.{side}.opponentBullpen.workload.days1.innings",
    bullpenInningsLast3d: "features.{side}.opponentBullpen.workload.days3.innings",
    relieversUsedLast1d: "features.{side}.opponentBullpen.workload.days1.relievers",
  });
  if (bullpenPaths[name]) return {
    liveSourcePath: bullpenPaths[name],
    semanticParity: "FAIL",
    note: "The live analog converts null components to zero and its runtime reads all five historical bullpen artifact versions without deduplication.",
  };
  return {
    liveSourcePath: null,
    semanticParity: "NOT_AVAILABLE",
    note: "No exact field with the historical definition is preserved in model-input-v4.",
  };
}

const featureDefinitions: MlbV4FeatureDefinition[] = GROUPS.flatMap((group) =>
  MLB_224C_FEATURE_SCHEMA[group].map((name) => {
    const source = mapping(group, name);
    const sourceAvailable = source.liveSourcePath !== null;
    const status: ParityStatus = source.semanticParity === "PASS"
      ? "PARTIAL"
      : source.semanticParity;
    return Object.freeze({
      canonicalName: `homeMinusAway.${group}.${name}`,
      researchName: `${group}.${name}`,
      historicalSourcePath: `{home|away}.${group}.${name}`,
      liveSourcePath: source.liveSourcePath,
      dtype: "number" as const,
      unit: unit(name),
      allowedRange: allowedRange(name),
      semantics: group === "ownOffense"
        ? `Batting-side ${name}; completed games before the feature cutoff`
        : group === "leagueEnvironment"
          ? `Batting-side league environment ${name}`
          : `Opposing-team bullpen ${name}`,
      orientation: "HOME_MINUS_AWAY" as const,
      rawAdapterTransform: "IDENTITY" as const,
      requiredModelTransform: "TRAIN_MEDIAN_IMPUTE_POPULATION_ZSCORE_PER_SIDE_THEN_HOME_MINUS_AWAY" as const,
      missingPolicy: "RAW_NULL_THEN_FROZEN_TRAIN_MEDIAN_REQUIRED" as const,
      pitRequirement: "SOURCE_BEFORE_FEATURE_CUTOFF" as const,
      provenanceClass: source.semanticParity === "PASS"
        ? "HISTORICAL_PIT_AND_LIVE_PREGAME" as const
        : sourceAvailable
          ? "HISTORICAL_PIT_AND_DEFECTIVE_LIVE_ANALOG" as const
          : "HISTORICAL_PIT_ONLY" as const,
      sourceEvidenceType: group === "ownOffense"
        ? "TEAM_COMPLETION_LEDGER" as const
        : group === "leagueEnvironment"
          ? "LEAGUE_COMPLETION_LEDGER" as const
          : "BULLPEN_BOXSCORE_REPLAY" as const,
      historicalVersion: MLB_237_RESEARCH_SCHEMA,
      liveVersion: MLB_V4_INPUT_SCHEMA,
      semanticParity: source.semanticParity,
      unitParity: sourceAvailable ? "PASS" as const : "NOT_AVAILABLE" as const,
      transformParity: "NOT_AVAILABLE" as const,
      pitParity: sourceAvailable ? "PASS" as const : "NOT_AVAILABLE" as const,
      status,
      mappingNote: source.note,
    });
  }));

export const MLB_V4_FEATURE_DEFINITIONS = Object.freeze(featureDefinitions);
export const MLB_V4_FEATURE_ORDER = Object.freeze(featureDefinitions.map((feature) => feature.canonicalName));
export const MLB_V4_PARITY_PROVEN_FEATURE_ORDER = Object.freeze(
  featureDefinitions.filter((feature) => feature.status === "PASS").map((feature) => feature.canonicalName),
);
export const MLB_V4_RAW_SEMANTIC_PARITY_FEATURE_ORDER = Object.freeze(
  featureDefinitions.filter((feature) => feature.semanticParity === "PASS").map((feature) => feature.canonicalName),
);
export const MLB_V4_FEATURE_COUNT = MLB_V4_FEATURE_ORDER.length;
export const MLB_V4_FEATURE_ORDER_HASH = stableLocalHash(MLB_V4_FEATURE_ORDER);
export const MLB_V4_NORMALIZATION = Object.freeze({
  status: "NOT_AVAILABLE" as const,
  algorithm: "TRAIN median imputation and population z-score per side, followed by HOME minus AWAY",
  expectedResearchTransformHash: MLB_237_RESEARCH_TRANSFORM_HASH,
  constants: null,
  reason: "Task #237 recorded only the transform hash; fitted medians, means, and standard deviations were not persisted in a consumable artifact.",
});
export const MLB_V4_NORMALIZATION_HASH = stableLocalHash(MLB_V4_NORMALIZATION);
const contractBody = Object.freeze({
  contractId: MLB_V4_CONTRACT_ID,
  contractVersion: MLB_V4_CONTRACT_VERSION,
  contractState: "BLOCKED_INCOMPLETE" as const,
  featureOrder: MLB_V4_FEATURE_ORDER,
  featureCount: MLB_V4_FEATURE_COUNT,
  definitions: MLB_V4_FEATURE_DEFINITIONS,
  normalization: MLB_V4_NORMALIZATION,
  normalizationHash: MLB_V4_NORMALIZATION_HASH,
  eligibilityTiers: ["INELIGIBLE", "BASELINE_CORE", "STARTER_CORE", "ENHANCED"],
  fullVectorEligibility: "DENIED_UNTIL_ALL_38_FEATURES_AND_NORMALIZATION_ARE_PARITY_PROVEN" as const,
});
export const MLB_V4_INPUT_CONTRACT = Object.freeze({
  ...contractBody,
  contractHash: stableLocalHash(contractBody),
  featureOrderHash: MLB_V4_FEATURE_ORDER_HASH,
});
export const MLB_V4_HISTORICAL_ADAPTER_HASH = stableLocalHash({
  contractHash: MLB_V4_INPUT_CONTRACT.contractHash,
  adapter: "HISTORICAL",
  inputSchema: MLB_237_RESEARCH_SCHEMA,
  output: "RAW_SIDES_PLUS_RAW_SEMANTIC_COMPARABLE_VECTOR_NO_MODEL_VECTOR",
});
export const MLB_V4_LIVE_ADAPTER_HASH = stableLocalHash({
  contractHash: MLB_V4_INPUT_CONTRACT.contractHash,
  adapter: "LIVE",
  inputSchema: MLB_V4_INPUT_SCHEMA,
  output: "RAW_SIDES_PLUS_RAW_SEMANTIC_COMPARABLE_VECTOR_NO_MODEL_VECTOR",
});

type Json = Record<string, unknown>;
const object = (value: unknown, path: string): Json => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Missing object: ${path}`);
  return value as Json;
};
const finiteOrNull = (value: unknown, path: string): FeatureValue => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Non-finite feature: ${path}`);
  return value;
};

const MARKET = new Set([
  "odds", "moneyline", "runline", "spread", "total", "sportsbook", "market", "price",
  "impliedprobability", "vig", "clv", "linemovement", "edge", "units", "openingline",
  "closingline", "marketconsensus", "pinnacle",
]);
const OUTCOME = new Set([
  "actualstarter", "actuallineup", "actualruns", "homeruns", "awayruns", "finalscore",
  "winner", "result", "gradedpick", "postgameera", "postgamebullpenoutcome", "runsallowed",
  "earnedruns", "target",
]);
const OTHER_SPORT = /^(nfl|ncaaf|nba|wnba|nhl|soccer|ufc)/i;
function assertStrictFirewall(value: unknown, path = "$"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((child, index) => assertStrictFirewall(child, `${path}[${index}]`));
  for (const [key, child] of Object.entries(value as Json)) {
    const compact = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (MARKET.has(compact)) throw new Error(`MARKET_FIREWALL: ${path}.${key}`);
    if (OUTCOME.has(compact)) throw new Error(`OUTCOME_FIREWALL: ${path}.${key}`);
    if (OTHER_SPORT.test(compact)) throw new Error(`CROSS_SPORT_FIREWALL: ${path}.${key}`);
    assertStrictFirewall(child, `${path}.${key}`);
  }
}

export interface AdapterEnvelope {
  gameId: string;
  scheduledFirstPitch: string;
  featureCutoff: string;
  predictionTime: string;
  evidenceTier: EvidenceTier;
  sourceEvidenceTimes: readonly string[];
  sourceEvidenceComplete: true;
}
export interface HistoricalContractInput extends AdapterEnvelope {
  schemaVersion: typeof MLB_237_RESEARCH_SCHEMA;
  evidenceTime: string;
  home: MlbSideFeatureVector;
  away: MlbSideFeatureVector;
}
export interface LiveContractInput extends AdapterEnvelope {
  schemaVersion: typeof MLB_V4_INPUT_SCHEMA;
  pitSafe: true;
  features: {
    home: { offense: unknown; starter: unknown; opponentBullpen: unknown };
    away: { offense: unknown; starter: unknown; opponentBullpen: unknown };
    leagueContext: unknown; homeContext: unknown; parkContext: unknown;
  };
}
export interface CanonicalAdapterOutput {
  contractId: typeof MLB_V4_CONTRACT_ID;
  gameId: string;
  evidenceTier: EvidenceTier;
  home: MlbSideFeatureVector;
  away: MlbSideFeatureVector;
  rawHomeThenAway: readonly FeatureValue[];
  rawSemanticComparableVector: readonly FeatureValue[];
  missingFeatures: readonly string[];
  unresolvedParityFeatures: readonly string[];
  modelVector: null;
  fullVectorEligible: false;
  vectorHash: string;
  adapterHash: string;
}

function assertChronology(input: AdapterEnvelope, additionalEvidenceTimes: readonly string[] = []): void {
  const evidenceTimes = [...input.sourceEvidenceTimes, ...additionalEvidenceTimes];
  if (input.sourceEvidenceComplete !== true || evidenceTimes.length === 0) {
    throw new Error("PIT component provenance is incomplete");
  }
  const values = [input.featureCutoff, input.predictionTime, input.scheduledFirstPitch, ...evidenceTimes]
    .filter((value): value is string => Boolean(value)).map((value) => Date.parse(value));
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Invalid PIT timestamp");
  const cutoff = Date.parse(input.featureCutoff);
  if (evidenceTimes.some((value) => Date.parse(value) > cutoff)) throw new Error("PIT evidence after feature cutoff");
  if (cutoff > Date.parse(input.predictionTime)
    || Date.parse(input.predictionTime) >= Date.parse(input.scheduledFirstPitch)) {
    throw new Error("PIT chronology must be evidence <= cutoff <= prediction < first pitch");
  }
}

function validateRanges(values: readonly FeatureValue[], side: "home" | "away"): void {
  values.forEach((value, index) => {
    if (value == null) return;
    const definition = featureDefinitions[index]!;
    const { minimum, maximum } = definition.allowedRange;
    if ((minimum !== null && value < minimum) || (maximum !== null && value > maximum)
      || (definition.unit === "binary" && value !== 0 && value !== 1)) {
      throw new Error(`Feature outside allowed range: ${side}.${definition.researchName}`);
    }
  });
}

function output(
  adapterKind: "HISTORICAL" | "LIVE",
  input: AdapterEnvelope,
  home: MlbSideFeatureVector,
  away: MlbSideFeatureVector,
): CanonicalAdapterOutput {
  const homeRaw = flattenMlbSideFeatures(home, MLB_224C_FEATURE_SCHEMA);
  const awayRaw = flattenMlbSideFeatures(away, MLB_224C_FEATURE_SCHEMA);
  validateRanges(homeRaw, "home");
  validateRanges(awayRaw, "away");
  const rawSemanticComparableVector = featureDefinitions.map((definition, index) =>
    definition.semanticParity === "PASS"
      ? (homeRaw[index] == null || awayRaw[index] == null ? null : homeRaw[index]! - awayRaw[index]!)
      : null);
  const rawHomeThenAway = Object.freeze([...homeRaw, ...awayRaw]);
  const missingFeatures = Object.freeze(featureDefinitions.filter((_definition, index) =>
    homeRaw[index] == null || awayRaw[index] == null).map((definition) => definition.canonicalName));
  const unresolvedParityFeatures = Object.freeze(featureDefinitions.filter((definition) =>
    definition.status !== "PASS").map((definition) => definition.canonicalName));
  const vectorHash = stableLocalHash({
    contractHash: MLB_V4_INPUT_CONTRACT.contractHash,
    featureOrder: MLB_V4_FEATURE_ORDER,
    rawSemanticComparableVector,
  });
  const adapterHash = stableLocalHash({
    adapterKind, contractHash: MLB_V4_INPUT_CONTRACT.contractHash, gameId: input.gameId,
    scheduledFirstPitch: input.scheduledFirstPitch, featureCutoff: input.featureCutoff,
    predictionTime: input.predictionTime, evidenceTier: input.evidenceTier,
    sourceEvidenceTimes: input.sourceEvidenceTimes, rawHomeThenAway, rawSemanticComparableVector,
  });
  return Object.freeze({
    contractId: MLB_V4_CONTRACT_ID, gameId: input.gameId, evidenceTier: input.evidenceTier,
    home, away, rawHomeThenAway,
    rawSemanticComparableVector: Object.freeze(rawSemanticComparableVector),
    missingFeatures, unresolvedParityFeatures, modelVector: null,
    fullVectorEligible: false, vectorHash, adapterHash,
  });
}

export function adaptHistoricalMlbV4Input(input: HistoricalContractInput): CanonicalAdapterOutput {
  assertStrictFirewall(input);
  if (input.schemaVersion !== MLB_237_RESEARCH_SCHEMA) throw new Error("Historical schema mismatch");
  if (input.evidenceTier !== "BASELINE_CORE") {
    throw new Error("Historical Task #237 input supports BASELINE_CORE only; pregame starter evidence is unavailable");
  }
  assertChronology(input, [input.evidenceTime]);
  return output("HISTORICAL", input, input.home, input.away);
}

function liveSide(input: LiveContractInput, side: "home" | "away"): MlbSideFeatureVector {
  const offense = object(input.features[side].offense, `features.${side}.offense`);
  const current = object(offense.currentSeason, "currentSeason");
  const rolling = object(offense.rolling, "rolling");
  const split = object(offense[side === "home" ? "currentSeasonHome" : "currentSeasonAway"], "currentSeason split");
  const league = object(input.features.leagueContext, "features.leagueContext");
  const bullpen = object(input.features[side].opponentBullpen, `features.${side}.opponentBullpen`);
  const bullpenRolling = object(bullpen.rolling, "opponentBullpen.rolling");
  const workload = object(bullpen.workload, "opponentBullpen.workload");
  const ownOffense = Object.fromEntries(MLB_224C_FEATURE_SCHEMA.ownOffense.map((name) => {
    const match = /^runsPerGame(5|10|20|30)$/.exec(name);
    let value: unknown;
    if (name === "priorGames" || name === "seasonGames") value = current.games;
    else if (match) value = object(rolling[`games${match[1]}`], `rolling.games${match[1]}`).runsPerGame;
    else if (name === "seasonRunsPerGame") value = current.runsPerGame;
    else value = split.runsPerGame;
    return [name, finiteOrNull(value, `${side}.${name}`)];
  }));
  const leagueEnvironment = Object.fromEntries(MLB_224C_FEATURE_SCHEMA.leagueEnvironment.map((name) =>
    [name, name === "isHome"
      ? (side === "home" ? 1 : 0)
      : name === "seasonRunsPerTeamGame"
        ? finiteOrNull(league.runsPerTeamGame, `${side}.${name}`)
        : null]));
  const opponentBullpen = Object.fromEntries(MLB_224C_FEATURE_SCHEMA.opponentBullpen.map((name) => {
    const path = featureDefinitions.find((definition) =>
      definition.researchName === `opponentBullpen.${name}`)?.liveSourcePath;
    if (!path) return [name, null];
    let value: unknown = null;
    if (name === "bullpenLast5Innings") value = object(bullpenRolling.games5, "rolling.games5").innings;
    else if (name === "bullpenLast10Era") value = object(bullpenRolling.games10, "rolling.games10").era;
    else {
      const days = name.endsWith("Last1d") ? object(workload.days1, "workload.days1")
        : object(workload.days3, "workload.days3");
      if (name.includes("Pitches")) value = days.pitches;
      else if (name.includes("Innings")) value = days.innings;
      else value = days.relievers;
    }
    return [name, finiteOrNull(value, `${side}.${name}`)];
  }));
  return { ownOffense, leagueEnvironment, opponentBullpen };
}

export function adaptLiveMlbV4Input(input: LiveContractInput): CanonicalAdapterOutput {
  assertStrictFirewall(input);
  if (input.schemaVersion !== MLB_V4_INPUT_SCHEMA || input.pitSafe !== true) throw new Error("Live schema/PIT binding mismatch");
  assertChronology(input);
  if (["STARTER_CORE", "ENHANCED"].includes(input.evidenceTier)) {
    object(input.features.home.starter, "features.home.starter");
    object(input.features.away.starter, "features.away.starter");
  }
  return output("LIVE", input, liveSide(input, "home"), liveSide(input, "away"));
}

export const MLB_237_COMPATIBILITY = Object.freeze({
  classification: "INCOMPATIBLE" as const,
  candidateId: "tbm-mlb-moneyline-v4-research-237",
  reasons: Object.freeze([
    "No feature has complete semantic/unit/transform/PIT parity because the #237 normalization constants were not persisted",
    "Only four raw features have source-proven semantic parity; 13 have known semantic mismatches and 21 have no exact live field",
    "Current model-input-v4 snapshots contain a home/away split casing defect and duplicated multi-version bullpen sources",
    "Task #237 is explicitly an unfrozen research result, not a model artifact",
    "The fitted TRAIN medians, means, standard deviations, coefficients and intercept are not persisted in a consumable artifact",
  ]),
  coefficientsChanged: false,
});

export interface MlbV4ExpectedScoreOutput {
  expected_home_runs_unrounded: number;
  expected_away_runs_unrounded: number;
  projected_home_score_display: number;
  projected_away_score_display: number;
}
export interface MlbV4ProbabilityOutput {
  home_win_probability: number;
  away_win_probability: number;
  semantics: "P(HOME_WIN), P(AWAY_WIN)";
}
export function expectedScoreOutput(home: number, away: number): MlbV4ExpectedScoreOutput {
  if (![home, away].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("Invalid expected runs");
  return { expected_home_runs_unrounded: home, expected_away_runs_unrounded: away,
    projected_home_score_display: Math.round(home), projected_away_score_display: Math.round(away) };
}
export function probabilityOutput(home: number, away: number): MlbV4ProbabilityOutput {
  if (![home, away].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    || Math.abs(home + away - 1) > MLB_V4_PARITY_TOLERANCE) throw new Error("Invalid complementary win probabilities");
  return { home_win_probability: home, away_win_probability: away,
    semantics: "P(HOME_WIN), P(AWAY_WIN)" };
}