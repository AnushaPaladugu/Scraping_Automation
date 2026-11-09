import { CompanyDiscoveryResult } from "../types/company";
import { ScraperResult, ScrapingMethod, ScrapeFilters } from "../types/scraper";

export interface IScraper {
  name: string;
  method: ScrapingMethod;
  canHandle(companyInfo: CompanyDiscoveryResult, prefetchHtml?: string): Promise<boolean> | boolean;
  scrape(companyInfo: CompanyDiscoveryResult, prefetchHtml?: string, filters?: ScrapeFilters): Promise<ScraperResult>;
}
