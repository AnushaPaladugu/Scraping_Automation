import { Request, Response } from "express";
import pLimit from "p-limit";
import { CompanyDiscoveryService } from "../discovery/companyDiscovery.service";
import { getValidatedExtension, parseCompanyBuffer } from "../utils/fileParser";
import { storageService } from "../storage/fileStorage.service";
import { s3Service } from "../storage/s3.service";
import { uploadRepository } from "../db/uploadRepository";
import { ExcelExporter } from "../exporters/excelExporter";
import { JsonExporter } from "../exporters/jsonExporter";
import { logger } from "../utils/logger";
import { S3UploadResult } from "../types/storage";

export class CompanyController {
  public static async discoverSingle(req: Request, res: Response) {
    try {
      const { companyName, companyUrl, careerUrl, industry, city, state, country } = req.body;
      if (!companyName) {
        return res.status(400).json({ error: "companyName is required" });
      }

      logger.info(`Single company discovery requested for: ${companyName}`);
      const result = await CompanyDiscoveryService.discover({
        companyName,
        companyUrl,
        careerUrl,
        industry,
        city,
        state,
        country,
      });

      // Save to storage
      await storageService.saveCompanies([result]);

      return res.status(200).json(result);
    } catch (err: any) {
      logger.error(`Error in discoverSingle: ${err.message}`);
      return res.status(500).json({ error: err.message || "Failed to discover company" });
    }
  }

  public static async uploadCompanies(req: Request, res: Response) {
    let uploadedS3Key: string | null = null;

    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: "No file uploaded. Please upload a CSV or Excel file." });
      }

      const { originalname, mimetype, size, buffer } = req.file;
      logger.info(`Company file uploaded: ${originalname} (${size} bytes)`);

      const fileExtension = getValidatedExtension(originalname);
      const parseResult = await parseCompanyBuffer(buffer, originalname);

      let s3Result: S3UploadResult | null = null;
      let downloadUrl: string | null = null;
      let storageStatus: "stored" | "skipped" = "skipped";
      let warning: string | undefined;

      if (s3Service.isAvailable()) {
        s3Result = await s3Service.uploadBuffer({
          buffer,
          originalFilename: originalname,
          mimeType: mimetype,
        });
        uploadedS3Key = s3Result.key;
        storageStatus = "stored";
        downloadUrl = await s3Service.getPresignedDownloadUrl(s3Result.key, originalname);
        logger.log({
          stage: "upload",
          status: "success",
          message: `Uploaded ${originalname} to S3 (${s3Result.bucket}/${s3Result.key})`,
        });
      } else {
        warning = "S3 storage is not enabled/configured yet; parsed file data was saved to MySQL only.";
        logger.log({
          stage: "upload",
          status: "warning",
          message: `${warning} (${originalname})`,
        });
      }

      const savedRecord = await uploadRepository.createUploadedFileWithRows({
        originalFilename: originalname,
        mimeType: mimetype || "application/octet-stream",
        fileExtension,
        fileSize: size,
        s3Bucket: s3Result?.bucket ?? null,
        s3Key: s3Result?.key ?? null,
        s3Etag: s3Result?.etag ?? null,
        storageStatus,
        detectedColumn: parseResult.detectedColumn,
        detectedSheet: parseResult.detectedSheet ?? null,
        totalRows: parseResult.totalRows,
        validCount: parseResult.validCompanies.length,
        invalidCount: parseResult.invalidRows.length,
        rows: parseResult.allRows,
      });

      return res.status(200).json({
        message: "File parsed and saved successfully",
        uploadId: savedRecord.id,
        filename: originalname,
        detectedColumn: parseResult.detectedColumn,
        detectedSheet: parseResult.detectedSheet,
        totalRows: parseResult.totalRows,
        validCount: parseResult.validCompanies.length,
        invalidCount: parseResult.invalidRows.length,
        companies: parseResult.validCompanies,
        invalidRows: parseResult.invalidRows,
        storageStatus,
        s3: s3Result ? { ...s3Result, downloadUrl } : null,
        ...(warning ? { warning } : {}),
      });
    } catch (err: any) {
      if (uploadedS3Key) {
        try {
          await s3Service.deleteFile(uploadedS3Key);
          logger.warn(`Rolled back S3 object ${uploadedS3Key} after DB failure.`);
        } catch (cleanupErr: any) {
          logger.error(`Failed to rollback S3 object ${uploadedS3Key}: ${cleanupErr.message}`);
        }
      }
      logger.error(`Error in uploadCompanies: ${err.message}`);
      const statusCode = err.status || (err.message?.includes("Unsupported") || err.message?.includes("Required company column") || err.message?.includes("worksheets") ? 400 : 500);
      return res.status(statusCode).json({ error: err.message || "Failed to process uploaded file" });
    }
  }

  public static async listUploads(req: Request, res: Response) {
    try {
      const limit = req.query.limit ? Math.min(parseInt(String(req.query.limit), 10) || 50, 100) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) || 0 : 0;

      const result = await uploadRepository.listUploadedFiles(limit, offset);
      const s3Ready = s3Service.isAvailable();

      return res.status(200).json({
        total: result.total,
        s3Configured: s3Ready,
        uploads: result.files.map((file) => ({
          ...file,
          canDownloadFromS3: Boolean(file.s3Key && s3Ready),
        })),
      });
    } catch (err: any) {
      logger.error(`Error in listUploads: ${err.message}`);
      return res.status(500).json({ error: err.message || "Failed to list uploaded files" });
    }
  }

  public static async getUploadById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const loaded = await uploadRepository.getUploadedFileWithRows(id);
      if (!loaded) {
        return res.status(404).json({ error: `Uploaded file not found: ${id}` });
      }

      let downloadUrl: string | null = null;
      if (loaded.file.s3Key && s3Service.isAvailable()) {
        downloadUrl = await s3Service.getPresignedDownloadUrl(
          loaded.file.s3Key,
          loaded.file.originalFilename
        );
      }

      return res.status(200).json({
        uploadId: loaded.file.id,
        file: { ...loaded.file, downloadUrl },
        filename: loaded.file.originalFilename,
        detectedColumn: loaded.file.detectedColumn,
        detectedSheet: loaded.file.detectedSheet,
        totalRows: loaded.file.totalRows,
        validCount: loaded.file.validCount,
        invalidCount: loaded.file.invalidCount,
        companies: loaded.companies,
        invalidRows: loaded.invalidRows,
      });
    } catch (err: any) {
      logger.error(`Error in getUploadById: ${err.message}`);
      return res.status(500).json({ error: err.message || "Failed to load uploaded file" });
    }
  }

  public static async downloadUpload(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const file = await uploadRepository.getUploadedFileById(id);
      if (!file) {
        return res.status(404).json({ error: `Uploaded file not found: ${id}` });
      }
      if (!file.s3Key) {
        return res.status(404).json({
          error: "Original file is not in S3 (S3 storage was not configured when this file was uploaded).",
        });
      }
      if (!s3Service.isAvailable()) {
        return res.status(503).json({
          error: "S3 storage is currently disabled or unconfigured. Enable S3 in backend/.env to download.",
        });
      }

      const downloadUrl = await s3Service.getPresignedDownloadUrl(file.s3Key, file.originalFilename);
      if (req.query.mode === "url") {
        return res.status(200).json({
          uploadId: file.id,
          filename: file.originalFilename,
          s3Key: file.s3Key,
          downloadUrl,
        });
      }

      return res.redirect(downloadUrl);
    } catch (err: any) {
      logger.error(`Error in downloadUpload: ${err.message}`);
      return res.status(500).json({ error: err.message || "Failed to generate download URL" });
    }
  }

  public static async deleteUpload(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const existing = await uploadRepository.getUploadedFileById(id);
      if (!existing) {
        return res.status(404).json({ error: `Uploaded file not found: ${id}` });
      }

      if (existing.s3Key && s3Service.isAvailable()) {
        await s3Service.deleteFile(existing.s3Key);
      }

      await uploadRepository.deleteUploadedFile(id);
      return res.status(200).json({
        message: "Uploaded file deleted successfully",
        id,
        deletedFromS3: Boolean(existing.s3Key && s3Service.isAvailable()),
      });
    } catch (err: any) {
      logger.error(`Error in deleteUpload: ${err.message}`);
      return res.status(500).json({ error: err.message || "Failed to delete uploaded file" });
    }
  }

  public static async discoverBulk(req: Request, res: Response) {
    try {
      const { companies } = req.body;
      if (!Array.isArray(companies) || companies.length === 0) {
        return res.status(400).json({ error: "companies array is required" });
      }

      logger.info(`Bulk company discovery requested for ${companies.length} companies`);

      const limit = pLimit(8);
      const results = await Promise.all(
        companies.map((comp) => limit(() => CompanyDiscoveryService.discover(comp)))
      );

      await storageService.saveCompanies(results);

      return res.status(200).json({
        total: results.length,
        results,
      });
    } catch (err: any) {
      logger.error(`Error in discoverBulk: ${err.message}`);
      return res.status(500).json({ error: err.message || "Bulk discovery failed" });
    }
  }

  public static async listCompanies(req: Request, res: Response) {
    try {
      const companies = await storageService.getCompanies();
      return res.status(200).json({ total: companies.length, companies });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  public static async exportExcel(req: Request, res: Response) {
    try {
      const companies = await storageService.getCompanies();
      const buffer = await ExcelExporter.exportCompaniesToBuffer(companies);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", "attachment; filename=discovered_companies.xlsx");
      return res.send(buffer);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  public static async exportJson(req: Request, res: Response) {
    try {
      const companies = await storageService.getCompanies();
      const jsonStr = JsonExporter.exportCompaniesToJsonString(companies);

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", "attachment; filename=discovered_companies.json");
      return res.send(jsonStr);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  public static async exportDetailsExcel(req: Request, res: Response) {
    try {
      let companies = req.body?.companies;
      if (!Array.isArray(companies) || companies.length === 0) {
        companies = await storageService.getCompanies();
      }
      const buffer = await ExcelExporter.exportCompanyDetailsToBuffer(companies);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", "attachment; filename=company_details.xlsx");
      return res.send(buffer);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
}
