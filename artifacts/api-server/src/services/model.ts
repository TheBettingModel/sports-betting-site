import type { ModelWeights } from "@workspace/db";

export interface ProjectionResult {
  homeWinPct: number;
  confidence: string;
  projectedSpread: number;
  projectedTotal: number;
  valueRating: string;
  modelScore: number;
  edge: number;
  vegasSpread: number;
  vegasTotal: number;
  vegasHomeOdds: number;
  vegasAwayOdds: number;
}

/** Default over/under totals per sport */
const DEFAULT_TOTALS: Record<string, number> = {
  NFL: 47.5,
  NBA: 224.5,
  MLB: 8.5,
  NHL: 5.5,
  WNBA: 164.5,
  Soccer: 2.5,
  UFC: 3.0,
};

function parseRecord(record: string): { wins: number; losses: number } {
  const parts = record.split("-");
  return {
    wins: parseInt(parts[0] ?? "0", 10) || 0,
    losses: parseInt(parts[1] ?? "0", 10) || 0,
  };
}

function americanToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function impliedToAmerican(prob: number): number {
  const p = Math.max(0.01, Math.min(0.99, prob));
  if (p >= 0.5) return -Math.round((p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

/** Deterministic noise from a string seed */
function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function computeProjection(
  gameId: string,
  sport: string,
  homeRecord: string,
  awayRecord: string,
  weights: ModelWeights | null,
): ProjectionResult {
  const home = parseRecord(homeRecord);
  const away = parseRecord(awayRecord);

  const homeGames = home.wins + home.losses;
  const awayGames = away.wins + away.losses;

  const homeWinRate = homeGames > 0 ? home.wins / homeGames : 0.5;
  const awayWinRate = awayGames > 0 ? away.wins / awayGames : 0.5;

  // 50% base + 4% home advantage + up to ±35% record differential
  let prob = 0.5 + 0.04 + (homeWinRate - awayWinRate) * 0.35;

  // Apply learned confidence multiplier (scales deviation from 0.5)
  const multiplier = weights?.confidenceMultiplier ?? 1.0;
  prob = 0.5 + (prob - 0.5) * multiplier;

  // Deterministic noise ±5% seeded by game ID
  const noise = ((hashCode(gameId) % 11) - 5) * 0.01;
  prob = Math.max(0.25, Math.min(0.80, prob + noise));

  const homeWinPct = Math.round(prob * 100);
  const deviation = Math.abs(homeWinPct - 50);

  // Vegas estimated line (slightly different from model)
  const vegasNoise = ((hashCode(gameId + "v") % 7) - 3) * 0.01;
  const vegasProb = Math.max(0.1, Math.min(0.9, prob + vegasNoise));
  const vegasHomeOdds = impliedToAmerican(vegasProb);
  const vegasAwayOdds = impliedToAmerican(1 - vegasProb);
  const vegasImplied = americanToImplied(vegasHomeOdds);

  const edge = Math.round((prob - vegasImplied) * 1000) / 10;

  // Model score 40–95 boosted by prediction accuracy
  const accuracyBoost = ((weights?.accuracyRate ?? 0.5) - 0.5) * 20;
  const modelScore = Math.max(
    40,
    Math.min(95, Math.round(55 + deviation + accuracyBoost)),
  );

  const confidence =
    deviation >= 18 ? "High" : deviation >= 9 ? "Medium" : "Low";

  const valueRating =
    edge >= 10
      ? "Strong Buy"
      : edge >= 5
        ? "Buy"
        : edge <= -5
          ? "Fade"
          : "Neutral";

  const projectedSpread = Math.round((0.5 - prob) * 20 * 2) / 2;
  const vegasSpread = Math.round((0.5 - vegasImplied) * 20 * 2) / 2;

  const projectedTotal = DEFAULT_TOTALS[sport] ?? 45.0;
  const totalNoise = ((hashCode(gameId + "t") % 3) - 1) * 0.5;
  const vegasTotal = projectedTotal + totalNoise;

  return {
    homeWinPct,
    confidence,
    projectedSpread,
    projectedTotal,
    valueRating,
    modelScore,
    edge,
    vegasSpread,
    vegasTotal,
    vegasHomeOdds,
    vegasAwayOdds,
  };
}
