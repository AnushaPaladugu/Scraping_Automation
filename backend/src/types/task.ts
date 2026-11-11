import { ScrapingMethod, ScrapingStatus } from "./scraper";

export type TaskStatus = "queued" | "processing" | "completed" | "failed" | "stopped";

export interface CompanyTaskProgress {
  companyName: string;
  status: "queued" | "discovering" | "scraping" | "completed" | "no_jobs" | "failed";
  scrapingStatus?: ScrapingStatus;
  method?: ScrapingMethod;
  ats?: string;
  careerUrl?: string;
  jobsFound: number;
  validJobsCount: number;
  invalidJobsCount: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface BulkScrapingTask {
  taskId: string;
  status: TaskStatus;
  sourceUploadId?: string;
  sourceFilename?: string;
  totalCompanies: number;
  processedCompanies: number;
  successfulCompanies: number;
  noJobsCompanies: number;
  failedCompanies: number;
  totalJobsExtracted: number;
  totalValidJobs: number;
  totalInvalidJobs: number;
  breakdownByMethod: {
    api: number;
    jsonld: number;
    static: number;
    playwright: number;
  };
  companies: CompanyTaskProgress[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}
