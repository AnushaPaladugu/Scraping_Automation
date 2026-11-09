import { CompanyDiscoveryResult } from "../../../types/company";
import { RawJobData } from "../../../types/job";
import { fetchUrl } from "../../../utils/httpClient";

export async function scrapeWorkable(companyInfo: CompanyDiscoveryResult): Promise<RawJobData[]> {
  const slug = companyInfo.companySlug;
  if (!slug) return [];

  const apiUrl = companyInfo.apiUrl || `https://apply.workable.com/api/v1/accounts/${slug}/jobs`;
  const res = await fetchUrl(apiUrl);

  if (!res.ok || !res.data || !Array.isArray(res.data.results)) {
    return [];
  }

  return res.data.results.map((j: any) => ({
    title: j.title,
    company: companyInfo.companyName,
    url: j.shortlink || `https://apply.workable.com/${slug}/j/${j.shortcode}/`,
    id: String(j.shortcode || j.id || ""),
    location: [j.city, j.state, j.country].filter(Boolean).join(", ") || (j.telecommuting ? "Remote" : ""),
    department: j.department || "",
    employment_type: j.employment_type || "",
    posted_date: j.published,
    ats: "Workable",
  }));
}
