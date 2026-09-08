/**
 * Results endpoints.
 *
 * GET /api/results/summary  — overall + by-sport breakdown + recent graded picks
 *
 * Query params:
 *   period  "week" | "season"  (default: "season")
 */

import { Router, type IRouter } from "express";
import { eq, desc, gte, and, inArray } from "drizzle-orm";
import {
  db,
  pickResultsTable,
  publishedPicksTable,
  gamesTable,
  modelPredictionsTable,
  modelVersionsTable,
  v4ArtifactModelVersionMappingsTable,
} from "@workspace/db";
import { rejectInvalidToken } from "../middleware/requireSubscriber";
import { logger } from "../lib/logger";
import {
  OFFICIAL_RECORD_RECOMMENDATIONS,
  officialPublicRecordSqlConditions,
} from "../services/officialRecordPolicy";
import { ACTIVE_PRODUCT_SPORTS } from "../services/sportScope";

// Recommendation display order for the official performance ledger.
const RATING_ORDER: readonly string[] = OFFICIAL_RECORD_RECOMMENDATIONS;

const router: IRouter = Router();

type LedgerRow = {
  result: string;
  unitsWonLost: number | null;
  unitsRisked: number | null;
};

type RecordSegment = {
  wins: number;
  losses: number;
  pushes: number;
  totalPicks: number;
  winRate: number;
  unitsWonLost: number;
  unitsRisked: number;
  roi: number;
};

/**
 * V4 is a persisted provenance classification, never a date-based inference.
 * A row is V4 only when its published-pick decision is the exact V4 approval,
 * the immutable prediction records the V4 forecast identity, and its registry
 * model version is linked to the governed V4 artifact identity.
 */
function isV4OfficialRecord(row: {
  publicationReasonCode: string | null;
  v4PredictionId: unknown;
  v4MappedModelVersionId: number | null;
}): boolean {
  return row.publicationReasonCode === "V4_EXACT_APPROVED"
    && hasV4ForecastIdentity(row.v4PredictionId)
    && row.v4MappedModelVersionId != null;
}

function hasV4ForecastIdentity(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

function summarizeRecordSegment(rows: LedgerRow[]): RecordSegment {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let unitsWonLost = 0;
  let unitsRisked = 0;
  for (const row of rows) {
    if (row.result === "win") wins++;
    else if (row.result === "loss") losses++;
    else if (row.result === "push") pushes++;
    unitsWonLost += row.unitsWonLost ?? 0;
    unitsRisked += row.unitsRisked ?? 0;
  }
  const decisive = wins + losses;
  return {
    wins, losses, pushes, totalPicks: wins + losses + pushes,
    winRate: decisive > 0 ? Math.round((wins / decisive) * 1000) / 10 : 0,
    unitsWonLost: Math.round(unitsWonLost * 100) / 100,
    unitsRisked: Math.round(unitsRisked * 100) / 100,
    roi: unitsRisked > 0 ? Math.round((unitsWonLost / unitsRisked) * 10000) / 100 : 0,
  };
}

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

      // Cut-off date: most recent Monday (ET) for "week", Jan 1 of this year for "season"
      const now = new Date();
      let cutoffDate: string;
      if (period === "week") {
        // Find the most recent Monday in US Eastern time
        const etNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
        const dayOfWeek = etNow.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // days since last Monday
        const monday = new Date(now);
        monday.setDate(now.getDate() - daysToMonday);
        cutoffDate = monday.toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD
      } else {
        cutoffDate = `${now.getFullYear()}-01-01`;
      }

      // Fetch graded official plays in the period. Neutral/Fade projections are
      // still retained and reviewed for calibration, but do not represent a
      // subscriber-facing wager and must not affect the public record.
      const ledgerRows = await db
        .select({
          pickId: publishedPicksTable.id,
          sport: publishedPicksTable.sport,
          market: publishedPicksTable.market,
          selection: publishedPicksTable.selection,
          odds: publishedPicksTable.odds,
          units: publishedPicksTable.units,
          publicationReasonCode: publishedPicksTable.publicationReasonCode,
          result: pickResultsTable.result,
          unitsWonLost: pickResultsTable.unitsWonLost,
          unitsRisked: pickResultsTable.unitsRisked,
          gradedAt: pickResultsTable.gradedAt,
          awayTeamAbbr: gamesTable.awayTeamAbbr,
          homeTeamAbbr: gamesTable.homeTeamAbbr,
          awayScore: gamesTable.awayScore,
          homeScore: gamesTable.homeScore,
          gameDate: gamesTable.gameDate,
          modelId: modelVersionsTable.modelId,
          modelVersionId: modelVersionsTable.id,
          featureSnapshot: modelPredictionsTable.featureSnapshot,
          v4MappedModelVersionId: v4ArtifactModelVersionMappingsTable.modelVersionId,
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
        .innerJoin(
          modelPredictionsTable,
          eq(publishedPicksTable.predictionId, modelPredictionsTable.id),
        )
        .innerJoin(
          modelVersionsTable,
          eq(modelPredictionsTable.modelVersionId, modelVersionsTable.id),
        )
        .leftJoin(
          v4ArtifactModelVersionMappingsTable,
          eq(modelVersionsTable.id, v4ArtifactModelVersionMappingsTable.modelVersionId),
        )
        .where(and(
          gte(gamesTable.gameDate, cutoffDate),
          inArray(publishedPicksTable.sport, [...ACTIVE_PRODUCT_SPORTS]),
          ...officialPublicRecordSqlConditions(`${now.getFullYear()}-09-11`),
        ))
        .orderBy(desc(pickResultsTable.gradedAt));

      // A persisted V4 forecast identity is not itself a wager. It contributes
      // only after the exact V4 publication decision also exists; this excludes
      // raw projections even if a malformed/legacy publication row is present.
      const rows = ledgerRows.filter((row) => {
        const v4PredictionId = (row.featureSnapshot as Record<string, unknown> | null)?.v4PredictionId;
        return !hasV4ForecastIdentity(v4PredictionId) || isV4OfficialRecord({
          publicationReasonCode: row.publicationReasonCode,
          v4PredictionId,
          v4MappedModelVersionId: row.v4MappedModelVersionId,
        });
      });
      const v4OfficialRows = rows.filter((row) => isV4OfficialRecord({
        publicationReasonCode: row.publicationReasonCode,
        v4PredictionId: (row.featureSnapshot as Record<string, unknown> | null)?.v4PredictionId,
        v4MappedModelVersionId: row.v4MappedModelVersionId,
      }));
      const preCutoverOfficialRows = rows.filter((row) => !v4OfficialRows.includes(row));
      const overall = summarizeRecordSegment(rows);
      const recordSegments = {
        preCutoverOfficial: summarizeRecordSegment(preCutoverOfficialRows),
        v4Official: summarizeRecordSegment(v4OfficialRows),
      };

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
        modelId: r.modelId,
        modelVersionId: r.modelVersionId,
        provenance: isV4OfficialRecord({
          publicationReasonCode: r.publicationReasonCode,
          v4PredictionId: (r.featureSnapshot as Record<string, unknown> | null)?.v4PredictionId,
          v4MappedModelVersionId: r.v4MappedModelVersionId,
        }) ? "v4Official" : "preCutoverOfficial",
      }));

      res.json({
        period,
        overall,
        recordSegments,
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

/**
 * GET /api/results/roi
 *
 * Returns official-play win%, units won/lost, and ROI% broken down by sport
 * and recommendation tier. Uses the same period logic as /results/summary.
 *
 * This lets the admin and the learning engine verify that higher-rated picks
 * actually outperform lower-rated ones.
 */
router.get(
  "/results/roi",
  rejectInvalidToken,
  async (req, res): Promise<void> => {
    try {
      const period = req.query.period === "week" ? "week" : "season";

      const now = new Date();
      let cutoffDate: string;
      if (period === "week") {
        const etNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
        const dayOfWeek = etNow.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - daysToMonday);
        cutoffDate = monday.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      } else {
        cutoffDate = `${now.getFullYear()}-01-01`;
      }

      // Neutral/Fade projections remain in the forecast-review dataset for
      // model-quality analysis, but official ROI is limited to actual plays.
      const rows = await db
        .select({
          sport: publishedPicksTable.sport,
          recommendation: publishedPicksTable.recommendation,
          result: pickResultsTable.result,
          unitsWonLost: pickResultsTable.unitsWonLost,
          unitsRisked: pickResultsTable.unitsRisked,
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
        .innerJoin(
          modelPredictionsTable,
          eq(publishedPicksTable.predictionId, modelPredictionsTable.id),
        )
        .innerJoin(
          modelVersionsTable,
          eq(modelPredictionsTable.modelVersionId, modelVersionsTable.id),
        )
        .where(
          and(
            gte(gamesTable.gameDate, cutoffDate),
            inArray(publishedPicksTable.sport, [...ACTIVE_PRODUCT_SPORTS]),
            ...officialPublicRecordSqlConditions(`${now.getFullYear()}-09-11`),
          ),
        );

      // ── Aggregation helper ────────────────────────────────────────────────

      type Bucket = {
        wins: number;
        losses: number;
        pushes: number;
        unitsWonLost: number;
        unitsRisked: number;
      };

      function makeBucket(): Bucket {
        return { wins: 0, losses: 0, pushes: 0, unitsWonLost: 0, unitsRisked: 0 };
      }

      function addRow(bucket: Bucket, r: { result: string; unitsWonLost: number | null; unitsRisked: number | null }) {
        if (r.result === "win") bucket.wins++;
        else if (r.result === "loss") bucket.losses++;
        else if (r.result === "push") bucket.pushes++;
        bucket.unitsWonLost += r.unitsWonLost ?? 0;
        bucket.unitsRisked += r.unitsRisked ?? 0;
      }

      function summarise(key: string, b: Bucket) {
        const decisive = b.wins + b.losses;
        const winRate = decisive > 0 ? Math.round((b.wins / decisive) * 1000) / 10 : 0;
        const roi = b.unitsRisked > 0
          ? Math.round((b.unitsWonLost / b.unitsRisked) * 10000) / 100
          : 0;
        return {
          key,
          wins: b.wins,
          losses: b.losses,
          pushes: b.pushes,
          totalPicks: b.wins + b.losses + b.pushes,
          winRate,
          unitsWonLost: Math.round(b.unitsWonLost * 100) / 100,
          unitsRisked: Math.round(b.unitsRisked * 100) / 100,
          roi,
        };
      }

      // ── By rating tier ────────────────────────────────────────────────────
      const ratingMap = new Map<string, Bucket>();
      for (const r of rows) {
        const k = r.recommendation;
        if (!ratingMap.has(k)) ratingMap.set(k, makeBucket());
        addRow(ratingMap.get(k)!, r);
      }
      const byRating = RATING_ORDER
        .filter((rating) => ratingMap.has(rating))
        .map((rating) => ({
          ...summarise(rating, ratingMap.get(rating)!),
          recommendation: rating,
        }));

      // ── By sport ──────────────────────────────────────────────────────────
      const sportMap = new Map<string, Bucket>();
      for (const r of rows) {
        const k = r.sport;
        if (!sportMap.has(k)) sportMap.set(k, makeBucket());
        addRow(sportMap.get(k)!, r);
      }
      const bySport = [...sportMap.entries()]
        .map(([sport, b]) => ({ ...summarise(sport, b), sport }))
        .sort((a, b) => b.totalPicks - a.totalPicks);

      // ── By sport × rating ─────────────────────────────────────────────────
      const crossMap = new Map<string, Bucket>();
      for (const r of rows) {
        const k = `${r.sport}||${r.recommendation}`;
        if (!crossMap.has(k)) crossMap.set(k, makeBucket());
        addRow(crossMap.get(k)!, r);
      }
      const bySportAndRating = [...crossMap.entries()]
        .map(([key, b]) => {
          const [sport, recommendation] = key.split("||") as [string, string];
          return { ...summarise(key, b), sport, recommendation };
        })
        .sort((a, b) => b.totalPicks - a.totalPicks);

      res.json({ period, byRating, bySport, bySportAndRating, dataAsOf: new Date().toISOString() });
    } catch (err) {
      logger.error({ err }, "GET /api/results/roi error");
      res.status(500).json({ error: "Failed to fetch ROI data" });
    }
  },
);

export default router;
