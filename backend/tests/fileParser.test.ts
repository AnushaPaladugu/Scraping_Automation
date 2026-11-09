import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";
import { parseCompanyFile } from "../src/utils/fileParser";

describe("File Parser", () => {
  const sampleExcelPath = path.resolve(__dirname, "../../41_companies(2nd batch).xlsx");

  it("should parse 41_companies(2nd batch).xlsx directly with 41 valid companies", async () => {
    if (!fs.existsSync(sampleExcelPath)) {
      console.warn("Sample file 41_companies(2nd batch).xlsx not found at:", sampleExcelPath);
      return;
    }

    const result = await parseCompanyFile(sampleExcelPath);
    expect(result.detectedColumn).toBe("company");
    expect(result.totalRows).toBe(41);
    expect(result.validCompanies.length).toBe(41);
    expect(result.invalidRows.length).toBe(0);

    // Verify first company
    const first = result.validCompanies[0];
    expect(first.companyName).toBe("Harvester - St Catherines");
    expect(first.companyUrl).toBe("https://www.harvester.co.uk/restaurants/wales/harvesterstcatherineswalkcarmarthen");
    expect(first.careerUrl).toBe("https://www.harvester.co.uk/restaurants/wales/harvesterstcatherineswalkcarmarthen/jobs#/");
    expect(first.country).toBe("GB");

    // Verify Alan Turing Institute
    const alanTuring = result.validCompanies.find((c) => c.companyName.includes("Alan Turing"));
    expect(alanTuring).toBeDefined();
    expect(alanTuring?.careerUrl).toBe("https://alanturinginstituteweb.eploy.net/vacancies/vacancy-search-results.aspx");
  });

  it("should handle multer temporary file path without extension when originalFilename is provided", async () => {
    if (!fs.existsSync(sampleExcelPath)) return;

    // Simulate multer saving file with random hash name without extension
    const tempFilePath = path.join(os.tmpdir(), `test_upload_no_ext_${Date.now()}`);
    fs.copyFileSync(sampleExcelPath, tempFilePath);

    try {
      const result = await parseCompanyFile(tempFilePath, "41_companies(2nd batch).xlsx");
      expect(result.detectedColumn).toBe("company");
      expect(result.validCompanies.length).toBe(41);
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  });

  it("should parse CSV files properly", async () => {
    const tempCsvPath = path.join(os.tmpdir(), `test_companies_${Date.now()}.csv`);
    const csvContent = `company_name,website,career_url,country
Google,https://google.com,https://careers.google.com,US
Microsoft,https://microsoft.com,https://careers.microsoft.com,US
`;
    fs.writeFileSync(tempCsvPath, csvContent, "utf-8");

    try {
      const result = await parseCompanyFile(tempCsvPath, "companies.csv");
      expect(result.validCompanies.length).toBe(2);
      expect(result.validCompanies[0].companyName).toBe("Google");
      expect(result.validCompanies[0].careerUrl).toBe("https://careers.google.com");
      expect(result.validCompanies[1].companyName).toBe("Microsoft");
    } finally {
      if (fs.existsSync(tempCsvPath)) {
        fs.unlinkSync(tempCsvPath);
      }
    }
  });

  it("should reject unsupported file extensions gracefully", async () => {
    const dummyPath = path.join(os.tmpdir(), `dummy_${Date.now()}.pdf`);
    fs.writeFileSync(dummyPath, "dummy content", "utf-8");

    try {
      await expect(parseCompanyFile(dummyPath, "file.pdf")).rejects.toThrow("Unsupported file extension: .pdf");
    } finally {
      if (fs.existsSync(dummyPath)) {
        fs.unlinkSync(dummyPath);
      }
    }
  });
});
