import { Router } from "express";
import { LogController } from "../controllers/log.controller";

const router = Router();

router.get("/logs", LogController.getLogs);
router.get("/logs/export/json", LogController.exportLogs);

export default router;
