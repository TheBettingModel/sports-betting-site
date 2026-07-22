import type { ModelWeights, FactorWeights } from "@workspace/db";
import type { WnbaTeamStats, SoccerTeamStats, DbTeamStats } from "./teamStats";

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
  NFL:    0.057,
  NBA:    0.060,
  MLB:    0.040,
  NHL:    0.045,
  WNBA:   0.045,
  NCAAF:  0.075,
  NCAAB:  0.065,
  Soccer: 0.050,
  UFC:    0.000,
};

// ── Default factor weights per sport ─────────────────────────────────────────
// These are the hardcoded priors. The learning engine overwrites them in the
// model_weights.factorWeights column as it observes outcomes. Any key not
// present in the stored JSON falls back to the default here.
//
// Keys must match what computeFactorContributions() uses — both must stay
// in sync when factor names change.

export const SPORT_DEFAULT_WEIGHTS: Record<string, FactorWeights> = {
  // ── MLB: run-based model ──────────────────────────────────────────────────
  MLB: {
    recordWeight:      0.20, // season W/L differential
    pythagoreanWeight: 0.28, // Pythagorean win% (run differential) — best predictor
    formWeight:        0.10, // last-5 win% differential
    scoreDiffWeight:   0.012,// avg run differential per game (additive)
    restWeight:        0.005, // per extra rest day
  },
  // ── NFL: point-differential model ────────────────────────────────────────
  NFL: {
    recordWeight:      0.22,
    pythagoreanWeight: 0.25,
    formWeight:        0.08,
    scoreDiffWeight:   0.003,
    restWeight:        0.018, // bye weeks create large rest edges in NFL
  },
  // ── NHL: goal-differential model ─────────────────────────────────────────
  NHL: {
    recordWeight:      0.22,
    pythagoreanWeight: 0.22,
    formWeight:        0.14, // NHL form matters — fatigue from dense schedule
    scoreDiffWeight:   0.018,
    restWeight:        0.016, // back-to-backs are brutal in NHL
  },
  // ── College football ─────────────────────────────────────────────────────
  NCAAF: {
    recordWeight:      0.35, // record matters more at college level (talent gap)
    pythagoreanWeight: 0.18,
    formWeight:        0.10,
    scoreDiffWeight:   0.002,
    restWeight:        0.007,
  },
  // ── College basketball ───────────────────────────────────────────────────
  NCAAB: {
    recordWeight:      0.28,
    pythagoreanWeight: 0.22,
    formWeight:        0.12,
    scoreDiffWeight:   0.003,
    restWeight:        0.006,
  },
  // ── UFC: record-based, no team scores ────────────────────────────────────
  UFC: {
    recordWeight: 0.45, // heavier — only signal we have
    formWeight:   0.20,
    restWeight:   0.008,
  },
  // ── WNBA / NBA: multi-factor efficiency model ─────────────────────────────
  WNBA: {
    recordWeight:     0.30,
    efgWeight:        0.28,  // eFG% differential — strongest per-possession signal
    toWeight:         0.22,  // turnover% (note: lower is better, applied reversed)
    orebWeight:       0.004, // offensive rebounds per game
    defWeight:        0.003, // (BLK + STL) per game
    formWeight:       0.12,
    netRatingWeight:  0.003,
    restWeight:       0.009,
  },
  NBA: {
    recordWeight:     0.30,
    efgWeight:        0.28,
    toWeight:         0.22,
    orebWeight:       0.004,
    defWeight:        0.003,
    formWeight:       0.12,
    netRatingWeight:  0.003,
    restWeight:       0.009,
  },
  // ── Soccer: 3-outcome goals model ────────────────────────────────────────
  Soccer: {
    recordWeight:        0.28,
    attackDefWeight:     0.08,  // attack vs opponent defence matchup
    goalDiffWeight:      0.05,  // overall goal differential
    formWeight:          0.10,  // last-5 W-D-L form rating
    lastGoalDiffWeight:  0.025, // last-5 goal differential
    restWeight:          0.007,
  },
};

/** Merge stored factorWeights with sport defaults, sport defaults win for missing keys */
function effectiveWeights(sport: string, stored: FactorWeights | null | undefined): FactorWeights {
  const defaults = SPORT_DEFAULT_WEIGHTS[sport] ?? SPORT_DEFAULT_WEIGHTS["MLB"]!;
  if (!stored) return defaults;
  // Stored values override defaults; missing stored keys fall back to defaults
  return { ...defaults, ...stored };
}

// ── Record parsers ────────────────────────────────────────────────────────────

function parseWL(record: string): { wins: number; losses: number; total: number } {
  const parts = record.split("-");
  const wins = parseInt(parts[0] ?? "0", 10) || 0;
  const losses = parseInt(parts[1] ?? "0", 10) || 0;
  return { wins, losses, total: wins + losses };
}

function parseSoccerWinRate(record: string): number {
  const parts = record.split("-").map((s) => parseInt(s, 10) || 0);
  if (parts.length === 3) {
    const [wins, draws, losses] = parts as [number, number, number];
    const total = wins + draws + losses;
    if (total === 0) return 0.333;
    return (wins + draws * 0.4) / total;
  }
  const { wins, total } = parseWL(record);
  return total > 0 ? wins / total : 0.5;
}

// ── Odds math ─────────────────────────────────────────────────────────────────

function americanToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function impliedToAmerican(prob: number): number {
  const p = Math.max(0.01, Math.min(0.99, prob));
  if (p >= 0.5) return -Math.round((p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

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

// ── ComputeOptions ────────────────────────────────────────────────────────────

export interface ComputeOptions {
  homeHomeRecord?: string;
  homeRoadRecord?: string;
  awayHomeRecord?: string;
  awayRoadRecord?: string;
  realVegasHomeOdds?: number;
  realVegasAwayOdds?: number;
  realVegasDrawOdds?: number;
  realVegasOverUnder?: number;
  // ── WNBA / NBA advanced analytics (ESPN) ────────────────────────────────
  homeTeamStats?: WnbaTeamStats;
  awayTeamStats?: WnbaTeamStats;
  // ── Soccer historical stats (DB) ────────────────────────────────────────
  homeSoccerStats?: SoccerTeamStats;
  awaySoccerStats?: SoccerTeamStats;
  // ── MLB / NFL / NHL / NCAAF / NCAAB — DB-sourced run/point/goal stats ──
  homeDbStats?: DbTeamStats;
  awayDbStats?: DbTeamStats;
}

// ── Factor contribution breakdown (used by learning engine) ──────────────────

export interface FactorContributions {
  [factor: string]: number; // signed prob contribution; >0 = predicts home win
}

/**
 * Compute what each factor contributed to the home-win probability edge.
 * Positive = this factor pushed toward home win.
 * Used by the learning engine to identify which factors were correct/wrong.
 */
export function computeFactorContributions(
  sport: string,
  homeRecord: string,
  awayRecord: string,
  opts: ComputeOptions,
  fw: FactorWeights,
): FactorContributions {
  const contributions: FactorContributions = {};

  if (sport === "Soccer") {
    const homeRate = parseSoccerWinRate(homeRecord);
    const awayRate = parseSoccerWinRate(awayRecord);
    contributions["record"] = (homeRate - awayRate) * (fw["recordWeight"] ?? 0.28);

    const hs = opts.homeSoccerStats;
    const as_ = opts.awaySoccerStats;
    if (hs && as_) {
      contributions["attackDef"] = ((hs.goalsPerGame - as_.goalsAllowedPerGame) -
                                    (as_.goalsPerGame - hs.goalsAllowedPerGame)) *
                                   (fw["attackDefWeight"] ?? 0.08);
      contributions["goalDiff"] = (hs.goalDifferential - as_.goalDifferential) *
                                  (fw["goalDiffWeight"] ?? 0.05);
      contributions["form"]     = (hs.last5Form - as_.last5Form) *
                                  (fw["formWeight"] ?? 0.10);
      contributions["lastGoalDiff"] = (hs.last5GoalDiff - as_.last5GoalDiff) *
                                      (fw["lastGoalDiffWeight"] ?? 0.025);
      const restDiff = hs.restDays - as_.restDays;
      contributions["rest"] = Math.max(-0.025, Math.min(0.025, restDiff * (fw["restWeight"] ?? 0.007)));
    }
    return contributions;
  }

  if (sport === "WNBA" || sport === "NBA") {
    const homeAtHomeRecord = opts.homeHomeRecord ?? homeRecord;
    const awayOnRoadRecord = opts.awayRoadRecord ?? awayRecord;
    const homeWL = parseWL(homeAtHomeRecord);
    const awayWL = parseWL(awayOnRoadRecord);
    const homeWinRate = homeWL.total > 0 ? homeWL.wins / homeWL.total : 0.5;
    const awayWinRate = awayWL.total > 0 ? awayWL.wins / awayWL.total : 0.5;
    contributions["record"] = (homeWinRate - awayWinRate) * (fw["recordWeight"] ?? 0.30);

    const hs = opts.homeTeamStats;
    const as_ = opts.awayTeamStats;
    if (hs && as_) {
      contributions["efg"]       = (hs.efgPercent - as_.efgPercent) * (fw["efgWeight"] ?? 0.28);
      contributions["to"]        = (as_.turnoverPercent - hs.turnoverPercent) * (fw["toWeight"] ?? 0.22);
      contributions["oreb"]      = (hs.orebPg - as_.orebPg) * (fw["orebWeight"] ?? 0.004);
      contributions["def"]       = ((hs.bpg + hs.spg) - (as_.bpg + as_.spg)) * (fw["defWeight"] ?? 0.003);
      contributions["form"]      = (hs.last5WinPct - as_.last5WinPct) * (fw["formWeight"] ?? 0.12);
      contributions["netRating"] = (hs.last10PointDiff - as_.last10PointDiff) * (fw["netRatingWeight"] ?? 0.003);
      const restDiff = hs.restDays - as_.restDays;
      contributions["rest"] = Math.max(-0.035, Math.min(0.035, restDiff * (fw["restWeight"] ?? 0.009)));
    }
    return contributions;
  }

  // MLB / NFL / NHL / NCAAF / NCAAB / UFC
  const homeWL = parseWL(homeRecord);
  const awayWL = parseWL(awayRecord);
  const homeWinRate = homeWL.total > 0 ? homeWL.wins / homeWL.total : 0.5;
  const awayWinRate = awayWL.total > 0 ? awayWL.wins / awayWL.total : 0.5;
  contributions["record"] = (homeWinRate - awayWinRate) * (fw["recordWeight"] ?? 0.25);

  const hs = opts.homeDbStats;
  const as_ = opts.awayDbStats;
  if (hs && as_) {
    contributions["pythagorean"] = (hs.pythagoreanWinPct - as_.pythagoreanWinPct) *
                                   (fw["pythagoreanWeight"] ?? 0.25);
    contributions["form"]        = (hs.last5WinPct - as_.last5WinPct) *
                                   (fw["formWeight"] ?? 0.10);
    contributions["scoreDiff"]   = (hs.scoreDifferential - as_.scoreDifferential) *
                                   (fw["scoreDiffWeight"] ?? 0.010);
    const restDiff = hs.restDays - as_.restDays;
    const maxRest  = sport === "NFL" ? 0.05 : 0.03;
    contributions["rest"] = Math.max(-maxRest, Math.min(maxRest, restDiff * (fw["restWeight"] ?? 0.010)));
  } else if (sport === "UFC") {
    const formFactor = (homeWinRate - 0.5) * (fw["formWeight"] ?? 0.20);
    contributions["form"] = formFactor;
  }

  return contributions;
}

// ── Main projection function ──────────────────────────────────────────────────

export function computeProjection(
  gameId: string,
  sport: string,
  homeRecord: string,
  awayRecord: string,
  weights: ModelWeights | null,
  opts: ComputeOptions = {},
): ProjectionResult {
  const multiplier    = weights?.confidenceMultiplier ?? 1.0;
  const accuracyBoost = ((weights?.accuracyRate ?? 0.5) - 0.5) * 20;
  const homeAdv       = HOME_ADVANTAGE[sport] ?? 0.05;
  const fw            = effectiveWeights(sport, weights?.factorWeights);

  // ── Soccer: 3-outcome model ────────────────────────────────────────────────
  if (sport === "Soccer") {
    return computeSoccerProjection(gameId, homeRecord, awayRecord, multiplier, accuracyBoost, opts, fw);
  }

  // ── WNBA / NBA: advanced efficiency model ─────────────────────────────────
  if (sport === "WNBA" || sport === "NBA") {
    return computeBasketballProjection(
      gameId, sport, homeRecord, awayRecord, multiplier, accuracyBoost, homeAdv, opts, fw,
    );
  }

  // ── MLB / NFL / NHL / NCAAF / NCAAB / UFC: DB-sourced model ─────────────
  return computeRunsModel(
    gameId, sport, homeRecord, awayRecord, multiplier, accuracyBoost, homeAdv, opts, fw,
  );
}

// ── Basketball (WNBA/NBA): tiered efficiency model ────────────────────────────

function computeBasketballProjection(
  gameId: string,
  sport: string,
  homeRecord: string,
  awayRecord: string,
  multiplier: number,
  accuracyBoost: number,
  homeAdv: number,
  opts: ComputeOptions,
  fw: FactorWeights,
): ProjectionResult {
  const homeAtHomeRecord = opts.homeHomeRecord ?? homeRecord;
  const awayOnRoadRecord = opts.awayRoadRecord ?? awayRecord;

  const homeWL = parseWL(homeAtHomeRecord);
  const awayWL = parseWL(awayOnRoadRecord);
  const homeWinRate = homeWL.total > 0 ? homeWL.wins / homeWL.total : 0.5;
  const awayWinRate = awayWL.total > 0 ? awayWL.wins / awayWL.total : 0.5;

  let prob = 0.5 + homeAdv + (homeWinRate - awayWinRate) * (fw["recordWeight"] ?? 0.30);

  const hs = opts.homeTeamStats;
  const as_ = opts.awayTeamStats;

  if (hs && as_) {
    // Tier 1: Efficiency
    prob += (hs.efgPercent - as_.efgPercent) * (fw["efgWeight"] ?? 0.28);
    prob += (as_.turnoverPercent - hs.turnoverPercent) * (fw["toWeight"] ?? 0.22);
    prob += (hs.orebPg - as_.orebPg) * (fw["orebWeight"] ?? 0.004);
    prob += ((hs.bpg + hs.spg) - (as_.bpg + as_.spg)) * (fw["defWeight"] ?? 0.003);
    // Tier 2: Recent form
    prob += (hs.last5WinPct - as_.last5WinPct) * (fw["formWeight"] ?? 0.12);
    prob += (hs.last10PointDiff - as_.last10PointDiff) * (fw["netRatingWeight"] ?? 0.003);
    // Tier 3: Rest
    const restDiff = hs.restDays - as_.restDays;
    prob += Math.max(-0.035, Math.min(0.035, restDiff * (fw["restWeight"] ?? 0.009)));
  }

  prob = 0.5 + (prob - 0.5) * multiplier;
  const noiseRange = (hs && as_) ? 6 : 10;
  const noise = hashNoise(gameId, noiseRange, Math.floor(noiseRange / 2));
  prob = Math.max(0.22, Math.min(0.82, prob + noise));

  return finalizeResult(
    gameId, sport, prob, homeWinRate, accuracyBoost, opts,
  );
}

// ── Runs/points/goals model (MLB / NFL / NHL / NCAAF / NCAAB / UFC) ───────────

function computeRunsModel(
  gameId: string,
  sport: string,
  homeRecord: string,
  awayRecord: string,
  multiplier: number,
  accuracyBoost: number,
  homeAdv: number,
  opts: ComputeOptions,
  fw: FactorWeights,
): ProjectionResult {
  const homeWL = parseWL(homeRecord);
  const awayWL = parseWL(awayRecord);
  const homeWinRate = homeWL.total > 0 ? homeWL.wins / homeWL.total : 0.5;
  const awayWinRate = awayWL.total > 0 ? awayWL.wins / awayWL.total : 0.5;

  let prob = 0.5 + homeAdv + (homeWinRate - awayWinRate) * (fw["recordWeight"] ?? 0.25);

  const hs = opts.homeDbStats;
  const as_ = opts.awayDbStats;

  if (hs && as_) {
    // Tier 1: Pythagorean quality — the single most predictive long-run signal
    prob += (hs.pythagoreanWinPct - as_.pythagoreanWinPct) * (fw["pythagoreanWeight"] ?? 0.25);
    // Tier 2: Recent form
    prob += (hs.last5WinPct - as_.last5WinPct) * (fw["formWeight"] ?? 0.10);
    prob += (hs.scoreDifferential - as_.scoreDifferential) * (fw["scoreDiffWeight"] ?? 0.010);
    // Tier 3: Rest
    const restDiff = hs.restDays - as_.restDays;
    const maxRest  = sport === "NFL" ? 0.05 : 0.03;
    prob += Math.max(-maxRest, Math.min(maxRest, restDiff * (fw["restWeight"] ?? 0.010)));
  }

  prob = 0.5 + (prob - 0.5) * multiplier;
  const noiseRange = (hs && as_) ? 7 : 10;
  const noise = hashNoise(gameId, noiseRange, Math.floor(noiseRange / 2));
  prob = Math.max(0.20, Math.min(0.82, prob + noise));

  return finalizeResult(gameId, sport, prob, homeWinRate, accuracyBoost, opts);
}

// ── Shared result finalizer (2-outcome sports) ────────────────────────────────

function finalizeResult(
  gameId: string,
  sport: string,
  prob: number,
  homeWinRate: number,
  accuracyBoost: number,
  opts: ComputeOptions,
): ProjectionResult {
  const homeWinPct = Math.round(prob * 100);
  const deviation  = Math.abs(homeWinPct - 50);

  let vegasHomeOdds: number;
  let vegasAwayOdds: number;
  let vegasImplied: number;

  if (opts.realVegasHomeOdds != null && opts.realVegasAwayOdds != null) {
    vegasHomeOdds = opts.realVegasHomeOdds;
    vegasAwayOdds = opts.realVegasAwayOdds;
    vegasImplied  = americanToImplied(vegasHomeOdds);
  } else if (opts.realVegasHomeOdds != null) {
    vegasHomeOdds = opts.realVegasHomeOdds;
    vegasImplied  = americanToImplied(vegasHomeOdds);
    vegasAwayOdds = impliedToAmerican(1 - vegasImplied);
  } else {
    const naiveProb  = 0.5 + (homeWinRate - 0.5) * 0.3;
    const vegasNoise = hashNoise(gameId + "v", 6, 3);
    const vegasProb  = Math.max(0.1, Math.min(0.9, naiveProb + vegasNoise));
    vegasHomeOdds    = impliedToAmerican(vegasProb);
    vegasAwayOdds    = impliedToAmerican(1 - vegasProb);
    vegasImplied     = americanToImplied(vegasHomeOdds);
  }

  const edge       = Math.round((prob - vegasImplied) * 1000) / 10;
  const modelScore = Math.max(40, Math.min(95, Math.round(55 + deviation + accuracyBoost)));
  const confidence = deviation >= 18 ? "High" : deviation >= 9 ? "Medium" : "Low";
  const valueRating =
    edge >= 10 ? "Strong Buy" : edge >= 5 ? "Buy" : edge <= -5 ? "Fade" : "Neutral";

  const projectedSpread = Math.round((0.5 - prob) * 20 * 2) / 2;
  const vegasSpread     = Math.round((0.5 - vegasImplied) * 20 * 2) / 2;

  const defaultTotal    = DEFAULT_TOTALS[sport] ?? 45.0;
  const projectedTotal  = opts.realVegasOverUnder ?? defaultTotal;
  const totalNoise      = hashNoise(gameId + "t", 2, 1);
  const vegasTotal      = opts.realVegasOverUnder ?? (projectedTotal + totalNoise);

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

function computeSoccerProjection(
  gameId: string,
  homeRecord: string,
  awayRecord: string,
  multiplier: number,
  accuracyBoost: number,
  opts: ComputeOptions,
  fw: FactorWeights,
): ProjectionResult {
  const homeRate = parseSoccerWinRate(homeRecord);
  const awayRate = parseSoccerWinRate(awayRecord);

  let prob = 0.42 + 0.05 + (homeRate - awayRate) * (fw["recordWeight"] ?? 0.28);

  const hs  = opts.homeSoccerStats;
  const as_ = opts.awaySoccerStats;

  if (hs && as_) {
    // Tier 1: Attack vs defence matchup
    prob += (hs.goalsPerGame - as_.goalsAllowedPerGame) * (fw["attackDefWeight"] ?? 0.08);
    prob -= (as_.goalsPerGame - hs.goalsAllowedPerGame) * (fw["attackDefWeight"] ?? 0.08);
    prob += (hs.goalDifferential - as_.goalDifferential) * (fw["goalDiffWeight"] ?? 0.05);
    // Tier 2: Recent form
    prob += (hs.last5Form - as_.last5Form) * (fw["formWeight"] ?? 0.10);
    prob += (hs.last5GoalDiff - as_.last5GoalDiff) * (fw["lastGoalDiffWeight"] ?? 0.025);
    // Tier 3: Rest
    const restDiff = hs.restDays - as_.restDays;
    prob += Math.max(-0.025, Math.min(0.025, restDiff * (fw["restWeight"] ?? 0.007)));
  }

  prob = 0.42 + (prob - 0.42) * multiplier;
  const noiseRange = (hs && as_) ? 6 : 8;
  const noise      = hashNoise(gameId, noiseRange, Math.floor(noiseRange / 2));
  prob             = Math.max(0.15, Math.min(0.75, prob + noise));

  const drawProb = Math.max(0.18, 0.30 - Math.abs(prob - 0.5) * 0.5);
  const awayProb = Math.max(0.10, 1 - prob - drawProb);
  const total    = prob + drawProb + awayProb;
  const modelHome = prob / total;
  const modelDraw = drawProb / total;

  const homeWinPct = Math.round(modelHome * 100);
  const deviation  = Math.abs(homeWinPct - 50);
  const modelScore = Math.max(40, Math.min(95, Math.round(55 + deviation + accuracyBoost)));
  const confidence = deviation >= 18 ? "High" : deviation >= 9 ? "Medium" : "Low";

  let vegasHomeOdds: number;
  let vegasAwayOdds: number;
  let vegasDrawOdds: number;
  let vegasImpliedHome: number;

  if (opts.realVegasHomeOdds != null && opts.realVegasDrawOdds != null) {
    const rawHome = americanToImplied(opts.realVegasHomeOdds);
    const rawDraw = americanToImplied(opts.realVegasDrawOdds);
    let rawAway: number;
    if (opts.realVegasAwayOdds != null) {
      rawAway = americanToImplied(opts.realVegasAwayOdds);
    } else {
      rawAway = Math.max(0.05, 1.06 - rawHome - rawDraw);
    }
    const [nvHome, ,] = removeVig3(rawHome, rawDraw, rawAway);
    vegasImpliedHome = nvHome;
    vegasHomeOdds    = opts.realVegasHomeOdds;
    vegasDrawOdds    = opts.realVegasDrawOdds;
    vegasAwayOdds    = opts.realVegasAwayOdds ?? impliedToAmerican(1 - rawHome - rawDraw);
  } else {
    const vegNoise = hashNoise(gameId + "sv", 6, 3);
    const simHome  = Math.max(0.10, Math.min(0.75, modelHome + vegNoise));
    const simDraw  = Math.max(0.10, 0.28 - vegNoise * 0.3);
    vegasHomeOdds  = impliedToAmerican(simHome);
    vegasDrawOdds  = impliedToAmerican(simDraw);
    vegasAwayOdds  = impliedToAmerican(Math.max(0.10, 1 - simHome - simDraw));
    vegasImpliedHome = simHome;
  }

  const edge = Math.round((modelHome - vegasImpliedHome) * 1000) / 10;
  const valueRating =
    edge >= 8 ? "Strong Buy" : edge >= 4 ? "Buy" : edge <= -4 ? "Fade" : "Neutral";

  const projectedSpread = Math.round((0.5 - modelHome) * 6 * 2) / 2;
  const vegasSpread     = Math.round((0.5 - vegasImpliedHome) * 6 * 2) / 2;
  const projectedTotal  = opts.realVegasOverUnder ?? DEFAULT_TOTALS["Soccer"] ?? 2.5;
  const totalNoise      = hashNoise(gameId + "t", 2, 1) * 0.5;
  const vegasTotal      = opts.realVegasOverUnder ?? (projectedTotal + totalNoise);

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
