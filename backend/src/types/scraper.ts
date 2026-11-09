import { NormalizedJob, RejectedJobRecord } from "./job";
import { CompanyDiscoveryResult } from "./company";

export type ScrapingStatus = "SUCCESS" | "NO_JOBS" | "PARTIAL_SUCCESS" | "FAILED";
export type ScrapingMethod = "api" | "jsonld" | "static" | "playwright";

export interface ScrapeFilters {
  country?: string;
  postedWithinDays?: number;
  keyword?: string;
}

export interface ScraperResult {
  success: boolean;
  status: ScrapingStatus;
  method: ScrapingMethod;
  jobs: NormalizedJob[];
  totalJobs: number;
  invalidJobs: RejectedJobRecord[];
  error?: string;
  metadata?: Record<string, any>;
  appliedFilters?: ScrapeFilters;
}

export interface IScraper {
  name: string;
  method: ScrapingMethod;
  canHandle(companyInfo: CompanyDiscoveryResult, prefetchHtml?: string): Promise<boolean> | boolean;
  scrape(companyInfo: CompanyDiscoveryResult, prefetchHtml?: string, filters?: ScrapeFilters): Promise<ScraperResult>;
}
