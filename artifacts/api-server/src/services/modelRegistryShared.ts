import { sql } from "drizzle-orm";
import type { modelVersionsTable } from "@workspace/db";

export const PERMANENT_SHADOW_MODEL_IDS = new Set([
  "tbm-mlb-moneyline-v4",
  "tbm-mlb-moneyline-v4-1",
]);

export function isPermanentShadowModelId(modelId: string): boolean {
  return PERMANENT_SHADOW_MODEL_IDS.has(modelId);
}

export function isDeployableModelIdentity(
  model: Pick<typeof modelVersionsTable.$inferSelect, "modelId" | "sport" | "market">,
): boolean {
  if (isPermanentShadowModelId(model.modelId)) return false;
  const sport = model.sport.toLowerCase().replace(/[^a-z0-9]/g, "");
  const market = model.market.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return new RegExp(`^tbm-${sport}-${market}-v[1-9][0-9]*$`, "i").test(model.modelId);
}

/** Shared transaction lock for every writer of a production registry slot. */
export function modelRegistryProductionLock(sport: string, market: string) {
  return sql`SELECT pg_advisory_xact_lock(hashtext(${
    `model-registry:${sport.toLowerCase()}:${market.toLowerCase()}`
  }))`;
}