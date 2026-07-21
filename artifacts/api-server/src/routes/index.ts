import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gamesRouter from "./games";
import modelStatsRouter from "./model-stats";
import analyticsRouter from "./analytics";
import modelRegistryRouter from "./model-registry";
import featuresRouter from "./features";
import adminRouter from "./admin";
import webhooksRouter from "./webhooks";
import pushTokensRouter from "./push-tokens";
import clerkProxyRouter from "./clerk-proxy";
import legalRouter from "./legal";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gamesRouter);
router.use(modelStatsRouter);
router.use(analyticsRouter);
router.use(modelRegistryRouter);
router.use(featuresRouter);
router.use(adminRouter);
router.use(webhooksRouter);
router.use(pushTokensRouter);
router.use(clerkProxyRouter);
router.use(legalRouter);

export default router;
