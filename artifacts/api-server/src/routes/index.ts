import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gamesRouter from "./games";
import modelStatsRouter from "./model-stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gamesRouter);
router.use(modelStatsRouter);

export default router;
