export type DetectionStatus = "confirmed" | "inferred" | "failed";

export interface CompanyDiscoveryResult {
  id?: string | number;
  companyName: string;
  company?: string;
  companyUrl: string | null;
  careerUrl: string | null;
  ats: string;
  atsUrl: string | null;
  companySlug?: string;
  slug?: string;
  apiUrl?: string;
  public_api?: boolean;
  public_api_data?: string;
  detectionStatus: DetectionStatus;
  confidence: number;
  detectionMethod: string;
  verified: boolean;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  error?: string;
}

export type RemoteType = "Remote" | "Hybrid" | "Onsite" | null;
export type EmploymentType = "Full-time" | "Part-time" | "Contract" | "Internship" | "Temporary" | null;

export interface ScrapeFilters {
  country?: string;
  postedWithinDays?: number;
  keyword?: string;
}

export interface JobScope {
  source: "single_discovery" | "bulk_scrape" | "all";
  companyName?: string;
  taskId?: string;
  jobs?: NormalizedJob[];
}

export interface NormalizedJob {
  company_name: string;
  job_title: string;
  job_url: string;
  job_id: string | null;
  location: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  remote_type: RemoteType;
  employment_type: EmploymentType;
  department: string | null;
  category: string | null;
  description: string | null;
  requirements: string | null;
  salary: string | null;
  posted_date: string | null;
  closing_date: string | null;
  ats: string | null;
  source: string;
  source_type: "api" | "jsonld" | "static" | "playwright";
  scraped_at: string;
  fingerprint: string;
  taskId?: string;
  metadata?: Record<string, any>;
}

export interface CompanyTaskProgress {
  companyName: string;
  status: "queued" | "discovering" | "scraping" | "completed" | "no_jobs" | "failed";
  scrapingStatus?: "SUCCESS" | "NO_JOBS" | "PARTIAL_SUCCESS" | "FAILED";
  method?: "api" | "jsonld" | "static" | "playwright";
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
  status: "queued" | "processing" | "completed" | "failed" | "stopped";
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

export interface SystemMetrics {
  totalJobs: number;
  totalCompanies: number;
  totalRejectedJobs: number;
  methodCounts: {
    api: number;
    jsonld: number;
    static: number;
    playwright: number;
  };
  atsCounts: Record<string, number>;
  remoteCounts: Record<string, number>;
}

export interface LogEntry {
  company?: string;
  stage: string;
  method?: string;
  status: "success" | "warning" | "error" | "info";
  jobsFound?: number;
  message: string;
  timestamp: string;
}
