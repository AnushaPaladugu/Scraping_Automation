import { Router } from "express";
import companyRoutes from "./company.routes";
import scrapeRoutes from "./scrape.routes";
import jobRoutes from "./job.routes";
import logRoutes from "./log.routes";

const router = Router();

router.use("/", companyRoutes);
router.use("/", scrapeRoutes);
router.use("/", jobRoutes);
router.use("/", logRoutes);

export default router;
