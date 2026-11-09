import { describe, it, expect } from "vitest";
import { CompanyDiscoveryService } from "../src/discovery/companyDiscovery.service";
import { WebsiteVerifierService } from "../src/discovery/websiteVerifier.service";

describe("Company Discovery & Website Verification", () => {
  it("should discover companies dynamically and accurately", async () => {
    const res = await CompanyDiscoveryService.discover({ companyName: "ServiceNow" });
    expect(res.companyName).toBe("ServiceNow");
    expect(res.companyUrl).toBe("https://www.servicenow.com");
    expect(res.careerUrl).toContain("servicenow");
    expect(res.ats.toLowerCase()).toContain("smartrecruiters");
    expect(res.detectionStatus).toBe("confirmed");
    expect(res.verified).toBe(true);
  });

  it("WebsiteVerifierService should verify website when title and url match company", () => {
    const html = `
      <html>
        <head>
          <title>GitLab: The One DevOps Platform</title>
          <meta property="og:site_name" content="GitLab" />
        </head>
        <body>Welcome to GitLab</body>
      </html>
    `;

    const result = WebsiteVerifierService.verify("GitLab", "https://about.gitlab.com", html);
    expect(result.verified).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("WebsiteVerifierService should reject unverified unrelated websites", () => {
    const html = `
      <html>
        <head><title>Completely Unrelated Pet Shop</title></head>
        <body>Buy cats and dogs</body>
      </html>
    `;

    const result = WebsiteVerifierService.verify("Quantum Computing Ltd", "https://petshop.example.com", html);
    expect(result.verified).toBe(false);
  });

  it("should discover Codestone Group Ltd fast with Teamtailor ATS", async () => {
    const start = Date.now();
    const res = await CompanyDiscoveryService.discover({ companyName: "Codestone Group Ltd" });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(3000);
    expect(res.companyName).toBe("Codestone Group Ltd");
    expect(res.ats).toBe("Teamtailor");
    expect(res.careerUrl).toContain("codestone.teamtailor.com");
    expect(res.verified).toBe(true);
  });
});
