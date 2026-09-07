import { and, eq, inArray, isNotNull, lt, ne, not } from "drizzle-orm";
import {
  db,
  closingLinesTable,
  gameResultsTable,
  gamesTable,
  marketsTable,
  modelPredictionsTable,
  pickResultsTable,
  publishedPicksTable,
} from "@workspace/db";
import {
  gradeMoneyline,
  gradeSpread,
  gradeTotal,
  gradeSoccer3Way,
  calculateClv,
  calculateUnits,
  type GradeResult,
} from "./grading";
import { fetchSportGamesByDate, SOCCER_SPORT_KEYS } from "./espn";
import { runAnalytics } from "./analytics";
import { logger } from "../lib/logger";
import {
  publishedPickEffectivenessLock,
  publishedPickEffectivenessWriterLock,
} from "./publishedPickReconciliation";
import { isPerformanceEligiblePublishedPickSql } from "./legacyNcaafIntegrity";

/**
 * Process all effective pending pick_results rows that have a completed game_result.
 * Updates result, units, CLV, grading timestamp, and appends an audit entry.
 *
 * This function is idempotent — picks already settled (including pregame
 * policy-superseded rows marked `void`) are skipped. Re-grading via override
 * is handled by updatePickGrade().
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
    .innerJoin(publishedPicksTable, eq(pickResultsTable.pickId, publishedPicksTable.id))
    .where(and(
      eq(pickResultsTable.result, "pending"),
      eq(publishedPicksTable.isEffective, true),
      isPerformanceEligiblePublishedPickSql(publishedPicksTable.id),
    ));

  if (pendingRows.length === 0) return 0;

  // 2. Load the corresponding published picks
  const pickIds = pendingRows.map((r) => r.pickId);
  const picks = await db
    .select()
    .from(publishedPicksTable)
    .where(inArray(publishedPicksTable.id, pickIds));

  if (picks.length === 0) return 0;

  const pickMap = new Map(picks.map((p) => [p.id, p]));

  // Market lines live in the immutable prediction snapshot. Never grade a
  // spread or total against the latest mutable games row.
  const predictionIds = picks.map((pick) => pick.predictionId);
  const predictionRows = predictionIds.length > 0
    ? await db
        .select({
          id: modelPredictionsTable.id,
          featureSnapshot: modelPredictionsTable.featureSnapshot,
        })
        .from(modelPredictionsTable)
        .where(inArray(modelPredictionsTable.id, predictionIds))
    : [];
  const predictionMap = new Map(predictionRows.map((row) => [row.id, row]));

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
    const snapshot = predictionMap.get(pick.predictionId)?.featureSnapshot as Record<string, unknown> | undefined;

    if (pick.market === "moneyline") {
      grade = pick.sport === "Soccer"
        ? gradeSoccer3Way(pick.selection, gameResult.homeScore, gameResult.awayScore)
        : gradeMoneyline(pick.selection, gameResult.homeScore, gameResult.awayScore);
    } else if (pick.market === "spread") {
      const spread = snapshot?.vegasSpread;
      if (typeof spread !== "number") continue;
      grade = gradeSpread(
        pick.selection,
        spread,
        gameResult.homeScore,
        gameResult.awayScore,
      );
    } else if (pick.market === "total") {
      const total = snapshot?.vegasTotal;
      if (typeof total !== "number") continue;
      grade = gradeTotal(
        pick.selection,
        total,
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

    // ── Grade under the same lock used by pregame revisions ───────────────
    // A revision can void a pending pick immediately before first pitch.
    // Recheck the pick is still pending and effective after acquiring this
    // lock so a stale grading candidate cannot overwrite that void.
    const applied = await db.transaction(async (tx) => {
      await tx.execute(publishedPickEffectivenessWriterLock());
      await tx.execute(publishedPickEffectivenessLock(pick.gameId, pick.market));
      const [stillPending] = await tx
        .select({ id: pickResultsTable.id })
        .from(pickResultsTable)
        .innerJoin(publishedPicksTable, eq(pickResultsTable.pickId, publishedPicksTable.id))
        .where(and(
          eq(pickResultsTable.id, pendingRow.pickResultId),
          eq(pickResultsTable.result, "pending"),
          eq(publishedPicksTable.isEffective, true),
           isPerformanceEligiblePublishedPickSql(publishedPicksTable.id),
        ))
        .limit(1);
      if (!stillPending) return false;

      await tx
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
        .where(and(
          eq(pickResultsTable.id, pendingRow.pickResultId),
          eq(pickResultsTable.result, "pending"),
        ));

      // The grade lives only on pick_results. The linked prediction remains
      // immutable after its pregame insert.
      return true;
    });
    if (applied) graded++;
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
 * Populate game_results rows for every game that is already marked "final"
 * in the games table but is missing a corresponding game_results entry.
 *
 * This is the primary path by which game_results gets populated: the games
 * refresh route marks games as "final" directly in the games table (either
 * because ESPN returned a final status, or because the game dropped off the
 * live feed). This function syncs that data into game_results so runGrading()
 * has something to work with.
 *
 * Safe to call multiple times — idempotent via the unique index on gameId.
 *
 * Returns the number of rows newly written.
 */
export async function syncGameResults(): Promise<number> {
  // Find all final games with scores recorded
  const finalGames = await db
    .select({
      id:        gamesTable.id,
      homeScore: gamesTable.homeScore,
      awayScore: gamesTable.awayScore,
    })
    .from(gamesTable)
    .where(
      and(
        eq(gamesTable.status, "final"),
        isNotNull(gamesTable.homeScore),
        isNotNull(gamesTable.awayScore),
      ),
    );

  if (finalGames.length === 0) return 0;

  // Find which ones already have a game_results row
  const finalIds = finalGames.map((g) => g.id);
  const existing = await db
    .select({ gameId: gameResultsTable.gameId })
    .from(gameResultsTable)
    .where(inArray(gameResultsTable.gameId, finalIds));

  const existingIds = new Set(existing.map((r) => r.gameId));
  const missing = finalGames.filter((g) => !existingIds.has(g.id));

  if (missing.length === 0) return 0;

  let synced = 0;
  for (const game of missing) {
    const homeScore = game.homeScore!;
    const awayScore = game.awayScore!;
    try {
      await db.insert(gameResultsTable).values({
        gameId:        game.id,
        homeScore,
        awayScore,
        homeTeamWon:   homeScore > awayScore,
        gradingSource: "games_table_sync",
      });
      synced++;
    } catch {
      // Unique-constraint violation means another process beat us — skip.
    }
  }

  if (synced > 0) {
    logger.info({ synced }, "syncGameResults: back-filled game_results from games table");
  }
  return synced;
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
      // Existing learning is never silently applied twice after a correction.
      // The stored review exposes the original evidence and the override audit
      // tells admins that a supervised rebuild is needed before retraining.
      learningReview: {
        ...(existing.learningReview as Record<string, unknown> ?? {}),
        status: "superseded_by_manual_override",
        reviewedResult: newResult,
        supersededAt: new Date().toISOString(),
      },
    })
    .where(eq(pickResultsTable.id, pickResultId));

  logger.info(
    { pickResultId, from: existing.result, to: newResult, performedBy },
    "Pick result manually overridden",
  );
}
