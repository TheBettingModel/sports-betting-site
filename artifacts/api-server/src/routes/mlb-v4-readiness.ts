import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getMlbV4Readiness } from "../services/mlbV4LiveRuntime";
import { getVerifiedAdminPrincipal } from "./admin";

const router: IRouter = Router();

function requireReadinessAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!process.env["MASTER_API_KEY"]) { res.status(503).json({ error: "Readiness access is not configured" }); return; }
  if (!getVerifiedAdminPrincipal(req)) { res.status(401).json({ error: "Valid X-Master-Key or X-Admin-Token header required" }); return; }
  next();
}
router.get("/internal/mlb-v4/readiness", requireReadinessAdmin, async (_req, res) => {
  try {
    res.json(await getMlbV4Readiness());
  } catch (error) {
    res.status(503).json({
      schemaVersion: "mlb-v4-live-foundation-v1",
      foundationStatus: "FOUNDATION_UNAVAILABLE",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;