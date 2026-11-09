import { CompanyDiscoveryResult } from "../../types/company";
import { ScraperResult } from "../../types/scraper";
import { IScraper } from "../scraper.interface";
import { normalizeRawJob } from "../../processors";
import { JobValidator } from "../../validators/jobValidator";
import { JobDeduplicator } from "../../deduplication/deduplicator";
import { scrapeGreenhouse } from "./adapters/greenhouse.adapter";
import { scrapeLever } from "./adapters/lever.adapter";
import { scrapeAshby } from "./adapters/ashby.adapter";
import { scrapeBambooHR } from "./adapters/bamboohr.adapter";
import { scrapeSmartRecruiters } from "./adapters/smartrecruiters.adapter";
import { scrapeWorkable } from "./adapters/workable.adapter";
import { scrapeRippling } from "./adapters/rippling.adapter";
import { scrapeTeamtailor } from "./adapters/teamtailor.adapter";
import { scrapeHiBob } from "./adapters/hibob.adapter";
import { scrapeWorkday } from "./adapters/workday.adapter";
import { logger } from "../../utils/logger";

export class ApiScraper implements IScraper {
  public name = "ApiScraper";
  public method = "api" as const;

  public canHandle(companyInfo: CompanyDiscoveryResult): boolean {
    const ats = (companyInfo.ats || "").toLowerCase();
    const hasSlug = !!companyInfo.companySlug;
    const hasApi = !!companyInfo.apiUrl;

    return (
      hasApi ||
      (hasSlug &&
        [
          "greenhouse",
          "lever",
          "ashby",
          "bamboohr",
          "smartrecruiters",
          "workable",
          "rippling",
          "teamtailor",
          "hibob",
          "workday",
        ].includes(ats)) ||
      ats === "teamtailor" ||
      ats === "hibob" ||
      ats === "workday"
    );
  }

  public async scrape(companyInfo: CompanyDiscoveryResult): Promise<ScraperResult> {
    logger.info(`Starting API scraping for ATS: ${companyInfo.ats}`, companyInfo.companyName);

    try {
      const atsLower = (companyInfo.ats || "").toLowerCase();
      let rawJobs: any[] = [];

      if (atsLower === "greenhouse") {
        rawJobs = await scrapeGreenhouse(companyInfo);
      } else if (atsLower === "lever") {
        rawJobs = await scrapeLever(companyInfo);
      } else if (atsLower === "ashby") {
        rawJobs = await scrapeAshby(companyInfo);
      } else if (atsLower === "bamboohr") {
        rawJobs = await scrapeBambooHR(companyInfo);
      } else if (atsLower === "smartrecruiters") {
        rawJobs = await scrapeSmartRecruiters(companyInfo);
      } else if (atsLower === "workable") {
        rawJobs = await scrapeWorkable(companyInfo);
      } else if (atsLower === "rippling") {
        rawJobs = await scrapeRippling(companyInfo);
      } else if (atsLower === "teamtailor" || (companyInfo.apiUrl && companyInfo.apiUrl.includes("teamtailor"))) {
        rawJobs = await scrapeTeamtailor(companyInfo);
      } else if (companyInfo.apiUrl && (companyInfo.apiUrl.endsWith(".rss") || companyInfo.apiUrl.endsWith(".xml"))) {
        rawJobs = await scrapeTeamtailor(companyInfo);
      } else if (atsLower === "hibob" || (companyInfo.apiUrl && companyInfo.apiUrl.includes("hibob"))) {
        rawJobs = await scrapeHiBob(companyInfo);
      } else if (atsLower === "workday" || (companyInfo.atsUrl && companyInfo.atsUrl.includes("myworkdayjobs.com"))) {
        rawJobs = await scrapeWorkday(companyInfo);
      }

      // Check if source processed successfully but had 0 jobs
      if (rawJobs.length === 0) {
        return {
          success: true,
          status: "NO_JOBS",
          method: "api",
          jobs: [],
          totalJobs: 0,
          invalidJobs: [],
          metadata: { ats: companyInfo.ats, message: "No active jobs found in API" },
        };
      }

      // Process fields
      const normalizedJobs = rawJobs.map((r) =>
        normalizeRawJob(r, {
          companyName: companyInfo.companyName,
          source: companyInfo.careerUrl || companyInfo.atsUrl || "API",
          sourceType: "api",
          ats: companyInfo.ats,
        })
      );

      // Validate
      const { validJobs, invalidJobs } = JobValidator.validateBatch(normalizedJobs);

      // Deduplicate
      const deduplicator = new JobDeduplicator();
      const { uniqueJobs, duplicateCount } = deduplicator.deduplicate(validJobs);

      const status =
        uniqueJobs.length > 0
          ? invalidJobs.length > 0
            ? "PARTIAL_SUCCESS"
            : "SUCCESS"
          : "FAILED";

      return {
        success: uniqueJobs.length > 0,
        status,
        method: "api",
        jobs: uniqueJobs,
        totalJobs: uniqueJobs.length,
        invalidJobs,
        metadata: {
          duplicatesRemoved: duplicateCount,
          rawCount: rawJobs.length,
          validCount: validJobs.length,
          invalidCount: invalidJobs.length,
        },
      };
    } catch (err: any) {
      logger.error(`API scraping error: ${err.message}`, companyInfo.companyName);
      return {
        success: false,
        status: "FAILED",
        method: "api",
        jobs: [],
        totalJobs: 0,
        invalidJobs: [],
        error: `API Scraping error: ${err.message}`,
      };
    }
  }
}
