import { Request, Response } from "express";
import fs from "fs";
import pLimit from "p-limit";
import { CompanyDiscoveryService } from "../discovery/companyDiscovery.service";
import { parseCompanyFile } from "../utils/fileParser";
import { storageService } from "../storage/fileStorage.service";
import { ExcelExporter } from "../exporters/excelExporter";
import { JsonExporter } from "../exporters/jsonExporter";
import { logger } from "../utils/logger";

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
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded. Please upload a CSV or Excel file." });
      }

      const filePath = req.file.path;
      logger.info(`Company file uploaded: ${req.file.originalname} (${req.file.size} bytes)`);

      const parseResult = await parseCompanyFile(filePath, req.file.originalname);

      // Clean up uploaded temporary file
      try {
        fs.unlinkSync(filePath);
      } catch {}

      return res.status(200).json({
        message: "File parsed successfully",
        filename: req.file.originalname,
        detectedColumn: parseResult.detectedColumn,
        totalRows: parseResult.totalRows,
        validCount: parseResult.validCompanies.length,
        invalidCount: parseResult.invalidRows.length,
        companies: parseResult.validCompanies,
        invalidRows: parseResult.invalidRows,
      });
    } catch (err: any) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      logger.error(`Error in uploadCompanies: ${err.message}`);
      return res.status(400).json({ error: err.message || "Failed to parse file" });
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
