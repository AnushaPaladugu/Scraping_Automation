import { Router } from "express";
import { JobController } from "../controllers/job.controller";

const router = Router();

router.get("/jobs", JobController.listJobs);
router.get("/jobs/metrics", JobController.getMetrics);
router.get("/jobs/rejected", JobController.getRejected);
router.get("/jobs/export/excel", JobController.exportExcel);
router.post("/jobs/export/excel", JobController.exportExcel);
router.get("/jobs/export/json", JobController.exportJson);
router.post("/jobs/export/json", JobController.exportJson);

export default router;
