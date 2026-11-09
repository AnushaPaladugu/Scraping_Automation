import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { IStorageService, LogEntry } from "./storage.interface";
import { CompanyDiscoveryResult } from "../types/company";
import { NormalizedJob, RejectedJobRecord } from "../types/job";
import { BulkScrapingTask } from "../types/task";
import { config } from "../config";
import { logger } from "../utils/logger";
import { JobDeduplicator } from "../deduplication/deduplicator";

export class FileStorageService implements IStorageService {
  private companiesFile: string;
  private jobsFile: string;
  private rejectedJobsFile: string;
  private tasksFile: string;
  private tasksDir: string;

  constructor() {
    this.companiesFile = path.join(config.DATA_DIR, "companies.json");
    this.jobsFile = path.join(config.DATA_DIR, "jobs.json");
    this.rejectedJobsFile = path.join(config.DATA_DIR, "rejected_jobs.json");
    this.tasksFile = path.join(config.DATA_DIR, "tasks.json");
    this.tasksDir = path.join(config.DATA_DIR, "tasks");

    this.initFiles();
  }

  private initFiles() {
    if (!fs.existsSync(config.DATA_DIR)) fs.mkdirSync(config.DATA_DIR, { recursive: true });
    if (!fs.existsSync(this.tasksDir)) fs.mkdirSync(this.tasksDir, { recursive: true });
    if (!fs.existsSync(this.companiesFile)) fs.writeFileSync(this.companiesFile, "[]", "utf8");
    if (!fs.existsSync(this.jobsFile)) fs.writeFileSync(this.jobsFile, "[]", "utf8");
    if (!fs.existsSync(this.rejectedJobsFile)) fs.writeFileSync(this.rejectedJobsFile, "[]", "utf8");
    if (!fs.existsSync(this.tasksFile)) fs.writeFileSync(this.tasksFile, "[]", "utf8");
  }

  private readJson<T>(filePath: string): T[] {
    try {
      if (!fs.existsSync(filePath)) return [];
      const content = fs.readFileSync(filePath, "utf8");
      return JSON.parse(content || "[]");
    } catch {
      return [];
    }
  }

  private writeJson(filePath: string, data: any) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
      logger.error(`Error saving to ${filePath}: ${e}`);
    }
  }

  public async saveCompanies(companies: CompanyDiscoveryResult[]): Promise<void> {
    const existing = this.readJson<CompanyDiscoveryResult>(this.companiesFile);
    const map = new Map<string, CompanyDiscoveryResult>();

    existing.forEach((c) => map.set(c.companyName.toLowerCase(), c));
    companies.forEach((c) => map.set(c.companyName.toLowerCase(), c));

    const updated = Array.from(map.values());
    this.writeJson(this.companiesFile, updated);
  }

  public async getCompanies(): Promise<CompanyDiscoveryResult[]> {
    return this.readJson<CompanyDiscoveryResult>(this.companiesFile);
  }

  public async saveTaskJobs(taskId: string, jobs: NormalizedJob[]): Promise<void> {
    if (!taskId || jobs.length === 0) return;
    const taskFile = path.join(this.tasksDir, `${taskId}_jobs.json`);
    const existing = this.readJson<NormalizedJob>(taskFile);
    const existingUrls = new Set(existing.map((j) => JobDeduplicator.normalizeUrlKey(j.job_url)));
    const existingFps = new Set(existing.map((j) => j.fingerprint).filter(Boolean));

    const toAdd: NormalizedJob[] = [];
    for (const j of jobs) {
      const urlKey = JobDeduplicator.normalizeUrlKey(j.job_url);
      const isGeneric = /(?:\/jobs\/?$|\/careers\/?$|\/vacancies\/?$)/i.test(j.job_url.replace(/#.*$/, ""));
      if ((!isGeneric && existingUrls.has(urlKey)) || (j.fingerprint && existingFps.has(j.fingerprint))) {
        continue;
      }
      existingUrls.add(urlKey);
      if (j.fingerprint) existingFps.add(j.fingerprint);
      toAdd.push(j);
    }

    if (toAdd.length > 0) {
      this.writeJson(taskFile, [...existing, ...toAdd]);
    }
  }

  public async getTaskJobs(taskId: string): Promise<NormalizedJob[]> {
    if (!taskId) return [];
    const taskFile = path.join(this.tasksDir, `${taskId}_jobs.json`);
    const taskJobs = this.readJson<NormalizedJob>(taskFile);
    if (taskJobs.length > 0) {
      return taskJobs;
    }

    // Fallback 1: Query global jobs.json for this taskId or taskIds array
    const allJobs = this.readJson<NormalizedJob>(this.jobsFile);
    let matched = allJobs.filter((j) => j.taskId === taskId || (j.taskIds && j.taskIds.includes(taskId)));
    if (matched.length > 0) {
      this.writeJson(taskFile, matched);
      return matched;
    }

    // Fallback 2: Reconstruct from tasks.json completed companies
    const task = await this.getScrapingTask(taskId);
    if (task && task.companies && task.companies.length > 0) {
      const completedComps = task.companies.filter((c) => c.status === "completed" || c.validJobsCount > 0);
      const reconstructed: NormalizedJob[] = [];

      for (const comp of completedComps) {
        const cJobs = allJobs.filter((j) => j.company_name.toLowerCase() === comp.companyName.toLowerCase());
        const count = comp.validJobsCount > 0 ? comp.validJobsCount : cJobs.length;
        const taken = cJobs.slice(0, count);
        taken.forEach((j) => {
          j.taskId = taskId;
          const tSet = new Set(j.taskIds || []);
          tSet.add(taskId);
          j.taskIds = Array.from(tSet);
        });
        reconstructed.push(...taken);
      }

      if (reconstructed.length > 0) {
        this.writeJson(taskFile, reconstructed);
        this.writeJson(this.jobsFile, allJobs);
        return reconstructed;
      }
    }

    return [];
  }

  public async saveJobs(jobs: NormalizedJob[]): Promise<void> {
    const existing = this.readJson<NormalizedJob>(this.jobsFile);

    // Index existing jobs for fast identification and update
    const existingById = new Map<string, NormalizedJob>();
    const existingByFp = new Map<string, NormalizedJob>();
    const existingByUrl = new Map<string, NormalizedJob>();

    for (const ex of existing) {
      if (ex.job_id && ex.company_name) {
        existingById.set(`${ex.company_name.toLowerCase()}::${ex.job_id.toLowerCase()}`, ex);
      }
      if (ex.fingerprint) {
        existingByFp.set(ex.fingerprint, ex);
      }
      if (ex.job_url) {
        const urlKey = JobDeduplicator.normalizeUrlKey(ex.job_url);
        existingByUrl.set(urlKey, ex);
      }
    }

    const newJobs: NormalizedJob[] = [];

    for (const job of jobs) {
      let matched: NormalizedJob | undefined;

      if (job.job_id && job.company_name) {
        matched = existingById.get(`${job.company_name.toLowerCase()}::${job.job_id.toLowerCase()}`);
      }
      if (!matched && job.fingerprint) {
        matched = existingByFp.get(job.fingerprint);
      }
      if (!matched && job.job_url) {
        const urlKey = JobDeduplicator.normalizeUrlKey(job.job_url);
        const isGeneric = /(?:\/jobs\/?$|\/careers\/?$|\/vacancies\/?$)/i.test(job.job_url.replace(/#.*$/, ""));
        if (!isGeneric) {
          matched = existingByUrl.get(urlKey);
        }
      }

      if (matched) {
        // Associate with the new taskId while preserving historical taskIds
        if (job.taskId) {
          matched.taskId = job.taskId;
          const tIds = new Set(matched.taskIds || (matched.taskId ? [matched.taskId] : []));
          tIds.add(job.taskId);
          matched.taskIds = Array.from(tIds);
        }
        matched.scraped_at = job.scraped_at || new Date().toISOString();
        if (job.description && (!matched.description || job.description.length > matched.description.length)) {
          matched.description = job.description;
        }
        if (job.salary && !matched.salary) matched.salary = job.salary;
        if (job.location && !matched.location) matched.location = job.location;
        if (job.posted_date && !matched.posted_date) matched.posted_date = job.posted_date;
        if (job.closing_date && !matched.closing_date) matched.closing_date = job.closing_date;
        if (job.remote_type && !matched.remote_type) matched.remote_type = job.remote_type;
        if (job.employment_type && !matched.employment_type) matched.employment_type = job.employment_type;
      } else {
        if (job.taskId) {
          job.taskIds = [job.taskId];
        }
        newJobs.push(job);
        // Register in lookup sets for this batch
        if (job.job_id && job.company_name) {
          existingById.set(`${job.company_name.toLowerCase()}::${job.job_id.toLowerCase()}`, job);
        }
        if (job.fingerprint) {
          existingByFp.set(job.fingerprint, job);
        }
        if (job.job_url) {
          existingByUrl.set(JobDeduplicator.normalizeUrlKey(job.job_url), job);
        }
      }
    }

    const combined = [...existing, ...newJobs];
    this.writeJson(this.jobsFile, combined);
  }

  public async getJobs(filter?: {
    company?: string;
    ats?: string;
    method?: string;
    search?: string;
    remote?: string;
    taskId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: NormalizedJob[]; total: number }> {
    let all: NormalizedJob[] = [];

    if (filter?.taskId) {
      all = await this.getTaskJobs(filter.taskId);
    } else {
      all = this.readJson<NormalizedJob>(this.jobsFile);
    }

    if (filter) {
      if (filter.company) {
        all = all.filter((j) => j.company_name.toLowerCase().includes(filter.company!.toLowerCase()));
      }
      if (filter.ats) {
        all = all.filter((j) => (j.ats || "").toLowerCase() === filter.ats!.toLowerCase());
      }
      if (filter.method) {
        all = all.filter((j) => j.source_type === filter.method);
      }
      if (filter.remote) {
        all = all.filter((j) => (j.remote_type || "").toLowerCase() === filter.remote!.toLowerCase());
      }
      if (filter.search) {
        const s = filter.search.toLowerCase();
        all = all.filter(
          (j) =>
            j.job_title.toLowerCase().includes(s) ||
            j.company_name.toLowerCase().includes(s) ||
            (j.location || "").toLowerCase().includes(s) ||
            (j.description || "").toLowerCase().includes(s)
        );
      }
    }

    const total = all.length;
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;
    const paginated = all.slice(offset, offset + limit);

    return { jobs: paginated, total };
  }

  public async saveRejectedJobs(rejected: RejectedJobRecord[]): Promise<void> {
    const existing = this.readJson<RejectedJobRecord>(this.rejectedJobsFile);
    this.writeJson(this.rejectedJobsFile, [...existing, ...rejected]);
  }

  public async getRejectedJobs(): Promise<RejectedJobRecord[]> {
    return this.readJson<RejectedJobRecord>(this.rejectedJobsFile);
  }

  public async saveScrapingRun(task: BulkScrapingTask): Promise<void> {
    const tasks = this.readJson<BulkScrapingTask>(this.tasksFile);
    const idx = tasks.findIndex((t) => t.taskId === task.taskId);

    if (idx >= 0) {
      tasks[idx] = task;
    } else {
      tasks.unshift(task);
    }

    this.writeJson(this.tasksFile, tasks);
  }

  public async getScrapingTask(taskId: string): Promise<BulkScrapingTask | null> {
    const tasks = this.readJson<BulkScrapingTask>(this.tasksFile);
    return tasks.find((t) => t.taskId === taskId) || null;
  }

  public async getAllScrapingTasks(): Promise<BulkScrapingTask[]> {
    return this.readJson<BulkScrapingTask>(this.tasksFile);
  }

  public async saveLog(log: LogEntry): Promise<void> {
    logger.log(log);
  }

  public async getLogs(limit: number = 200): Promise<LogEntry[]> {
    return logger.getRecentLogs(limit);
  }
}

export const storageService = new FileStorageService();
