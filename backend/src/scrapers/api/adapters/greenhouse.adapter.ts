import { CompanyDiscoveryResult } from "../../../types/company";
import { RawJobData } from "../../../types/job";
import { fetchUrl } from "../../../utils/httpClient";

export async function scrapeGreenhouse(companyInfo: CompanyDiscoveryResult): Promise<RawJobData[]> {
  const slug = companyInfo.companySlug;
  if (!slug) return [];

  const apiUrl = companyInfo.apiUrl || `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
  const res = await fetchUrl(apiUrl);

  if (!res.ok || !res.data) {
    return [];
  }

  const jobsData = res.data.jobs;
  if (!Array.isArray(jobsData)) {
    return [];
  }

  return jobsData.map((j: any) => ({
    title: j.title,
    company: companyInfo.companyName,
    url: j.absolute_url,
    id: String(j.id || ""),
    location: j.location?.name || "",
    department: j.departments && j.departments.length > 0 ? j.departments[0].name : "",
    description: j.content || "",
    posted_date: j.updated_at,
    ats: "Greenhouse",
    metadata: {
      requisition_id: j.requisition_id,
      internal_job_id: j.internal_job_id,
    },
  }));
}
