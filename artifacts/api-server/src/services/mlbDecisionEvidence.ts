import type { FetchedGame } from "./espn";
import type { ComputeOptions } from "./model";
import { hasValidMoneylineMarketForSport, isPregameCommenceTime } from "./oddsApi";
import type { MlbSignalCacheMeta } from "./mlbPitchers";

export interface MlbSignalProvenance {
  source: string;
  capturedAt: string;
  cutoffTimestamp: string;
  cacheAgeMs: number | null;
  available: boolean;
  qualityReasons: string[];
}

export interface MlbDecisionEvidence {
  schemaVersion: "mlb-full-game-evidence-v1";
  capturedAt: string;
  cutoffTimestamp: string;
  recommendationBlocked: boolean;
  confidenceMultiplier: number;
  missingSignals: string[];
  qualityReasons: string[];
  signals: Record<string, MlbSignalProvenance>;
}

type Availability = Record<string, unknown>;

function sourceAge(availability: Availability, key: string): number | null {
  const metadata = availability[`${key}Meta`] as Partial<MlbSignalCacheMeta> | undefined;
  const value = metadata?.cacheAgeMs ?? availability[`${key}CacheAgeMs`];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function sourceCapturedAt(availability: Availability, key: string, fallback: string): string {
  const metadata = availability[`${key}Meta`] as Partial<MlbSignalCacheMeta> | undefined;
  return typeof metadata?.sourceCapturedAt === "string" ? metadata.sourceCapturedAt : fallback;
}

function sourceIsStale(availability: Availability, key: string): boolean {
  const metadata = availability[`${key}Meta`] as Partial<MlbSignalCacheMeta> | undefined;
  return metadata?.stale === true;
}

function signal(
  availability: Availability,
  key: string,
  source: string,
  capturedAt: string,
  cutoffTimestamp: string,
  available: boolean,
  qualityReasons: string[],
): MlbSignalProvenance {
  return {
    source,
    capturedAt: sourceCapturedAt(availability, key, capturedAt),
    cutoffTimestamp,
    cacheAgeMs: sourceAge(availability, key),
    available,
    qualityReasons,
  };
}

function isCompleteStarter(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const starter = value as Record<string, unknown>;
  const numeric = [
    "seasonEra", "seasonWhip", "fip", "kPct", "bbPct", "kMinusBbPct",
    "recentEra", "recentIpAvg", "seasonIp", "seasonBattersFaced",
    "recentPitchCountAvg", "recentStartCount",
  ];
  return typeof starter.name === "string" && starter.name.length > 0
    && typeof starter.playerId === "number"
    && numeric.every((key) => typeof starter[key] === "number" && Number.isFinite(starter[key]));
}

function isCompleteBullpen(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const bullpen = value as Record<string, unknown>;
  return typeof bullpen.teamAbbr === "string"
    && ["weightedPitches", "gamesLast3Days"].every(
      (key) => typeof bullpen[key] === "number" && Number.isFinite(bullpen[key]) && (bullpen[key] as number) >= 0,
    )
    && ["Fresh", "Moderate", "Tired", "Exhausted"].includes(bullpen.fatigueLabel as string);
}

function isCompleteLineup(confirmed: boolean, lineup: unknown): boolean {
  if (!confirmed || !lineup || typeof lineup !== "object") return false;
  const value = lineup as Record<string, unknown>;
  return typeof value.batterCount === "number" && value.batterCount >= 9
    && typeof value.lineupOps === "number" && Number.isFinite(value.lineupOps)
    && Array.isArray(value.playerIds) && value.playerIds.length >= 9
    && value.playerIds.every((id) => typeof id === "number" && Number.isFinite(id));
}

function isCompleteWeather(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const weather = value as Record<string, unknown>;
  return typeof weather.isDome === "boolean"
    && ["windSpeedMph", "windDirectionDeg", "precipitationMm", "temperatureCelsius"]
      .every((key) => typeof weather[key] === "number" && Number.isFinite(weather[key]));
}

/**
 * Produces the single MLB pregame quality assessment used by every prediction
 * path. Missing secondary evidence never becomes a neutral "zero" fact: it
 * compresses confidence, while missing starters or a valid pregame market blocks
 * a subscriber-facing recommendation entirely.
 */
export function assessMlbDecisionEvidence(
  game: FetchedGame,
  options: ComputeOptions,
  availability: Availability,
  capturedAt = new Date().toISOString(),
): MlbDecisionEvidence {
  const cutoffTimestamp = game.commenceTimeISO;
  const signals: Record<string, MlbSignalProvenance> = {};
  const missingSignals: string[] = [];
  const qualityReasons: string[] = [];
  let confidenceMultiplier = 1;

  const hasMarket = hasValidMoneylineMarketForSport("MLB", {
    homeOdds: options.realVegasHomeOdds,
    awayOdds: options.realVegasAwayOdds,
  });
  const isPregame = isPregameCommenceTime(game.commenceTimeISO);
  const marketReasons = [
    ...(!hasMarket ? ["missing_or_invalid_two_way_moneyline"] : []),
    ...(!isPregame ? ["scheduled_start_passed_or_invalid"] : []),
  ];
  signals.market = signal(
    availability,
    "market",
    "selected validated moneyline market",
    capturedAt,
    cutoffTimestamp,
    marketReasons.length === 0,
    marketReasons,
  );
  if (!hasMarket) missingSignals.push("market_odds");
  if (!isPregame) missingSignals.push("market_started_or_invalid");

  const hasStarters = isCompleteStarter(availability.homeStarter)
    && isCompleteStarter(availability.awayStarter)
    && !sourceIsStale(availability, "starters");
  const reportedStarterReasons = Array.isArray(availability.starterQualityReasons)
    ? availability.starterQualityReasons.filter((reason): reason is string => typeof reason === "string")
    : [];
  const starterReasons = hasStarters ? [] : [
    ...(reportedStarterReasons.length > 0
      ? reportedStarterReasons
      : ["one_or_both_probable_starters_missing_or_partial"]),
    ...(sourceIsStale(availability, "starters") ? ["starter_evidence_stale"] : []),
  ];
  signals.starters = signal(
    availability,
    "starters",
    "MLB Stats API probable pitchers",
    capturedAt,
    cutoffTimestamp,
    hasStarters,
    starterReasons,
  );
  if (starterReasons.length > 0) qualityReasons.push(...starterReasons);
  if (!hasStarters) missingSignals.push("probable_pitchers");

  const homeLineupConfirmed = availability.homeLineupConfirmed === true;
  const awayLineupConfirmed = availability.awayLineupConfirmed === true;
  const lineupsAvailable = isCompleteLineup(homeLineupConfirmed, availability.homeLineup)
    && isCompleteLineup(awayLineupConfirmed, availability.awayLineup)
    && !sourceIsStale(availability, "lineups");
  const lineupReasons = lineupsAvailable
    ? []
    : [
        ...(!homeLineupConfirmed ? ["home_lineup_unconfirmed"] : []),
        ...(!awayLineupConfirmed ? ["away_lineup_unconfirmed"] : []),
        ...(sourceIsStale(availability, "lineups") ? ["lineup_evidence_stale"] : []),
        ...((homeLineupConfirmed && !isCompleteLineup(true, availability.homeLineup))
          ? ["home_lineup_partial"] : []),
        ...((awayLineupConfirmed && !isCompleteLineup(true, availability.awayLineup))
          ? ["away_lineup_partial"] : []),
      ];
  signals.lineups = signal(
    availability,
    "lineups",
    "MLB Stats API confirmed lineups",
    capturedAt,
    cutoffTimestamp,
    lineupsAvailable,
    lineupReasons,
  );
  if (!lineupsAvailable) {
    confidenceMultiplier *= homeLineupConfirmed || awayLineupConfirmed ? 0.88 : 0.78;
    qualityReasons.push(...lineupReasons);
  }

  const homeBullpenAvailable = isCompleteBullpen(availability.homeBullpen);
  const awayBullpenAvailable = isCompleteBullpen(availability.awayBullpen);
  const bullpensAvailable = homeBullpenAvailable && awayBullpenAvailable
    && !sourceIsStale(availability, "bullpen");
  const bullpenReasons = bullpensAvailable
    ? []
    : [
        ...(!homeBullpenAvailable ? ["home_bullpen_unavailable"] : []),
        ...(!awayBullpenAvailable ? ["away_bullpen_unavailable"] : []),
        ...(sourceIsStale(availability, "bullpen") ? ["bullpen_evidence_stale"] : []),
      ];
  signals.bullpen = signal(
    availability,
    "bullpen",
    "MLB Stats API finalized boxscores",
    capturedAt,
    cutoffTimestamp,
    bullpensAvailable,
    bullpenReasons,
  );
  if (!bullpensAvailable) {
    confidenceMultiplier *= homeBullpenAvailable || awayBullpenAvailable ? 0.9 : 0.8;
    qualityReasons.push(...bullpenReasons);
  }

  const weather = availability.venueWeather as { isDome?: unknown } | null | undefined;
  const weatherAvailable = isCompleteWeather(weather) && !sourceIsStale(availability, "weather");
  const weatherReasons = weatherAvailable ? [] : [
    !isCompleteWeather(weather) ? "venue_weather_unavailable_or_partial" : "venue_weather_stale",
  ];
  signals.weather = signal(
    availability,
    "weather",
    weather?.isDome === true ? "verified indoor/retractable venue" : "Open-Meteo venue forecast",
    capturedAt,
    cutoffTimestamp,
    weatherAvailable,
    weatherReasons,
  );
  if (!weatherAvailable) {
    confidenceMultiplier *= 0.92;
    qualityReasons.push(...weatherReasons);
  }

  const hasTeamStats = options.homeDbStats != null && options.awayDbStats != null
    && !sourceIsStale(availability, "teamStats");
  const statReasons = hasTeamStats ? [] : [
    sourceIsStale(availability, "teamStats")
      ? "team_stat_inputs_stale"
      : "one_or_both_team_stat_inputs_unavailable_or_partial",
  ];
  signals.teamStats = signal(
    availability,
    "teamStats",
    "stored MLB team run and form statistics",
    capturedAt,
    cutoffTimestamp,
    hasTeamStats,
    statReasons,
  );
  if (!hasTeamStats) {
    confidenceMultiplier *= 0.86;
    qualityReasons.push(...statReasons);
  }

  const recommendationBlocked = missingSignals.includes("market_odds")
    || missingSignals.includes("market_started_or_invalid")
    || missingSignals.includes("probable_pitchers");

  if (recommendationBlocked) {
    qualityReasons.push("recommendation_blocked_by_required_pregame_evidence");
  }

  return {
    schemaVersion: "mlb-full-game-evidence-v1",
    capturedAt,
    cutoffTimestamp,
    recommendationBlocked,
    confidenceMultiplier: Math.max(0.55, Math.min(1, confidenceMultiplier)),
    missingSignals,
    qualityReasons,
    signals,
  };
}