import fs from "fs";
import { Readable } from "stream";
import csvParser from "csv-parser";
import * as XLSX from "xlsx";
import { CompanyInput } from "../types/company";

export interface ParsedRowRecord {
  rowNumber: number;
  isValid: boolean;
  invalidReason?: string;
  company?: CompanyInput;
  rawData: Record<string, unknown>;
}

export interface ParsedCompanyFileResult {
  validCompanies: CompanyInput[];
  invalidRows: Array<{ rowNumber: number; data: any; reason: string }>;
  allRows: ParsedRowRecord[];
  detectedColumn: string | null;
  totalRows: number;
  detectedSheet?: string;
}

const SUPPORTED_EXTENSIONS = new Set(["csv", "xlsx", "xls"]);

export function getValidatedExtension(nameToInspect: string): string {
  const match = (nameToInspect || "").trim().match(/\.([a-zA-Z0-9]+)$/);
  const ext = match ? match[1].toLowerCase() : "";
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file extension: .${ext || "unknown"}`);
  }
  return ext;
}

export async function parseCompanyFile(filePath: string, originalFilename?: string): Promise<ParsedCompanyFileResult> {
  const ext = getValidatedExtension(originalFilename || filePath);
  if (ext === "csv") {
    return parseCsvStream(fs.createReadStream(filePath));
  }
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  return parseExcelWorkbook(workbook);
}

export async function parseCompanyBuffer(
  buffer: Buffer,
  originalFilename: string
): Promise<ParsedCompanyFileResult> {
  const ext = getValidatedExtension(originalFilename);
  if (ext === "csv") {
    return parseCsvStream(Readable.from(buffer));
  }
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  return parseExcelWorkbook(workbook);
}

async function parseCsvStream(stream: NodeJS.ReadableStream): Promise<ParsedCompanyFileResult> {
  const rows: any[] = [];

  await new Promise<void>((resolve, reject) => {
    stream
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

function parseExcelWorkbook(workbook: XLSX.WorkBook): ParsedCompanyFileResult {
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
      allRows: [],
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
  const allRows: ParsedRowRecord[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rawVal = row[detectedColumn!];
    const companyName = extractCellValue(rawVal);

    if (!companyName) {
      const reason = `Missing or empty '${detectedColumn}' value`;
      invalidRows.push({
        rowNumber,
        data: row,
        reason,
      });
      allRows.push({
        rowNumber,
        isValid: false,
        invalidReason: reason,
        rawData: row,
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

    const company: CompanyInput = {
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
    };

    validCompanies.push(company);
    allRows.push({
      rowNumber,
      isValid: true,
      company,
      rawData: row,
    });
  });

  return {
    validCompanies,
    invalidRows,
    allRows,
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
