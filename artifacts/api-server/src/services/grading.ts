/**
 * Pure, market-specific grading functions.
 * Each function returns a GradeResult given a selection and final scores.
 * These functions have no side effects and are fully unit-testable.
 */

export type GradeResult =
  | "win"
  | "loss"
  | "push"
  | "void"
  | "postponed"
  | "pending";

// ── Moneyline ─────────────────────────────────────────────────────────────────

/**
 * Grade a moneyline selection.
 * Ties (draws) count as push for binary markets; use soccer-3way for draw option.
 */
export function gradeMoneyline(
  selection: string,
  homeScore: number,
  awayScore: number,
): GradeResult {
  if (homeScore === awayScore) return "push";
  const homeWon = homeScore > awayScore;
  if (selection === "home") return homeWon ? "win" : "loss";
  if (selection === "away") return homeWon ? "loss" : "win";
  return "void";
}

// ── Spread / Run-line ─────────────────────────────────────────────────────────

/**
 * Grade a spread pick.
 * spread: the home team's line (e.g. -3.5 means home must win by 4+).
 */
export function gradeSpread(
  selection: string,
  spread: number,
  homeScore: number,
  awayScore: number,
): GradeResult {
  const margin = homeScore - awayScore; // positive = home won
  const coverMargin = margin + spread;  // > 0 means home covered
  if (coverMargin === 0) return "push";
  if (selection === "home") return coverMargin > 0 ? "win" : "loss";
  if (selection === "away") return coverMargin < 0 ? "win" : "loss";
  return "void";
}

// ── Totals ────────────────────────────────────────────────────────────────────

/**
 * Grade an over/under total pick.
 */
export function gradeTotal(
  selection: string,
  line: number,
  homeScore: number,
  awayScore: number,
): GradeResult {
  const total = homeScore + awayScore;
  if (total === line) return "push";
  if (selection === "over") return total > line ? "win" : "loss";
  if (selection === "under") return total < line ? "win" : "loss";
  return "void";
}

// ── First-Inning Markets (MLB) ────────────────────────────────────────────────

/**
 * Grade NRFI / YRFI.
 * Requires first-inning run totals. Returns "pending" when unavailable.
 */
export function gradeNrfiYrfi(
  selection: string,  // "nrfi" | "yrfi"
  homeF1: number | null,
  awayF1: number | null,
): GradeResult {
  if (homeF1 == null || awayF1 == null) return "pending";
  const scored = homeF1 > 0 || awayF1 > 0;
  if (selection === "nrfi") return scored ? "loss" : "win";
  if (selection === "yrfi") return scored ? "win" : "loss";
  return "void";
}

// ── Soccer 3-way ──────────────────────────────────────────────────────────────

/**
 * Grade a soccer three-way moneyline (home / draw / away).
 */
export function gradeSoccer3Way(
  selection: string,  // "home" | "draw" | "away"
  homeScore: number,
  awayScore: number,
): GradeResult {
  if (!["home", "draw", "away"].includes(selection)) return "void";
  const outcome =
    homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : "draw";
  return selection === outcome ? "win" : "loss";
}

// ── UFC Moneyline ─────────────────────────────────────────────────────────────

/** Delegates to standard moneyline grading. */
export const gradeUfcMoneyline = gradeMoneyline;

// ── Void / Postponement helpers ───────────────────────────────────────────────

/** Returns true if a game was postponed (score unavailable + status). */
export function isPostponed(status: string): boolean {
  return status === "postponed" || status === "cancelled";
}

// ── Units calculator ──────────────────────────────────────────────────────────

/**
 * Calculate units won or lost from a grade and the odds/units risked.
 */
export function calculateUnits(
  grade: GradeResult,
  unitsRisked: number,
  odds: number,
): number {
  if (grade === "win") {
    const profit =
      odds > 0
        ? unitsRisked * (odds / 100)
        : unitsRisked * (100 / Math.abs(odds));
    return Math.round(profit * 100) / 100;
  }
  if (grade === "loss") return -unitsRisked;
  return 0; // push, void, postponed
}

// ── Closing-line value ────────────────────────────────────────────────────────

/**
 * Calculate closing-line value in percentage-point implied probability terms.
 *
 * CLV = (closing implied prob − our implied prob) × 100
 *
 * Positive CLV = we got a better price than where the market closed (good).
 * Negative CLV = the market closed sharper than our entry (bad).
 *
 * We use the raw probability DIFFERENCE rather than dividing by the closing
 * probability. The division form ((close − pred) / close × 100) creates a
 * percentage CHANGE, which blows up to extreme values (±thousands) whenever
 * the closing line is on a heavy underdog with a tiny implied probability.
 * The difference form stays in the bounded range [-100, +100] percentage
 * points and is the standard metric used in CLV research.
 */
export function calculateClv(
  predictionOdds: number,
  closingOdds: number,
): number | null {
  if (!Number.isFinite(predictionOdds) || !Number.isFinite(closingOdds)
    || predictionOdds === 0 || closingOdds === 0) return null;
  const predImplied = americanToImplied(predictionOdds);
  const closeImplied = americanToImplied(closingOdds);
  if (closeImplied === 0 || predImplied === 0) return null;
  const clv = (closeImplied - predImplied) * 100;
  // Clamp to a sensible range — values outside ±50pp signal a data error
  // (e.g. a corrupted closing price), not a real edge gain/loss.
  const clamped = Math.max(-50, Math.min(50, clv));
  return Math.round(clamped * 100) / 100;
}

function americanToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}
