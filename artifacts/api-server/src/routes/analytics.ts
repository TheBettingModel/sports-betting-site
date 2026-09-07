/**
 * Analytics endpoints.
 *
 * GET /api/analytics/performance  — filterable pre-computed metric breakdowns
 * GET /api/analytics/calibration  — probability bucket data for charting
 * POST /api/analytics/refresh     — trigger a full analytics recompute
 */

import { Router, type IRouter } from "express";
import { queryMetrics, runAnalytics } from "../services/analytics";
import { computeCalibration } from "../services/calibration";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * GET /api/analytics/performance
 *
 * Query pre-computed performance_metrics rows.
 * All query params are optional — omitting one means "all values".
 *
 * Query params:
 *   modelVersionId  integer
 *   sport           string  (e.g. "MLB")
 *   market          string  (e.g. "moneyline")
 *   recommendation  string  (e.g. "Strong Buy")
 *   confidence      string  (e.g. "High")
 *   oddsBucket      string  (e.g. "-149 to -110")
 *   edgeBucket      string  (e.g. "5–10%")
 *   isPlayOfDay     boolean ("true" | "false")
 */
router.get("/analytics/performance", async (req, res): Promise<void> => {
  const {
    modelVersionId,
    sport,
    market,
    recommendation,
    confidence,
    oddsBucket,
    edgeBucket,
    isPlayOfDay,
  } = req.query;

  const filters: Parameters<typeof queryMetrics>[0] = {};

  if (modelVersionId !== undefined)
    filters.modelVersionId = parseInt(modelVersionId as string, 10);
  if (sport !== undefined) filters.sport = sport as string;
  if (market !== undefined) filters.market = market as string;
  if (recommendation !== undefined)
    filters.recommendation = recommendation as string;
  if (confidence !== undefined) filters.confidence = confidence as string;
  if (oddsBucket !== undefined) filters.oddsBucket = oddsBucket as string;
  if (edgeBucket !== undefined) filters.edgeBucket = edgeBucket as string;
  if (isPlayOfDay !== undefined)
    filters.isPlayOfDay = isPlayOfDay === "true";

  const rows = await queryMetrics(filters);

  res.json({
    metrics: rows,
    count: rows.length,
    filters,
    dataAsOf: new Date().toISOString(),
  });
});

/**
 * GET /api/analytics/calibration
 *
 * Compute calibration curves for a model version.
 * Returns probability bucket data suitable for a calibration chart.
 *
 * Query params:
 *   modelVersionId  integer  (required)
 *   sport           string   (optional — filters predictions)
 *   market          string   (optional)
 */
router.get("/analytics/calibration", async (req, res): Promise<void> => {
  const { modelVersionId, sport, market } = req.query;

  if (!modelVersionId) {
    res.status(400).json({ error: "modelVersionId is required" });
    return;
  }

  const mvId = parseInt(modelVersionId as string, 10);
  if (isNaN(mvId)) {
    res.status(400).json({ error: "modelVersionId must be an integer" });
    return;
  }

  const result = await computeCalibration(
    mvId,
    sport as string | undefined,
    market as string | undefined,
  );

  res.json(result);
});

/**
 * POST /api/analytics/refresh
 *
 * Trigger a full analytics recompute. Useful after a grading batch or manual
 * override. Returns the number of metric rows written.
 */
router.post("/analytics/refresh", async (_req, res): Promise<void> => {
  const rows = await runAnalytics();
  res.json({
    message: "Analytics refresh complete",
    rowsWritten: rows,
    computedAt: new Date().toISOString(),
  });
});

export default router;
