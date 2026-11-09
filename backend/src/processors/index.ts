import crypto from "crypto";
import { NormalizedJob, RawJobData } from "../types/job";
import { processTitle, extractTitleAndRef } from "./titleProcessor";
import { processLocation } from "./locationProcessor";
import { processDescription } from "./descriptionProcessor";
import { processSalary } from "./salaryProcessor";
import { processEmploymentType } from "./employmentTypeProcessor";
import { processCompany } from "./companyProcessor";
import { processJobUrl } from "./jobUrlProcessor";
import { processDate } from "./dateProcessor";

export {
  processTitle,
  extractTitleAndRef,
  processLocation,
  processDescription,
  processSalary,
  processEmploymentType,
  processCompany,
  processJobUrl,
  processDate,
};

export function normalizeRawJob(
  raw: RawJobData,
  defaults: {
    companyName: string;
    source: string;
    sourceType: "api" | "jsonld" | "static" | "playwright";
    ats?: string | null;
    country?: string | null;
  }
): NormalizedJob {
  const company_name = processCompany(raw.company || raw.company_name || defaults.companyName);
  const titleInfo = extractTitleAndRef(raw.title || raw.job_title);
  const job_title = titleInfo.title;
  const description = processDescription(raw.description || raw.text || raw.summary);
  const requirements = processDescription(raw.requirements || raw.qualifications);
  const locationInfo = processLocation(
    raw.locations && raw.locations.length > 0 ? raw.locations[0] : (raw.location || raw.jobLocation),
    job_title,
    description || "",
    defaults.country
  );

  const rawCandidateId = raw.id || raw.job_id || raw.reference || raw.ref || raw.req_id || titleInfo.ref;
  const urlInfo = processJobUrl(
    raw.url || raw.job_url || raw.link || raw.apply_url,
    rawCandidateId,
    defaults.source
  );

  const salary = processSalary(raw.salary || raw.salary_range || raw.baseSalary || raw.compensation);
  const employment_type = processEmploymentType(raw.employment_type || raw.employmentType || raw.job_type);
  const posted_date = processDate(raw.posted_date || raw.date_posted || raw.datePosted || raw.created_at);
  const closing_date = processDate(raw.closing_date || raw.valid_through || raw.validThrough);

  const department = raw.department || raw.team || raw.category || null;
  const category = raw.category || raw.occupationalCategory || null;
  const ats = raw.ats || defaults.ats || null;

  // Generate deterministic fingerprint for deduplication
  const fpPayload = `${company_name}|${job_title}|${locationInfo.location || ""}|${urlInfo.jobUrl}`.toLowerCase();
  const fingerprint = crypto.createHash("sha256").update(fpPayload).digest("hex");

  return {
    company_name,
    job_title,
    job_url: urlInfo.jobUrl,
    job_id: urlInfo.jobId,
    location: locationInfo.location,
    country: locationInfo.country,
    state: locationInfo.state,
    city: locationInfo.city,
    remote_type: locationInfo.remote_type,
    employment_type,
    department,
    category,
    description,
    requirements,
    salary,
    posted_date,
    closing_date,
    ats,
    source: defaults.source,
    source_type: defaults.sourceType,
    scraped_at: new Date().toISOString(),
    fingerprint,
    metadata: raw.metadata || undefined,
  };
}
