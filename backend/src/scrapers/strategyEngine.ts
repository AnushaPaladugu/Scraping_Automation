import { CompanyDiscoveryResult } from "../types/company";
import { ScraperResult, ScrapingMethod } from "../types/scraper";
import { IScraper } from "./scraper.interface";
import { ApiScraper } from "./api/apiScraper";
import { JsonLdScraper } from "./jsonld/jsonLdScraper";
import { StaticScraper } from "./static/staticScraper";
import { PlaywrightScraper } from "./playwright/playwrightScraper";
import { fetchUrl } from "../utils/httpClient";
import { logger } from "../utils/logger";
import { matchesCountryFilter } from "../utils/countryMatcher";

export interface StrategySelection {
  method: ScrapingMethod;
  scraper: IScraper;
  reason: string;
  strategyLabel: string;
  prefetchHtml?: string;
}

export class ScrapingStrategyEngine {
  private apiScraper: ApiScraper;
  private jsonLdScraper: JsonLdScraper;
  private staticScraper: StaticScraper;
  private playwrightScraper: PlaywrightScraper;

  constructor() {
    this.apiScraper = new ApiScraper();
    this.jsonLdScraper = new JsonLdScraper();
    this.staticScraper = new StaticScraper();
    this.playwrightScraper = new PlaywrightScraper();
  }

  /**
   * Evaluates the company info and career source to determine the optimal scraping strategy.
   * Priority:
   * 1. ATS / API Strategy
   * 2. JSON-LD Schema Strategy
   * 3. Static HTML Strategy
   * 4. Playwright Dynamic Strategy (Fallback)
   */
  public async selectStrategy(companyInfo: CompanyDiscoveryResult): Promise<StrategySelection> {
    // 1. Check ATS / API availability
    if (this.apiScraper.canHandle(companyInfo)) {
      return {
        method: "api",
        scraper: this.apiScraper,
        reason: `Supported ATS API available: ${companyInfo.ats} (${companyInfo.apiUrl || "configured adapter"})`,
        strategyLabel: "API (GET or POST)",
      };
    }

    // Prefetch career page HTML to inspect structure (lightweight GET)
    let prefetchHtml = "";
    const careerUrl = companyInfo.careerUrl || companyInfo.atsUrl || companyInfo.companyUrl;

    if (careerUrl) {
      try {
        const res = await fetchUrl(careerUrl);
        if (res.ok && typeof res.data === "string") {
          prefetchHtml = res.data;
        }
      } catch {
        // network issue, will fall back to dynamic Playwright
      }
    }

    // 2. Check JSON-LD job schema in HTML
    if (prefetchHtml && this.jsonLdScraper.canHandle(companyInfo, prefetchHtml)) {
      return {
        method: "jsonld",
        scraper: this.jsonLdScraper,
        reason: "Structured JobPosting JSON-LD schema detected in page HTML",
        strategyLabel: "Dynamic (JSON-LD Schema)",
        prefetchHtml,
      };
    }

    // 3. Check Static HTML job listings
    if (prefetchHtml && this.staticScraper.canHandle(companyInfo, prefetchHtml)) {
      return {
        method: "static",
        scraper: this.staticScraper,
        reason: "Static job card elements or vacancy anchors detected in page HTML",
        strategyLabel: "Static (HTML)",
        prefetchHtml,
      };
    }

    // 4. Fallback to Playwright dynamic scraping
    return {
      method: "playwright",
      scraper: this.playwrightScraper,
      reason: "SPA/dynamic rendering or no static jobs found; using Playwright browser fallback",
      strategyLabel: "Dynamic (JavaScript / Playwright)",
    };
  }

  /**
   * Automatically executes the selected scraping strategy.
   */
  public async execute(
    companyInfo: CompanyDiscoveryResult,
    filters?: import("../types/scraper").ScrapeFilters
  ): Promise<ScraperResult> {
    const selection = await this.selectStrategy(companyInfo);
    logger.info(
      `Selected strategy: ${selection.method.toUpperCase()} [${selection.strategyLabel}] - Reason: ${selection.reason}`,
      companyInfo.companyName
    );

    let result = await selection.scraper.scrape(companyInfo, selection.prefetchHtml, filters);

    // Dynamic Fallback: If static or jsonld scraping yielded 0 jobs, automatically retry with Playwright dynamic browser
    if (
      selection.method !== "playwright" &&
      (result.jobs.length === 0 || result.status === "NO_JOBS" || !result.success)
    ) {
      logger.info(
        `${selection.method.toUpperCase()} yielded 0 jobs; attempting Playwright dynamic fallback for ${companyInfo.companyName}...`,
        companyInfo.companyName
      );
      try {
        const fallbackResult = await this.playwrightScraper.scrape(companyInfo, undefined, filters);
        if (fallbackResult.jobs.length > 0 || fallbackResult.success) {
          result = fallbackResult;
        }
      } catch (err: any) {
        logger.warn(`Playwright fallback failed: ${err.message}`, companyInfo.companyName);
      }
    }

    // Apply country, posted date, and keyword filters
    result = this.applyFilters(result, filters);

    result.metadata = {
      ...result.metadata,
      strategyReason: selection.reason,
      strategyLabel: selection.strategyLabel,
    };
    (result as any).strategyLabel = selection.strategyLabel;

    return result;
  }

  private applyFilters(
    result: ScraperResult,
    filters?: import("../types/scraper").ScrapeFilters
  ): ScraperResult {
    if (!filters || result.jobs.length === 0) return result;

    let filtered = result.jobs;

    // 1. Country Filter (UK/GB, US/USA, India/IN and global synonyms)
    if (filters.country && filters.country.trim()) {
      filtered = filtered.filter((j) =>
        matchesCountryFilter(j.country, j.location, filters.country)
      );
    }

    // 2. Posted Date Filter
    if (filters.postedWithinDays && filters.postedWithinDays > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filters.postedWithinDays);
      const cutoffStr = cutoff.toISOString().split("T")[0];

      filtered = filtered.filter((j) => {
        if (!j.posted_date) return true; // Keep jobs if exact date is unknown
        return j.posted_date >= cutoffStr;
      });
    }

    // 3. Keyword / Job Title Filter
    if (filters.keyword && filters.keyword.trim()) {
      const targetKw = filters.keyword.toLowerCase().trim();
      filtered = filtered.filter((j) => {
        const t = (j.job_title || "").toLowerCase();
        const d = (j.department || "").toLowerCase();
        return t.includes(targetKw) || d.includes(targetKw);
      });
    }

    const preFilterCount = result.jobs.length;
    const availableLocations = Array.from(
      new Set(result.jobs.map((j) => j.country || j.location).filter(Boolean))
    );

    result.jobs = filtered;
    result.totalJobs = filtered.length;
    result.appliedFilters = filters;

    result.metadata = {
      ...result.metadata,
      rawScrapedCount: result.metadata?.rawPlaywrightCount || preFilterCount,
      preFilterValidCount: preFilterCount,
      validCount: filtered.length,
      filteredOutCount: preFilterCount - filtered.length,
    };

    if (filtered.length === 0 && (result.status === "SUCCESS" || result.status === "PARTIAL_SUCCESS")) {
      result.status = "NO_JOBS";
      const locNote =
        availableLocations.length > 0
          ? ` (Extracted portal jobs are located in: ${availableLocations.slice(0, 4).join(", ")})`
          : "";
      result.metadata = {
        ...result.metadata,
        message: `Extracted ${preFilterCount} active jobs from the portal, but 0 matched the filter for Country: "${filters.country || "Any"}"${filters.postedWithinDays ? `, Date: Past ${filters.postedWithinDays} days` : ""}${locNote}.`,
      };
    }

    return result;
  }
}
