import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gamesRouter from "./games";
import modelStatsRouter from "./model-stats";
import analyticsRouter from "./analytics";
import modelRegistryRouter from "./model-registry";
import featuresRouter from "./features";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gamesRouter);
router.use(modelStatsRouter);
router.use(analyticsRouter);
router.use(modelRegistryRouter);
router.use(featuresRouter);

export default router;
