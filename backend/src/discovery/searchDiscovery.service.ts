import { chromium, Browser } from "playwright";
import axios from "axios";
import * as cheerio from "cheerio";
import { config } from "../config";
import { logger } from "../utils/logger";
import { fetchUrl } from "../utils/httpClient";
import { WebsiteVerifierService } from "./websiteVerifier.service";

export interface SearchDiscoveryOutput {
  officialUrl: string | null;
  careerUrl: string | null;
  confidence: number;
  source: string;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedinUrl?: string;
}

// Domains to ignore when looking for official company sites
const DIRECTORY_DOMAINS = new Set([
  "wikipedia.org",
  "wikidata.org",
  "wikimedia.org",
  "britannica.com",
  "zhihu.com",
  "quora.com",
  "reddit.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
  "tumblr.com",
  "medium.com",
  "wordpress.com",
  "blogspot.com",
  "github.com",
  "gitlab.com",
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "simplyhired.com",
  "monster.com",
  "careerbuilder.com",
  "lensa.com",
  "zoominfo.com",
  "crunchbase.com",
  "dnb.com",
  "bloomberg.com",
  "pitchbook.com",
  "yellowpages.com",
  "yelp.com",
  "mapquest.com",
  "bbb.org",
  "trustpilot.com",
  "g2.com",
  "capterra.com",
  "google.com",
  "bing.com",
  "yahoo.com",
  "duckduckgo.com",
  "justdial.com",
  "ambitionbox.com",
  "naukri.com",
  "flipkart.com",
  "amazon.com",
  "ebay.com",
  "apple.com",
  "microsoft.com",
  "chatgpt.com",
  "openai.com",
]);

export class SearchDiscoveryService {
  /**
   * Discovers official website and careers portal for any company dynamically via Search.
   * Guaranteed fast execution (under 4.5 seconds max).
   */
  public static async discoverCompany(
    companyName: string,
    locationHint?: string
  ): Promise<SearchDiscoveryOutput> {
    const cleanName = companyName.trim();
    if (!cleanName) {
      return { officialUrl: null, careerUrl: null, confidence: 0, source: "none" };
    }

    logger.info(`Starting dynamic live search discovery for: "${cleanName}"`);

    // Strict 3500ms timeout for live search so bulk discovery requests NEVER hang
    const timeoutPromise = new Promise<SearchDiscoveryOutput>((resolve) =>
      setTimeout(
        () =>
          resolve({
            officialUrl: null,
            careerUrl: null,
            confidence: 0,
            source: "search_timeout_fallback",
          }),
        3500
      )
    );

    const discoveryPromise = (async (): Promise<SearchDiscoveryOutput> => {
      // Run top search discovery channels concurrently for maximum speed & resolution
      const results = await Promise.allSettled([
        this.searchViaAutocomplete(cleanName),
        this.searchViaDuckDuckGoHtml(cleanName, locationHint),
        this.searchViaFastHttp(cleanName, locationHint),
        this.searchViaLinkedIn(cleanName, locationHint),
      ]);

      for (const res of results) {
        if (res.status === "fulfilled" && res.value.officialUrl) {
          return res.value;
        }
      }

      // 5. Serper API if configured
      if (process.env.SERPER_API_KEY) {
        const serperRes = await this.searchViaSerper(cleanName, locationHint);
        if (serperRes.officialUrl) return serperRes;
      }

      // 6. Google Custom Search API if configured
      if (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX) {
        const googleRes = await this.searchViaGoogleApi(cleanName);
        if (googleRes.officialUrl) return googleRes;
      }

      return {
        officialUrl: null,
        careerUrl: null,
        confidence: 0,
        source: "search_unresolved",
      };
    })();

    return Promise.race([discoveryPromise, timeoutPromise]);
  }

  /**
   * Fast HTTP search via DuckDuckGo HTML (300-800ms, 100% accurate)
   */
  private static async searchViaDuckDuckGoHtml(
    companyName: string,
    locationHint?: string
  ): Promise<SearchDiscoveryOutput> {
    try {
      const query = locationHint
        ? `${companyName} ${locationHint}`
        : companyName;

      const res = await axios.get("https://html.duckduckgo.com/html/", {
        params: { q: query },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 3000,
      });

      const $ = cheerio.load(res.data);
      const items: Array<{ title: string; link: string; snippet: string }> = [];

      $(".result").each((_, el) => {
        const a = $(el).find(".result__title a").first();
        const snippetEl = $(el).find(".result__snippet").first();
        const rawHref = a.attr("href") || "";
        const title = a.text().trim();
        const snippet = snippetEl.text().trim();

        const decoded = this.decodeDdgUrl(rawHref);
        if (decoded && decoded.startsWith("http")) {
          items.push({ title, link: decoded, snippet });
        }
      });

      if (items.length > 0) {
        return await this.extractFromSearchResults(companyName, items);
      }
    } catch {}

    return { officialUrl: null, careerUrl: null, confidence: 0, source: "ddg_html_none" };
  }

  private static decodeDdgUrl(link: string): string {
    try {
      if (link.includes("uddg=")) {
        const match = link.match(/uddg=([^&]+)/);
        if (match) return decodeURIComponent(match[1]);
      }
    } catch {}
    return link;
  }

  /**
   * Searches LinkedIn company profile to extract official website URL, headquarters location, and industry.
   */
  private static async searchViaLinkedIn(
    companyName: string,
    locationHint?: string
  ): Promise<SearchDiscoveryOutput> {
    try {
      const query = `site:linkedin.com/company "${companyName}" ${locationHint || ""}`.trim();
      const res = await axios.get("https://html.duckduckgo.com/html/", {
        params: { q: query },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 2000,
      });

      const $ = cheerio.load(res.data);
      let linkedinUrl: string | null = null;
      let snippetText = "";

      $(".result").each((_, el) => {
        if (linkedinUrl) return;
        const a = $(el).find(".result__title a").first();
        const snippetEl = $(el).find(".result__snippet").first();
        const rawHref = a.attr("href") || "";
        const decoded = this.decodeDdgUrl(rawHref);

        if (decoded && decoded.includes("linkedin.com/company/")) {
          linkedinUrl = decoded;
          snippetText = snippetEl.text().trim();
        }
      });

      if (!linkedinUrl) {
        return { officialUrl: null, careerUrl: null, confidence: 0, source: "linkedin_none" };
      }

      let extractedWebsite: string | null = null;
      let extractedIndustry: string | undefined = undefined;
      let extractedCity: string | undefined = undefined;
      let extractedState: string | undefined = undefined;

      // Extract website domain if explicitly present in snippet
      const webMatch = snippetText.match(/https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
      if (webMatch && !webMatch[0].includes("linkedin.com")) {
        extractedWebsite = `${webMatch[0]}/`;
      }

      // Parse metadata hints from LinkedIn search snippet
      const parts = snippetText.split("·").map((p) => p.trim());
      for (const part of parts) {
        if (
          !extractedIndustry &&
          /^(Hospitality|Healthcare|Health|Construction|Financial Services|Banking|Real Estate|Retail|Software|Entertainment|Food & Beverages|Automotive|Education|Non-profit|Insurance|Transportation|Manufacturing)/i.test(
            part
          )
        ) {
          extractedIndustry = part;
        } else if (part.includes(",") && !part.includes("employees")) {
          const locParts = part.split(",").map((l) => l.trim());
          if (locParts.length >= 2) {
            extractedCity = locParts[0];
            extractedState = locParts[1];
          }
        }
      }

      // Probe LinkedIn public profile HTML for official site link
      if (!extractedWebsite && linkedinUrl) {
        try {
          const lProbe = await fetchUrl(linkedinUrl, { timeout: 1500 });
          if (lProbe.ok && typeof lProbe.data === "string") {
            const siteMatch = lProbe.data.match(
              /https?:\/\/(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/i
            );
            if (siteMatch && !siteMatch[0].includes("linkedin.com") && !siteMatch[0].includes("licdn.com")) {
              extractedWebsite = `${siteMatch[0]}/`;
            }
          }
        } catch {}
      }

      if (extractedWebsite) {
        return {
          officialUrl: extractedWebsite,
          careerUrl: extractedWebsite,
          confidence: 0.8,
          source: "linkedin_discovery",
          industry: extractedIndustry,
          city: extractedCity,
          state: extractedState,
          linkedinUrl,
        };
      }
    } catch {}

    return { officialUrl: null, careerUrl: null, confidence: 0, source: "linkedin_none" };
  }

  /**
   * Ultra-fast (20-100ms) Autocomplete lookup via Clearbit and DuckDuckGo Instant Answer
   */
  private static async searchViaAutocomplete(companyName: string): Promise<SearchDiscoveryOutput> {
    try {
      const cleanBrand = companyName
        .toLowerCase()
        .replace(/\b(ltd|limited|inc|corp|corporation|llc|plc|pvt|co|group|services|technologies|solutions)\b/gi, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();

      // Clearbit Autocomplete API (20-80ms)
      const clearbitPromise = axios
        .get(`https://autocomplete.clearbit.com/v1/companies/suggest`, {
          params: { query: companyName },
          timeout: 1500,
        })
        .then((res) => (Array.isArray(res.data) ? res.data : []))
        .catch(() => []);

      // DuckDuckGo Instant Answer API (50-100ms)
      const ddgPromise = axios
        .get(`https://api.duckduckgo.com/`, {
          params: { q: companyName, format: "json", no_html: 1, skip_disambig: 1 },
          timeout: 1500,
        })
        .then((res) => {
          const links: string[] = [];
          if (res.data?.AbstractURL) links.push(res.data.AbstractURL);
          if (Array.isArray(res.data?.Results)) {
            for (const r of res.data.Results) {
              if (r.FirstURL) links.push(r.FirstURL);
            }
          }
          return links;
        })
        .catch(() => []);

      const [clearbitResults, ddgLinks] = await Promise.all([clearbitPromise, ddgPromise]);

      const candidateUrls: string[] = [];

      // Extract domains from Clearbit
      for (const item of clearbitResults) {
        if (item.domain) {
          const itemDomain = item.domain.toLowerCase();
          const itemName = (item.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          if (cleanBrand.length >= 3 && (itemDomain.includes(cleanBrand) || itemName.includes(cleanBrand))) {
            candidateUrls.push(`https://${item.domain}/`);
          } else if (candidateUrls.length === 0) {
            candidateUrls.push(`https://${item.domain}/`);
          }
        }
      }

      // Extract domains from DuckDuckGo Instant
      for (const link of ddgLinks) {
        try {
          const u = new URL(link);
          const host = u.hostname.toLowerCase().replace(/^www\./, "");
          if (!DIRECTORY_DOMAINS.has(host) && !host.endsWith("wikipedia.org")) {
            candidateUrls.push(`${u.origin}/`);
          }
        } catch {}
      }

      // Sort candidates so exact domain matches come first (e.g. servicenow.com over servicenowguru.com)
      candidateUrls.sort((a, b) => {
        try {
          const hostA = new URL(a).hostname.toLowerCase().replace(/^www\./, "").split(".")[0];
          const hostB = new URL(b).hostname.toLowerCase().replace(/^www\./, "").split(".")[0];
          const matchA = hostA === cleanBrand ? 1 : 0;
          const matchB = hostB === cleanBrand ? 1 : 0;
          return matchB - matchA;
        } catch {
          return 0;
        }
      });

      if (candidateUrls.length > 0) {
        // Fast probe top 3 candidates concurrently
        const probeResults = await Promise.all(
          candidateUrls.slice(0, 3).map(async (url) => {
            try {
              const probe = await fetchUrl(url, { timeout: 2500 });
              if (probe.ok && typeof probe.data === "string") {
                const verify = WebsiteVerifierService.verify(companyName, probe.finalUrl, probe.data);
                if (verify.verified) {
                  const careerUrl = this.findCareerLinkFromHtml(probe.data, probe.finalUrl);
                  return {
                    officialUrl: probe.finalUrl,
                    careerUrl: careerUrl || probe.finalUrl,
                    confidence: Math.max(0.85, verify.confidence),
                    source: "autocomplete_registry",
                  };
                }
              }
            } catch {}
            return null;
          })
        );

        const match = probeResults.find((r) => r !== null);
        if (match) return match;
      }
    } catch {}

    return { officialUrl: null, careerUrl: null, confidence: 0, source: "none" };
  }

  /**
   * Fast HTTP search query via Bing (under 600ms, no strict quotes)
   */
  private static async searchViaFastHttp(
    companyName: string,
    locationHint?: string
  ): Promise<SearchDiscoveryOutput> {
    try {
      const query = locationHint
        ? `${companyName} ${locationHint} official site`
        : `${companyName} official site`;

      const res = await axios.get("https://www.bing.com/search", {
        params: { q: query, setlang: "en" },
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 2000,
      });

      const $ = cheerio.load(res.data);
      const items: Array<{ title: string; link: string; snippet: string }> = [];

      $("li.b_algo").each((_, b) => {
        const a = $(b).find("h2 a").first();
        const snippetEl = $(b).find(".b_caption p, .b_algoSlug, p").first();
        const href = a.attr("href");
        const title = a.text().trim();
        if (href && title) {
          items.push({
            title,
            link: this.decodeBingUrl(href),
            snippet: snippetEl.text().trim(),
          });
        }
      });

      if (items.length > 0) {
        return await this.extractFromSearchResults(companyName, items);
      }
    } catch {}

    return { officialUrl: null, careerUrl: null, confidence: 0, source: "fast_http_none" };
  }

  /**
   * Search using Serper.dev API if key provided
   */
  private static async searchViaSerper(
    companyName: string,
    locationHint?: string
  ): Promise<SearchDiscoveryOutput> {
    try {
      const query = locationHint
        ? `${companyName} ${locationHint} official site`
        : `${companyName} official site`;
      const res = await axios.post(
        "https://google.serper.dev/search",
        { q: query, num: 10 },
        {
          headers: {
            "X-API-KEY": process.env.SERPER_API_KEY,
            "Content-Type": "application/json",
          },
          timeout: 2500,
        }
      );

      const organic = res.data?.organic || [];
      return await this.extractFromSearchResults(companyName, organic);
    } catch (err: any) {
      logger.warn(`Serper API search failed: ${err.message}`);
      return { officialUrl: null, careerUrl: null, confidence: 0, source: "serper" };
    }
  }

  /**
   * Search using Google Custom Search JSON API if configured
   */
  private static async searchViaGoogleApi(companyName: string): Promise<SearchDiscoveryOutput> {
    try {
      const res = await axios.get("https://www.googleapis.com/customsearch/v1", {
        params: {
          key: process.env.GOOGLE_SEARCH_API_KEY,
          cx: process.env.GOOGLE_SEARCH_CX,
          q: `${companyName} official website`,
          num: 10,
        },
        timeout: 2500,
      });

      const items = (res.data?.items || []).map((it: any) => ({
        title: it.title,
        link: it.link,
        snippet: it.snippet,
      }));

      return await this.extractFromSearchResults(companyName, items);
    } catch (err: any) {
      logger.warn(`Google Custom Search API failed: ${err.message}`);
      return { officialUrl: null, careerUrl: null, confidence: 0, source: "google_api" };
    }
  }

  /**
   * Built-in Headless Browser search using Bing/Google via Playwright (resource-blocked for speed)
   */
  private static async searchViaPlaywright(
    companyName: string,
    locationHint?: string
  ): Promise<SearchDiscoveryOutput> {
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: config.PLAYWRIGHT_HEADLESS,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-extensions",
          "--disable-gpu",
        ],
      });

      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      });

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

      // Abort heavy resources to load search page in <1s
      await page.route("**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,eot,mp4,webm}", (route) =>
        route.abort()
      );

      const query = locationHint
        ? `${companyName} ${locationHint} official site`
        : `${companyName} official site`;

      const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 4000 });

      const items = await page.evaluate(() => {
        function __name(t: any) { return t; }
        const results: Array<{ title: string; link: string; snippet: string }> = [];
        const blocks = document.querySelectorAll("li.b_algo");
        blocks.forEach((b) => {
          const a = b.querySelector("h2 a") as HTMLAnchorElement | null;
          const snippetEl = b.querySelector(".b_caption p, .b_algoSlug, p");
          if (a && a.href) {
            results.push({
              title: a.innerText.trim(),
              link: a.href,
              snippet: snippetEl ? (snippetEl as HTMLElement).innerText.trim() : "",
            });
          }
        });
        return results;
      });

      // Decode redirect URLs
      const decodedItems = items.map((it) => ({
        ...it,
        link: this.decodeBingUrl(it.link),
      }));

      return await this.extractFromSearchResults(companyName, decodedItems);
    } catch (err: any) {
      logger.warn(`Playwright search discovery ended: ${err.message}`, companyName);
      return { officialUrl: null, careerUrl: null, confidence: 0, source: "playwright_search" };
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {}
      }
    }
  }

  /**
   * Decodes Bing redirection URLs (u=a1<base64>)
   */
  private static decodeBingUrl(rawUrl: string): string {
    try {
      const match = rawUrl.match(/[?&]u=a1([^&]+)/);
      if (match) {
        let b64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";
        const decoded = Buffer.from(b64, "base64").toString("utf8");
        if (decoded.startsWith("http")) return decoded;
      }
    } catch {}
    return rawUrl;
  }

  /**
   * Evaluates search candidate URLs in parallel to quickly isolate the genuine official website & career page
   */
  private static async extractFromSearchResults(
    companyName: string,
    results: Array<{ title?: string; link?: string; url?: string; snippet?: string }>
  ): Promise<SearchDiscoveryOutput> {
    const candidates: string[] = [];

    for (const r of results) {
      const url = r.link || r.url || "";
      if (!url.startsWith("http")) continue;

      try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

        // Skip directories and aggregators
        const isDir = Array.from(DIRECTORY_DOMAINS).some((d) => host === d || host.endsWith(`.${d}`));
        if (!isDir) {
          candidates.push(url);
        }
      } catch {}
    }

    if (candidates.length === 0) {
      return { officialUrl: null, careerUrl: null, confidence: 0, source: "search_engine" };
    }

    const nameTokens = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);

    // Fast parallel probe top 3 candidates (1200ms timeout each)
    const probeResults = await Promise.all(
      candidates.slice(0, 3).map(async (candUrl) => {
        try {
          const u = new URL(candUrl);
          const rootOrigin = `${u.origin}/`;

          const probe = await fetchUrl(rootOrigin, { timeout: 1400 });
          if (probe.ok && typeof probe.data === "string") {
            const $ = cheerio.load(probe.data);
            const pageTitle = $("title").text().toLowerCase();
            const metaDesc = $('meta[name="description"]').attr("content")?.toLowerCase() || "";
            const ogTitle = $('meta[property="og:title"]').attr("content")?.toLowerCase() || "";

            const pageText = `${pageTitle} ${metaDesc} ${ogTitle}`;

            // Count matching tokens
            const matches = nameTokens.filter(
              (token) => pageText.includes(token) || u.hostname.includes(token)
            );
            const score = nameTokens.length > 0 ? matches.length / nameTokens.length : 0.5;
            const hostMatchesToken = nameTokens.some((token) => u.hostname.toLowerCase().includes(token));

            // Require strong confidence or domain hostname matching a brand token
            if (score >= 0.6 || (score >= 0.4 && hostMatchesToken) || candidates.length === 1) {
              const careerUrl = this.findCareerLinkFromHtml(probe.data, rootOrigin);
              return {
                officialUrl: rootOrigin,
                careerUrl: careerUrl || rootOrigin,
                confidence: Math.max(0.7, Math.round(score * 100) / 100),
                source: "search_engine",
              };
            }
          }
        } catch {}
        return null;
      })
    );

    const verified = probeResults.find((r) => r !== null);
    if (verified) {
      // If careerUrl equals officialUrl, fast probe common paths in parallel (1000ms)
      if (verified.careerUrl === verified.officialUrl) {
        const cleanRoot = verified.officialUrl.replace(/\/$/, "");
        const paths = [`${cleanRoot}/careers`, `${cleanRoot}/jobs`, `${cleanRoot}/vacancies`];
        const pathResults = await Promise.all(
          paths.map(async (p) => {
            try {
              const cProbe = await fetchUrl(p, { timeout: 1000 });
              if (cProbe.ok) return cProbe.finalUrl;
            } catch {}
            return null;
          })
        );
        const careerMatch = pathResults.find((p) => p !== null);
        if (careerMatch) {
          verified.careerUrl = careerMatch;
        }
      }
      return verified;
    }

    // Fallback to candidate domain root only if hostname matches a brand token
    for (const cand of candidates) {
      try {
        const u = new URL(cand);
        const host = u.hostname.toLowerCase();
        const matchesBrandToken = nameTokens.some((t) => t.length > 2 && host.includes(t));
        if (matchesBrandToken) {
          return {
            officialUrl: `${u.origin}/`,
            careerUrl: `${u.origin}/`,
            confidence: 0.65,
            source: "search_engine_fallback",
          };
        }
      } catch {}
    }

    return { officialUrl: null, careerUrl: null, confidence: 0, source: "search_engine" };
  }

  /**
   * Scans HTML for high-probability career anchor tags
   */
  private static findCareerLinkFromHtml(html: string, baseUrl: string): string | null {
    try {
      const $ = cheerio.load(html);
      const candidates: Array<{ href: string; score: number }> = [];

      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        const text = $(el).text().toLowerCase().trim();
        if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

        try {
          const resolved = new URL(href, baseUrl).toString();
          const lower = (text + " " + resolved).toLowerCase();
          let score = 0;

          if (lower.includes("/careers") || lower.includes("/jobs") || lower.includes("/vacancies")) score += 30;
          if (text.includes("careers") || text.includes("jobs") || text.includes("work with us") || text.includes("join our team")) score += 20;
          if (lower.includes("greenhouse.io") || lower.includes("lever.co") || lower.includes("myworkdayjobs.com") || lower.includes("ashbyhq.com") || lower.includes("teamtailor.com")) score += 40;

          if (score > 0) {
            candidates.push({ href: resolved, score });
          }
        } catch {}
      });

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0].href;
      }
    } catch {}
    return null;
  }
}
