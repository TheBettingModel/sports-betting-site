/**
 * Feature store endpoints.
 *
 * GET    /api/features                    — list feature definitions (filterable)
 * POST   /api/features                    — register a new feature definition (auto-versioned)
 * GET    /api/features/:id                — single feature definition by id
 * PUT    /api/features/:id                — update editable metadata (name + version are immutable)
 * DELETE /api/features/:id                — soft-delete (deactivate) a feature definition
 * PATCH  /api/features/:id/deactivate     — explicit deactivation alias
 * GET    /api/features/:name/versions     — all versions of a named feature
 */

import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, featureDefinitionsTable } from "@workspace/db";

const router: IRouter = Router();

// ── List ──────────────────────────────────────────────────────────────────────

router.get("/features", async (req, res): Promise<void> => {
  const { sport, market, isActive, source } = req.query;

  const conditions = [];
  if (sport !== undefined) conditions.push(eq(featureDefinitionsTable.sport, sport as string));
  if (market !== undefined) conditions.push(eq(featureDefinitionsTable.market, market as string));
  if (source !== undefined) conditions.push(eq(featureDefinitionsTable.source, source as string));
  if (isActive !== undefined)
    conditions.push(eq(featureDefinitionsTable.isActive, isActive === "true"));

  const features = await db
    .select()
    .from(featureDefinitionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(featureDefinitionsTable.name, desc(featureDefinitionsTable.version));

  res.json({ features, count: features.length });
});

// ── Create (auto-versioned) ───────────────────────────────────────────────────

/**
 * POST /api/features
 *
 * Registering a feature with an existing name auto-increments the version so
 * historical predictions referencing older versions stay reproducible.
 *
 * Body: { name, source, description?, dataType?, sport?, market?,
 *         calculationMethod?, availabilityTiming?,
 *         missingValuePolicy? (zero|mean|drop|error) }
 */
router.post("/features", async (req, res): Promise<void> => {
  const { name, source } = req.body ?? {};
  if (!name || !source) {
    res.status(400).json({ error: "name and source are required" });
    return;
  }

  const [latest] = await db
    .select({ version: featureDefinitionsTable.version })
    .from(featureDefinitionsTable)
    .where(eq(featureDefinitionsTable.name, name))
    .orderBy(desc(featureDefinitionsTable.version))
    .limit(1);

  const nextVersion = latest ? latest.version + 1 : 1;

  const [feature] = await db
    .insert(featureDefinitionsTable)
    .values({
      name,
      version: nextVersion,
      description: req.body.description ?? null,
      dataType: req.body.dataType ?? "float",
      sport: req.body.sport ?? null,
      market: req.body.market ?? null,
      source,
      calculationMethod: req.body.calculationMethod ?? null,
      availabilityTiming: req.body.availabilityTiming ?? null,
      missingValuePolicy: req.body.missingValuePolicy ?? "mean",
      isActive: true,
    })
    .returning();

  res.status(201).json(feature);
});

// ── All versions of a named feature ──────────────────────────────────────────

/**
 * GET /api/features/:name/versions
 *
 * Must be registered BEFORE /:id to avoid "versions" matching as an id.
 * Returns all versions, newest first.
 */
router.get("/features/:name/versions", async (req, res): Promise<void> => {
  // Skip if :name is a numeric id (avoid intercepting GET /features/:id)
  if (/^\d+$/.test(req.params.name)) { res.status(400).json({ error: "Use GET /api/features/:id for numeric lookups" }); return; }

  const versions = await db
    .select()
    .from(featureDefinitionsTable)
    .where(eq(featureDefinitionsTable.name, req.params.name))
    .orderBy(desc(featureDefinitionsTable.version));

  res.json({ name: req.params.name, versions, count: versions.length });
});

// ── Read single ───────────────────────────────────────────────────────────────

router.get("/features/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid feature id" }); return; }

  const [feature] = await db
    .select()
    .from(featureDefinitionsTable)
    .where(eq(featureDefinitionsTable.id, id))
    .limit(1);

  if (!feature) { res.status(404).json({ error: "Feature definition not found" }); return; }
  res.json(feature);
});

// ── Update metadata ───────────────────────────────────────────────────────────

/**
 * PUT /api/features/:id
 *
 * Update editable metadata. name and version are immutable.
 * All body fields are optional — omitted fields retain their current value.
 *
 * Body: { description?, source?, calculationMethod?,
 *         availabilityTiming?, missingValuePolicy?, dataType? }
 */
router.put("/features/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid feature id" }); return; }

  const [existing] = await db
    .select()
    .from(featureDefinitionsTable)
    .where(eq(featureDefinitionsTable.id, id))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Feature definition not found" }); return; }

  const [updated] = await db
    .update(featureDefinitionsTable)
    .set({
      description: req.body.description ?? existing.description,
      source: req.body.source ?? existing.source,
      dataType: req.body.dataType ?? existing.dataType,
      calculationMethod: req.body.calculationMethod ?? existing.calculationMethod,
      availabilityTiming: req.body.availabilityTiming ?? existing.availabilityTiming,
      missingValuePolicy: req.body.missingValuePolicy ?? existing.missingValuePolicy,
    })
    .where(eq(featureDefinitionsTable.id, id))
    .returning();

  res.json(updated);
});

// ── Delete (soft) ─────────────────────────────────────────────────────────────

/**
 * DELETE /api/features/:id
 *
 * Soft-deletes a feature by marking it inactive. The row is never physically
 * removed so historical predictions that reference this feature+version
 * remain fully reproducible.
 */
router.delete("/features/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid feature id" }); return; }

  const [existing] = await db
    .select()
    .from(featureDefinitionsTable)
    .where(eq(featureDefinitionsTable.id, id))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Feature definition not found" }); return; }

  if (!existing.isActive) {
    res.json({ message: "Feature already inactive", feature: existing });
    return;
  }

  const [updated] = await db
    .update(featureDefinitionsTable)
    .set({ isActive: false })
    .where(eq(featureDefinitionsTable.id, id))
    .returning();

  res.json(updated);
});

// ── Explicit deactivation alias ───────────────────────────────────────────────

router.patch("/features/:id/deactivate", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid feature id" }); return; }

  const [existing] = await db
    .select()
    .from(featureDefinitionsTable)
    .where(eq(featureDefinitionsTable.id, id))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Feature definition not found" }); return; }
  if (!existing.isActive) {
    res.json({ message: "Feature already inactive", feature: existing });
    return;
  }

  const [updated] = await db
    .update(featureDefinitionsTable)
    .set({ isActive: false })
    .where(eq(featureDefinitionsTable.id, id))
    .returning();

  res.json(updated);
});

export default router;
