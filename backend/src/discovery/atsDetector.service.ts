import * as cheerio from "cheerio";
import { fetchUrl } from "../utils/httpClient";
import { logger } from "../utils/logger";

export interface AtsDetectionResult {
  ats: string;
  slug: string;
  apiUrl: string;
  atsUrl: string | null;
  confidence: number;
  detectionStage?: "direct_url" | "embedded_html" | "deep_apply_click" | "in_house";
}

const INVALID_SLUGS = new Set([
  "embed", "v1", "v2", "v3", "js", "api", "boards", "jobs", "careers", "career", "default",
  "login", "www", "app", "support", "static", "assets", "search", "share", "details",
  "index", "home", "admin", "postings", "onlineapp", "job", "application", "apply", "test",
  "recruiting", "hire", "portal", "candidate", "secure", "mail", "help", "billing", "auth",
  "en", "us", "uk", "global", "search-results", "pages", "view", "listing", "listings",
  "job-widget", "job_widget", "smart_widget", "smart-widget", "widget", "widgets", "script",
  "scripts", "css", "components", "companies", "company", "posting", "iframe", "feed", "feeds", "rss"
]);

export class AtsDetectorService {
  /**
   * Fast synchronous pattern detection on URL and page HTML.
   */
  public static detect(url: string, html: string = "", companyHint: string = ""): AtsDetectionResult {
    const lowerUrl = (url || "").toLowerCase();
    const lowerHtml = (html || "").toLowerCase();
    const cleanHint = companyHint.toLowerCase().replace(/[^a-z0-9]/g, "");

    // 1. Greenhouse
    if (
      lowerUrl.includes("greenhouse.io") ||
      lowerHtml.includes("boards.greenhouse.io") ||
      lowerHtml.includes("job-boards.greenhouse.io") ||
      lowerHtml.includes("greenhouse.io/embed")
    ) {
      const match =
        lowerUrl.match(/(?:boards|job-boards)\.greenhouse\.io\/([a-z0-9_-]+)/i) ||
        lowerHtml.match(/(?:boards|job-boards)\.greenhouse\.io\/([a-z0-9_-]+)/i) ||
        lowerHtml.match(/for=([a-z0-9_-]+)/i) ||
        lowerUrl.match(/for=([a-z0-9_-]+)/i);

      let slug = match && match[1] ? match[1].toLowerCase() : cleanHint;
      if (INVALID_SLUGS.has(slug)) slug = cleanHint;

      return {
        ats: "Greenhouse",
        slug,
        apiUrl: slug ? `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true` : "",
        atsUrl: slug ? `https://boards.greenhouse.io/${slug}` : url,
        confidence: 0.95,
        detectionStage: lowerUrl.includes("greenhouse.io") ? "direct_url" : "embedded_html",
      };
    }

    // 2. Lever
    if (
      lowerUrl.includes("jobs.lever.co") ||
      lowerHtml.includes("jobs.lever.co")
    ) {
      const match =
        lowerUrl.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i) ||
        lowerHtml.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i);

      let slug = match && match[1] ? match[1].toLowerCase() : cleanHint;
      if (INVALID_SLUGS.has(slug)) slug = cleanHint;

      return {
        ats: "Lever",
        slug,
        apiUrl: slug ? `https://api.lever.co/v0/postings/${slug}?mode=json` : "",
        atsUrl: slug ? `https://jobs.lever.co/${slug}` : url,
        confidence: 0.95,
        detectionStage: lowerUrl.includes("lever.co") ? "direct_url" : "embedded_html",
      };
    }

    // 3. Ashby
    if (
      lowerUrl.includes("ashbyhq.com") ||
      lowerHtml.includes("ashbyhq.com") ||
      lowerHtml.includes("api.ashbyhq.com")
    ) {
      const match =
        lowerUrl.match(/ashbyhq\.com\/([a-z0-9_-]+)/i) ||
        lowerHtml.match(/ashbyhq\.com\/([a-z0-9_-]+)/i);

      let slug = match && match[1] ? match[1].toLowerCase() : cleanHint;
      if (INVALID_SLUGS.has(slug)) slug = cleanHint;

      return {
        ats: "Ashby",
        slug,
        apiUrl: slug ? `https://api.ashbyhq.com/posting-api/job-board/${slug}` : "",
        atsUrl: slug ? `https://jobs.ashbyhq.com/${slug}` : url,
        confidence: 0.95,
        detectionStage: lowerUrl.includes("ashbyhq.com") ? "direct_url" : "embedded_html",
      };
    }

    // 4. SmartRecruiters
    if (
      lowerUrl.includes("smartrecruiters.com") ||
      lowerHtml.includes("smartrecruiters.com")
    ) {
      let slug = "";

      // 1. Check for company_code in embedded widget script or attributes: widget({ "company_code": "TechVedika" })
      const codeMatch =
        html.match(/["']?company_code["']?\s*[:=]\s*["']([^"']+)["']/i) ||
        html.match(/["']?companyIdentifier["']?\s*[:=]\s*["']([^"']+)["']/i) ||
        html.match(/data-company(?:-code)?=["']([^"']+)["']/i);

      if (codeMatch && codeMatch[1] && !INVALID_SLUGS.has(codeMatch[1].toLowerCase())) {
        slug = codeMatch[1].trim();
      }

      // 2. Check for direct careers or API URLs
      if (!slug) {
        const directUrlMatch =
          url.match(/careers\.smartrecruiters\.com\/([a-z0-9_-]+)/i) ||
          html.match(/careers\.smartrecruiters\.com\/([a-z0-9_-]+)/i) ||
          url.match(/api\.smartrecruiters\.com\/v1\/companies\/([a-z0-9_-]+)/i) ||
          html.match(/api\.smartrecruiters\.com\/v1\/companies\/([a-z0-9_-]+)/i) ||
          url.match(/smartrecruiters\.com\/(?:companies|company)\/([a-z0-9_-]+)/i) ||
          html.match(/smartrecruiters\.com\/(?:companies|company)\/([a-z0-9_-]+)/i) ||
          url.match(/jobs\.smartrecruiters\.com\/([a-z0-9_-]+)/i) ||
          html.match(/jobs\.smartrecruiters\.com\/([a-z0-9_-]+)/i);

        if (directUrlMatch && directUrlMatch[1] && !INVALID_SLUGS.has(directUrlMatch[1].toLowerCase())) {
          slug = directUrlMatch[1].trim();
        }
      }

      // 3. Scan general smartrecruiters.com/<slug> references (ignoring static/job-widget/etc.)
      if (!slug) {
        const matches = [
          ...url.matchAll(/smartrecruiters\.com\/([a-z0-9_-]+)/gi),
          ...html.matchAll(/smartrecruiters\.com\/([a-z0-9_-]+)/gi),
        ];
        for (const m of matches) {
          const candidate = m[1].trim();
          if (candidate && !INVALID_SLUGS.has(candidate.toLowerCase())) {
            slug = candidate;
            break;
          }
        }
      }

      // 4. Fallback to cleanHint / companyName
      if (!slug || INVALID_SLUGS.has(slug.toLowerCase())) {
        slug = cleanHint;
      }

      return {
        ats: "SmartRecruiters",
        slug,
        apiUrl: slug ? `https://api.smartrecruiters.com/v1/companies/${slug}/postings` : "",
        atsUrl: slug ? `https://careers.smartrecruiters.com/${slug}` : url,
        confidence: 0.95,
        detectionStage: lowerUrl.includes("smartrecruiters.com") ? "direct_url" : "embedded_html",
      };
    }

    // 5. Workable
    if (
      lowerUrl.includes("workable.com") ||
      lowerHtml.includes("workable.com") ||
      lowerUrl.includes("apply.workable.com")
    ) {
      const match =
        lowerUrl.match(/(?:apply\.)?workable\.com\/([a-z0-9_-]+)/i) ||
        lowerHtml.match(/(?:apply\.)?workable\.com\/([a-z0-9_-]+)/i);

      let slug = match && match[1] ? match[1].toLowerCase() : cleanHint;
      if (INVALID_SLUGS.has(slug)) slug = cleanHint;

      return {
        ats: "Workable",
        slug,
        apiUrl: slug ? `https://apply.workable.com/api/v1/accounts/${slug}/jobs` : "",
        atsUrl: slug ? `https://apply.workable.com/${slug}` : url,
        confidence: 0.95,
        detectionStage: lowerUrl.includes("workable.com") ? "direct_url" : "embedded_html",
      };
    }

    // 6. BambooHR
    if (
      lowerUrl.includes("bamboohr.com") ||
      lowerUrl.includes("bamboohr.co.uk") ||
      lowerHtml.includes("bamboohr.com")
    ) {
      const match =
        lowerUrl.match(/([a-z0-9_-]+)\.bamboohr\.(?:com|co\.uk)/i) ||
        lowerHtml.match(/([a-z0-9_-]+)\.bamboohr\.(?:com|co\.uk)/i) ||
        lowerUrl.match(/company=([a-z0-9_-]+)/i);

      let slug = match && match[1] ? match[1].toLowerCase() : cleanHint;
      if (INVALID_SLUGS.has(slug)) slug = cleanHint;

      return {
        ats: "BambooHR",
        slug,
        apiUrl: slug ? `https://${slug}.bamboohr.com/careers/list?format=json` : "",
        atsUrl: slug ? `https://${slug}.bamboohr.com` : url,
        confidence: 0.9,
        detectionStage: lowerUrl.includes("bamboohr") ? "direct_url" : "embedded_html",
      };
    }

    // 7. Rippling
    if (
      lowerUrl.includes("ats.rippling.com") ||
      lowerHtml.includes("ats.rippling.com")
    ) {
      const match =
        lowerUrl.match(/ats\.rippling\.com\/([a-z0-9_-]+)/i) ||
        lowerHtml.match(/ats\.rippling\.com\/([a-z0-9_-]+)/i);

      let slug = match && match[1] ? match[1].toLowerCase() : cleanHint;
      if (INVALID_SLUGS.has(slug)) slug = cleanHint;

      return {
        ats: "Rippling",
        slug,
        apiUrl: slug ? `https://ats.rippling.com/api/v2/board/${slug}/jobs` : "",
        atsUrl: slug ? `https://ats.rippling.com/${slug}` : url,
        confidence: 0.95,
        detectionStage: lowerUrl.includes("rippling") ? "direct_url" : "embedded_html",
      };
    }

    // 8. Teamtailor
    if (
      lowerUrl.includes("teamtailor.com") ||
      lowerHtml.includes("teamtailor.com")
    ) {
      const match =
        lowerUrl.match(/([a-z0-9_-]+)\.teamtailor\.com/i) ||
        lowerHtml.match(/([a-z0-9_-]+)\.teamtailor\.com/i);

      let slug = match && match[1] ? match[1].toLowerCase() : cleanHint;
      if (INVALID_SLUGS.has(slug)) slug = cleanHint;

      return {
        ats: "Teamtailor",
        slug,
        apiUrl: slug ? `https://${slug}.teamtailor.com/jobs.rss` : "",
        atsUrl: slug ? `https://${slug}.teamtailor.com` : url,
        confidence: 0.9,
        detectionStage: lowerUrl.includes("teamtailor") ? "direct_url" : "embedded_html",
      };
    }

    // 9. Workday
    if (
      lowerUrl.includes("myworkdayjobs.com") ||
      lowerHtml.includes("myworkdayjobs.com")
    ) {
      const match =
        lowerUrl.match(/([a-z0-9_-]+)\.myworkdayjobs\.com/i) ||
        lowerHtml.match(/([a-z0-9_-]+)\.myworkdayjobs\.com/i);

      const slug = match && match[1] ? match[1].toLowerCase() : cleanHint;
      const fullUrlMatch =
        url.match(/https?:\/\/[a-z0-9_-]+\.[a-z0-9_.-]*myworkdayjobs\.com[^\s"'<>]*/i) ||
        html.match(/https?:\/\/[a-z0-9_-]+\.[a-z0-9_.-]*myworkdayjobs\.com[^\s"'<>]*/i);
      let atsUrl = fullUrlMatch ? fullUrlMatch[0] : url;
      atsUrl = atsUrl.replace(/\/+(?:login|sign-in|signin)(?:\/.*)?$/i, "");

      return {
        ats: "Workday",
        slug,
        apiUrl: "",
        atsUrl,
        confidence: 0.9,
        detectionStage: lowerUrl.includes("myworkdayjobs") ? "direct_url" : "embedded_html",
      };
    }

    // 10. UKG Pro / UltiPro
    if (
      lowerUrl.includes("recruiting.ultipro.com") ||
      lowerHtml.includes("recruiting.ultipro.com") ||
      lowerUrl.includes("rec.pro.ukg.net") ||
      lowerHtml.includes("rec.pro.ukg.net") ||
      lowerUrl.includes("recruiting2.ultipro.com")
    ) {
      return {
        ats: "UKG Pro",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.9,
        detectionStage: lowerUrl.includes("ultipro") || lowerUrl.includes("ukg") ? "direct_url" : "embedded_html",
      };
    }

    // 11. Paylocity
    if (
      lowerUrl.includes("recruiting.paylocity.com") ||
      lowerHtml.includes("recruiting.paylocity.com")
    ) {
      return {
        ats: "Paylocity",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.9,
        detectionStage: lowerUrl.includes("paylocity") ? "direct_url" : "embedded_html",
      };
    }

    // 12. Dayforce
    if (
      lowerUrl.includes("dayforcehcm.com") ||
      lowerHtml.includes("dayforcehcm.com")
    ) {
      return {
        ats: "Dayforce",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.9,
        detectionStage: lowerUrl.includes("dayforce") ? "direct_url" : "embedded_html",
      };
    }

    // 13. Oracle Cloud HCM
    if (
      lowerUrl.includes("oraclecloud.com") ||
      lowerHtml.includes("oraclecloud.com") ||
      lowerUrl.includes("hcmui/candidateexperience")
    ) {
      return {
        ats: "Oracle Cloud HCM",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.9,
        detectionStage: lowerUrl.includes("oraclecloud") ? "direct_url" : "embedded_html",
      };
    }

    // 14. iCIMS
    if (lowerUrl.includes("icims.com") || lowerHtml.includes("icims.com")) {
      const match = lowerUrl.match(/([a-z0-9_-]+)\.icims\.com/i) || lowerHtml.match(/([a-z0-9_-]+)\.icims\.com/i);
      const slug = match && match[1] ? match[1].toLowerCase() : cleanHint;
      const fullUrlMatch =
        url.match(/https?:\/\/[a-z0-9_-]+\.icims\.com[^\s"'<>]*/i) ||
        html.match(/https?:\/\/[a-z0-9_-]+\.icims\.com[^\s"'<>]*/i);
      const atsUrl = fullUrlMatch ? fullUrlMatch[0] : url;
      return {
        ats: "iCIMS",
        slug,
        apiUrl: "",
        atsUrl,
        confidence: 0.85,
        detectionStage: lowerUrl.includes("icims") ? "direct_url" : "embedded_html",
      };
    }

    // 14b. Phenom People (used by Cognizant, Honeywell, Southwest, etc.)
    if (
      lowerUrl.includes("phenompeople.com") ||
      lowerHtml.includes("phenompeople") ||
      lowerHtml.includes("data-ph-at-id") ||
      lowerHtml.includes("phapp") ||
      lowerHtml.includes("cdn.phenompeople.com") ||
      lowerUrl.includes("careers.cognizant.com")
    ) {
      return {
        ats: "Phenom People",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.9,
        detectionStage: lowerUrl.includes("phenom") ? "direct_url" : "embedded_html",
      };
    }

    // 15. Taleo / Oracle
    if (lowerUrl.includes("taleo.net") || lowerHtml.includes("taleo.net")) {
      return {
        ats: "Oracle Taleo",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.85,
        detectionStage: lowerUrl.includes("taleo") ? "direct_url" : "embedded_html",
      };
    }

    // 16. SAP SuccessFactors
    if (lowerUrl.includes("successfactors") || lowerHtml.includes("successfactors")) {
      const fullUrlMatch =
        url.match(/https?:\/\/[a-z0-9_-]+\.successfactors\.[a-z.]+[^\s"'<>]*/i) ||
        html.match(/https?:\/\/[a-z0-9_-]+\.successfactors\.[a-z.]+[^\s"'<>]*/i);
      const atsUrl = fullUrlMatch ? fullUrlMatch[0] : url;
      return {
        ats: "SAP SuccessFactors",
        slug: cleanHint,
        apiUrl: "",
        atsUrl,
        confidence: 0.85,
        detectionStage: lowerUrl.includes("successfactors") ? "direct_url" : "embedded_html",
      };
    }

    // 17. PinPoint
    if (lowerUrl.includes("pinpointhq.com") || lowerHtml.includes("pinpointhq.com")) {
      return {
        ats: "PinPoint",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.9,
        detectionStage: lowerUrl.includes("pinpoint") ? "direct_url" : "embedded_html",
      };
    }

    // 18. ClearCompany
    if (lowerUrl.includes("clearcompany.com") || lowerHtml.includes("clearcompany.com")) {
      return {
        ats: "ClearCompany",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.9,
        detectionStage: lowerUrl.includes("clearcompany") ? "direct_url" : "embedded_html",
      };
    }

    // 19. JazzHR
    if (lowerUrl.includes("applytojob.com") || lowerHtml.includes("applytojob.com")) {
      return {
        ats: "JazzHR",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.9,
        detectionStage: lowerUrl.includes("applytojob") ? "direct_url" : "embedded_html",
      };
    }

    // 20. Jobvite
    if (lowerUrl.includes("jobvite.com") || lowerHtml.includes("jobvite.com")) {
      return {
        ats: "Jobvite",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.85,
        detectionStage: lowerUrl.includes("jobvite") ? "direct_url" : "embedded_html",
      };
    }

    // 21. Cornerstone OnDemand
    if (lowerUrl.includes("csod.com") || lowerHtml.includes("csod.com")) {
      return {
        ats: "Cornerstone OnDemand",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.85,
        detectionStage: lowerUrl.includes("csod") ? "direct_url" : "embedded_html",
      };
    }

    // 22. Personio
    if (lowerUrl.includes("personio.com") || lowerUrl.includes("personio.de") || lowerHtml.includes("personio.com")) {
      return {
        ats: "Personio",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.85,
        detectionStage: "direct_url",
      };
    }

    // 23. Recruitee
    if (lowerUrl.includes("recruitee.com") || lowerHtml.includes("recruitee.com")) {
      return {
        ats: "Recruitee",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.85,
        detectionStage: "direct_url",
      };
    }

    // 24. Harri
    if (lowerUrl.includes("harri.com") || lowerHtml.includes("harri.com")) {
      return {
        ats: "Harri",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.85,
        detectionStage: "direct_url",
      };
    }

    // 25. BreezyHR
    if (lowerUrl.includes("breezy.hr") || lowerHtml.includes("breezy.hr")) {
      return {
        ats: "BreezyHR",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.85,
        detectionStage: "direct_url",
      };
    }

    // 26. Eightfold AI
    if (lowerUrl.includes("eightfold.ai") || lowerHtml.includes("eightfold.ai")) {
      return {
        ats: "Eightfold AI",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.85,
        detectionStage: "direct_url",
      };
    }

    // 27. Eploy
    if (lowerUrl.includes("eploy.net") || lowerHtml.includes("eploy.net") || lowerUrl.includes("eploy.co.uk")) {
      return {
        ats: "Eploy",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.9,
        detectionStage: "direct_url",
      };
    }

    // 28. CareerPlug
    if (lowerUrl.includes("careerplug.com") || lowerHtml.includes("careerplug.com")) {
      return {
        ats: "CareerPlug",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.9,
        detectionStage: "direct_url",
      };
    }

    // 29. Betterteam
    if (lowerUrl.includes("betterteam.com") || lowerHtml.includes("betterteam.com")) {
      return {
        ats: "Betterteam",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.9,
        detectionStage: "direct_url",
      };
    }

    // 30. Tribepad
    if (
      lowerUrl.includes("tribepad.com") ||
      lowerHtml.includes("tribepad.com") ||
      lowerHtml.includes("powered by tribepad") ||
      lowerHtml.includes("tribepad")
    ) {
      const slugMatch =
        lowerUrl.match(/([a-z0-9_-]+)\.tribepad\.com/i) ||
        lowerHtml.match(/([a-z0-9_-]+)\.tribepad\.com/i);
      const matchedSlug = slugMatch && slugMatch[1] ? slugMatch[1].toLowerCase() : "";
      const isVendorDomain = !matchedSlug || matchedSlug === "www" || matchedSlug === "tribepad";

      const slug = isVendorDomain ? cleanHint : matchedSlug;
      let atsUrl = url;
      if (!isVendorDomain) {
        const fullUrlMatch =
          url.match(/https?:\/\/[a-z0-9_-]+\.tribepad\.com[^\s"'<>]*/i) ||
          html.match(/https?:\/\/[a-z0-9_-]+\.tribepad\.com[^\s"'<>]*/i);
        if (fullUrlMatch && !fullUrlMatch[0].includes("www.tribepad.com")) {
          atsUrl = fullUrlMatch[0];
        }
      }
      return {
        ats: "Tribepad",
        slug,
        apiUrl: "",
        atsUrl,
        confidence: 0.95,
        detectionStage: lowerUrl.includes("tribepad") ? "direct_url" : "embedded_html",
      };
    }

    // 31. HiBob
    if (
      lowerUrl.includes("hibob.com") ||
      lowerHtml.includes("hibob.com") ||
      lowerHtml.includes("careers.hibob.com")
    ) {
      const match =
        lowerUrl.match(/([a-z0-9_-]+)\.careers\.hibob\.com/i) ||
        lowerHtml.match(/([a-z0-9_-]+)\.careers\.hibob\.com/i);
      const slug = match && match[1] ? match[1].toLowerCase() : cleanHint;
      return {
        ats: "HiBob",
        slug,
        apiUrl: slug ? `https://${slug}.careers.hibob.com/api/job-ad` : "",
        atsUrl: url,
        confidence: 0.95,
        detectionStage: lowerUrl.includes("hibob") ? "direct_url" : "embedded_html",
      };
    }

    // 32. MyNewTerm
    if (
      lowerUrl.includes("mynewterm.com") ||
      lowerHtml.includes("mynewterm.com") ||
      lowerHtml.includes("mnt-parent-container") ||
      lowerHtml.includes("school_vacancies.js")
    ) {
      return {
        ats: "MyNewTerm",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.95,
        detectionStage: lowerUrl.includes("mynewterm") ? "direct_url" : "embedded_html",
      };
    }

    // 33. Attrax
    if (
      lowerUrl.includes("attrax") ||
      lowerHtml.includes("attraxcdnprod") ||
      lowerHtml.includes("attrax") ||
      lowerHtml.includes("tpplccareers.co.uk")
    ) {
      const fullUrlMatch =
        url.match(/https?:\/\/[a-z0-9_-]*\.?tpplccareers\.co\.uk[^\s"'<>]*/i) ||
        html.match(/https?:\/\/[a-z0-9_-]*\.?tpplccareers\.co\.uk[^\s"'<>]*/i);
      const atsUrl = fullUrlMatch ? (fullUrlMatch[0].endsWith("/jobs") ? fullUrlMatch[0] : `${fullUrlMatch[0].replace(/\/$/, "")}/jobs`) : url;
      return {
        ats: "Attrax",
        slug: cleanHint,
        apiUrl: "",
        atsUrl,
        confidence: 0.9,
        detectionStage: "embedded_html",
      };
    }

    // 34. iTrent (MHR WebITrent)
    if (
      lowerUrl.includes("webitrent.com") ||
      lowerHtml.includes("webitrent.com") ||
      lowerHtml.includes("etrec179gf.open") ||
      lowerHtml.includes("etrec107")
    ) {
      const fullUrlMatch =
        url.match(/https?:\/\/[a-z0-9_-]+\.webitrent\.com[^\s"'<>]*/i) ||
        html.match(/https?:\/\/[a-z0-9_-]+\.webitrent\.com[^\s"'<>]*/i);
      const atsUrl = fullUrlMatch ? fullUrlMatch[0] : url;
      return {
        ats: "iTrent",
        slug: cleanHint,
        apiUrl: "",
        atsUrl,
        confidence: 0.95,
        detectionStage: lowerUrl.includes("webitrent") ? "direct_url" : "embedded_html",
      };
    }

    // 35. In-House / Custom Portal detection
    if (
      lowerUrl.includes("/career") ||
      lowerUrl.includes("/jobs") ||
      lowerUrl.includes("/vacanc") ||
      lowerHtml.includes("current vacancies") ||
      lowerHtml.includes("job openings") ||
      lowerHtml.includes("apply now") ||
      lowerHtml.includes("search jobs") ||
      lowerHtml.includes("view open positions")
    ) {
      return {
        ats: "Custom ATS",
        slug: cleanHint,
        apiUrl: "",
        atsUrl: url,
        confidence: 0.7,
        detectionStage: "in_house",
      };
    }

    return {
      ats: "NOT_FOUND",
      slug: "",
      apiUrl: "",
      atsUrl: null,
      confidence: 0.2,
      detectionStage: "in_house",
    };
  }

  /**
   * Deep 2-Step Detection:
   * When an ATS is not apparent on the career landing page,
   * inspects sample job listing URLs and follows into the "Apply Now" action / redirect.
   */
  public static async detectDeep(
    careerUrl: string,
    careerHtml: string = "",
    companyHint: string = ""
  ): Promise<AtsDetectionResult> {
    const directResult = this.detect(careerUrl, careerHtml, companyHint);

    // If direct check already confirmed a recognized 3rd party ATS (not Custom or NOT_FOUND), return it
    if (
      directResult.ats !== "NOT_FOUND" &&
      directResult.ats !== "Custom ATS" &&
      directResult.ats !== "None" &&
      directResult.ats !== "Custom / In-House Portal"
    ) {
      return directResult;
    }

    if (!careerHtml || !careerUrl) {
      return directResult;
    }

    logger.info(`Running Deep 2-Step ATS Inspection for ${companyHint || careerUrl}`);

    try {
      const $ = cheerio.load(careerHtml);
      const sampleJobLinks: string[] = [];

      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

        try {
          const resolved = new URL(href, careerUrl).toString();
          const lower = resolved.toLowerCase();

          if (
            (lower.includes("/job/") ||
              lower.includes("/jobs/") ||
              lower.includes("/position/") ||
              lower.includes("/vacancy/") ||
              lower.includes("/vacancies/") ||
              lower.includes("/posting/") ||
              lower.includes("/role/")) &&
            !sampleJobLinks.includes(resolved)
          ) {
            sampleJobLinks.push(resolved);
          }
        } catch {}
      });

      // Inspect up to top 2 job detail pages
      for (const jobUrl of sampleJobLinks.slice(0, 2)) {
        try {
          const probe = await fetchUrl(jobUrl, { timeout: 4500 });
          if (probe.ok && typeof probe.data === "string") {
            const j$ = cheerio.load(probe.data);
            const applyCandidates: string[] = [];

            // Scan for Apply buttons and links
            j$("a[href], form[action]").each((_, el) => {
              const href = j$(el).attr("href") || j$(el).attr("action");
              const text = j$(el).text().toLowerCase().trim();
              if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

              try {
                const resolved = new URL(href, jobUrl).toString();
                const lower = (text + " " + resolved).toLowerCase();

                if (
                  lower.includes("apply") ||
                  lower.includes("submit") ||
                  lower.includes("application") ||
                  text.includes("apply") ||
                  text.includes("apply now")
                ) {
                  applyCandidates.push(resolved);
                }
              } catch {}
            });

            // Check if any apply target matches an ATS
            for (const applyUrl of applyCandidates) {
              const applyCheck = this.detect(applyUrl, "", companyHint);
              if (applyCheck.ats !== "None" && applyCheck.ats !== "Custom / In-House Portal") {
                logger.info(
                  `Deep ATS detected via Apply URL: ${applyCheck.ats} on ${applyUrl}`,
                  companyHint
                );
                return {
                  ...applyCheck,
                  atsUrl: applyUrl,
                  confidence: 0.95,
                  detectionStage: "deep_apply_click",
                };
              }
            }

            // Also check the job page HTML itself for embedded ATS
            const jobHtmlCheck = this.detect(jobUrl, probe.data, companyHint);
            if (jobHtmlCheck.ats !== "None" && jobHtmlCheck.ats !== "Custom / In-House Portal") {
              return {
                ...jobHtmlCheck,
                confidence: 0.9,
                detectionStage: "deep_apply_click",
              };
            }
          }
        } catch {}
      }
    } catch (err: any) {
      logger.warn(`Deep ATS detection error: ${err.message}`);
    }

    return directResult;
  }
}
