export interface CompanyInput {
  id?: string | number;
  companyName: string;
  companyUrl?: string;
  careerUrl?: string;
  ats?: string;
  slug?: string;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
}

export type DetectionStatus = "confirmed" | "inferred" | "failed";

export interface CompanyDiscoveryResult {
  id?: string | number;
  companyName: string;
  company?: string;
  companyUrl: string | null;
  careerUrl: string | null;
  ats: string;
  atsUrl: string | null;
  companySlug?: string;
  slug?: string;
  apiUrl?: string;
  public_api?: boolean;
  public_api_data?: string;
  detectionStatus: DetectionStatus;
  confidence: number;
  detectionMethod: string;
  verified: boolean;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  error?: string;
}
