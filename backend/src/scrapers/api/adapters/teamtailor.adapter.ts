import * as cheerio from "cheerio";
import he from "he";
import { CompanyDiscoveryResult } from "../../../types/company";
import { RawJobData } from "../../../types/job";
import { fetchUrl } from "../../../utils/httpClient";
import { logger } from "../../../utils/logger";

export async function scrapeTeamtailor(companyInfo: CompanyDiscoveryResult): Promise<RawJobData[]> {
  logger.info(`Starting Teamtailor scraping for ${companyInfo.companyName}`);

  // 1. Identify RSS / Feed URL
  let rssUrl = companyInfo.apiUrl;
  if (!rssUrl && companyInfo.careerUrl) {
    if (companyInfo.careerUrl.includes(".teamtailor.com")) {
      rssUrl = companyInfo.careerUrl.replace(/\/jobs\/?$/, "") + "/jobs.rss";
    }
  }
  if (!rssUrl && companyInfo.companySlug) {
    rssUrl = `https://${companyInfo.companySlug}.teamtailor.com/jobs.rss`;
  }

  if (rssUrl) {
    try {
      const res = await fetchUrl(rssUrl, { timeout: 8000 });
      if (res.ok && typeof res.data === "string" && res.data.includes("<rss")) {
        const $ = cheerio.load(res.data, { xmlMode: true });
        const jobs: RawJobData[] = [];

        $("channel > item").each((_, item) => {
          const $item = $(item);
          const title = $item.find("title").text().trim();
          const link = $item.find("link").text().trim();
          const guid = $item.find("guid").text().trim();
          const pubDate = $item.find("pubDate").text().trim();
          const rawDesc = $item.find("description").text().trim();
          const department = $item.find("tt\\:department, department").text().trim();
          const remoteStatus = $item.find("remoteStatus").text().trim().toLowerCase();

          // Locations
          const locNames: string[] = [];
          let city = "";
          let country = "";
          $item.find("tt\\:location, location").each((__, loc) => {
            const $loc = $(loc);
            const name = $loc.find("tt\\:name, name").text().trim();
            const c = $loc.find("tt\\:city, city").text().trim();
            const co = $loc.find("tt\\:country, country").text().trim();
            if (name) locNames.push(name);
            if (c && !city) city = c;
            if (co && !country) country = co;
          });

          const location = locNames.join(", ") || city || country;
          const cleanDesc = he.decode(rawDesc).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

          let postedDate: string | null = null;
          if (pubDate) {
            try {
              postedDate = new Date(pubDate).toISOString().split("T")[0];
            } catch {}
          }

          let remoteType: "Remote" | "Hybrid" | "Onsite" | null = null;
          if (remoteStatus.includes("hybrid")) remoteType = "Hybrid";
          else if (remoteStatus.includes("remote")) remoteType = "Remote";
          else if (remoteStatus.includes("onsite") || remoteStatus.includes("office")) remoteType = "Onsite";

          jobs.push({
            id: guid || link,
            title,
            link,
            url: link,
            description: cleanDesc,
            posted_date: postedDate,
            location: location || null,
            city: city || null,
            country: country || null,
            department: department || null,
            remote_type: remoteType,
            ats: "Teamtailor",
          });
        });

        if (jobs.length > 0) {
          logger.info(`Successfully parsed ${jobs.length} jobs from Teamtailor RSS`, companyInfo.companyName);
          return jobs;
        }
      }
    } catch (err: any) {
      logger.warn(`Teamtailor RSS parsing error: ${err.message}`, companyInfo.companyName);
    }
  }

  // 2. Fallback: Teamtailor JSON API
  const slug = companyInfo.companySlug;
  if (slug) {
    try {
      const jsonUrl = `https://${slug}.teamtailor.com/jobs.json`;
      const jRes = await fetchUrl(jsonUrl, { timeout: 6000 });
      if (jRes.ok && Array.isArray(jRes.data)) {
        return jRes.data.map((j: any) => ({
          id: String(j.id || ""),
          title: j.title || j.name,
          url: j.url || j.absolute_url,
          location: j.location,
          department: j.department,
          description: j.body || j.description,
          posted_date: j.created_at || j.published_at,
          ats: "Teamtailor",
        }));
      }
    } catch {}
  }

  return [];
}
