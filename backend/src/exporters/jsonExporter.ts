import { NormalizedJob } from "../types/job";
import { CompanyDiscoveryResult } from "../types/company";
import { LogEntry } from "../types/storage";

export class JsonExporter {
  public static exportJobsToJsonString(jobs: NormalizedJob[]): string {
    const formatted = jobs.map((j) => ({
      jobId: j.job_id || "",
      title: j.job_title,
      description: j.description || "",
      jobUrl: j.job_url,
      postedDate: j.posted_date || "",
      jdDeadline: j.closing_date || "",
      company: j.company_name,
      salaryRange: j.salary || "",
      employmentType: j.employment_type || "",
      worktype: j.remote_type || "",
      location: j.location || "",
      city: j.city || "",
      state: j.state || "",
      country: j.country || "",
      ats: j.ats || "None",
      sourceType: j.source_type,
      scrapedAt: j.scraped_at,
    }));
    return JSON.stringify(formatted, null, 2);
  }

  public static exportCompaniesToJsonString(companies: CompanyDiscoveryResult[]): string {
    return JSON.stringify(companies, null, 2);
  }

  public static exportLogsToJsonString(logs: LogEntry[]): string {
    return JSON.stringify(logs, null, 2);
  }
}
