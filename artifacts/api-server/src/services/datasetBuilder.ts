/**
 * Dataset Builder
 *
 * Creates reproducible, checksummed training datasets from model_predictions
 * and pick_results. Enforces chronological ordering, leakage checks, and
 * deduplication before writing a training_datasets manifest row.
 *
 * Data source: model_predictions joined with pick_results + game_results.
 * (feature_snapshots are also joined when available for richer feature sets.)
 */

import { createHash } from "crypto";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import {
  db,
  gameResultsTable,
  modelPredictionsTable,
  pickResultsTable,
  publishedPicksTable,
  trainingDatasetsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DatasetRow {
  predictionId: number;
  gameId: string;
  sport: string;
  market: string;
  selection: string;
  predictionTimestamp: string;
  modelProbability: number;
  impliedProbability: number;
  edge: number;
  odds: number | null;
  confidence: string;
  recommendation: string;
  result: string | null; // win | loss | push | void | null (not yet graded)
  homeScore: number | null;
  awayScore: number | null;
  homeTeamWon: boolean | null;
  featureSnapshot: Record<string, unknown>;
}

export interface BuildDatasetInput {
  sport: string;
  market: string;
  modelVersionId?: number; // when set, restrict predictions to this version only
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  includeUngraded?: boolean; // default false — only use decisive outcomes for training
}

interface MissingDataReport {
  totalRows: number;
  missingProbability: number;
  missingOdds: number;
  missingResult: number;
  missingFeatures: number;
}

// ── Leakage checks ────────────────────────────────────────────────────────────

/**
 * Assert no row's featureSnapshot contains features that would only be
 * known after the game started (closing-line fields, live scores, etc.).
 *
 * Returns an array of violation descriptions. Empty array = no leakage.
 */
function checkLeakage(rows: DatasetRow[]): string[] {
  const FORBIDDEN_POST_CLOSE_KEYS = [
    "closingOdds",
    "closingSpread",
    "closingTotal",
    "finalScore",
    "homeScore",
    "awayScore",
    "homeTeamWon",
    "liveStatus",
  ];

  const violations: string[] = [];

  for (const row of rows) {
    const snapshot = row.featureSnapshot;

    // Check 1: No post-close keys in feature snapshot
    for (const key of FORBIDDEN_POST_CLOSE_KEYS) {
      if (key in snapshot) {
        violations.push(
          `Row ${row.predictionId} (game ${row.gameId}): forbidden post-close feature "${key}" in snapshot`,
        );
      }
    }

    // Check 2: featureSnapshot must not include fields with game time data
    if (
      typeof snapshot["gameDate"] === "string" &&
      row.predictionTimestamp > snapshot["gameDate"] + "T23:59:59Z"
    ) {
      violations.push(
        `Row ${row.predictionId}: prediction_timestamp (${row.predictionTimestamp}) is after game date (${snapshot["gameDate"]})`,
      );
    }
  }

  return violations;
}

// ── Checksum ──────────────────────────────────────────────────────────────────

function computeChecksum(rows: DatasetRow[]): string {
  const payload = rows
    .map((r) => `${r.predictionId}:${r.result}:${r.modelProbability}`)
    .join("|");
  return createHash("sha256").update(payload).digest("hex");
}

// ── Missing data report ───────────────────────────────────────────────────────

function buildMissingReport(rows: DatasetRow[]): MissingDataReport {
  return {
    totalRows: rows.length,
    missingProbability: rows.filter((r) => r.modelProbability == null).length,
    missingOdds: rows.filter((r) => r.odds == null).length,
    missingResult: rows.filter((r) => r.result == null).length,
    missingFeatures: rows.filter(
      (r) => !r.featureSnapshot || Object.keys(r.featureSnapshot).length === 0,
    ).length,
  };
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build a reproducible training dataset for a given sport, market, and date
 * range. Runs leakage checks before writing; throws if leakage is found.
 *
 * Returns the training_datasets row ID.
 */
export async function buildDataset(
  input: BuildDatasetInput,
): Promise<{ datasetId: number; rows: DatasetRow[]; checksum: string }> {
  const { sport, market, modelVersionId, dateFrom, dateTo, includeUngraded = false } = input;

  logger.info({ sport, market, modelVersionId, dateFrom, dateTo }, "Dataset builder: starting");

  // ── 1. Load predictions ───────────────────────────────────────────────────
  const predConditions = [
    eq(modelPredictionsTable.sport, sport),
    eq(modelPredictionsTable.market, market),
    // When a specific model version is requested (e.g. for backtesting), scope
    // predictions to that version only — regardless of challenger flag.
    // When no version is specified, restrict to production predictions only.
  ];
  if (modelVersionId != null) {
    predConditions.push(eq(modelPredictionsTable.modelVersionId, modelVersionId));
  } else {
    predConditions.push(eq(modelPredictionsTable.isChallenger, false));
  }
  if (dateFrom) {
    predConditions.push(
      gte(modelPredictionsTable.predictionTimestamp, new Date(dateFrom)),
    );
  }
  if (dateTo) {
    predConditions.push(
      lte(modelPredictionsTable.predictionTimestamp, new Date(dateTo + "T23:59:59Z")),
    );
  }

  const predictions = await db
    .select()
    .from(modelPredictionsTable)
    .where(and(...predConditions))
    .orderBy(modelPredictionsTable.predictionTimestamp);

  if (predictions.length === 0) {
    throw new Error(
      `No predictions found for ${sport}/${market}` +
        (dateFrom ? ` from ${dateFrom}` : "") +
        (dateTo ? ` to ${dateTo}` : ""),
    );
  }

  // ── 2. Load pick_results via published_picks ──────────────────────────────
  const predictionIds = predictions.map((p) => p.id);

  const picksWithResults = await db
    .select({
      predictionId: publishedPicksTable.predictionId,
      result: pickResultsTable.result,
    })
    .from(publishedPicksTable)
    .innerJoin(
      pickResultsTable,
      eq(pickResultsTable.pickId, publishedPicksTable.id),
    )
    .where(inArray(publishedPicksTable.predictionId, predictionIds));

  const resultByPredId = new Map(
    picksWithResults.map((r) => [r.predictionId, r.result]),
  );

  // ── 3. Load game results for context ─────────────────────────────────────
  const gameIds = [...new Set(predictions.map((p) => p.gameId))];
  const gameResults =
    gameIds.length > 0
      ? await db
          .select()
          .from(gameResultsTable)
          .where(inArray(gameResultsTable.gameId, gameIds))
      : [];
  const gameResultByGameId = new Map(gameResults.map((r) => [r.gameId, r]));

  // ── 4. Build rows ─────────────────────────────────────────────────────────
  let rows: DatasetRow[] = predictions
    .map((p) => {
      const result = resultByPredId.get(p.id) ?? null;
      const gr = gameResultByGameId.get(p.gameId) ?? null;

      // Filter out ungraded rows unless explicitly requested
      if (!includeUngraded && (result === "pending" || result === null)) {
        return null;
      }

      return {
        predictionId: p.id,
        gameId: p.gameId,
        sport: p.sport,
        market: p.market,
        selection: p.selection,
        predictionTimestamp: p.predictionTimestamp.toISOString(),
        modelProbability: p.modelProbability,
        impliedProbability: p.impliedProbability ?? 0,
        edge: p.edge,
        odds: p.odds ?? null,
        confidence: p.confidence,
        recommendation: p.recommendation,
        result: result === "pending" ? null : result,
        homeScore: gr?.homeScore ?? null,
        awayScore: gr?.awayScore ?? null,
        homeTeamWon: gr?.homeTeamWon ?? null,
        featureSnapshot: (p.featureSnapshot as Record<string, unknown>) ?? {},
      } satisfies DatasetRow;
    })
    .filter((r): r is DatasetRow => r !== null);

  // Deduplicate by predictionId
  const seen = new Set<number>();
  rows = rows.filter((r) => {
    if (seen.has(r.predictionId)) return false;
    seen.add(r.predictionId);
    return true;
  });

  // Ensure chronological order
  rows.sort((a, b) => a.predictionTimestamp.localeCompare(b.predictionTimestamp));

  logger.info({ rowCount: rows.length }, "Dataset builder: rows assembled");

  // ── 5. Leakage checks ─────────────────────────────────────────────────────
  const leakageViolations = checkLeakage(rows);
  if (leakageViolations.length > 0) {
    const msg =
      `Leakage detected (${leakageViolations.length} violations):\n` +
      leakageViolations.slice(0, 5).join("\n");
    logger.error({ violations: leakageViolations }, "Dataset builder: leakage detected");
    throw new Error(msg);
  }

  logger.info("Dataset builder: leakage checks passed");

  // ── 6. Compute checksum ───────────────────────────────────────────────────
  const checksum = computeChecksum(rows);

  // Check for existing dataset with same checksum
  const [existing] = await db
    .select()
    .from(trainingDatasetsTable)
    .where(eq(trainingDatasetsTable.checksum, checksum))
    .limit(1);

  if (existing) {
    logger.info(
      { datasetId: existing.id, checksum },
      "Dataset builder: identical dataset already exists, returning existing",
    );
    return { datasetId: existing.id, rows, checksum };
  }

  // ── 7. Write manifest ─────────────────────────────────────────────────────
  const missingReport = buildMissingReport(rows);
  const seasons = [
    ...new Set(
      rows.map((r) => r.predictionTimestamp.slice(0, 4)), // year as proxy for season
    ),
  ];

  const [dataset] = await db
    .insert(trainingDatasetsTable)
    .values({
      sport,
      market,
      includedSeasons: seasons,
      featureVersions: { recordBased: 1 },
      outcomeDefinition: `${market} ${selection_description(market)}`,
      dataCutoffRules: {
        noFutureData: true,
        noPostCloseFeatures: true,
        predictionMustPrecedeGame: true,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
      },
      rowCount: rows.length,
      missingDataReport: missingReport,
      sourceVersions: { espn: "1.0", modelPredictions: "1.0" },
      checksum,
    })
    .returning();

  logger.info(
    { datasetId: dataset.id, rows: rows.length, checksum },
    "Dataset builder: manifest written",
  );
  return { datasetId: dataset.id, rows, checksum };
}

function selection_description(market: string): string {
  const desc: Record<string, string> = {
    moneyline: "home team win/loss",
    spread: "against the spread",
    total: "over/under",
  };
  return desc[market] ?? "outcome";
}
