import type { ModelWeights, FactorWeights } from "@workspace/db";
import type { WnbaTeamStats, SoccerTeamStats, DbTeamStats } from "./teamStats";
import type { WnbaGameContext } from "./wnbaContext";
import type { NcaafFeatureSnapshotValue } from "./ncaafFeatures";

export interface ProjectionResult {
  homeWinPct: number;
  confidence: string;
  projectedSpread: number;
  projectedTotal: number;
  valueRating: string;
  modelScore: number;        // universal final rating (0–100) — replaces old deviation-based score
  edge: number;
  vegasSpread: number;
  vegasTotal: number;
  vegasHomeOdds: number;
  vegasAwayOdds: number;
  vegasDrawOdds: number;     // 0 for non-soccer; real draw ML for soccer

  // ── Phase 1: enhanced model fields ───────────────────────────────────────
  confidenceNum: number;     // 0–100 numeric confidence (converted from deviation)
  units: number;             // dynamic unit sizing (0.5 – 3.0; 0 = no bet)
  priceAdjustment: number;   // -0.6 to +0.6 price-profile bonus (plus-money favoured)
  sharpScore: number;        // 0–5 sharp signal strength
  sharpSignal: string;       // "Sharp Play" | "Value Watch" | "Neutral Signal" | "No Signal"
  finalModelScore: number;   // same as modelScore — kept separate for clarity
  finalModelTier: string;    // "Elite" | "Strong" | "Playable" | "Watchlist" | "Pass"
  finalModelStars: number;   // 1–5 stars
  podScore: number;          // cross-sport pick-of-the-day ranking score
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
  WNBA:   0.020,  // WNBA home edge reduced to ~2 pts — data shows 0.030 over-weights home advantage
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
    recordWeight:     0.28,  // slightly reduced — schedule strength not captured
    efgWeight:        0.28,  // eFG% differential — strongest per-possession signal
    toWeight:         0.22,  // turnover% (note: lower is better, applied reversed)
    orebWeight:       0.004, // offensive rebounds per game
    defWeight:        0.003, // (BLK + STL) per game
    formWeight:       0.14,  // recent form matters more in a compact WNBA schedule
    netRatingWeight:  0.012, // last-10 point diff is a better quality signal than 0.003
    restWeight:       0.022, // rest/B2B is significant on a 40-game schedule
    trueShootingWeight: 0.12,
    possessionNetRatingWeight: 0.003,
    offensiveEfficiencyWeight: 0.0015,
    defensiveEfficiencyWeight: 0.0015,
    perimeterWeight: 0.04,
    contextTurnoverWeight: 0.10,
    reboundingInteriorWeight: 0.001,
    freeThrowGenerationWeight: 0.06,
    paceInteractionWeight: 0.004,
    scheduleCompressionWeight: 0.006,
    travelWeight: 0.000006,
    availabilityWeight: 0.50,
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

/** MLB moneyline favorites at this price or shorter are always a no-bet. */
export const MLB_MAX_FAVORITE_ODDS = -160;

/** Merge stored factorWeights with sport defaults, sport defaults win for missing keys */
export function effectiveWeights(sport: string, stored: FactorWeights | null | undefined): FactorWeights {
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

function isCredibleAmericanOdds(odds: number | null | undefined): odds is number {
  return odds != null
    && Number.isFinite(odds)
    && Number.isInteger(odds)
    && Math.abs(odds) >= 100
    && Math.abs(odds) <= 2_000;
}

/** Remove two-way market vig before comparing a model probability with the price. */
export function removeVig2(homeOdds: number, awayOdds: number): { home: number; away: number } {
  const rawHome = americanToImplied(homeOdds);
  const rawAway = americanToImplied(awayOdds);
  const total = rawHome + rawAway;
  if (!Number.isFinite(total) || total <= 0) return { home: 0.5, away: 0.5 };
  return { home: rawHome / total, away: rawAway / total };
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

// ── Phase 1 helper functions ──────────────────────────────────────────────────

/**
 * 3.2 Probability calibration — trims overconfident tails.
 * Research shows models consistently overstate confidence at the extremes;
 * these deductions bring predicted probabilities closer to empirical hit rates.
 */
function calibrateModelProbability(prob: number): number {
  const pct = prob * 100;
  if (pct >= 65) return (pct - 2.0) / 100;
  if (pct >= 60) return (pct - 1.5) / 100;
  if (pct >= 55) return (pct - 1.0) / 100;
  // Mirror calibration for the away-favoured side
  if (pct <= 35) return (pct + 2.0) / 100;
  if (pct <= 40) return (pct + 1.5) / 100;
  if (pct <= 45) return (pct + 1.0) / 100;
  return prob;
}

/**
 * Convert raw deviation from 50% into a 0–100 numeric confidence score.
 * deviation=0 → 50 (coin flip), deviation=25 → 99 (near-certain).
 */
function getNumericConfidence(deviation: number): number {
  return Math.min(99, Math.round(50 + deviation * 2.0));
}

/**
 * 3.5 Price adjustment — plus-money edges are harder for oddsmakers to misprice,
 * so they carry more signal weight than equivalent minus-money edges.
 */
function getPriceAdjustment(odds: number): number {
  if (odds >= 120) return 0.6;
  if (odds >= 100) return 0.4;
  if (odds >= -110) return 0.2;
  if (odds >= -130) return 0.0;
  if (odds >= -160) return -0.3;
  return -0.6;
}

/**
 * 3.4 Dynamic unit sizing — scales bet size with conviction.
 * Returns 0 for Neutral/Fade (no bet), 0.5–3.0 for Buy/Strong Buy.
 */
function getDynamicUnits(edge: number, finalModelScore: number, valueRating: string): number {
  if (valueRating === "Fade" || valueRating === "Neutral") return 0;
  // Unit sizing is driven by the composite displayed score (finalModelScore, 0–100):
  //   ≥85 → 3.0u  |  80–84 → 2.5u  |  70–79 → 2.0u  |  <70 → 1.5u
  if (finalModelScore >= 85) return 3.0;
  if (finalModelScore >= 80) return 2.5;
  if (finalModelScore >= 70) return 2.0;
  return 1.5;
}

/**
 * 4.2 Sharp market signal — single-book version (no Pinnacle/Circa available yet).
 * Grades picks 0–5 based on edge magnitude and price profile.
 */
/**
 * Convert American odds to raw implied probability (vig not removed).
 * Used internally for sharp signal calculation only.
 */
function impliedProbFromAmerican(american: number): number {
  return american < 0
    ? Math.abs(american) / (Math.abs(american) + 100)
    : 100 / (american + 100);
}

/**
 * Phase 2 sharp market signal.
 *
 * When Pinnacle data is available (via The Odds API), measures the divergence
 * between Pinnacle's implied probability and the public-book consensus for the
 * pick side. Pinnacle accepts sharp/professional bettors and doesn't limit
 * winners — when their line differs meaningfully from public books, sharp money
 * is one side and the public is on the other.
 *
 * Divergence scale:
 *   ≥ 5pp  → Pinnacle strongly backing pick → +4 score (Sharp Play tier)
 *   ≥ 3pp  → Pinnacle backing pick          → +3 (Value Watch tier)
 *   ≥ 1pp  → Slight Pinnacle lean           → +1
 *   ≤ −3pp → Pinnacle fading pick           → −3 (major penalty)
 *   ≤ −2pp → Pinnacle slight fade           → −2
 *
 * Without Pinnacle data, falls back to the Phase 1 edge + odds scoring so the
 * signal degrades gracefully for sports/games Pinnacle doesn't cover (WNBA, etc.)
 */
function getSharpMarketSignal(
  edge: number,
  pickOdds: number,
  pinnacleHomeOdds?: number,
  pinnacleAwayOdds?: number,
  consensusHomeOdds?: number,
  consensusAwayOdds?: number,
  pickIsHome?: boolean,
): { sharpScore: number; sharpSignal: string } {
  let score = 0;

  const hasPinnacle =
    pinnacleHomeOdds != null && pinnacleAwayOdds != null &&
    consensusHomeOdds != null && consensusAwayOdds != null;

  // Use absolute edge magnitude throughout — a negative edge means the away
  // team has the advantage, which is a valid signal in the correct direction.
  const absEdge = Math.abs(edge);

  if (hasPinnacle) {
    // ── Phase 2: Pinnacle vs consensus divergence ─────────────────────────
    // Compare Pinnacle's implied probability for the pick side vs the
    // consensus market. pickIsHome selects the right odds for either direction.
    const pinnPickProb = pickIsHome
      ? impliedProbFromAmerican(pinnacleHomeOdds!)
      : impliedProbFromAmerican(pinnacleAwayOdds!);
    const consPickProb = pickIsHome
      ? impliedProbFromAmerican(consensusHomeOdds!)
      : impliedProbFromAmerican(consensusAwayOdds!);

    // Positive = Pinnacle backs pick more than public books do (sharp signal).
    const divergence = pinnPickProb - consPickProb;

    if      (divergence >= 0.05) score += 4;  // Pinnacle strongly backs pick
    else if (divergence >= 0.03) score += 3;
    else if (divergence >= 0.01) score += 1;
    else if (divergence <= -0.04) score -= 3; // Pinnacle fading the pick
    else if (divergence <= -0.02) score -= 2;

    // Secondary: large model edge (in either direction) adds confirmation
    if (absEdge >= 10) score += 1;

    // Plus-money Pinnacle lines are even more meaningful (sharps like value)
    const pinnPickOdds = pickIsHome ? pinnacleHomeOdds! : pinnacleAwayOdds!;
    if (pinnPickOdds > 0 && divergence > 0) score += 1;

  } else {
    // ── Phase 1 fallback: single-book edge + odds scoring ─────────────────
    if      (absEdge >= 8) score += 4;
    else if (absEdge >= 5) score += 3;
    else if (absEdge >= 3) score += 2;
    else if (absEdge >= 1) score += 1;

    if (pickOdds > 100)                         score += 1;  // plus-money bonus
    else if (pickOdds <= -200 && absEdge < 5)   score -= 1;  // heavy chalk penalty
  }

  const sharpSignal =
    score >= 5 ? "Sharp Play"     :
    score >= 3 ? "Value Watch"    :
    score >= 1 ? "Neutral Signal" :
    "No Signal";

  return { sharpScore: Math.max(0, score), sharpSignal };
}

/**
 * 4.10 Universal final rating — weighted 0–100 score replacing the old
 * simple deviation-from-50 modelScore.
 */
function getUniversalFinalRating(
  edge: number,
  confidenceNum: number,
  sharpScore: number,
  priceAdj: number,
): { finalModelScore: number; finalModelTier: string; finalModelStars: number } {
  let score = 50;

  // Edge (primary driver, ~40% of total).
  // Use absolute value — a strong edge on the away team is just as valuable
  // as an equivalent edge on the home team; direction is handled by pickIsHome.
  const absEdge = Math.abs(edge);
  if (absEdge >= 6) score += 18;
  else if (absEdge >= 4) score += 14;
  else if (absEdge >= 2) score += 8;
  else if (absEdge > 0) score += 3;

  // Confidence (~25%)
  if (confidenceNum >= 88) score += 10;
  else if (confidenceNum >= 80) score += 7;
  else if (confidenceNum >= 70) score += 4;
  else if (confidenceNum >= 60) score += 2;

  // Sharp signal (~20%)
  if (sharpScore >= 4) score += 8;
  else if (sharpScore >= 2) score += 4;
  else if (sharpScore <= 0 && edge < 2) score -= 4;

  // Price profile (~15%) — scale ±0.6 to ±3 pts
  score += Math.round(priceAdj * 5);

  score = Math.max(0, Math.min(100, Math.round(score)));

  let finalModelTier: string;
  let finalModelStars: number;

  if (score >= 85) { finalModelTier = "Elite";      finalModelStars = 5; }
  else if (score >= 72) { finalModelTier = "Strong"; finalModelStars = 4; }
  else if (score >= 60) { finalModelTier = "Playable"; finalModelStars = 3; }
  else if (score >= 50) { finalModelTier = "Watchlist"; finalModelStars = 2; }
  else                  { finalModelTier = "Pass";    finalModelStars = 1; }

  return { finalModelScore: score, finalModelTier, finalModelStars };
}

/**
 * 4.11 Universal POD score — cross-sport pick-of-the-day ranking.
 * Higher = better candidate for the featured pick slot.
 */
function getPodScore(finalModelScore: number, sharpScore: number, edge: number): number {
  const absEdge = Math.abs(edge);
  let score = finalModelScore * 0.40;
  score += sharpScore * 2;          // sharp signal proxy
  if (absEdge >= 6) score += 10;
  else if (absEdge >= 4) score += 6;
  else if (absEdge >= 2) score += 3;
  return Math.round(Math.max(0, score));
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
  // ── Phase 2: multi-book sharp signal ────────────────────────────────────
  /** Pinnacle moneylines — the sharpest book; divergence from consensus = sharp signal */
  pinnacleHomeOdds?: number;
  pinnacleAwayOdds?: number;
  pinnacleDrawOdds?: number;
  /** Consensus (average of US public books) moneylines */
  consensusHomeOdds?: number;
  consensusAwayOdds?: number;
  /** Line movement: did the home team's odds shorten (get more negative) since opening?
   *  undefined = first time seeing this game; no movement baseline yet */
  lineMovedTowardHome?: boolean;
  /** MLB only: probability shift from pitcher matchup advantage. Range [-0.08, +0.08].
   *  Positive = home starter has the edge. Computed by mlbPitchers service. */
  pitcherAdvantage?: number;
  /** NHL only: probability shift from goalie matchup. Range [-0.07, +0.07].
   *  Positive = home goalie has the edge. */
  goalieAdvantage?: number;
  /** NFL only: net probability shift from injury reports. Range [-0.05, +0.05].
   *  Positive = home team is healthier. */
  injuryAdvantage?: number;
  /** MLB/NFL: total-line adjustment from weather (wind, rain, temp). Applied to projectedTotal. */
  weatherTotalAdjustment?: number;
  /** Wind speed in mph — stored for display/logging but not used in win-prob calc */
  weatherWindMph?: number;
  /** Precipitation forecast in mm */
  weatherPrecipMm?: number;
  /**
   * MLB only: net probability shift from bullpen fatigue differential.
   * Positive = home bullpen is fresher. Range [-0.04, +0.04].
   * Computed by mlbBullpen service from last-3-days relief pitcher pitch counts.
   */
  bullpenAdvantage?: number;
  /**
   * MLB only: total-line adjustment from combined bullpen fatigue.
   * Tired pens give up more runs. Range [0, +1.0].
   */
  bullpenTotalAdjustment?: number;
  /**
   * MLB only: confirmed lineup quality advantage (home OPS avg − away OPS avg, scaled).
   * Only non-zero when both lineups are confirmed. Range [-0.04, +0.04].
   * Positive = home lineup stronger than away today.
   */
  lineupAdvantage?: number;
  /**
   * MLB only: park run factor for the home venue (100 = neutral, 117 = Coors).
   * Values >100 compress win probability toward 0.5 (higher variance run environment).
   * Values <100 expand win probability away from 0.5 (pitching/defense more deterministic).
   */
  parkFactor?: number;
  /**
   * MLB only: shared evidence-quality multiplier from the pregame decision
   * assessment. Missing secondary evidence compresses probability toward 50%.
   */
  mlbEvidenceMultiplier?: number;
  /** MLB only: required pregame evidence is absent, so this must remain a no-bet. */
  mlbRecommendationBlocked?: boolean;
  /** NCAAF remains subscriber no-bet; this gate also records forecast readiness. */
  ncaafRecommendationBlocked?: boolean;
  /** Market-free, immutable NCAAF challenger features from the evidence ledger. */
  ncaafFeatureSnapshot?: NcaafFeatureSnapshotValue;
  /** Exact durable feature-row identity carried into the prediction decision. */
  ncaafFeatureMetadata?: {
    snapshotId: number;
    schemaVersion: string;
    modelVersion: string;
    configHash: string;
    inputHash: string;
    dataCutoffAt: string;
    sufficientIndependentEvidence: boolean;
  };
  // ── WNBA / NBA advanced analytics (ESPN) ────────────────────────────────
  homeTeamStats?: WnbaTeamStats;
  awayTeamStats?: WnbaTeamStats;
  /** Immutable WNBA-only pregame evidence. It is never used for NBA projections. */
  wnbaContext?: WnbaGameContext;
  // ── Soccer historical stats (DB) ────────────────────────────────────────
  homeSoccerStats?: SoccerTeamStats;
  awaySoccerStats?: SoccerTeamStats;
  // ── MLB / NFL / NHL / NCAAF / NCAAB — DB-sourced run/point/goal stats ──
  homeDbStats?: DbTeamStats;
  awayDbStats?: DbTeamStats;
  // ── NFL situational signals ──────────────────────────────────────────────
  /** True when both teams are in the same division — apply edge compression */
  nflIsDivisional?: boolean;
  /** Probability shift from dome/outdoor mismatch. Positive = home advantage. Range [-0.03, +0.03] */
  nflDomeMismatch?: number;
  /** Probability shift from season turnover margin differential. Range [-0.03, +0.03] */
  nflTurnoverAdvantage?: number;
  // ── NHL special teams ────────────────────────────────────────────────────
  /** NHL home team season PP% and PK% */
  nhlHomeSpecialTeams?: { ppPct: number; pkPct: number };
  /** NHL away team season PP% and PK% */
  nhlAwaySpecialTeams?: { ppPct: number; pkPct: number };
}

// ── Factor contribution breakdown (used by learning engine) ──────────────────

export interface FactorContributions {
  [factor: string]: number; // signed prob contribution; >0 = predicts home win
}

const boundedContribution = (value: number, limit: number): number =>
  Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : 0;

/**
 * WNBA evidence is intentionally isolated from the shared NBA inputs. Every
 * returned value is bounded and uses zero when its underlying evidence is
 * absent, so an unavailable feed cannot become an inferred signal.
 */
export function computeWnbaContextContributions(
  context: WnbaGameContext | undefined,
  fw: FactorWeights,
): FactorContributions {
  const zeroes: FactorContributions = {
    trueShooting: 0, possessionNetRating: 0, offensiveEfficiency: 0,
    defensiveEfficiency: 0, perimeter: 0, contextTurnover: 0,
    reboundingInterior: 0, freeThrowGeneration: 0, paceInteraction: 0,
    scheduleCompression: 0, travel: 0, availability: 0,
  };
  if (!context) return zeroes;

  const hs = context.home.stats;
  const as_ = context.away.stats;
  const pair = (key: keyof WnbaGameContext["matchup"]) => {
    const value = context.matchup[key];
    return value.missing || value.home == null || value.away == null
      ? null : [value.home, value.away] as const;
  };
  const both = <T extends number>(home: T | undefined, away: T | undefined) =>
    Number.isFinite(home) && Number.isFinite(away) ? [home!, away!] as const : null;
  const ts = both(hs?.trueShootingPercent, as_?.trueShootingPercent);
  const net = both(hs?.netRating, as_?.netRating);
  const offensive = both(hs?.offensiveRating, as_?.offensiveRating);
  const defensive = both(hs?.defensiveRating, as_?.defensiveRating);
  const perimeter = pair("perimeter");
  const perimeterShooting = both(hs?.threePointPct, as_?.threePointPct);
  const turnover = pair("turnover");
  const interior = pair("reboundingInteriorProxy");
  const freeThrow = pair("freeThrow");
  const pace = pair("pace");

  zeroes.trueShooting = ts ? boundedContribution((ts[0] - ts[1]) * (fw["trueShootingWeight"] ?? 0), .02) : 0;
  zeroes.possessionNetRating = net ? boundedContribution((net[0] - net[1]) * (fw["possessionNetRatingWeight"] ?? 0), .02) : 0;
  zeroes.offensiveEfficiency = offensive ? boundedContribution((offensive[0] - offensive[1]) * (fw["offensiveEfficiencyWeight"] ?? 0), .015) : 0;
  zeroes.defensiveEfficiency = defensive ? boundedContribution((defensive[1] - defensive[0]) * (fw["defensiveEfficiencyWeight"] ?? 0), .015) : 0;
  zeroes.perimeter = perimeter && perimeterShooting
    ? boundedContribution((((perimeter[0] - perimeter[1]) + (perimeterShooting[0] - perimeterShooting[1])) / 2) * (fw["perimeterWeight"] ?? 0), .015)
    : 0;
  zeroes.contextTurnover = turnover ? boundedContribution((turnover[1] - turnover[0]) * (fw["contextTurnoverWeight"] ?? 0), .015) : 0;
  zeroes.reboundingInterior = interior ? boundedContribution((interior[0] - interior[1]) * (fw["reboundingInteriorWeight"] ?? 0), .015) : 0;
  zeroes.freeThrowGeneration = freeThrow ? boundedContribution((freeThrow[0] - freeThrow[1]) * (fw["freeThrowGenerationWeight"] ?? 0), .015) : 0;
  // Pace only matters when combined with a known possession-quality edge.
  zeroes.paceInteraction = pace && net
    ? boundedContribution(((pace[0] - pace[1]) / 10) * ((net[0] - net[1]) / 10) * (fw["paceInteractionWeight"] ?? 0), .01)
    : 0;

  const compression = (schedule: WnbaGameContext["home"]["schedule"]) => {
    if (schedule.backToBack == null || schedule.gamesLast3Days == null || schedule.gamesLast5Days == null) return null;
    return (schedule.backToBack ? 1 : 0) + Math.max(0, schedule.gamesLast3Days - 1) + Math.max(0, schedule.gamesLast5Days - 2) * .5;
  };
  const homeCompression = compression(context.home.schedule);
  const awayCompression = compression(context.away.schedule);
  zeroes.scheduleCompression = homeCompression != null && awayCompression != null
    ? boundedContribution((awayCompression - homeCompression) * (fw["scheduleCompressionWeight"] ?? 0), .02) : 0;
  const travelBurden = (schedule: WnbaGameContext["home"]["schedule"]) =>
    schedule.travelMiles != null && schedule.timezoneShiftHours != null
      ? schedule.travelMiles + Math.abs(schedule.timezoneShiftHours) * 250 : null;
  const homeTravel = travelBurden(context.home.schedule);
  const awayTravel = travelBurden(context.away.schedule);
  zeroes.travel = homeTravel != null && awayTravel != null
    ? boundedContribution((awayTravel - homeTravel) * (fw["travelWeight"] ?? 0), .02) : 0;
  const homeAvailability = context.home.availability?.impactScore;
  const awayAvailability = context.away.availability?.impactScore;
  zeroes.availability = Number.isFinite(homeAvailability) && Number.isFinite(awayAvailability)
    ? boundedContribution((homeAvailability! - awayAvailability!) * (fw["availabilityWeight"] ?? 0), .035) : 0;
  return zeroes;
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
      const hasWnbaEvidence = (...signals: string[]) =>
        sport !== "WNBA" ||
        ((!hs.evidence || signals.every((signal) => !hs.evidence!.missing.includes(signal))) &&
         (!as_.evidence || signals.every((signal) => !as_.evidence!.missing.includes(signal))));
      contributions["efg"] = hasWnbaEvidence("shootingEfficiency")
        ? (hs.efgPercent - as_.efgPercent) * (fw["efgWeight"] ?? 0.28) : 0;
      contributions["to"] = hasWnbaEvidence("avgTurnovers", "fieldGoalAttempts")
        ? (as_.turnoverPercent - hs.turnoverPercent) * (fw["toWeight"] ?? 0.22) : 0;
      contributions["oreb"] = hasWnbaEvidence("avgOffensiveRebounds")
        ? (hs.orebPg - as_.orebPg) * (fw["orebWeight"] ?? 0.004) : 0;
      contributions["def"] = hasWnbaEvidence("avgBlocks", "avgSteals")
        ? ((hs.bpg + hs.spg) - (as_.bpg + as_.spg)) * (fw["defWeight"] ?? 0.003) : 0;
      contributions["form"] = hasWnbaEvidence("schedule", "completedGames")
        ? (hs.last5WinPct - as_.last5WinPct) * (fw["formWeight"] ?? 0.12) : 0;
      contributions["netRating"] = hasWnbaEvidence("schedule", "completedGames")
        ? (hs.last10PointDiff - as_.last10PointDiff) * (fw["netRatingWeight"] ?? 0.003) : 0;
      const restDiff = hs.restDays - as_.restDays;
      contributions["rest"] = hasWnbaEvidence("schedule", "completedGames")
        ? Math.max(-0.035, Math.min(0.035, restDiff * (fw["restWeight"] ?? 0.009))) : 0;
    }
    if (sport === "WNBA") Object.assign(contributions, computeWnbaContextContributions(opts.wnbaContext, fw));
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
  const projectionOptions =
    sport === "NCAAF"
      ? {
          ...opts,
          ncaafRecommendationBlocked:
            opts.ncaafRecommendationBlocked
            ?? !(opts.homeDbStats && opts.awayDbStats),
        }
      : opts;

  // ── Soccer: 3-outcome model ────────────────────────────────────────────────
  if (sport === "Soccer") {
    return computeSoccerProjection(gameId, homeRecord, awayRecord, multiplier, accuracyBoost, projectionOptions, fw);
  }

  // ── WNBA / NBA: advanced efficiency model ─────────────────────────────────
  if (sport === "WNBA" || sport === "NBA") {
    return computeBasketballProjection(
      gameId, sport, homeRecord, awayRecord, multiplier, accuracyBoost, homeAdv, projectionOptions, fw,
    );
  }

  // ── MLB / NFL / NHL / NCAAF / NCAAB / UFC: DB-sourced model ─────────────
  return computeRunsModel(
    gameId, sport, homeRecord, awayRecord, multiplier, accuracyBoost, homeAdv, projectionOptions, fw,
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

  if (sport === "WNBA") {
    prob = 0.5 + homeAdv + Object.values(
      computeFactorContributions(sport, homeRecord, awayRecord, opts, fw),
    ).reduce((sum, contribution) => sum + contribution, 0);
    if (!opts.wnbaContext && opts.injuryAdvantage != null) prob += opts.injuryAdvantage;
    prob = 0.5 + (prob - 0.5) * multiplier;
    const noiseRange = (hs && as_) ? 6 : 10;
    prob = Math.max(0.22, Math.min(0.82, prob + hashNoise(gameId, noiseRange, Math.floor(noiseRange / 2))));
    return finalizeResult(gameId, sport, prob, homeWinRate, accuracyBoost, opts);
  }

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

    // Back-to-back penalty: explicit –3 % for teams on zero/one day rest.
    // The weight-based restDiff only captures relative rest; this captures the
    // absolute fatigue hit of playing on consecutive days (material in WNBA/NBA).
    const b2bPenalty = 0.020;
    if (hs.restDays <= 1)  prob -= b2bPenalty;  // home team on B2B — hurts home
    if (as_.restDays <= 1) prob += b2bPenalty;  // away team on B2B — hurts away = helps home
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

  // MLB pitcher adjustment — the single most impactful individual-game variable.
  // Applied after team-level stats so it layers on top of roster quality signals.
  if (sport === "MLB" && opts.pitcherAdvantage != null) {
    prob += opts.pitcherAdvantage;
  }

  // MLB bullpen fatigue adjustment — secondary to starter, but meaningful in close games.
  // A fresh bullpen vs. a taxed one creates a real 6th-9th inning edge.
  if (sport === "MLB" && opts.bullpenAdvantage != null) {
    prob += opts.bullpenAdvantage;
  }

  // MLB lineup quality — confirmed OPS-weighted batting order advantage.
  // Only applied when both lineups are confirmed; otherwise zero (falls back to
  // team-average quality signals from Pythagorean / run-differential).
  if (sport === "MLB" && opts.lineupAdvantage != null) {
    prob += opts.lineupAdvantage;
  }

  // MLB park factor — adjusts win probability for the run environment of the venue.
  // Hitter's parks (Coors: 117) increase variance → compress toward 0.5.
  // Pitcher's parks (Petco: 92) reduce variance → expand away from 0.5.
  // Effect is intentionally subtle (max ±2pp at the extremes).
  if (sport === "MLB" && opts.parkFactor != null) {
    const parkEffect = (opts.parkFactor - 100) / 100;
    prob = 0.5 + (prob - 0.5) * (1 - parkEffect * 0.15);
  }

  // NHL goalie adjustment — save% drives more variance than team quality in hockey.
  if (sport === "NHL" && opts.goalieAdvantage != null) {
    prob += opts.goalieAdvantage;
  }

  // NFL injury adjustment — missing starters (especially QB) materially shifts win prob.
  if (sport === "NFL" && opts.injuryAdvantage != null) {
    prob += opts.injuryAdvantage;
  }

  // NHL special teams (PP%, PK%) — season-level advantage layered on top of goalie signal.
  // A 5 pp PP% gap (22% vs 17%) ≈ +2 pp win probability.
  if (sport === "NHL" && opts.nhlHomeSpecialTeams != null && opts.nhlAwaySpecialTeams != null) {
    const ppAdv = opts.nhlHomeSpecialTeams.ppPct - opts.nhlAwaySpecialTeams.ppPct;
    const pkAdv = opts.nhlHomeSpecialTeams.pkPct - opts.nhlAwaySpecialTeams.pkPct;
    prob += Math.max(-0.04, Math.min(0.04, ppAdv * 0.40 + pkAdv * 0.20));
  }

  // NFL situational adjustments — applied after injury and before calibration
  if (sport === "NFL") {
    // Divisional matchups historically play 3-4 pts tighter than the model projects —
    // coaches know each other well, tendencies are mapped. Compress edge by 8%.
    if (opts.nflIsDivisional) {
      prob = 0.5 + (prob - 0.5) * 0.92;
    }
    // Dome/outdoor mismatch: away dome team playing outdoors takes a penalty
    if (opts.nflDomeMismatch != null) {
      prob += opts.nflDomeMismatch;
    }
    // Season turnover margin differential — TO margin is the #1 per-game NFL predictor.
    // Teams with +3 or better margin win ~75% of games.
    if (opts.nflTurnoverAdvantage != null) {
      prob += opts.nflTurnoverAdvantage;
    }
  }

  prob = 0.5 + (prob - 0.5) * multiplier;
  if (sport === "MLB" && opts.mlbEvidenceMultiplier != null) {
    const evidenceMultiplier = Math.max(0.55, Math.min(1, opts.mlbEvidenceMultiplier));
    prob = 0.5 + (prob - 0.5) * evidenceMultiplier;
  }
  const noiseRange = (hs && as_) ? 7 : 10;
  const noise = hashNoise(gameId, noiseRange, Math.floor(noiseRange / 2));
  prob = Math.max(0.20, Math.min(0.82, prob + noise));

  // NCAAF's challenger probability replaces the legacy runs model immediately
  // before common finalization. No record, DB-stat, market, learned multiplier,
  // or hash-noise input may alter this market-free feature forecast.
  if (sport === "NCAAF" && opts.ncaafFeatureSnapshot?.forecast.status === "ready") {
    prob = opts.ncaafFeatureSnapshot.forecast.homeWinProbability!;
  }

  return finalizeResult(gameId, sport, prob, homeWinRate, accuracyBoost, opts);
}

// ── Shared result finalizer (2-outcome sports) ────────────────────────────────

function finalizeResult(
  gameId: string,
  sport: string,
  rawProb: number,
  homeWinRate: number,
  accuracyBoost: number,
  opts: ComputeOptions,
): ProjectionResult {
  // 3.2: Apply probability calibration before computing edge
  const prob = calibrateModelProbability(rawProb);

  const homeWinPct = Math.round(prob * 100);
  const deviation  = Math.abs(homeWinPct - 50);

  let vegasHomeOdds: number;
  let vegasAwayOdds: number;
  let vegasHomeFairProbability: number;

  const verifiedMoneylineMarket =
    isCredibleAmericanOdds(opts.realVegasHomeOdds)
    && isCredibleAmericanOdds(opts.realVegasAwayOdds);
  const hasVerifiedMoneylineMarket = verifiedMoneylineMarket;

  if (
    verifiedMoneylineMarket
    && isCredibleAmericanOdds(opts.realVegasHomeOdds)
    && isCredibleAmericanOdds(opts.realVegasAwayOdds)
  ) {
    vegasHomeOdds = opts.realVegasHomeOdds;
    vegasAwayOdds = opts.realVegasAwayOdds;
    const fairMarket = removeVig2(vegasHomeOdds, vegasAwayOdds);
    vegasHomeFairProbability = fairMarket.home;
  } else {
    // Keep the numeric response shape backward-compatible for existing clients,
    // but never treat a one-sided or missing market as a priced betting market.
    const naiveProb  = 0.5 + (homeWinRate - 0.5) * 0.3;
    const vegasNoise = hashNoise(gameId + "v", 6, 3);
    const vegasProb  = Math.max(0.1, Math.min(0.9, naiveProb + vegasNoise));
    vegasHomeOdds    = impliedToAmerican(vegasProb);
    vegasAwayOdds    = impliedToAmerican(1 - vegasProb);
    vegasHomeFairProbability = vegasProb;
  }

  // Edge is always stored from the home perspective. For an away pick the
  // magnitude therefore represents away model probability minus away fair price.
  const edge = Math.round((prob - vegasHomeFairProbability) * 1000) / 10;

  // ── Vegas spread anchor (WNBA) ──────────────────────────────────────────────
  // When the model's projected spread diverges from Vegas by more than 5 points,
  // treat Vegas as more informed and cap the effective edge. This prevents
  // "Strong Buy" on games where we and Vegas have fundamentally different reads.
  const projSprdForAnchor = Math.round((0.5 - prob) * 20 * 2) / 2;
  const vgSprdForAnchor   = Math.round((0.5 - vegasHomeFairProbability) * 20 * 2) / 2;
  const spreadGap         = Math.abs(projSprdForAnchor - vgSprdForAnchor);
  // For WNBA, cap edge at +8 when spread gap ≥ 5 (stays Buy at most, never Strong Buy)
  // and at +5 when gap ≥ 8 (floor is Neutral boundary — don't recommend marginal plays)
  const anchoredEdge =
    sport === "WNBA" && spreadGap >= 8 ? Math.sign(edge) * Math.min(Math.abs(edge), 5) :
    sport === "WNBA" && spreadGap >= 5 ? Math.sign(edge) * Math.min(Math.abs(edge), 8) :
    edge;

  const confidence = deviation >= 18 ? "High" : deviation >= 9 ? "Medium" : "Low";

  // MLB remains selective, but the full pitcher/lineup/bullpen/weather foundation
  // now supports a wider actionable band. The hard evidence gate below continues
  // to reject incomplete starters or invalid pregame moneylines.
  // WNBA keeps its existing threshold while the home-advantage recalibration settles.
  const strongBuyThreshold = sport === "MLB" ? 12 : (sport === "WNBA" ? 12 : 10);
  const buyThreshold        = sport === "MLB" ? 7  : (sport === "WNBA" ? 8  : 5);

  // Away picks require a higher bar than home picks.
  // The model was calibrated on home team probabilities; away edges are less proven
  // and need a larger margin before committing subscribers' units. UFC fights are at
  // neutral venues — there is no meaningful home/away distinction, so away flip is
  // disabled entirely for UFC.
  const isAwayPick = anchoredEdge < 0;
  const awayOffset =
    sport === "UFC"  ? Infinity :          // never flip for UFC
    sport === "MLB"  ? 3 :
    sport === "WNBA" ? 5 : 3;
  const effectiveStrongBuyThreshold = isAwayPick
    ? strongBuyThreshold + awayOffset
    : strongBuyThreshold;
  const effectiveBuyThreshold = isAwayPick
    ? buyThreshold + awayOffset
    : buyThreshold;

  // Rate based on absolute edge magnitude — direction is captured by pickIsHome below.
  // Fade is retired: anything below the effective buy threshold in either direction
  // is simply Neutral (no actionable edge for subscribers).
  const absAnchoredEdge = Math.abs(anchoredEdge);
  let valueRating =
    absAnchoredEdge >= effectiveStrongBuyThreshold ? "Strong Buy" :
    absAnchoredEdge >= effectiveBuyThreshold       ? "Buy"        : "Neutral";

  // A moneyline recommendation requires one complete, credible pregame market.
  // Without it, any model/market edge is unverifiable and must stay a no-bet.
  if (!hasVerifiedMoneylineMarket) {
    valueRating = "Neutral";
  }
  if (sport === "MLB" && opts.mlbRecommendationBlocked) {
    valueRating = "Neutral";
  }
  // Promotion is intentionally not authorized: all subscriber-facing NCAAF
  // recommendations and stakes remain Neutral/zero while challenger forecasts
  // can still be captured and evaluated.
  if (sport === "NCAAF") {
    valueRating = "Neutral";
  }

  // ── Phase 1: enhanced scoring ─────────────────────────────────────────────

  // Determine the pick-side odds for price adjustment (home if edge > 0, else away)
  const pickIsHome = anchoredEdge >= 0;
  const pickOdds   = pickIsHome ? vegasHomeOdds : vegasAwayOdds;

  // MLB uses its approved -160 ceiling. This export is also used by the
  // immutable policy-revision path so a later refresh cannot bypass the cap.
  const MONEYLINE_CAP = sport === "MLB" ? MLB_MAX_FAVORITE_ODDS : -160;
  if ((valueRating === "Strong Buy" || valueRating === "Buy") && pickOdds <= MONEYLINE_CAP) {
    valueRating = "Neutral";
  }

  // Strong Buy requires High confidence — the model needs both a large edge AND
  // a decisive probability signal to justify maximum stake sizing. Medium confidence
  // Strong Buys went 0-5 last week with catastrophic CLV; cap them at Buy.
  if (valueRating === "Strong Buy" && confidence !== "High") {
    valueRating = "Buy";
  }
  const priceAdj   = getPriceAdjustment(pickOdds);

  const confidenceNum = getNumericConfidence(deviation);
  const { sharpScore, sharpSignal } = getSharpMarketSignal(
    anchoredEdge,
    pickOdds,
    opts.pinnacleHomeOdds,
    opts.pinnacleAwayOdds,
    opts.consensusHomeOdds,
    opts.consensusAwayOdds,
    pickIsHome,
  );

  // Line movement confirmation: if the market moved toward our pick since the
  // opening line, sharp/informed money has already validated the direction.
  // Moves away from the pick are a warning sign — adjust sharp score accordingly.
  const lineMoveConfirms =
    opts.lineMovedTowardHome != null
      ? (pickIsHome ? opts.lineMovedTowardHome : !opts.lineMovedTowardHome)
      : null;
  const effectiveSharpScore =
    lineMoveConfirms === true  ? Math.min(10, sharpScore + 1) :
    lineMoveConfirms === false ? Math.max(0,  sharpScore - 1) :
    sharpScore;

  let { finalModelScore, finalModelTier, finalModelStars } =
    getUniversalFinalRating(anchoredEdge, confidenceNum, effectiveSharpScore, priceAdj);

  // Score/tier are subscriber-facing conviction signals. If a quality gate
  // rejects the wager, do not present a premium-looking score for a no-bet.
  if (valueRating === "Neutral") {
    finalModelScore = Math.min(finalModelScore, 59);
    finalModelTier = finalModelScore >= 50 ? "Watchlist" : "Pass";
    finalModelStars = finalModelScore >= 50 ? 2 : 1;
  }

  const podScore = valueRating === "Neutral"
    ? 0
    : getPodScore(finalModelScore, effectiveSharpScore, anchoredEdge);
  const units    = getDynamicUnits(anchoredEdge, finalModelScore, valueRating);

  // modelScore is now the universal final rating (backward-compat field name)
  const modelScore = finalModelScore;

  const projectedSpread = Math.round((0.5 - prob) * 20 * 2) / 2;
  const vegasSpread     = Math.round((0.5 - vegasHomeFairProbability) * 20 * 2) / 2;

  const defaultTotal   = DEFAULT_TOTALS[sport] ?? 45.0;
  const baseTotal      = opts.realVegasOverUnder ?? defaultTotal;
  // Weather adjustment shifts our projected total without touching the market line.
  // A -1.5 weather adjustment on a 9.0 total means we project 7.5 runs — if the
  // market hasn't moved, that gap IS the edge on the under.
  const weatherAdj     = opts.weatherTotalAdjustment ?? 0;
  const projectedTotal = Math.round((baseTotal + weatherAdj) * 10) / 10;
  const totalNoise     = hashNoise(gameId + "t", 2, 1);
  const vegasTotal     = opts.realVegasOverUnder ?? (baseTotal + totalNoise);

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
    // Phase 1
    confidenceNum,
    units,
    priceAdjustment: priceAdj,
    sharpScore,
    sharpSignal,
    finalModelScore,
    finalModelTier,
    finalModelStars,
    podScore,
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

  let rawProb = 0.42 + 0.05 + (homeRate - awayRate) * (fw["recordWeight"] ?? 0.28);

  const hs  = opts.homeSoccerStats;
  const as_ = opts.awaySoccerStats;

  if (hs && as_) {
    // Tier 1: Attack vs defence matchup
    rawProb += (hs.goalsPerGame - as_.goalsAllowedPerGame) * (fw["attackDefWeight"] ?? 0.08);
    rawProb -= (as_.goalsPerGame - hs.goalsAllowedPerGame) * (fw["attackDefWeight"] ?? 0.08);
    rawProb += (hs.goalDifferential - as_.goalDifferential) * (fw["goalDiffWeight"] ?? 0.05);
    // Tier 2: Recent form
    rawProb += (hs.last5Form - as_.last5Form) * (fw["formWeight"] ?? 0.10);
    rawProb += (hs.last5GoalDiff - as_.last5GoalDiff) * (fw["lastGoalDiffWeight"] ?? 0.025);
    // Tier 3: Rest
    const restDiff = hs.restDays - as_.restDays;
    rawProb += Math.max(-0.025, Math.min(0.025, restDiff * (fw["restWeight"] ?? 0.007)));
  }

  rawProb = 0.42 + (rawProb - 0.42) * multiplier;
  const noiseRange = (hs && as_) ? 6 : 8;
  const noise      = hashNoise(gameId, noiseRange, Math.floor(noiseRange / 2));
  rawProb          = Math.max(0.15, Math.min(0.75, rawProb + noise));

  // 3.2: Apply calibration to the home-win probability
  const prob = calibrateModelProbability(rawProb);

  const drawProb = Math.max(0.18, 0.30 - Math.abs(prob - 0.5) * 0.5);
  const awayProb = Math.max(0.10, 1 - prob - drawProb);
  const total    = prob + drawProb + awayProb;
  const modelHome = prob / total;
  const modelDraw = drawProb / total;

  const homeWinPct = Math.round(modelHome * 100);
  const deviation  = Math.abs(homeWinPct - 50);
  const confidence = deviation >= 18 ? "High" : deviation >= 9 ? "Medium" : "Low";

  let vegasHomeOdds: number;
  let vegasAwayOdds: number;
  let vegasDrawOdds: number;
  let vegasImpliedHome: number;

  const verifiedSoccerMarket =
    isCredibleAmericanOdds(opts.realVegasHomeOdds)
    && isCredibleAmericanOdds(opts.realVegasAwayOdds)
    && isCredibleAmericanOdds(opts.realVegasDrawOdds)
      ? {
          homeOdds: opts.realVegasHomeOdds,
          awayOdds: opts.realVegasAwayOdds,
          drawOdds: opts.realVegasDrawOdds,
        }
      : null;
  const hasVerifiedSoccerMarket = verifiedSoccerMarket != null;

  if (verifiedSoccerMarket) {
    const rawHome = americanToImplied(verifiedSoccerMarket.homeOdds);
    const rawDraw = americanToImplied(verifiedSoccerMarket.drawOdds);
    const rawAway = americanToImplied(verifiedSoccerMarket.awayOdds);
    const [nvHome, ,] = removeVig3(rawHome, rawDraw, rawAway);
    vegasImpliedHome = nvHome;
    vegasHomeOdds    = verifiedSoccerMarket.homeOdds;
    vegasDrawOdds    = verifiedSoccerMarket.drawOdds;
    vegasAwayOdds    = verifiedSoccerMarket.awayOdds;
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

  // ── Phase 1: enhanced scoring ─────────────────────────────────────────────
  const pickOdds = edge >= 0 ? vegasHomeOdds : vegasAwayOdds;

  // Apply the same -160 moneyline cap as all other sports.
  let soccerValueRating = valueRating;
  if (!hasVerifiedSoccerMarket) {
    soccerValueRating = "Neutral";
  }
  if ((soccerValueRating === "Strong Buy" || soccerValueRating === "Buy") && pickOdds <= -160) {
    soccerValueRating = "Neutral";
  }

  // Strong Buy requires High confidence — same rule as all other sports.
  if (soccerValueRating === "Strong Buy" && confidence !== "High") {
    soccerValueRating = "Buy";
  }

  const priceAdj = getPriceAdjustment(pickOdds);

  const confidenceNum = getNumericConfidence(deviation);
  const { sharpScore, sharpSignal } = getSharpMarketSignal(edge, pickOdds);
  let { finalModelScore, finalModelTier, finalModelStars } =
    getUniversalFinalRating(edge, confidenceNum, sharpScore, priceAdj);
  if (soccerValueRating === "Neutral") {
    finalModelScore = Math.min(finalModelScore, 59);
    finalModelTier = finalModelScore >= 50 ? "Watchlist" : "Pass";
    finalModelStars = finalModelScore >= 50 ? 2 : 1;
  }
  const podScore = soccerValueRating === "Neutral"
    ? 0
    : getPodScore(finalModelScore, sharpScore, edge);
  const units    = getDynamicUnits(edge, finalModelScore, soccerValueRating);

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
    valueRating: soccerValueRating,
    modelScore: finalModelScore,
    edge,
    vegasSpread,
    vegasTotal,
    vegasHomeOdds,
    vegasAwayOdds,
    vegasDrawOdds,
    // Phase 1
    confidenceNum,
    units,
    priceAdjustment: priceAdj,
    sharpScore,
    sharpSignal,
    finalModelScore,
    finalModelTier,
    finalModelStars,
    podScore,
  };
}
