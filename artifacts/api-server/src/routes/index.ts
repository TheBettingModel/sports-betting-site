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
import notificationPreferencesRouter from "./notification-preferences";
import preferencesRouter from "./preferences";
import clerkProxyRouter from "./clerk-proxy";
import legalRouter from "./legal";
import resultsRouter from "./results";
import subscriptionsRouter from "./subscriptions";
import chatRouter from "./chat";

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
router.use(notificationPreferencesRouter);
router.use(preferencesRouter);
router.use(clerkProxyRouter);
router.use(legalRouter);
router.use(resultsRouter);
router.use(subscriptionsRouter);
router.use(chatRouter);

export default router;
