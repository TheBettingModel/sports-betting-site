/**
 * Results endpoints.
 *
 * GET /api/results/summary  — overall + by-sport breakdown + recent graded picks
 *
 * Query params:
 *   period  "week" | "season"  (default: "season")
 */

import { Router, type IRouter } from "express";
import { eq, desc, gte, and, ne } from "drizzle-orm";
import {
  db,
  pickResultsTable,
  publishedPicksTable,
  gamesTable,
} from "@workspace/db";
import { rejectInvalidToken } from "../middleware/requireSubscriber";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Build a human-readable pick label from stored fields. */
function pickLabel(
  market: string,
  selection: string,
  homeAbbr: string,
  awayAbbr: string,
): string {
  if (market === "total") {
    return selection === "over" ? "Over" : "Under";
  }
  const abbr = selection === "home" ? homeAbbr : awayAbbr;
  if (market === "spread") return `${abbr} spread`;
  return `${abbr} ML`;
}

/** Compute current streak from an ordered array of results (most recent first). */
function computeStreak(results: string[]): { count: number; dir: "W" | "L" | "P" } {
  if (results.length === 0) return { count: 0, dir: "W" };
  const first = results[0];
  const dir: "W" | "L" | "P" =
    first === "win" ? "W" : first === "loss" ? "L" : "P";
  let count = 0;
  for (const r of results) {
    const d = r === "win" ? "W" : r === "loss" ? "L" : "P";
    if (d === dir) count++;
    else break;
  }
  return { count, dir };
}

/**
 * GET /api/results/summary
 */
router.get(
  "/results/summary",
  rejectInvalidToken,
  async (req, res): Promise<void> => {
    try {
      const period = req.query.period === "week" ? "week" : "season";

      // Cut-off date: last 7 days for "week", Jan 1 of this year for "season"
      const now = new Date();
      let cutoffDate: string;
      if (period === "week") {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        cutoffDate = d.toISOString().split("T")[0];
      } else {
        cutoffDate = `${now.getFullYear()}-01-01`;
      }

      // Fetch all graded picks in the period
      const rows = await db
        .select({
          pickId: publishedPicksTable.id,
          sport: publishedPicksTable.sport,
          market: publishedPicksTable.market,
          selection: publishedPicksTable.selection,
          odds: publishedPicksTable.odds,
          units: publishedPicksTable.units,
          result: pickResultsTable.result,
          unitsWonLost: pickResultsTable.unitsWonLost,
          unitsRisked: pickResultsTable.unitsRisked,
          gradedAt: pickResultsTable.gradedAt,
          awayTeamAbbr: gamesTable.awayTeamAbbr,
          homeTeamAbbr: gamesTable.homeTeamAbbr,
          awayScore: gamesTable.awayScore,
          homeScore: gamesTable.homeScore,
          gameDate: gamesTable.gameDate,
        })
        .from(pickResultsTable)
        .innerJoin(
          publishedPicksTable,
          eq(pickResultsTable.pickId, publishedPicksTable.id),
        )
        .innerJoin(
          gamesTable,
          eq(publishedPicksTable.gameId, gamesTable.id),
        )
        .where(and(gte(gamesTable.gameDate, cutoffDate), ne(pickResultsTable.result, "pending")))
        .orderBy(desc(pickResultsTable.gradedAt));

      // ── Overall ───────────────────────────────────────────────────────────
      let totalWins = 0;
      let totalLosses = 0;
      let totalPushes = 0;
      let totalUnits = 0;

      for (const r of rows) {
        if (r.result === "win") totalWins++;
        else if (r.result === "loss") totalLosses++;
        else if (r.result === "push") totalPushes++;
        totalUnits += r.unitsWonLost ?? 0;
      }

      const totalDecisive = totalWins + totalLosses;
      const overallWinRate =
        totalDecisive > 0
          ? Math.round((totalWins / totalDecisive) * 1000) / 10
          : 0;

      // ── By sport ──────────────────────────────────────────────────────────
      const sportMap: Record<
        string,
        { wins: number; losses: number; pushes: number; units: number; results: string[] }
      > = {};

      for (const r of rows) {
        if (!sportMap[r.sport]) {
          sportMap[r.sport] = { wins: 0, losses: 0, pushes: 0, units: 0, results: [] };
        }
        const s = sportMap[r.sport];
        s.results.push(r.result);
        s.units += r.unitsWonLost ?? 0;
        if (r.result === "win") s.wins++;
        else if (r.result === "loss") s.losses++;
        else if (r.result === "push") s.pushes++;
      }

      const bySport = Object.entries(sportMap).map(([sport, s]) => {
        const decisive = s.wins + s.losses;
        const winRate =
          decisive > 0 ? Math.round((s.wins / decisive) * 1000) / 10 : 0;
        const streak = computeStreak(s.results);
        return {
          sport,
          wins: s.wins,
          losses: s.losses,
          pushes: s.pushes,
          totalPicks: s.wins + s.losses + s.pushes,
          winRate,
          unitsWonLost: Math.round(s.units * 100) / 100,
          currentStreak: streak.count,
          currentStreakDir: streak.dir,
        };
      });

      // Sort by total picks desc so the most active sports appear first
      bySport.sort((a, b) => b.totalPicks - a.totalPicks);

      // ── Recent results (last 30) ──────────────────────────────────────────
      const recentResults = rows.slice(0, 30).map((r) => ({
        pickId: r.pickId,
        sport: r.sport,
        awayTeamAbbr: r.awayTeamAbbr,
        homeTeamAbbr: r.homeTeamAbbr,
        awayScore: r.awayScore,
        homeScore: r.homeScore,
        pick: pickLabel(r.market, r.selection, r.homeTeamAbbr, r.awayTeamAbbr),
        odds: r.odds,
        unitsRisked: r.unitsRisked,
        unitsWonLost: r.unitsWonLost ?? 0,
        result: r.result,
        gameDate: r.gameDate,
        gradedAt: r.gradedAt?.toISOString() ?? null,
      }));

      res.json({
        period,
        overall: {
          wins: totalWins,
          losses: totalLosses,
          pushes: totalPushes,
          totalPicks: rows.length,
          winRate: overallWinRate,
          unitsWonLost: Math.round(totalUnits * 100) / 100,
        },
        bySport,
        recentResults,
        dataAsOf: new Date().toISOString(),
      });
    } catch (err) {
      logger.error({ err }, "GET /api/results/summary error");
      res.status(500).json({ error: "Failed to fetch results summary" });
    }
  },
);

export default router;
