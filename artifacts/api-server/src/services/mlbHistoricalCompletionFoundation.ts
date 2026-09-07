import { createHash } from "node:crypto";
import {
  MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY,
  MLB_HISTORICAL_CHRONOLOGY_RULE,
  MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
  MLB_HISTORICAL_COMPLETION_RESOLVER_VERSION,
  canPriorGameInfluenceTarget,
  type HistoricalCompletionEvidence,
  type PriorInfluenceReason,
} from "./mlbHistoricalChronology";
import {
  type HistoricalLeagueEnvironment,
  type HistoricalRollingOffense,
  type HistoricalSplit,
} from "./mlbHistoricalPitFoundation";
import { stableHistoricalJson } from "./mlbHistoricalSource";

export type CompletionEligibility = "CORE_ELIGIBLE" | "PARTIAL_CORE_CANDIDATE" | "EXCLUDED";

export interface CompletionFoundationGame {
  canonicalGameId: string;
  providerGameId: string;
  season: number;
  officialGameDate: string;
  scheduledFirstPitch: string;
  homeCanonicalTeamId: string;
  awayCanonicalTeamId: string;
  homeRuns: number;
  awayRuns: number;
  homeStarterId: string | null;
  awayStarterId: string | null;
  venueId: string | null;
  venueName: string | null;
  gameStatus: string;
  inningsPlayed: number | null;
  doubleheaderStatus: string | null;
  gameNumber: number | null;
  suspended: boolean;
  resumed: boolean;
  sourcePayloadHash: string;
  evidence: HistoricalCompletionEvidence;
}

export interface CompletionAwareFeatureRow {
  schemaVersion: typeof MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION;
  artifactKey: string;
  canonicalGameId: string;
  providerGameId: string;
  season: number;
  teamSide: "home" | "away";
  canonicalTeamId: string;
  opponentCanonicalTeamId: string;
  scheduledFirstPitch: string;
  featureCutoff: string | null;
  starterState: "ACTUAL_ONLY" | "UNAVAILABLE";
  lineupState: "UNAVAILABLE";
  completionBoundaryState: "AUTHORITATIVE" | "HIGH_CONFIDENCE_DERIVED" | "UNRESOLVED";
  eligibilityState: CompletionEligibility;
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
  sourceVersions: { schedule: "mlb-statsapi-schedule-v1"; completion: string };
  sourceHashes: {
    targetScheduleRow: string;
    targetCompletionEvidence: string;
    priorOutcomeLedger: string;
  };
  pitLineage: {
    cutoffRule: "official_first_play_start_minus_1ms";
    cutoffSource: string;
    completionRule: typeof MLB_HISTORICAL_CHRONOLOGY_RULE;
    priorGameCount: number;
    firstPriorGameId: string | null;
    lastPriorGameId: string | null;
    priorGameIdsHash: string;
    sameDayDecisionHash: string;
    sportsbookFieldsPresent: false;
  };
  quality: {
    identity: "VALID";
    chronology: "VALID" | "UNRESOLVED";
    outcomes: "VALID";
    offense: "VALID" | "SMALL_SAMPLE";
    leagueEnvironment: "VALID" | "SMALL_SAMPLE";
    enhanced: "UNAVAILABLE";
  };
  checksum: string;
}

export interface CompletionChronologyDecision {
  schemaVersion: typeof MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION;
  artifactKey: string;
  canonicalGameId: string;
  providerGameId: string;
  season: number;
  featureCutoff: string | null;
  featureCutoffSource: string;
  eligiblePriorGameCount: number;
  eligiblePriorGameIdsHash: string;
  homePriorGameCount: number;
  homePriorGameIdsHash: string;
  awayPriorGameCount: number;
  awayPriorGameIdsHash: string;
  sameDayDecisions: {
    priorGameId: string;
    reason: PriorInfluenceReason;
    eligible: boolean;
    completionTime: string | null;
  }[];
  deniedReasonCounts: Partial<Record<PriorInfluenceReason, number>>;
  decisionRule: typeof MLB_HISTORICAL_CHRONOLOGY_RULE;
  decisionHash: string;
}

export interface CompletionFoundation {
  artifactKey: string;
  games: CompletionFoundationGame[];
  rows: CompletionAwareFeatureRow[];
  decisions: CompletionChronologyDecision[];
  splits: {
    canonicalGameId: string;
    cohort: HistoricalSplit;
    assignmentRule: string;
    assignmentHash: string;
  }[];
  checksum: string;
  replayChecksum: string;
  summary: {
    totalGames: number;
    teamGameRows: number;
    authoritativeGames: number;
    derivedGames: number;
    unresolvedGames: number;
    safeTargetGames: number;
    coreEligibleGames: number;
    partialGames: number;
    enhancedEligibleGames: 0;
    sameDayRelationships: number;
    sameDayEligibleRelationships: number;
    sameDayDeniedRelationships: number;
    observedPitViolations: number;
    marketLeakageViolations: number;
    lockedOosOriginal: number;
    lockedOosSafe: number;
    lockedOosExcluded: number;
    seasons: Record<string, {
      games: number;
      authoritative: number;
      derived: number;
      unresolved: number;
      coreEligible: number;
      lockedOosSafe: number;
    }>;
  };
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableHistoricalJson(value)).digest("hex");
}

function average(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function chronologyView(game: CompletionFoundationGame) {
  return {
    canonicalGameId: game.canonicalGameId,
    providerGameId: game.providerGameId,
    finalStatus: game.evidence.finalStatus,
    quarantined: game.evidence.quarantineReason !== null,
    canonicalCompletionTime: game.evidence.canonicalCompletionTime,
    featureCutoff: game.evidence.featureCutoff,
  };
}

function involves(game: CompletionFoundationGame, teamId: string): boolean {
  return game.homeCanonicalTeamId === teamId || game.awayCanonicalTeamId === teamId;
}

function rollingTeam(
  prior: readonly CompletionFoundationGame[],
  canonicalTeamId: string,
  targetSide: "home" | "away",
): HistoricalRollingOffense {
  const observations = prior.filter((game) => involves(game, canonicalTeamId)).map((game) => {
    const home = game.homeCanonicalTeamId === canonicalTeamId;
    return {
      runs: home ? game.homeRuns : game.awayRuns,
      allowed: home ? game.awayRuns : game.homeRuns,
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
  prior: readonly CompletionFoundationGame[],
  target: CompletionFoundationGame,
): HistoricalLeagueEnvironment {
  const cutoff = target.evidence.featureCutoff
    ? new Date(target.evidence.featureCutoff).getTime()
    : Number.NEGATIVE_INFINITY;
  const inDays = (days: number) => prior.filter((game) => {
    const completion = game.evidence.canonicalCompletionTime
      ? new Date(game.evidence.canonicalCompletionTime).getTime()
      : Number.NEGATIVE_INFINITY;
    return completion >= cutoff - days * 86_400_000;
  });
  const rate = (games: readonly CompletionFoundationGame[]) => average(games.flatMap((game) =>
    [game.homeRuns, game.awayRuns]));
  return {
    priorGames: prior.length,
    runsPerTeamGame7d: rate(inDays(7)),
    runsPerTeamGame14d: rate(inDays(14)),
    runsPerTeamGame30d: rate(inDays(30)),
    seasonRunsPerTeamGame: rate(prior),
  };
}

function sameOfficialDate(left: CompletionFoundationGame, right: CompletionFoundationGame): boolean {
  return left.officialGameDate === right.officialGameDate;
}

function makeDecision(
  artifactKey: string,
  games: readonly CompletionFoundationGame[],
  target: CompletionFoundationGame,
): { decision: CompletionChronologyDecision; prior: CompletionFoundationGame[] } {
  const deniedReasonCounts: Partial<Record<PriorInfluenceReason, number>> = {};
  const prior: CompletionFoundationGame[] = [];
  const sameDayDecisions: CompletionChronologyDecision["sameDayDecisions"] = [];
  for (const candidate of games) {
    if (candidate.season !== target.season || candidate.canonicalGameId === target.canonicalGameId) continue;
    const result = canPriorGameInfluenceTarget(chronologyView(candidate), chronologyView(target));
    if (result.eligible) prior.push(candidate);
    else deniedReasonCounts[result.reason] = (deniedReasonCounts[result.reason] ?? 0) + 1;
    const sameTeam = involves(candidate, target.homeCanonicalTeamId)
      || involves(candidate, target.awayCanonicalTeamId);
    if (sameTeam && sameOfficialDate(candidate, target)) {
      sameDayDecisions.push({
        priorGameId: candidate.canonicalGameId,
        reason: result.reason,
        eligible: result.eligible,
        completionTime: candidate.evidence.canonicalCompletionTime,
      });
    }
  }
  prior.sort((left, right) =>
    left.evidence.canonicalCompletionTime!.localeCompare(right.evidence.canonicalCompletionTime!)
    || left.providerGameId.localeCompare(right.providerGameId));
  sameDayDecisions.sort((left, right) => left.priorGameId.localeCompare(right.priorGameId));
  const ids = prior.map((game) => game.canonicalGameId);
  const homeIds = prior.filter((game) => involves(game, target.homeCanonicalTeamId))
    .map((game) => game.canonicalGameId);
  const awayIds = prior.filter((game) => involves(game, target.awayCanonicalTeamId))
    .map((game) => game.canonicalGameId);
  const base = {
    schemaVersion: MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION as typeof MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
    artifactKey,
    canonicalGameId: target.canonicalGameId,
    providerGameId: target.providerGameId,
    season: target.season,
    featureCutoff: target.evidence.featureCutoff,
    featureCutoffSource: target.evidence.featureCutoffSource,
    eligiblePriorGameCount: ids.length,
    eligiblePriorGameIdsHash: hash(ids),
    homePriorGameCount: homeIds.length,
    homePriorGameIdsHash: hash(homeIds),
    awayPriorGameCount: awayIds.length,
    awayPriorGameIdsHash: hash(awayIds),
    sameDayDecisions,
    deniedReasonCounts,
    decisionRule: MLB_HISTORICAL_CHRONOLOGY_RULE as typeof MLB_HISTORICAL_CHRONOLOGY_RULE,
  };
  return {
    prior,
    decision: { ...base, decisionHash: hash(base) },
  };
}

function makeTeamRow(
  artifactKey: string,
  target: CompletionFoundationGame,
  side: "home" | "away",
  prior: readonly CompletionFoundationGame[],
  decision: CompletionChronologyDecision,
  originalCandidateIds: ReadonlySet<string>,
): CompletionAwareFeatureRow {
  const isHome = side === "home";
  const canonicalTeamId = isHome ? target.homeCanonicalTeamId : target.awayCanonicalTeamId;
  const opponentCanonicalTeamId = isHome ? target.awayCanonicalTeamId : target.homeCanonicalTeamId;
  const team = rollingTeam(prior, canonicalTeamId, side);
  const opponent = rollingTeam(prior, opponentCanonicalTeamId, isHome ? "away" : "home");
  const league = leagueEnvironment(prior, target);
  const chronologySafe = target.evidence.featureCutoff !== null
    && target.evidence.canonicalCompletionTime !== null
    && target.evidence.quarantineReason === null;
  const sampleEligible = team.priorGames >= 5 && opponent.priorGames >= 5 && league.priorGames >= 30;
  const eligibilityState: CompletionEligibility = chronologySafe
    && sampleEligible
    && originalCandidateIds.has(target.canonicalGameId)
    ? "CORE_ELIGIBLE"
    : originalCandidateIds.has(target.canonicalGameId) ? "PARTIAL_CORE_CANDIDATE" : "EXCLUDED";
  const priorIds = prior.map((game) => game.canonicalGameId);
  const featureCutoff = target.evidence.featureCutoff;
  const priorOutcomeLedger = prior.map((game) => [
    game.canonicalGameId,
    game.homeRuns,
    game.awayRuns,
    game.evidence.canonicalCompletionTime,
    game.evidence.evidenceHash,
  ]);
  const base = {
    schemaVersion: MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION as typeof MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
    artifactKey,
    canonicalGameId: target.canonicalGameId,
    providerGameId: target.providerGameId,
    season: target.season,
    teamSide: side,
    canonicalTeamId,
    opponentCanonicalTeamId,
    scheduledFirstPitch: target.scheduledFirstPitch,
    featureCutoff,
    starterState: (isHome ? target.homeStarterId : target.awayStarterId)
      ? "ACTUAL_ONLY" as const
      : "UNAVAILABLE" as const,
    lineupState: "UNAVAILABLE" as const,
    completionBoundaryState: target.evidence.completionTimeConfidence === "AUTHORITATIVE"
      ? "AUTHORITATIVE" as const
      : target.evidence.completionTimeConfidence === "HIGH_CONFIDENCE_DERIVED"
        ? "HIGH_CONFIDENCE_DERIVED" as const
        : "UNRESOLVED" as const,
    eligibilityState,
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
    sourceVersions: {
      schedule: "mlb-statsapi-schedule-v1" as const,
      completion: MLB_HISTORICAL_COMPLETION_RESOLVER_VERSION,
    },
    sourceHashes: {
      targetScheduleRow: target.sourcePayloadHash,
      targetCompletionEvidence: target.evidence.evidenceHash,
      priorOutcomeLedger: hash(priorOutcomeLedger),
    },
    pitLineage: {
      cutoffRule: "official_first_play_start_minus_1ms" as const,
      cutoffSource: target.evidence.featureCutoffSource,
      completionRule: MLB_HISTORICAL_CHRONOLOGY_RULE as typeof MLB_HISTORICAL_CHRONOLOGY_RULE,
      priorGameCount: priorIds.length,
      firstPriorGameId: priorIds[0] ?? null,
      lastPriorGameId: priorIds.at(-1) ?? null,
      priorGameIdsHash: hash(priorIds),
      sameDayDecisionHash: hash(decision.sameDayDecisions),
      sportsbookFieldsPresent: false as const,
    },
    quality: {
      identity: "VALID" as const,
      chronology: chronologySafe ? "VALID" as const : "UNRESOLVED" as const,
      outcomes: "VALID" as const,
      offense: team.priorGames >= 5 && opponent.priorGames >= 5
        ? "VALID" as const
        : "SMALL_SAMPLE" as const,
      leagueEnvironment: league.priorGames >= 30 ? "VALID" as const : "SMALL_SAMPLE" as const,
      enhanced: "UNAVAILABLE" as const,
    },
  };
  return { ...base, checksum: hash(base) };
}

export function buildMlbHistoricalCompletionFoundation(
  sourceGames: readonly CompletionFoundationGame[],
  originalSplits: ReadonlyMap<string, HistoricalSplit>,
  options: { artifactKey?: string } = {},
): CompletionFoundation {
  const artifactKey = options.artifactKey ?? MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY;
  const games = [...sourceGames].sort((left, right) =>
    (left.evidence.featureCutoff ?? left.scheduledFirstPitch)
      .localeCompare(right.evidence.featureCutoff ?? right.scheduledFirstPitch)
    || left.providerGameId.localeCompare(right.providerGameId));
  const originalCandidateIds = new Set(originalSplits.keys());
  const decisions: CompletionChronologyDecision[] = [];
  const rows: CompletionAwareFeatureRow[] = [];
  for (const target of games) {
    const { decision, prior } = makeDecision(artifactKey, games, target);
    decisions.push(decision);
    rows.push(
      makeTeamRow(artifactKey, target, "away", prior, decision, originalCandidateIds),
      makeTeamRow(artifactKey, target, "home", prior, decision, originalCandidateIds),
    );
  }
  const gameCore = new Map<string, boolean>();
  for (const row of rows) {
    gameCore.set(
      row.canonicalGameId,
      (gameCore.get(row.canonicalGameId) ?? true) && row.eligibilityState === "CORE_ELIGIBLE",
    );
  }
  const assignmentRule = "preserve v1 cohort assignment; admit only chronology-safe original candidates";
  const splits = games
    .filter((game) => gameCore.get(game.canonicalGameId) && originalSplits.has(game.canonicalGameId))
    .map((game) => {
      const cohort = originalSplits.get(game.canonicalGameId)!;
      return {
        canonicalGameId: game.canonicalGameId,
        cohort,
        assignmentRule,
        assignmentHash: hash([
          MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION,
          game.canonicalGameId,
          cohort,
          assignmentRule,
        ]),
      };
    });
  const deterministicRows = rows.map((row) => [row.canonicalGameId, row.teamSide, row.checksum]);
  const deterministicDecisions = decisions.map((decision) => [
    decision.canonicalGameId,
    decision.decisionHash,
  ]);
  const sameDay = decisions.flatMap((decision) => decision.sameDayDecisions);
  const lockedOosOriginal = [...originalSplits.values()].filter((cohort) => cohort === "LOCKED_OOS").length;
  const lockedOosSafe = splits.filter((split) => split.cohort === "LOCKED_OOS").length;
  const seasons: CompletionFoundation["summary"]["seasons"] = {};
  for (const season of [...new Set(games.map((game) => game.season))].sort()) {
    const seasonGames = games.filter((game) => game.season === season);
    seasons[String(season)] = {
      games: seasonGames.length,
      authoritative: seasonGames.filter((game) =>
        game.evidence.completionTimeConfidence === "AUTHORITATIVE").length,
      derived: seasonGames.filter((game) =>
        game.evidence.completionTimeConfidence === "HIGH_CONFIDENCE_DERIVED").length,
      unresolved: seasonGames.filter((game) =>
        game.evidence.canonicalCompletionTime === null || game.evidence.featureCutoff === null).length,
      coreEligible: seasonGames.filter((game) => gameCore.get(game.canonicalGameId)).length,
      lockedOosSafe: splits.filter((split) =>
        split.cohort === "LOCKED_OOS"
        && seasonGames.some((game) => game.canonicalGameId === split.canonicalGameId)).length,
    };
  }
  const checksum = hash({
    artifactKey,
    deterministicRows,
    deterministicDecisions,
    splits,
  });
  return {
    artifactKey,
    games,
    rows,
    decisions,
    splits,
    checksum,
    replayChecksum: hash([deterministicRows, deterministicDecisions]),
    summary: {
      totalGames: games.length,
      teamGameRows: rows.length,
      authoritativeGames: games.filter((game) =>
        game.evidence.completionTimeConfidence === "AUTHORITATIVE").length,
      derivedGames: games.filter((game) =>
        game.evidence.completionTimeConfidence === "HIGH_CONFIDENCE_DERIVED").length,
      unresolvedGames: games.filter((game) =>
        game.evidence.canonicalCompletionTime === null || game.evidence.featureCutoff === null).length,
      safeTargetGames: games.filter((game) =>
        game.evidence.canonicalCompletionTime !== null
        && game.evidence.featureCutoff !== null
        && game.evidence.quarantineReason === null).length,
      coreEligibleGames: [...gameCore.values()].filter(Boolean).length,
      partialGames: rows.filter((row) => row.teamSide === "home"
        && row.eligibilityState === "PARTIAL_CORE_CANDIDATE").length,
      enhancedEligibleGames: 0,
      sameDayRelationships: sameDay.length,
      sameDayEligibleRelationships: sameDay.filter((decision) => decision.eligible).length,
      sameDayDeniedRelationships: sameDay.filter((decision) => !decision.eligible).length,
      observedPitViolations: rows.filter((row) => {
        const target = games.find((game) => game.canonicalGameId === row.canonicalGameId)!;
        const decision = decisions.find((entry) => entry.canonicalGameId === row.canonicalGameId)!;
        return decision.eligiblePriorGameCount > 0 && target.evidence.featureCutoff === null;
      }).length,
      marketLeakageViolations: rows.filter((row) =>
        stableHistoricalJson(row.coreFeatures).toLowerCase().includes("odds")).length,
      lockedOosOriginal,
      lockedOosSafe,
      lockedOosExcluded: lockedOosOriginal - lockedOosSafe,
      seasons,
    },
  };
}