import { createHash } from "node:crypto";
import {
  resolveHistoricalMlbIdentities,
  type CanonicalHistoricalGame,
} from "./mlbHistoricalIdentity";
import {
  MLB_HISTORICAL_SOURCE_VERSION,
  stableHistoricalJson,
  type HistoricalGameSourceRow,
} from "./mlbHistoricalSource";

export const MLB_HISTORICAL_FEATURE_SCHEMA = "mlb-chronological-team-game-v1";

export type HistoricalEligibility = "PARTIAL_CORE_CANDIDATE" | "ENHANCED_ELIGIBLE" | "EXCLUDED";
export type HistoricalSplit = "TRAIN" | "VALIDATION" | "LOCKED_OOS";

export interface HistoricalTeamGameFeatureRow {
  schemaVersion: typeof MLB_HISTORICAL_FEATURE_SCHEMA;
  artifactKey: string;
  canonicalGameId: string;
  providerGameId: string;
  season: number;
  teamSide: "home" | "away";
  canonicalTeamId: string;
  opponentCanonicalTeamId: string;
  scheduledFirstPitch: string;
  featureCutoff: string;
  starterState: HistoricalGameSourceRow["starterState"]["home"];
  lineupState: "UNAVAILABLE";
  completionBoundaryState: "PROVIDER_COMPLETION_TIME" | "NORMAL_GAME_PROXY";
  eligibilityState: HistoricalEligibility;
  coreFeatures: {
    isHome: boolean;
    team: HistoricalRollingOffense;
    opponent: HistoricalRollingOffense;
    league: HistoricalLeagueEnvironment;
  };
  enhancedFeatures: Record<string, never>;
  missingness: {
    pregameStarter: true;
    pregameLineup: true;
    historicalWeatherForecast: true;
    bullpenOutcomes: true;
    advancedMetrics: true;
    marketDataExcluded: true;
  };
  sourceVersions: { schedule: typeof MLB_HISTORICAL_SOURCE_VERSION };
  sourceHashes: { targetScheduleRow: string; priorOutcomeLedger: string };
  pitLineage: {
    cutoffRule: "completed_prior_official_dates_only";
    priorGameCount: number;
    firstPriorGameId: string | null;
    lastPriorGameId: string | null;
    priorGameIdsHash: string;
    excludedSameDayGames: true;
    sportsbookFieldsPresent: false;
  };
  quality: {
    identity: "VALID";
    chronology: "VALID" | "RECONSTRUCTABLE_PROXY";
    outcomes: "VALID";
    offense: "VALID" | "SMALL_SAMPLE";
    leagueEnvironment: "VALID" | "SMALL_SAMPLE";
    enhanced: "UNAVAILABLE";
  };
  checksum: string;
}

export interface HistoricalRollingOffense {
  priorGames: number;
  seasonGames: number;
  runsPerGame5: number | null;
  runsPerGame10: number | null;
  runsPerGame20: number | null;
  runsPerGame30: number | null;
  seasonRunsPerGame: number | null;
  seasonRunsAllowedPerGame: number | null;
  homeAwayRunsPerGame: number | null;
}

export interface HistoricalLeagueEnvironment {
  priorGames: number;
  runsPerTeamGame7d: number | null;
  runsPerTeamGame14d: number | null;
  runsPerTeamGame30d: number | null;
  seasonRunsPerTeamGame: number | null;
}

export interface HistoricalFoundation {
  artifactKey: string;
  games: CanonicalHistoricalGame[];
  rows: HistoricalTeamGameFeatureRow[];
  exclusions: { providerGameId: string; reasons: string[] }[];
  splits: { canonicalGameId: string; cohort: HistoricalSplit; assignmentRule: string; assignmentHash: string }[];
  checksum: string;
  replayChecksum: string;
  summary: {
    seasons: Record<string, {
      recoveredGames: number;
      coreEligibleGames: number;
      coreCandidateGames: number;
      enhancedEligibleGames: number;
      excludedGames: number;
    }>;
    totalGames: number;
    teamGameRows: number;
    coreEligibleGames: number;
    coreCandidateGames: number;
    enhancedEligibleGames: number;
    excludedGames: number;
    duplicateSourceRows: number;
    observedPitViolations: number;
    unverifiedCompletionBoundaryRows: number;
    marketLeakageViolations: number;
  };
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableHistoricalJson(value)).digest("hex");
}

function officialDate(game: CanonicalHistoricalGame): string {
  return game.source.gameDate.slice(0, 10);
}

function priorGamesForTarget(
  games: readonly CanonicalHistoricalGame[],
  target: CanonicalHistoricalGame,
): CanonicalHistoricalGame[] {
  const targetDate = officialDate(target);
  return games.filter((game) =>
    game.source.season === target.source.season
    && game.outcomeEligible
    && game.source.chronologyState !== "AMBIGUOUS"
    && !game.source.suspended
    && !game.source.resumed
    && officialDate(game) < targetDate);
}

function average(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function rollingTeam(
  prior: readonly CanonicalHistoricalGame[],
  canonicalTeamId: string,
  targetSide: "home" | "away",
): HistoricalRollingOffense {
  const teamGames = prior.filter((game) =>
    game.homeCanonicalTeamId === canonicalTeamId || game.awayCanonicalTeamId === canonicalTeamId);
  const observations = teamGames.map((game) => {
    const home = game.homeCanonicalTeamId === canonicalTeamId;
    return {
      runs: home ? game.source.homeRuns! : game.source.awayRuns!,
      allowed: home ? game.source.awayRuns! : game.source.homeRuns!,
      side: home ? "home" : "away",
    };
  });
  const tailAverage = (count: number) => average(observations.slice(-count).map((row) => row.runs));
  const split = observations.filter((row) => row.side === targetSide);
  return {
    priorGames: observations.length,
    seasonGames: observations.length,
    runsPerGame5: tailAverage(5),
    runsPerGame10: tailAverage(10),
    runsPerGame20: tailAverage(20),
    runsPerGame30: tailAverage(30),
    seasonRunsPerGame: average(observations.map((row) => row.runs)),
    seasonRunsAllowedPerGame: average(observations.map((row) => row.allowed)),
    homeAwayRunsPerGame: average(split.map((row) => row.runs)),
  };
}

function leagueEnvironment(
  prior: readonly CanonicalHistoricalGame[],
  target: CanonicalHistoricalGame,
): HistoricalLeagueEnvironment {
  const targetTime = new Date(`${officialDate(target)}T00:00:00Z`).getTime();
  const inDays = (days: number) => prior.filter((game) => {
    const time = new Date(`${officialDate(game)}T00:00:00Z`).getTime();
    return time >= targetTime - days * 86_400_000;
  });
  const rate = (games: readonly CanonicalHistoricalGame[]) => average(games.flatMap((game) =>
    [game.source.homeRuns!, game.source.awayRuns!]));
  return {
    priorGames: prior.length,
    runsPerTeamGame7d: rate(inDays(7)),
    runsPerTeamGame14d: rate(inDays(14)),
    runsPerTeamGame30d: rate(inDays(30)),
    seasonRunsPerTeamGame: rate(prior),
  };
}

function makeTeamRow(
  artifactKey: string,
  game: CanonicalHistoricalGame,
  side: "home" | "away",
  prior: readonly CanonicalHistoricalGame[],
): HistoricalTeamGameFeatureRow {
  const isHome = side === "home";
  const canonicalTeamId = isHome ? game.homeCanonicalTeamId : game.awayCanonicalTeamId;
  const opponentCanonicalTeamId = isHome ? game.awayCanonicalTeamId : game.homeCanonicalTeamId;
  const team = rollingTeam(prior, canonicalTeamId, side);
  const opponent = rollingTeam(prior, opponentCanonicalTeamId, isHome ? "away" : "home");
  const league = leagueEnvironment(prior, game);
  const eligible = team.priorGames >= 5 && opponent.priorGames >= 5 && league.priorGames >= 30;
  const featureCutoff = new Date(new Date(game.source.scheduledFirstPitch).getTime() - 1).toISOString();
  const includedPriorGameIds = prior.map((row) => row.canonicalGameId);
  const base = {
    schemaVersion: MLB_HISTORICAL_FEATURE_SCHEMA as typeof MLB_HISTORICAL_FEATURE_SCHEMA,
    artifactKey,
    canonicalGameId: game.canonicalGameId,
    providerGameId: game.source.providerGameId,
    season: game.source.season,
    teamSide: side,
    canonicalTeamId,
    opponentCanonicalTeamId,
    scheduledFirstPitch: game.source.scheduledFirstPitch,
    featureCutoff,
    starterState: game.source.starterState[side],
    lineupState: "UNAVAILABLE" as const,
    completionBoundaryState: game.source.chronologyState === "PROVIDER_COMPLETION_TIME"
      ? "PROVIDER_COMPLETION_TIME" as const
      : "NORMAL_GAME_PROXY" as const,
    eligibilityState: (eligible ? "PARTIAL_CORE_CANDIDATE" : "EXCLUDED") as HistoricalEligibility,
    coreFeatures: { isHome, team, opponent, league },
    enhancedFeatures: {},
    missingness: {
      pregameStarter: true as const,
      pregameLineup: true as const,
      historicalWeatherForecast: true as const,
      bullpenOutcomes: true as const,
      advancedMetrics: true as const,
      marketDataExcluded: true as const,
    },
    sourceVersions: { schedule: MLB_HISTORICAL_SOURCE_VERSION as typeof MLB_HISTORICAL_SOURCE_VERSION },
    sourceHashes: {
      targetScheduleRow: game.source.payloadHash,
      priorOutcomeLedger: hash(includedPriorGameIds.map((id) => {
        const priorGame = prior.find((candidate) => candidate.canonicalGameId === id)!;
        return [id, priorGame.source.homeRuns, priorGame.source.awayRuns];
      })),
    },
    pitLineage: {
      cutoffRule: "completed_prior_official_dates_only" as const,
      priorGameCount: includedPriorGameIds.length,
      firstPriorGameId: includedPriorGameIds[0] ?? null,
      lastPriorGameId: includedPriorGameIds.at(-1) ?? null,
      priorGameIdsHash: hash(includedPriorGameIds),
      excludedSameDayGames: true as const,
      sportsbookFieldsPresent: false as const,
    },
    quality: {
      identity: "VALID" as const,
      chronology: (game.source.chronologyState === "PROVIDER_COMPLETION_TIME"
        ? "VALID"
        : "RECONSTRUCTABLE_PROXY") as "VALID" | "RECONSTRUCTABLE_PROXY",
      outcomes: "VALID" as const,
      offense: (team.priorGames >= 5 && opponent.priorGames >= 5 ? "VALID" : "SMALL_SAMPLE") as "VALID" | "SMALL_SAMPLE",
      leagueEnvironment: (league.priorGames >= 30 ? "VALID" : "SMALL_SAMPLE") as "VALID" | "SMALL_SAMPLE",
      enhanced: "UNAVAILABLE" as const,
    },
  };
  return { ...base, checksum: hash(base) };
}

export function buildMlbHistoricalPitFoundation(
  sourceRows: readonly HistoricalGameSourceRow[],
  options: { artifactKey?: string } = {},
): HistoricalFoundation {
  const artifactKey = options.artifactKey ?? "mlb-historical-2023-2026-v1";
  const identity = resolveHistoricalMlbIdentities(sourceRows);
  const games = [...identity.admitted].sort((a, b) =>
    a.source.scheduledFirstPitch.localeCompare(b.source.scheduledFirstPitch)
    || a.source.providerGameId.localeCompare(b.source.providerGameId));
  const rows = games.flatMap((game) => {
    const prior = priorGamesForTarget(games, game);
    return [
      makeTeamRow(artifactKey, game, "away", prior),
      makeTeamRow(artifactKey, game, "home", prior),
    ];
  });
  const gameEligible = new Map<string, boolean>();
  for (const row of rows) {
    gameEligible.set(row.canonicalGameId,
      (gameEligible.get(row.canonicalGameId) ?? true)
      && row.eligibilityState === "PARTIAL_CORE_CANDIDATE");
  }
  const splits = games.filter((game) => gameEligible.get(game.canonicalGameId)).map((game) => {
    const cohort: HistoricalSplit = game.source.season <= 2024
      ? "TRAIN"
      : game.source.season === 2025 ? "VALIDATION" : "LOCKED_OOS";
    const assignmentRule = "season<=2024 TRAIN; season=2025 VALIDATION; season>=2026 LOCKED_OOS";
    return {
      canonicalGameId: game.canonicalGameId,
      cohort,
      assignmentRule,
      assignmentHash: hash([MLB_HISTORICAL_FEATURE_SCHEMA, game.canonicalGameId, cohort, assignmentRule]),
    };
  });
  const seasons: HistoricalFoundation["summary"]["seasons"] = {};
  const admittedProviderIds = new Set(games.map((game) => game.source.providerGameId));
  for (const season of [...new Set(sourceRows.map((row) => row.season))].sort()) {
    const recovered = games.filter((game) => game.source.season === season);
    const core = recovered.filter((game) => gameEligible.get(game.canonicalGameId)).length;
    const uniqueSourceIds = new Set(sourceRows.filter((row) => row.season === season).map((row) => row.providerGameId));
    seasons[String(season)] = {
      recoveredGames: recovered.length,
      coreEligibleGames: 0,
      coreCandidateGames: core,
      enhancedEligibleGames: 0,
      excludedGames: [...uniqueSourceIds].filter((id) => !admittedProviderIds.has(id)).length,
    };
  }
  const excludedProviderIds = new Set(
    identity.quarantined
      .map((row) => row.providerGameId)
      .filter((providerGameId) => !admittedProviderIds.has(providerGameId)),
  );
  const deterministicRows = rows.map((row) => [row.canonicalGameId, row.teamSide, row.checksum]);
  const checksum = hash({ artifactKey, deterministicRows, exclusions: identity.quarantined, splits });
  return {
    artifactKey,
    games,
    rows,
    exclusions: identity.quarantined,
    splits,
    checksum,
    replayChecksum: hash(deterministicRows),
    summary: {
      seasons,
      totalGames: games.length,
      teamGameRows: rows.length,
      coreEligibleGames: 0,
      coreCandidateGames: [...gameEligible.values()].filter(Boolean).length,
      enhancedEligibleGames: 0,
      excludedGames: excludedProviderIds.size,
      duplicateSourceRows: identity.duplicateSourceRows,
      observedPitViolations: 0,
      unverifiedCompletionBoundaryRows: rows.filter((row) =>
        row.completionBoundaryState === "NORMAL_GAME_PROXY").length,
      marketLeakageViolations: 0,
    },
  };
}