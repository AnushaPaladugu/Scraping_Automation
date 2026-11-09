import { CompanyDiscoveryResult } from "../../../types/company";
import { RawJobData } from "../../../types/job";
import { fetchUrl } from "../../../utils/httpClient";
import { logger } from "../../../utils/logger";

export async function scrapeHiBob(companyInfo: CompanyDiscoveryResult): Promise<RawJobData[]> {
  let apiUrl = companyInfo.apiUrl;
  const slug = companyInfo.companySlug;

  if (!apiUrl && slug) {
    apiUrl = `https://${slug}.careers.hibob.com/api/job-ad`;
  }

  if (!apiUrl) {
    const rawUrl = companyInfo.careerUrl || companyInfo.atsUrl || companyInfo.companyUrl;
    if (rawUrl) {
      const match = rawUrl.match(/https?:\/\/([a-z0-9_-]+)\.careers\.hibob\.com/i);
      if (match) {
        apiUrl = `https://${match[1]}.careers.hibob.com/api/job-ad`;
      }
    }
  }

  if (!apiUrl) {
    logger.warn("No HiBob API URL or slug found", companyInfo.companyName);
    return [];
  }

  const origin = apiUrl.replace(/\/api\/job-ad.*$/, "");
  logger.info(`Fetching HiBob jobs API: ${apiUrl}`, companyInfo.companyName);
  const res = await fetchUrl(apiUrl, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: `${origin}/jobs`,
      Origin: origin,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok || !res.data) {
    logger.warn(`HiBob API request failed: ${res.error || `HTTP ${res.status}`}`, companyInfo.companyName);
    return [];
  }

  const data = res.data;
  const jobsList: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.jobAdDetails)
    ? data.jobAdDetails
    : Array.isArray(data?.jobs)
    ? data.jobs
    : Array.isArray(data?.data)
    ? data.data
    : [];


  return jobsList.map((j: any) => {
    const id = String(j.id || j.jobId || j.externalId || "");
    const title = j.title || j.jobTitle || j.name || "";
    const locParts = [j.site, j.city, j.country].filter(Boolean);
    const location = locParts.length > 0 ? locParts.join(", ") : j.location || null;
    const country = j.country || companyInfo.country || "United Kingdom";
    const dept = j.department || (Array.isArray(j.departments) ? j.departments[0] : null) || null;
    const desc = (j.description || j.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const url = j.url || j.jobUrl || (origin && id ? `${origin}/#job-${id}` : (companyInfo.careerUrl || origin));

    return {
      title,
      company: companyInfo.companyName,
      url,
      id,
      location,
      country,
      department: dept,
      employment_type: j.employmentType || j.type || null,
      posted_date: j.publishedAt ? j.publishedAt.split("T")[0] : j.createdAt ? j.createdAt.split("T")[0] : null,
      description: desc.slice(0, 1500),
      ats: "HiBob",
      metadata: {
        site: j.site,
        workplaceType: j.workplaceType,
      },
    };
  });
}
