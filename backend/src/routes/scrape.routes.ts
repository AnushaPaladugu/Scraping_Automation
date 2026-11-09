import { Router } from "express";
import { ScrapeController } from "../controllers/scrape.controller";

const router = Router();

router.post("/scrape/company", ScrapeController.scrapeSingleCompany);
router.post("/scrape/bulk", ScrapeController.startBulkScrape);
router.get("/scrape/status/:jobId", ScrapeController.getScrapeStatus);
router.post("/scrape/cancel/:jobId", ScrapeController.cancelScrape);
router.get("/scrape/tasks", ScrapeController.listTasks);

export default router;
