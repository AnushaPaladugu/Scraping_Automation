import { Router } from "express";
import multer from "multer";
import path from "path";
import os from "os";
import { CompanyController } from "../controllers/company.controller";
import fs from "fs";

const router = Router();
const uploadDir = path.join(os.tmpdir(), "scraping_uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB limit
});

router.post("/company/discover", CompanyController.discoverSingle);
router.post("/companies/upload", upload.single("file"), CompanyController.uploadCompanies);
router.post("/companies/discover", CompanyController.discoverBulk);
router.get("/companies", CompanyController.listCompanies);
router.get("/companies/export/excel", CompanyController.exportExcel);
router.get("/companies/export/details-excel", CompanyController.exportDetailsExcel);
router.post("/companies/export/details-excel", CompanyController.exportDetailsExcel);
router.get("/companies/export/json", CompanyController.exportJson);

export default router;
