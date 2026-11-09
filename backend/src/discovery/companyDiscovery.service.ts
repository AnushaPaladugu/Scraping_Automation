import * as cheerio from "cheerio";
import { CompanyInput, CompanyDiscoveryResult } from "../types/company";
import { fetchUrl } from "../utils/httpClient";
import { logger } from "../utils/logger";
import { AtsDetectorService } from "./atsDetector.service";
import { WebsiteVerifierService } from "./websiteVerifier.service";
import { SearchDiscoveryService } from "./searchDiscovery.service";
import { ReferenceRegistryService } from "./referenceRegistry.service";
import { MetadataExtractorService } from "./metadataExtractor.service";



export class CompanyDiscoveryService {
  /**
   * Main entry point for single and bulk company discovery.
   */
  public static async discover(input: CompanyInput): Promise<CompanyDiscoveryResult> {
    const rawName = (input.companyName || "").trim();
    if (!rawName) {
      return {
        companyName: "",
        companyUrl: null,
        careerUrl: null,
        ats: "None",
        atsUrl: null,
        detectionStatus: "failed",
        confidence: 0,
        detectionMethod: "none",
        verified: false,
        error: "Company name is required",
      };
    }


    // 1b. Check Reference Registry
    await ReferenceRegistryService.init();
    const registryMatch = ReferenceRegistryService.lookup(rawName);
    if (registryMatch) {
      logger.info(`Matched company entry: ${registryMatch.companyName}`, rawName);

      let finalCareerUrl = registryMatch.careerUrl || null;
      let finalAts = registryMatch.ats || "None";
      let finalAtsUrl = registryMatch.atsUrl || null;
      let finalSlug = registryMatch.companySlug;
      let finalApiUrl = registryMatch.apiUrl;

      // Probe careerUrl to follow redirects, detect ATS portals, and resolve dedicated candidate job boards
      if (finalCareerUrl) {
        try {
          const probe = await fetchUrl(finalCareerUrl, { timeout: 3000 });
          if (probe.finalUrl && probe.finalUrl !== finalCareerUrl) {
            finalCareerUrl = probe.finalUrl;
          }
          if (probe.ok && typeof probe.data === "string") {
            const htmlData = probe.data;
            const htmlAts = AtsDetectorService.detect(finalCareerUrl, htmlData, rawName);
            if (htmlAts.ats !== "None" && htmlAts.ats !== "Custom / In-House Portal" && htmlAts.ats !== "Custom") {
              finalAts = htmlAts.ats;
              finalSlug = htmlAts.slug || finalSlug;
              finalApiUrl = htmlAts.apiUrl || finalApiUrl;
              finalAtsUrl = htmlAts.atsUrl || finalAtsUrl;
              if (htmlAts.atsUrl && !htmlAts.atsUrl.startsWith("http://") && !htmlAts.atsUrl.startsWith("https://")) {
                try {
                  finalCareerUrl = new URL(htmlAts.atsUrl, finalCareerUrl).toString();
                } catch {}
              } else if (htmlAts.atsUrl) {
                finalCareerUrl = htmlAts.atsUrl;
              }
            } else {
              // Check if landing page points to dedicated candidate jobs portal (e.g. /jobs/, /search-and-apply/)
              const $ = cheerio.load(htmlData);
              let dedicatedPortal: string | null = null;
              $("a").each((_, el) => {
                if (dedicatedPortal) return;
                const h = $(el).attr("href");
                const t = $(el).text().trim().toLowerCase();
                if (
                  h &&
                  (t === "jobs" ||
                    t === "search jobs" ||
                    t === "search and apply" ||
                    t === "current vacancies" ||
                    /\/search-and-apply\/?$/i.test(h) ||
                    /\/jobs\/?$/i.test(h))
                ) {
                  try {
                    const resolved = new URL(h, finalCareerUrl!).toString();
                    if (
                      resolved !== finalCareerUrl &&
                      !resolved.startsWith("javascript:") &&
                      !resolved.includes("#") &&
                      !resolved.includes("login")
                    ) {
                      if (/\/jobs\/?$/i.test(resolved) || /\/search-and-apply\/?$/i.test(resolved)) {
                        dedicatedPortal = resolved;
                      }
                    }
                  } catch {}
                }
              });
              if (dedicatedPortal) {
                finalCareerUrl = dedicatedPortal;
                finalAtsUrl = dedicatedPortal;
              }
            }
          }
        } catch {}
      }

      const apiInfo = CompanyDiscoveryService.buildPublicApiInfo(finalAts, finalSlug, finalApiUrl);

      return {
        id: input.id,
        companyName: registryMatch.companyName || rawName,
        company: registryMatch.companyName || rawName,
        companyUrl: registryMatch.companyUrl || null,
        careerUrl: finalCareerUrl,
        ats: finalAts,
        atsUrl: finalAtsUrl,
        companySlug: finalSlug,
        slug: finalSlug,
        apiUrl: finalApiUrl,
        public_api: apiInfo.public_api,
        public_api_data: apiInfo.public_api_data,
        detectionStatus: "confirmed",
        confidence: 1.0,
        detectionMethod: finalApiUrl
          ? `ats_api (${finalAts})`
          : finalAts && finalAts !== "None" && finalAts !== "Custom"
          ? `ats_pattern (${finalAts})`
          : "html_pagination",
        verified: true,
        industry: registryMatch.industry || input.industry,
        city: registryMatch.city || input.city,
        state: registryMatch.state || input.state,
        country: registryMatch.country || input.country,
      };
    }

    // 2. If caller provided companyUrl, start with verification
    let officialUrl: string | null = null;
    let careerUrl: string | null = input.careerUrl ? input.careerUrl.trim() : null;
    let homepageHtml: string = "";
    let verificationConfidence = 0;

    if (input.companyUrl) {
      let targetUrl = input.companyUrl.trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`;
      }
      const probe = await fetchUrl(targetUrl, { timeout: 3000 });
      if (probe.ok && typeof probe.data === "string") {
        const verify = WebsiteVerifierService.verify(rawName, probe.finalUrl, probe.data);
        if (verify.verified) {
          officialUrl = probe.finalUrl;
          homepageHtml = probe.data;
          verificationConfidence = verify.confidence;
        }
      }
    }

    // 3. Probing top candidate domains concurrently (fast 2000ms parallel probe)
    if (!officialUrl) {
      const candidateDomains = this.generateCandidateDomains(rawName).slice(0, 8);
      const results = await Promise.all(
        candidateDomains.map(async (domain) => {
          try {
            const probe = await fetchUrl(domain, { timeout: 2000 });
            if (probe.ok && typeof probe.data === "string") {
              const verify = WebsiteVerifierService.verify(rawName, probe.finalUrl, probe.data);
              if (verify.verified) {
                return {
                  url: probe.finalUrl,
                  html: probe.data,
                  confidence: verify.confidence,
                };
              }
            } else if (probe.status === 403 || probe.status === 401) {
              // Recognize Cloudflare/Akamai bot-protected live domains
              const isCf = probe.headers["cf-ray"] || probe.headers["server"]?.toLowerCase().includes("cloudflare");
              const brandSlug = rawName.toLowerCase().replace(/[^a-z0-9]/g, "");
              if (isCf && domain.includes(brandSlug.slice(0, 6))) {
                return {
                  url: domain.endsWith("/") ? domain : `${domain}/`,
                  html: "",
                  confidence: 0.8,
                };
              }
            }
          } catch {
            // ignore
          }
          return null;
        })
      );

      const match = results.find((r) => r !== null);
      if (match) {
        officialUrl = match.url;
        homepageHtml = match.html;
        verificationConfidence = match.confidence;
      }
    }

    // 4. Live Search Discovery (Google, Bing, LinkedIn) if still not verified
    let searchResIndustry: string | undefined;
    let searchResCity: string | undefined;
    let searchResState: string | undefined;
    let searchResCountry: string | undefined;

    if (!officialUrl) {
      const locationParts = [input.city, input.state, input.country, input.industry].filter(Boolean);
      const locationHint = locationParts.join(" ");
      try {
        const searchRes = await SearchDiscoveryService.discoverCompany(rawName, locationHint);
        if (searchRes.officialUrl) {
          officialUrl = searchRes.officialUrl;
          verificationConfidence = searchRes.confidence;
          if (searchRes.careerUrl) {
            careerUrl = searchRes.careerUrl;
          }
          if (searchRes.industry) searchResIndustry = searchRes.industry;
          if (searchRes.city) searchResCity = searchRes.city;
          if (searchRes.state) searchResState = searchRes.state;
          if (searchRes.country) searchResCountry = searchRes.country;

          // Fetch homepage html for link scoring and ATS detection
          const probe = await fetchUrl(officialUrl);
          if (probe.ok && typeof probe.data === "string") {
            homepageHtml = probe.data;
          }
        }
      } catch (err: any) {
        logger.warn(`Live search fallback failed: ${err.message}`, rawName);
      }
    }

    if (!officialUrl) {
      if (input.companyUrl || input.careerUrl) {
        officialUrl = input.companyUrl || input.careerUrl || null;
        verificationConfidence = 0.8;
      } else {
        return {
          companyName: rawName,
          companyUrl: null,
          careerUrl: null,
          ats: "None",
          atsUrl: null,
          detectionStatus: "failed",
          confidence: 0,
          detectionMethod: "probing",
          verified: false,
          error: "Official company website could not be verified.",
        };
      }
    }

    // Normalize official website to root origin
    if (officialUrl) {
      try {
        const u = new URL(officialUrl);
        officialUrl = `${u.origin}/`;
      } catch {}
    }

    // 4. Find Career Page
    if (!careerUrl && input.careerUrl) {
      careerUrl = input.careerUrl.trim();
    }
    let careerHtml: string = "";

    if (careerUrl) {
      if (!/^https?:\/\//i.test(careerUrl)) {
        careerUrl = `https://${careerUrl}`;
      }
      const cProbe = await fetchUrl(careerUrl);
      if (cProbe.ok && typeof cProbe.data === "string") {
        careerUrl = cProbe.finalUrl;
        careerHtml = cProbe.data;
      }
    }

    // Scan homepage HTML for career links with intelligent scoring
    if (!careerUrl && homepageHtml) {
      const $ = cheerio.load(homepageHtml);
      const scoredLinks: Array<{ text: string; href: string; score: number }> = [];

      $("a").each((_, el) => {
        const href = $(el).attr("href");
        const text = $(el).text().toLowerCase().trim();

        if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
          try {
            const resolved = new URL(href, officialUrl!).toString();
            if (
              !resolved.includes("login") &&
              !resolved.includes("privacy") &&
              !resolved.includes("cookie") &&
              !resolved.includes("terms") &&
              !resolved.includes("faq")
            ) {
              const lower = (text + " " + resolved).toLowerCase();
              let score = 0;

              // High-priority job listing directories on company domain
              if (
                lower.includes("explore-our-jobs") ||
                lower.includes("explore-jobs") ||
                lower.includes("all-jobs") ||
                lower.includes("open-roles") ||
                lower.includes("vacancies") ||
                lower.includes("search-jobs") ||
                lower.includes("job-openings") ||
                lower.includes("jobs-board") ||
                lower.includes("current-vacancies") ||
                lower.includes("all-our-job-vacancies")
              ) {
                score += 35;
              }

              // Direct link to recognized ATS boards
              if (
                lower.includes("greenhouse.io") ||
                lower.includes("lever.co") ||
                lower.includes("ashbyhq.com") ||
                lower.includes("smartrecruiters.com") ||
                lower.includes("workable.com") ||
                lower.includes("bamboohr.com") ||
                lower.includes("myworkdayjobs.com") ||
                lower.includes("eploy.net")
              ) {
                score += 15;
              }

              // Standard career terms
              if (
                lower.includes("/jobs") ||
                lower.includes("/careers/jobs") ||
                lower.includes("/careers") ||
                lower.includes("careers") ||
                lower.includes("join us") ||
                lower.includes("work with us")
              ) {
                score += 8;
              }

              // Deprioritize culture/marketing/interview pages
              if (
                lower.includes("meet-") ||
                lower.includes("working-at") ||
                lower.includes("life-at") ||
                lower.includes("women-at") ||
                lower.includes("culture") ||
                lower.includes("diversity") ||
                lower.includes("benefits") ||
                lower.includes("article") ||
                lower.includes("blog") ||
                lower.includes("news")
              ) {
                score -= 10;
              }

              if (score > 0) {
                scoredLinks.push({ text, href: resolved, score });
              }
            }
          } catch {
            // invalid URL
          }
        }
      });

      scoredLinks.sort((a, b) => b.score - a.score);

      if (scoredLinks.length > 0) {
        careerUrl = scoredLinks[0].href;
        const cProbe = await fetchUrl(careerUrl);
        if (cProbe.ok && typeof cProbe.data === "string") {
          careerUrl = cProbe.finalUrl;
          careerHtml = cProbe.data;
        }
      }
    }

    // Fallback standard career paths (fast parallel probe)
    if (!careerUrl && officialUrl) {
      const baseClean = officialUrl.replace(/\/$/, "");
      const commonPaths = [`${baseClean}/careers`, `${baseClean}/jobs`, `${baseClean}/vacancies`];
      const pathResults = await Promise.all(
        commonPaths.map(async (cp) => {
          try {
            const cProbe = await fetchUrl(cp, { timeout: 1200 });
            if (cProbe.ok && typeof cProbe.data === "string") {
              return { url: cProbe.finalUrl, html: cProbe.data };
            }
          } catch {}
          return null;
        })
      );
      const matchedPath = pathResults.find((p) => p !== null);
      if (matchedPath) {
        careerUrl = matchedPath.url;
        careerHtml = matchedPath.html;
      }
    }

    // If still no career URL, default to official URL
    if (!careerUrl) {
      careerUrl = officialUrl;
      careerHtml = homepageHtml;
    }

    // 5. ATS Detection (scan career page, homepage, and deep 2-step apply action)
    const combinedHtml = `${careerHtml}\n${homepageHtml}`;
    const atsResult = await AtsDetectorService.detectDeep(careerUrl || officialUrl || "", combinedHtml, rawName);

    // Honor ATS or slug from uploaded file if detected returned NOT_FOUND or None
    let finalAts = atsResult.ats !== "None" && atsResult.ats !== "NOT_FOUND" ? atsResult.ats : input.ats || "NOT_FOUND";
    if (finalAts === "Custom / In-House Portal") {
      finalAts = "Custom ATS";
    }
    if ((finalAts === "None" || finalAts === "NOT_FOUND") && officialUrl) {
      finalAts = "Custom ATS";
    }
    const finalSlug = atsResult.slug || input.slug || rawName.toLowerCase().replace(/[^a-z0-9]/g, "");

    let finalApiUrl = atsResult.apiUrl || undefined;
    let finalAtsUrl = atsResult.atsUrl || (finalAts !== "NOT_FOUND" && finalAts !== "None" ? careerUrl : null);

    // If Greenhouse was detected or provided
    if (finalAts.toLowerCase() === "greenhouse" && finalSlug) {
      finalApiUrl = `https://boards-api.greenhouse.io/v1/boards/${finalSlug}/jobs?content=true`;
      finalAtsUrl = `https://boards.greenhouse.io/${finalSlug}`;
    }

    const isConfirmed = !!officialUrl || atsResult.confidence >= 0.8 || verificationConfidence >= 0.4;
    const detectionStatus = isConfirmed ? "confirmed" : (finalAts !== "None" && finalAts !== "NOT_FOUND" ? "inferred" : "failed");

    const apiInfo = CompanyDiscoveryService.buildPublicApiInfo(finalAts, finalSlug, finalApiUrl);

    // Deep location & industry metadata extraction (HTML schema, meta, contact page, & LinkedIn fallback)
    const metaEnrichment = await MetadataExtractorService.extract(rawName, officialUrl, homepageHtml);

    const finalIndustry = input.industry || searchResIndustry || metaEnrichment.industry || "";
    const finalCity = input.city || searchResCity || metaEnrichment.city || "";
    const finalState = input.state || searchResState || metaEnrichment.state || "";
    const finalCountry = input.country || searchResCountry || metaEnrichment.country || "";

    return {
      id: input.id,
      companyName: rawName,
      company: rawName,
      companyUrl: officialUrl,
      careerUrl,
      ats: finalAts,
      atsUrl: finalAtsUrl,
      companySlug: finalSlug,
      slug: finalSlug,
      apiUrl: finalApiUrl,
      public_api: apiInfo.public_api,
      public_api_data: apiInfo.public_api_data,
      detectionStatus,
      confidence: Math.round(((verificationConfidence + atsResult.confidence) / 2) * 100) / 100,
      detectionMethod: finalAts !== "None" && finalAts !== "NOT_FOUND" ? `ats_detection (${finalAts})` : "html_discovery",
      verified: true,
      industry: finalIndustry,
      city: finalCity,
      state: finalState,
      country: finalCountry,
    };
  }

  public static buildPublicApiInfo(ats: string, slug?: string | null, apiUrl?: string | null): { public_api: boolean; public_api_data: string } {
    const atsLower = (ats || "").toLowerCase();
    const s = (slug || "").trim();

    if (atsLower.includes("greenhouse") && s) {
      return {
        public_api: true,
        public_api_data: `GET https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`,
      };
    }
    if (atsLower.includes("lever") && s) {
      return {
        public_api: true,
        public_api_data: `GET https://api.lever.co/v0/postings/${s}?mode=json`,
      };
    }
    if (atsLower.includes("smartrecruiters") && s) {
      return {
        public_api: true,
        public_api_data: `GET https://api.smartrecruiters.com/v1/companies/${s}/postings`,
      };
    }
    if (atsLower.includes("ashby") && s) {
      return {
        public_api: true,
        public_api_data: `POST https://api.ashbyhq.com/posting-api/job-board/${s}`,
      };
    }
    if (atsLower.includes("workable") && s) {
      return {
        public_api: true,
        public_api_data: `GET https://apply.workable.com/api/v1/widget/accounts/${s}`,
      };
    }
    if (atsLower.includes("recruitee") && s) {
      return {
        public_api: true,
        public_api_data: `GET https://${s}.recruitee.com/api/offers/`,
      };
    }
    if (atsLower.includes("teamtailor") && s) {
      return {
        public_api: true,
        public_api_data: `GET https://${s}.teamtailor.com/jobs`,
      };
    }
    if (atsLower.includes("bamboohr") && s) {
      return {
        public_api: true,
        public_api_data: `GET https://${s}.bamboohr.com/careers/list`,
      };
    }
    if (atsLower.includes("personio") && s) {
      return {
        public_api: true,
        public_api_data: `GET https://${s}.personio.de/xml`,
      };
    }
    if (atsLower.includes("breezy") && s) {
      return {
        public_api: true,
        public_api_data: `GET https://${s}.breezy.hr/api/v1/positions`,
      };
    }
    if (atsLower.includes("workday") && s) {
      return {
        public_api: true,
        public_api_data: `POST https://${s}.myworkdayjobs.com/wday/cxs/${s}/sidebar/jobs`,
      };
    }
    if (apiUrl && apiUrl.startsWith("http")) {
      const method = apiUrl.includes("ashbyhq") || apiUrl.includes("workday") ? "POST" : "GET";
      return {
        public_api: true,
        public_api_data: `${method} ${apiUrl}`,
      };
    }

    return {
      public_api: false,
      public_api_data: "",
    };
  }

  /**
   * Generates intelligent candidate domain permutations across top TLDs
   * based on token decomposition and legal/industry suffix normalization.
   */
  private static generateCandidateDomains(rawName: string): string[] {
    const LEGAL_REGEX = /\b(s\.?a\.?|p\.?l\.?c\.?|l\.?t\.?d\.?|i\.?n\.?c\.?|c\.?o\.?r\.?p\.?|l\.?l\.?c\.?|l\.?l\.?p\.?|p\.?v\.?t\.?|g\.?m\.?b\.?h\.?|s\.?a\.?r\.?l\.?|b\.?v\.?|n\.?v\.?|limited|incorporated|corporation|private|company|companies)\b/gi;
    const STOP_WORDS = new Set(["the", "a", "an", "and", "&", "of", "in"]);
    const INDUSTRY_TERMS = new Set(["group", "holdings", "technologies", "technology", "solutions", "services", "bank", "international", "systems", "consulting", "family", "companies", "care", "center", "healthcare"]);

    const cleaned = rawName.replace(LEGAL_REGEX, " ").trim();
    const rawTokens = cleaned
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0);

    const brandTokens = rawTokens.filter((t) => !STOP_WORDS.has(t));
    const pureBrandTokens = brandTokens.filter((t) => !INDUSTRY_TERMS.has(t));

    const slugSets: string[] = [];

    // 1. Pure brand tokens (e.g. "pla", "oakpark", "travelvillage")
    if (pureBrandTokens.length > 0) {
      const pureSlug = pureBrandTokens.join("");
      slugSets.push(pureSlug);
      slugSets.push(`${pureSlug}co`);
      slugSets.push(`${pureSlug}group`);
      slugSets.push(`${pureSlug}care`);
      slugSets.push(`${pureSlug}hc`);
      slugSets.push(`${pureSlug}hcc`);
      if (pureBrandTokens.length > 1) {
        slugSets.push(pureBrandTokens.join("-"));
      }
    }

    // 2. Brand tokens with industry/category words (e.g. "oakparkcare", "oakparkcarecenter", "plafamily")
    if (brandTokens.length > 0) {
      slugSets.push(brandTokens.join(""));
      if (brandTokens.length > 1) {
        slugSets.push(brandTokens.join("-"));
      }
    }

    // 3. Raw stripped name fallback
    const fullRaw = rawName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (fullRaw && !slugSets.includes(fullRaw)) {
      slugSets.push(fullRaw);
    }

    const tlds = [".com", ".co.uk", ".io", ".ai", ".org", ".net", ".co", ".us.com"];
    const candidates: string[] = [];

    for (const slug of slugSets) {
      for (const tld of tlds) {
        candidates.push(`https://www.${slug}${tld}`);
        candidates.push(`https://${slug}${tld}`);
      }
    }

    return Array.from(new Set(candidates));
  }
}
