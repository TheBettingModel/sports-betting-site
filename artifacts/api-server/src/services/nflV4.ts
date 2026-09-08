import { createHash } from "node:crypto";
import { and, asc, eq, gt, isNotNull, lt } from "drizzle-orm";
import { db, gamesTable } from "@workspace/db";
import {
  stableHash,
  validateCanonicalV4Forecast,
  validateV4Evidence,
  type CanonicalV4Forecast,
  type SportEngineV4,
  type V4EvidenceEnvelope,
} from "./v4Platform";
import { fetchSportGamesByDate } from "./espn";

export const NFL_V4_CONTRACT_ID = "nfl-v4-core-elo-score-1";
export const NFL_V4_FEATURES = Object.freeze([
  "home_elo",
  "away_elo",
  "home_points_for",
  "home_points_allowed",
  "away_points_for",
  "away_points_allowed",
  "home_rest_days",
  "away_rest_days",
  "home_season_games",
  "away_season_games",
  "home_indicator",
] as const);

export type NflV4Feature = typeof NFL_V4_FEATURES[number];
export type NflHistoricalGame = Readonly<{
  gameId: string;
  eventStart: string;
  completedAt: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}>;
export type NflV4Vector = Readonly<{
  gameId: string;
  eventStart: string;
  dataCutoff: string;
  sourceEvidenceTimes: readonly string[];
  features: Readonly<Record<NflV4Feature, number>>;
  homeScore: number;
  awayScore: number;
  season: number;
}>;
type TeamState = {
  elo: number;
  pointsFor: number;
  pointsAllowed: number;
  seasonGames: number;
  totalGames: number;
  lastPlayedAt: number | null;
  evidenceTimes: string[];
};
export type NflV4HistorySeed = Readonly<{
  asOf: string;
  season: number;
  sourceHash: string;
  teams: Readonly<Record<string, Readonly<TeamState>>>;
}>;
type LinearModel = Readonly<{ intercept: number; coefficients: readonly number[] }>;
export type NflV4CandidateResult = Readonly<{
  name: string;
  carryover: number;
  kFactor: number;
  homeAdvantageElo: number;
  validationBrier: number;
  oosBrier: number;
  selected: boolean;
}>;
export type NflV4Artifact = Readonly<{
  sport: "NFL";
  modelId: "tbm-nfl-v4-core";
  modelVersion: "4.0.0-elo-score";
  modelFamily: "season-aware-elo-plus-ridge-score";
  featureContractId: typeof NFL_V4_CONTRACT_ID;
  featureContractHash: string;
  featureNames: typeof NFL_V4_FEATURES;
  trainingCohortHash: string;
  validationCohortHash: string;
  oosCohortHash: string;
  parameterHash: string;
  artifactHash: string;
  trainedAt: string;
  trainingRows: number;
  validationRows: number;
  oosRows: number;
  dateRange: { start: string; end: string };
  parameters: {
    carryover: number;
    kFactor: number;
    homeAdvantageElo: number;
    scoreRidgeLambda: number;
    scoreRecencyAlpha: number;
    leaguePointsPrior: number;
  };
  normalization: { means: readonly number[]; scales: readonly number[] };
  homeScoreModel: LinearModel;
  awayScoreModel: LinearModel;
  historySeed: NflV4HistorySeed;
  candidates: readonly NflV4CandidateResult[];
  metrics: {
    trainingBrier: number;
    validationBrier: number;
    oosBrier: number;
    baselineValidationBrier: number;
    baselineOosBrier: number;
    validationLogLoss: number;
    oosLogLoss: number;
    validationEce: number;
    oosEce: number;
    validationAuc: number;
    oosAuc: number;
    homeScoreMae: number;
    awayScoreMae: number;
    marginMae: number;
    totalMae: number;
    homeScoreBias: number;
    awayScoreBias: number;
    marginBias: number;
    totalBias: number;
    actualAverageHomeScore: number;
    predictedAverageHomeScore: number;
    actualAverageAwayScore: number;
    predictedAverageAwayScore: number;
    actualAverageTotal: number;
    predictedAverageTotal: number;
    actualAverageMargin: number;
    predictedAverageMargin: number;
  };
  approvalState: "SHADOW";
  maturity: "DEVELOPING";
}>;

const contractHash = stableHash({
  id: NFL_V4_CONTRACT_ID,
  features: NFL_V4_FEATURES,
  orientation: "all team features are home then away; elo probability includes only a fixed home-field term",
  units: {
    elo: "rating points", scoring: "points per game", rest: "days capped at 21", games: "count",
  },
  missingness: "league scoring and 1500 Elo priors; no market, QB, injury, or hindsight fields",
  chronology: "only outcomes with conservative completion bound strictly before kickoff",
  seasonBoundary: "July 1; ratings and scoring state regress toward league priors",
});

const DAY = 86_400_000;
export function nflSeason(eventStart: string | Date): number {
  const date = eventStart instanceof Date ? eventStart : new Date(eventStart);
  return date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0);
}
function initialState(prior: number): TeamState {
  return {
    elo: 1500, pointsFor: prior, pointsAllowed: prior, seasonGames: 0,
    totalGames: 0, lastPlayedAt: null, evidenceTimes: [],
  };
}
function transition(state: TeamState, carryover: number, prior: number): void {
  state.elo = 1500 + (state.elo - 1500) * carryover;
  state.pointsFor = prior + (state.pointsFor - prior) * carryover;
  state.pointsAllowed = prior + (state.pointsAllowed - prior) * carryover;
  state.seasonGames = 0;
  state.lastPlayedAt = null;
}
function rest(last: number | null, start: number): number {
  return last == null ? 14 : Math.max(0, Math.min(21, (start - last) / DAY));
}
function inputFeatures(
  home: TeamState,
  away: TeamState,
  eventStart: number,
): Record<NflV4Feature, number> {
  return {
    home_elo: home.elo,
    away_elo: away.elo,
    home_points_for: home.pointsFor,
    home_points_allowed: home.pointsAllowed,
    away_points_for: away.pointsFor,
    away_points_allowed: away.pointsAllowed,
    home_rest_days: rest(home.lastPlayedAt, eventStart),
    away_rest_days: rest(away.lastPlayedAt, eventStart),
    home_season_games: home.seasonGames,
    away_season_games: away.seasonGames,
    home_indicator: 1,
  };
}
function eloProbability(features: Record<NflV4Feature, number>, homeAdvantage: number): number {
  return 1 / (1 + 10 ** (-(features.home_elo + homeAdvantage - features.away_elo) / 400));
}
function applyGame(
  state: Map<string, TeamState>,
  game: NflHistoricalGame,
  parameters: Pick<NflV4Artifact["parameters"], "kFactor" | "homeAdvantageElo" | "scoreRecencyAlpha" | "leaguePointsPrior">,
): void {
  const home = state.get(game.homeTeamId) ?? initialState(parameters.leaguePointsPrior);
  const away = state.get(game.awayTeamId) ?? initialState(parameters.leaguePointsPrior);
  const feature = inputFeatures(home, away, Date.parse(game.eventStart));
  const expected = eloProbability(feature, parameters.homeAdvantageElo);
  const outcome = game.homeScore === game.awayScore ? 0.5 : Number(game.homeScore > game.awayScore);
  const marginMultiplier = Math.max(1, 2 * Math.log1p(Math.abs(game.homeScore - game.awayScore)));
  const delta = parameters.kFactor * marginMultiplier * (outcome - expected);
  home.elo += delta;
  away.elo -= delta;
  const alpha = parameters.scoreRecencyAlpha;
  home.pointsFor = alpha * game.homeScore + (1 - alpha) * home.pointsFor;
  home.pointsAllowed = alpha * game.awayScore + (1 - alpha) * home.pointsAllowed;
  away.pointsFor = alpha * game.awayScore + (1 - alpha) * away.pointsFor;
  away.pointsAllowed = alpha * game.homeScore + (1 - alpha) * away.pointsAllowed;
  home.seasonGames += 1; away.seasonGames += 1;
  home.totalGames += 1; away.totalGames += 1;
  const eventStart = Date.parse(game.eventStart);
  home.lastPlayedAt = eventStart; away.lastPlayedAt = eventStart;
  home.evidenceTimes = [...home.evidenceTimes, game.completedAt].slice(-20);
  away.evidenceTimes = [...away.evidenceTimes, game.completedAt].slice(-20);
  state.set(game.homeTeamId, home); state.set(game.awayTeamId, away);
}

export function materializeNflV4(
  games: readonly NflHistoricalGame[],
  parameters: Pick<NflV4Artifact["parameters"], "carryover" | "kFactor" | "homeAdvantageElo" | "scoreRecencyAlpha" | "leaguePointsPrior">,
): { vectors: NflV4Vector[]; seed: NflV4HistorySeed } {
  const ordered = [...games].sort((a, b) =>
    Date.parse(a.eventStart) - Date.parse(b.eventStart) || a.gameId.localeCompare(b.gameId));
  const states = new Map<string, TeamState>();
  const pending: NflHistoricalGame[] = [];
  const vectors: NflV4Vector[] = [];
  let activeSeason = ordered.length ? nflSeason(ordered[0]!.eventStart) : 0;
  for (const game of ordered) {
    const eventStart = Date.parse(game.eventStart);
    const completedAt = Date.parse(game.completedAt);
    if (!Number.isFinite(eventStart) || !Number.isFinite(completedAt) || completedAt <= eventStart
      || !Number.isFinite(game.homeScore) || !Number.isFinite(game.awayScore)) continue;
    const season = nflSeason(game.eventStart);
    if (season !== activeSeason) {
      for (let index = pending.length - 1; index >= 0; index--) {
        applyGame(states, pending[index]!, parameters);
        pending.splice(index, 1);
      }
      for (const team of states.values()) transition(team, parameters.carryover, parameters.leaguePointsPrior);
      activeSeason = season;
    }
    for (let index = pending.length - 1; index >= 0; index--) {
      if (Date.parse(pending[index]!.completedAt) < eventStart) {
        applyGame(states, pending[index]!, parameters);
        pending.splice(index, 1);
      }
    }
    const home = states.get(game.homeTeamId) ?? initialState(parameters.leaguePointsPrior);
    const away = states.get(game.awayTeamId) ?? initialState(parameters.leaguePointsPrior);
    const sourceEvidenceTimes = [...home.evidenceTimes, ...away.evidenceTimes].sort();
    const dataCutoff = sourceEvidenceTimes.at(-1);
    if (dataCutoff && Date.parse(dataCutoff) < eventStart) {
      vectors.push({
        gameId: game.gameId, eventStart: game.eventStart, dataCutoff, sourceEvidenceTimes,
        features: inputFeatures(home, away, eventStart),
        homeScore: game.homeScore, awayScore: game.awayScore, season,
      });
    }
    pending.push(game);
  }
  for (const game of pending.sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt))) {
    applyGame(states, game, parameters);
  }
  const asOf = ordered.map((game) => game.completedAt).sort().at(-1) ?? new Date(0).toISOString();
  const seedBody = {
    asOf,
    season: activeSeason,
    teams: Object.fromEntries([...states.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([team, value]) => [team, { ...value, evidenceTimes: [...value.evidenceTimes] }])),
  };
  return { vectors, seed: { ...seedBody, sourceHash: stableHash(seedBody) } };
}

function solve(matrix: number[][], target: number[], lambda: number): number[] {
  const width = matrix[0]?.length ?? 0;
  const a = Array.from({ length: width }, (_, row) =>
    Array.from({ length: width }, (_, col) =>
      matrix.reduce((sum, values) => sum + values[row]! * values[col]!, 0)
      + (row === col && row > 0 ? lambda : 0)));
  const b = Array.from({ length: width }, (_, row) =>
    matrix.reduce((sum, values, index) => sum + values[row]! * target[index]!, 0));
  for (let pivot = 0; pivot < width; pivot++) {
    let best = pivot;
    for (let row = pivot + 1; row < width; row++) {
      if (Math.abs(a[row]![pivot]!) > Math.abs(a[best]![pivot]!)) best = row;
    }
    [a[pivot], a[best]] = [a[best]!, a[pivot]!];
    [b[pivot], b[best]] = [b[best]!, b[pivot]!];
    const divisor = a[pivot]![pivot]!;
    if (Math.abs(divisor) < 1e-12) throw new Error("SINGULAR_NFL_SCORE_MATRIX");
    for (let col = pivot; col < width; col++) a[pivot]![col] /= divisor;
    b[pivot] /= divisor;
    for (let row = 0; row < width; row++) {
      if (row === pivot) continue;
      const factor = a[row]![pivot]!;
      for (let col = pivot; col < width; col++) a[row]![col] -= factor * a[pivot]![col]!;
      b[row] -= factor * b[pivot]!;
    }
  }
  return b;
}
function modelRow(vector: NflV4Vector, normalization: NflV4Artifact["normalization"]): number[] {
  return [1, ...NFL_V4_FEATURES.map((name, index) =>
    (vector.features[name] - normalization.means[index]!) / normalization.scales[index]!)];
}
function fitScore(
  vectors: readonly NflV4Vector[],
  target: "homeScore" | "awayScore",
  lambda: number,
  normalization: NflV4Artifact["normalization"],
): LinearModel {
  const beta = solve(vectors.map((vector) => modelRow(vector, normalization)),
    vectors.map((vector) => vector[target]), lambda);
  return { intercept: beta[0]!, coefficients: beta.slice(1) };
}
function predictScore(
  model: LinearModel,
  features: Readonly<Record<NflV4Feature, number>>,
  normalization: NflV4Artifact["normalization"],
): number {
  return Math.max(0, model.intercept + model.coefficients.reduce((sum, coefficient, index) =>
    sum + coefficient * (features[NFL_V4_FEATURES[index]!] - normalization.means[index]!)
      / normalization.scales[index]!, 0));
}
function target(vector: NflV4Vector): number {
  return vector.homeScore === vector.awayScore ? 0.5 : Number(vector.homeScore > vector.awayScore);
}
function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function mae(values: readonly number[]): number {
  return mean(values.map(Math.abs));
}
function brier(vectors: readonly NflV4Vector[], forecast: (vector: NflV4Vector) => number): number {
  return mean(vectors.map((vector) => (forecast(vector) - target(vector)) ** 2));
}
function logLoss(vectors: readonly NflV4Vector[], forecast: (vector: NflV4Vector) => number): number {
  return mean(vectors.map((vector) => {
    const probability = Math.min(.999999, Math.max(.000001, forecast(vector)));
    const outcome = target(vector);
    return -(outcome * Math.log(probability) + (1 - outcome) * Math.log(1 - probability));
  }));
}
function ece(vectors: readonly NflV4Vector[], forecast: (vector: NflV4Vector) => number): number {
  let total = 0;
  for (let lower = 0; lower < 1; lower += .1) {
    const bucket = vectors.filter((vector) => {
      const probability = forecast(vector);
      return probability >= lower && (lower >= .9 ? probability <= 1 : probability < lower + .1);
    });
    if (bucket.length) total += bucket.length / vectors.length
      * Math.abs(mean(bucket.map(forecast)) - mean(bucket.map(target)));
  }
  return total;
}
function auc(vectors: readonly NflV4Vector[], forecast: (vector: NflV4Vector) => number): number {
  const positives = vectors.filter((vector) => target(vector) === 1);
  const negatives = vectors.filter((vector) => target(vector) === 0);
  if (!positives.length || !negatives.length) return .5;
  let wins = 0;
  for (const positive of positives) for (const negative of negatives) {
    const difference = forecast(positive) - forecast(negative);
    wins += difference > 0 ? 1 : difference === 0 ? .5 : 0;
  }
  return wins / (positives.length * negatives.length);
}

const candidateParameters = Object.freeze([
  { name: "ELO_BALANCED", carryover: .35, kFactor: 12, homeAdvantageElo: 45 },
  { name: "ELO_LOW_CARRY", carryover: .20, kFactor: 12, homeAdvantageElo: 45 },
  { name: "ELO_HIGH_CARRY", carryover: .50, kFactor: 12, homeAdvantageElo: 45 },
  { name: "ELO_SLOW", carryover: .35, kFactor: 8, homeAdvantageElo: 45 },
  { name: "ELO_HOME_55", carryover: .35, kFactor: 12, homeAdvantageElo: 55 },
] as const);

export function trainNflV4(games: readonly NflHistoricalGame[], trainedAt: string): NflV4Artifact {
  const common = { scoreRecencyAlpha: .25, leaguePointsPrior: 22.5 };
  const materialized = candidateParameters.map((candidate) => ({
    candidate,
    ...materializeNflV4(games, { ...candidate, ...common }),
  }));
  const count = materialized[0]!.vectors.length;
  if (count < 500 || materialized.some((value) => value.vectors.length !== count)) {
    throw new Error("NFL_COHORT_INSUFFICIENT_OR_UNSTABLE");
  }
  const trainEnd = Math.floor(count * .70);
  const validationEnd = Math.floor(count * .85);
  const baselineHomeRate = mean(materialized[0]!.vectors.slice(0, trainEnd).map(target));
  const candidateScores = materialized.map(({ candidate, vectors }) => {
    const validation = vectors.slice(trainEnd, validationEnd);
    const oos = vectors.slice(validationEnd);
    const forecast = (vector: NflV4Vector) => eloProbability(vector.features, candidate.homeAdvantageElo);
    return {
      name: candidate.name, carryover: candidate.carryover, kFactor: candidate.kFactor,
      homeAdvantageElo: candidate.homeAdvantageElo,
      validationBrier: brier(validation, forecast), oosBrier: brier(oos, forecast),
      selected: false,
    };
  }).sort((a, b) => a.validationBrier - b.validationBrier || a.name.localeCompare(b.name));
  const selectedScore = candidateScores[0]!;
  const selectedIndex = materialized.findIndex((value) => value.candidate.name === selectedScore.name);
  const selected = materialized[selectedIndex]!;
  const vectors = selected.vectors;
  const train = vectors.slice(0, trainEnd);
  const validation = vectors.slice(trainEnd, validationEnd);
  const oos = vectors.slice(validationEnd);
  const means = NFL_V4_FEATURES.map((name) => mean(train.map((vector) => vector.features[name])));
  const scales = NFL_V4_FEATURES.map((name, index) =>
    Math.sqrt(mean(train.map((vector) => (vector.features[name] - means[index]!) ** 2))) || 1);
  const normalization = { means, scales };
  const scoreCandidates = [10, 100].map((lambda) => {
    const home = fitScore(train, "homeScore", lambda, normalization);
    const away = fitScore(train, "awayScore", lambda, normalization);
    const score = mae(validation.flatMap((vector) => [
      predictScore(home, vector.features, normalization) - vector.homeScore,
      predictScore(away, vector.features, normalization) - vector.awayScore,
    ]));
    return { lambda, home, away, score };
  }).sort((a, b) => a.score - b.score || a.lambda - b.lambda)[0]!;
  const forecast = (vector: NflV4Vector) =>
    eloProbability(vector.features, selected.candidate.homeAdvantageElo);
  const baselineValidationBrier = brier(validation, () => baselineHomeRate);
  const baselineOosBrier = brier(oos, () => baselineHomeRate);
  const scored = oos.map((vector) => {
    const home = predictScore(scoreCandidates.home, vector.features, normalization);
    const away = predictScore(scoreCandidates.away, vector.features, normalization);
    return { vector, home, away };
  });
  const residual = (select: (value: typeof scored[number]) => number) => scored.map(select);
  const metrics = {
    trainingBrier: brier(train, forecast),
    validationBrier: brier(validation, forecast),
    oosBrier: brier(oos, forecast),
    baselineValidationBrier,
    baselineOosBrier,
    validationLogLoss: logLoss(validation, forecast),
    oosLogLoss: logLoss(oos, forecast),
    validationEce: ece(validation, forecast),
    oosEce: ece(oos, forecast),
    validationAuc: auc(validation, forecast),
    oosAuc: auc(oos, forecast),
    homeScoreMae: mae(residual(({ vector, home }) => home - vector.homeScore)),
    awayScoreMae: mae(residual(({ vector, away }) => away - vector.awayScore)),
    marginMae: mae(residual(({ vector, home, away }) =>
      (home - away) - (vector.homeScore - vector.awayScore))),
    totalMae: mae(residual(({ vector, home, away }) =>
      (home + away) - (vector.homeScore + vector.awayScore))),
    homeScoreBias: mean(residual(({ vector, home }) => home - vector.homeScore)),
    awayScoreBias: mean(residual(({ vector, away }) => away - vector.awayScore)),
    marginBias: mean(residual(({ vector, home, away }) =>
      (home - away) - (vector.homeScore - vector.awayScore))),
    totalBias: mean(residual(({ vector, home, away }) =>
      (home + away) - (vector.homeScore + vector.awayScore))),
    actualAverageHomeScore: mean(oos.map((vector) => vector.homeScore)),
    predictedAverageHomeScore: mean(scored.map(({ home }) => home)),
    actualAverageAwayScore: mean(oos.map((vector) => vector.awayScore)),
    predictedAverageAwayScore: mean(scored.map(({ away }) => away)),
    actualAverageTotal: mean(oos.map((vector) => vector.homeScore + vector.awayScore)),
    predictedAverageTotal: mean(scored.map(({ home, away }) => home + away)),
    actualAverageMargin: mean(oos.map((vector) => vector.homeScore - vector.awayScore)),
    predictedAverageMargin: mean(scored.map(({ home, away }) => home - away)),
  };
  if (metrics.validationBrier >= baselineValidationBrier || metrics.oosBrier >= baselineOosBrier
    || Math.abs(metrics.totalBias) > 4 || Math.abs(metrics.marginBias) > 3) {
    throw new Error("NFL_MODEL_QUALITY_GATE_FAILED");
  }
  const parameters = {
    carryover: selected.candidate.carryover, kFactor: selected.candidate.kFactor,
    homeAdvantageElo: selected.candidate.homeAdvantageElo,
    scoreRidgeLambda: scoreCandidates.lambda, ...common,
  };
  const body = {
    sport: "NFL" as const, modelId: "tbm-nfl-v4-core" as const,
    modelVersion: "4.0.0-elo-score" as const,
    modelFamily: "season-aware-elo-plus-ridge-score" as const,
    featureContractId: NFL_V4_CONTRACT_ID as typeof NFL_V4_CONTRACT_ID, featureContractHash: contractHash,
    featureNames: NFL_V4_FEATURES,
    trainingCohortHash: stableHash(train), validationCohortHash: stableHash(validation),
    oosCohortHash: stableHash(oos), trainedAt,
    trainingRows: train.length, validationRows: validation.length, oosRows: oos.length,
    dateRange: { start: vectors[0]!.eventStart, end: vectors.at(-1)!.eventStart },
    parameters, normalization, homeScoreModel: scoreCandidates.home,
    awayScoreModel: scoreCandidates.away, historySeed: selected.seed,
    candidates: candidateScores.map((candidate) => ({
      ...candidate, selected: candidate.name === selected.candidate.name,
    })),
    metrics, approvalState: "SHADOW" as const, maturity: "DEVELOPING" as const,
  };
  const parameterHash = stableHash({
    parameters, normalization, homeScoreModel: body.homeScoreModel, awayScoreModel: body.awayScoreModel,
  });
  return { ...body, parameterHash, artifactHash: stableHash({ ...body, parameterHash }) };
}

function applySeasonTransitions(
  states: Map<string, TeamState>,
  fromSeason: number,
  toSeason: number,
  artifact: NflV4Artifact,
): number {
  let season = fromSeason;
  while (season < toSeason) {
    for (const state of states.values()) {
      transition(state, artifact.parameters.carryover, artifact.parameters.leaguePointsPrior);
    }
    season += 1;
  }
  return season;
}

export function createNflV4Engine(artifact: NflV4Artifact): SportEngineV4<Record<NflV4Feature, number>> {
  const { artifactHash, ...body } = artifact;
  if (stableHash(body) !== artifactHash) throw new Error("ARTIFACT_HASH_MISMATCH");
  const identity = {
    sport: "NFL" as const, modelFamily: artifact.modelFamily, modelId: artifact.modelId, modelVersion: artifact.modelVersion,
    // This artifact format predates a separately governed artifact identifier.
    // Keep the absence explicit so it can never resolve an official approval.
    artifactId: "UNAVAILABLE_ARTIFACT_ID",
    artifactHash, contractId: artifact.featureContractId, contractHash: artifact.featureContractHash,
    inputContractVersion: artifact.featureContractId,
    configurationHash: stableHash({ featureContractHash: artifact.featureContractHash, normalization: artifact.normalization }),
    parameterHash: artifact.parameterHash,
  };
  return {
    identity, approvalState: artifact.approvalState, maturity: artifact.maturity,
    async collectEvidence(gameId) {
      const [event] = await db.select({
        id: gamesTable.id, homeTeamId: gamesTable.homeTeamId, awayTeamId: gamesTable.awayTeamId,
        startsAt: gamesTable.startsAt, gameDate: gamesTable.gameDate,
      }).from(gamesTable).where(and(eq(gamesTable.id, gameId), eq(gamesTable.sport, "NFL"))).limit(1);
      if (!event) throw new Error("LIVE_EVENT_IDENTITY_INCOMPLETE");
      let startsAt = event.startsAt;
      let homeTeamId = event.homeTeamId;
      let awayTeamId = event.awayTeamId;
      if (!startsAt || !homeTeamId || !awayTeamId) {
        const schedule = await fetchSportGamesByDate("NFL", event.gameDate.replaceAll("-", ""));
        const providerEvent = schedule.find((game) => game.espnId === event.id);
        startsAt ??= providerEvent ? new Date(providerEvent.commenceTimeISO) : null;
        homeTeamId ??= providerEvent?.homeTeamId ?? null;
        awayTeamId ??= providerEvent?.awayTeamId ?? null;
      }
      if (!homeTeamId || !awayTeamId) throw new Error("LIVE_EVENT_IDENTITY_INCOMPLETE");
      if (!startsAt || !Number.isFinite(startsAt.getTime())) throw new Error("LIVE_EVENT_CUTOFF_UNAVAILABLE");
      const history = await db.select({
        id: gamesTable.id, homeTeamId: gamesTable.homeTeamId, awayTeamId: gamesTable.awayTeamId,
        startsAt: gamesTable.startsAt, homeScore: gamesTable.homeScore, awayScore: gamesTable.awayScore,
      }).from(gamesTable).where(and(
        eq(gamesTable.sport, "NFL"), eq(gamesTable.status, "final"),
        isNotNull(gamesTable.startsAt), isNotNull(gamesTable.homeScore), isNotNull(gamesTable.awayScore),
        gt(gamesTable.startsAt, new Date(artifact.historySeed.asOf)), lt(gamesTable.startsAt, startsAt),
      )).orderBy(asc(gamesTable.startsAt));
      return { event: { ...event, startsAt, homeTeamId, awayTeamId }, history };
    },
    async materializeInput(raw, now) {
      const { event, history } = raw as {
        event: { id: string; homeTeamId: string; awayTeamId: string; startsAt: Date };
        history: Array<{ id: string; homeTeamId: string | null; awayTeamId: string | null;
          startsAt: Date | null; homeScore: number | null; awayScore: number | null }>;
      };
      if (now >= event.startsAt) throw new Error("EVENT_ALREADY_STARTED");
      const states = new Map<string, TeamState>(Object.entries(artifact.historySeed.teams)
        .map(([team, state]) => [team, { ...state, evidenceTimes: [...state.evidenceTimes] }]));
      let season = artifact.historySeed.season;
      for (const game of history) {
        if (!game.homeTeamId || !game.awayTeamId || !game.startsAt
          || game.homeScore == null || game.awayScore == null) continue;
        const completedAt = new Date(game.startsAt.getTime() + 12 * 60 * 60 * 1000);
        if (completedAt >= event.startsAt) continue;
        season = applySeasonTransitions(states, season, nflSeason(game.startsAt), artifact);
        applyGame(states, {
          gameId: game.id, eventStart: game.startsAt.toISOString(), completedAt: completedAt.toISOString(),
          homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId,
          homeScore: game.homeScore, awayScore: game.awayScore,
        }, artifact.parameters);
      }
      applySeasonTransitions(states, season, nflSeason(event.startsAt), artifact);
      const home = states.get(event.homeTeamId) ?? initialState(artifact.parameters.leaguePointsPrior);
      const away = states.get(event.awayTeamId) ?? initialState(artifact.parameters.leaguePointsPrior);
      const sourceEvidenceTimes = [...home.evidenceTimes, ...away.evidenceTimes].sort();
      const dataCutoff = sourceEvidenceTimes.at(-1);
      if (!dataCutoff || Date.parse(dataCutoff) >= event.startsAt.getTime()) {
        throw new Error("LIVE_INPUT_MATERIALIZATION_FAILED");
      }
      const input = inputFeatures(home, away, event.startsAt.getTime());
      return {
        gameId: event.id, eventStart: event.startsAt.toISOString(), dataCutoff,
        predictionTimestamp: now.toISOString(), sourceEvidenceTimes,
        featureSnapshotId: `NFL:${event.id}:${dataCutoff}`,
        featureHash: stableHash(input), input,
      };
    },
    validateInput(input) {
      validateV4Evidence(input);
      if (Object.keys(input.input).sort().join("|") !== [...NFL_V4_FEATURES].sort().join("|")
        || Object.values(input.input).some((value) => !Number.isFinite(value))) {
        throw new Error("FEATURE_CONTRACT_MISMATCH");
      }
    },
    async predict(input: V4EvidenceEnvelope<Record<NflV4Feature, number>>) {
      const home = predictScore(artifact.homeScoreModel, input.input, artifact.normalization);
      const away = predictScore(artifact.awayScoreModel, input.input, artifact.normalization);
      const homeWinProbability = eloProbability(input.input, artifact.parameters.homeAdvantageElo);
      const predictionId = createHash("sha256").update(stableHash({
        identity, gameId: input.gameId, featureHash: input.featureHash,
      })).digest("hex");
      return {
        predictionId, ...identity, gameId: input.gameId,
        featureSnapshotId: input.featureSnapshotId, featureHash: input.featureHash,
        inputHash: input.featureHash,
        dataCutoff: input.dataCutoff, predictionTimestamp: input.predictionTimestamp,
        approvalState: artifact.approvalState, maturity: artifact.maturity,
        homeWinProbability, awayWinProbability: 1 - homeWinProbability,
        expectedHomeScore: home, expectedAwayScore: away,
        expectedMargin: home - away, expectedTotal: home + away,
        evidenceTier: "NFL_V4_CORE_TEAM_HISTORY",
        qualityFlags: ["SHADOW_VALIDATING", "QB_INJURY_CONTEXT_PROSPECTIVE_ONLY"],
      };
    },
    validateOutput(output: CanonicalV4Forecast, input) {
      if (output.approvalState !== "SHADOW") throw new Error("UNEXPECTED_PUBLICATION_STATE");
      validateCanonicalV4Forecast(output, input, identity);
    },
  };
}