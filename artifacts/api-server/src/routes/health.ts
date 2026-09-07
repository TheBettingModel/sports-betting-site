import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getGuardedServingRuntimeStatus } from "../services/guardedServing/runtimeStatus";
import { canonicalV4EngineRegistry } from "../services/v4Platform";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    const guarded = await getGuardedServingRuntimeStatus();
    res.json({
      status: "ready",
      database: "connected",
      scheduler: "configured",
      guardedServing: guarded.sports.map((sport) => ({
        sport: sport.sport,
        state: sport.resolvedServingState,
        approval: sport.approvalStatus,
        executorAvailable: sport.executorAvailable,
      })),
      v4Platform: canonicalV4EngineRegistry.status(),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "not_ready",
      database: "unavailable_or_registry_check_failed",
      reason: error instanceof Error ? error.message : "READINESS_CHECK_FAILED",
      checkedAt: new Date().toISOString(),
    });
  }
});

export default router;
