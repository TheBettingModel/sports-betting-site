/**
 * Model Registry endpoints.
 *
 * GET    /api/models                      — list all model versions (filterable)
 * POST   /api/models                      — register a new model version
 * GET    /api/models/production           — current production versions (all sports)
 * GET    /api/models/challenger           — current challenger versions
 * GET    /api/models/:id                  — get a single model version
 * PUT    /api/models/:id                  — update editable metadata (dev/challenger/approved only)
 * DELETE /api/models/:id                  — archive (soft-delete) a non-production model
 * PATCH  /api/models/:id/status           — transition status
 * POST   /api/models/:id/rollback         — roll back to previous production version
 * GET    /api/models/:id/history          — deployment history for a model version
 */

import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  db,
  backtestRunsTable,
  deploymentHistoryTable,
  modelComparisonsTable,
  modelVersionsTable,
  performanceMetricsTable,
} from "@workspace/db";
import {
  archiveModelVersion,
  createModelVersion,
  getChallengerVersions,
  getModelVersion,
  getProductionVersions,
  listModelVersions,
  rollbackModel,
  transitionModelStatus,
  updateModelVersion,
  MIN_SAMPLE_SIZE_FOR_PRODUCTION,
  MIN_WIN_RATE_FOR_PRODUCTION,
} from "../services/modelRegistry";
import { evaluateMlbPromotionGate, type MlbGateMetrics } from "../services/mlbPromotionGate";
import { getVerifiedAdminPrincipal } from "./admin";

const router: IRouter = Router();
function requireModelRegistryAdmin(req: Request, res: Response, next: NextFunction): void {
  const principal = getVerifiedAdminPrincipal(req);
  if (!process.env["MASTER_API_KEY"]) {
    res.status(503).json({ error: "Model registry access is not configured" });
    return;
  }
  if (!principal) {
    res.status(401).json({ error: "Valid X-Master-Key or X-Admin-Token header required" });
    return;
  }
  res.locals.modelRegistryPrincipal = principal;
  next();
}

// Model versions govern live recommendations. Keep every registry operation
// behind server-side master authorization; actor labels are never trusted from
// the request body.
router.use("/models", requireModelRegistryAdmin);

// ── List ──────────────────────────────────────────────────────────────────────

router.get("/models", async (req, res): Promise<void> => {
  const { sport, market, status } = req.query;
  const statusFilter = status
    ? (status as string).split(",").map((s) => s.trim())
    : undefined;

  const versions = await listModelVersions({
    sport: sport as string | undefined,
    market: market as string | undefined,
    status: statusFilter,
  });

  res.json({ models: versions, count: versions.length });
});

// NOTE: /models/production and /models/challenger must be registered BEFORE
// /models/:id to avoid "production"/"challenger" being matched as an id param.

router.get("/models/production", async (_req, res): Promise<void> => {
  const versions = await getProductionVersions();
  res.json({ models: versions, count: versions.length });
});

router.get("/models/challenger", async (_req, res): Promise<void> => {
  const versions = await getChallengerVersions();
  res.json({ models: versions, count: versions.length });
});

// ── Champion-challenger compare ───────────────────────────────────────────────

/**
 * GET /api/models/compare?champion=:id&challenger=:id
 *
 * Returns side-by-side overall performance_metrics for two model versions,
 * backtest results for each, promotion thresholds, and a verdict.
 */
router.get("/models/compare", async (req, res): Promise<void> => {
  const championId = parseInt(req.query.champion as string, 10);
  const challengerId = parseInt(req.query.challenger as string, 10);

  if (isNaN(championId) || isNaN(challengerId)) {
    res.status(400).json({ error: "champion and challenger query params must be numeric model version IDs" });
    return;
  }

  const [champion, challenger] = await Promise.all([
    getModelVersion(championId),
    getModelVersion(challengerId),
  ]);

  if (!champion) { res.status(404).json({ error: `Champion model version ${championId} not found` }); return; }
  if (!challenger) { res.status(404).json({ error: `Challenger model version ${challengerId} not found` }); return; }

  // Overall metrics for both versions (all-dimension-null row = aggregate row)
  const [championMetrics, challengerMetrics] = await Promise.all([
    db
      .select()
      .from(performanceMetricsTable)
      .where(
        and(
          eq(performanceMetricsTable.modelVersionId, championId),
          isNull(performanceMetricsTable.sport),
          isNull(performanceMetricsTable.market),
          isNull(performanceMetricsTable.recommendation),
        ),
      )
      .orderBy(desc(performanceMetricsTable.computedAt))
      .limit(1),
    db
      .select()
      .from(performanceMetricsTable)
      .where(
        and(
          eq(performanceMetricsTable.modelVersionId, challengerId),
          isNull(performanceMetricsTable.sport),
          isNull(performanceMetricsTable.market),
          isNull(performanceMetricsTable.recommendation),
        ),
      )
      .orderBy(desc(performanceMetricsTable.computedAt))
      .limit(1),
  ]);

  // Latest backtest for each
  const [championBacktest, challengerBacktest] = await Promise.all([
    db
      .select()
      .from(backtestRunsTable)
      .where(
        and(
          eq(backtestRunsTable.modelVersionId, championId),
          eq(backtestRunsTable.status, "completed"),
        ),
      )
      .orderBy(desc(backtestRunsTable.completedAt))
      .limit(1),
    db
      .select()
      .from(backtestRunsTable)
      .where(
        and(
          eq(backtestRunsTable.modelVersionId, challengerId),
          eq(backtestRunsTable.status, "completed"),
        ),
      )
      .orderBy(desc(backtestRunsTable.completedAt))
      .limit(1),
  ]);

  const cm = championMetrics[0] ?? null;
  const chm = challengerMetrics[0] ?? null;
  const mlbGate = champion.status === "production"
    && champion.sport === "MLB" && champion.market === "moneyline"
    && challenger.sport === "MLB" && challenger.market === "moneyline" && cm && chm
    ? evaluateMlbPromotionGate({
        champion: cm as MlbGateMetrics,
        challenger: chm as MlbGateMetrics,
        championBacktest: championBacktest[0]
          ? {
              id: championBacktest[0].id,
              datasetId: championBacktest[0].datasetId,
              testWindowStart: championBacktest[0].testWindowStart,
              testWindowEnd: championBacktest[0].testWindowEnd,
              sampleSize: championBacktest[0].sampleSize,
              test: ((championBacktest[0].metrics as Record<string, unknown> | null)?.test ?? null) as { netUnits?: number; maxDrawdown?: number | null } | null,
            }
          : null,
        challengerBacktest: challengerBacktest[0]
          ? {
              id: challengerBacktest[0].id,
              datasetId: challengerBacktest[0].datasetId,
              testWindowStart: challengerBacktest[0].testWindowStart,
              testWindowEnd: challengerBacktest[0].testWindowEnd,
              sampleSize: challengerBacktest[0].sampleSize,
              test: ((challengerBacktest[0].metrics as Record<string, unknown> | null)?.test ?? null) as { netUnits?: number; maxDrawdown?: number | null } | null,
            }
          : null,
      })
    : null;

  // Determine verdict
  let verdict: "champion_better" | "challenger_better" | "inconclusive" | "insufficient_data" =
    "insufficient_data";

  const chSample = chm?.sampleSize ?? 0;
  if (chSample >= MIN_SAMPLE_SIZE_FOR_PRODUCTION && cm && chm) {
    const chROI = chm.roi ?? 0;
    const cmROI = cm.roi ?? 0;
    const chWR = chm.winRate ?? 0;
    const cmWR = cm.winRate ?? 0;

    // Challenger wins if it beats champion on both ROI and win rate by at least 1pp
    if (chROI > cmROI + 0.01 && chWR > cmWR + 0.01) {
      verdict = "challenger_better";
    } else if (cmROI > chROI + 0.01 && cmWR > chWR + 0.01) {
      verdict = "champion_better";
    } else {
      verdict = "inconclusive";
    }
  }
  if (mlbGate) {
    verdict = mlbGate.verdict === "passed" ? "challenger_better" : "inconclusive";
  }
  const championComparisonMetrics = mlbGate
    ? { performanceMetrics: cm, mlbPromotionGate: mlbGate }
    : cm;
  const challengerComparisonMetrics = mlbGate
    ? { performanceMetrics: chm, mlbPromotionGate: mlbGate }
    : chm;

  // Upsert a model_comparisons row for record-keeping
  const today = new Date().toISOString().slice(0, 10);
  const [existingComp] = await db
    .select({ id: modelComparisonsTable.id })
    .from(modelComparisonsTable)
    .where(
      and(
        eq(modelComparisonsTable.championVersionId, championId),
        eq(modelComparisonsTable.challengerVersionId, challengerId),
      ),
    )
    .limit(1);

  if (existingComp) {
    await db
      .update(modelComparisonsTable)
      .set({
        championMetrics: championComparisonMetrics ?? null,
        challengerMetrics: challengerComparisonMetrics ?? null,
        verdict,
        sampleSize: chSample,
      })
      .where(eq(modelComparisonsTable.id, existingComp.id));
  } else {
    await db.insert(modelComparisonsTable).values({
      championVersionId: championId,
      challengerVersionId: challengerId,
      sport: challenger.sport,
      market: challenger.market,
      comparisonPeriodStart: chm?.periodStart ?? today,
      comparisonPeriodEnd: today,
      championMetrics: championComparisonMetrics ?? null,
      challengerMetrics: challengerComparisonMetrics ?? null,
      verdict,
      sampleSize: chSample,
    });
  }

  res.json({
    champion: {
      version: champion,
      metrics: cm,
      latestBacktest: championBacktest[0] ?? null,
    },
    challenger: {
      version: challenger,
      metrics: chm,
      latestBacktest: challengerBacktest[0] ?? null,
    },
    verdict,
    mlbPromotionGate: mlbGate,
    promotionThresholds: {
      minSampleSize: MIN_SAMPLE_SIZE_FOR_PRODUCTION,
      minWinRate: MIN_WIN_RATE_FOR_PRODUCTION,
      challengerMeetsSampleSize: chSample >= MIN_SAMPLE_SIZE_FOR_PRODUCTION,
      challengerMeetsWinRate:
        chm?.winRate != null ? chm.winRate >= MIN_WIN_RATE_FOR_PRODUCTION : null,
    },
    sampleSize: chSample,
    comparedAt: new Date(),
  });
});

// ── Create ────────────────────────────────────────────────────────────────────

router.post("/models", async (req, res): Promise<void> => {
  const { modelId, sport, market } = req.body ?? {};
  if (!modelId || !sport || !market) {
    res.status(400).json({ error: "modelId, sport, and market are required" });
    return;
  }

  const version = await createModelVersion({
    modelId,
    sport,
    market,
    notes: req.body.notes,
    hyperparameters: req.body.hyperparameters,
    evaluationMetrics: req.body.evaluationMetrics,
    artifactLocation: req.body.artifactLocation,
    featureVersions: req.body.featureVersions,
    trainingPeriodStart: req.body.trainingPeriodStart,
    trainingPeriodEnd: req.body.trainingPeriodEnd,
  });

  res.status(201).json(version);
});

// ── Read single ───────────────────────────────────────────────────────────────

router.get("/models/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid model version id" }); return; }

  const version = await getModelVersion(id);
  if (!version) { res.status(404).json({ error: "Model version not found" }); return; }

  res.json(version);
});

// ── Update metadata ───────────────────────────────────────────────────────────

/**
 * PUT /api/models/:id
 *
 * Update editable metadata on a model version.
 * Not allowed for production, retired, or rejected models.
 *
 * Body (all optional — omitted fields retain their current value):
 *   notes, hyperparameters, evaluationMetrics, artifactLocation,
 *   featureVersions, trainingPeriodStart, trainingPeriodEnd
 */
router.put("/models/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid model version id" }); return; }

  const updated = await updateModelVersion(id, {
    notes: req.body.notes,
    hyperparameters: req.body.hyperparameters,
    evaluationMetrics: req.body.evaluationMetrics,
    artifactLocation: req.body.artifactLocation,
    featureVersions: req.body.featureVersions,
    trainingPeriodStart: req.body.trainingPeriodStart,
    trainingPeriodEnd: req.body.trainingPeriodEnd,
  });

  res.json(updated);
});

// ── Archive (soft-delete) ─────────────────────────────────────────────────────

/**
 * DELETE /api/models/:id
 *
 * Archives a model version by setting its status to "rejected".
 * Safe to call on development, challenger, or approved versions.
 * Production models cannot be deleted — retire them via PATCH /status instead.
 *
 * Body (optional): { performedBy, reason }
 */
router.delete("/models/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid model version id" }); return; }

  const performedBy = req.body?.performedBy ?? "api";
  const reason = req.body?.reason;

  const archived = await archiveModelVersion(id, performedBy, reason);
  res.json(archived);
});

// ── Status transition ─────────────────────────────────────────────────────────

/**
 * PATCH /api/models/:id/status
 *
 * Body: { newStatus, performedBy, notes?, approvedBy?,
 *         masterApproved? (required for production/retired) }
 */
router.patch("/models/:id/status", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid model version id" }); return; }

  const { newStatus, notes } = req.body ?? {};
  if (!newStatus) {
    res.status(400).json({ error: "newStatus is required" });
    return;
  }

  const version = await transitionModelStatus(id, {
    newStatus,
    performedBy: res.locals.modelRegistryPrincipal as string,
    notes,
    approvedBy: res.locals.modelRegistryPrincipal as string,
    masterApproved: true,
  });

  res.json(version);
});

// ── Rollback ──────────────────────────────────────────────────────────────────

/**
 * POST /api/models/:id/rollback
 * Body: { performedBy, masterApproved: true, notes? }
 */
router.post("/models/:id/rollback", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid model version id" }); return; }

  const { notes } = req.body ?? {};

  const result = await rollbackModel(
    id,
    res.locals.modelRegistryPrincipal as string,
    true,
    notes,
  );

  res.json(result);
});

// ── Deployment history ────────────────────────────────────────────────────────

router.get("/models/:id/history", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid model version id" }); return; }

  const history = await db
    .select()
    .from(deploymentHistoryTable)
    .where(eq(deploymentHistoryTable.modelVersionId, id))
    .orderBy(deploymentHistoryTable.performedAt);

  res.json({ history, count: history.length });
});

export default router;
