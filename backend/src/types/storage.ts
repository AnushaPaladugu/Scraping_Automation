import { CompanyDiscoveryResult } from "./company";
import { NormalizedJob, RejectedJobRecord } from "./job";
import { BulkScrapingTask } from "./task";

export interface LogEntry {
  company?: string;
  stage:
    | "upload"
    | "discovery"
    | "detection"
    | "strategy"
    | "scraping"
    | "processing"
    | "validation"
    | "deduplication"
    | "export";
  method?: string;
  status: "success" | "warning" | "error" | "info";
  jobsFound?: number;
  message: string;
  timestamp: string;
  details?: any;
}

export interface S3UploadResult {
  bucket: string;
  key: string;
  etag?: string;
  size: number;
  contentType: string;
  uploadedAt: string;
  downloadUrl?: string;
}

export interface UploadedFileMetadata {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileExtension: string;
  fileSize: number;
  s3Bucket: string | null;
  s3Key: string | null;
  s3Etag: string | null;
  storageStatus: "stored" | "skipped" | "deleted";
  detectedColumn: string | null;
  detectedSheet: string | null;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  createdAt: string;
  updatedAt: string;
  downloadUrl?: string | null;
}

export interface IStorageService {
  saveCompanies(companies: CompanyDiscoveryResult[]): Promise<void>;
  getCompanies(): Promise<CompanyDiscoveryResult[]>;
  saveJobs(jobs: NormalizedJob[]): Promise<void>;
  saveTaskJobs(taskId: string, jobs: NormalizedJob[]): Promise<void>;
  getTaskJobs(taskId: string): Promise<NormalizedJob[]>;
  getJobs(filter?: {
    company?: string;
    ats?: string;
    method?: string;
    search?: string;
    remote?: string;
    taskId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: NormalizedJob[]; total: number }>;
  saveRejectedJobs(rejected: RejectedJobRecord[]): Promise<void>;
  getRejectedJobs(): Promise<RejectedJobRecord[]>;
  saveScrapingRun(task: BulkScrapingTask): Promise<void>;
  getScrapingTask(taskId: string): Promise<BulkScrapingTask | null>;
  getAllScrapingTasks(): Promise<BulkScrapingTask[]>;
  saveLog(log: LogEntry): Promise<void>;
  getLogs(limit?: number): Promise<LogEntry[]>;
}
