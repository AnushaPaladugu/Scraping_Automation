import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { CompanyDiscoveryResult } from "../../types/company";
import { ScraperResult } from "../../types/scraper";
import { IScraper } from "../scraper.interface";
import { fetchUrl } from "../../utils/httpClient";
import { normalizeRawJob } from "../../processors";
import { JobValidator } from "../../validators/jobValidator";
import { JobDeduplicator } from "../../deduplication/deduplicator";
import { logger } from "../../utils/logger";
import { enrichJobDetails } from "../enrichment/detailPageEnricher";

type CheerioRoot = ReturnType<typeof cheerio.load>;

export class StaticScraper implements IScraper {
  public name = "StaticScraper";
  public method = "static" as const;

  public canHandle(companyInfo: CompanyDiscoveryResult, prefetchHtml?: string): boolean {
    if (!prefetchHtml) return false;
    const lower = prefetchHtml.toLowerCase();

    // SPAs or widget-driven portals should use dynamic Playwright
    if (
      lower.includes("hibob.com") ||
      lower.includes("mynewterm.com") ||
      lower.includes("mnt-parent-container") ||
      lower.includes("myworkdayjobs.com") ||
      lower.includes("icims.com") ||
      lower.includes("successfactors")
    ) {
      return false;
    }

    // Check if there are repeated job listings or specific job detail links in the HTML
    const jobSpecificMatches = prefetchHtml.match(/(?:href=["'][^"']*(?:\/job\/[a-z0-9_-]{3,}|\/jobs\/[a-z0-9_-]{3,}|\/vacancy\/[a-z0-9_-]{3,}|\/vacancies\/[a-z0-9_-]{3,}|\/opportunit[a-z0-9_-]*|vacancy\.aspx\?|vacancyid=)[^"']*["'])/gi) || [];
    const hasJobClasses =
      lower.includes("job-item") ||
      lower.includes("job-card") ||
      lower.includes("job-listing") ||
      lower.includes("vacancy-item") ||
      lower.includes("career-item") ||
      lower.includes("careers-table") ||
      lower.includes("job-list-details") ||
      lower.includes("nectar-hor-list-item") ||
      lower.includes("nectar-list-item") ||
      (lower.includes("<table") && lower.includes("<tr") && (lower.includes("vacanc") || lower.includes("job")));
    const hasCategoryLinks = /[?&]cat=-?\d+/i.test(prefetchHtml) || /[?&]category=\d+/i.test(prefetchHtml);
    const hasAttraxOrJobs = lower.includes("tpplccareers.co.uk") || lower.includes("timeappointments.co.uk") || lower.includes("/search-and-apply");
    const hasJobsIframe = /<iframe[^>]+src=["'][^"']*(?:job|vacanc|career|chippy|peoplehr)/i.test(prefetchHtml);
    const hasInlineVacancies = /location(?:\s+of\s+job)?:\s*[^<\n]+/i.test(prefetchHtml) && /salary/i.test(prefetchHtml) && /vacanc|career|job/i.test(prefetchHtml);

    return jobSpecificMatches.length >= 2 || hasJobClasses || hasCategoryLinks || hasAttraxOrJobs || hasJobsIframe || hasInlineVacancies;
  }

  public async scrape(companyInfo: CompanyDiscoveryResult, prefetchHtml?: string): Promise<ScraperResult> {
    const url = companyInfo.careerUrl || companyInfo.atsUrl || companyInfo.companyUrl;
    if (!url) {
      return {
        success: false,
        status: "FAILED",
        method: "static",
        jobs: [],
        totalJobs: 0,
        invalidJobs: [],
        error: "No career URL available for static scraping",
      };
    }

    logger.info(`Starting Static HTML scraping on ${url}`, companyInfo.companyName);

    try {
      let html = prefetchHtml || "";
      if (!html) {
        const res = await fetchUrl(url);
        if (!res.ok || typeof res.data !== "string") {
          return {
            success: false,
            status: "FAILED",
            method: "static",
            jobs: [],
            totalJobs: 0,
            invalidJobs: [],
            error: `Failed to fetch page for static HTML extraction: ${res.error || `HTTP ${res.status}`}`,
          };
        }
        html = res.data;
      }

      const $ = cheerio.load(html);
      const seenUrls = new Set<string>();

      // Extract jobs from page 1
      const extractedJobs: any[] = this.extractJobsFromCheerio($, url, companyInfo.companyName, seenUrls);

      // Check for embedded jobs iframes on page 1 (e.g. Chippy Digital for TQUK, PeopleHR)
      const iframeUrls: string[] = [];
      $("iframe").each((_, el) => {
        const src = $(el).attr("src");
        if (src && /job|vacanc|career|peoplehr|chippy/i.test(src)) {
          try {
            const resolvedIframe = new URL(src, url).toString();
            if (!iframeUrls.includes(resolvedIframe)) {
              iframeUrls.push(resolvedIframe);
            }
          } catch {}
        }
      });

      for (const iSrc of iframeUrls) {
        logger.info(`Inspecting embedded jobs iframe: ${iSrc}`, companyInfo.companyName);
        try {
          const ifRes = await fetchUrl(iSrc, { timeout: 8000 });
          if (ifRes.ok && typeof ifRes.data === "string") {
            const if$ = cheerio.load(ifRes.data);
            const ifJobs = this.extractJobsFromCheerio(if$, iSrc, companyInfo.companyName, seenUrls);
            extractedJobs.push(...ifJobs);
          }
        } catch {}
      }

      // Multi-Page Pagination Discovery: Search page 1 for pagination links
      const paginationUrls = new Set<string>();
      $("a").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        const text = $(el).text().trim();
        const isExcludedNavHref =
          /\/(?:cart|checkout|benefits|about|contact|terms|privacy|blog|news|faqs?|cookies?|basket|help|login|register)\b/i.test(href);
        if (isExcludedNavHref) return;

        const isPagingHref =
          /\/jobs\/search\/[^"']*\/\d+/i.test(href) ||
          /[?&]page=\d+/i.test(href) ||
          /\/page\/\d+/i.test(href) ||
          /\/p\/\d+/i.test(href);
        const isPagingText =
          /^page\s*(?:number)?\s*\d+/i.test(text) ||
          /^\d+$/.test(text) ||
          /^(?:next|next\s+page|>|»)$/i.test(text);

        if (isPagingHref || isPagingText) {
          try {
            const resolved = new URL(href, url).toString();
            if (resolved !== url && !paginationUrls.has(resolved)) {
              paginationUrls.add(resolved);
            }
          } catch {}
        }
      });

      // Traverse discovered pagination pages (up to 10 pages)
      const pageList = Array.from(paginationUrls).slice(0, 10);
      if (pageList.length > 0) {
        logger.info(
          `Discovered ${pageList.length} pagination pages for static scraping: ${pageList.slice(0, 3).join(", ")}...`,
          companyInfo.companyName
        );
        for (const pageUrl of pageList) {
          try {
            const pageRes = await fetchUrl(pageUrl, { timeout: 4000 });
            if (pageRes.ok && typeof pageRes.data === "string") {
              const page$ = cheerio.load(pageRes.data);
              const pJobs = this.extractJobsFromCheerio(page$, pageUrl, companyInfo.companyName, seenUrls);
              extractedJobs.push(...pJobs);
            }
          } catch (err: any) {
            logger.warn(`Failed to fetch pagination page ${pageUrl}: ${err.message}`, companyInfo.companyName);
          }
        }
      }

      if (extractedJobs.length === 0) {
        // 1. Check for complete list of opportunities link (e.g. cat=-1)
        let fullListUrl: string | null = null;
        $("a").each((_, el) => {
          if (fullListUrl) return;
          const h = $(el).attr("href");
          if (h && /[?&]cat=-1\b/i.test(h)) {
            try {
              fullListUrl = new URL(h, url).toString();
            } catch {}
          }
        });

        if (fullListUrl) {
          logger.info(`Discovered full vacancy list link: ${fullListUrl}`, companyInfo.companyName);
          try {
            const fRes = await fetchUrl(fullListUrl, { timeout: 6000 });
            if (fRes.ok && typeof fRes.data === "string") {
              const f$ = cheerio.load(fRes.data);
              const fJobs = this.extractJobsFromCheerio(f$, fullListUrl, companyInfo.companyName, seenUrls);
              extractedJobs.push(...fJobs);
            }
          } catch {}
        }
      }

      if (extractedJobs.length === 0) {
        // 2. Try checking for category links (e.g. vacancies.aspx?cat=123)
        const catLinks: string[] = [];
        $("a").each((_, el) => {
          const h = $(el).attr("href");
          if (h && (/[?&]cat=-?\d+/i.test(h) || /[?&]category=\d+/i.test(h))) {
            try {
              const res = new URL(h, url).toString();
              if (!catLinks.includes(res)) catLinks.push(res);
            } catch {}
          }
        });

        if (catLinks.length > 0) {
          logger.info(`Discovered ${catLinks.length} category vacancy links; fetching categories...`, companyInfo.companyName);
          for (const catUrl of catLinks.slice(0, 5)) {
            try {
              const catRes = await fetchUrl(catUrl, { timeout: 6000 });
              if (catRes.ok && typeof catRes.data === "string") {
                const cat$ = cheerio.load(catRes.data);
                const catJobs = this.extractJobsFromCheerio(cat$, catUrl, companyInfo.companyName, seenUrls);
                extractedJobs.push(...catJobs);
              }
            } catch {}
          }
        }
      }

      if (extractedJobs.length === 0) {
        // Try checking for dedicated jobs portal link on landing page (e.g. /search-and-apply/, /jobs/)
        let activeJobsUrl: string | null = null;
        $("a").each((_, el) => {
          if (activeJobsUrl) return;
          const href = $(el).attr("href");
          const txt = $(el).text().trim().toLowerCase();
          if (
            href &&
            (txt === "search jobs" ||
              txt === "search and apply" ||
              txt === "view all jobs" ||
              txt === "find a job" ||
              txt === "jobs" ||
              /\/jobs\/?$/i.test(href) ||
              /\/search-and-apply\/?$/i.test(href))
          ) {
            try {
              const res = new URL(href, url).toString();
              if (res !== url && !res.startsWith("javascript:")) {
                activeJobsUrl = res;
              }
            } catch {}
          }
        });

        if (activeJobsUrl) {
          logger.info(`Discovered active jobs page: ${activeJobsUrl}; scraping...`, companyInfo.companyName);
          try {
            const pageRes = await fetchUrl(activeJobsUrl, { timeout: 8000 });
            if (pageRes.ok && typeof pageRes.data === "string") {
              const active$ = cheerio.load(pageRes.data);
              const pJobs = this.extractJobsFromCheerio(active$, activeJobsUrl, companyInfo.companyName, seenUrls);
              extractedJobs.push(...pJobs);
            }
          } catch {}
        }
      }

      // Check for iframes (e.g. Chippy Digital for TQUK, PeopleHR widgets)
      if (extractedJobs.length === 0) {
        const iframeSrcs: string[] = [];
        $("iframe").each((_, el) => {
          const src = $(el).attr("src");
          if (src && /job|vacanc|career|peoplehr|chippy/i.test(src)) {
            try {
              iframeSrcs.push(new URL(src, url).toString());
            } catch {}
          }
        });

        for (const iSrc of iframeSrcs) {
          logger.info(`Inspecting embedded jobs iframe: ${iSrc}`, companyInfo.companyName);
          try {
            const ifRes = await fetchUrl(iSrc, { timeout: 8000 });
            if (ifRes.ok && typeof ifRes.data === "string") {
              const if$ = cheerio.load(ifRes.data);
              const ifJobs = this.extractJobsFromCheerio(if$, iSrc, companyInfo.companyName, seenUrls);
              extractedJobs.push(...ifJobs);
            }
          } catch {}
        }
      }

      // Check for single-page inline vacancies (e.g. Time Construction)
      if (extractedJobs.length === 0) {
        const inlineJobs = this.extractInlineVacancies($, url, companyInfo.companyName, seenUrls);
        if (inlineJobs.length > 0) {
          logger.info(`Extracted ${inlineJobs.length} inline vacancy sections from page`, companyInfo.companyName);
          extractedJobs.push(...inlineJobs);
        }
      }

      if (extractedJobs.length === 0) {
        return {
          success: true,
          status: "NO_JOBS",
          method: "static",
          jobs: [],
          totalJobs: 0,
          invalidJobs: [],
          metadata: { message: "No static job listings detected on page" },
        };
      }

      // Detail-Page Enrichment: Concurrently enrich missing fields from detail URLs
      await enrichJobDetails(extractedJobs, companyInfo.companyName, 10);

      // Infer company country fallback if company domain is UK or country is UK
      let companyCountry = companyInfo.country;
      if (!companyCountry && url) {
        try {
          const u = new URL(url);
          if (/\.(uk|co\.uk|org\.uk|ac\.uk|gov\.uk)$/i.test(u.hostname)) {
            companyCountry = "United Kingdom";
          }
        } catch {}
      }

      const normalizedJobs = extractedJobs.map((j) =>
        normalizeRawJob(j, {
          companyName: companyInfo.companyName,
          source: url,
          sourceType: "static",
          ats: companyInfo.ats,
          country: companyCountry,
        })
      );

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
        method: "static",
        jobs: uniqueJobs,
        totalJobs: uniqueJobs.length,
        invalidJobs,
        metadata: {
          duplicatesRemoved: duplicateCount,
          rawStaticCount: extractedJobs.length,
          validCount: validJobs.length,
          invalidCount: invalidJobs.length,
          pagesVisited: pageList.length + 1,
        },
      };
    } catch (err: any) {
      logger.error(`Static scraping error: ${err.message}`, companyInfo.companyName);
      return {
        success: false,
        status: "FAILED",
        method: "static",
        jobs: [],
        totalJobs: 0,
        invalidJobs: [],
        error: `Static Scraping error: ${err.message}`,
      };
    }
  }

  private extractJobsFromCheerio(
    $: CheerioRoot,
    pageUrl: string,
    companyName: string,
    seenUrls: Set<string>
  ): any[] {
    const pageJobs: any[] = [];

    const isPaginationOrNavHref = (href: string): boolean => {
      const lower = href.toLowerCase();
      try {
        const u = new URL(href, "https://dummy.com");
        const p = u.pathname.toLowerCase().replace(/\/$/, "");
        if (
          p === "/vacancies" ||
          p === "/vacancies/current-vacancies" ||
          p === "/careers" ||
          p === "/jobs" ||
          p === "/school-life/careers"
        ) {
          return true;
        }
        if (p === "/vacancies.aspx" && !u.search.toLowerCase().includes("ref=")) {
          return true;
        }
        if (p.includes("/display.aspx") && !u.search.toLowerCase().includes("vacanc") && !u.search.toLowerCase().includes("ref=")) {
          return true;
        }
      } catch {}

      return (
        /\/jobs\/search\//i.test(lower) ||
        /[?&]page=\d+/i.test(lower) ||
        /\/page\/\d+/i.test(lower) ||
        /\/p\/\d+/i.test(lower) ||
        lower.includes("javascript:") ||
        lower.startsWith("#") ||
        lower.includes("login") ||
        lower.includes("savedvacancies") ||
        lower.includes("saved-jobs")
      );
    };

    const isPaginationOrNavTitle = (title: string): boolean => {
      const t = title.trim().toLowerCase();
      return (
        t.length < 3 ||
        /^page\s*(?:number)?\s*\d*$/i.test(t) ||
        /^\d+$/.test(t) ||
        /^next\b/i.test(t) ||
        /^prev\b/i.test(t) ||
        /^first\b/i.test(t) ||
        /^last\b/i.test(t) ||
        /^view all/i.test(t) ||
        /^apply now$/i.test(t) ||
        /^read more$/i.test(t) ||
        /^(vacancies|current vacancies|all vacancies|staff vacancies|job opportunities|work with us|careers|search vacancies|latest vacancies|view vacancies|see all vacancies|search jobs|find a job|browse jobs|teaching and training|leadership|academic|support|how to apply|benefits|contact us|cookies|faq|college homepage|terms of use|terms and conditions|view profile|full list of current opportunities.*|to view vacancies at.*|academic \(\d+\)|leadership \(\d+\)|support \(\d+\))$/i.test(t)
      );
    };

    // 0. Check Eploy and script vacancy arrays
    const outVarsRegex = /outVars\s*=\s*\[\s*(\d+)\s*,\s*['"]([^'"]+)['"]/g;
    let outMatch;
    while ((outMatch = outVarsRegex.exec($.html())) !== null) {
      const id = outMatch[1];
      const title = outMatch[2].trim();
      if (title && id && !seenUrls.has(id)) {
        seenUrls.add(id);
        let fullJobUrl = `${pageUrl}?VacancyID=${id}`;
        try {
          fullJobUrl = new URL(`vacancy-apply.aspx?VacancyID=${id}`, pageUrl).toString();
        } catch {}
        pageJobs.push({
          title,
          company: companyName,
          url: fullJobUrl,
          id,
        });
      }
    }

    // 1. Check card / item containers (including Tribepad, NHS, Taleo, Eploy, custom lists, table rows, Nectar items)
    const cardSelectors = [
      ".job-list-details",
      "ul.jobs > li",
      ".jobs > li",
      ".job-card",
      ".job-item",
      ".job-listing",
      ".career-item",
      ".vacancy-item",
      ".vacancy",
      ".careers-table tr",
      ".nectar-hor-list-item",
      ".nectar-list-item",
      ".accordion-item",
      "table.table tr",
      "table tr",
      ".jobs-list li",
      "li.job",
      "div[data-job-id]",
    ];

    for (const sel of cardSelectors) {
      const elements = $(sel);
      if (elements.length > 0) {
        elements.each((_, el) => {
          const card = $(el);

          let title = "";
          let loc = "";
          let dept = "";
          let datePosted = "";
          let empType = "";
          let salary = "";

          // A. Table row extraction (e.g. Tina Lacey Recruitment: td[0]=date, td[1]=title)
          if (card.is("tr")) {
            const tds = card.find("td");
            if (tds.length >= 2) {
              const td0 = tds.eq(0).text().trim();
              const td1 = tds.eq(1).text().trim();
              const isDate0 = /\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/i.test(td0);
              if (isDate0) {
                datePosted = td0;
                title = td1;
              } else if (!isPaginationOrNavTitle(td0) && td0.length > 3) {
                title = td0;
              } else {
                title = td1;
              }
            }
          }

          // B. Nectar hor list item extraction (e.g. Trapeze Recruitment)
          if (card.hasClass("nectar-hor-list-item") || card.find(".nectar-list-item").length > 0) {
            const nectarItems = card.find(".nectar-list-item");
            if (nectarItems.length > 0) {
              title = nectarItems.eq(0).text().trim();
              if (nectarItems.length > 1) loc = nectarItems.eq(1).text().trim();
              if (nectarItems.length > 2) empType = nectarItems.eq(2).text().trim();
              if (nectarItems.length > 3) salary = nectarItems.eq(3).text().trim();
            }
          }

          if (!title) {
            title = card.find(".job-list-title, .job-title, .title, h2, h3, h4, [itemprop='title']").first().text().trim();
          }

          const anchor = card.is("a")
            ? card
            : card.find("a[href*='/job/'], a[href*='/jobs/'], a[href*='/vacanc'], a[href*='/career'], a[href*='/opportunit'], a[href*='peoplehr.net'], a[href*='Opening.aspx'], a.full-link").first().length
            ? card.find("a[href*='/job/'], a[href*='/jobs/'], a[href*='/vacanc'], a[href*='/career'], a[href*='/opportunit'], a[href*='peoplehr.net'], a[href*='Opening.aspx'], a.full-link").first()
            : card.find("a").first();

          const href = anchor.attr("href") || card.closest("a").attr("href");
          if (!href || isPaginationOrNavHref(href)) return;

          if (!title || isPaginationOrNavTitle(title)) {
            const aText = anchor.text().trim();
            if (aText && !isPaginationOrNavTitle(aText)) {
              title = aText;
            }
          }

          if (!title || isPaginationOrNavTitle(title)) return;

          let fullJobUrl = href;
          try {
            fullJobUrl = new URL(href, pageUrl).toString();
          } catch {}

          if (fullJobUrl && title && !seenUrls.has(fullJobUrl)) {
            seenUrls.add(fullJobUrl);

            if (!loc) {
              loc = card.find("[itemprop='address'], [itemprop='jobLocation'], .job-location, .location, .city").first().text().trim();
            }
            if (!dept) {
              dept = card.find(".department, .team, .category").first().text().trim();
            }
            if (!datePosted) {
              datePosted = card.find("[itemprop='datePosted'], .posted-date, .date").first().text().trim();
            }
            if (!empType) {
              empType = card.find("[itemprop='employmentType'], .employment-type").first().text().trim();
            }

            if (!salary) {
              card.find("p, span, div, td").each((_, p) => {
                const pt = $(p).text().trim();
                if (
                  (pt.includes("£") || pt.includes("$") || pt.includes("€") || /per annum/i.test(pt) || /pro rata/i.test(pt) || /per hour/i.test(pt)) &&
                  pt.length < 120
                ) {
                  if (!salary || pt.length < salary.length) salary = pt;
                }
              });
            }

            pageJobs.push({
              title,
              company: companyName,
              url: fullJobUrl,
              location: loc || null,
              department: dept || null,
              posted_date: datePosted || null,
              employment_type: empType || null,
              salary: salary || null,
            });
          }
        });

        if (pageJobs.length > 0) break;
      }
    }

    // 2. Fallback: Search all anchor links matching job url patterns
    if (pageJobs.length === 0) {
      const jobUrlRegex = /(?:\/job\/|\/jobs\/|\/careers?\/|\/position\/|\/positions\/|\/vacanc|vacancy\.aspx\?|vacancy-apply\.aspx\?|\/opportunit|peoplehr\.net|Opening\.aspx\?)[a-z0-9_=&-]+/i;

      $("a").each((_, el) => {
        const anchor = $(el);
        const href = anchor.attr("href");
        let text = anchor.text().trim();

        if (href && jobUrlRegex.test(href) && !isPaginationOrNavHref(href) && !seenUrls.has(href)) {
          // If anchor text is "Read More" or "Apply", try finding title in parent row or card
          if (isPaginationOrNavTitle(text)) {
            const parentRow = anchor.closest("tr, li, .card, div, .accordion-item");
            const fallbackTitle =
              parentRow.find("h1, h2, h3, h4, strong, b").first().text().trim() ||
              anchor.parent().prevAll("h1, h2, h3, h4").first().text().trim() ||
              (parentRow.is("tr") && parentRow.find("td").length >= 2 ? parentRow.find("td").eq(1).text().trim() : "");
            if (fallbackTitle && !isPaginationOrNavTitle(fallbackTitle)) {
              text = fallbackTitle;
            } else {
              return;
            }
          }

          const lowerText = text.toLowerCase();
          const isNav =
            lowerText.includes("view all") ||
            lowerText.includes("back to") ||
            lowerText.includes("privacy") ||
            lowerText.includes("saved jobs") ||
            lowerText.includes("save job") ||
            lowerText.includes("sign in") ||
            lowerText.includes("login") ||
            (/\bregister\b/i.test(lowerText) && !/\bregistered\b/i.test(lowerText)) ||
            lowerText.includes("cookie") ||
            lowerText.includes("terms");

          if (!isNav) {
            seenUrls.add(href);
            let fullJobUrl = href;
            try {
              fullJobUrl = new URL(href, pageUrl).toString();
            } catch {}

            pageJobs.push({
              title: text,
              company: companyName,
              url: fullJobUrl,
            });
          }
        }
      });
    }

    return pageJobs;
  }

  private extractInlineVacancies(
    $: CheerioRoot,
    pageUrl: string,
    companyName: string,
    seenUrls: Set<string>
  ): any[] {
    const inlineJobs: any[] = [];
    $("h2, h3, h4, h5").each((_, el) => {
      const heading = $(el).text().trim();
      if (!heading || heading.length < 4 || heading.length > 90) return;
      if (/^(about|contact|navigation|menu|footer|quick links|office hours|follow us|copyright)/i.test(heading)) return;

      // Check next siblings for job markers
      let content = "";
      let curr = $(el).next();
      let steps = 0;
      while (curr.length > 0 && steps < 8 && !curr.is("h2, h3, h4, h5")) {
        content += " " + curr.text().trim();
        curr = curr.next();
        steps++;
      }

      if (
        /location(?:\s+of\s+job)?:\s*([^<\n]+)/i.test(content) ||
        /salary(?:\s+range)?:\s*([^<\n]+)/i.test(content) ||
        /contract\s+type:\s*([^<\n]+)/i.test(content) ||
        /how\s+to\s+apply/i.test(content) ||
        /about\s+the\s+role/i.test(content) ||
        /job\s+first\s+posted/i.test(heading)
      ) {
        const cleanTitle = heading.replace(/\s*\([^)]*posted[^)]*\)/i, "").trim();
        const fakeUrl = `${pageUrl}#${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        if (!seenUrls.has(fakeUrl)) {
          seenUrls.add(fakeUrl);

          let loc = null;
          const locMatch = content.match(/location(?:\s+of\s+job)?:\s*([^\n.,]+(?:,\s*[^\n.,]+)?)/i);
          if (locMatch) loc = locMatch[1].trim();

          let sal = null;
          const salMatch = content.match(/salary(?:\s+range)?:\s*([£$€\d][^\n.,]+(?:per\s+annum|pro\s+rata|per\s+hour|[a-z0-9\s]+)?)/i);
          if (salMatch) sal = salMatch[1].trim();

          let emp = null;
          const empMatch = content.match(/contract\s+type:\s*([^\n.,]+)/i);
          if (empMatch) emp = empMatch[1].trim();

          let postDate = null;
          const postMatch = (heading + " " + content).match(/(?:posted|opening\s+date):\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i);
          if (postMatch) postDate = postMatch[1].trim();

          inlineJobs.push({
            title: cleanTitle,
            company: companyName,
            url: fakeUrl,
            location: loc,
            salary: sal,
            employment_type: emp,
            posted_date: postDate,
            description: content.slice(0, 1000).replace(/\s+/g, " ").trim(),
          });
        }
      }
    });
    return inlineJobs;
  }
}
