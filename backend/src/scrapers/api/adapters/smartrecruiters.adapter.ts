import pLimit from "p-limit";
import { CompanyDiscoveryResult } from "../../../types/company";
import { RawJobData } from "../../../types/job";
import { fetchUrl } from "../../../utils/httpClient";

export async function scrapeSmartRecruiters(companyInfo: CompanyDiscoveryResult): Promise<RawJobData[]> {
  let slug = companyInfo.companySlug;
  const cleanNameSlug = (companyInfo.companyName || "").replace(/[^a-zA-Z0-9]/g, "");

  if (!slug || slug.toLowerCase() === "job-widget" || slug.toLowerCase() === "widget") {
    slug = cleanNameSlug;
  }

  let apiUrl = companyInfo.apiUrl;
  if (!apiUrl || apiUrl.includes("/job-widget/")) {
    apiUrl = `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`;
  } else if (!apiUrl.includes("limit=")) {
    apiUrl = apiUrl.includes("?") ? `${apiUrl}&limit=100` : `${apiUrl}?limit=100`;
  }

  let res = await fetchUrl(apiUrl);

  // If first attempt returned 0 jobs or failed, try cleanNameSlug fallback if different
  if (
    (!res.ok || !res.data || !Array.isArray(res.data.content) || res.data.content.length === 0) &&
    cleanNameSlug &&
    cleanNameSlug.toLowerCase() !== slug?.toLowerCase()
  ) {
    const fallbackUrl = `https://api.smartrecruiters.com/v1/companies/${cleanNameSlug}/postings?limit=100`;
    const fallbackRes = await fetchUrl(fallbackUrl);
    if (
      fallbackRes.ok &&
      fallbackRes.data &&
      Array.isArray(fallbackRes.data.content) &&
      fallbackRes.data.content.length > 0
    ) {
      res = fallbackRes;
      slug = cleanNameSlug;
    }
  }

  if (!res.ok || !res.data || !Array.isArray(res.data.content)) {
    return [];
  }

  // Concurrently fetch job descriptions (cap concurrency to 10)
  const limit = pLimit(10);
  const jobs: RawJobData[] = await Promise.all(
    res.data.content.map((j: any) =>
      limit(async () => {
        let desc = "";
        let reqs = "";
        let jobUrl = `https://jobs.smartrecruiters.com/${slug}/${j.id}`;

        try {
          const detailRes = await fetchUrl(
            `https://api.smartrecruiters.com/v1/companies/${slug}/postings/${j.id}`,
            { timeout: 3500 }
          );
          if (detailRes.ok && detailRes.data) {
            const sections = detailRes.data.jobAd?.sections;
            desc = sections?.jobDescription?.text || "";
            reqs = sections?.qualifications?.text || "";
            if (detailRes.data.postingUrl) {
              jobUrl = detailRes.data.postingUrl;
            }
          }
        } catch {}

        return {
          title: j.name,
          company: companyInfo.companyName,
          url: jobUrl,
          id: String(j.id || ""),
          location: [j.location?.city, j.location?.region, j.location?.country].filter(Boolean).join(", "),
          department: j.department?.label || "",
          employment_type: j.typeOfEmployment?.label || "",
          posted_date: j.releasedDate,
          description: desc || null,
          requirements: reqs || null,
          ats: "SmartRecruiters",
          metadata: {
            refNumber: j.refNumber,
          },
        };
      })
    )
  );

  return jobs;
}
