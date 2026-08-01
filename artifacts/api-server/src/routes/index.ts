import { Router } from "express";
import authRouter from "./auth.js";
import umrahRouter from "./umrah.js";
import visasRouter from "./visas.js";
import dashboardRouter from "./dashboard.js";
import archiveRouter from "./archive.js";
import settingsRouter, { publicSettingsRouter } from "./settings.js";
import providerRouter from "./provider.js";
import statementRouter from "./statement.js";
import vouchersRouter from "./vouchers.js";

const router = Router();

router.get("/healthz", (_req, res) => res.json({ status: "ok" }));
// Root of the API service — the deployment health probe hits GET /api and requires a 200.
router.get("/", (_req, res) => res.json({ status: "ok" }));

router.use(publicSettingsRouter);
router.use(authRouter);
router.use(umrahRouter);
router.use(visasRouter);
router.use(dashboardRouter);
router.use(archiveRouter);
router.use(settingsRouter);
router.use(providerRouter);
router.use(statementRouter);
router.use(vouchersRouter);

export default router;
