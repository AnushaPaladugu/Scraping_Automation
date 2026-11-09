import { CompanyDiscoveryResult } from "../../../types/company";
import { RawJobData } from "../../../types/job";
import { fetchUrl } from "../../../utils/httpClient";

export async function scrapeBambooHR(companyInfo: CompanyDiscoveryResult): Promise<RawJobData[]> {
  const slug = companyInfo.companySlug;
  if (!slug) return [];

  const apiUrl = companyInfo.apiUrl || `https://${slug}.bamboohr.com/careers/list?format=json`;
  const res = await fetchUrl(apiUrl);

  if (!res.ok || !res.data || !Array.isArray(res.data.result)) {
    return [];
  }

  return res.data.result.map((j: any) => ({
    title: j.jobOpeningName || j.title,
    company: companyInfo.companyName,
    url: `https://${slug}.bamboohr.com/careers/${j.id}`,
    id: String(j.id || ""),
    location: [j.location?.city, j.location?.state, j.location?.country].filter(Boolean).join(", "),
    department: j.departmentLabel || j.department || "",
    employment_type: j.employmentType || "",
    description: j.jobDescription || "",
    ats: "BambooHR",
  }));
}
