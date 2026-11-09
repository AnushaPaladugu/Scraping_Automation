import * as cheerio from "cheerio";
import { CompanyDiscoveryResult } from "../../types/company";
import { ScraperResult } from "../../types/scraper";
import { IScraper } from "../scraper.interface";
import { fetchUrl } from "../../utils/httpClient";
import { normalizeRawJob } from "../../processors";
import { JobValidator } from "../../validators/jobValidator";
import { JobDeduplicator } from "../../deduplication/deduplicator";
import { logger } from "../../utils/logger";

export class JsonLdScraper implements IScraper {
  public name = "JsonLdScraper";
  public method = "jsonld" as const;

  public canHandle(companyInfo: CompanyDiscoveryResult, prefetchHtml?: string): boolean {
    if (!prefetchHtml) return false;
    return prefetchHtml.includes('"@type"') && prefetchHtml.includes('"JobPosting"');
  }

  public async scrape(companyInfo: CompanyDiscoveryResult, prefetchHtml?: string): Promise<ScraperResult> {
    const url = companyInfo.careerUrl || companyInfo.atsUrl || companyInfo.companyUrl;
    if (!url) {
      return {
        success: false,
        status: "FAILED",
        method: "jsonld",
        jobs: [],
        totalJobs: 0,
        invalidJobs: [],
        error: "No career URL available for JSON-LD scraping",
      };
    }

    logger.info(`Starting JSON-LD scraping on ${url}`, companyInfo.companyName);

    try {
      let html = prefetchHtml || "";
      if (!html) {
        const res = await fetchUrl(url);
        if (!res.ok || typeof res.data !== "string") {
          return {
            success: false,
            status: "FAILED",
            method: "jsonld",
            jobs: [],
            totalJobs: 0,
            invalidJobs: [],
            error: `Failed to fetch page for JSON-LD extraction: ${res.error || `HTTP ${res.status}`}`,
          };
        }
        html = res.data;
      }

      const $ = cheerio.load(html);
      const rawPostings: any[] = [];

      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const content = $(el).contents().text();
          if (!content || !content.includes("JobPosting")) return;

          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            parsed.forEach((item) => {
              if (item["@type"] === "JobPosting") rawPostings.push(item);
            });
          } else if (parsed["@graph"] && Array.isArray(parsed["@graph"])) {
            parsed["@graph"].forEach((item: any) => {
              if (item["@type"] === "JobPosting") rawPostings.push(item);
            });
          } else if (parsed["@type"] === "JobPosting") {
            rawPostings.push(parsed);
          }
        } catch {
          // ignore JSON parse errors in script tags
        }
      });

      if (rawPostings.length === 0) {
        return {
          success: true,
          status: "NO_JOBS",
          method: "jsonld",
          jobs: [],
          totalJobs: 0,
          invalidJobs: [],
          metadata: { message: "Page contains no active JobPosting JSON-LD schemas" },
        };
      }

      const normalizedJobs = rawPostings.map((p) => {
        const hiringOrg = p.hiringOrganization?.name;
        const jobUrl = p.url || p.sameAs || url;
        const loc = Array.isArray(p.jobLocation) ? p.jobLocation[0] : p.jobLocation;

        return normalizeRawJob(
          {
            title: p.title,
            company: hiringOrg || companyInfo.companyName,
            url: jobUrl,
            id: p.identifier?.value || p.identifier || undefined,
            location: loc,
            description: p.description,
            employment_type: p.employmentType,
            posted_date: p.datePosted,
            closing_date: p.validThrough,
            salary: p.baseSalary,
            category: p.occupationalCategory,
            ats: companyInfo.ats,
          },
          {
            companyName: companyInfo.companyName,
            source: url,
            sourceType: "jsonld",
            ats: companyInfo.ats,
          }
        );
      });

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
        method: "jsonld",
        jobs: uniqueJobs,
        totalJobs: uniqueJobs.length,
        invalidJobs,
        metadata: {
          duplicatesRemoved: duplicateCount,
          rawJsonLdCount: rawPostings.length,
          validCount: validJobs.length,
          invalidCount: invalidJobs.length,
        },
      };
    } catch (err: any) {
      logger.error(`JSON-LD scraping error: ${err.message}`, companyInfo.companyName);
      return {
        success: false,
        status: "FAILED",
        method: "jsonld",
        jobs: [],
        totalJobs: 0,
        invalidJobs: [],
        error: `JSON-LD Scraping error: ${err.message}`,
      };
    }
  }
}
