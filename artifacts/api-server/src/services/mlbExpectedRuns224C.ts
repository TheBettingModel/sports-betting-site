import {
  applyPlattCalibration,
  assertMlbSportsModelFirewall,
  convolveIndependentScores,
  fairAmericanOdds,
  fitNb2ExpectedRunsFixed,
  fitPlattCalibration,
  fitPoissonExpectedRunsFixed,
  fitRidgeExpectedRunsFixed,
  probabilityMetrics,
  predictExpectedRuns,
  projectedScoreContract,
  runMetrics,
  stableLocalHash,
  type ExpectedRunsFamily,
  type ExpectedRunsModel,
  type MlbSideFeatureSchema,
  type MlbSideFeatureVector,
  type MlbTrainingRow,
  type PlattCalibration,
} from "./mlbV4ExpectedRuns";

export const MLB_224C_SCHEMA_VERSION = "mlb-v4-expected-runs-training-v3";
export const MLB_224C_FOUNDATION_ARTIFACT = "mlb-historical-2023-2026-pitcher-bullpen-pit-v5";
export const MLB_224C_FOUNDATION_HASH = "cec426281151791d8018ada96990c76c0ba07a585b57333382bc5fbe9489a050";
export const MLB_224C_REPLAY_HASH = "a1fb96b3ec8abff49a69c56ceefdecef038ccc46aef150779abf19a286e2fe42";
export const MLB_224C_SOURCE_MANIFEST_HASH = "8da8c322a3ec1ac6723d267cc9aa4b922c185654f809f26246934bbefd8a6d98";
export const MLB_224C_SPLIT_VERSION = "mlb-completion-chronology-split-2023-2026-v3";
export const MLB_224C_SPLIT_SCHEMA_VERSION = "mlb-completion-chronology-v3";
export const MLB_224C_SPLIT_FOUNDATION_HASH = "97f989cb58217d3508caa2fd8d9ad596e1c3f5f366e762cab6aef2429d28e56f";
export const MLB_224C_COUNTS = Object.freeze({ TRAIN: 4700, VALIDATION: 2361, LOCKED_OOS: 2012 });
export const MLB_224C_MODEL_ID = "tbm-mlb-v4-expected-runs";

/** One common side-level design; isHome is the learned MLB home effect. */
export const MLB_224C_FEATURE_SCHEMA: MlbSideFeatureSchema = Object.freeze({
  ownOffense: Object.freeze([
    "priorGames", "seasonGames", "runsPerGame5", "runsPerGame10", "runsPerGame20",
    "runsPerGame30", "seasonRunsPerGame", "homeAwayRunsPerGame",
  ]),
  leagueEnvironment: Object.freeze([
    "isHome", "priorGames", "runsPerTeamGame7d", "runsPerTeamGame14d",
    "runsPerTeamGame30d", "seasonRunsPerTeamGame",
  ]),
  opponentBullpen: Object.freeze([
    "bullpenSeasonInnings", "bullpenSeasonEra", "bullpenSeasonWhip",
    "bullpenSeasonKPct", "bullpenSeasonBbPct", "bullpenSeasonKMinusBbPct",
    "bullpenSeasonHrRate", "bullpenSeasonFip", "bullpenLast3Innings",
    "bullpenLast5Innings", "bullpenLast10Era", "bullpenPitchesLast1d",
    "bullpenPitchesLast2d", "bullpenPitchesLast3d", "bullpenInningsLast1d",
    "bullpenInningsLast2d", "bullpenInningsLast3d", "relieversUsedLast1d",
    "relieversUsedLast2d", "backToBackRelievers", "threeDayRelievers",
    "sourceGameCount", "bullpenSampleSize", "bullpenFeatureCompleteness",
  ]),
});

export const MLB_224C_FEATURE_DIRECTIONALITY = Object.freeze({
  ownOffense: "the batting team whose expected runs are the target",
  leagueEnvironment: "point-in-time league state plus isHome for that batting side",
  opponentBullpen: "the opposing team bullpen snapshot; own bullpen is never an offense input",
});

export const MLB_224C_SELECTION_RULE = Object.freeze({
  eligibility: "zero integrity and numerical issues",
  primary: "validation total MAE ascending",
  tieTolerance: .02,
  tieBreakers: ["absolute total bias", "Brier", "log loss", "ECE",
    "worst-fold degradation", "simplicity"] as const,
  provisionalFailureFlags: {
    baselineImprovement: "total MAE improvement over home/away baseline must be >=0.02",
    absoluteTotalBias: "<=0.25",
    severeFoldInstability: "worst fold total MAE degradation versus aggregate <=0.50",
    numericalIssues: "zero",
  },
  lockedOosFailureFlags: {
    baselineRegression: "selected model total MAE must not exceed the frozen home/away baseline",
    absoluteTotalBias: "<=0.25",
    validationCollapse: "OOS total MAE degradation versus validation <=0.50",
    numericalIssues: "zero",
  },
  oosUsedForSelection: false,
});

export interface FoundationIdentity {
  artifactKey: string;
  foundationHash: string;
  replayHash: string;
  sourceManifestHash: string;
  status: string;
}

export function assertAuthoritativeFoundation(identity: FoundationIdentity): void {
  const expected: FoundationIdentity = {
    artifactKey: MLB_224C_FOUNDATION_ARTIFACT,
    foundationHash: MLB_224C_FOUNDATION_HASH,
    replayHash: MLB_224C_REPLAY_HASH,
    sourceManifestHash: MLB_224C_SOURCE_MANIFEST_HASH,
    status: "SEALED_PITCHER_BULLPEN_FOUNDATION",
  };
  for (const key of Object.keys(expected) as (keyof FoundationIdentity)[]) {
    if (identity[key] !== expected[key]) throw new Error(`Authoritative MLB foundation mismatch: ${key}`);
  }
}

export interface SplitMember {
  canonicalGameId: string;
  cohort: "TRAIN" | "VALIDATION" | "LOCKED_OOS";
  assignmentHash: string;
  immutable: boolean;
}
export interface BoundSplitMember extends SplitMember {
  schemaVersion: string;
  foundationChecksum: string;
  gameDate: string;
}
export interface CohortBoundary {
  start: string;
  end: string;
  count: number;
}

export function assertSealedSplitBinding(
  members: readonly BoundSplitMember[],
): Record<SplitMember["cohort"], CohortBoundary> {
  if (members.some((row) => row.schemaVersion !== MLB_224C_SPLIT_SCHEMA_VERSION
    || row.foundationChecksum !== MLB_224C_SPLIT_FOUNDATION_HASH
    || !row.immutable || !Number.isFinite(Date.parse(row.gameDate)))) {
    throw new Error("Sealed split schema/foundation/date binding mismatch");
  }
  const boundary = (cohort: SplitMember["cohort"]): CohortBoundary => {
    const dates = members.filter((row) => row.cohort === cohort).map((row) => row.gameDate).sort();
    if (!dates.length) throw new Error(`Empty sealed split cohort: ${cohort}`);
    return { start: dates[0]!, end: dates.at(-1)!, count: dates.length };
  };
  const result = {
    TRAIN: boundary("TRAIN"),
    VALIDATION: boundary("VALIDATION"),
    LOCKED_OOS: boundary("LOCKED_OOS"),
  };
  if (!(result.TRAIN.end < result.VALIDATION.start
    && result.VALIDATION.end < result.LOCKED_OOS.start)) {
    throw new Error("Sealed split chronology is not TRAIN < VALIDATION < LOCKED_OOS");
  }
  if (result.TRAIN.count !== MLB_224C_COUNTS.TRAIN
    || result.VALIDATION.count !== MLB_224C_COUNTS.VALIDATION
    || result.LOCKED_OOS.count !== MLB_224C_COUNTS.LOCKED_OOS) {
    throw new Error("Sealed split boundary counts do not match");
  }
  return result;
}
export interface TrainingManifest {
  manifestId: string;
  foundationArtifactKey: string;
  foundationHash: string;
  replayHash: string;
  sourceManifestHash: string;
  splitVersion: string;
  trainGameIds: string[];
  validationGameIds: string[];
  oosGameIds: string[];
  trainGameCount: number;
  validationGameCount: number;
  oosOriginalGameCount: number;
  oosEligibleGameCount: number;
  oosExcludedGameCount: number;
  oosNewMemberCount: 0;
  rejectedCounts: Record<string, number>;
  trainCohortHash: string;
  validationCohortHash: string;
  oosCohortHash: string;
  manifestHash: string;
}

export function buildTrainingManifest(
  members: readonly SplitMember[],
  rejectedCounts: Record<string, number> = {},
): TrainingManifest {
  if (members.some((row) => !row.immutable)) throw new Error("Training split is not immutable");
  const duplicate = members.length !== new Set(members.map((row) => row.canonicalGameId)).size;
  if (duplicate) throw new Error("A game occurs in more than one cohort");
  const ids = (cohort: SplitMember["cohort"]) => members.filter((row) => row.cohort === cohort)
    .sort((a, b) => a.canonicalGameId.localeCompare(b.canonicalGameId))
    .map((row) => row.canonicalGameId);
  const trainGameIds = ids("TRAIN");
  const validationGameIds = ids("VALIDATION");
  const oosGameIds = ids("LOCKED_OOS");
  if (trainGameIds.length !== MLB_224C_COUNTS.TRAIN
    || validationGameIds.length !== MLB_224C_COUNTS.VALIDATION
    || oosGameIds.length !== MLB_224C_COUNTS.LOCKED_OOS) {
    throw new Error("Sealed MLB split counts do not match 4700/2361/2012");
  }
  const base = {
    manifestId: "mlb-224c-development-manifest-v3",
    foundationArtifactKey: MLB_224C_FOUNDATION_ARTIFACT,
    foundationHash: MLB_224C_FOUNDATION_HASH,
    replayHash: MLB_224C_REPLAY_HASH,
    sourceManifestHash: MLB_224C_SOURCE_MANIFEST_HASH,
    splitVersion: MLB_224C_SPLIT_VERSION,
    trainGameIds, validationGameIds, oosGameIds,
    trainGameCount: trainGameIds.length, validationGameCount: validationGameIds.length,
    oosOriginalGameCount: oosGameIds.length, oosEligibleGameCount: oosGameIds.length,
    oosExcludedGameCount: 0, oosNewMemberCount: 0 as const,
    rejectedCounts: Object.fromEntries(Object.entries(rejectedCounts).sort()),
    trainCohortHash: stableLocalHash(trainGameIds),
    validationCohortHash: stableLocalHash(validationGameIds),
    oosCohortHash: stableLocalHash(oosGameIds),
  };
  return { ...base, manifestHash: stableLocalHash(base) };
}

type JsonRecord = Record<string, unknown>;
const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export interface OffenseFeatureRecord {
  canonicalGameId: string;
  teamSide: "home" | "away";
  canonicalTeamId: string;
  opponentCanonicalTeamId: string;
  featureCutoff: Date;
  scheduledFirstPitch: Date;
  eligibilityState: string;
  coreFeatures: unknown;
  checksum: string;
}
export type BullpenFeatureRecord = JsonRecord & {
  canonicalGameId: string; canonicalTeamId: string; opponentCanonicalTeamId: string;
  featureCutoff: Date; statThroughTime: Date | null; checksum: string;
};

/** Builds batting-side features from exactly its offense row and the opponent bullpen row. */
export function buildDirectedSideFeatures(
  offense: OffenseFeatureRecord,
  opponentBullpen: BullpenFeatureRecord,
): MlbSideFeatureVector {
  assertMlbSportsModelFirewall(offense.coreFeatures, "offense.coreFeatures");
  if (offense.eligibilityState !== "CORE_ELIGIBLE") throw new Error("Offense row is not eligible");
  if (offense.opponentCanonicalTeamId !== opponentBullpen.canonicalTeamId
    || offense.canonicalTeamId !== opponentBullpen.opponentCanonicalTeamId
    || offense.canonicalGameId !== opponentBullpen.canonicalGameId) {
    throw new Error("Opponent-bullpen direction mismatch");
  }
  // The sealed cutoff can be seconds after the nominal scheduled timestamp when
  // first pitch was delayed. Its audited cutoff binding, not the schedule clock,
  // defines the pregame boundary.
  if (offense.featureCutoff.getTime() !== opponentBullpen.featureCutoff.getTime()
    || (opponentBullpen.statThroughTime && !(opponentBullpen.statThroughTime < opponentBullpen.featureCutoff))) {
    throw new Error("Invalid point-in-time feature cutoff");
  }
  const core = offense.coreFeatures as JsonRecord;
  const team = core.team as JsonRecord;
  const league = core.league as JsonRecord;
  const vector: MlbSideFeatureVector = {
    ownOffense: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.ownOffense.map((name) =>
      [name, finiteOrNull(team?.[name])])),
    leagueEnvironment: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.leagueEnvironment.map((name) =>
      [name, name === "isHome" ? (offense.teamSide === "home" ? 1 : 0) : finiteOrNull(league?.[name])])),
    opponentBullpen: Object.fromEntries(MLB_224C_FEATURE_SCHEMA.opponentBullpen.map((name) =>
      [name, finiteOrNull(opponentBullpen[name])])),
  };
  assertMlbSportsModelFirewall(vector);
  return vector;
}

export interface DevelopmentGame {
  gameId: string; date: string; season: number; cohort: "TRAIN" | "VALIDATION" | "LOCKED_OOS";
  home: MlbSideFeatureVector; away: MlbSideFeatureVector;
  homeRuns: number; awayRuns: number; featureSnapshotHash: string; forecastCutoff: string;
}
export const sideRows = (games: readonly DevelopmentGame[]): MlbTrainingRow[] =>
  games.flatMap((game) => [{ features: game.home, runs: game.homeRuns },
    { features: game.away, runs: game.awayRuns }]);

export function chronologicalWalkForwardFolds(games: readonly DevelopmentGame[]) {
  const ordered = [...games].sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId));
  const boundaries = ["2023-07-01", "2024-04-01", "2024-07-01"];
  return boundaries.map((start, index) => {
    const end = boundaries[index + 1] ?? "2025-01-01";
    return {
      id: `wf-${index + 1}-${start}-${end}`,
      train: ordered.filter((g) => g.date < start),
      validation: ordered.filter((g) => g.date >= start && g.date < end),
    };
  }).filter((fold) => fold.train.length > 0 && fold.validation.length > 0);
}

export interface CandidateScore {
  id: string; family: ExpectedRunsFamily; lambda: 0 | 1 | 10; alpha: .1 | .25 | .5 | null;
  totalMae: number; totalBias: number; brier: number; logLoss: number; ece: number;
  worstFoldDegradation: number; integrityIssues: number; numericalIssues: number;
}
const simplicity = (family: ExpectedRunsFamily) =>
  family === "ridge-linear" ? 0 : family === "poisson" ? 1 : 2;
export function selectCandidate(scores: readonly CandidateScore[]): CandidateScore {
  const eligible = scores.filter((row) => row.integrityIssues === 0 && row.numericalIssues === 0);
  if (!eligible.length) throw new Error("No integrity-clean numerical candidate");
  return [...eligible].sort((a, b) => {
    if (Math.abs(a.totalMae - b.totalMae) > MLB_224C_SELECTION_RULE.tieTolerance) return a.totalMae - b.totalMae;
    return Math.abs(a.totalBias) - Math.abs(b.totalBias) || a.brier - b.brier
      || a.logLoss - b.logLoss || a.ece - b.ece
      || a.worstFoldDegradation - b.worstFoldDegradation
      || simplicity(a.family) - simplicity(b.family) || a.id.localeCompare(b.id);
  })[0]!;
}

export function refitFixedCandidate(score: CandidateScore, rows: readonly MlbTrainingRow[]): ExpectedRunsModel {
  if (score.family === "ridge-linear") return fitRidgeExpectedRunsFixed(rows, MLB_224C_FEATURE_SCHEMA, score.lambda);
  if (score.family === "poisson") return fitPoissonExpectedRunsFixed(rows, MLB_224C_FEATURE_SCHEMA, score.lambda);
  if (score.alpha === null) throw new Error("Selected NB2 candidate has no alpha");
  return fitNb2ExpectedRunsFixed(rows, MLB_224C_FEATURE_SCHEMA, score.lambda, score.alpha);
}

export type DistributionChoice = { kind: "poisson" | "nb2"; alpha: number | null };
export type CalibrationChoice = { kind: "identity" } | { kind: "platt"; parameters: PlattCalibration };
export interface FrozenMapping { distribution: DistributionChoice; calibration: CalibrationChoice }

export function forecastGame(model: ExpectedRunsModel, mapping: FrozenMapping, game: DevelopmentGame) {
  const home = predictExpectedRuns(model, game.home);
  const away = predictExpectedRuns(model, game.away);
  const score = projectedScoreContract(home, away);
  const distribution = convolveIndependentScores(home, away, {
    kind: mapping.distribution.kind, alpha: mapping.distribution.alpha ?? .25,
  });
  const raw = distribution.homeWinProbability;
  const homeProbability = mapping.calibration.kind === "platt"
    ? applyPlattCalibration(mapping.calibration.parameters, raw) : raw;
  const awayProbability = 1 - homeProbability;
  if (Math.abs(homeProbability + awayProbability - 1) > 1e-12) throw new Error("Probability sum failure");
  return {
    ...score, home_win_probability: homeProbability, away_win_probability: awayProbability,
    fair_home_moneyline: fairAmericanOdds(homeProbability),
    fair_away_moneyline: fairAmericanOdds(awayProbability),
  };
}

export function evaluateForecasts(games: readonly DevelopmentGame[], forecasts: readonly ReturnType<typeof forecastGame>[]) {
  if (games.length !== forecasts.length || !games.length) throw new Error("Forecast evaluation cardinality mismatch");
  const paired = games.map((game, i) => ({ game, forecast: forecasts[i]! }));
  const metrics = {
    runs: runMetrics(paired.map(({ game, forecast }) => ({
      predictedHome: forecast.home_expected_runs_exact, predictedAway: forecast.away_expected_runs_exact,
      actualHome: game.homeRuns, actualAway: game.awayRuns,
    }))),
    probability: probabilityMetrics(paired.map(({ game, forecast }) => ({
      probability: forecast.home_win_probability, outcome: (game.homeRuns > game.awayRuns ? 1 : 0) as 0 | 1,
    }))),
  };
  const segment = (selected: typeof paired) => selected.length ? {
    count: selected.length,
    runs: runMetrics(selected.map(({ game, forecast }) => ({
      predictedHome: forecast.home_expected_runs_exact, predictedAway: forecast.away_expected_runs_exact,
      actualHome: game.homeRuns, actualAway: game.awayRuns,
    }))),
  } : { count: 0 };
  const by = (key: (row: typeof paired[number]) => string) =>
    Object.fromEntries([...new Set(paired.map(key))].sort().map((value) =>
      [value, segment(paired.filter((row) => key(row) === value))]));
  return {
    ...metrics,
    segments: {
      season: by(({ game }) => String(game.season)),
      month: by(({ game }) => game.date.slice(0, 7)),
      seasonPhase: by(({ game }) => {
        const month = Number(game.date.slice(5, 7));
        return month <= 5 ? "EARLY" : month <= 7 ? "MID" : "LATE";
      }),
      predictedTotalBucket: by(({ forecast }) => String(Math.floor(forecast.projected_total_exact / 2) * 2)),
      runEnvironment: by(({ game }) => {
        const league = game.home.leagueEnvironment.seasonRunsPerTeamGame;
        return typeof league !== "number" ? "MISSING" : league < 4.2 ? "LOW" : league > 4.8 ? "HIGH" : "NORMAL";
      }),
    },
  };
}

export function chooseCalibration(
  rows: readonly { probability: number; outcome: 0 | 1 }[],
): CalibrationChoice {
  const identity = probabilityMetrics(rows);
  const parameters = fitPlattCalibration(rows);
  const calibratedRows = rows.map((row) => ({
    probability: applyPlattCalibration(parameters, row.probability), outcome: row.outcome,
  }));
  const calibrated = probabilityMetrics(calibratedRows);
  const better = calibrated.brier < identity.brier - 1e-6
    && calibrated.logLoss <= identity.logLoss && calibrated.ece <= identity.ece;
  return better ? { kind: "platt", parameters } : { kind: "identity" };
}