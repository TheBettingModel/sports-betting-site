import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  modelPredictionsTable,
  modelVersionsTable,
} from "@workspace/db";
import type { FetchedGame } from "./espn";
import type { BullpenMatchup, BullpenStatus } from "./mlbBullpen";
import type { MlbDecisionEvidence } from "./mlbDecisionEvidence";
import type { LineupMatchup, LineupStatus } from "./mlbLineups";
import type { PitcherStats, ProbableStarters } from "./mlbPitchers";
import type { DbTeamStats } from "./teamStats";
import type { VenueWeather } from "./weatherService";
import { createModelVersion, transitionModelStatus } from "./modelRegistry";
import { hasValidMoneylineMarketForSport, isPregameCommenceTime } from "./oddsApi";
import { removeVig2 } from "./model";
import { logger } from "../lib/logger";
import { assignMlbCohort, captureMlbDecisionMarket, captureMlbFeatureRevision, captureMlbPregameComponents, evidenceHash, freezeMlbFinalPregame, linkMlbV4Forecast, persistLeagueRunEnvironment } from "./mlbPointInTime";

export const MLB_V4_MODEL_ID = "tbm-mlb-moneyline-v4";
export const MLB_V4_FEATURE_SCHEMA_VERSION = "mlb-v4-features-v1";
export const MLB_V4_DATASET_INPUT_VERSION = "mlb-v4-pit-input-v1";
export const MLB_V4_COHORT = "shadow";
export const MLB_V4_CALIBRATION_VERSION = "mlb-v4-calibration-unfitted-v1";
export const MLB_V4_RUN_DISTRIBUTION_VERSION = "independent-poisson-v1";

const LEAGUE_AVG_RUNS = 4.5;
const LEAGUE_AVG_OPS = 0.72;
const TEAM_OFFENSE_PRIOR_GAMES = 20;
const HOME_FIELD_RUNS = 0.12;
const MAX_POISSON_RUNS = 20;

export type MlbV4QualityState =
  | "VALID"
  | "PARTIAL"
  | "STALE"
  | "MISSING"
  | "NOT_APPLICABLE"
  | "INVALID";

export interface MlbV4MarketInput {
  homeOdds?: number;
  awayOdds?: number;
  pinnacleHomeOdds?: number;
  pinnacleAwayOdds?: number;
  consensusHomeOdds?: number;
  consensusAwayOdds?: number;
  lineMovedTowardHome?: boolean;
}

export interface MlbV4Input {
  homeDbStats?: DbTeamStats;
  awayDbStats?: DbTeamStats;
  starters: ProbableStarters;
  lineups: LineupMatchup | null;
  bullpen: BullpenMatchup | null;
  parkFactor?: number;
  weather: VenueWeather | null;
  weatherTotalAdjustment: number;
  evidence: MlbDecisionEvidence;
  market: MlbV4MarketInput;
}

export interface MlbV4Contribution {
  state: MlbV4QualityState;
  awayRuns: number;
  homeRuns: number;
  /**
   * Counterfactual marginal impact on home win probability. This is computed
   * by removing only this module's run contribution and rerunning the same
   * distribution; interactions mean marginals are explanatory, not additive.
   */
  homeProbabilityPoints: number;
  details: Record<string, unknown>;
}

export interface MlbV4Forecast {
  model: {
    modelId: typeof MLB_V4_MODEL_ID;
    featureSchemaVersion: typeof MLB_V4_FEATURE_SCHEMA_VERSION;
    datasetInputVersion: typeof MLB_V4_DATASET_INPUT_VERSION;
    cohort: typeof MLB_V4_COHORT;
    shadowOnly: true;
  };
  pointInTimeCutoff: string;
  createdAt: string;
  expectedRuns: {
    away: number;
    home: number;
    rawAway: number;
    rawHome: number;
  };
  probability: {
    rawHome: number;
    rawAway: number;
    calibratedHome: number;
    calibratedAway: number;
    calibrationModelVersion: typeof MLB_V4_CALIBRATION_VERSION;
    calibrationStatus: "UNFITTED_IDENTITY";
    trainingWindow: null;
    validationWindow: null;
    sampleSize: 0;
  };
  uncertainty: {
    homeProbabilityPoints: number;
    sources: Record<string, number>;
  };
  dataQuality: {
    score: number;
    featureCompleteness: number;
    overallState: MlbV4QualityState;
    starterQualityState: MlbV4QualityState;
    lineupQualityState: MlbV4QualityState;
    bullpenQualityState: MlbV4QualityState;
    components: Record<string, {
      state: MlbV4QualityState;
      weight: number;
      score: number;
      reasons: string[];
    }>;
  };
  contributions: Record<string, MlbV4Contribution>;
  featureStates: {
    pitcher: Record<string, MlbV4QualityState>;
    lineup: Record<string, MlbV4QualityState>;
    matchup: Record<string, MlbV4QualityState>;
    bullpen: Record<string, MlbV4QualityState>;
    defense: Record<string, MlbV4QualityState>;
    baserunning: Record<string, MlbV4QualityState>;
  };
  distribution: {
    method: typeof MLB_V4_RUN_DISTRIBUTION_VERSION;
    maximumEnumeratedRuns: number;
    tieMassSplit: "50_50";
    regulationTieProbability: number;
  };
  market: {
    status: MlbV4QualityState;
    homeOdds: number | null;
    awayOdds: number | null;
    noVigHome: number | null;
    noVigAway: number | null;
    homeEdgePoints: number | null;
    selectedSide: "home" | "away";
    selectedProbability: number;
    selectedOdds: number | null;
    selectedEdgePoints: number | null;
    expectedValuePercent: number | null;
  };
  researchPolicy: {
    recommendation: "Strong Buy" | "Buy" | "Neutral";
    betQualityScore: number;
    officialUnits: 0;
    publicationStatus: "SHADOW_NOT_OFFICIAL";
    futureStrongBuyEligible: boolean;
    blockers: string[];
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, places = 4): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function qualityScore(state: MlbV4QualityState): number {
  switch (state) {
    case "VALID":
    case "NOT_APPLICABLE":
      return 1;
    case "PARTIAL":
      return 0.65;
    case "STALE":
      return 0.4;
    case "MISSING":
    case "INVALID":
      return 0;
  }
}

function sourceState(
  evidence: MlbDecisionEvidence,
  key: string,
  available: boolean,
): MlbV4QualityState {
  const signal = evidence.signals[key];
  if (!available) return "MISSING";
  if (!signal) return "PARTIAL";
  if (signal.cacheAgeMs != null && signal.qualityReasons.some((reason) => reason.includes("stale"))) {
    return "STALE";
  }
  return signal.available ? "VALID" : "PARTIAL";
}

function starterCompleteness(starter: PitcherStats | null): number {
  if (!starter) return 0;
  const values = [
    starter.seasonEra,
    starter.seasonWhip,
    starter.fip,
    starter.kPct,
    starter.bbPct,
    starter.kMinusBbPct,
    starter.recentEra,
    starter.recentIpAvg,
    starter.seasonIp,
    starter.seasonBattersFaced,
    starter.recentPitchCountAvg,
    starter.recentStartCount,
  ];
  return values.filter(finite).length / values.length;
}

function lineupState(lineup: LineupStatus | undefined): MlbV4QualityState {
  if (!lineup) return "MISSING";
  if (lineup.confirmed && lineup.batterCount >= 9 && finite(lineup.lineupOps)) return "VALID";
  if (lineup.batterCount > 0 || finite(lineup.lineupOps)) return "PARTIAL";
  return "MISSING";
}

function bullpenState(bullpen: BullpenStatus | null | undefined): MlbV4QualityState {
  if (!bullpen) return "MISSING";
  return finite(bullpen.weightedPitches) && finite(bullpen.gamesLast3Days)
    ? "VALID"
    : "INVALID";
}

function shrinkRate(value: number, sampleSize: number): number {
  const sample = clamp(sampleSize, 0, 20);
  return (value * sample + LEAGUE_AVG_RUNS * TEAM_OFFENSE_PRIOR_GAMES)
    / (sample + TEAM_OFFENSE_PRIOR_GAMES);
}

function starterRunEstimate(starter: PitcherStats | null): {
  rate: number;
  innings: number;
  reliability: number;
  state: MlbV4QualityState;
} {
  if (!starter) {
    return {
      rate: LEAGUE_AVG_RUNS,
      innings: 5.25,
      reliability: 0,
      state: "MISSING",
    };
  }
  const rate = starter.fip * 0.5 + starter.seasonEra * 0.25 + starter.recentEra * 0.25;
  const innings = clamp(starter.recentIpAvg, 3, 7.2);
  const inningsReliability = clamp(starter.seasonIp / 60, 0, 1);
  const battersReliability = clamp(starter.seasonBattersFaced / 250, 0, 1);
  const recentReliability = clamp(starter.recentStartCount / 3, 0, 1);
  const reliability = (inningsReliability + battersReliability + recentReliability) / 3;
  return {
    rate,
    innings,
    reliability,
    state: reliability >= 0.75 ? "VALID" : "PARTIAL",
  };
}

function selectedLineupOps(
  lineup: LineupStatus | undefined,
  opposingHand: "L" | "R" | null | undefined,
): {
  overall: number | null;
  platoon: number | null;
  bvp: number | null;
} {
  if (!lineup?.confirmed || lineup.batterCount < 9 || !finite(lineup.lineupOps)) {
    return { overall: null, platoon: null, bvp: null };
  }
  const platoon = opposingHand === "L"
    ? lineup.platoonOpsVsL
    : opposingHand === "R"
      ? lineup.platoonOpsVsR
      : undefined;
  return {
    overall: lineup.lineupOps,
    platoon: finite(platoon) ? platoon : null,
    bvp: finite(lineup.careerOpsVsPitcher) ? lineup.careerOpsVsPitcher : null,
  };
}

function opsRunShift(ops: number | null, reference: number): number {
  if (!finite(ops) || ops <= 0) return 0;
  return clamp(LEAGUE_AVG_RUNS * (Math.sqrt(ops / reference) - 1), -0.75, 0.75);
}

function poissonPmf(lambda: number): number[] {
  const values = new Array<number>(MAX_POISSON_RUNS + 1).fill(0);
  values[0] = Math.exp(-lambda);
  for (let runs = 1; runs <= MAX_POISSON_RUNS; runs++) {
    values[runs] = values[runs - 1]! * lambda / runs;
  }
  const mass = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => value / mass);
}

export function computeMlbV4OutcomeDistribution(
  awayExpectedRuns: number,
  homeExpectedRuns: number,
): {
  homeWinProbability: number;
  awayWinProbability: number;
  regulationTieProbability: number;
} {
  const away = poissonPmf(clamp(awayExpectedRuns, 0.1, 12));
  const home = poissonPmf(clamp(homeExpectedRuns, 0.1, 12));
  let homeWin = 0;
  let awayWin = 0;
  let tie = 0;
  for (let awayRuns = 0; awayRuns <= MAX_POISSON_RUNS; awayRuns++) {
    for (let homeRuns = 0; homeRuns <= MAX_POISSON_RUNS; homeRuns++) {
      const mass = away[awayRuns]! * home[homeRuns]!;
      if (homeRuns > awayRuns) homeWin += mass;
      else if (awayRuns > homeRuns) awayWin += mass;
      else tie += mass;
    }
  }
  return {
    homeWinProbability: homeWin + tie * 0.5,
    awayWinProbability: awayWin + tie * 0.5,
    regulationTieProbability: tie,
  };
}

function buildDataQuality(input: MlbV4Input) {
  const homeStarterCompleteness = starterCompleteness(input.starters.home);
  const awayStarterCompleteness = starterCompleteness(input.starters.away);
  const starterState = sourceState(
    input.evidence,
    "starters",
    Boolean(input.starters.home && input.starters.away),
  );
  const homeLineupState = lineupState(input.lineups?.home);
  const awayLineupState = lineupState(input.lineups?.away);
  const combinedLineupState: MlbV4QualityState =
    homeLineupState === "VALID" && awayLineupState === "VALID"
      ? "VALID"
      : homeLineupState === "MISSING" && awayLineupState === "MISSING"
        ? "MISSING"
        : "PARTIAL";
  const homeBullpenState = bullpenState(input.bullpen?.home);
  const awayBullpenState = bullpenState(input.bullpen?.away);
  const combinedBullpenState: MlbV4QualityState =
    homeBullpenState === "VALID" && awayBullpenState === "VALID"
      ? "VALID"
      : homeBullpenState === "MISSING" && awayBullpenState === "MISSING"
        ? "MISSING"
        : "PARTIAL";
  const marketValid = hasValidMoneylineMarketForSport("MLB", {
    homeOdds: input.market.homeOdds,
    awayOdds: input.market.awayOdds,
  });
  const teamStatsState: MlbV4QualityState =
    input.homeDbStats && input.awayDbStats
      ? Math.min(input.homeDbStats.sampleSize, input.awayDbStats.sampleSize) >= 8
        ? "VALID"
        : "PARTIAL"
      : "MISSING";
  const weatherState: MlbV4QualityState = input.weather
    ? sourceState(input.evidence, "weather", true)
    : "MISSING";
  const components = {
    starterConfirmation: {
      state: starterState,
      weight: 20,
      reasons: input.starters.qualityReasons ?? [],
    },
    starterFeatureCompleteness: {
      state: Math.min(homeStarterCompleteness, awayStarterCompleteness) >= 1
        ? "VALID" as const
        : Math.max(homeStarterCompleteness, awayStarterCompleteness) > 0
          ? "PARTIAL" as const
          : "MISSING" as const,
      weight: 15,
      reasons: [],
    },
    lineupConfirmation: {
      state: combinedLineupState,
      weight: 15,
      reasons: combinedLineupState === "VALID" ? [] : ["one_or_both_lineups_not_confirmed"],
    },
    lineupCompleteness: {
      state: combinedLineupState,
      weight: 10,
      reasons: combinedLineupState === "VALID" ? [] : ["individual_hitter_metrics_not_available"],
    },
    bullpenCompleteness: {
      state: combinedBullpenState,
      weight: 10,
      reasons: combinedBullpenState === "VALID" ? ["fatigue_only_quality_not_supported"] : ["bullpen_usage_missing"],
    },
    marketFreshness: {
      state: marketValid ? sourceState(input.evidence, "market", true) : "MISSING" as const,
      weight: 10,
      reasons: marketValid ? [] : ["missing_or_invalid_two_way_moneyline"],
    },
    teamStatSample: {
      state: teamStatsState,
      weight: 10,
      reasons: teamStatsState === "VALID" ? [] : ["minimum_eight_game_team_sample_not_met"],
    },
    providerFreshness: {
      state: input.evidence.qualityReasons.some((reason) => reason.includes("stale"))
        ? "STALE" as const
        : "VALID" as const,
      weight: 4,
      reasons: input.evidence.qualityReasons.filter((reason) => reason.includes("stale")),
    },
    parkAvailability: {
      state: finite(input.parkFactor) ? "VALID" as const : "MISSING" as const,
      weight: 3,
      reasons: finite(input.parkFactor) ? [] : ["park_factor_missing"],
    },
    weatherAvailability: {
      state: weatherState,
      weight: 3,
      reasons: weatherState === "VALID" ? [] : ["weather_missing_or_stale"],
    },
  };
  const scoredComponents = Object.fromEntries(
    Object.entries(components).map(([key, component]) => [
      key,
      {
        ...component,
        score: round(component.weight * qualityScore(component.state), 2),
      },
    ]),
  );
  const score = round(
    Object.values(scoredComponents).reduce((sum, component) => sum + component.score, 0),
    1,
  );
  const currentFeatureStates = [
    starterState,
    combinedLineupState,
    combinedBullpenState,
    teamStatsState,
    weatherState,
    finite(input.parkFactor) ? "VALID" : "MISSING",
  ] as MlbV4QualityState[];
  const featureCompleteness = round(
    currentFeatureStates.reduce((sum, state) => sum + qualityScore(state), 0)
      / currentFeatureStates.length * 100,
    1,
  );
  return {
    score,
    featureCompleteness,
    overallState: score >= 90 ? "VALID" as const : score >= 65 ? "PARTIAL" as const : "MISSING" as const,
    starterQualityState: starterState,
    lineupQualityState: combinedLineupState,
    bullpenQualityState: combinedBullpenState,
    components: scoredComponents,
  };
}

function contribution(
  state: MlbV4QualityState,
  awayRuns: number,
  homeRuns: number,
  details: Record<string, unknown>,
): MlbV4Contribution {
  return {
    state,
    awayRuns: round(awayRuns),
    homeRuns: round(homeRuns),
    homeProbabilityPoints: 0,
    details,
  };
}

export function computeMlbV4Forecast(
  game: FetchedGame,
  input: MlbV4Input,
  createdAt = new Date(),
): MlbV4Forecast {
  if (game.sport !== "MLB") throw new Error("MLB V4 accepts MLB games only");

  const quality = buildDataQuality(input);
  const awayOffense = input.awayDbStats
    ? shrinkRate(input.awayDbStats.scoredPerGame, input.awayDbStats.sampleSize)
    : LEAGUE_AVG_RUNS;
  const homeOffense = input.homeDbStats
    ? shrinkRate(input.homeDbStats.scoredPerGame, input.homeDbStats.sampleSize)
    : LEAGUE_AVG_RUNS;
  const awayStarter = starterRunEstimate(input.starters.away);
  const homeStarter = starterRunEstimate(input.starters.home);
  const awayLineupOps = selectedLineupOps(input.lineups?.away, input.starters.home?.pitchHand);
  const homeLineupOps = selectedLineupOps(input.lineups?.home, input.starters.away?.pitchHand);

  const awayTeamOffenseRuns = awayOffense - LEAGUE_AVG_RUNS;
  const homeTeamOffenseRuns = homeOffense - LEAGUE_AVG_RUNS;
  const awayStarterRuns = (homeStarter.rate - LEAGUE_AVG_RUNS) * homeStarter.innings / 9;
  const homeStarterRuns = (awayStarter.rate - LEAGUE_AVG_RUNS) * awayStarter.innings / 9;
  const awayBullpenFatigueRuns = input.bullpen?.home
    ? clamp(input.bullpen.home.weightedPitches / 400, 0, 0.6)
    : 0;
  const homeBullpenFatigueRuns = input.bullpen?.away
    ? clamp(input.bullpen.away.weightedPitches / 400, 0, 0.6)
    : 0;
  const awayLineupRuns = opsRunShift(awayLineupOps.overall, LEAGUE_AVG_OPS);
  const homeLineupRuns = opsRunShift(homeLineupOps.overall, LEAGUE_AVG_OPS);
  const awayPlatoonRuns = awayLineupOps.platoon == null || awayLineupOps.overall == null
    ? 0
    : clamp(opsRunShift(awayLineupOps.platoon, awayLineupOps.overall), -0.4, 0.4);
  const homePlatoonRuns = homeLineupOps.platoon == null || homeLineupOps.overall == null
    ? 0
    : clamp(opsRunShift(homeLineupOps.platoon, homeLineupOps.overall), -0.4, 0.4);
  const awayBvpRuns = awayLineupOps.bvp == null
    ? 0
    : clamp(opsRunShift(awayLineupOps.bvp, awayLineupOps.platoon ?? awayLineupOps.overall ?? LEAGUE_AVG_OPS) * 0.1, -0.15, 0.15);
  const homeBvpRuns = homeLineupOps.bvp == null
    ? 0
    : clamp(opsRunShift(homeLineupOps.bvp, homeLineupOps.platoon ?? homeLineupOps.overall ?? LEAGUE_AVG_OPS) * 0.1, -0.15, 0.15);

  const preParkAway =
    LEAGUE_AVG_RUNS
    + awayTeamOffenseRuns
    + awayStarterRuns
    + awayBullpenFatigueRuns
    + awayPlatoonRuns
    + awayBvpRuns;
  const preParkHome =
    LEAGUE_AVG_RUNS
    + homeTeamOffenseRuns
    + homeStarterRuns
    + homeBullpenFatigueRuns
    + homePlatoonRuns
    + homeBvpRuns
    + HOME_FIELD_RUNS;
  const parkMultiplier = finite(input.parkFactor) ? input.parkFactor / 100 : 1;
  const awayParkRuns = preParkAway * (parkMultiplier - 1);
  const homeParkRuns = preParkHome * (parkMultiplier - 1);
  const awayWeatherRuns = input.weather?.isDome ? 0 : input.weatherTotalAdjustment / 2;
  const homeWeatherRuns = input.weather?.isDome ? 0 : input.weatherTotalAdjustment / 2;
  const rawAway = preParkAway + awayParkRuns + awayWeatherRuns;
  const rawHome = preParkHome + homeParkRuns + homeWeatherRuns;
  const expectedAway = clamp(rawAway, 1.25, 9);
  const expectedHome = clamp(rawHome, 1.25, 9);
  const awayBoundRuns = expectedAway - rawAway;
  const homeBoundRuns = expectedHome - rawHome;

  const distribution = computeMlbV4OutcomeDistribution(expectedAway, expectedHome);
  const rawHomeProbability = distribution.homeWinProbability;
  // V4 starts with identity calibration until a chronological MLB-only
  // calibrator has enough out-of-sample evidence to be registered.
  const calibratedHomeProbability = rawHomeProbability;

  const uncertaintySources = {
    baseline: 2.5,
    starter: input.starters.home && input.starters.away
      ? round((2 - homeStarter.reliability - awayStarter.reliability) * 1.5, 2)
      : 6,
    lineup: quality.lineupQualityState === "VALID" ? 0 : quality.lineupQualityState === "PARTIAL" ? 1.5 : 3,
    bullpen: quality.bullpenQualityState === "VALID" ? 0.5 : 2,
    teamSample: input.homeDbStats && input.awayDbStats ? 0 : 3,
    providerFreshness: quality.components.providerFreshness?.state === "STALE" ? 1 : 0,
    unsupportedPlayerMetrics: 1,
  };
  const uncertainty = round(clamp(
    Object.values(uncertaintySources).reduce((sum, value) => sum + value, 0),
    2.5,
    15,
  ), 1);

  const marketValid = hasValidMoneylineMarketForSport("MLB", {
    homeOdds: input.market.homeOdds,
    awayOdds: input.market.awayOdds,
  });
  const fair = marketValid
    ? removeVig2(input.market.homeOdds!, input.market.awayOdds!)
    : null;
  const homeEdgePoints = fair
    ? (calibratedHomeProbability - fair.home) * 100
    : null;
  const selectedSide: "home" | "away" = homeEdgePoints == null
    ? calibratedHomeProbability >= 0.5 ? "home" : "away"
    : homeEdgePoints >= 0 ? "home" : "away";
  const selectedProbability = selectedSide === "home"
    ? calibratedHomeProbability
    : 1 - calibratedHomeProbability;
  const selectedOdds = marketValid
    ? selectedSide === "home" ? input.market.homeOdds! : input.market.awayOdds!
    : null;
  const selectedEdgePoints = homeEdgePoints == null
    ? null
    : Math.abs(homeEdgePoints);
  const decimalOdds = selectedOdds == null
    ? null
    : selectedOdds > 0 ? selectedOdds / 100 + 1 : 100 / Math.abs(selectedOdds) + 1;
  const expectedValuePercent = decimalOdds == null
    ? null
    : (selectedProbability * decimalOdds - 1) * 100;

  const blockers = [
    !marketValid ? "credible_market_missing" : null,
    quality.starterQualityState !== "VALID" ? "starter_evidence_not_valid" : null,
    quality.lineupQualityState !== "VALID" ? "both_lineups_not_confirmed" : null,
    quality.score < 90 ? "data_quality_below_future_strong_buy_threshold" : null,
    uncertainty > 4 ? "uncertainty_above_future_strong_buy_threshold" : null,
  ].filter((value): value is string => value != null);
  const uncertaintyAdjustedEdge = selectedEdgePoints == null
    ? Number.NEGATIVE_INFINITY
    : selectedEdgePoints - uncertainty;
  const futureStrongBuyEligible =
    blockers.length === 0
    && uncertaintyAdjustedEdge >= 7
    && (expectedValuePercent ?? Number.NEGATIVE_INFINITY) > 0;
  const recommendation: "Strong Buy" | "Buy" | "Neutral" = futureStrongBuyEligible
    ? "Strong Buy"
    : marketValid
      && quality.score >= 70
      && uncertaintyAdjustedEdge >= 4
      && (expectedValuePercent ?? Number.NEGATIVE_INFINITY) > 0
        ? "Buy"
        : "Neutral";
  const betQualityScore = round(clamp(
    50
    + Math.max(0, selectedEdgePoints ?? 0) * 2
    + Math.max(0, expectedValuePercent ?? 0) * 0.15
    - uncertainty
    + (quality.score - 75) * 0.2,
    0,
    100,
  ), 1);

  const lineupFeatureState = quality.lineupQualityState;
  const contributionTree: Record<string, MlbV4Contribution> = {
    baseTeamStrength: contribution("VALID", 0, 0, {
      role: "validation_context_only",
      rationale: "record_pythagorean_and_run_differential_not_added_independently_to_avoid_double_counting",
      awayPythagoreanWinPct: input.awayDbStats?.pythagoreanWinPct ?? null,
      homePythagoreanWinPct: input.homeDbStats?.pythagoreanWinPct ?? null,
    }),
    leagueRunEnvironment: contribution("VALID", LEAGUE_AVG_RUNS, LEAGUE_AVG_RUNS, {
      leagueAverageRunsPerTeam: LEAGUE_AVG_RUNS,
    }),
    teamOffense: contribution(
      input.homeDbStats && input.awayDbStats ? "VALID" : "MISSING",
      awayTeamOffenseRuns,
      homeTeamOffenseRuns,
      {
        method: "bayesian_shrinkage_to_league_average",
        priorGames: TEAM_OFFENSE_PRIOR_GAMES,
        awaySample: input.awayDbStats?.sampleSize ?? 0,
        homeSample: input.homeDbStats?.sampleSize ?? 0,
      },
    ),
    startingPitcher: contribution(
      quality.starterQualityState,
      awayStarterRuns,
      homeStarterRuns,
      {
        awayBattingFaces: input.starters.home ?? null,
        homeBattingFaces: input.starters.away ?? null,
        awayStarterEstimate: homeStarter,
        homeStarterEstimate: awayStarter,
        rateBlend: { fip: 0.5, seasonEra: 0.25, recentEra: 0.25 },
      },
    ),
    lineup: contribution(lineupFeatureState, 0, 0, {
      leagueAverageOps: LEAGUE_AVG_OPS,
      away: awayLineupOps,
      home: homeLineupOps,
      role: "observed_lineup_quality_only",
      rationale: "overall_lineup_OPS_is_not_added_on_top_of_team_scoring_to_avoid_double_counting",
    }),
    platoonMatchup: contribution(
      lineupFeatureState === "VALID" && awayLineupOps.platoon != null && homeLineupOps.platoon != null
        ? "VALID"
        : lineupFeatureState === "VALID" ? "PARTIAL" : lineupFeatureState,
      awayPlatoonRuns,
      homePlatoonRuns,
      {
        awayOpposingStarterHand: input.starters.home?.pitchHand ?? null,
        homeOpposingStarterHand: input.starters.away?.pitchHand ?? null,
      },
    ),
    batterVsPitcher: contribution(
      awayLineupOps.bvp != null || homeLineupOps.bvp != null ? "PARTIAL" : "MISSING",
      awayBvpRuns,
      homeBvpRuns,
      { shrinkageWeight: 0.1, role: "supplementary_only" },
    ),
    pitchTypeMatchup: contribution("NOT_APPLICABLE", 0, 0, {
      reason: "provider_does_not_currently_supply_pitch_usage_and_hitter_pitch_type_performance",
    }),
    bullpenQuality: contribution("NOT_APPLICABLE", 0, 0, {
      reason: "individual_reliever_quality_not_supported_by_current_point_in_time_feed",
    }),
    bullpenAvailabilityFatigue: contribution(
      quality.bullpenQualityState,
      awayBullpenFatigueRuns,
      homeBullpenFatigueRuns,
      {
        awayBattingFaces: input.bullpen?.home ?? null,
        homeBattingFaces: input.bullpen?.away ?? null,
        provisionalFatigueScale: "weighted_pitches_divided_by_400_capped_at_0.6_runs",
      },
    ),
    defense: contribution("NOT_APPLICABLE", 0, 0, {
      reason: "independent_OAA_DRS_or_fielding_runs_not_supported",
    }),
    baserunning: contribution("NOT_APPLICABLE", 0, 0, {
      reason: "baserunning_runs_not_supported",
    }),
    park: contribution(
      finite(input.parkFactor) ? "VALID" : "MISSING",
      awayParkRuns,
      homeParkRuns,
      { parkFactor: input.parkFactor ?? null, method: "run_environment_multiplier" },
    ),
    weather: contribution(
      input.weather ? sourceState(input.evidence, "weather", true) : "MISSING",
      awayWeatherRuns,
      homeWeatherRuns,
      {
        weather: input.weather,
        totalAdjustment: input.weatherTotalAdjustment,
        splitAcrossTeams: true,
      },
    ),
    homeField: contribution("VALID", 0, HOME_FIELD_RUNS, {
      provisionalHomeRunAdvantage: HOME_FIELD_RUNS,
    }),
    rest: contribution(
      input.homeDbStats && input.awayDbStats ? "VALID" : "MISSING",
      0,
      0,
      {
        awayRestDays: input.awayDbStats?.restDays ?? null,
        homeRestDays: input.homeDbStats?.restDays ?? null,
        role: "recorded_but_zero_until_run_effect_is_validated",
      },
    ),
    travel: contribution("NOT_APPLICABLE", 0, 0, { reason: "travel_feed_not_supported" }),
    injuryPlayerAvailability: contribution("NOT_APPLICABLE", 0, 0, {
      reason: "MLB_injury_impact_feed_not_supported",
    }),
    calibration: contribution("NOT_APPLICABLE", 0, 0, {
      status: "UNFITTED_IDENTITY",
      modelVersion: MLB_V4_CALIBRATION_VERSION,
      rawHomeProbability,
      calibratedHomeProbability,
    }),
    dataQualityUncertainty: contribution(quality.overallState, 0, 0, {
      probabilityNotShifted: true,
      uncertaintyPoints: uncertainty,
      dataQualityScore: quality.score,
    }),
    runBounds: contribution(
      awayBoundRuns !== 0 || homeBoundRuns !== 0 ? "PARTIAL" : "NOT_APPLICABLE",
      awayBoundRuns,
      homeBoundRuns,
      { minimum: 1.25, maximum: 9 },
    ),
  };
  for (const [key, factor] of Object.entries(contributionTree)) {
    if (
      key === "leagueRunEnvironment"
      || key === "calibration"
      || key === "dataQualityUncertainty"
    ) {
      continue;
    }
    const withoutFactor = computeMlbV4OutcomeDistribution(
      clamp(expectedAway - factor.awayRuns, 0.1, 12),
      clamp(expectedHome - factor.homeRuns, 0.1, 12),
    );
    factor.homeProbabilityPoints = round(
      (rawHomeProbability - withoutFactor.homeWinProbability) * 100,
      3,
    );
    factor.details = {
      ...factor.details,
      probabilityAttributionMethod: "single_factor_counterfactual_marginal",
      probabilityAttributionIsAdditive: false,
    };
  }

  return {
    model: {
      modelId: MLB_V4_MODEL_ID,
      featureSchemaVersion: MLB_V4_FEATURE_SCHEMA_VERSION,
      datasetInputVersion: MLB_V4_DATASET_INPUT_VERSION,
      cohort: MLB_V4_COHORT,
      shadowOnly: true,
    },
    pointInTimeCutoff: game.commenceTimeISO,
    createdAt: createdAt.toISOString(),
    expectedRuns: {
      away: round(expectedAway, 3),
      home: round(expectedHome, 3),
      rawAway: round(rawAway, 3),
      rawHome: round(rawHome, 3),
    },
    probability: {
      rawHome: round(rawHomeProbability, 6),
      rawAway: round(1 - rawHomeProbability, 6),
      calibratedHome: round(calibratedHomeProbability, 6),
      calibratedAway: round(1 - calibratedHomeProbability, 6),
      calibrationModelVersion: MLB_V4_CALIBRATION_VERSION,
      calibrationStatus: "UNFITTED_IDENTITY",
      trainingWindow: null,
      validationWindow: null,
      sampleSize: 0,
    },
    uncertainty: {
      homeProbabilityPoints: uncertainty,
      sources: uncertaintySources,
    },
    dataQuality: quality,
    contributions: contributionTree,
    featureStates: {
      pitcher: {
        fip: input.starters.home && input.starters.away ? "VALID" : "MISSING",
        era: input.starters.home && input.starters.away ? "VALID" : "MISSING",
        xFip: "NOT_APPLICABLE",
        xEra: "NOT_APPLICABLE",
        siera: "NOT_APPLICABLE",
        whip: input.starters.home && input.starters.away ? "VALID" : "MISSING",
        strikeoutRate: input.starters.home && input.starters.away ? "VALID" : "MISSING",
        walkRate: input.starters.home && input.starters.away ? "VALID" : "MISSING",
        kMinusBbRate: input.starters.home && input.starters.away ? "VALID" : "MISSING",
        groundBallRate: "NOT_APPLICABLE",
        flyBallRate: "NOT_APPLICABLE",
        hardHitRate: "NOT_APPLICABLE",
        barrelRate: "NOT_APPLICABLE",
        exitVelocity: "NOT_APPLICABLE",
        whiffRate: "NOT_APPLICABLE",
        cswRate: "NOT_APPLICABLE",
        velocity: "NOT_APPLICABLE",
        pitchRepertoire: "NOT_APPLICABLE",
        pitchUsage: "NOT_APPLICABLE",
        movement: "NOT_APPLICABLE",
        handedness: input.starters.home?.pitchHand && input.starters.away?.pitchHand ? "VALID" : "PARTIAL",
        workload: input.starters.home && input.starters.away ? "VALID" : "MISSING",
      },
      lineup: {
        battingOrder: lineupFeatureState,
        lineupOps: lineupFeatureState,
        platoonOps: awayLineupOps.platoon != null && homeLineupOps.platoon != null ? "VALID" : "MISSING",
        individualWoba: "NOT_APPLICABLE",
        individualXwoba: "NOT_APPLICABLE",
        individualWrcPlus: "NOT_APPLICABLE",
        individualOpsPlus: "NOT_APPLICABLE",
        individualHardHit: "NOT_APPLICABLE",
        individualBarrel: "NOT_APPLICABLE",
        recentRegressedPerformance: "NOT_APPLICABLE",
      },
      matchup: {
        pitcherHandednessVsPlatoon: lineupFeatureState,
        pitchUsageVsPitchType: "NOT_APPLICABLE",
        pitcherKVsLineupK: "NOT_APPLICABLE",
        pitcherBbVsLineupBb: "NOT_APPLICABLE",
        groundBallVsLaunchProfile: "NOT_APPLICABLE",
        powerSuppressionVsPower: "NOT_APPLICABLE",
        timesThroughOrder: "PARTIAL",
      },
      bullpen: {
        availabilityFatigue: quality.bullpenQualityState,
        individualRelieverQuality: "NOT_APPLICABLE",
        fip: "NOT_APPLICABLE",
        xFip: "NOT_APPLICABLE",
        siera: "NOT_APPLICABLE",
        xEra: "NOT_APPLICABLE",
        kMinusBbRate: "NOT_APPLICABLE",
        platoonSplits: "NOT_APPLICABLE",
      },
      defense: {
        outsAboveAverage: "NOT_APPLICABLE",
        defensiveRunsSaved: "NOT_APPLICABLE",
        fieldingRuns: "NOT_APPLICABLE",
        catcherFraming: "NOT_APPLICABLE",
      },
      baserunning: {
        stolenBaseValue: "NOT_APPLICABLE",
        baserunningRuns: "NOT_APPLICABLE",
      },
    },
    distribution: {
      method: MLB_V4_RUN_DISTRIBUTION_VERSION,
      maximumEnumeratedRuns: MAX_POISSON_RUNS,
      tieMassSplit: "50_50",
      regulationTieProbability: round(distribution.regulationTieProbability, 6),
    },
    market: {
      status: marketValid ? "VALID" : "MISSING",
      homeOdds: marketValid ? input.market.homeOdds! : null,
      awayOdds: marketValid ? input.market.awayOdds! : null,
      noVigHome: fair ? round(fair.home, 6) : null,
      noVigAway: fair ? round(fair.away, 6) : null,
      homeEdgePoints: homeEdgePoints == null ? null : round(homeEdgePoints, 2),
      selectedSide,
      selectedProbability: round(selectedProbability, 6),
      selectedOdds,
      selectedEdgePoints: selectedEdgePoints == null ? null : round(selectedEdgePoints, 2),
      expectedValuePercent: expectedValuePercent == null ? null : round(expectedValuePercent, 2),
    },
    researchPolicy: {
      recommendation,
      betQualityScore,
      officialUnits: 0,
      publicationStatus: "SHADOW_NOT_OFFICIAL",
      futureStrongBuyEligible,
      blockers,
    },
  };
}

export async function ensureMlbV4ChallengerVersion(): Promise<number> {
  let [version] = await db
    .select()
    .from(modelVersionsTable)
    .where(eq(modelVersionsTable.modelId, MLB_V4_MODEL_ID))
    .limit(1);

  if (!version) {
    version = await createModelVersion({
      modelId: MLB_V4_MODEL_ID,
      sport: "MLB",
      market: "moneyline",
      notes: "Shadow-only MLB run-expectancy challenger; never eligible for direct publication",
      artifactLocation: "artifacts/api-server/src/services/mlbV4Challenger.ts",
      featureVersions: {
        mlbV4FeatureSchema: 1,
        pitcher: 1,
        lineup: 1,
        matchup: 1,
        bullpen: 1,
        runExpectancy: 1,
        distribution: 1,
        calibration: 1,
        uncertainty: 1,
        dataQuality: 1,
      },
      hyperparameters: {
        featureSchemaVersion: MLB_V4_FEATURE_SCHEMA_VERSION,
        datasetInputVersion: MLB_V4_DATASET_INPUT_VERSION,
        distributionVersion: MLB_V4_RUN_DISTRIBUTION_VERSION,
        calibrationVersion: MLB_V4_CALIBRATION_VERSION,
        shadowOnly: true,
        officialUnits: 0,
      },
    });
  }

  if (version.status === "development") {
    version = await transitionModelStatus(version.id, {
      newStatus: "challenger",
      performedBy: "system",
      notes: "Enabled immutable MLB V4 live shadow forecasts only",
    });
  }

  if (!version || version.status !== "challenger") {
    throw new Error(
      `MLB V4 shadow pipeline requires registry status "challenger"; found "${version?.status ?? "missing"}"`,
    );
  }

  return version.id;
}

export async function writeMlbV4ShadowPrediction(
  game: FetchedGame,
  input: MlbV4Input,
  capturedAt = new Date(),
): Promise<number | null> {
  if (
    game.sport !== "MLB"
    || game.status !== "upcoming"
    || !isPregameCommenceTime(game.commenceTimeISO)
  ) {
    return null;
  }

  const modelVersionId = await ensureMlbV4ChallengerVersion();
  const inputFingerprint = createHash("sha256")
    .update(JSON.stringify({
      gameId: game.espnId,
      startsAt: game.commenceTimeISO,
      homeDbStats: input.homeDbStats,
      awayDbStats: input.awayDbStats,
      starters: input.starters,
      lineups: input.lineups,
      bullpen: input.bullpen,
      parkFactor: input.parkFactor,
      weather: input.weather,
      weatherTotalAdjustment: input.weatherTotalAdjustment,
      market: input.market,
      evidenceStates: Object.fromEntries(
        Object.entries(input.evidence.signals).map(([key, value]) => [
          key,
          {
            sourceCapturedAt: value.capturedAt,
            available: value.available,
            qualityReasons: value.qualityReasons,
          },
        ]),
      ),
    }))
    .digest("hex");
  const [latest] = await db
    .select({
      id: modelPredictionsTable.id,
      featureSnapshot: modelPredictionsTable.featureSnapshot,
    })
    .from(modelPredictionsTable)
    .where(and(
      eq(modelPredictionsTable.gameId, game.espnId),
      eq(modelPredictionsTable.modelVersionId, modelVersionId),
      eq(modelPredictionsTable.market, "moneyline"),
    ))
    .orderBy(desc(modelPredictionsTable.predictionTimestamp))
    .limit(1);
  const latestSnapshot = latest?.featureSnapshot as Record<string, unknown> | null | undefined;
  if (
    latestSnapshot?.modelId === MLB_V4_MODEL_ID
    && latestSnapshot.inputFingerprint === inputFingerprint
  ) {
    return null;
  }

  const forecast = computeMlbV4Forecast(game, input, capturedAt);
  const selection = forecast.market.selectedSide;
  const selectedProbability = forecast.market.selectedProbability;
  const selectedFairProbability = selection === "home"
    ? forecast.market.noVigHome
    : forecast.market.noVigAway;
  const selectedImpliedProbability = forecast.market.selectedOdds == null
    ? null
    : forecast.market.selectedOdds > 0
      ? 100 / (forecast.market.selectedOdds + 100)
      : Math.abs(forecast.market.selectedOdds) / (Math.abs(forecast.market.selectedOdds) + 100);

  const featureSnapshot = {
    schemaVersion: 5,
    featureSchemaVersion: MLB_V4_FEATURE_SCHEMA_VERSION,
    datasetInputVersion: MLB_V4_DATASET_INPUT_VERSION,
    modelId: MLB_V4_MODEL_ID,
    modelVersion: modelVersionId,
    cohort: MLB_V4_COHORT,
    createdAt: capturedAt.toISOString(),
    pointInTimeCutoff: game.commenceTimeISO,
    gameId: game.espnId,
    gameDate: game.gameDate,
    gameStartsAt: game.commenceTimeISO,
    sport: "MLB",
    market: "moneyline",
    awayTeamAbbr: game.awayTeamAbbr,
    homeTeamAbbr: game.homeTeamAbbr,
    shadowOnly: true,
    inputFingerprint,
    observationRole: "append_only_pregame_revision",
    forecast,
  };

  const [inserted] = await db
    .insert(modelPredictionsTable)
    .values({
      gameId: game.espnId,
      modelVersionId,
      sport: "MLB",
      market: "moneyline",
      selection,
      odds: forecast.market.selectedOdds,
      modelProbability: selectedProbability,
      impliedProbability: selectedImpliedProbability,
      fairProbability: selectedFairProbability,
      edge: forecast.market.homeEdgePoints ?? 0,
      confidence: forecast.uncertainty.homeProbabilityPoints <= 4
        ? "High"
        : forecast.uncertainty.homeProbabilityPoints <= 7
          ? "Medium"
          : "Low",
      recommendation: forecast.researchPolicy.recommendation,
      units: 0,
      podScore: 0,
      finalRating: forecast.researchPolicy.betQualityScore,
      marketIntelligenceGrade: "SHADOW",
      sharpSignals: {
        researchOnly: true,
        pinnacleHomeOdds: input.market.pinnacleHomeOdds ?? null,
        pinnacleAwayOdds: input.market.pinnacleAwayOdds ?? null,
        consensusHomeOdds: input.market.consensusHomeOdds ?? null,
        consensusAwayOdds: input.market.consensusAwayOdds ?? null,
        lineMovedTowardHome: input.market.lineMovedTowardHome ?? null,
      },
      featureSnapshot,
      predictionTimestamp: capturedAt,
      dataCutoffTimestamp: capturedAt,
      isChallenger: true,
      cohort: MLB_V4_COHORT,
    })
    .onConflictDoNothing()
    .returning({ id: modelPredictionsTable.id });

  if (inserted) {
    // This is an additive research ledger only. A failure to retain auxiliary
    // evidence must never affect the shadow forecast or any production flow.
    try {
      const featureId = await captureMlbFeatureRevision({
        gameId: game.espnId,
        gameStart: new Date(game.commenceTimeISO),
        cutoff: capturedAt,
        revisionKey: inputFingerprint,
        revisionState: "UPDATED",
        features: {
          homeDbStats: input.homeDbStats ?? null, awayDbStats: input.awayDbStats ?? null,
          starters: input.starters, lineups: input.lineups, bullpen: input.bullpen,
          parkFactor: input.parkFactor ?? null, weather: input.weather ?? null,
          weatherTotalAdjustment: input.weatherTotalAdjustment, market: input.market,
        },
        quality: forecast.dataQuality as unknown as Record<string, unknown>,
        completenessPct: forecast.dataQuality.featureCompleteness,
        rawPayloadHashes: {},
      });
      if (featureId != null) {
        let linkedFeatureId = featureId;
        await assignMlbCohort(game.espnId, "LIVE_SHADOW", "first live PIT V4 capture; legacy games are intentionally not reclassified");
        await captureMlbPregameComponents({
          featureSnapshotId: featureId, gameId: game.espnId, cutoff: capturedAt,
          starters: input.starters as unknown as Record<string, any>,
          bullpen: input.bullpen as unknown as Record<string, any> | null,
          lineups: input.lineups as unknown as Record<string, any> | null,
          forecast: forecast as unknown as Record<string, any>,
        });
        await captureMlbDecisionMarket({ gameId: game.espnId, cutoff: capturedAt, homeOdds: input.market.homeOdds, awayOdds: input.market.awayOdds });
        // The final scheduler refresh in the final 45 minutes freezes precisely
        // one evidence row. A later refresh cannot replace it.
        if (new Date(game.commenceTimeISO).getTime() - capturedAt.getTime() <= 45 * 60_000) {
          const finalId = await freezeMlbFinalPregame({
            gameId: game.espnId, gameStart: new Date(game.commenceTimeISO), cutoff: capturedAt,
            revisionKey: inputFingerprint, features: { starters: input.starters, lineups: input.lineups, bullpen: input.bullpen, market: input.market },
            quality: forecast.dataQuality as unknown as Record<string, unknown>,
            completenessPct: forecast.dataQuality.featureCompleteness, rawPayloadHashes: {},
          });
          if (finalId != null) {
            linkedFeatureId = finalId;
            await captureMlbPregameComponents({
              featureSnapshotId: finalId, gameId: game.espnId, cutoff: capturedAt,
              starters: input.starters as unknown as Record<string, any>,
              bullpen: input.bullpen as unknown as Record<string, any> | null,
              lineups: input.lineups as unknown as Record<string, any> | null,
              forecast: forecast as unknown as Record<string, any>,
            });
          }
        }
        await persistLeagueRunEnvironment(game.espnId, Number(game.gameDate.slice(0, 4)), capturedAt);
        await linkMlbV4Forecast({
          predictionId: inserted.id, gameId: game.espnId, featureSnapshotId: linkedFeatureId,
          cutoff: capturedAt, modelVersion: String(modelVersionId),
          configHash: evidenceHash({
            featureSchema: MLB_V4_FEATURE_SCHEMA_VERSION, dataset: MLB_V4_DATASET_INPUT_VERSION,
            calibration: MLB_V4_CALIBRATION_VERSION,
          }),
          forecast: forecast as unknown as Record<string, unknown>,
          contributions: forecast.contributions as unknown as Record<string, unknown>,
          dataQuality: forecast.dataQuality.score,
          uncertainty: forecast.uncertainty.homeProbabilityPoints,
        });
      }
    } catch (err) {
      logger.error({ err, gameId: game.espnId }, "MLB PIT evidence capture failed (nonfatal)");
    }
    logger.info(
      {
        predictionId: inserted.id,
        gameId: game.espnId,
        modelId: MLB_V4_MODEL_ID,
        awayExpectedRuns: forecast.expectedRuns.away,
        homeExpectedRuns: forecast.expectedRuns.home,
        homeProbability: forecast.probability.calibratedHome,
        dataQuality: forecast.dataQuality.score,
        uncertaintyPoints: forecast.uncertainty.homeProbabilityPoints,
        publicationStatus: forecast.researchPolicy.publicationStatus,
      },
      "MLB V4 shadow prediction stored",
    );
  }
  return inserted?.id ?? null;
}

export function resetMlbV4RegistryCacheForTests(): void {
  // Retained for test compatibility. Registry status is deliberately read on
  // every write so a lifecycle change cannot be hidden behind process cache.
}