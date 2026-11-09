import { describe, it, expect } from "vitest";
import { JobValidator } from "../src/validators/jobValidator";
import { NormalizedJob } from "../src/types/job";

describe("JobValidator", () => {
  const validJob: NormalizedJob = {
    company_name: "ServiceNow",
    job_title: "Product Manager",
    job_url: "https://careers.servicenow.com/jobs/101",
    job_id: "101",
    location: "San Diego, CA",
    country: "United States",
    state: "California",
    city: "San Diego",
    remote_type: "Onsite",
    employment_type: "Full-time",
    department: "Product",
    category: null,
    description: "Lead product development",
    requirements: null,
    salary: "$140,000",
    posted_date: "2026-06-01",
    closing_date: null,
    ats: "SmartRecruiters",
    source: "https://careers.servicenow.com",
    source_type: "api",
    scraped_at: new Date().toISOString(),
    fingerprint: "hash101",
  };

  it("should validate complete job successfully", () => {
    const res = JobValidator.validate(validJob);
    expect(res.valid).toBe(true);
  });

  it("should reject job if job_title is missing", () => {
    const invalid = { ...validJob, job_title: "" };
    const res = JobValidator.validate(invalid);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("job_title");
  });

  it("should reject job if company_name is missing or unknown", () => {
    const invalid = { ...validJob, company_name: "Unknown Company" };
    const res = JobValidator.validate(invalid);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("company_name");
  });

  it("should reject job if job_url is invalid", () => {
    const invalid = { ...validJob, job_url: "javascript:void(0)" };
    const res = JobValidator.validate(invalid);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("job_url");
  });

  it("validateBatch should partition jobs into valid and invalid without silently dropping", () => {
    const batch = [
      validJob,
      { ...validJob, job_title: "" },
      { ...validJob, job_url: "" },
    ];

    const { validJobs, invalidJobs } = JobValidator.validateBatch(batch);
    expect(validJobs.length).toBe(1);
    expect(invalidJobs.length).toBe(2);
    expect(invalidJobs[0].reason).toBeDefined();
    expect(invalidJobs[1].reason).toBeDefined();
  });
});
