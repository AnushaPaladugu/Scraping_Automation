import axios from "axios";
import {
  CompanyDiscoveryResult,
  NormalizedJob,
  BulkScrapingTask,
  SystemMetrics,
  LogEntry,
} from "../types";

const client = axios.create({
  baseURL: "/api",
  timeout: 90000,
});

export const apiService = {
  // Discovery
  async discoverSingleCompany(params: {
    companyName: string;
    companyUrl?: string;
    careerUrl?: string;
  }): Promise<CompanyDiscoveryResult> {
    const res = await client.post<CompanyDiscoveryResult>("/company/discover", params);
    return res.data;
  },

  async uploadCompanyFile(file: File): Promise<{
    filename: string;
    detectedColumn: string;
    totalRows: number;
    validCount: number;
    invalidCount: number;
    companies: Array<{ companyName: string; companyUrl?: string; careerUrl?: string }>;
    invalidRows: Array<{ rowNumber: number; reason: string }>;
  }> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await client.post("/companies/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  async discoverBulkCompanies(
    companies: Array<{ companyName: string; companyUrl?: string; careerUrl?: string }>
  ): Promise<{ total: number; results: CompanyDiscoveryResult[] }> {
    const res = await client.post("/companies/discover", { companies });
    return res.data;
  },

  async getDiscoveredCompanies(): Promise<{ total: number; companies: CompanyDiscoveryResult[] }> {
    const res = await client.get("/companies");
    return res.data;
  },

  // Scraping
  async scrapeSingleCompany(companyInfo: CompanyDiscoveryResult, filters?: import("../types").ScrapeFilters): Promise<any> {
    const res = await client.post("/scrape/company", { companyInfo, filters });
    return res.data;
  },

  async startBulkScrape(
    companies: Array<{ companyName: string; companyUrl?: string; careerUrl?: string }>,
    filters?: import("../types").ScrapeFilters
  ): Promise<{ taskId: string; status: string; totalCompanies: number }> {
    const res = await client.post("/scrape/bulk", { companies, filters });
    return res.data;
  },

  async getScrapeStatus(taskId: string): Promise<BulkScrapingTask> {
    const res = await client.get<BulkScrapingTask>(`/scrape/status/${taskId}`);
    return res.data;
  },

  async cancelScrapeTask(taskId: string): Promise<void> {
    await client.post(`/scrape/cancel/${taskId}`);
  },

  async listTasks(): Promise<{ total: number; tasks: BulkScrapingTask[] }> {
    const res = await client.get("/scrape/tasks");
    return res.data;
  },

  // Jobs
  async getJobs(params?: {
    company?: string;
    ats?: string;
    method?: string;
    search?: string;
    remote?: string;
    taskId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: NormalizedJob[]; total: number }> {
    const res = await client.get("/jobs", { params });
    return res.data;
  },

  async getMetrics(): Promise<SystemMetrics> {
    const res = await client.get<SystemMetrics>("/jobs/metrics");
    return res.data;
  },

  async getRejectedJobs(): Promise<{ total: number; rejected: any[] }> {
    const res = await client.get("/jobs/rejected");
    return res.data;
  },

  // Logs
  async getLogs(limit: number = 200): Promise<{ total: number; logs: LogEntry[] }> {
    const res = await client.get("/logs", { params: { limit } });
    return res.data;
  },

  // Export URLs
  getJobsExcelExportUrl(params?: { company?: string }): string {
    return params?.company
      ? `/api/jobs/export/excel?company=${encodeURIComponent(params.company)}`
      : "/api/jobs/export/excel";
  },

  getJobsJsonExportUrl(params?: { company?: string }): string {
    return params?.company
      ? `/api/jobs/export/json?company=${encodeURIComponent(params.company)}`
      : "/api/jobs/export/json";
  },

  async downloadJobsExcel(options: { jobs?: NormalizedJob[]; company?: string; filename?: string }): Promise<void> {
    const res = await client.post("/jobs/export/excel", options, {
      responseType: "blob",
    });
    const blob = new Blob([res.data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const name = options.filename
      ? `${options.filename.replace(/\.xlsx$/i, "")}.xlsx`
      : options.company
      ? `${options.company.toLowerCase().replace(/[^a-z0-9_-]+/g, "_")}_jobs.xlsx`
      : "normalized_jobs.xlsx";
    link.setAttribute("download", name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  async downloadJobsJson(options: { jobs?: NormalizedJob[]; company?: string; filename?: string }): Promise<void> {
    const res = await client.post("/jobs/export/json", options, {
      responseType: "blob",
    });
    const blob = new Blob([res.data], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const name = options.filename
      ? `${options.filename.replace(/\.json$/i, "")}.json`
      : options.company
      ? `${options.company.toLowerCase().replace(/[^a-z0-9_-]+/g, "_")}_jobs.json`
      : "normalized_jobs.json";
    link.setAttribute("download", name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  getCompaniesExcelExportUrl(): string {
    return "/api/companies/export/excel";
  },

  getCompanyDetailsExcelExportUrl(): string {
    return "/api/companies/export/details-excel";
  },

  async downloadCompanyDetailsExcel(options?: { companies?: CompanyDiscoveryResult[]; filename?: string }): Promise<void> {
    const res = await client.post("/companies/export/details-excel", options || {}, {
      responseType: "blob",
    });
    const blob = new Blob([res.data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const name = options?.filename
      ? `${options.filename.replace(/\.xlsx$/i, "")}.xlsx`
      : "company_details.xlsx";
    link.setAttribute("download", name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  getCompaniesJsonExportUrl(): string {
    return "/api/companies/export/json";
  },

  getLogsJsonExportUrl(): string {
    return "/api/logs/export/json";
  },
};
