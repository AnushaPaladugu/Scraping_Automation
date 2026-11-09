import { describe, it, expect } from "vitest";
import {
  processTitle,
  processLocation,
  processDescription,
  processSalary,
  processEmploymentType,
  processCompany,
  processJobUrl,
  processDate,
  normalizeRawJob,
} from "../src/processors";

describe("Job Field Processors", () => {
  it("processTitle should decode HTML entities and strip unwanted noise", () => {
    const raw = "Senior Software Engineer &amp; Architect (m/w/d) [Remote] - Req ID: 98765";
    const cleaned = processTitle(raw);
    expect(cleaned).toBe("Senior Software Engineer & Architect");
  });

  it("processLocation should parse city, state, country and detect remote type", () => {
    const loc1 = processLocation("San Francisco, CA, United States");
    expect(loc1.city).toBe("San Francisco");
    expect(loc1.state).toBe("California");
    expect(loc1.country).toBe("United States");

    const loc2 = processLocation("Remote - US", "Staff Engineer (Hybrid)");
    expect(loc2.remote_type).toBe("Hybrid");

    const loc3 = processLocation("London, UK");
    expect(loc3.city).toBe("London");
    expect(loc3.country).toBe("United Kingdom");
  });

  it("processDescription should strip scripts, styles, decode entities, and normalize spacing", () => {
    const rawHtml = "<div><script>alert(1)</script><p>We are hiring!&nbsp;&amp;&nbsp;growing.</p><br><li>Skill 1</li></div>";
    const cleaned = processDescription(rawHtml);
    expect(cleaned).toContain("We are hiring! & growing.");
    expect(cleaned).toContain("Skill 1");
    expect(cleaned).not.toContain("script");
    expect(cleaned).not.toContain("&nbsp;");
  });

  it("processSalary should handle structured objects and text ranges", () => {
    const s1 = processSalary({
      currency: "$",
      value: { minValue: 120000, maxValue: 150000, unitText: "YEAR" },
    });
    expect(s1).toBe("$120,000 - $150,000 / year");

    const s2 = processSalary("£45,000 - £55,000 per year");
    expect(s2).toBe("£45,000 - £55,000");

    const sNoisy = processSalary("£24,853 (pro rata), 30% evening and 45% weekend enhancements");
    expect(sNoisy).toBe("£24,853");

    const s3 = processSalary("Competitive");
    expect(s3).toBeNull();
  });

  it("processEmploymentType should normalize job types", () => {
    expect(processEmploymentType("FULL_TIME")).toBe("Full-time");
    expect(processEmploymentType("part-time")).toBe("Part-time");
    expect(processEmploymentType("contractor")).toBe("Contract");
    expect(processEmploymentType("intern")).toBe("Internship");
    expect(processEmploymentType("random")).toBeNull();
  });

  it("processCompany should preserve company name from input exactly", () => {
    expect(processCompany("ServiceNow - London branch")).toBe("ServiceNow - London branch");
    expect(processCompany("Acme Corp (UK) Ltd")).toBe("Acme Corp (UK) Ltd");
  });

  it("processJobUrl should strip tracking params and extract ID", () => {
    const res = processJobUrl("https://careers.example.com/jobs/12345?utm_source=linkedin&ref=share");
    expect(res.jobId).toBe("12345");
    expect(res.jobUrl).not.toContain("utm_source");
    expect(res.jobUrl).toContain("https://careers.example.com/jobs/12345");
  });

  it("processDate should normalize timestamps and date strings", () => {
    const d = processDate("2026-05-15T12:00:00Z");
    expect(d).toBe("2026-05-15");
    expect(processDate("Today")).toBe(new Date().toISOString().split("T")[0]);
  });

  it("normalizeRawJob should generate a deterministic fingerprint and normalized structure", () => {
    const raw = {
      title: "Full Stack Developer",
      url: "https://example.com/jobs/42",
      location: "Austin, TX",
      company: "ExampleCorp",
      description: "<p>Work with React and Node</p>",
      employment_type: "Full-time",
    };

    const normalized = normalizeRawJob(raw, {
      companyName: "ExampleCorp",
      source: "https://example.com/careers",
      sourceType: "api",
      ats: "Greenhouse",
    });

    expect(normalized.company_name).toBe("ExampleCorp");
    expect(normalized.job_title).toBe("Full Stack Developer");
    expect(normalized.city).toBe("Austin");
    expect(normalized.state).toBe("Texas");
    expect(normalized.country).toBe("United States");
    expect(normalized.fingerprint).toBeDefined();
    expect(normalized.fingerprint.length).toBe(64); // SHA-256 length
  });
});
