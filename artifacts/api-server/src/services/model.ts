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
  vegasDrawOdds: number; // 0 for non-soccer; real draw ML for soccer
}

/** Default over/under totals per sport (used when ESPN doesn't return a real line) */
const DEFAULT_TOTALS: Record<string, number> = {
  NFL:    47.5,
  NBA:    224.5,
  MLB:    8.5,
  NHL:    5.5,
  WNBA:   164.5,
  Soccer: 2.5,
  UFC:    3.0,
};

/** Home-field advantage — percentage-point boost to home team win probability */
const HOME_ADVANTAGE: Record<string, number> = {
  NFL:    0.057, // ~57% home win rate historically
  NBA:    0.060,
  MLB:    0.040,
  NHL:    0.045,
  WNBA:   0.045,
  NCAAF:  0.075,
  NCAAB:  0.065,
  Soccer: 0.050, // MLS / international
  UFC:    0.000, // neutral site
};

// ── Record parsers ────────────────────────────────────────────────────────────

function parseWL(record: string): { wins: number; losses: number; total: number } {
  const parts = record.split("-");
  const wins = parseInt(parts[0] ?? "0", 10) || 0;
  const losses = parseInt(parts[1] ?? "0", 10) || 0;
  return { wins, losses, total: wins + losses };
}

/**
 * Parses a soccer W-D-L record (e.g. "4-4-7") or falls back to plain W-L.
 * Returns win rate = (wins + 0.4 * draws) / total — draws count as 40% of a win
 * which roughly reflects their expected point value (1 pt vs 3 for a win).
 */
function parseSoccerWinRate(record: string): number {
  const parts = record.split("-").map((s) => parseInt(s, 10) || 0);
  if (parts.length === 3) {
    const [wins, draws, losses] = parts as [number, number, number];
    const total = wins + draws + losses;
    if (total === 0) return 0.333;
    return (wins + draws * 0.4) / total;
  }
  // Plain W-L fallback
  const { wins, total } = parseWL(record);
  return total > 0 ? wins / total : 0.5;
}

// ── Odds math ─────────────────────────────────────────────────────────────────

/** American odds → implied probability (vig-inclusive) */
function americanToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

/** Implied probability → American moneyline */
function impliedToAmerican(prob: number): number {
  const p = Math.max(0.01, Math.min(0.99, prob));
  if (p >= 0.5) return -Math.round((p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

/**
 * Removes bookmaker vig from three implied probabilities (soccer 3-outcome)
 * so they sum to exactly 1.0.
 */
function removeVig3(pH: number, pD: number, pA: number): [number, number, number] {
  const total = pH + pD + pA;
  if (total === 0) return [1 / 3, 1 / 3, 1 / 3];
  return [pH / total, pD / total, pA / total];
}

/** Deterministic noise seeded by a string (avoids random drift across refreshes) */
function hashNoise(str: string, range: number, offset: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i);
    h |= 0;
  }
  return ((Math.abs(h) % (range + 1)) - offset) * 0.01;
}

// ── Main projection function ──────────────────────────────────────────────────

export interface ComputeOptions {
  /** Home team's record at their home venue (W-L) */
  homeHomeRecord?: string;
  /** Home team's record on the road (W-L) */
  homeRoadRecord?: string;
  /** Away team's record at their home venue (W-L) */
  awayHomeRecord?: string;
  /** Away team's record on the road (W-L) */
  awayRoadRecord?: string;
  /** Real Vegas home moneyline from ESPN/DraftKings */
  realVegasHomeOdds?: number;
  /** Real Vegas away moneyline */
  realVegasAwayOdds?: number;
  /** Real Vegas draw moneyline (soccer only) */
  realVegasDrawOdds?: number;
  /** Real Vegas over/under total */
  realVegasOverUnder?: number;
}

export function computeProjection(
  gameId: string,
  sport: string,
  homeRecord: string,
  awayRecord: string,
  weights: ModelWeights | null,
  opts: ComputeOptions = {},
): ProjectionResult {
  const multiplier = weights?.confidenceMultiplier ?? 1.0;
  const accuracyBoost = ((weights?.accuracyRate ?? 0.5) - 0.5) * 20;
  const homeAdv = HOME_ADVANTAGE[sport] ?? 0.05;

  // ── Soccer: 3-outcome model ────────────────────────────────────────────────
  if (sport === "Soccer") {
    return computeSoccerProjection(gameId, homeRecord, awayRecord, multiplier, accuracyBoost, opts);
  }

  // ── WNBA / NBA: use home/road splits when available ────────────────────────
  let homeWinRate: number;
  let awayWinRate: number;

  if (sport === "WNBA" || sport === "NBA") {
    // Home team playing at home → use their home record
    // Away team playing on road → use their road record
    const homeAtHomeRecord = opts.homeHomeRecord ?? homeRecord;
    const awayOnRoadRecord = opts.awayRoadRecord ?? awayRecord;

    const homeWL = parseWL(homeAtHomeRecord);
    const awayWL = parseWL(awayOnRoadRecord);

    homeWinRate = homeWL.total > 0 ? homeWL.wins / homeWL.total : 0.5;
    awayWinRate = awayWL.total > 0 ? awayWL.wins / awayWL.total : 0.5;
  } else {
    const homeWL = parseWL(homeRecord);
    const awayWL = parseWL(awayRecord);
    homeWinRate = homeWL.total > 0 ? homeWL.wins / homeWL.total : 0.5;
    awayWinRate = awayWL.total > 0 ? awayWL.wins / awayWL.total : 0.5;
  }

  // Model probability: base 50% + home advantage + record differential
  let prob = 0.5 + homeAdv + (homeWinRate - awayWinRate) * 0.35;
  prob = 0.5 + (prob - 0.5) * multiplier;
  const noise = hashNoise(gameId, 10, 5);
  prob = Math.max(0.25, Math.min(0.80, prob + noise));

  const homeWinPct = Math.round(prob * 100);
  const deviation = Math.abs(homeWinPct - 50);

  // ── Vegas line: real when available, simulated otherwise ───────────────────
  let vegasHomeOdds: number;
  let vegasAwayOdds: number;
  let vegasImplied: number;

  if (opts.realVegasHomeOdds != null && opts.realVegasAwayOdds != null) {
    vegasHomeOdds = opts.realVegasHomeOdds;
    vegasAwayOdds = opts.realVegasAwayOdds;
    vegasImplied = americanToImplied(vegasHomeOdds);
  } else if (opts.realVegasHomeOdds != null) {
    vegasHomeOdds = opts.realVegasHomeOdds;
    vegasImplied = americanToImplied(vegasHomeOdds);
    vegasAwayOdds = impliedToAmerican(1 - vegasImplied);
  } else {
    // Simulate a naive market line as a reference
    const naiveProb = 0.5 + (homeWinRate - awayWinRate) * 0.3;
    const vegasNoise = hashNoise(gameId + "v", 6, 3);
    const vegasProb = Math.max(0.1, Math.min(0.9, naiveProb + vegasNoise));
    vegasHomeOdds = impliedToAmerican(vegasProb);
    vegasAwayOdds = impliedToAmerican(1 - vegasProb);
    vegasImplied = americanToImplied(vegasHomeOdds);
  }

  // Edge = model's probability advantage vs Vegas implied (no-vig)
  const edge = Math.round((prob - vegasImplied) * 1000) / 10;

  // Model score 40–95
  const modelScore = Math.max(40, Math.min(95, Math.round(55 + deviation + accuracyBoost)));
  const confidence = deviation >= 18 ? "High" : deviation >= 9 ? "Medium" : "Low";
  const valueRating =
    edge >= 10 ? "Strong Buy" : edge >= 5 ? "Buy" : edge <= -5 ? "Fade" : "Neutral";

  const projectedSpread = Math.round((0.5 - prob) * 20 * 2) / 2;
  const vegasSpread = Math.round((0.5 - vegasImplied) * 20 * 2) / 2;

  const defaultTotal = DEFAULT_TOTALS[sport] ?? 45.0;
  const projectedTotal = opts.realVegasOverUnder ?? defaultTotal;
  const totalNoise = hashNoise(gameId + "t", 2, 1);
  const vegasTotal = opts.realVegasOverUnder ?? (projectedTotal + totalNoise);

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
    vegasDrawOdds: 0,
  };
}

// ── Soccer 3-outcome model ────────────────────────────────────────────────────

/**
 * Soccer-specific projection using a 3-outcome model.
 *
 * When real Vegas odds are available (home ML + draw ML), we:
 *   1. Derive no-vig probabilities for all three outcomes.
 *   2. Compare our model's home-win probability against the no-vig Vegas figure.
 *   3. Edge = model_P(home) - noVig_P(home).
 *
 * Model probabilities are derived from W-D-L season records with home advantage.
 */
function computeSoccerProjection(
  gameId: string,
  homeRecord: string,
  awayRecord: string,
  multiplier: number,
  accuracyBoost: number,
  opts: ComputeOptions,
): ProjectionResult {
  const homeRate = parseSoccerWinRate(homeRecord);
  const awayRate = parseSoccerWinRate(awayRecord);

  // Model home win probability (includes home advantage)
  let prob = 0.42 + 0.05 + (homeRate - awayRate) * 0.30;
  prob = 0.42 + (prob - 0.42) * multiplier;
  const noise = hashNoise(gameId, 8, 4);
  prob = Math.max(0.15, Math.min(0.75, prob + noise));

  // Model draw probability — scales inversely with favourite strength
  const drawProb = Math.max(0.18, 0.30 - Math.abs(prob - 0.5) * 0.5);
  // Away win = remainder
  const awayProb = Math.max(0.10, 1 - prob - drawProb);

  // Renormalise
  const total = prob + drawProb + awayProb;
  const modelHome = prob / total;
  const modelDraw = drawProb / total;
  const modelAway = awayProb / total;

  const homeWinPct = Math.round(modelHome * 100);
  const deviation = Math.abs(homeWinPct - 50);
  const modelScore = Math.max(40, Math.min(95, Math.round(55 + deviation + accuracyBoost)));
  const confidence = deviation >= 18 ? "High" : deviation >= 9 ? "Medium" : "Low";

  // ── Vegas odds (real from ESPN when available) ─────────────────────────────
  let vegasHomeOdds: number;
  let vegasAwayOdds: number;
  let vegasDrawOdds: number;
  let vegasImpliedHome: number;

  if (opts.realVegasHomeOdds != null && opts.realVegasDrawOdds != null) {
    // We have real lines — compute no-vig probabilities for edge calculation
    const rawHome = americanToImplied(opts.realVegasHomeOdds);
    const rawDraw = americanToImplied(opts.realVegasDrawOdds);

    // Derive away implied probability from remainder (handles missing away odds)
    let rawAway: number;
    if (opts.realVegasAwayOdds != null) {
      rawAway = americanToImplied(opts.realVegasAwayOdds);
    } else {
      // Use balance approach: total vig is typically ~5–8%; assign rest to away
      rawAway = Math.max(0.05, 1.06 - rawHome - rawDraw); // ~6% vig assumption
    }

    const [nvHome, , ] = removeVig3(rawHome, rawDraw, rawAway);
    vegasImpliedHome = nvHome;

    vegasHomeOdds = opts.realVegasHomeOdds;
    vegasDrawOdds = opts.realVegasDrawOdds;
    vegasAwayOdds = opts.realVegasAwayOdds ?? impliedToAmerican(1 - rawHome - rawDraw);
  } else {
    // Simulate market from model probabilities with slight noise
    const vegNoise = hashNoise(gameId + "sv", 6, 3);
    const simHome = Math.max(0.10, Math.min(0.75, modelHome + vegNoise));
    const simDraw = Math.max(0.10, 0.28 - vegNoise * 0.3);
    vegasHomeOdds = impliedToAmerican(simHome);
    vegasDrawOdds = impliedToAmerican(simDraw);
    vegasAwayOdds = impliedToAmerican(Math.max(0.10, 1 - simHome - simDraw));
    vegasImpliedHome = simHome;
  }

  // Edge measured purely on home-win market (primary moneyline bet)
  const edge = Math.round((modelHome - vegasImpliedHome) * 1000) / 10;

  const valueRating =
    edge >= 8 ? "Strong Buy" : edge >= 4 ? "Buy" : edge <= -4 ? "Fade" : "Neutral";

  // Spread approximation: 1 goal ≈ 0.22 probability points in soccer
  const projectedSpread = Math.round((0.5 - modelHome) * 6 * 2) / 2;
  const vegasSpread = Math.round((0.5 - vegasImpliedHome) * 6 * 2) / 2;

  const projectedTotal = opts.realVegasOverUnder ?? DEFAULT_TOTALS["Soccer"] ?? 2.5;
  const totalNoise = hashNoise(gameId + "t", 2, 1) * 0.5;
  const vegasTotal = opts.realVegasOverUnder ?? (projectedTotal + totalNoise);

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
    vegasDrawOdds,
  };
}
