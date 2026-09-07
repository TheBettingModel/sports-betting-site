import { createHash } from "node:crypto";
import { and, asc, eq, gt, isNotNull, lt } from "drizzle-orm";
import { db, gamesTable } from "@workspace/db";
import {
  stableHash,
  type CanonicalV4Forecast,
  type SportEngineV4,
  type TbmV4Sport,
  type V4EvidenceEnvelope,
} from "./v4Platform";

export const ROLLING_SCORE_V4_CONTRACT_VERSION = "rolling-score-v4-core-1";
export const ROLLING_SCORE_V4_FEATURES = Object.freeze([
  "home_scored_avg",
  "home_allowed_avg",
  "away_scored_avg",
  "away_allowed_avg",
  "home_games_log1p",
  "away_games_log1p",
  "home_rest_days",
  "away_rest_days",
  "home_indicator",
] as const);

export type RollingScoreFeature = typeof ROLLING_SCORE_V4_FEATURES[number];
export type CompletedScoreGame = Readonly<{
  gameId: string;
  sport: string;
  homeTeamId: string;
  awayTeamId: string;
  eventStart: string;
  completedAt: string;
  homeScore: number;
  awayScore: number;
}>;
export type ScheduledScoreGame = Readonly<{
  gameId: string;
  sport: TbmV4Sport;
  homeTeamId: string;
  awayTeamId: string;
  eventStart: string;
}>;
export type RollingScoreVector = Readonly<{
  gameId: string;
  eventStart: string;
  dataCutoff: string;
  sourceEvidenceTimes: readonly string[];
  features: Readonly<Record<RollingScoreFeature, number>>;
  homeScore?: number;
  awayScore?: number;
}>;
export type LinearScoreModel = Readonly<{
  intercept: number;
  coefficients: readonly number[];
}>;
export type RollingScoreHistorySeed = Readonly<{
  asOf: string;
  sourceHash: string;
  teams: Readonly<Record<string, Readonly<{
    games: number;
    scored: number;
    allowed: number;
    lastPlayedAt: number;
    evidenceTimes: readonly string[];
  }>>>;
}>;
export type RollingScoreV4Artifact = Readonly<{
  sport: TbmV4Sport;
  modelId: string;
  modelVersion: string;
  modelFamily: "independent-ridge-score";
  featureContractId: typeof ROLLING_SCORE_V4_CONTRACT_VERSION;
  featureContractHash: string;
  featureNames: typeof ROLLING_SCORE_V4_FEATURES;
  trainingCohortHash: string;
  validationCohortHash: string;
  parameterHash: string;
  artifactHash: string;
  trainedAt: string;
  trainingRows: number;
  validationRows: number;
  dateRange: { start: string; end: string };
  ridgeLambda: number;
  normalization: {
    means: readonly number[];
    scales: readonly number[];
  };
  homeModel: LinearScoreModel;
  awayModel: LinearScoreModel;
  historySeed?: RollingScoreHistorySeed;
  metrics: {
    validationHomeMae: number;
    validationAwayMae: number;
    validationMarginMae: number;
    validationTotalMae: number;
    validationBrier: number;
    baselineBrier: number;
    actualAverageTotal: number;
    predictedAverageTotal: number;
    totalBias: number;
  };
  approvalState: "SHADOW";
  maturity: "DEVELOPING";
}>;

const DB_SPORT: Record<TbmV4Sport, string> = {
  MLB: "MLB", NCAAF: "NCAAF", NFL: "NFL", NBA: "NBA", WNBA: "WNBA",
  NHL: "NHL", SOCCER: "Soccer", UFC: "UFC", NCAAMB: "NCAAB",
};

type TeamState = {
  games: number;
  scored: number;
  allowed: number;
  lastPlayedAt: number | null;
  evidenceTimes: string[];
};

const contractHash = stableHash({
  id: ROLLING_SCORE_V4_CONTRACT_VERSION,
  featureNames: ROLLING_SCORE_V4_FEATURES,
  semantics: "pregame rolling team scoring state from strictly earlier completed events",
  missingness: "minimum two prior games per team; league priors not substituted",
});

function state(): TeamState {
  return { games: 0, scored: 0, allowed: 0, lastPlayedAt: null, evidenceTimes: [] };
}

export function buildRollingScoreHistorySeed(games: readonly CompletedScoreGame[]): RollingScoreHistorySeed {
  const teams = new Map<string, TeamState>();
  const ordered = [...games].sort((a, b) =>
    Date.parse(a.completedAt) - Date.parse(b.completedAt) || a.gameId.localeCompare(b.gameId));
  for (const game of ordered) {
    const eventStart = Date.parse(game.eventStart);
    const completedAt = Date.parse(game.completedAt);
    if (!Number.isFinite(eventStart) || !Number.isFinite(completedAt) || completedAt <= eventStart) continue;
    const home = teams.get(game.homeTeamId) ?? state();
    const away = teams.get(game.awayTeamId) ?? state();
    home.games++; home.scored += game.homeScore; home.allowed += game.awayScore;
    home.lastPlayedAt = eventStart; home.evidenceTimes = [...home.evidenceTimes, game.completedAt].slice(-20);
    away.games++; away.scored += game.awayScore; away.allowed += game.homeScore;
    away.lastPlayedAt = eventStart; away.evidenceTimes = [...away.evidenceTimes, game.completedAt].slice(-20);
    teams.set(game.homeTeamId, home); teams.set(game.awayTeamId, away);
  }
  const asOf = ordered.map((game) => game.completedAt).sort().at(-1) ?? new Date(0).toISOString();
  const body = {
    asOf,
    teams: Object.fromEntries([...teams.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, team]) => [id, {
      games: team.games, scored: team.scored, allowed: team.allowed,
      lastPlayedAt: team.lastPlayedAt!, evidenceTimes: team.evidenceTimes,
    }])),
  };
  return { ...body, sourceHash: stableHash(body) };
}

function daysBetween(earlier: number, later: number): number {
  return Math.max(0, Math.min(30, (later - earlier) / 86_400_000));
}

function features(home: TeamState, away: TeamState, eventStart: number): Record<RollingScoreFeature, number> {
  if (home.games < 2 || away.games < 2 || home.lastPlayedAt == null || away.lastPlayedAt == null) {
    throw new Error("INSUFFICIENT_PRIOR_TEAM_HISTORY");
  }
  return {
    home_scored_avg: home.scored / home.games,
    home_allowed_avg: home.allowed / home.games,
    away_scored_avg: away.scored / away.games,
    away_allowed_avg: away.allowed / away.games,
    home_games_log1p: Math.log1p(home.games),
    away_games_log1p: Math.log1p(away.games),
    home_rest_days: daysBetween(home.lastPlayedAt, eventStart),
    away_rest_days: daysBetween(away.lastPlayedAt, eventStart),
    home_indicator: 1,
  };
}

export function materializeRollingScoreTraining(
  sport: TbmV4Sport,
  games: readonly CompletedScoreGame[],
): RollingScoreVector[] {
  const teams = new Map<string, TeamState>();
  const vectors: RollingScoreVector[] = [];
  const pending: CompletedScoreGame[] = [];
  const applyCompleted = (game: CompletedScoreGame) => {
    const eventStart = Date.parse(game.eventStart);
    const home = teams.get(game.homeTeamId) ?? state();
    const away = teams.get(game.awayTeamId) ?? state();
    home.games += 1;
    home.scored += game.homeScore;
    home.allowed += game.awayScore;
    home.lastPlayedAt = eventStart;
    home.evidenceTimes = [...home.evidenceTimes, game.completedAt].slice(-20);
    away.games += 1;
    away.scored += game.awayScore;
    away.allowed += game.homeScore;
    away.lastPlayedAt = eventStart;
    away.evidenceTimes = [...away.evidenceTimes, game.completedAt].slice(-20);
    teams.set(game.homeTeamId, home);
    teams.set(game.awayTeamId, away);
  };
  const ordered = [...games]
    .filter((game) => {
      const canonical = game.sport.toUpperCase() === "NCAAB" ? "NCAAMB" : game.sport.toUpperCase();
      return canonical === sport;
    })
    .sort((a, b) => Date.parse(a.eventStart) - Date.parse(b.eventStart) || a.gameId.localeCompare(b.gameId));
  for (const game of ordered) {
    const eventStart = Date.parse(game.eventStart);
    const completedAt = Date.parse(game.completedAt);
    if (!Number.isFinite(eventStart) || !Number.isFinite(completedAt)
      || completedAt <= eventStart || !Number.isFinite(game.homeScore)
      || !Number.isFinite(game.awayScore)) continue;
    for (let index = pending.length - 1; index >= 0; index--) {
      if (Date.parse(pending[index]!.completedAt) < eventStart) {
        applyCompleted(pending[index]!);
        pending.splice(index, 1);
      }
    }
    const home = teams.get(game.homeTeamId) ?? state();
    const away = teams.get(game.awayTeamId) ?? state();
    try {
      const sourceEvidenceTimes = [...home.evidenceTimes, ...away.evidenceTimes].sort();
      const dataCutoff = sourceEvidenceTimes.at(-1);
      if (dataCutoff && Date.parse(dataCutoff) < eventStart) {
        vectors.push({
          gameId: game.gameId,
          eventStart: game.eventStart,
          dataCutoff,
          sourceEvidenceTimes,
          features: features(home, away, eventStart),
          homeScore: game.homeScore,
          awayScore: game.awayScore,
        });
      }
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "INSUFFICIENT_PRIOR_TEAM_HISTORY") throw error;
    }
    pending.push(game);
  }
  return vectors;
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
    if (Math.abs(divisor) < 1e-12) throw new Error("SINGULAR_TRAINING_MATRIX");
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

function row(
  vector: RollingScoreVector,
  normalization: RollingScoreV4Artifact["normalization"],
): number[] {
  return [1, ...ROLLING_SCORE_V4_FEATURES.map((name, index) =>
    (vector.features[name] - normalization.means[index]!) / normalization.scales[index]!)];
}

function fit(
  vectors: readonly RollingScoreVector[],
  target: "homeScore" | "awayScore",
  lambda: number,
  normalization: RollingScoreV4Artifact["normalization"],
): LinearScoreModel {
  const beta = solve(vectors.map((vector) => row(vector, normalization)), vectors.map((vector) => vector[target]!), lambda);
  return { intercept: beta[0]!, coefficients: beta.slice(1) };
}

function estimate(
  model: LinearScoreModel,
  vector: RollingScoreVector,
  normalization: RollingScoreV4Artifact["normalization"],
): number {
  return Math.max(0, model.intercept + model.coefficients.reduce(
    (sum, coefficient, index) => sum + coefficient
      * (vector.features[ROLLING_SCORE_V4_FEATURES[index]!]! - normalization.means[index]!)
      / normalization.scales[index]!,
    0,
  ));
}

function probability(home: number, away: number): number {
  return 1 / (1 + Math.exp(-(home - away) / Math.max(1, Math.sqrt(home + away))));
}

function poissonMass(mean: number, goals: number): number {
  let factorial = 1;
  for (let value = 2; value <= goals; value++) factorial *= value;
  return Math.exp(-mean) * mean ** goals / factorial;
}

function outcomeProbabilities(
  sport: TbmV4Sport,
  home: number,
  away: number,
): { home: number; draw?: number; away: number } {
  if (sport !== "SOCCER") {
    const homeProbability = probability(home, away);
    return { home: homeProbability, away: 1 - homeProbability };
  }
  let homeProbability = 0;
  let drawProbability = 0;
  let awayProbability = 0;
  for (let homeGoals = 0; homeGoals <= 12; homeGoals++) {
    for (let awayGoals = 0; awayGoals <= 12; awayGoals++) {
      const mass = poissonMass(home, homeGoals) * poissonMass(away, awayGoals);
      if (homeGoals > awayGoals) homeProbability += mass;
      else if (homeGoals === awayGoals) drawProbability += mass;
      else awayProbability += mass;
    }
  }
  const total = homeProbability + drawProbability + awayProbability;
  return { home: homeProbability / total, draw: drawProbability / total, away: awayProbability / total };
}

function mae(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length;
}

export function trainRollingScoreV4(
  sport: TbmV4Sport,
  vectors: readonly RollingScoreVector[],
  trainedAt: string,
  historySeed?: RollingScoreHistorySeed,
): RollingScoreV4Artifact {
  if (vectors.length < 40) throw new Error("INSUFFICIENT_TRAINING_ROWS");
  const split = Math.floor(vectors.length * .8);
  const train = vectors.slice(0, split);
  const validation = vectors.slice(split);
  if (validation.length < 8) throw new Error("INSUFFICIENT_VALIDATION_ROWS");
  const means = ROLLING_SCORE_V4_FEATURES.map((name) =>
    train.reduce((sum, vector) => sum + vector.features[name], 0) / train.length);
  const scales = ROLLING_SCORE_V4_FEATURES.map((name, featureIndex) => {
    const variance = train.reduce((sum, vector) =>
      sum + (vector.features[name] - means[featureIndex]!) ** 2, 0) / train.length;
    return Math.sqrt(variance) || 1;
  });
  const normalization = { means, scales };
  const candidates = [1, 10, 100].map((ridgeLambda) => {
    const homeModel = fit(train, "homeScore", ridgeLambda, normalization);
    const awayModel = fit(train, "awayScore", ridgeLambda, normalization);
    const errors = validation.map((vector) => {
      const home = estimate(homeModel, vector, normalization);
      const away = estimate(awayModel, vector, normalization);
      return { vector, home, away };
    });
    return {
      ridgeLambda, homeModel, awayModel,
      score: mae(errors.flatMap(({ vector, home, away }) => [
        home - vector.homeScore!, away - vector.awayScore!,
      ])),
    };
  }).sort((a, b) => a.score - b.score || a.ridgeLambda - b.ridgeLambda);
  const selected = candidates[0]!;
  const predicted = validation.map((vector) => ({
    vector,
    home: estimate(selected.homeModel, vector, normalization),
    away: estimate(selected.awayModel, vector, normalization),
  }));
  const probabilities = predicted.map(({ home, away }) => outcomeProbabilities(sport, home, away));
  const outcomes = predicted.map(({ vector }) =>
    vector.homeScore! > vector.awayScore! ? "home" : vector.homeScore! < vector.awayScore! ? "away" : "draw");
  const baseline = {
    home: train.filter((vector) => vector.homeScore! > vector.awayScore!).length / train.length,
    draw: train.filter((vector) => vector.homeScore! === vector.awayScore!).length / train.length,
    away: train.filter((vector) => vector.homeScore! < vector.awayScore!).length / train.length,
  };
  const brier = (forecast: { home: number; draw?: number; away: number }, outcome: string) => {
    const classes: Array<"home" | "draw" | "away"> =
      sport === "SOCCER" ? ["home", "draw", "away"] : ["home", "away"];
    return classes.reduce<number>((sum, name) =>
      sum + ((forecast[name] ?? 0) - Number(outcome === name)) ** 2, 0) / classes.length;
  };
  const metrics = {
    validationHomeMae: mae(predicted.map(({ vector, home }) => home - vector.homeScore!)),
    validationAwayMae: mae(predicted.map(({ vector, away }) => away - vector.awayScore!)),
    validationMarginMae: mae(predicted.map(({ vector, home, away }) =>
      (home - away) - (vector.homeScore! - vector.awayScore!))),
    validationTotalMae: mae(predicted.map(({ vector, home, away }) =>
      (home + away) - (vector.homeScore! + vector.awayScore!))),
    validationBrier: probabilities.reduce((sum, forecast, index) =>
      sum + brier(forecast, outcomes[index]!), 0) / validation.length,
    baselineBrier: outcomes.reduce((sum, outcome) =>
      sum + brier(baseline, outcome), 0) / validation.length,
    actualAverageTotal: validation.reduce((sum, vector) => sum + vector.homeScore! + vector.awayScore!, 0) / validation.length,
    predictedAverageTotal: predicted.reduce((sum, value) => sum + value.home + value.away, 0) / predicted.length,
    totalBias: predicted.reduce((sum, value) =>
      sum + value.home + value.away - value.vector.homeScore! - value.vector.awayScore!, 0) / predicted.length,
  };
  const body = {
    sport,
    modelId: `tbm-${sport.toLowerCase()}-v4-core-score`,
    modelVersion: "4.0.0-core",
    modelFamily: "independent-ridge-score" as const,
    featureContractId: ROLLING_SCORE_V4_CONTRACT_VERSION,
    featureContractHash: contractHash,
    featureNames: ROLLING_SCORE_V4_FEATURES,
    trainingCohortHash: stableHash(train),
    validationCohortHash: stableHash(validation),
    trainedAt,
    trainingRows: train.length,
    validationRows: validation.length,
    dateRange: { start: vectors[0]!.eventStart, end: vectors.at(-1)!.eventStart },
    ridgeLambda: selected.ridgeLambda,
    normalization,
    homeModel: selected.homeModel,
    awayModel: selected.awayModel,
    ...(historySeed ? { historySeed } : {}),
    metrics,
    approvalState: "SHADOW" as const,
    maturity: "DEVELOPING" as const,
  } as const;
  const parameterHash = stableHash({ homeModel: body.homeModel, awayModel: body.awayModel });
  if (Math.abs(metrics.totalBias) > Math.max(2, metrics.actualAverageTotal * .2)
    || metrics.validationBrier >= metrics.baselineBrier) {
    throw new Error("MODEL_QUALITY_GATE_FAILED");
  }
  return { ...body, parameterHash, artifactHash: stableHash({ ...body, parameterHash }) };
}

export function predictRollingScoreV4(
  artifact: RollingScoreV4Artifact,
  vector: RollingScoreVector,
): { home: number; away: number; homeProbability: number; drawProbability?: number; awayProbability: number } {
  const home = estimate(artifact.homeModel, vector, artifact.normalization);
  const away = estimate(artifact.awayModel, vector, artifact.normalization);
  const probabilities = outcomeProbabilities(artifact.sport, home, away);
  return {
    home, away,
    homeProbability: probabilities.home,
    drawProbability: probabilities.draw,
    awayProbability: probabilities.away,
  };
}

export function createRollingScoreV4Engine(
  artifact: RollingScoreV4Artifact,
): SportEngineV4<Readonly<Record<RollingScoreFeature, number>>> {
  const { artifactHash, ...artifactBody } = artifact;
  if (stableHash(artifactBody) !== artifactHash) throw new Error("ARTIFACT_HASH_MISMATCH");
  const identity = {
    sport: artifact.sport,
    modelId: artifact.modelId,
    modelVersion: artifact.modelVersion,
    artifactHash: artifact.artifactHash,
    contractId: artifact.featureContractId,
    contractHash: artifact.featureContractHash,
  };
  return {
    identity,
    approvalState: artifact.approvalState,
    maturity: artifact.maturity,
    async collectEvidence(gameId) {
      const [event] = await db.select({
        id: gamesTable.id, sport: gamesTable.sport,
        homeTeamId: gamesTable.homeTeamId, awayTeamId: gamesTable.awayTeamId,
        startsAt: gamesTable.startsAt,
      }).from(gamesTable).where(and(eq(gamesTable.id, gameId), eq(gamesTable.sport, DB_SPORT[artifact.sport]))).limit(1);
      if (!event?.startsAt || !event.homeTeamId || !event.awayTeamId) throw new Error("LIVE_EVENT_IDENTITY_INCOMPLETE");
      const history = await db.select({
        id: gamesTable.id, sport: gamesTable.sport,
        homeTeamId: gamesTable.homeTeamId, awayTeamId: gamesTable.awayTeamId,
        startsAt: gamesTable.startsAt, homeScore: gamesTable.homeScore, awayScore: gamesTable.awayScore,
      }).from(gamesTable).where(and(
        eq(gamesTable.sport, DB_SPORT[artifact.sport]),
        eq(gamesTable.status, "final"),
        isNotNull(gamesTable.startsAt),
        isNotNull(gamesTable.homeScore),
        isNotNull(gamesTable.awayScore),
        lt(gamesTable.startsAt, event.startsAt),
        ...(artifact.historySeed ? [gt(gamesTable.startsAt, new Date(artifact.historySeed.asOf))] : []),
      )).orderBy(asc(gamesTable.startsAt));
      return { event, history };
    },
    async materializeInput(raw, now) {
      const { event, history } = raw as {
        event: { id: string; sport: string; homeTeamId: string; awayTeamId: string; startsAt: Date };
        history: Array<{ id: string; sport: string; homeTeamId: string | null; awayTeamId: string | null; startsAt: Date | null; homeScore: number | null; awayScore: number | null }>;
      };
      if (now >= event.startsAt) throw new Error("EVENT_ALREADY_STARTED");
      const completed = history.flatMap((game): CompletedScoreGame[] =>
        game.homeTeamId && game.awayTeamId && game.startsAt && game.homeScore != null && game.awayScore != null
          ? [{
            gameId: game.id, sport: game.sport, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId,
            eventStart: game.startsAt.toISOString(),
            completedAt: new Date(game.startsAt.getTime() + 12 * 60 * 60 * 1000).toISOString(),
            homeScore: game.homeScore, awayScore: game.awayScore,
          }] : []);
      if (artifact.historySeed) {
        const teams = new Map<string, TeamState>(Object.entries(artifact.historySeed.teams).map(([id, value]) => [id, {
          games: value.games, scored: value.scored, allowed: value.allowed,
          lastPlayedAt: value.lastPlayedAt, evidenceTimes: [...value.evidenceTimes],
        }]));
        for (const game of completed.sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt))) {
          if (Date.parse(game.completedAt) >= event.startsAt.getTime()) continue;
          const home = teams.get(game.homeTeamId) ?? state();
          const away = teams.get(game.awayTeamId) ?? state();
          home.games++; home.scored += game.homeScore; home.allowed += game.awayScore;
          home.lastPlayedAt = Date.parse(game.eventStart); home.evidenceTimes = [...home.evidenceTimes, game.completedAt].slice(-20);
          away.games++; away.scored += game.awayScore; away.allowed += game.homeScore;
          away.lastPlayedAt = Date.parse(game.eventStart); away.evidenceTimes = [...away.evidenceTimes, game.completedAt].slice(-20);
          teams.set(game.homeTeamId, home); teams.set(game.awayTeamId, away);
        }
        const home = teams.get(event.homeTeamId) ?? state();
        const away = teams.get(event.awayTeamId) ?? state();
        const sourceEvidenceTimes = [...home.evidenceTimes, ...away.evidenceTimes].sort();
        const dataCutoff = sourceEvidenceTimes.at(-1);
        if (!dataCutoff || Date.parse(dataCutoff) >= event.startsAt.getTime()) throw new Error("LIVE_INPUT_MATERIALIZATION_FAILED");
        const input = features(home, away, event.startsAt.getTime());
        return {
          gameId: event.id, eventStart: event.startsAt.toISOString(), dataCutoff,
          predictionTimestamp: now.toISOString(), sourceEvidenceTimes,
          featureSnapshotId: `${artifact.sport}:${event.id}:${dataCutoff}`,
          featureHash: stableHash(input), input,
        };
      }
      const synthetic: CompletedScoreGame = {
        gameId: event.id, sport: artifact.sport, homeTeamId: event.homeTeamId, awayTeamId: event.awayTeamId,
        eventStart: event.startsAt.toISOString(),
        completedAt: new Date(event.startsAt.getTime() + 12 * 60 * 60 * 1000).toISOString(),
        homeScore: 0, awayScore: 0,
      };
      const vector = materializeRollingScoreTraining(artifact.sport, [...completed, synthetic]).at(-1);
      if (!vector || vector.gameId !== event.id) throw new Error("LIVE_INPUT_MATERIALIZATION_FAILED");
      const featureSnapshotId = `${artifact.sport}:${event.id}:${vector.dataCutoff}`;
      return {
        gameId: event.id,
        eventStart: event.startsAt.toISOString(),
        dataCutoff: vector.dataCutoff,
        predictionTimestamp: now.toISOString(),
        sourceEvidenceTimes: vector.sourceEvidenceTimes,
        featureSnapshotId,
        featureHash: stableHash(vector.features),
        input: vector.features,
      };
    },
    validateInput(input) {
      if (Object.keys(input.input).sort().join("|") !== [...ROLLING_SCORE_V4_FEATURES].sort().join("|")) {
        throw new Error("FEATURE_CONTRACT_MISMATCH");
      }
    },
    async predict(input) {
      const vector: RollingScoreVector = {
        gameId: input.gameId, eventStart: input.eventStart, dataCutoff: input.dataCutoff,
        sourceEvidenceTimes: input.sourceEvidenceTimes, features: input.input,
      };
      const predicted = predictRollingScoreV4(artifact, vector);
      const predictionId = createHash("sha256").update(stableHash({
        identity, gameId: input.gameId, featureHash: input.featureHash,
      })).digest("hex");
      return {
        predictionId, ...identity, gameId: input.gameId,
        featureSnapshotId: input.featureSnapshotId, featureHash: input.featureHash,
        dataCutoff: input.dataCutoff, predictionTimestamp: input.predictionTimestamp,
        approvalState: artifact.approvalState, maturity: artifact.maturity,
        homeWinProbability: predicted.homeProbability,
        ...(predicted.drawProbability === undefined ? {} : { drawProbability: predicted.drawProbability }),
        awayWinProbability: predicted.awayProbability,
        expectedHomeScore: predicted.home,
        expectedAwayScore: predicted.away,
        expectedMargin: predicted.home - predicted.away,
        expectedTotal: predicted.home + predicted.away,
        evidenceTier: "V4_CORE_ROLLING_SCORE",
        qualityFlags: artifact.validationRows < 25 ? ["LIMITED_VALIDATION_SAMPLE"] : [],
      };
    },
    validateOutput(output: CanonicalV4Forecast) {
      if (output.approvalState !== "SHADOW") throw new Error("UNEXPECTED_PUBLICATION_STATE");
    },
  };
}