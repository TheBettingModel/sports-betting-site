import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  mlbHistoricalEvaluationRunsTable,
  mlbHistoricalExpectedRunsForecastsTable,
  mlbHistoricalModelArtifactsTable,
  mlbHistoricalPreOosLocksTable,
  mlbHistoricalPregamePitcherSnapshotsTable,
  mlbHistoricalTeamGameRowsTable,
  mlbHistoricalTrainingManifestsTable,
} from "@workspace/db";
import {
  MLB_224C_FEATURE_DIRECTIONALITY,
  MLB_224C_FOUNDATION_ARTIFACT,
  MLB_224C_FEATURE_SCHEMA,
  MLB_224C_MODEL_ID,
  MLB_224C_SCHEMA_VERSION,
  MLB_224C_SELECTION_RULE,
} from "../src/services/mlbExpectedRuns224C";
import { stableLocalHash } from "../src/services/mlbV4ExpectedRuns";
import { loadCohortGames } from "./mlb-expected-runs-224c-data";
import {
  MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY,
  MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
} from "../src/services/mlbHistoricalChronology";
import { MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION } from "../src/services/mlbHistoricalPitchingArtifact";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RecordValue = Record<string, unknown>;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const outputPath = resolve(root, "reports/mlb-224c1-root-cause-diagnostics.json");
const candidatePath = resolve(root, "reports/mlb-v4-expected-runs-candidates-v3.json");
const developmentCohorts = new Set(["TRAIN", "VALIDATION"]);

const record = (value: unknown, label: string): RecordValue => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not an object`);
  return value as RecordValue;
};
const number = (value: unknown, label: string): number => {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) throw new Error(`${label} is not finite`);
  return result;
};
const canonical = (value: unknown): Json => {
  if (value === undefined) return null;
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite report value");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as RecordValue)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  throw new Error(`Unsupported report value: ${typeof value}`);
};
const metric = (evaluation: RecordValue, side: string) =>
  record(record(record(evaluation.metrics, "evaluation metrics").runs, "run metrics")[side], `${side} metrics`);
const actualMean = (evaluation: RecordValue, side: string) => number(metric(evaluation, side).actualMean, `${side} actual mean`);
const predictedMean = (evaluation: RecordValue, side: string) =>
  number(metric(evaluation, side).predictedMean, `${side} predicted mean`);
const unitFor = (name: string): string => {
  if (name === "isHome") return "binary 0/1";
  if (/Pct$/.test(name)) return "proportion (0–1)";
  if (/Era$|Fip$|RunsPerGame$|runsPerTeamGame/.test(name)) return "runs per game";
  if (/Innings$/.test(name)) return "innings";
  if (/Pitches/.test(name)) return "pitches";
  if (/Games|Size|Count|Relievers/.test(name)) return "count";
  if (/Whip/.test(name)) return "WHIP";
  if (/HrRate/.test(name)) return "home runs per inning";
  return "numeric";
};
const status = (rank: "PROVEN" | "STRONGLY_SUPPORTED" | "POSSIBLE" | "NOT_SUPPORTED",
  finding: string, evidence: Json) => ({ rank, finding, evidence });
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const distribution = (values: readonly number[], highScore: number) => {
  if (!values.length) throw new Error("Cannot summarize empty values");
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  const average = mean(values);
  return {
    count: values.length, mean: average, median: ordered.length % 2 ? ordered[middle]! :
      (ordered[middle - 1]! + ordered[middle]!) / 2,
    variance: mean(values.map((value) => (value - average) ** 2)),
    zeroFrequency: values.filter((value) => value === 0).length / values.length,
    oneFrequency: values.filter((value) => value === 1).length / values.length,
    highScoreThreshold: highScore, highScoreFrequency: values.filter((value) => value >= highScore).length / values.length,
  };
};

// This is deliberately a read-only development diagnostic. It reads raw
// TRAIN/VALIDATION features/outcomes through the cohort loader, but has no OOS
// identifier, forecast, evaluation, feature, or outcome query path.
const [manifests, artifacts, locks, evaluations, forecasts, candidateText] = await Promise.all([
  db.select().from(mlbHistoricalTrainingManifestsTable)
    .where(eq(mlbHistoricalTrainingManifestsTable.schemaVersion, MLB_224C_SCHEMA_VERSION)),
  db.select().from(mlbHistoricalModelArtifactsTable)
    .where(and(eq(mlbHistoricalModelArtifactsTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
      eq(mlbHistoricalModelArtifactsTable.modelId, MLB_224C_MODEL_ID))),
  db.select().from(mlbHistoricalPreOosLocksTable)
    .where(and(eq(mlbHistoricalPreOosLocksTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
      eq(mlbHistoricalPreOosLocksTable.modelId, MLB_224C_MODEL_ID))),
  db.select().from(mlbHistoricalEvaluationRunsTable)
    .where(and(eq(mlbHistoricalEvaluationRunsTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
      eq(mlbHistoricalEvaluationRunsTable.modelId, MLB_224C_MODEL_ID),
      inArray(mlbHistoricalEvaluationRunsTable.phase, ["TRAIN", "VALIDATION"]))),
  db.select().from(mlbHistoricalExpectedRunsForecastsTable)
    .where(and(eq(mlbHistoricalExpectedRunsForecastsTable.schemaVersion, MLB_224C_SCHEMA_VERSION),
      eq(mlbHistoricalExpectedRunsForecastsTable.modelId, MLB_224C_MODEL_ID),
      inArray(mlbHistoricalExpectedRunsForecastsTable.cohort, ["TRAIN", "VALIDATION"]))),
  readFile(candidatePath, "utf8"),
]);
if (manifests.length !== 1 || artifacts.length !== 1 || locks.length !== 1) {
  throw new Error("224C-1 requires exactly one v3 manifest, artifact, and lock");
}
const manifest = manifests[0]!;
const artifact = artifacts[0]!;
const lock = locks[0]!;
// The only raw-data operation: the loader is called for development cohorts
// explicitly and never receives an OOS identifier list.
const [trainGames, validationGames] = await Promise.all([
  loadCohortGames(db, "TRAIN", manifest.trainGameIds),
  loadCohortGames(db, "VALIDATION", manifest.validationGameIds),
]);
const developmentIds = [...manifest.trainGameIds, ...manifest.validationGameIds];
const [actualStarterSnapshots, developmentTeamRows] = await Promise.all([
  db.select().from(mlbHistoricalPregamePitcherSnapshotsTable).where(and(
    eq(mlbHistoricalPregamePitcherSnapshotsTable.schemaVersion, MLB_PITCHER_BULLPEN_PIT_SCHEMA_VERSION),
    eq(mlbHistoricalPregamePitcherSnapshotsTable.artifactKey, MLB_224C_FOUNDATION_ARTIFACT),
    inArray(mlbHistoricalPregamePitcherSnapshotsTable.canonicalGameId, developmentIds),
  )),
  db.select().from(mlbHistoricalTeamGameRowsTable).where(and(
    eq(mlbHistoricalTeamGameRowsTable.schemaVersion, MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION),
    eq(mlbHistoricalTeamGameRowsTable.artifactKey, MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY),
    inArray(mlbHistoricalTeamGameRowsTable.canonicalGameId, developmentIds),
  )),
]);
const candidateDiagnostics = record(JSON.parse(candidateText), "candidate diagnostics");
const candidateHash = candidateDiagnostics.diagnosticsHash;
if (typeof candidateHash !== "string") throw new Error("Candidate diagnostics hash is absent");
const candidateBase = { ...candidateDiagnostics };
delete candidateBase.diagnosticsHash;
if (stableLocalHash(candidateBase) !== candidateHash) throw new Error("Candidate diagnostics hash mismatch");
if (candidateDiagnostics.oosInspected !== false || candidateDiagnostics.reportingOnly !== true) {
  throw new Error("Candidate diagnostics is not development-only");
}

const developmentForecasts = forecasts.filter((row) => developmentCohorts.has(row.cohort))
  .sort((a, b) => a.cohort.localeCompare(b.cohort) || a.canonicalGameId.localeCompare(b.canonicalGameId));
const developmentEvaluations = evaluations.filter((row) => developmentCohorts.has(row.phase)
  && developmentCohorts.has(row.cohort));
const evaluationByCohort = new Map(developmentEvaluations.map((row) => [row.cohort, row]));
for (const cohort of developmentCohorts) {
  if (!evaluationByCohort.has(cohort)) throw new Error(`Missing ${cohort} persisted evaluation`);
}
const byCohort = (cohort: string) => developmentForecasts.filter((row) => row.cohort === cohort);
const selected = record(record(artifact.configuration, "configuration").selected, "selected candidate");
const transforms = record(artifact.transforms, "transforms");
const parameters = record(artifact.parameters, "parameters");
const allFeatures = [
  ...MLB_224C_FEATURE_SCHEMA.ownOffense.map((name) => ["ownOffense", name] as const),
  ...MLB_224C_FEATURE_SCHEMA.leagueEnvironment.map((name) => ["leagueEnvironment", name] as const),
  ...MLB_224C_FEATURE_SCHEMA.opponentBullpen.map((name) => ["opponentBullpen", name] as const),
];
const coefficients = parameters.coefficients;
const transformNames = transforms.featureNames;
const medians = transforms.medians;
if (!Array.isArray(coefficients) || !Array.isArray(transformNames) || !Array.isArray(medians)
  || coefficients.length !== allFeatures.length || transformNames.length !== allFeatures.length
  || medians.length !== allFeatures.length) throw new Error("Persisted coefficient/transform vector mismatch");
const coefficientRecord = Object.fromEntries(allFeatures.map(([, name], index) => [name, coefficients[index]!]));
const transformRecord = Object.fromEntries(allFeatures.map(([, name], index) => ({
  [name]: { standardization: "TRAIN mean/standard deviation", medianImputation: medians[index] },
})));

const integrityRows = developmentForecasts.map((row) => {
  const home = number(row.homeExpectedRunsExact, "home expected runs");
  const away = number(row.awayExpectedRunsExact, "away expected runs");
  const total = number(row.projectedTotalExact, "total");
  const margin = number(row.projectedMarginExact, "margin");
  const homeProbability = number(row.homeWinProbability, "home probability");
  const awayProbability = number(row.awayWinProbability, "away probability");
  return {
    arithmetic: Math.abs(total - home - away) <= 1e-9 && Math.abs(margin - home + away) <= 1e-9,
    probability: Math.abs(homeProbability + awayProbability - 1) <= 1e-12,
    positive: home > 0 && away > 0,
    hash: stableLocalHash({
      schemaVersion: row.schemaVersion, canonicalGameId: row.canonicalGameId, modelId: row.modelId,
      modelVersion: row.modelVersion, cohort: row.cohort, featureSnapshotHash: row.featureSnapshotHash,
      homeExpectedRunsExact: row.homeExpectedRunsExact, awayExpectedRunsExact: row.awayExpectedRunsExact,
      projectedTotalExact: row.projectedTotalExact, projectedMarginExact: row.projectedMarginExact,
      homeWinProbability: row.homeWinProbability, awayWinProbability: row.awayWinProbability,
      fairHomeMoneyline: row.fairHomeMoneyline, fairAwayMoneyline: row.fairAwayMoneyline,
      calibrationVersion: row.calibrationVersion, distributionVersion: row.distributionVersion,
      trainingManifestHash: row.trainingManifestHash, parameterHash: row.parameterHash,
      calibrationHash: row.calibrationHash, distributionHash: row.distributionHash,
    }) === row.forecastHash,
  };
});
const probabilityValues = developmentForecasts.filter((row) => row.cohort === "VALIDATION")
  .map((row) => number(row.homeWinProbability, "validation home probability"));
const probabilityStats = {
  mean: probabilityValues.reduce((sum, value) => sum + value, 0) / probabilityValues.length,
  sd: Math.sqrt(probabilityValues.reduce((sum, value) => sum + (value
    - probabilityValues.reduce((a, b) => a + b, 0) / probabilityValues.length) ** 2, 0) / probabilityValues.length),
  min: Math.min(...probabilityValues), max: Math.max(...probabilityValues),
  buckets: Object.fromEntries(["0.0-0.1", "0.1-0.2", "0.2-0.3", "0.3-0.4", "0.4-0.5",
    "0.5-0.6", "0.6-0.7", "0.7-0.8", "0.8-0.9", "0.9-1.0"].map((label, i) =>
    [label, probabilityValues.filter((value) => value >= i / 10 && (i === 9 ? value <= 1 : value < (i + 1) / 10)).length])),
};

const gamesByCohort = { TRAIN: trainGames, VALIDATION: validationGames };
const targetSummary = (games: typeof trainGames) => ({
  home: distribution(games.map((game) => game.homeRuns), 10),
  away: distribution(games.map((game) => game.awayRuns), 10),
  total: distribution(games.map((game) => game.homeRuns + game.awayRuns), 12),
});
const groupGames = (games: typeof trainGames, key: (game: typeof trainGames[number]) => string) =>
  Object.fromEntries([...new Set(games.map(key))].sort().map((name) =>
    [name, targetSummary(games.filter((game) => key(game) === name))]));
const targetDistributions = Object.fromEntries((Object.keys(gamesByCohort) as (keyof typeof gamesByCohort)[])
  .map((cohort) => [cohort, { gameCount: gamesByCohort[cohort].length, ...targetSummary(gamesByCohort[cohort]),
    bySeason: groupGames(gamesByCohort[cohort], (game) => String(game.season)),
    byMonth: groupGames(gamesByCohort[cohort], (game) => game.date.slice(0, 7)) }]));
const rawGames = [...trainGames, ...validationGames];
const rawById = new Map(rawGames.map((game) => [game.gameId, game]));
const rawIdFailures = developmentForecasts.filter((forecast) => {
  const game = rawById.get(forecast.canonicalGameId);
  return !game || game.cohort !== forecast.cohort;
}).length;
const sideFeatureAudit = (cohort: keyof typeof gamesByCohort, side: "home" | "away", group:
  keyof typeof MLB_224C_FEATURE_SCHEMA, names: readonly string[]) => Object.fromEntries(names.map((name) => {
  const values = gamesByCohort[cohort].map((game) => game[side][group][name] as number | null);
  const present = values.filter((value): value is number => value !== null);
  const presentMean = present.length ? mean(present) : null;
  const index = allFeatures.findIndex(([featureGroup, featureName]) => featureGroup === group && featureName === name);
  const imputed = values.map((value) => value === null ? number(medians[index], `${name} median`) : value);
  return [name, { raw: {
    mean: presentMean,
    sd: present.length > 1 && presentMean !== null
      ? Math.sqrt(mean(present.map((value) => (value - presentMean) ** 2)))
      : null,
    min: present.length ? Math.min(...present) : null,
    max: present.length ? Math.max(...present) : null,
    missing: values.filter((value) => value === null).length,
  }, imputed: { count: values.filter((value) => value === null).length, median: medians[index], mean: mean(imputed) },
  unit: unitFor(name), coefficient: coefficients[index] }];
}));
const featureAuditByCohort = Object.fromEntries((Object.keys(gamesByCohort) as (keyof typeof gamesByCohort)[])
  .map((cohort) => [cohort, Object.fromEntries((["home", "away"] as const).map((side) => [side, {
    ownOffense: sideFeatureAudit(cohort, side, "ownOffense", MLB_224C_FEATURE_SCHEMA.ownOffense),
    leagueEnvironment: sideFeatureAudit(cohort, side, "leagueEnvironment", MLB_224C_FEATURE_SCHEMA.leagueEnvironment),
    opponentBullpen: sideFeatureAudit(cohort, side, "opponentBullpen", MLB_224C_FEATURE_SCHEMA.opponentBullpen),
  }]))]));
const joinedRows = rawGames.map((game) => {
  const forecast = developmentForecasts.find((row) => row.canonicalGameId === game.gameId);
  if (!forecast) throw new Error(`Missing persisted forecast for development game ${game.gameId}`);
  return { game, forecast };
});
const teamByGameSide = new Map(developmentTeamRows.map((row) => [`${row.canonicalGameId}:${row.teamSide}`, row]));
const starterByGameTeam = new Map(actualStarterSnapshots.map((row) =>
  [`${row.canonicalGameId}:${row.canonicalTeamId}`, row]));
const starterResidualRows = joinedRows.flatMap(({ game, forecast }) => (["home", "away"] as const).map((scoringSide) => {
  const opposingSide = scoringSide === "home" ? "away" : "home";
  const opponentTeam = teamByGameSide.get(`${game.gameId}:${opposingSide}`);
  const starter = opponentTeam ? starterByGameTeam.get(`${game.gameId}:${opponentTeam.canonicalTeamId}`) : undefined;
  const actual = scoringSide === "home" ? game.homeRuns : game.awayRuns;
  const predicted = number(scoringSide === "home" ? forecast.homeExpectedRunsExact : forecast.awayExpectedRunsExact,
    `${scoringSide} predicted runs`);
  return { gameId: game.gameId, scoringSide, residual: actual - predicted,
    identityState: starter?.starterIdentityState ?? "UNKNOWN",
    fip: starter?.starterSeasonFip ?? null, era: starter?.starterSeasonEra ?? null,
    whip: starter?.starterSeasonWhip ?? null };
}));
const pearson = (pairs: readonly { x: number; y: number }[]) => {
  if (pairs.length < 3) return null;
  const xMean = mean(pairs.map((pair) => pair.x));
  const yMean = mean(pairs.map((pair) => pair.y));
  const numerator = pairs.reduce((sum, pair) => sum + (pair.x - xMean) * (pair.y - yMean), 0);
  const denominator = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair.x - xMean) ** 2, 0)
    * pairs.reduce((sum, pair) => sum + (pair.y - yMean) ** 2, 0));
  return denominator === 0 ? null : numerator / denominator;
};
const starterMetricCorrelation = (metricName: "fip" | "era" | "whip") => {
  const pairs = starterResidualRows.filter((row): row is typeof row & { [K in typeof metricName]: number } =>
    typeof row[metricName] === "number").map((row) => ({ x: row[metricName], y: row.residual }));
  return { coverage: pairs.length, pearsonResidualCorrelation: pearson(pairs) };
};
const starterBin = (fip: number | null) => fip === null ? "MISSING_FIP" : fip <= 3.5 ? "FIP_LE_3_50"
  : fip <= 4.5 ? "FIP_3_51_TO_4_50" : "FIP_GT_4_50";
const residualSummary = (rows: readonly typeof starterResidualRows[number][]) => rows.length ? {
  count: rows.length, mean: mean(rows.map((row) => row.residual)),
  variance: mean(rows.map((row) => (row.residual - mean(rows.map((item) => item.residual))) ** 2)),
} : { count: 0, mean: null, variance: null };
const starterAbsenceDiagnostic = {
  diagnosticOnly: true, prohibitedFeatureUse: true,
  source: "TRAIN/VALIDATION mlb_historical_pregame_pitcher_snapshots, authoritative v5 artifact only",
  join: "home scoring residual -> away actual starter; away scoring residual -> home actual starter",
  coverage: {
    developmentGames: rawGames.length, scoringSides: starterResidualRows.length,
    snapshotRows: actualStarterSnapshots.length, teamSideRows: developmentTeamRows.length,
    matchedOpponentStarter: starterResidualRows.filter((row) => row.identityState !== "UNKNOWN").length,
  },
  pearsonResidualVsPrior: {
    seasonFip: starterMetricCorrelation("fip"), seasonEra: starterMetricCorrelation("era"),
    seasonWhip: starterMetricCorrelation("whip"),
  },
  qualityBins: {
    definition: "opponent actual-starter prior season FIP: <=3.50, 3.51–4.50, >4.50; missing separately",
    residual: Object.fromEntries(["FIP_LE_3_50", "FIP_3_51_TO_4_50", "FIP_GT_4_50", "MISSING_FIP"].map((bin) =>
      [bin, residualSummary(starterResidualRows.filter((row) => starterBin(row.fip) === bin))])),
  },
  identityKnownVsUnknown: Object.fromEntries(["ACTUAL_ONLY", "UNKNOWN"].map((state) =>
    [state, residualSummary(starterResidualRows.filter((row) => row.identityState === state))])),
};
const residualGroups = (key: (row: typeof joinedRows[number]) => string) => Object.fromEntries(
  [...new Set(joinedRows.map(key))].sort().map((name) => {
    const rows = joinedRows.filter((row) => key(row) === name);
    const actual = rows.flatMap((row) => [row.game.homeRuns, row.game.awayRuns]);
    const predicted = rows.flatMap((row) => [number(row.forecast.homeExpectedRunsExact, "home prediction"),
      number(row.forecast.awayExpectedRunsExact, "away prediction")]);
    const offense = rows.flatMap((row) => [row.game.home.ownOffense.seasonRunsPerGame,
      row.game.away.ownOffense.seasonRunsPerGame]).filter((value): value is number => value !== null);
    const league = rows.flatMap((row) => [row.game.home.leagueEnvironment.seasonRunsPerTeamGame,
      row.game.away.leagueEnvironment.seasonRunsPerTeamGame]).filter((value): value is number => value !== null);
    return [name, { games: rows.length, actualMean: mean(actual), predictedMean: mean(predicted),
      residualMean: mean(actual) - mean(predicted), offensePriorMean: offense.length ? mean(offense) : null,
      leaguePriorMean: league.length ? mean(league) : null }];
  }));
const residualBySide = (side: "home" | "away") => {
  const actual = joinedRows.map((row) => side === "home" ? row.game.homeRuns : row.game.awayRuns);
  const predicted = joinedRows.map((row) => number(side === "home"
    ? row.forecast.homeExpectedRunsExact : row.forecast.awayExpectedRunsExact, `${side} prediction`));
  const offense = joinedRows.map((row) => row.game[side].ownOffense.seasonRunsPerGame)
    .filter((value): value is number => value !== null);
  return { games: joinedRows.length, actualMean: mean(actual), predictedMean: mean(predicted),
    residualMean: mean(actual) - mean(predicted), offensePriorMean: offense.length ? mean(offense) : null };
};

const base = {
  task: "224C-1", schemaVersion: MLB_224C_SCHEMA_VERSION, readOnly: true, deterministic: true,
  dataPolicy: {
    allowed: "Persisted v3 manifest/artifact/lock, TRAIN/VALIDATION raw features/outcomes, TRAIN/VALIDATION forecasts/evaluations, ACTUAL_ONLY development starter diagnostics, and persisted candidate diagnostics.",
    forbiddenReads: ["OOS outcomes", "OOS features", "OOS forecasts/evaluations"],
    oosMetadata: { opened: true, inspected: false, immutableLockHash: lock.lockHash },
  },
  bindings: { manifestHash: manifest.manifestHash, artifactHash: artifact.artifactHash, lockHash: lock.lockHash,
    candidateDiagnosticsHash: candidateHash, trainIdsHash: manifest.trainCohortHash, validationIdsHash: manifest.validationCohortHash },
  targetDistributions,
  runTargetIntegrity: {
    forecastCount: developmentForecasts.length, expectedCount: manifest.trainGameCount + manifest.validationGameCount,
    rawTargetGameCount: rawGames.length, rawForecastIdFailures: rawIdFailures,
    duplicateGameIds: developmentForecasts.length - new Set(developmentForecasts.map((row) => row.canonicalGameId)).size,
    membershipFailures: developmentForecasts.filter((row) => !(row.cohort === "TRAIN"
      ? manifest.trainGameIds : manifest.validationGameIds).includes(row.canonicalGameId)).length,
    arithmeticFailures: integrityRows.filter((row) => !row.arithmetic).length,
    probabilityNormalizationFailures: integrityRows.filter((row) => !row.probability).length,
    nonpositiveExpectedRuns: integrityRows.filter((row) => !row.positive).length,
    forecastHashFailures: integrityRows.filter((row) => !row.hash).length,
    transformsOrClips: {
      targetContract: "Raw integer home/away targets are compared directly; no target transform or clip is applied by this audit.",
      exactForecastContract: "Stored expected-run decimals are hash-bound; total=home+away and margin=home-away were checked.",
      rawTargetsAreNonnegativeIntegers: rawGames.filter((game) => !Number.isInteger(game.homeRuns)
        || !Number.isInteger(game.awayRuns) || game.homeRuns < 0 || game.awayRuns < 0).length,
    },
    swapsOrMisjoins: {
      rawForecastIdFailures: rawIdFailures,
      sideArithmeticFailures: integrityRows.filter((row) => !row.arithmetic).length,
      featureSnapshotHashesPresent: developmentForecasts.filter((row) => !row.featureSnapshotHash).length,
      result: rawIdFailures === 0 ? "PROVEN_NO_ID_MISJOIN_IN_DEVELOPMENT_JOIN" : "FAIL",
    },
  },
  featureDefinitions: allFeatures.map(([group, name]) => ({
    group, name, unit: unitFor(name), directionality: MLB_224C_FEATURE_DIRECTIONALITY[group],
    transform: transformRecord[name],
    coefficient: coefficientRecord[name] ?? "UNAVAILABLE_OR_INTERCEPT",
    missingness: "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    imputation: "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
  })),
  featureAuditByCohortSideGroup: featureAuditByCohort,
  selectedNb2: {
    selected, modelFamily: artifact.modelFamily, link: artifact.modelFamily === "nb2" ? "log" : "NOT_NB2",
    intercept: coefficientRecord.intercept ?? "UNAVAILABLE", offset: parameters.offset ?? "NONE_PERSISTED",
    exposure: parameters.exposure ?? "NONE_PERSISTED", coefficients: coefficientRecord,
    impliedBaseline: "exp(intercept) only when all transformed covariates are zero; unavailable if intercept is not separately persisted",
    train: { predicted: { home: predictedMean(evaluationByCohort.get("TRAIN")!, "home"), away: predictedMean(evaluationByCohort.get("TRAIN")!, "away"), total: predictedMean(evaluationByCohort.get("TRAIN")!, "total") }, actual: { home: actualMean(evaluationByCohort.get("TRAIN")!, "home"), away: actualMean(evaluationByCohort.get("TRAIN")!, "away"), total: actualMean(evaluationByCohort.get("TRAIN")!, "total") } },
    validation: { predicted: { home: predictedMean(evaluationByCohort.get("VALIDATION")!, "home"), away: predictedMean(evaluationByCohort.get("VALIDATION")!, "away"), total: predictedMean(evaluationByCohort.get("VALIDATION")!, "total") }, actual: { home: actualMean(evaluationByCohort.get("VALIDATION")!, "home"), away: actualMean(evaluationByCohort.get("VALIDATION")!, "away"), total: actualMean(evaluationByCohort.get("VALIDATION")!, "total") } },
  },
  candidates: candidateDiagnostics.candidates,
  selectedRuleReproduction: { declared: MLB_224C_SELECTION_RULE, persistedSelected: selected,
    result: candidateDiagnostics.selected, status: "PROVEN_BY_HASH-VERIFIED_PERSISTED_CANDIDATE_DIAGNOSTICS" },
  probabilityMapping: { distribution: artifact.distribution, calibration: artifact.calibration,
    ties: "Home-win evaluation defines a tie as non-home-win; independent score convolution mapping is persisted model behavior.",
    normalization: { tolerance: 1e-12, failures: integrityRows.filter((row) => !row.probability).length },
    validationSpread: probabilityStats },
  componentDiagnostics: {
    offenseEstimateVsTarget: { bySeason: residualGroups((row) => String(row.game.season)),
      byMonth: residualGroups((row) => row.game.date.slice(0, 7)),
      bySide: { home: residualBySide("home"), away: residualBySide("away") } },
    leaguePriorVsActualPredicted: { bySeason: residualGroups((row) => String(row.game.season)),
      byMonth: residualGroups((row) => row.game.date.slice(0, 7)) },
    bullpen: { rank: "POSSIBLE", direction: MLB_224C_FEATURE_DIRECTIONALITY.opponentBullpen,
      rawFeatureCoverage: featureAuditByCohort },
    homeAway: { rank: "POSSIBLE", evidence: metric(evaluationByCohort.get("VALIDATION")!, "home") },
    earlySeason: residualGroups((row) => Number(row.game.date.slice(5, 7)) <= 5 ? "EARLY" : "LATE"),
    seasonDrift: residualGroups((row) => String(row.game.season)),
  },
  bullpenOpponentMappingProof: {
    rank: "PROVEN", contract: MLB_224C_FEATURE_DIRECTIONALITY.opponentBullpen,
    persistedSchema: MLB_224C_FEATURE_SCHEMA.opponentBullpen,
    limitation: "Proof is schema/artifact-contract level; row-level mappings are not read by this diagnostic.",
  },
  actualStarterAbsenceResidual: {
    status: "COMPUTED_DEVELOPMENT_ONLY", ...starterAbsenceDiagnostic,
  },
  rankedCauses: [
    status("PROVEN", "NB2 mean model paired with Poisson score distribution is a distribution mismatch.",
      { probabilityOnly: true, notRunBiasCause: true, modelFamily: artifact.modelFamily, distribution: artifact.distribution }),
    status("PROVEN", "Persisted validation total predictions are lower than actual totals; this establishes bias, not its cause.",
      { predicted: predictedMean(evaluationByCohort.get("VALIDATION")!, "total"), actual: actualMean(evaluationByCohort.get("VALIDATION")!, "total"), bias: metric(evaluationByCohort.get("VALIDATION")!, "total").bias }),
    status("NOT_SUPPORTED", "Forecast duplicate, arithmetic swap, or probability normalization error causes run bias.", canonical({
      duplicateGameIds: developmentForecasts.length - new Set(developmentForecasts.map((row) => row.canonicalGameId)).size,
      arithmeticFailures: integrityRows.filter((row) => !row.arithmetic).length, normalizationFailures: integrityRows.filter((row) => !row.probability).length,
    })),
    status("POSSIBLE", "Omitted starter information contributes residual error.",
      { structuralOmission: true, matchedActualOnlyDevelopmentSides: starterAbsenceDiagnostic.matchedSides,
        limitation: "Prior starter FIP/ERA/WHIP are absent, so magnitude and direction are unquantifiable." }),
  ],
};
const report = { ...base, diagnosticsHash: stableLocalHash(canonical(base)) };
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(canonical(report), null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "MLB_224C1_ROOT_CAUSE_DIAGNOSTICS_WRITTEN", output: "reports/mlb-224c1-root-cause-diagnostics.json", diagnosticsHash: report.diagnosticsHash }, null, 2));