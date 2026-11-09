import { NormalizedJob, JobValidationResult, RejectedJobRecord } from "../types/job";

export class JobValidator {
  /**
   * Validates a single normalized job.
   * Required minimum fields: company_name, job_title, job_url.
   */
  public static validate(job: NormalizedJob): JobValidationResult {
    if (!job.company_name || job.company_name.trim().length === 0 || job.company_name === "Unknown Company") {
      return {
        valid: false,
        reason: "Missing or invalid company_name",
        job,
      };
    }

    if (!job.job_title || job.job_title.trim().length < 3) {
      return {
        valid: false,
        reason: "Missing or too short job_title",
        job,
      };
    }

    const trimmedTitle = job.job_title.trim();
    const INVALID_TITLES_REGEX = /^(careers|current vacancies|all vacancies|latest vacancies|view our vacancies|vacancies|jobs|search jobs|find a job|browse jobs|work with us|work for us|join us|job search|saved jobs|sign in|login|register|clear all|apply now|read more|view all|view all categories|see more|load more|home|about us|contact us|privacy policy|cookie policy|terms and conditions|terms of use|leadership|academic|support|teaching and training|how to apply|benefits|faq|college homepage|view profile|jobs by email|jobs by rss|email service|skip to main content)$/i;
    if (INVALID_TITLES_REGEX.test(trimmedTitle)) {
      return {
        valid: false,
        reason: `Navigational title rejected: ${trimmedTitle}`,
        job,
      };
    }

    // Reject category listings with counts like "Academic (5)", "Leadership (2)", "Support (9)"
    if (/^[a-z\s&-]+\s*\(\d+\)$/i.test(trimmedTitle)) {
      return {
        valid: false,
        reason: `Category index with count rejected: ${trimmedTitle}`,
        job,
      };
    }

    // Reject plural category headers like "Accountant jobs", "Engineering vacancies"
    if (/^[a-z\s&-]+\s+(?:jobs|vacancies|positions|opportunities)$/i.test(trimmedTitle) && !/\d/.test(trimmedTitle)) {
      return {
        valid: false,
        reason: `Plural category index title rejected: ${trimmedTitle}`,
        job,
      };
    }

    // Reject informational / navigation action phrases
    if (/^(?:to view vacancies|view our current vacancies|full list of current opportunities|search results|jobs by category|browse by category|back to vacancies|return to vacancies|view all vacancies)/i.test(trimmedTitle)) {
      return {
        valid: false,
        reason: `Navigation action title rejected: ${trimmedTitle}`,
        job,
      };
    }

    if (!job.job_url || job.job_url.trim().length === 0) {
      return {
        valid: false,
        reason: "Missing or empty job_url",
        job,
      };
    }

    // Verify job_url is a well-formed http(s) URL
    try {
      const parsed = new URL(job.job_url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return {
          valid: false,
          reason: `Invalid URL protocol in job_url: ${job.job_url}`,
          job,
        };
      }

      const pathname = parsed.pathname.toLowerCase();
      const search = parsed.search.toLowerCase();

      // Reject social or third-party company directory links
      if (parsed.hostname.includes("linkedin.com") || parsed.hostname.includes("facebook.com") || parsed.hostname.includes("twitter.com") || parsed.hostname.includes("instagram.com")) {
        return {
          valid: false,
          reason: `External social/profile URL rejected: ${job.job_url}`,
          job,
        };
      }

      // Reject top-level plural directory URLs like Vacancies.aspx, /jobs/, /vacancies/
      if (pathname.endsWith("/vacancies.aspx") || pathname.endsWith("/jobs.aspx") || pathname.endsWith("/careers.aspx")) {
        // If it doesn't have a specific job ref parameter
        if (!search.includes("ref=") && !search.includes("id=") && !search.includes("vacancyid=") && !search.includes("jid=")) {
          return {
            valid: false,
            reason: `Directory/listing index URL rejected: ${job.job_url}`,
            job,
          };
        }
      }

      // Reject category query params like vacancies.aspx?cat=923 or ?cat=-1 when no job ref is present
      if (/[?&](?:cat|category|sector|department|page)=\d+/i.test(parsed.search)) {
        if (!search.includes("ref=") && !search.includes("id=") && !search.includes("vacancyid=") && !search.includes("jid=")) {
          return {
            valid: false,
            reason: `Category filter URL rejected: ${job.job_url}`,
            job,
          };
        }
      }

      // Reject non-job utility pages
      if (/\/(?:subs|rss|cookies|terms|contact|logon|registration|faq)\b/i.test(pathname)) {
        return {
          valid: false,
          reason: `Non-job utility URL rejected: ${job.job_url}`,
          job,
        };
      }

      // Reject plural job category URLs like /jobs/accountant-jobs/
      if (/\/(?:jobs|vacancies|careers)\/[a-z-]+-(?:jobs|vacancies)\/?$/i.test(pathname)) {
        return {
          valid: false,
          reason: `Category index path rejected: ${job.job_url}`,
          job,
        };
      }
    } catch {
      return {
        valid: false,
        reason: `Malformed job_url: ${job.job_url}`,
        job,
      };
    }

    return {
      valid: true,
      job,
    };
  }

  /**
   * Validates a list of jobs, partitioning into valid jobs and rejected records.
   */
  public static validateBatch(jobs: NormalizedJob[]): {
    validJobs: NormalizedJob[];
    invalidJobs: RejectedJobRecord[];
  } {
    const validJobs: NormalizedJob[] = [];
    const invalidJobs: RejectedJobRecord[] = [];

    for (const job of jobs) {
      const result = this.validate(job);
      if (result.valid) {
        validJobs.push(result.job);
      } else {
        invalidJobs.push({
          job: result.job,
          reason: result.reason || "Validation failed",
          rejected_at: new Date().toISOString(),
        });
      }
    }

    return { validJobs, invalidJobs };
  }
}
