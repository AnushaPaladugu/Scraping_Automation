import { CompanyDiscoveryResult } from "../../../types/company";
import { RawJobData } from "../../../types/job";
import { fetchUrl } from "../../../utils/httpClient";

export async function scrapeLever(companyInfo: CompanyDiscoveryResult): Promise<RawJobData[]> {
  const slug = companyInfo.companySlug;
  if (!slug) return [];

  const apiUrl = companyInfo.apiUrl || `https://api.lever.co/v0/postings/${slug}?mode=json`;
  const res = await fetchUrl(apiUrl);

  if (!res.ok || !Array.isArray(res.data)) {
    return [];
  }

  return res.data.map((j: any) => ({
    title: j.text,
    company: companyInfo.companyName,
    url: j.hostedUrl || j.applyUrl,
    id: String(j.id || ""),
    location: j.categories?.location || "",
    department: j.categories?.team || j.categories?.department || "",
    employment_type: j.categories?.commitment || "",
    description: j.descriptionPlain || j.description || "",
    posted_date: j.createdAt,
    ats: "Lever",
    metadata: {
      workplaceType: j.workplaceType,
    },
  }));
}
