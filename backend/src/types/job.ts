export type RemoteType = "Remote" | "Hybrid" | "Onsite" | null;
export type EmploymentType = "Full-time" | "Part-time" | "Contract" | "Internship" | "Temporary" | null;

export interface NormalizedJob {
  company_name: string;
  job_title: string;
  job_url: string;
  job_id: string | null;
  location: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  remote_type: RemoteType;
  employment_type: EmploymentType;
  department: string | null;
  category: string | null;
  description: string | null;
  requirements: string | null;
  salary: string | null;
  posted_date: string | null;
  closing_date: string | null;
  ats: string | null;
  source: string;
  source_type: "api" | "jsonld" | "static" | "playwright";
  scraped_at: string;
  fingerprint: string;
  taskId?: string;
  taskIds?: string[];
  metadata?: Record<string, any>;
}

export interface RawJobData {
  title?: any;
  company?: any;
  company_name?: any;
  url?: any;
  job_url?: any;
  link?: any;
  id?: any;
  job_id?: any;
  location?: any;
  locations?: any[];
  country?: any;
  state?: any;
  city?: any;
  remote?: any;
  remote_type?: any;
  employment_type?: any;
  department?: any;
  category?: any;
  description?: any;
  requirements?: any;
  salary?: any;
  salary_range?: any;
  posted_date?: any;
  date_posted?: any;
  closing_date?: any;
  valid_through?: any;
  ats?: any;
  source?: any;
  source_type?: any;
  [key: string]: any;
}

export interface JobValidationResult {
  valid: boolean;
  reason?: string;
  job: NormalizedJob;
}

export interface RejectedJobRecord {
  job: Partial<NormalizedJob> | RawJobData;
  reason: string;
  rejected_at: string;
}
