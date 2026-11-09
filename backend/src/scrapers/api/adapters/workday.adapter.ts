import { CompanyDiscoveryResult } from "../../../types/company";
import { RawJobData } from "../../../types/job";
import { fetchUrl } from "../../../utils/httpClient";
import { logger } from "../../../utils/logger";

export async function scrapeWorkday(companyInfo: CompanyDiscoveryResult): Promise<RawJobData[]> {
  const targetUrl = companyInfo.atsUrl || companyInfo.careerUrl || companyInfo.companyUrl || "";
  if (!targetUrl) return [];

  // Parse tenant, domain, and site path from Workday URL
  // e.g. https://dxctechnology.wd1.myworkdayjobs.com/DXCJobs/login
  const match = targetUrl.match(/https?:\/\/([a-z0-9_-]+)\.([a-z0-9_.-]*myworkdayjobs\.com)\/([a-z0-9_-]+)/i);
  if (!match) {
    logger.warn(`Could not parse Workday domain from URL: ${targetUrl}`, companyInfo.companyName);
    return [];
  }

  const tenant = match[1];
  const domain = `${tenant}.${match[2]}`;
  const site = match[3];

  const apiUrl = `https://${domain}/wday/cxs/${tenant}/${site}/jobs`;
  logger.info(`Fetching Workday CXS API: ${apiUrl}`, companyInfo.companyName);

  try {
    const res = await fetchUrl(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      data: {
        appliedFacets: {},
        limit: 20,
        offset: 0,
        searchText: "",
      },
    });

    if (!res.ok || !res.data) {
      logger.warn(`Workday API request failed: ${res.error || `HTTP ${res.status}`}`, companyInfo.companyName);
      return [];
    }

    const data = res.data;
    const postings: any[] = Array.isArray(data?.jobPostings) ? data.jobPostings : [];

    logger.info(`Workday API returned ${postings.length} jobs (total: ${data.total || postings.length})`, companyInfo.companyName);

    return postings.map((j: any) => {
      const extPath = j.externalPath || "";
      const jobUrl = extPath ? `https://${domain}/en-US/${site}${extPath}` : targetUrl;
      const id = extPath.replace(/.*\/job\//, "") || String(j.bulletFields?.[0] || j.title);

      return {
        title: j.title || "Unknown Position",
        company: companyInfo.companyName,
        url: jobUrl,
        id,
        location: j.locationsText || null,
        country: companyInfo.country || "United Kingdom",
        posted_date: j.postedOn || null,
        description: Array.isArray(j.bulletFields) && j.bulletFields.length > 0 ? j.bulletFields.join(" | ") : j.title,
      };
    });
  } catch (err: any) {
    logger.error(`Workday adapter error: ${err.message}`, companyInfo.companyName);
    return [];
  }
}
