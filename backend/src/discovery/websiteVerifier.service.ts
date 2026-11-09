import * as cheerio from "cheerio";

const LEGAL_REGEX = /\b(s\.?a\.?|p\.?l\.?c\.?|l\.?t\.?d\.?|i\.?n\.?c\.?|c\.?o\.?r\.?p\.?|l\.?l\.?c\.?|l\.?l\.?p\.?|p\.?v\.?t\.?|g\.?m\.?b\.?h\.?|s\.?a\.?r\.?l\.?|b\.?v\.?|n\.?v\.?|limited|incorporated|corporation|private|company|group|holdings|services|solutions|network|family|center|care|healthcare|wellness|transit|construction|agency|studio|bank|rehabilitation)\b/gi;
const STOP_WORDS = new Set(["the", "a", "an", "and", "&", "of", "in", "for", "at", "to", "on", "by", "us"]);

export interface VerificationResult {
  verified: boolean;
  confidence: number;
  siteTitle: string;
  reason: string;
}

export class WebsiteVerifierService {
  /**
   * Verifies that the scraped website content actually matches the requested company name
   * using intelligent brand token analysis and multi-factor metadata matching.
   */
  public static verify(
    companyName: string,
    url: string,
    html: string
  ): VerificationResult {
    if (!html || typeof html !== "string") {
      return {
        verified: false,
        confidence: 0,
        siteTitle: "",
        reason: "No HTML content received",
      };
    }

    const $ = cheerio.load(html);
    const siteTitle = $("title").text().trim();
    const ogSiteName = $('meta[property="og:site_name"]').attr("content") || "";
    const metaDescription = $('meta[name="description"]').attr("content") || "";
    const footerText = $("body").text().slice(-1500);

    let hostname = "";
    try {
      hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      hostname = url.toLowerCase();
    }

    const titleLower = siteTitle.toLowerCase();
    const ogLower = ogSiteName.toLowerCase();
    const descLower = metaDescription.toLowerCase();
    const footerLower = footerText.toLowerCase();

    // 1. Extract core tokens (strip legal & industry generic suffixes)
    const cleanedName = companyName.replace(LEGAL_REGEX, " ").trim();
    const rawTokens = cleanedName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0);

    const brandTokens = rawTokens.filter((t) => !STOP_WORDS.has(t));
    const targetTokens = brandTokens.length > 0 ? brandTokens : rawTokens;

    let score = 0;
    const reasons: string[] = [];

    // 2. Exact phrase & brand slug matching
    const exactBrandPhrase = targetTokens.join(" ");
    const exactSlug = targetTokens.join("");

    if (hostname.replace(/[^a-z0-9]/g, "").includes(exactSlug)) {
      score += 0.5;
      reasons.push("Domain contains full brand name");
    }

    if (titleLower.includes(exactBrandPhrase) || ogLower.includes(exactBrandPhrase)) {
      score += 0.4;
      reasons.push("Page title or brand meta matches company name");
    }

    // 3. Token-based overlap matching
    if (targetTokens.length > 0) {
      let matchedInMeta = 0;
      targetTokens.forEach((token) => {
        if (
          token.length >= 2 &&
          (hostname.includes(token) ||
            titleLower.includes(token) ||
            ogLower.includes(token) ||
            descLower.includes(token))
        ) {
          matchedInMeta++;
        }
      });

      const tokenRatio = matchedInMeta / targetTokens.length;
      if (tokenRatio === 1.0 && !reasons.includes("Domain contains full brand name")) {
        score += 0.4;
        reasons.push("All brand tokens present in website metadata");
      } else if (tokenRatio >= 0.5) {
        score += 0.3;
        reasons.push("Majority of brand tokens verified");
      }
    }

    // 4. Copyright or footer brand mentions
    if (footerLower.includes(exactBrandPhrase) || footerLower.includes(companyName.toLowerCase())) {
      score += 0.2;
      reasons.push("Footer/copyright mentions company");
    }

    // 5. Hostname matching brand token fallback
    const hostnameMatchesBrand = targetTokens.some(
      (token) => token.length >= 3 && hostname.includes(token)
    );
    if (hostnameMatchesBrand && score < 0.35) {
      score += 0.35;
      reasons.push("Hostname matches brand token");
    }

    const confidence = Math.min(1.0, Math.round(score * 100) / 100);
    const verified = confidence >= 0.3; // Confirmed match

    return {
      verified,
      confidence,
      siteTitle,
      reason: reasons.join("; ") || "Insufficient brand markers found",
    };
  }
}
