import * as cheerio from "cheerio";
import axios from "axios";
import { fetchUrl } from "../utils/httpClient";
import { logger } from "../utils/logger";

export interface ExtractedMetadata {
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedinUrl?: string;
}

const US_STATES_MAP: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia"
};

const STATE_NAMES = new Set(Object.values(US_STATES_MAP).map((s) => s.toLowerCase()));
const STATE_ABBRS = new Set(Object.keys(US_STATES_MAP));

export class MetadataExtractorService {
  /**
   * Main entry point: Extracts industry, city, state, country from website HTML, contact page, and LinkedIn fallback.
   */
  public static async extract(
    companyName: string,
    officialUrl?: string | null,
    homepageHtml?: string
  ): Promise<ExtractedMetadata> {
    const result: ExtractedMetadata = {};

    // 0. Industry and State extraction from company name itself
    const nameIndustry = this.inferIndustryFromText(companyName);
    if (nameIndustry) {
      result.industry = nameIndustry;
    }

    const nameState = this.inferStateFromText(companyName);
    if (nameState) {
      result.state = nameState;
      result.country = "United States";
    }

    // 1. Extract from homepage HTML if available
    if (homepageHtml) {
      this.extractFromHtml(homepageHtml, result);
    }

    // 2. If website URL exists but location is missing, probe /contact or /about page
    if (officialUrl && (!result.city || !result.state)) {
      try {
        const root = officialUrl.replace(/\/$/, "");
        const contactPaths = [`${root}/contact`, `${root}/about`, `${root}/contact-us`, `${root}/locations`];
        const contactResults = await Promise.allSettled(
          contactPaths.map((cp) => fetchUrl(cp, { timeout: 1500 }))
        );
        for (const res of contactResults) {
          if (res.status === "fulfilled" && res.value.ok && typeof res.value.data === "string") {
            this.extractFromHtml(res.value.data, result);
            if (result.city && result.state) break;
          }
        }
      } catch {}
    }

    // 3. LinkedIn Company Page Search Fallback (Rule 6)
    if (!result.city || !result.state || !result.industry) {
      try {
        const linkedinData = await this.extractFromLinkedIn(companyName);
        if (linkedinData.industry && !result.industry) result.industry = linkedinData.industry;
        if (linkedinData.city && !result.city) result.city = linkedinData.city;
        if (linkedinData.state && !result.state) result.state = linkedinData.state;
        if (linkedinData.country && !result.country) result.country = linkedinData.country;
        if (linkedinData.linkedinUrl) result.linkedinUrl = linkedinData.linkedinUrl;
      } catch (err: any) {
        logger.warn(`LinkedIn metadata fallback failed for ${companyName}: ${err.message}`);
      }
    }

    // Standardize industry classification
    if (result.industry) {
      result.industry = this.standardizeIndustry(result.industry);
    }

    // Standardize state name if abbreviation
    if (result.state && result.state.length === 2) {
      const upper = result.state.toUpperCase();
      if (US_STATES_MAP[upper]) {
        result.state = US_STATES_MAP[upper];
      }
    }

    // Default country to United States if state is a US state
    if (!result.country && result.state && (STATE_NAMES.has(result.state.toLowerCase()) || STATE_ABBRS.has(result.state.toUpperCase()))) {
      result.country = "United States";
    }

    return result;
  }

  private static inferStateFromText(text: string): string | undefined {
    for (const [abbr, full] of Object.entries(US_STATES_MAP)) {
      const regex = new RegExp(`\\b${full}\\b`, "i");
      if (regex.test(text)) return full;
    }
    return undefined;
  }

  /**
   * Parses Schema.org JSON-LD and HTML meta tags for location and industry
   */
  private static extractFromHtml(html: string, out: ExtractedMetadata) {
    try {
      const $ = cheerio.load(html);

      // A. Schema.org JSON-LD parsing
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const raw = $(el).html();
          if (!raw) return;
          const data = JSON.parse(raw);
          const items = Array.isArray(data) ? data : [data];

          for (const item of items) {
            if (!item) continue;
            // Address extraction
            const addr = item.address || item.location?.address;
            if (addr && typeof addr === "object") {
              if (!out.city && addr.addressLocality) out.city = String(addr.addressLocality).trim();
              if (!out.state && addr.addressRegion) out.state = String(addr.addressRegion).trim();
              if (!out.country && addr.addressCountry) {
                out.country = typeof addr.addressCountry === "string" ? addr.addressCountry.trim() : addr.addressCountry.name;
              }
            }

            // Industry extraction
            if (!out.industry && item.industry) {
              out.industry = String(item.industry).trim();
            }
          }
        } catch {}
      });

      // B. Meta tags extraction
      if (!out.state) {
        const geoRegion = $('meta[name="geo.region"]').attr("content") || $('meta[name="DC.coverage"]').attr("content");
        if (geoRegion) {
          const parts = geoRegion.split("-");
          if (parts.length === 2 && parts[0].toUpperCase() === "US") {
            out.state = parts[1].toUpperCase();
          }
        }
      }

      if (!out.city) {
        const placename = $('meta[name="geo.placename"]').attr("content");
        if (placename) {
          out.city = placename.split(",")[0].trim();
        }
      }

      // C. Address text regex extraction from footer / contact body text
      if (!out.city || !out.state) {
        const text = $("body").text();
        // Match pattern: "City, ST 12345" or "City, State 12345"
        const addressMatch = text.match(/\b([A-Z][a-zA-B\s]{2,20}),\s*([A-Z]{2})\s+\d{5}\b/);
        if (addressMatch) {
          const candidateCity = addressMatch[1].trim();
          const candidateState = addressMatch[2].trim().toUpperCase();
          if (STATE_ABBRS.has(candidateState) && candidateCity.length < 25) {
            if (!out.city) out.city = candidateCity;
            if (!out.state) out.state = candidateState;
          }
        }
      }

      // D. Industry meta classification
      if (!out.industry) {
        const metaDesc = $('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "";
        const title = $("title").text() || "";
        const combined = `${title} ${metaDesc}`.toLowerCase();

        const inferred = this.inferIndustryFromText(combined);
        if (inferred) out.industry = inferred;
      }
    } catch {}
  }

  /**
   * Searches LinkedIn company profile for official headquarters location & industry
   */
  private static async extractFromLinkedIn(companyName: string): Promise<ExtractedMetadata> {
    const out: ExtractedMetadata = {};
    try {
      const query = `site:linkedin.com/company "${companyName}"`;
      const res = await axios.get("https://html.duckduckgo.com/html/", {
        params: { q: query },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 2500,
      });

      const $ = cheerio.load(res.data);
      let linkedinUrl: string | null = null;
      let snippetText = "";

      $(".result").each((_, el) => {
        if (linkedinUrl) return;
        const a = $(el).find(".result__title a").first();
        const snippetEl = $(el).find(".result__snippet").first();
        const rawHref = a.attr("href") || "";

        let decoded = rawHref;
        if (rawHref.includes("uddg=")) {
          const match = rawHref.match(/uddg=([^&]+)/);
          if (match) decoded = decodeURIComponent(match[1]);
        }

        if (decoded && decoded.includes("linkedin.com/company/")) {
          linkedinUrl = decoded;
          snippetText = snippetEl.text().trim();
        }
      });

      if (linkedinUrl) {
        out.linkedinUrl = linkedinUrl;
        const parts = snippetText.split("·").map((p) => p.trim());
        for (const part of parts) {
          if (
            !out.industry &&
            /^(Hospitality|Healthcare|Health|Financial Services|Banking|Real Estate|Retail|Software|Entertainment|Food|Automotive|Education|Insurance|Transportation|Manufacturing|Construction|Technology|Services)/i.test(
              part
            )
          ) {
            out.industry = part;
          } else if (part.includes(",") && !part.includes("employees")) {
            const locParts = part.split(",").map((l) => l.trim());
            if (locParts.length >= 2) {
              out.city = locParts[0];
              out.state = locParts[1];
            }
          }
        }
      }
    } catch {}

    return out;
  }

  /**
   * Classifies text into standardized primary business industries
   */
  private static inferIndustryFromText(text: string): string | undefined {
    if (/\b(hotel|resort|restaurant|hospitality|dining|catering|pizza)\b/i.test(text)) {
      return "Hospitality";
    }
    if (/\b(bank|banking|financial|credit union|mortgage|wealth management|capital|investment)\b/i.test(text)) {
      return "Financial Services";
    }
    if (/\b(hospital\b|healthcare|care center|nursing|health|medical|clinic)\b/i.test(text)) {
      return "Healthcare";
    }
    if (/\b(software|saas|cloud|platform|app|technology|ai|cybersecurity)\b/i.test(text)) {
      return "Software";
    }
    if (/\b(insurance|underwriting|actuarial)\b/i.test(text)) {
      return "Insurance";
    }
    if (/\b(retail|store|e-commerce|shop|supermarket)\b/i.test(text)) {
      return "Retail";
    }
    if (/\b(construction|builder|contractor|architecture|engineering)\b/i.test(text)) {
      return "Construction";
    }
    if (/\b(manufacturing|factory|industrial|producer)\b/i.test(text)) {
      return "Manufacturing";
    }
    if (/\b(logistics|freight|shipping|transportation|trucking|transit|supply chain)\b/i.test(text)) {
      return "Transportation & Logistics";
    }
    if (/\b(real estate|realty|property management|housing)\b/i.test(text)) {
      return "Real Estate";
    }
    if (/\b(school|university|college|education|learning|academy)\b/i.test(text)) {
      return "Education";
    }
    return undefined;
  }

  /**
   * Maps industry string to standardized list
   */
  public static standardizeIndustry(raw: string): string {
    const lower = raw.toLowerCase().trim();
    if (lower.includes("hospitality") || lower.includes("hotel") || lower.includes("restaurant") || lower.includes("food")) return "Hospitality";
    if (lower.includes("financial") || lower.includes("bank") || lower.includes("credit union")) return "Financial Services";
    if (lower.includes("health") || lower.includes("hospital") || lower.includes("care") || lower.includes("medical")) return "Healthcare";
    if (lower.includes("software") || lower.includes("tech") || lower.includes("it ") || lower.includes("information technology")) return "Software";
    if (lower.includes("insurance")) return "Insurance";
    if (lower.includes("retail") || lower.includes("e-commerce") || lower.includes("commerce")) return "Retail";
    if (lower.includes("construction") || lower.includes("building")) return "Construction";
    if (lower.includes("manufactur") || lower.includes("industrial")) return "Manufacturing";
    if (lower.includes("transport") || lower.includes("logistics") || lower.includes("freight")) return "Transportation & Logistics";
    if (lower.includes("real estate") || lower.includes("realty") || lower.includes("property")) return "Real Estate";
    if (lower.includes("education") || lower.includes("school") || lower.includes("college")) return "Education";
    return raw;
  }
}
