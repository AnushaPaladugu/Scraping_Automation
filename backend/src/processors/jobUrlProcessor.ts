export interface ProcessedJobUrl {
  jobUrl: string;
  jobId: string | null;
}

export function processJobUrl(rawUrl: any, rawJobId?: any, baseUrl?: string): ProcessedJobUrl {
  let url = rawUrl ? String(rawUrl).trim() : "";
  let jobId = rawJobId ? String(rawJobId).trim() : null;
  if (jobId && (/^[a-z]+(-[a-z]+)+$/i.test(jobId) || (!/\d/.test(jobId) && jobId.includes("-")))) {
    jobId = null;
  }

  if (!url) {
    return { jobUrl: "", jobId: null };
  }

  // Resolve relative URLs if baseUrl provided
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    if (baseUrl) {
      try {
        url = new URL(url, baseUrl).toString();
      } catch {
        url = `https://${url.replace(/^\/+/, "")}`;
      }
    } else {
      url = `https://${url.replace(/^\/+/, "")}`;
    }
  }

  // Extract Job ID from URL if not already provided
  if (!jobId) {
    try {
      const parsed = new URL(url);

      // 1. Check query parameters
      const qId =
        parsed.searchParams.get("vacancyid") ||
        parsed.searchParams.get("VacancyID") ||
        parsed.searchParams.get("ref") ||
        parsed.searchParams.get("pid") ||
        parsed.searchParams.get("gh_jid") ||
        parsed.searchParams.get("id") ||
        parsed.searchParams.get("jobId") ||
        parsed.searchParams.get("job_id") ||
        parsed.searchParams.get("jid") ||
        parsed.searchParams.get("reqId") ||
        parsed.searchParams.get("req_id");

      if (qId) {
        jobId = qId;
      } else {
        const INVALID_JOB_IDS = new Set([
          "job",
          "jobs",
          "career",
          "careers",
          "position",
          "positions",
          "detail",
          "details",
          "posting",
          "postings",
          "vacancy",
          "vacancies",
          "apply",
          "view",
          "search",
          "results",
          "overview",
          "index",
          "all",
        ]);

        const isLikelySlug = (str: string): boolean => {
          if (/^[a-z]+(-[a-z]+)+$/i.test(str)) return true;
          if ((str.match(/-/g) || []).length >= 2 && !/\d/.test(str)) return true;
          return false;
        };

        const isLikelyJobId = (str: string): boolean => {
          if (!str) return false;
          if (INVALID_JOB_IDS.has(str.toLowerCase())) return false;
          if (isLikelySlug(str)) return false;
          if (/^\d+$/.test(str)) return true;
          if (/^[a-f0-9]{8,}(-[a-f0-9]{4,}){0,4}$/i.test(str)) return true;
          if (/^[a-z0-9_\/-]{2,25}$/i.test(str) && /\d/.test(str)) return true;
          return false;
        };

        const pathSegments = parsed.pathname.split("/").filter(Boolean);

        // Check if the last path segment is a numeric ID, UUID or valid requisition code
        if (pathSegments.length > 0) {
          const last = pathSegments[pathSegments.length - 1];
          if (isLikelyJobId(last)) {
            jobId = last;
          }
        }

        // If not found, scan segments after job/posting/vacancy markers
        if (!jobId) {
          for (let i = 0; i < pathSegments.length; i++) {
            const seg = pathSegments[i].toLowerCase();
            if (
              (seg === "jobs" ||
                seg === "job" ||
                seg === "details" ||
                seg === "posting" ||
                seg === "positions" ||
                seg === "vacancy") &&
              i + 1 < pathSegments.length
            ) {
              const next = pathSegments[i + 1];
              if (next && isLikelyJobId(next)) {
                jobId = next;
                break;
              }
            }
          }
        }

        if (jobId && !isLikelyJobId(jobId)) {
          jobId = null;
        }
      }

      // Clean query params (remove utm_*, ref_src, tracking, etc.)
      const cleanParams = new URLSearchParams();
      parsed.searchParams.forEach((val, key) => {
        const lowerKey = key.toLowerCase();
        if (
          !lowerKey.startsWith("utm_") &&
          lowerKey !== "ref_src" &&
          lowerKey !== "tracking" &&
          lowerKey !== "fbclid" &&
          lowerKey !== "gclid" &&
          lowerKey !== "mc_cid" &&
          lowerKey !== "mc_eid"
        ) {
          cleanParams.append(key, val);
        }
      });

      parsed.search = cleanParams.toString();
      url = parsed.toString();
    } catch {
      // keep raw cleaned string
    }
  }

  return {
    jobUrl: url,
    jobId: jobId || null,
  };
}
