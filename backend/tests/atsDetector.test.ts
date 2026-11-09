import { describe, it, expect } from "vitest";
import { AtsDetectorService } from "../src/discovery/atsDetector.service";

describe("AtsDetectorService", () => {
  it("should detect Greenhouse ATS from URL and slug", () => {
    const res = AtsDetectorService.detect("https://boards.greenhouse.io/gitlab", "", "GitLab");
    expect(res.ats).toBe("Greenhouse");
    expect(res.slug).toBe("gitlab");
    expect(res.apiUrl).toContain("boards-api.greenhouse.io");
    expect(res.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("should detect Lever ATS from URL", () => {
    const res = AtsDetectorService.detect("https://jobs.lever.co/netflix", "", "Netflix");
    expect(res.ats).toBe("Lever");
    expect(res.slug).toBe("netflix");
    expect(res.apiUrl).toContain("api.lever.co");
  });

  it("should detect Ashby ATS from URL", () => {
    const res = AtsDetectorService.detect("https://jobs.ashbyhq.com/linear", "", "Linear");
    expect(res.ats).toBe("Ashby");
    expect(res.slug).toBe("linear");
    expect(res.apiUrl).toContain("api.ashbyhq.com");
  });

  it("should detect SmartRecruiters from URL", () => {
    const res = AtsDetectorService.detect("https://careers.smartrecruiters.com/ServiceNow", "", "ServiceNow");
    expect(res.ats).toBe("SmartRecruiters");
    expect(res.slug).toBe("ServiceNow");
    expect(res.apiUrl).toContain("api.smartrecruiters.com");
  });

  it("should detect BambooHR from URL", () => {
    const res = AtsDetectorService.detect("https://companyxyz.bamboohr.com/jobs", "", "CompanyXYZ");
    expect(res.ats).toBe("BambooHR");
    expect(res.slug).toBe("companyxyz");
    expect(res.apiUrl).toContain("careers/list?format=json");
  });

  it("should detect Workday from URL or HTML", () => {
    const res = AtsDetectorService.detect("https://adobe.wd5.myworkdayjobs.com/careers", "", "Adobe");
    expect(res.ats).toBe("Workday");
  });

  it("should detect Rippling ATS from URL", () => {
    const res = AtsDetectorService.detect("https://ats.rippling.com/rippling/jobs", "", "Rippling");
    expect(res.ats).toBe("Rippling");
    expect(res.slug).toBe("rippling");
  });

  it("should detect UKG Pro from UltiPro URL", () => {
    const res = AtsDetectorService.detect("https://recruiting.ultipro.com/XYZ123/OpportunityDetail?opportunityId=1", "", "Company");
    expect(res.ats).toBe("UKG Pro");
  });

  it("should detect Paylocity from URL", () => {
    const res = AtsDetectorService.detect("https://recruiting.paylocity.com/recruiting/jobs/Details/123", "", "Company");
    expect(res.ats).toBe("Paylocity");
  });

  it("should detect Dayforce from URL", () => {
    const res = AtsDetectorService.detect("https://jobs.dayforcehcm.com/company/posting/123", "", "Company");
    expect(res.ats).toBe("Dayforce");
  });

  it("should detect Oracle Cloud HCM from URL", () => {
    const res = AtsDetectorService.detect("https://fa-xxxx-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX", "", "Company");
    expect(res.ats).toBe("Oracle Cloud HCM");
  });

  it("should detect ClearCompany from URL or HTML", () => {
    const res = AtsDetectorService.detect("https://company.clearcompany.com/careers/jobs", "", "Company");
    expect(res.ats).toBe("ClearCompany");
  });

  it("should return Custom / In-House Portal for standard careers paths", () => {
    const res = AtsDetectorService.detect("https://example.com/careers", "<html>View open positions and apply now</html>", "Example");
    expect(res.ats).toBe("Custom / In-House Portal");
  });

  it("should extract correct company slug from SmartRecruiters widget HTML and never pick job-widget", () => {
    const widgetHtml = `
      <div>
        <script type="text/javascript" src="https://static.smartrecruiters.com/job-widget/1.5.4/script/smart_widget.js"></script>
        <script type="text/javascript" class="job_widget">
        widget({
          "company_code": "TechVedika",
          "bg_color_widget": "#ffffff"
        });
        </script>
      </div>
    `;

    const res = AtsDetectorService.detect("https://www.techvedika.com/careers/", widgetHtml, "Tech vedika");
    expect(res.ats).toBe("SmartRecruiters");
    expect(res.slug).toBe("TechVedika");
    expect(res.apiUrl).toBe("https://api.smartrecruiters.com/v1/companies/TechVedika/postings");
    expect(res.slug).not.toBe("job-widget");
  });
});
