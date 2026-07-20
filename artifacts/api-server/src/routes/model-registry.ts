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

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, deploymentHistoryTable } from "@workspace/db";
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
} from "../services/modelRegistry";

const router: IRouter = Router();

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

  const { newStatus, performedBy, notes, approvedBy, masterApproved } = req.body ?? {};
  if (!newStatus || !performedBy) {
    res.status(400).json({ error: "newStatus and performedBy are required" });
    return;
  }

  const version = await transitionModelStatus(id, {
    newStatus,
    performedBy,
    notes,
    approvedBy,
    masterApproved: masterApproved === true,
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

  const { performedBy, masterApproved, notes } = req.body ?? {};
  if (!performedBy) {
    res.status(400).json({ error: "performedBy is required" });
    return;
  }

  const result = await rollbackModel(
    id,
    performedBy,
    masterApproved === true,
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
