import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  closingLinesTable,
  gameResultsTable,
  marketsTable,
  pickResultsTable,
  publishedPicksTable,
} from "@workspace/db";
import {
  gradeMoneyline,
  gradeSpread,
  gradeTotal,
  calculateClv,
  calculateUnits,
  type GradeResult,
} from "./grading";
import { runAnalytics } from "./analytics";
import { logger } from "../lib/logger";

/**
 * Process all pending pick_results rows that have a completed game_result.
 * Updates result, units, CLV, grading timestamp, and appends an audit entry.
 *
 * This function is idempotent — picks already graded (result ≠ "pending")
 * are skipped. Re-grading via override is handled by updatePickGrade().
 *
 * Returns the number of picks newly graded.
 */
export async function runGrading(): Promise<number> {
  // 1. Find all pending pick_results
  const pendingRows = await db
    .select({
      pickResultId: pickResultsTable.id,
      pickId: pickResultsTable.pickId,
      unitsRisked: pickResultsTable.unitsRisked,
    })
    .from(pickResultsTable)
    .where(eq(pickResultsTable.result, "pending"));

  if (pendingRows.length === 0) return 0;

  // 2. Load the corresponding published picks
  const pickIds = pendingRows.map((r) => r.pickId);
  const picks = await db
    .select()
    .from(publishedPicksTable)
    .where(inArray(publishedPicksTable.id, pickIds));

  if (picks.length === 0) return 0;

  const pickMap = new Map(picks.map((p) => [p.id, p]));

  // 3. Load game results for relevant games
  const gameIds = [...new Set(picks.map((p) => p.gameId))];
  const gameResults = await db
    .select()
    .from(gameResultsTable)
    .where(inArray(gameResultsTable.gameId, gameIds));

  const resultMap = new Map(gameResults.map((r) => [r.gameId, r]));
  if (resultMap.size === 0) return 0; // No completed games yet

  // 4. Load moneyline market ID for CLV lookups
  const [moneylineMarket] = await db
    .select({ id: marketsTable.id })
    .from(marketsTable)
    .where(eq(marketsTable.slug, "moneyline"))
    .limit(1);

  let graded = 0;

  for (const pendingRow of pendingRows) {
    const pick = pickMap.get(pendingRow.pickId);
    if (!pick) continue;

    const gameResult = resultMap.get(pick.gameId);
    if (!gameResult) continue; // Game not final yet

    // ── Grade the pick ────────────────────────────────────────────────────
    let grade: GradeResult = "pending";

    if (pick.market === "moneyline") {
      grade = gradeMoneyline(
        pick.selection,
        gameResult.homeScore,
        gameResult.awayScore,
      );
    } else if (pick.market === "spread" && pick.odds != null) {
      // spread stored in odds column for spread picks; fall back to 0
      grade = gradeSpread(
        pick.selection,
        0,
        gameResult.homeScore,
        gameResult.awayScore,
      );
    } else if (pick.market === "total" && pick.odds != null) {
      grade = gradeTotal(
        pick.selection,
        0,
        gameResult.homeScore,
        gameResult.awayScore,
      );
    }

    if (grade === "pending") continue; // Cannot grade yet

    // ── Calculate units ───────────────────────────────────────────────────
    const unitsWonLost = calculateUnits(
      grade,
      pendingRow.unitsRisked,
      pick.odds ?? -110,
    );

    // ── CLV lookup ────────────────────────────────────────────────────────
    let clv: number | null = null;
    if (moneylineMarket && pick.odds != null) {
      const [closingLine] = await db
        .select({ closingPrice: closingLinesTable.closingPrice })
        .from(closingLinesTable)
        .where(
          and(
            eq(closingLinesTable.gameId, pick.gameId),
            eq(closingLinesTable.marketId, moneylineMarket.id),
            eq(closingLinesTable.selection, pick.selection),
          ),
        )
        .limit(1);

      if (closingLine?.closingPrice != null) {
        clv = calculateClv(pick.odds, closingLine.closingPrice);
      }
    }

    // ── Audit entry ───────────────────────────────────────────────────────
    const auditEntry = {
      timestamp: new Date().toISOString(),
      previousResult: "pending",
      newResult: grade,
      performedBy: "auto_grader",
      reason: "ESPN final score",
    };

    // ── Update pick_results ───────────────────────────────────────────────
    await db
      .update(pickResultsTable)
      .set({
        result: grade,
        unitsWonLost: Math.round(unitsWonLost * 100) / 100,
        finalScore: `${gameResult.homeScore}-${gameResult.awayScore}`,
        clv,
        gradedAt: new Date(),
        gradingSource: "espn",
        gradeAudit: [auditEntry],
      })
      .where(eq(pickResultsTable.id, pendingRow.pickResultId));

    graded++;
  }

  if (graded > 0) {
    logger.info({ graded }, "Grading: picks graded");
    // Trigger analytics recompute after any new grades
    await runAnalytics().catch((err) =>
      logger.warn({ err }, "Analytics refresh failed after grading"),
    );
  }

  return graded;
}

/**
 * Re-grade a pick with an override and append an audit entry.
 * Never silently overwrites — always creates an audit record.
 */
export async function overridePickGrade(
  pickResultId: number,
  newResult: GradeResult,
  reason: string,
  performedBy: string,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(pickResultsTable)
    .where(eq(pickResultsTable.id, pickResultId))
    .limit(1);

  if (!existing) throw new Error(`pick_result ${pickResultId} not found`);

  const currentAudit = Array.isArray(existing.gradeAudit)
    ? (existing.gradeAudit as object[])
    : [];

  const auditEntry = {
    timestamp: new Date().toISOString(),
    previousResult: existing.result,
    newResult,
    performedBy,
    reason,
  };

  await db
    .update(pickResultsTable)
    .set({
      result: newResult,
      gradedAt: new Date(),
      gradingSource: "manual_override",
      gradeAudit: [...currentAudit, auditEntry],
    })
    .where(eq(pickResultsTable.id, pickResultId));

  logger.info(
    { pickResultId, from: existing.result, to: newResult, performedBy },
    "Pick result manually overridden",
  );
}
