import { NormalizedJob } from "../types/job";

export class JobDeduplicator {
  private seenJobIds: Set<string> = new Set();
  private seenFingerprints: Set<string> = new Set();
  private seenUrls: Set<string> = new Set();

  constructor(existingJobs: NormalizedJob[] = []) {
    for (const job of existingJobs) {
      this.registerJob(job);
    }
  }

  public static normalizeUrlKey(url: string): string {
    try {
      const u = new URL(url);
      const search = new URLSearchParams();
      u.searchParams.forEach((val, key) => {
        const k = key.toLowerCase();
        if (!k.startsWith("utm_") && k !== "ref_src" && k !== "tracking" && k !== "fbclid" && k !== "gclid" && k !== "mc_cid" && k !== "mc_eid") {
          search.append(k, val.toLowerCase());
        }
      });
      const qs = search.toString() ? `?${search.toString()}` : "";
      const hash = u.hash ? u.hash.toLowerCase() : "";
      return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "") + qs + hash).toLowerCase();
    } catch {
      return url.toLowerCase().trim();
    }
  }

  public registerJob(job: NormalizedJob): void {
    if (job.job_id && job.company_name) {
      const idKey = `${job.company_name.toLowerCase()}::${job.job_id.toLowerCase()}`;
      this.seenJobIds.add(idKey);
    }
    if (job.fingerprint) {
      this.seenFingerprints.add(job.fingerprint);
    }
    if (job.job_url) {
      this.seenUrls.add(JobDeduplicator.normalizeUrlKey(job.job_url));
    }
  }

  public isDuplicate(job: NormalizedJob): boolean {
    // 1. Check ID key if ID exists
    if (job.job_id && job.company_name) {
      const idKey = `${job.company_name.toLowerCase()}::${job.job_id.toLowerCase()}`;
      if (this.seenJobIds.has(idKey)) {
        return true;
      }
    }

    // 2. Check fingerprint
    if (job.fingerprint && this.seenFingerprints.has(job.fingerprint)) {
      return true;
    }

    // 3. Check normalized URL
    if (job.job_url) {
      const urlKey = JobDeduplicator.normalizeUrlKey(job.job_url);
      const isGenericCollectionUrl = /(?:\/jobs\/?$|\/careers\/?$|\/vacancies\/?$)/i.test(job.job_url.replace(/#.*$/, ""));
      if (!isGenericCollectionUrl && this.seenUrls.has(urlKey)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Deduplicates a list of jobs, retaining only the first occurrence.
   */
  public deduplicate(jobs: NormalizedJob[]): {
    uniqueJobs: NormalizedJob[];
    duplicateCount: number;
  } {
    const uniqueJobs: NormalizedJob[] = [];
    let duplicateCount = 0;

    for (const job of jobs) {
      if (this.isDuplicate(job)) {
        duplicateCount++;
      } else {
        this.registerJob(job);
        uniqueJobs.push(job);
      }
    }

    return { uniqueJobs, duplicateCount };
  }
}
