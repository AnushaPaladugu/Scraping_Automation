import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import path from "path";
import { CompanyController } from "../controllers/company.controller";

const router = Router();
const ALLOWED_EXTENSIONS = new Set([".csv", ".xlsx", ".xls"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB limit
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      const err: any = new Error(`Unsupported file extension: ${ext || "unknown"}. Please upload .csv, .xlsx, or .xls.`);
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

const handleUploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (err: any) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File size exceeds the 25 MB limit." });
    }
    return res.status(err.status || 400).json({ error: err.message || "File upload failed." });
  });
};

router.post("/company/discover", CompanyController.discoverSingle);
router.post("/companies/upload", handleUploadMiddleware, CompanyController.uploadCompanies);
router.get("/companies/uploads", CompanyController.listUploads);
router.get("/companies/uploads/:id", CompanyController.getUploadById);
router.get("/companies/uploads/:id/download", CompanyController.downloadUpload);
router.delete("/companies/uploads/:id", CompanyController.deleteUpload);
router.post("/companies/discover", CompanyController.discoverBulk);
router.get("/companies", CompanyController.listCompanies);
router.get("/companies/export/excel", CompanyController.exportExcel);
router.get("/companies/export/details-excel", CompanyController.exportDetailsExcel);
router.post("/companies/export/details-excel", CompanyController.exportDetailsExcel);
router.get("/companies/export/json", CompanyController.exportJson);

export default router;
