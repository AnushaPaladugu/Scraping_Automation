import ExcelJS from "exceljs";
import { NormalizedJob } from "../types/job";
import { CompanyDiscoveryResult } from "../types/company";

export class ExcelExporter {
  /**
   * Generates an Excel workbook buffer from normalized jobs matching output_data.xlsx schema.
   */
  public static async exportJobsToBuffer(jobs: NormalizedJob[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Job Scraping Automation Platform";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Sheet1", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    // Exact headers from output_data.xlsx
    worksheet.columns = [
      { header: "jobId", key: "jobId", width: 20 },
      { header: "title", key: "title", width: 35 },
      { header: "description", key: "description", width: 50 },
      { header: "jobUrl", key: "jobUrl", width: 45 },
      { header: "postedDate", key: "postedDate", width: 16 },
      { header: "jdDeadline", key: "jdDeadline", width: 16 },
      { header: "company", key: "company", width: 25 },
      { header: "salaryRange", key: "salaryRange", width: 22 },
      { header: "employmentType", key: "employmentType", width: 18 },
      { header: "worktype", key: "worktype", width: 15 },
      { header: "location", key: "location", width: 30 },
      { header: "city", key: "city", width: 20 },
      { header: "state", key: "state", width: 20 },
      { header: "country", key: "country", width: 18 },
      { header: "ats", key: "ats", width: 18 },
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" }, // dark slate
    };
    headerRow.height = 26;
    headerRow.alignment = { vertical: "middle" };

    // Add rows
    jobs.forEach((j) => {
      worksheet.addRow({
        jobId: j.job_id || "",
        title: j.job_title,
        description: j.description || "",
        jobUrl: j.job_url,
        postedDate: j.posted_date || "",
        jdDeadline: j.closing_date || "",
        company: j.company_name,
        salaryRange: j.salary || "",
        employmentType: j.employment_type || "",
        worktype: j.remote_type || "",
        location: j.location || "",
        city: j.city || "",
        state: j.state || "",
        country: j.country || "",
        ats: j.ats || "None",
      });
    });

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  /**
   * Generates an Excel workbook buffer from company discovery results.
   */
  public static async exportCompaniesToBuffer(companies: CompanyDiscoveryResult[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Job Scraping Automation Platform";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Discovered Companies", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    worksheet.columns = [
      { header: "Company Name", key: "companyName", width: 25 },
      { header: "Official Website", key: "companyUrl", width: 35 },
      { header: "Career Website", key: "careerUrl", width: 40 },
      { header: "ATS Provider", key: "ats", width: 20 },
      { header: "ATS / Portal URL", key: "atsUrl", width: 40 },
      { header: "API URL", key: "apiUrl", width: 45 },
      { header: "Status", key: "detectionStatus", width: 15 },
      { header: "Confidence", key: "confidence", width: 14 },
      { header: "Verified", key: "verified", width: 12 },
      { header: "Method", key: "detectionMethod", width: 22 },
      { header: "Industry", key: "industry", width: 25 },
      { header: "City", key: "city", width: 18 },
      { header: "State", key: "state", width: 18 },
      { header: "Country", key: "country", width: 18 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
    headerRow.height = 26;
    headerRow.alignment = { vertical: "middle" };

    companies.forEach((c) => {
      worksheet.addRow({
        companyName: c.companyName,
        companyUrl: c.companyUrl || "N/A",
        careerUrl: c.careerUrl || "N/A",
        ats: c.ats,
        atsUrl: c.atsUrl || "N/A",
        apiUrl: c.apiUrl || "N/A",
        detectionStatus: c.detectionStatus,
        confidence: `${Math.round(c.confidence * 100)}%`,
        verified: c.verified ? "Yes" : "No",
        detectionMethod: c.detectionMethod,
        industry: c.industry || "",
        city: c.city || "",
        state: c.state || "",
        country: c.country || "",
      });
    });

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  /**
   * Generates an Excel workbook buffer from company discovery results matching the exact 12 requested columns:
   * id, company, career_url, company_url, slug, ats, public_api, public_api_data, industry, state, city, country
   */
  public static async exportCompanyDetailsToBuffer(companies: CompanyDiscoveryResult[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Job Scraping Automation Platform";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Company Details", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    worksheet.columns = [
      { header: "id", key: "id", width: 15 },
      { header: "company", key: "company", width: 30 },
      { header: "career_url", key: "career_url", width: 45 },
      { header: "company_url", key: "company_url", width: 40 },
      { header: "slug", key: "slug", width: 22 },
      { header: "ats", key: "ats", width: 20 },
      { header: "public_api", key: "public_api", width: 14 },
      { header: "public_api_data", key: "public_api_data", width: 65 },
      { header: "industry", key: "industry", width: 25 },
      { header: "state", key: "state", width: 20 },
      { header: "city", key: "city", width: 20 },
      { header: "country", key: "country", width: 20 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
    headerRow.height = 26;
    headerRow.alignment = { vertical: "middle" };

    companies.forEach((c) => {
      const atsVal = c.ats && c.ats !== "None" ? (c.ats === "Custom / In-House Portal" ? "Custom ATS" : c.ats) : "NOT_FOUND";
      const isPublicApi = !!c.public_api;
      worksheet.addRow({
        id: c.id !== undefined && c.id !== null ? c.id : "",
        company: c.company || c.companyName,
        career_url: c.careerUrl || "",
        company_url: c.companyUrl || "",
        slug: c.slug || c.companySlug || "",
        ats: atsVal,
        public_api: isPublicApi ? "TRUE" : "FALSE",
        public_api_data: isPublicApi ? c.public_api_data || "" : "",
        industry: c.industry || "",
        state: c.state || "",
        city: c.city || "",
        country: c.country || "",
      });
    });

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }
}
