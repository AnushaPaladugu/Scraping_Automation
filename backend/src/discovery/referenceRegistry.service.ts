import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { CompanyDiscoveryResult } from "../types/company";
import { logger } from "../utils/logger";

interface RegistryEntry {
  companyName: string;
  companyUrl: string | null;
  careerUrl: string | null;
  ats: string;
  companySlug?: string;
  apiUrl?: string;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
}

export class ReferenceRegistryService {
  private static cache: Map<string, RegistryEntry> = new Map();
  private static isLoaded = false;
  private static loadPromise: Promise<void> | null = null;

  public static async init(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loadData();
    return this.loadPromise;
  }

  private static async loadData(): Promise<void> {
    const possiblePaths = [
      path.resolve(process.cwd(), "ats.xlsx"),
      path.resolve(process.cwd(), "../ats.xlsx"),
      path.resolve(__dirname, "../../../ats.xlsx"),
    ];

    const filePath = possiblePaths.find((p) => fs.existsSync(p));
    if (!filePath) {
      logger.warn("Reference ATS pattern sheet not found on disk; skipping reference cache");
      this.isLoaded = true;
      return;
    }

    try {
      const start = Date.now();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const sheet = workbook.getWorksheet("All Companies") || workbook.worksheets[0];
      if (!sheet) {
        this.isLoaded = true;
        return;
      }

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const vals = row.values as any[];
        if (!vals) return;

        // In ExcelJS, vals is 1-indexed
        const rawName = String(vals[1] || "").trim();
        if (!rawName) return;

        const companyUrl = String(vals[2] || "").trim().replace(/\/$/, "") || null;
        const careerUrl = String(vals[3] || "").trim() || null;
        const ats = String(vals[4] || "").trim() || "Custom / In-House Portal";
        const slug = String(vals[5] || "").trim() || undefined;
        const apiUrl = String(vals[7] || "").trim() || undefined;
        const industry = String(vals[8] || "").trim() || undefined;
        const state = String(vals[9] || "").trim() || undefined;
        const city = String(vals[10] || "").trim() || undefined;
        const country = String(vals[11] || "").trim() || undefined;

        const entry: RegistryEntry = {
          companyName: rawName,
          companyUrl,
          careerUrl,
          ats,
          companySlug: slug,
          apiUrl,
          industry,
          city,
          state,
          country,
        };

        // Key 1: Exact stripped alphanumeric lowercase
        const key1 = rawName.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (key1) this.cache.set(key1, entry);

        // Key 2: Legal stripped brand token (e.g. "codestone group ltd" -> "codestone")
        const brandKey = rawName
          .toLowerCase()
          .replace(/\b(ltd|limited|inc|corp|corporation|group|technologies|holdings|services)\b/g, "")
          .replace(/[^a-z0-9]/g, "");
        if (brandKey && brandKey.length > 2 && !this.cache.has(brandKey)) {
          this.cache.set(brandKey, entry);
        }
      });

      this.isLoaded = true;
      logger.info(`Loaded ${this.cache.size} verified company reference entries in ${Date.now() - start}ms`);
    } catch (err: any) {
      logger.warn(`Failed to preload reference registry: ${err.message}`);
      this.isLoaded = true;
    }
  }

  /**
   * Instant 0ms lookup for any matching company
   */
  public static lookup(rawName: string): Partial<CompanyDiscoveryResult> | null {
    if (!rawName) return null;
    const cleanKey = rawName.toLowerCase().replace(/[^a-z0-9]/g, "");

    let match = this.cache.get(cleanKey);
    if (!match) {
      const brandKey = rawName
        .toLowerCase()
        .replace(/\b(ltd|limited|inc|corp|corporation|group|technologies|holdings|services)\b/g, "")
        .replace(/[^a-z0-9]/g, "");
      if (brandKey && brandKey.length > 2) {
        match = this.cache.get(brandKey);
      }
    }

    if (match) {
      return {
        companyName: match.companyName,
        companyUrl: match.companyUrl,
        careerUrl: match.careerUrl,
        ats: match.ats,
        atsUrl: match.careerUrl,
        companySlug: match.companySlug,
        apiUrl: match.apiUrl,
        detectionStatus: "confirmed",
        confidence: 1.0,
        detectionMethod: match.apiUrl
          ? `ats_api (${match.ats})`
          : match.ats && match.ats !== "Custom" && match.ats !== "Custom / In-House Portal" && match.ats !== "None"
          ? `ats_pattern (${match.ats})`
          : "html_pagination",
        verified: true,
        industry: match.industry,
        city: match.city,
        state: match.state,
        country: match.country,
      };
    }

    return null;
  }
}
