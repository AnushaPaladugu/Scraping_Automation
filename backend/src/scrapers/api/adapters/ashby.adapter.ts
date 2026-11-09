import { CompanyDiscoveryResult } from "../../../types/company";
import { RawJobData } from "../../../types/job";
import { fetchUrl } from "../../../utils/httpClient";

export async function scrapeAshby(companyInfo: CompanyDiscoveryResult): Promise<RawJobData[]> {
  const slug = companyInfo.companySlug;
  if (!slug) return [];

  const apiUrl = companyInfo.apiUrl || `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
  const res = await fetchUrl(apiUrl);

  if (!res.ok || !res.data || !Array.isArray(res.data.jobs)) {
    return [];
  }

  return res.data.jobs.map((j: any) => ({
    title: j.title,
    company: companyInfo.companyName,
    url: j.jobUrl || `https://jobs.ashbyhq.com/${slug}/${j.id}`,
    id: String(j.id || ""),
    location: j.location || (j.secondaryLocations && j.secondaryLocations[0]?.location) || "",
    department: j.department || "",
    employment_type: j.employmentType || "",
    description: j.descriptionPlain || j.descriptionHtml || "",
    posted_date: j.publishedAt,
    salary: j.compensation ? `${j.compensation.min} - ${j.compensation.max} ${j.compensation.currency}` : null,
    ats: "Ashby",
  }));
}
