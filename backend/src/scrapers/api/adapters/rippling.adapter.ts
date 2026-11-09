import { CompanyDiscoveryResult } from "../../../types/company";
import { RawJobData } from "../../../types/job";
import { fetchUrl } from "../../../utils/httpClient";

export async function scrapeRippling(companyInfo: CompanyDiscoveryResult): Promise<RawJobData[]> {
  const slug = companyInfo.companySlug;
  if (!slug) return [];

  const apiUrl = companyInfo.apiUrl || `https://ats.rippling.com/api/v2/board/${slug}/jobs?pageSize=50`;
  const res = await fetchUrl(apiUrl);

  if (!res.ok || !res.data) {
    return [];
  }

  const items = res.data.items || res.data.jobs || [];
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((j: any) => {
    const loc = j.locations && j.locations[0] ? j.locations[0] : {};
    return {
      title: j.name || j.title,
      company: companyInfo.companyName,
      url: j.url || `https://ats.rippling.com/${slug}/jobs/${j.id}`,
      id: String(j.id || ""),
      location: loc.name || [loc.city, loc.state, loc.country].filter(Boolean).join(", "),
      department: j.department?.name || "",
      employment_type: typeof j.employmentType === "object" ? j.employmentType?.id : j.employmentType,
      posted_date: j.createdOn,
      ats: "Rippling",
    };
  });
}
