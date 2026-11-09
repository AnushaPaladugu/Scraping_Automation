import { chromium, Browser, BrowserContext } from "playwright";
import { CompanyDiscoveryResult } from "../../types/company";
import { ScraperResult, ScrapeFilters } from "../../types/scraper";
import { IScraper } from "../scraper.interface";
import { config } from "../../config";
import { normalizeRawJob } from "../../processors";
import { JobValidator } from "../../validators/jobValidator";
import { JobDeduplicator } from "../../deduplication/deduplicator";
import { logger } from "../../utils/logger";
import { enrichJobDetails } from "../enrichment/detailPageEnricher";

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await chromium.launch({
      headless: config.PLAYWRIGHT_HEADLESS,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return sharedBrowser;
}

export class PlaywrightScraper implements IScraper {
  public name = "PlaywrightScraper";
  public method = "playwright" as const;

  public canHandle(): boolean {
    // Dynamic fallback can handle any page
    return true;
  }

  public async scrape(
    companyInfo: CompanyDiscoveryResult,
    prefetchHtml?: string,
    filters?: ScrapeFilters
  ): Promise<ScraperResult> {
    const rawUrl = companyInfo.careerUrl || companyInfo.atsUrl || companyInfo.companyUrl;
    if (!rawUrl) {
      return {
        success: false,
        status: "FAILED",
        method: "playwright",
        jobs: [],
        totalJobs: 0,
        invalidJobs: [],
        error: "No career URL available for Playwright scraping",
      };
    }

    // Prepare smart navigation URL with filter parameters or multi-region routing
    let navigationUrl = rawUrl;
    if (navigationUrl.includes("myworkdayjobs.com")) {
      navigationUrl = navigationUrl.replace(/\/+(?:login|sign-in|signin)(?:\/.*)?$/i, "");
    }
    if (filters?.country) {
      const cLower = filters.country.toLowerCase().trim();
      try {
        const u = new URL(rawUrl);
        // Region portal switching for multi-region portals (e.g. Cognizant)
        if (u.hostname.includes("cognizant.com") && u.pathname.includes("-en/jobs")) {
          if (cLower === "united kingdom" || cLower === "uk" || cLower === "gb") {
            u.pathname = u.pathname.replace(/[a-z]+-en\/jobs/, "uki-en/jobs");
            navigationUrl = u.toString();
          } else if (cLower === "india" || cLower === "in") {
            u.pathname = u.pathname.replace(/[a-z]+-en\/jobs/, "india-en/jobs");
            navigationUrl = u.toString();
          } else if (cLower === "united states" || cLower === "usa" || cLower === "us") {
            u.pathname = u.pathname.replace(/[a-z]+-en\/jobs/, "us-en/jobs");
            navigationUrl = u.toString();
          } else if (cLower === "canada" || cLower === "ca") {
            u.pathname = u.pathname.replace(/[a-z]+-en\/jobs/, "ca-en/jobs");
            navigationUrl = u.toString();
          }
        } else if (
          u.pathname.includes("/search") ||
          u.pathname.includes("/careersection")
        ) {
          if (!u.searchParams.has("location")) {
            u.searchParams.set("location", filters.country);
          }
          navigationUrl = u.toString();
        }
      } catch {}
    }

    logger.info(`Starting Playwright dynamic scraping on ${navigationUrl}`, companyInfo.companyName);

    let context: BrowserContext | null = null;

    try {
      const browser = await getBrowser();
      context = await browser.newContext({
        userAgent: config.USER_AGENT,
        viewport: { width: 1280, height: 800 },
      });

      // Inject __name polyfill to prevent esbuild/tsx bundling helpers from causing ReferenceError: __name is not defined
      const namePolyfillScript = `
        (function() {
          function __name(target, value) { return target; }
          if (typeof window !== "undefined") window.__name = __name;
          if (typeof globalThis !== "undefined") globalThis.__name = __name;
        })();
      `;
      await context.addInitScript(namePolyfillScript);

      const page = await context.newPage();
      await page.addInitScript(namePolyfillScript);

      // Intercept background JSON API requests from modern SPAs (HiBob, Workday CXS, MyNewTerm, etc.)
      const interceptedJobs: any[] = [];
      page.on("response", async (res) => {
        try {
          const u = res.url();
          const ct = res.headers()["content-type"] || "";
          if (!ct.includes("json") && !u.includes("/api/job-ad")) return;

          // 1. HiBob: /api/job-ad
          if (u.includes("/api/job-ad")) {
            const data = await res.json();
            if (data?.jobAdDetails && Array.isArray(data.jobAdDetails)) {
              for (const j of data.jobAdDetails) {
                interceptedJobs.push({
                  title: j.title,
                  id: j.id,
                  location: [j.site, j.country].filter(Boolean).join(", "),
                  country: j.country || companyInfo.country || "United Kingdom",
                  department: j.department,
                  employment_type: j.employmentType,
                  posted_date: j.publishedAt ? j.publishedAt.split("T")[0] : null,
                  description: (j.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
                  url: `${navigationUrl}#job-${j.id}`,
                });
              }
            }
          }

          // 2. Workday CXS API: /wday/cxs/.../jobs
          if (u.includes("/wday/cxs/") && u.includes("/jobs")) {
            const data = await res.json();
            if (data?.jobPostings && Array.isArray(data.jobPostings)) {
              const origin = new URL(u).origin;
              for (const j of data.jobPostings) {
                interceptedJobs.push({
                  title: j.title,
                  id: j.bulletFields?.[0] || j.externalPath,
                  location: j.locationsText,
                  country: companyInfo.country || "United Kingdom",
                  posted_date: j.postedOn,
                  url: j.externalPath ? `${origin}${j.externalPath}` : navigationUrl,
                });
              }
            }
          }

          // 3. MyNewTerm: api.mynewterm.com/v1/3pa/vacancies
          if (u.includes("mynewterm.com") && u.includes("vacanc")) {
            const data = await res.json();
            if (data?.tokenData && typeof data.tokenData === "string") {
              const parts = data.tokenData.split(".");
              if (parts.length >= 2) {
                const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
                if (payload?.jobs && Array.isArray(payload.jobs)) {
                  for (const j of payload.jobs) {
                    interceptedJobs.push({
                      title: j.job_position,
                      id: j.job_ref_number || String(j.job_ads_id),
                      location: [j.region, j.est_name, j.est_post_code].filter(Boolean).join(", "),
                      country: "United Kingdom",
                      salary: j.salary_range,
                      posted_date: j.created_at ? j.created_at.split(" ")[0] : null,
                      closing_date: j.closing_date,
                      url: `https://mynewterm.com/school/${j.est_name?.replace(/\s+/g, "-")}/${j.est_number}/${j.job_ref_number?.replace(/\//g, "-")}/${j.job_position?.replace(/[\s\/]+/g, "-")}`,
                    });
                  }
                }
              }
            }
          }
        } catch {}
      });

      await page.goto(navigationUrl, {
        waitUntil: "domcontentloaded",
        timeout: config.SCRAPER_TIMEOUT,
      });

      await page.evaluate(`
        if (typeof globalThis.__name === "undefined") {
          globalThis.__name = (t, v) => t;
          if (typeof window !== "undefined") window.__name = globalThis.__name;
        }
      `).catch(() => {});

      // Scroll and wait for dynamic hydration / lazy-loaded jobs
      await page.evaluate(() => {
        function __name(t: any) { return t; }
        window.scrollBy(0, 800);
      });
      await page.waitForTimeout(3000);

      // Handle redirect to active jobs portal or ATS portal if landing page has no jobs
      const currentUrl = page.url();
      try {
        const targetPortalUrl = await page.evaluate(() => {
          function __name(t: any) { return t; }
          const anchors = Array.from(document.querySelectorAll("a"));
          // 1. External ATS links (Workday, SuccessFactors, MyNewTerm, Tribepad, iCIMS, HiBob, iTrent)
          for (const a of anchors) {
            const href = a.href || "";
            if (
              href.includes("myworkdayjobs.com") ||
              href.includes("successfactors.") ||
              (href.includes("tribepad.com") && !href.includes("www.tribepad.com")) ||
              href.includes("icims.com") ||
              href.includes("careers.hibob.com") ||
              href.includes("webitrent.com") ||
              href.includes("ETREC179GF.open") ||
              href.includes("greenhouse.io") ||
              href.includes("lever.co") ||
              href.includes("smartrecruiters.com")
            ) {
              return href;
            }
          }
          // 2. Specific search or dedicated careers portals
          for (const a of anchors) {
            const href = a.href || "";
            const txt = (a.textContent || "").trim().toLowerCase();
            if (
              (txt === "search jobs" ||
                txt === "search all jobs" ||
                txt === "find a job" ||
                txt === "view all jobs" ||
                txt === "search and apply" ||
                txt === "vacancies" ||
                txt === "current vacancies" ||
                txt === "latest vacancies" ||
                txt === "opportunities" ||
                (txt === "here" && href.includes("webitrent")) ||
                txt.includes("travis perkins plc careers")) &&
              !href.startsWith("javascript:") &&
              !href.includes("#")
            ) {
              return href;
            }
          }
          return null;
        });

        let resolvedPortalUrl = targetPortalUrl;
        if (resolvedPortalUrl && resolvedPortalUrl.includes("myworkdayjobs.com")) {
          resolvedPortalUrl = resolvedPortalUrl.replace(/\/+(?:login|sign-in|signin)(?:\/.*)?$/i, "");
        }

        const cleanCurrent = currentUrl.toLowerCase().replace(/\/$/, "");
        if (resolvedPortalUrl) {
          const cleanTarget = resolvedPortalUrl.toLowerCase().replace(/\/$/, "");
          if (cleanTarget !== cleanCurrent) {
            logger.info(`Navigating to discovered active jobs portal: ${resolvedPortalUrl}`, companyInfo.companyName);
            await page.goto(resolvedPortalUrl, {
              waitUntil: "domcontentloaded",
              timeout: config.SCRAPER_TIMEOUT,
            });
            await page.evaluate(() => {
              function __name(t: any) { return t; }
              window.scrollBy(0, 800);
            });
            await page.waitForTimeout(3000);
          }
        }

        // Check for full vacancy list links (e.g. cat=-1)
        const fullCatLink = await page.evaluate(() => {
          function __name(t: any) { return t; }
          const a = document.querySelector('a[href*="cat=-1"]');
          return a ? (a as HTMLAnchorElement).href : null;
        });
        if (fullCatLink && fullCatLink.toLowerCase().replace(/\/$/, "") !== page.url().toLowerCase().replace(/\/$/, "")) {
          logger.info(`Navigating to discovered full list: ${fullCatLink}`, companyInfo.companyName);
          await page.goto(fullCatLink, {
            waitUntil: "domcontentloaded",
            timeout: config.SCRAPER_TIMEOUT,
          });
          await page.waitForTimeout(2000);
        }
      } catch {}

      // 1. Try extracting any dynamically injected JSON-LD JobPosting scripts
      const ldPostings = await page.evaluate(() => {
        function __name(t: any) { return t; }
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        const results: any[] = [];
        scripts.forEach((s) => {
          try {
            const parsed = JSON.parse(s.textContent || "");
            if (Array.isArray(parsed)) {
              parsed.forEach((p) => {
                if (p["@type"] === "JobPosting") results.push(p);
              });
            } else if (parsed["@graph"]) {
              parsed["@graph"].forEach((p: any) => {
                if (p["@type"] === "JobPosting") results.push(p);
              });
            } else if (parsed["@type"] === "JobPosting") {
              results.push(parsed);
            }
          } catch {}
        });
        return results;
      });

      let rawJobs: any[] = [];

      if (ldPostings.length > 0) {
        rawJobs = ldPostings.map((p) => ({
          title: p.title,
          company: p.hiringOrganization?.name || companyInfo.companyName,
          url: p.url || navigationUrl,
          id: p.identifier?.value || p.identifier,
          location: Array.isArray(p.jobLocation) ? p.jobLocation[0] : p.jobLocation,
          description: p.description,
          employment_type: p.employmentType,
          posted_date: p.datePosted,
          closing_date: p.validThrough,
          salary: p.baseSalary,
        }));
      } else {
        // 2. Extract structured DOM elements / job cards across modern ATS portals
        // (Phenom People, Workday, Oracle Taleo, SAP SuccessFactors, custom SPAs)
        const domJobs = await page.evaluate(() => {
          function __name(t: any) { return t; }
          const results: any[] = [];
          const seenUrls = new Set<string>();

          // Candidate card container selectors across modern ATS platforms and portals
          const cardSelectors = [
            'li[class*="job"]',
            'div[class*="job-tile"]',
            'div[class*="job-inner"]',
            'div[class*="card-job"]',
            'div[data-ph-at-id*="job"]',
            'tr[class*="job"]',
            'div[class*="search-result"]',
            'div[role="listitem"]',
            '.jobs-section li',
            'ul[class*="jobs"] > li',
            '#mnt-parent-container div',
            '.btt',
            'div[class*="vacancy"]',
            'li[class*="vacancy"]',
            'tr[class*="vacancy"]',
            '.nectar-hor-list-item',
            '.nectar-list-item',
            '.accordion-item',
            '.Mhr-jobDetailTitleContainer',
            'div[class*="jobDetail"]',
            'table.table tr',
            'table tr',
          ];

          const cards = document.querySelectorAll(cardSelectors.join(", "));
          cards.forEach((card) => {
            const a = card.querySelector(
              'a[href*="/jobs/"], a[href*="/job/"], a[href*="/vacancy/"], a[href*="/vacancies/"], a[href*="/opportunit"], a[href*="mynewterm.com"], a[href*="Vacancy.aspx"], a[href*="webitrent"], a[href*="ETREC"], a[data-ph-at-id="job-link"], a[href*="jobdetail.ftl"], a.full-link, .Mhr-jobDetailTitleLink'
            ) || card.querySelector("a");
            if (!a) return;

            let href = (a as HTMLAnchorElement).href;
            const isMhr = card.classList.contains("Mhr-jobDetailTitleContainer") || card.querySelector(".Mhr-jobDetailTitleLink") !== null;

            if (isMhr) {
              const titleEl = card.querySelector(".Mhr-jobDetailTitleLink span, .Mhr-jobDetailTitleLink") || card.querySelector("a span");
              const mhrTitle = (titleEl?.textContent || "").replace(/\s*Job profile\s*$/i, "").trim();
              if (mhrTitle) {
                href = `${window.location.href}#${mhrTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
              }
            }

            if (!href || seenUrls.has(href)) return;

            if (!isMhr) {
              // Reject generic navigation and regional index URLs
              try {
                const u = new URL(href);
                const path = u.pathname.toLowerCase().replace(/\/$/, "");
                if (
                  path === "/jobs" ||
                  path === "/careers" ||
                  path.endsWith("/jobs") ||
                  path.endsWith("/careers")
                )
                  return;
                if (
                  path.includes("/saved-jobs") ||
                  path.includes("/change-region") ||
                  path.includes("/login") ||
                  path.includes("/privacy")
                )
                  return;
              } catch {
                return;
              }
            }

            const isNavTitle = (t: string) => {
              const lower = t.trim().toLowerCase();
              return (
                lower.length < 3 ||
                /^(jobs|saved jobs|search jobs|find a job|browse jobs|sign in|clear all|apply now|read more|view all|see more|load more|careers|current vacancies|all vacancies|vacancies|work with us|join us|job search|home|about us|contact us|privacy policy|cookie policy|terms and conditions|terms of use|leadership|academic|support|teaching and training|full list of current opportunities.*|how to apply|benefits|faq|college homepage|to view vacancies at.*)$/i.test(
                  lower
                ) ||
                /\((English|Francais|Espanol|Deutsch)\)$/i.test(lower)
              );
            };

            let title = "";
            let location = "";
            let department = "";
            let postedDate = "";

            if (isMhr) {
              const titleEl = card.querySelector(".Mhr-jobDetailTitleLink span, .Mhr-jobDetailTitleLink") || card.querySelector("a span");
              title = (titleEl?.textContent || "").replace(/\s*Job profile\s*$/i, "").trim();
              const closingEl = card.querySelector(".Mhr-jobDetailClosingDate");
              if (closingEl) {
                postedDate = (closingEl.textContent || "").replace(/apply by/i, "").trim();
              }
            } else if (card.tagName.toLowerCase() === "tr") {
              const tds = card.querySelectorAll("td");
              if (tds.length >= 2) {
                const t0 = (tds[0].textContent || "").trim();
                const t1 = (tds[1].textContent || "").trim();
                const isDate0 = /\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/i.test(t0);
                if (isDate0) {
                  postedDate = t0;
                  title = t1;
                } else if (!isNavTitle(t0) && t0.length > 3) {
                  title = t0;
                } else {
                  title = t1;
                }
              }
            }

            if (card.classList.contains("nectar-hor-list-item") || card.querySelectorAll(".nectar-list-item").length > 0) {
              const nItems = card.querySelectorAll(".nectar-list-item");
              if (nItems.length > 0) title = (nItems[0].textContent || "").trim();
              if (nItems.length > 1) location = (nItems[1].textContent || "").trim();
            }

            if (!title) {
              title =
                (
                  card.querySelector(
                    'h2, h3, h4, [class*="title"], [data-ph-at-id="job-title"]'
                  ) || a
                ).textContent?.trim() || "";
            }

            if (!title || isNavTitle(title)) {
              const aText = (a.textContent || "").trim();
              if (aText && !isNavTitle(aText)) {
                title = aText;
              }
            }

            if (!title || isNavTitle(title)) return;

            seenUrls.add(href);

            if (!location) {
              const locEl = card.querySelector(
                '[class*="location"], [data-ph-at-id*="location"], [class*="city"]'
              );
              location = locEl ? locEl.textContent?.trim() || "" : "";
            }

            if (!department) {
              const deptEl = card.querySelector(
                '[class*="category"], [class*="department"], [data-ph-at-id*="category"]'
              );
              department = deptEl ? deptEl.textContent?.trim() || "" : "";
            }

            if (!postedDate) {
              const dateEl = card.querySelector(
                '[class*="date"], [data-ph-at-id*="date"], time'
              );
              postedDate = dateEl
                ? dateEl.getAttribute("datetime") || dateEl.textContent?.trim() || ""
                : "";
            }

            // Fallback location from card innerText lines
            if (!location) {
              const rawText = (card as HTMLElement).innerText || "";
              const lines = rawText
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);
              for (const line of lines) {
                if (
                  /united kingdom|uk|london|united states|usa|remote|india|germany|france|canada|australia|sheffield|manchester/i.test(
                    line
                  ) &&
                  !line.includes(title)
                ) {
                  location = line;
                  break;
                }
              }
            }

            results.push({
              title,
              url: href,
              location,
              department,
              posted_date: postedDate,
              description:
                (card as HTMLElement).innerText?.replace(/\s+/g, " ").slice(0, 300) ||
                "",
            });
          });

          // Fallback to specific job anchors if card containers were not identified
          if (results.length === 0) {
            const isNavTitle = (t: string) => {
              const lower = t.trim().toLowerCase();
              return (
                lower.length < 3 ||
                /^(jobs|saved jobs|search jobs|find a job|browse jobs|sign in|clear all|apply now|read more|view all|see more|load more|careers|current vacancies|all vacancies|vacancies|work with us|join us|job search|home|about us|contact us|privacy policy|cookie policy|terms and conditions|terms of use|leadership|academic|support|teaching and training|full list of current opportunities.*|how to apply|benefits|faq|college homepage|to view vacancies at.*)$/i.test(
                  lower
                ) ||
                /\((English|Francais|Espanol|Deutsch)\)$/i.test(lower)
              );
            };

            const anchors = document.querySelectorAll(
              'a[href*="/job/"], a[href*="/jobs/"], a[href*="/position/"], a[href*="/vacancy/"], a[href*="/vacancies/"], a[href*="/opportunit"], a[href*="webitrent"], a[href*="ETREC"], a[href*="Vacancy.aspx?ref="], a.stretched-link, a.job-title-link, a[href*="jobdetail.ftl"]'
            );
            anchors.forEach((a) => {
              const href = (a as HTMLAnchorElement).href;
              let text = a.textContent?.trim() || "";
              if (!href || seenUrls.has(href)) return;

              if (isNavTitle(text)) {
                const pRow = a.closest("tr, li, .card, div");
                const fallback = (pRow?.querySelector("h2, h3, h4, strong, b")?.textContent || "").trim() ||
                  (pRow?.tagName.toLowerCase() === "tr" && pRow.querySelectorAll("td").length >= 2 ? (pRow.querySelectorAll("td")[1].textContent || "").trim() : "");
                if (fallback && !isNavTitle(fallback)) {
                  text = fallback;
                } else {
                  return;
                }
              }

              if (text.length <= 3 || isNavTitle(text)) return;

              try {
                const u = new URL(href);
                const path = u.pathname.toLowerCase().replace(/\/$/, "");
                const segments = path.split("/").filter(Boolean);
                if (segments.length <= 1 && !u.search && !u.hash) return;
                if (
                  path === "/jobs" ||
                  path === "/careers" ||
                  path === "/vacancies" ||
                  path.endsWith("/jobs") ||
                  path.endsWith("/careers") ||
                  path.includes("/saved-jobs") ||
                  path.includes("/change-region") ||
                  path.includes("/login") ||
                  path.includes("/privacy") ||
                  path.includes("/overview") ||
                  path.includes("/life-at")
                )
                  return;
              } catch {
                return;
              }

              seenUrls.add(href);

              const card = a.closest("tr, li, div");
              const cardText = card
                ? (card as HTMLElement).innerText?.replace(/\s+/g, " ").trim()
                : "";

              results.push({
                title: text,
                url: href,
                description: cardText ? cardText.slice(0, 300) : "",
              });
            });
          }

          // Fallback to inline heading vacancies if no job cards or links were found
          if (results.length === 0) {
            const headings = document.querySelectorAll("h2, h3, h4, h5");
            headings.forEach((h) => {
              const hText = (h.textContent || "").trim();
              if (hText.length < 4 || hText.length > 90) return;
              if (/^(about|contact|navigation|menu|footer|quick links|office hours|follow us|copyright)/i.test(hText)) return;

              let content = "";
              let sibling = h.nextElementSibling;
              let count = 0;
              while (sibling && count < 8 && !/H[2-5]/.test(sibling.tagName)) {
                content += " " + (sibling.textContent || "").trim();
                sibling = sibling.nextElementSibling;
                count++;
              }

              if (
                /location(?:\s+of\s+job)?:\s*([^<\n]+)/i.test(content) ||
                /salary(?:\s+range)?:\s*([^<\n]+)/i.test(content) ||
                /contract\s+type:\s*([^<\n]+)/i.test(content) ||
                /how\s+to\s+apply/i.test(content) ||
                /about\s+the\s+role/i.test(content) ||
                /job\s+first\s+posted/i.test(hText)
              ) {
                const cleanTitle = hText.replace(/\s*\([^)]*posted[^)]*\)/i, "").trim();
                const fakeUrl = `${window.location.href}#${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                if (!seenUrls.has(fakeUrl)) {
                  seenUrls.add(fakeUrl);
                  results.push({
                    title: cleanTitle,
                    url: fakeUrl,
                    description: content.slice(0, 500).replace(/\s+/g, " ").trim(),
                  });
                }
              }
            });
          }

          return results;
        });

        // Scan all child frames for embedded ATS / job widgets (e.g. Chippy Digital for TQUK, PeopleHR)
        for (const frame of page.frames()) {
          if (frame === page.mainFrame()) continue;
          try {
            const frameJobs = await frame.evaluate(() => {
              function __name(t: any) { return t; }
              const results: any[] = [];
              const seen = new Set<string>();

              const cards = document.querySelectorAll(
                '.accordion-item, [class*="job"], tr, .Mhr-jobDetailTitleContainer'
              );
              cards.forEach((card) => {
                let title = (
                  card.querySelector("h2, h3, h4, .title, strong, .Mhr-jobDetailTitleLink span")
                )?.textContent?.trim() || "";

                if (!title || /^(about|contact|navigation|menu|footer|quick links|office hours)/i.test(title)) return;

                let a = card.querySelector(
                  "a[href*='peoplehr'], a[href*='Opening.aspx'], a[href*='/job/'], a[href*='/jobs/'], a[href*='/vacanc'], a"
                );
                let href = (a as HTMLAnchorElement)?.href || "";
                if (!href || href.startsWith("javascript:")) {
                  if (title) {
                    href = `${window.location.href}#${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                  }
                }
                if (!title || !href || seen.has(href)) return;
                seen.add(href);

                const cardText = (card as HTMLElement).innerText || "";
                const locMatch = cardText.match(/location(?:\s+of\s+job)?:\s*([^\n]+)/i);
                const location = locMatch ? locMatch[1].trim() : "";

                results.push({
                  title,
                  url: href,
                  location,
                  description: cardText.slice(0, 500).replace(/\s+/g, " ").trim(),
                });
              });
              return results;
            });

            if (frameJobs && frameJobs.length > 0) {
              logger.info(`Extracted ${frameJobs.length} jobs from embedded iframe: ${frame.url()}`, companyInfo.companyName);
              domJobs.push(...frameJobs);
            }
          } catch {}
        }

        if (interceptedJobs.length > 0) {
          rawJobs = interceptedJobs;
        } else {
          rawJobs = domJobs;
        }
      }

      if (rawJobs.length === 0 && interceptedJobs.length > 0) {
        rawJobs = interceptedJobs;
      }

      await page.close();
      await context.close();
      context = null;

      // 3. Generic Detail-Page Enrichment (Title, Ref ID, Specific Location, Full Description, Dates, Salary)
      if (rawJobs.length > 0) {
        await enrichJobDetails(rawJobs, companyInfo.companyName, 10);
      }

      if (rawJobs.length === 0) {
        return {
          success: true,
          status: "NO_JOBS",
          method: "playwright",
          jobs: [],
          totalJobs: 0,
          invalidJobs: [],
          metadata: { message: "No dynamic jobs found by Playwright browser" },
        };
      }

      // Infer company country fallback if company domain is UK or country is UK
      let companyCountry = companyInfo.country;
      if (!companyCountry && navigationUrl) {
        try {
          const u = new URL(navigationUrl);
          if (
            /\.(uk|co\.uk|org\.uk|ac\.uk|gov\.uk)$/i.test(u.hostname) ||
            navigationUrl.includes("ukcampus") ||
            navigationUrl.includes("uki-en")
          ) {
            companyCountry = "United Kingdom";
          }
        } catch {}
      }

      const normalizedJobs = rawJobs.map((j) => {
        if (!j.location && companyCountry) {
          j.location = companyCountry;
        }
        if (!j.country && companyCountry) {
          j.country = companyCountry;
        }
        return normalizeRawJob(j, {
          companyName: companyInfo.companyName,
          source: navigationUrl,
          sourceType: "playwright",
          ats: companyInfo.ats,
          country: companyCountry,
        });
      });

      // Validate
      const { validJobs, invalidJobs } = JobValidator.validateBatch(normalizedJobs);

      // Deduplicate
      const deduplicator = new JobDeduplicator();
      const { uniqueJobs, duplicateCount } = deduplicator.deduplicate(validJobs);

      const status =
        uniqueJobs.length > 0
          ? invalidJobs.length > 0
            ? "PARTIAL_SUCCESS"
            : "SUCCESS"
          : "FAILED";

      return {
        success: uniqueJobs.length > 0,
        status,
        method: "playwright",
        jobs: uniqueJobs,
        totalJobs: uniqueJobs.length,
        invalidJobs,
        metadata: {
          duplicatesRemoved: duplicateCount,
          rawPlaywrightCount: rawJobs.length,
          validCount: validJobs.length,
          invalidCount: invalidJobs.length,
        },
      };
    } catch (err: any) {
      if (context) {
        try {
          await context.close();
        } catch {}
      }
      logger.error(`Playwright scraping error: ${err.message}`, companyInfo.companyName);
      return {
        success: false,
        status: "FAILED",
        method: "playwright",
        jobs: [],
        totalJobs: 0,
        invalidJobs: [],
        error: `Playwright error: ${err.message}`,
      };
    }
  }
}
