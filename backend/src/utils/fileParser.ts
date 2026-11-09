import fs from "fs";
import csvParser from "csv-parser";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { CompanyInput } from "../types/company";

export interface ParsedCompanyFileResult {
  validCompanies: CompanyInput[];
  invalidRows: Array<{ rowNumber: number; data: any; reason: string }>;
  detectedColumn: string | null;
  totalRows: number;
  detectedSheet?: string;
}

export async function parseCompanyFile(filePath: string, originalFilename?: string): Promise<ParsedCompanyFileResult> {
  const nameToInspect = originalFilename || filePath;
  const match = nameToInspect.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match ? match[1].toLowerCase() : "";
  if (ext === "csv") {
    return parseCsvFile(filePath);
  } else {
    // XLSX, XLS, or default to Excel parser
    return parseExcelFile(filePath);
  }
}

async function parseCsvFile(filePath: string): Promise<ParsedCompanyFileResult> {
  const rows: any[] = [];

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (data) => rows.push(data))
      .on("end", () => resolve())
      .on("error", (err) => reject(err));
  });

  return processRawRows(rows);
}

const CANDIDATE_COMPANY_KEYS = [
  "company_name",
  "companyname",
  "company",
  "companyinput",
  "company_input",
  "organization",
  "client",
  "name",
  "employer",
  "firm",
];

async function parseExcelFile(filePath: string): Promise<ParsedCompanyFileResult> {
  const workbook = XLSX.readFile(filePath, { cellDates: true });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("Excel file has no worksheets.");
  }

  let bestSheetName = workbook.SheetNames[0];
  let maxRows = -1;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
    if (jsonRows.length < 2) continue;

    const firstRow = (jsonRows[0] || []) as any[];
    const headers = firstRow.map((v: any) => extractCellValue(v).trim().toLowerCase().replace(/[^a-z0-9]/g, ""));

    const matchedCol = headers.find((h: string) => CANDIDATE_COMPANY_KEYS.includes(h));
    if (matchedCol) {
      if (jsonRows.length > maxRows) {
        maxRows = jsonRows.length;
        bestSheetName = sheetName;
      }
    }
  }

  const bestSheet = workbook.Sheets[bestSheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(bestSheet, { defval: "" });

  const result = processRawRows(rows);
  result.detectedSheet = bestSheetName;
  return result;
}

export function extractCellValue(cell: any): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string") return cell.trim();
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  if (typeof cell === "object") {
    if (Array.isArray(cell.richText)) {
      return cell.richText.map((rt: any) => rt.text || "").join("").trim();
    }
    if (cell.text !== undefined && cell.text !== null) {
      if (typeof cell.text === "string" && cell.text.trim()) return cell.text.trim();
      if (typeof cell.text === "object" && Array.isArray(cell.text.richText)) {
        return cell.text.richText.map((rt: any) => rt.text || "").join("").trim();
      }
    }
    if (cell.hyperlink && typeof cell.hyperlink === "string" && cell.hyperlink.trim()) {
      return cell.hyperlink.trim();
    }
    if (cell.result !== undefined && cell.result !== null) {
      return String(cell.result).trim();
    }
  }
  return String(cell).trim();
}

function processRawRows(rows: any[]): ParsedCompanyFileResult {
  if (rows.length === 0) {
    return {
      validCompanies: [],
      invalidRows: [],
      detectedColumn: null,
      totalRows: 0,
    };
  }

  const firstRowKeys = Object.keys(rows[0]);
  let detectedColumn: string | null = null;

  for (const candidate of CANDIDATE_COMPANY_KEYS) {
    const found = firstRowKeys.find(
      (k) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === candidate.replace(/[^a-z0-9]/g, "")
    );
    if (found) {
      detectedColumn = found;
      break;
    }
  }

  if (!detectedColumn) {
    throw new Error(
      `Required company column not detected. Expected columns like 'company_name', 'company', or 'companyInput'. Found: ${firstRowKeys.join(", ")}`
    );
  }

  const validCompanies: CompanyInput[] = [];
  const invalidRows: Array<{ rowNumber: number; data: any; reason: string }> = [];

  rows.forEach((row, index) => {
    const rawVal = row[detectedColumn!];
    const companyName = extractCellValue(rawVal);

    if (!companyName) {
      invalidRows.push({
        rowNumber: index + 2,
        data: row,
        reason: `Missing or empty '${detectedColumn}' value`,
      });
      return;
    }

    // Optional supporting columns
    const id = findColumnValue(row, ["id", "company_id", "companyid", "sr_no", "sl_no", "s_no", "index"]);
    const companyUrl = findColumnValue(row, ["companyurl", "company_url", "website", "url", "domain"]);
    const careerUrl = findColumnValue(row, ["careerurl", "career_url", "careers", "jobs_url", "careers_url"]);
    const ats = findColumnValue(row, ["ats", "ats_provider", "provider"]);
    const slug = findColumnValue(row, ["slug", "company_slug"]);
    const industry = findColumnValue(row, ["industry", "sector", "category"]);
    const city = findColumnValue(row, ["city", "locality"]);
    const state = findColumnValue(row, ["state", "region", "province"]);
    const country = findColumnValue(row, ["country", "nation"]);

    validCompanies.push({
      id: id || index + 1,
      companyName,
      companyUrl,
      careerUrl,
      ats,
      slug,
      industry,
      city,
      state,
      country,
    });
  });

  return {
    validCompanies,
    invalidRows,
    detectedColumn,
    totalRows: rows.length,
  };
}

function findColumnValue(row: Record<string, any>, possibleKeys: string[]): string | undefined {
  const rowKeys = Object.keys(row);
  for (const pk of possibleKeys) {
    const matched = rowKeys.find(
      (k) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === pk.replace(/[^a-z0-9]/g, "")
    );
    if (matched && row[matched] !== undefined && row[matched] !== null) {
      const val = extractCellValue(row[matched]);
      if (val) return val;
    }
  }
  return undefined;
}
