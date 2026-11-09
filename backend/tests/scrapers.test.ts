import { describe, it, expect, vi } from "vitest";
import { JsonLdScraper } from "../src/scrapers/jsonld/jsonLdScraper";
import { StaticScraper } from "../src/scrapers/static/staticScraper";
import { ScrapingStrategyEngine } from "../src/scrapers/strategyEngine";
import { CompanyDiscoveryResult } from "../src/types/company";

describe("Scrapers & Strategy Engine with Mocks", () => {
  const companyInfo: CompanyDiscoveryResult = {
    companyName: "TechCorp",
    companyUrl: "https://techcorp.example.com",
    careerUrl: "https://techcorp.example.com/careers",
    ats: "Custom / In-House Portal",
    atsUrl: null,
    detectionStatus: "confirmed",
    confidence: 0.9,
    detectionMethod: "html_discovery",
    verified: true,
  };

  it("JsonLdScraper should parse JobPosting schema from HTML", async () => {
    const mockHtml = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org/",
              "@type": "JobPosting",
              "title": "Senior Frontend Developer",
              "description": "<p>Build high performance UIs</p>",
              "datePosted": "2026-05-10",
              "validThrough": "2026-08-10",
              "employmentType": "FULL_TIME",
              "hiringOrganization": { "@type": "Organization", "name": "TechCorp" },
              "jobLocation": {
                "@type": "Place",
                "address": {
                  "addressLocality": "Austin",
                  "addressRegion": "TX",
                  "addressCountry": "US"
                }
              },
              "baseSalary": {
                "@type": "MonetaryAmount",
                "currency": "USD",
                "value": { "minValue": 130000, "maxValue": 160000, "unitText": "YEAR" }
              }
            }
          </script>
        </head>
        <body>Career Page</body>
      </html>
    `;

    const scraper = new JsonLdScraper();
    expect(scraper.canHandle(companyInfo, mockHtml)).toBe(true);

    const result = await scraper.scrape(companyInfo, mockHtml);
    expect(result.success).toBe(true);
    expect(result.status).toBe("SUCCESS");
    expect(result.jobs.length).toBe(1);
    expect(result.jobs[0].job_title).toBe("Senior Frontend Developer");
    expect(result.jobs[0].city).toBe("Austin");
    expect(result.jobs[0].state).toBe("Texas");
    expect(result.jobs[0].salary).toContain("130,000");
  });

  it("StaticScraper should parse HTML job cards", async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="job-listing">
            <div class="job-card">
              <a href="/jobs/backend-dev-42" class="title">Backend Node.js Engineer</a>
              <span class="location">New York, NY</span>
              <span class="department">Engineering</span>
            </div>
            <div class="job-card">
              <a href="/jobs/devops-43" class="title">Cloud DevOps Engineer</a>
              <span class="location">Remote</span>
              <span class="department">Infrastructure</span>
            </div>
          </div>
        </body>
      </html>
    `;

    const scraper = new StaticScraper();
    expect(scraper.canHandle(companyInfo, mockHtml)).toBe(true);

    const result = await scraper.scrape(companyInfo, mockHtml);
    expect(result.success).toBe(true);
    expect(result.status).toBe("SUCCESS");
    expect(result.jobs.length).toBe(2);
    expect(result.jobs[0].job_title).toBe("Backend Node.js Engineer");
    expect(result.jobs[1].job_title).toBe("Cloud DevOps Engineer");
    expect(result.jobs[1].remote_type).toBe("Remote");
  });

  it("should return NO_JOBS status when career page has 0 active jobs without failing", async () => {
    const mockEmptyHtml = `
      <html>
        <body>
          <h1>We currently have no open positions. Check back later!</h1>
        </body>
      </html>
    `;

    const scraper = new StaticScraper();
    const result = await scraper.scrape(companyInfo, mockEmptyHtml);
    expect(result.success).toBe(true);
    expect(result.status).toBe("NO_JOBS");
    expect(result.totalJobs).toBe(0);
  });

  it("StrategyEngine should select API strategy when ATS API is available", async () => {
    const engine = new ScrapingStrategyEngine();
    const greenhouseCompany: CompanyDiscoveryResult = {
      ...companyInfo,
      ats: "Greenhouse",
      companySlug: "gitlab",
      apiUrl: "https://boards-api.greenhouse.io/v1/boards/gitlab/jobs",
    };

    const strategy = await engine.selectStrategy(greenhouseCompany);
    expect(strategy.method).toBe("api");
  });

  it("StrategyEngine should select API strategy for Teamtailor with RSS", async () => {
    const engine = new ScrapingStrategyEngine();
    const teamtailorCompany: CompanyDiscoveryResult = {
      ...companyInfo,
      companyName: "Codestone Group Ltd",
      ats: "Teamtailor",
      careerUrl: "https://codestone.teamtailor.com/jobs",
      apiUrl: "https://codestone.teamtailor.com/jobs.rss",
    };

    const strategy = await engine.selectStrategy(teamtailorCompany);
    expect(strategy.method).toBe("api");
    expect(strategy.strategyLabel).toBe("API (GET or POST)");
  });

  it("StrategyEngine should filter jobs accurately by country synonyms (UK vs United Kingdom)", async () => {
    const engine = new ScrapingStrategyEngine();

    // Mock static scraper directly inside strategy engine execution
    const mockCompany: CompanyDiscoveryResult = {
      ...companyInfo,
      ats: "Taleo",
    };

    const strategy = await engine.selectStrategy(mockCompany);
    expect(strategy.method).toBe("playwright");
    expect(strategy.strategyLabel).toBe("Dynamic (JavaScript / Playwright)");
  });

  it("StrategyEngine should ensure metadata validCount strictly matches jobs array length after filtering", async () => {
    const engine = new ScrapingStrategyEngine();
    const mockCompany: CompanyDiscoveryResult = {
      ...companyInfo,
      ats: "None",
      careerUrl: "https://techcorp.example.com/careers",
    };

    const mockHtml = `
      <html>
        <body>
          <div class="job-card">
            <h3>Backend Engineer</h3>
            <span class="location">Bengaluru, India</span>
            <a href="https://techcorp.example.com/careers/job/1">Apply</a>
          </div>
        </body>
      </html>
    `;

    vi.spyOn(engine as any, "selectStrategy").mockResolvedValue({
      method: "static",
      strategyLabel: "Static (HTML)",
      scraper: new StaticScraper(),
      prefetchHtml: mockHtml,
      reason: "Mocked for unit test",
    });

    const result = await engine.execute(mockCompany, { country: "United Kingdom" });
    expect(result.jobs.length).toBe(0);
    expect(result.totalJobs).toBe(0);
    expect(result.metadata.validCount).toBe(0);
    expect(result.metadata.preFilterValidCount).toBe(1);
    expect(result.metadata.filteredOutCount).toBe(1);
    expect(result.status).toBe("NO_JOBS");
  });
});
