import { describe, it, expect } from "vitest";
import { JobDeduplicator } from "../src/deduplication/deduplicator";
import { NormalizedJob } from "../src/types/job";

describe("JobDeduplicator", () => {
  const sampleJob: NormalizedJob = {
    company_name: "ServiceNow",
    job_title: "Staff Engineer",
    job_url: "https://careers.servicenow.com/jobs/999",
    job_id: "999",
    location: "Santa Clara, California",
    country: "United States",
    state: "California",
    city: "Santa Clara",
    remote_type: "Hybrid",
    employment_type: "Full-time",
    department: "Engineering",
    category: null,
    description: "Great role",
    requirements: null,
    salary: null,
    posted_date: "2026-05-01",
    closing_date: null,
    ats: "SmartRecruiters",
    source: "https://careers.servicenow.com",
    source_type: "api",
    scraped_at: new Date().toISOString(),
    fingerprint: "abc123hash",
  };

  it("should detect duplicate by job_id and company", () => {
    const deduplicator = new JobDeduplicator();
    deduplicator.registerJob(sampleJob);

    const dup = { ...sampleJob, job_url: "https://another-url.com" };
    expect(deduplicator.isDuplicate(dup)).toBe(true);
  });

  it("should detect duplicate by fingerprint when ID is null", () => {
    const jobWithoutId = { ...sampleJob, job_id: null, fingerprint: "unique_fp_1" };
    const deduplicator = new JobDeduplicator();
    deduplicator.registerJob(jobWithoutId);

    const dup = { ...jobWithoutId, job_url: "https://diff.com" };
    expect(deduplicator.isDuplicate(dup)).toBe(true);
  });

  it("deduplicate batch should remove all duplicates", () => {
    const deduplicator = new JobDeduplicator();
    const batch = [
      sampleJob,
      { ...sampleJob }, // exact duplicate
      { ...sampleJob, job_id: "1000", fingerprint: "different_fp", job_url: "https://careers.servicenow.com/jobs/1000" },
    ];

    const { uniqueJobs, duplicateCount } = deduplicator.deduplicate(batch);
    expect(uniqueJobs.length).toBe(2);
    expect(duplicateCount).toBe(1);
  });
});
