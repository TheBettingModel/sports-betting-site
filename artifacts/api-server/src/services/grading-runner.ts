import { and, eq, inArray, lt, ne } from "drizzle-orm";
import {
  db,
  closingLinesTable,
  gameResultsTable,
  gamesTable,
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
import { fetchSportGamesByDate, SOCCER_SPORT_KEYS } from "./espn";
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
 * Backfill game results for any game stuck in "live" or "upcoming" status
 * from a past date. This handles the case where the grading job didn't catch
 * a game going final before it fell off the ESPN current-day scoreboard feed.
 *
 * Returns the number of game_results newly written.
 */
export async function recoverStaleGames(): Promise<number> {
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

  // Find games stuck in non-final status from past dates
  const staleGames = await db
    .select({
      id:      gamesTable.id,
      sport:   gamesTable.sport,
      gameDate: gamesTable.gameDate,
      status:  gamesTable.status,
    })
    .from(gamesTable)
    .where(
      and(
        ne(gamesTable.status, "final"),
        lt(gamesTable.gameDate, todayStr),
      ),
    );

  if (staleGames.length === 0) return 0;

  logger.info(
    { count: staleGames.length },
    "Stale game recovery: found games to check",
  );

  // Group by (sport, gameDate) to minimise ESPN API calls
  const pairs = new Map<string, { sport: string; gameDate: string }>();
  for (const g of staleGames) {
    pairs.set(`${g.sport}|${g.gameDate}`, { sport: g.sport, gameDate: g.gameDate });
  }

  const staleIds = new Set(staleGames.map((g) => g.id));
  let recovered = 0;

  for (const { sport, gameDate } of pairs.values()) {
    const yyyymmdd = gameDate.replace(/-/g, "");

    // Soccer uses several sport-keys — try all of them and deduplicate
    const sportKeys =
      sport === "Soccer"
        ? SOCCER_SPORT_KEYS
        : [sport]; // for all other sports the key equals the sport name

    const seen = new Set<string>();
    for (const key of sportKeys) {
      const espnGames = await fetchSportGamesByDate(key, yyyymmdd);
      for (const eg of espnGames) {
        if (seen.has(eg.espnId) || !staleIds.has(eg.espnId)) continue;
        if (eg.status !== "final") continue;
        if (eg.homeScore === undefined || eg.awayScore === undefined) continue;

        seen.add(eg.espnId);

        // Check whether a game_result already exists (idempotent)
        const [existing] = await db
          .select({ id: gameResultsTable.id })
          .from(gameResultsTable)
          .where(eq(gameResultsTable.gameId, eg.espnId))
          .limit(1);

        if (existing) {
          // Result already written — just update the games table status
          await db
            .update(gamesTable)
            .set({ status: "final" })
            .where(eq(gamesTable.id, eg.espnId));
          continue;
        }

        const homeWon = eg.homeScore > eg.awayScore;
        await db.insert(gameResultsTable).values({
          gameId:        eg.espnId,
          homeScore:     eg.homeScore,
          awayScore:     eg.awayScore,
          homeTeamWon:   homeWon,
          gradedAt:      new Date(),
          gradingSource: "espn_recovery",
        });

        // Sync the games table status too
        await db
          .update(gamesTable)
          .set({ status: "final" })
          .where(eq(gamesTable.id, eg.espnId));

        recovered++;
        logger.info(
          { gameId: eg.espnId, sport, homeScore: eg.homeScore, awayScore: eg.awayScore },
          "Stale game recovered",
        );
      }
    }
  }

  logger.info({ recovered }, "Stale game recovery complete");
  return recovered;
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
