import { desc, eq, asc, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "./index";
import {
  NewUploadedFileRowRecord,
  UploadedFileRecord,
  uploadedFileRows,
  uploadedFiles,
} from "./schema";
import { CompanyInput } from "../types/company";
import { UploadedFileMetadata } from "../types/storage";

const ROW_INSERT_BATCH_SIZE = 500;

export interface ParsedRowPersistenceInput {
  rowNumber: number;
  isValid: boolean;
  invalidReason?: string | null;
  company?: CompanyInput;
  rawData: Record<string, unknown>;
}

export interface CreateUploadedFileInput {
  id?: string;
  originalFilename: string;
  mimeType: string;
  fileExtension: string;
  fileSize: number;
  s3Bucket: string | null;
  s3Key: string | null;
  s3Etag: string | null;
  storageStatus: "stored" | "skipped" | "deleted";
  detectedColumn: string | null;
  detectedSheet?: string | null;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  rows: ParsedRowPersistenceInput[];
}

function toUploadedFileMetadata(row: UploadedFileRecord): UploadedFileMetadata {
  return {
    id: row.id,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    fileExtension: row.fileExtension,
    fileSize: row.fileSize,
    s3Bucket: row.s3Bucket ?? null,
    s3Key: row.s3Key ?? null,
    s3Etag: row.s3Etag ?? null,
    storageStatus: (row.storageStatus as UploadedFileMetadata["storageStatus"]) || "stored",
    detectedColumn: row.detectedColumn ?? null,
    detectedSheet: row.detectedSheet ?? null,
    totalRows: row.totalRows,
    validCount: row.validCount,
    invalidCount: row.invalidCount,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function truncateOptional(value: string | undefined | null, maxLength: number): string | null {
  if (!value) return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export class UploadRepository {
  public async createUploadedFileWithRows(
    input: CreateUploadedFileInput
  ): Promise<UploadedFileMetadata> {
    const fileId = input.id || uuidv4();

    await db.transaction(async (tx) => {
      await tx.insert(uploadedFiles).values({
        id: fileId,
        originalFilename: truncateOptional(input.originalFilename, 255) || "upload",
        mimeType: truncateOptional(input.mimeType, 150) || "application/octet-stream",
        fileExtension: truncateOptional(input.fileExtension, 16) || "",
        fileSize: input.fileSize,
        s3Bucket: input.s3Bucket,
        s3Key: input.s3Key,
        s3Etag: input.s3Etag,
        storageStatus: input.storageStatus,
        detectedColumn: input.detectedColumn,
        detectedSheet: input.detectedSheet ?? null,
        totalRows: input.totalRows,
        validCount: input.validCount,
        invalidCount: input.invalidCount,
      });

      if (input.rows.length > 0) {
        const mappedRows: NewUploadedFileRowRecord[] = input.rows.map((r) => ({
          fileId,
          rowNumber: r.rowNumber,
          isValid: r.isValid,
          invalidReason: r.invalidReason ?? null,
          externalId:
            r.company?.id !== undefined && r.company?.id !== null
              ? truncateOptional(String(r.company.id), 100)
              : null,
          companyName: truncateOptional(r.company?.companyName, 255),
          companyUrl: r.company?.companyUrl ?? null,
          careerUrl: r.company?.careerUrl ?? null,
          ats: truncateOptional(r.company?.ats, 100),
          slug: truncateOptional(r.company?.slug, 255),
          industry: truncateOptional(r.company?.industry, 150),
          city: truncateOptional(r.company?.city, 150),
          state: truncateOptional(r.company?.state, 150),
          country: truncateOptional(r.company?.country, 150),
          rawData: r.rawData,
        }));

        for (let i = 0; i < mappedRows.length; i += ROW_INSERT_BATCH_SIZE) {
          const batch = mappedRows.slice(i, i + ROW_INSERT_BATCH_SIZE);
          await tx.insert(uploadedFileRows).values(batch);
        }
      }
    });

    const created = await this.getUploadedFileById(fileId);
    if (!created) {
      throw new Error(`Failed to retrieve uploaded file record ${fileId} after insert`);
    }
    return created;
  }

  public async listUploadedFiles(
    limit: number = 50,
    offset: number = 0
  ): Promise<{ files: UploadedFileMetadata[]; total: number }> {
    const [records, countRows] = await Promise.all([
      db
        .select()
        .from(uploadedFiles)
        .orderBy(desc(uploadedFiles.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(uploadedFiles),
    ]);

    return {
      files: records.map(toUploadedFileMetadata),
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  public async getUploadedFileById(id: string): Promise<UploadedFileMetadata | null> {
    const rows = await db
      .select()
      .from(uploadedFiles)
      .where(eq(uploadedFiles.id, id))
      .limit(1);

    return rows[0] ? toUploadedFileMetadata(rows[0]) : null;
  }

  public async getUploadedFileWithRows(id: string): Promise<{
    file: UploadedFileMetadata;
    companies: CompanyInput[];
    invalidRows: Array<{ rowNumber: number; data: any; reason: string }>;
  } | null> {
    const file = await this.getUploadedFileById(id);
    if (!file) return null;

    const rows = await db
      .select()
      .from(uploadedFileRows)
      .where(eq(uploadedFileRows.fileId, id))
      .orderBy(asc(uploadedFileRows.rowNumber));

    const companies: CompanyInput[] = [];
    const invalidRows: Array<{ rowNumber: number; data: any; reason: string }> = [];

    for (const row of rows) {
      if (row.isValid && row.companyName) {
        companies.push({
          id: row.externalId ?? row.rowNumber - 1,
          companyName: row.companyName,
          companyUrl: row.companyUrl ?? undefined,
          careerUrl: row.careerUrl ?? undefined,
          ats: row.ats ?? undefined,
          slug: row.slug ?? undefined,
          industry: row.industry ?? undefined,
          city: row.city ?? undefined,
          state: row.state ?? undefined,
          country: row.country ?? undefined,
        });
      } else {
        invalidRows.push({
          rowNumber: row.rowNumber,
          data: row.rawData ?? {},
          reason: row.invalidReason || "Invalid row",
        });
      }
    }

    return { file, companies, invalidRows };
  }

  public async deleteUploadedFile(id: string): Promise<UploadedFileMetadata | null> {
    const existing = await this.getUploadedFileById(id);
    if (!existing) return null;

    await db.delete(uploadedFiles).where(eq(uploadedFiles.id, id));
    return existing;
  }
}

export const uploadRepository = new UploadRepository();
