/**
 * Read-only utilities for the MLB V4 historical replay.  These deliberately
 * consume the immutable prediction snapshot rather than live game data.
 */
import type { MlbDecisionEvidence } from "./mlbDecisionEvidence";
import type { MlbV4Input } from "./mlbV4Challenger";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Rebuild only the V4 inputs that were captured at the original decision. */
export function reconstructMlbV4Input(snapshot: unknown): MlbV4Input | null {
  const root = record(snapshot);
  const decision = record(root.decision);
  const availability = record(decision.availability);
  const signals = record(decision.inputSignals);
  const dataQuality = record(decision.dataQuality);
  const evidence = dataQuality.evidence as MlbDecisionEvidence | undefined;
  if (!evidence || evidence.schemaVersion !== "mlb-full-game-evidence-v1") return null;

  const homeStarter = availability.homeStarter ?? null;
  const awayStarter = availability.awayStarter ?? null;
  // Historical decision contexts capture these objects before the game begins.
  // Do not derive, enrich, or replace any missing object here.
  return {
    homeDbStats: (signals.homeDbStats ?? undefined) as MlbV4Input["homeDbStats"],
    awayDbStats: (signals.awayDbStats ?? undefined) as MlbV4Input["awayDbStats"],
    starters: {
      home: homeStarter as MlbV4Input["starters"]["home"],
      away: awayStarter as MlbV4Input["starters"]["away"],
      qualityReasons: Array.isArray(availability.starterQualityReasons)
        ? availability.starterQualityReasons.filter((value): value is string => typeof value === "string")
        : [],
    },
    lineups: availability.homeLineup != null || availability.awayLineup != null
      ? { home: availability.homeLineup as never, away: availability.awayLineup as never }
      : null,
    bullpen: availability.homeBullpen != null || availability.awayBullpen != null
      ? { home: availability.homeBullpen as never, away: availability.awayBullpen as never }
      : null,
    parkFactor: finite(signals.parkFactor),
    weather: (availability.venueWeather ?? null) as MlbV4Input["weather"],
    weatherTotalAdjustment: finite(signals.weatherTotalAdjustment) ?? 0,
    evidence,
    market: {
      homeOdds: finite(signals.realVegasHomeOdds),
      awayOdds: finite(signals.realVegasAwayOdds),
      pinnacleHomeOdds: finite(signals.pinnacleHomeOdds),
      pinnacleAwayOdds: finite(signals.pinnacleAwayOdds),
      consensusHomeOdds: finite(signals.consensusHomeOdds),
      consensusAwayOdds: finite(signals.consensusAwayOdds),
      lineMovedTowardHome: signals.lineMovedTowardHome === true,
    },
  };
}

export interface ReplaySnapshotCandidate {
  gameId: string;
  predictionId: number;
  predictionTimestamp: Date;
  gameStartsAt: Date | null;
  snapshot: unknown;
}

export interface ReplaySelection {
  selected: ReplaySnapshotCandidate[];
  excluded: Record<string, number>;
}

/**
 * Enforces PIT before deduping: a later post-start revision can never displace
 * an earlier valid pregame snapshot.  It also never accepts final scores from
 * a snapshot as inputs.
 */
export function selectLatestValidPregameSnapshots(
  candidates: readonly ReplaySnapshotCandidate[],
): ReplaySelection {
  const excluded: Record<string, number> = {};
  const valid: ReplaySnapshotCandidate[] = [];
  for (const candidate of candidates) {
    if (!candidate.gameStartsAt || !Number.isFinite(candidate.gameStartsAt.getTime())) {
      excluded.missing_game_start = (excluded.missing_game_start ?? 0) + 1;
    } else if (candidate.predictionTimestamp.getTime() >= candidate.gameStartsAt.getTime()) {
      excluded.point_in_time_integrity_failure =
        (excluded.point_in_time_integrity_failure ?? 0) + 1;
    } else if (!reconstructMlbV4Input(candidate.snapshot)) {
      excluded.insufficient_historical_feature_snapshot =
        (excluded.insufficient_historical_feature_snapshot ?? 0) + 1;
    } else {
      const evidence = record(record(record(candidate.snapshot).decision).dataQuality).evidence;
      const evidenceRecord = record(evidence);
      const capturedAtValue = evidenceRecord.capturedAt;
      const cutoffValue = evidenceRecord.cutoffTimestamp;
      const capturedAt = typeof capturedAtValue === "string"
        ? new Date(capturedAtValue).getTime()
        : Number.NaN;
      const cutoff = typeof cutoffValue === "string"
        ? new Date(cutoffValue).getTime()
        : Number.NaN;
      if (!Number.isFinite(capturedAt) || !Number.isFinite(cutoff)
        || capturedAt >= candidate.gameStartsAt.getTime() || cutoff > candidate.gameStartsAt.getTime()) {
        excluded.point_in_time_integrity_failure =
          (excluded.point_in_time_integrity_failure ?? 0) + 1;
      } else {
        valid.push(candidate);
      }
    }
  }
  const latest = new Map<string, ReplaySnapshotCandidate>();
  for (const candidate of valid) {
    const prior = latest.get(candidate.gameId);
    if (!prior
      || candidate.predictionTimestamp > prior.predictionTimestamp
      || (candidate.predictionTimestamp.getTime() === prior.predictionTimestamp.getTime()
        && candidate.predictionId > prior.predictionId)) latest.set(candidate.gameId, candidate);
  }
  return { selected: [...latest.values()].sort((a, b) => a.predictionTimestamp.getTime() - b.predictionTimestamp.getTime()), excluded };
}

export interface ProbabilityObservation {
  probability: number;
  outcome: 0 | 1;
  marketProbability?: number | null;
}

export function probabilityMetrics(rows: readonly ProbabilityObservation[]): {
  count: number; brier: number | null; logLoss: number | null; ece: number | null;
  marketBrier: number | null; brierSkill: number | null;
} {
  if (!rows.length) return { count: 0, brier: null, logLoss: null, ece: null, marketBrier: null, brierSkill: null };
  const clipped = (p: number) => Math.max(.000001, Math.min(.999999, p));
  const brier = rows.reduce((sum, row) => sum + (row.probability - row.outcome) ** 2, 0) / rows.length;
  const logLoss = rows.reduce((sum, row) => {
    const p = clipped(row.probability);
    return sum - (row.outcome ? Math.log(p) : Math.log(1 - p));
  }, 0) / rows.length;
  const buckets = new Map<number, ProbabilityObservation[]>();
  for (const row of rows) {
    const key = Math.min(9, Math.floor(clipped(row.probability) * 10));
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  const ece = [...buckets.values()].reduce((sum, bucket) => {
    const predicted = bucket.reduce((s, row) => s + row.probability, 0) / bucket.length;
    const actual = bucket.reduce((s, row) => s + row.outcome, 0) / bucket.length;
    return sum + bucket.length / rows.length * Math.abs(predicted - actual);
  }, 0);
  const market = rows.filter((row): row is ProbabilityObservation & { marketProbability: number } =>
    typeof row.marketProbability === "number" && Number.isFinite(row.marketProbability));
  const marketBrier = market.length
    ? market.reduce((sum, row) => sum + (row.marketProbability - row.outcome) ** 2, 0) / market.length
    : null;
  const matchingBrier = market.length
    ? market.reduce((sum, row) => sum + (row.probability - row.outcome) ** 2, 0) / market.length
    : null;
  return { count: rows.length, brier, logLoss, ece, marketBrier, brierSkill: marketBrier && matchingBrier != null ? 1 - matchingBrier / marketBrier : null };
}

export function runErrorMetrics(rows: readonly { projectedAway: number; projectedHome: number; actualAway: number; actualHome: number }[]) {
  const metric = (errors: number[]) => errors.length ? {
    mae: errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length,
    rmse: Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length),
    bias: errors.reduce((sum, value) => sum + value, 0) / errors.length,
  } : null;
  return {
    home: metric(rows.map((r) => r.projectedHome - r.actualHome)),
    away: metric(rows.map((r) => r.projectedAway - r.actualAway)),
    total: metric(rows.map((r) => r.projectedHome + r.projectedAway - r.actualHome - r.actualAway)),
    margin: metric(rows.map((r) => r.projectedHome - r.projectedAway - r.actualHome + r.actualAway)),
  };
}