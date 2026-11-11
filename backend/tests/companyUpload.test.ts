import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";

const { mockS3, mockRepo } = vi.hoisted(() => ({
  mockS3: {
    isAvailable: vi.fn(),
    uploadBuffer: vi.fn(),
    getPresignedDownloadUrl: vi.fn(),
    deleteFile: vi.fn(),
  },
  mockRepo: {
    createUploadedFileWithRows: vi.fn(),
    listUploadedFiles: vi.fn(),
    getUploadedFileById: vi.fn(),
    getUploadedFileWithRows: vi.fn(),
    deleteUploadedFile: vi.fn(),
  },
}));

vi.mock("../src/storage/s3.service", () => ({
  s3Service: mockS3,
}));

vi.mock("../src/db/uploadRepository", () => ({
  uploadRepository: mockRepo,
}));

import { CompanyController } from "../src/controllers/company.controller";

function createMockResponse() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  return res as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    redirect: ReturnType<typeof vi.fn>;
  };
}

describe("CompanyController Upload Endpoints (S3 + Drizzle)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should upload to S3 and persist file + rows in MySQL when S3 is enabled", async () => {
    mockS3.isAvailable.mockReturnValue(true);
    mockS3.uploadBuffer.mockResolvedValue({
      bucket: "test-bucket",
      key: "bulk-uploads/2026-11-10/uuid-companies.csv",
      etag: "etag-1",
      size: 42,
      contentType: "text/csv",
      uploadedAt: "2026-11-10T10:00:00.000Z",
    });
    mockS3.getPresignedDownloadUrl.mockResolvedValue("https://s3.example.com/download");
    mockRepo.createUploadedFileWithRows.mockResolvedValue({
      id: "upload-123",
      originalFilename: "companies.csv",
      storageStatus: "stored",
    });

    const csvBuf = Buffer.from("company_name,country\nGitLab,US\n", "utf-8");
    const req = {
      file: {
        originalname: "companies.csv",
        mimetype: "text/csv",
        size: csvBuf.length,
        buffer: csvBuf,
      },
    } as unknown as Request;
    const res = createMockResponse();

    await CompanyController.uploadCompanies(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockS3.uploadBuffer).toHaveBeenCalledTimes(1);
    expect(mockRepo.createUploadedFileWithRows).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFilename: "companies.csv",
        s3Bucket: "test-bucket",
        s3Key: "bulk-uploads/2026-11-10/uuid-companies.csv",
        storageStatus: "stored",
        validCount: 1,
        invalidCount: 0,
      })
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.uploadId).toBe("upload-123");
    expect(payload.storageStatus).toBe("stored");
    expect(payload.s3.downloadUrl).toBe("https://s3.example.com/download");
    expect(payload.companies[0].companyName).toBe("GitLab");
  });

  it("should gracefully skip S3 and persist to MySQL when S3 is not configured", async () => {
    mockS3.isAvailable.mockReturnValue(false);
    mockRepo.createUploadedFileWithRows.mockResolvedValue({
      id: "upload-456",
      originalFilename: "companies.csv",
      storageStatus: "skipped",
    });

    const csvBuf = Buffer.from("company_name\nStripe\n", "utf-8");
    const req = {
      file: {
        originalname: "companies.csv",
        mimetype: "text/csv",
        size: csvBuf.length,
        buffer: csvBuf,
      },
    } as unknown as Request;
    const res = createMockResponse();

    await CompanyController.uploadCompanies(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockS3.uploadBuffer).not.toHaveBeenCalled();
    expect(mockRepo.createUploadedFileWithRows).toHaveBeenCalledWith(
      expect.objectContaining({
        storageStatus: "skipped",
        s3Bucket: null,
        s3Key: null,
      })
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.storageStatus).toBe("skipped");
    expect(payload.s3).toBeNull();
    expect(payload.warning).toContain("S3 storage is not enabled");
  });

  it("should rollback S3 object if MySQL persistence fails", async () => {
    mockS3.isAvailable.mockReturnValue(true);
    mockS3.uploadBuffer.mockResolvedValue({
      bucket: "test-bucket",
      key: "bulk-uploads/orphan.csv",
      etag: "etag-2",
      size: 20,
      contentType: "text/csv",
      uploadedAt: "2026-11-10T10:00:00.000Z",
    });
    mockS3.getPresignedDownloadUrl.mockResolvedValue("https://s3.example.com/download");
    mockRepo.createUploadedFileWithRows.mockRejectedValue(new Error("DB write failed"));

    const csvBuf = Buffer.from("company_name\nStripe\n", "utf-8");
    const req = {
      file: {
        originalname: "companies.csv",
        mimetype: "text/csv",
        size: csvBuf.length,
        buffer: csvBuf,
      },
    } as unknown as Request;
    const res = createMockResponse();

    await CompanyController.uploadCompanies(req, res);

    expect(mockS3.deleteFile).toHaveBeenCalledWith("bulk-uploads/orphan.csv");
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("should delete from S3 and MySQL when deleting an upload", async () => {
    mockS3.isAvailable.mockReturnValue(true);
    mockRepo.getUploadedFileById.mockResolvedValue({
      id: "upload-123",
      s3Key: "bulk-uploads/file.csv",
    });
    mockRepo.deleteUploadedFile.mockResolvedValue({ id: "upload-123" });

    const req = { params: { id: "upload-123" } } as unknown as Request;
    const res = createMockResponse();

    await CompanyController.deleteUpload(req, res);

    expect(mockS3.deleteFile).toHaveBeenCalledWith("bulk-uploads/file.csv");
    expect(mockRepo.deleteUploadedFile).toHaveBeenCalledWith("upload-123");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should list uploads and load an upload by id", async () => {
    mockS3.isAvailable.mockReturnValue(true);
    mockRepo.listUploadedFiles.mockResolvedValue({
      total: 1,
      files: [
        {
          id: "upload-1",
          originalFilename: "list.csv",
          s3Key: "bulk-uploads/list.csv",
          storageStatus: "stored",
        },
      ],
    });
    mockRepo.getUploadedFileWithRows.mockResolvedValue({
      file: {
        id: "upload-1",
        originalFilename: "list.csv",
        s3Key: "bulk-uploads/list.csv",
        detectedColumn: "company_name",
        totalRows: 1,
        validCount: 1,
        invalidCount: 0,
      },
      companies: [{ id: 1, companyName: "Acme" }],
      invalidRows: [],
    });
    mockS3.getPresignedDownloadUrl.mockResolvedValue("https://s3.example.com/signed");

    const listRes = createMockResponse();
    await CompanyController.listUploads({ query: {} } as unknown as Request, listRes);
    expect(listRes.status).toHaveBeenCalledWith(200);
    expect(listRes.json.mock.calls[0][0].uploads[0].canDownloadFromS3).toBe(true);

    const getRes = createMockResponse();
    await CompanyController.getUploadById({ params: { id: "upload-1" } } as unknown as Request, getRes);
    expect(getRes.status).toHaveBeenCalledWith(200);
    expect(getRes.json.mock.calls[0][0].companies[0].companyName).toBe("Acme");
    expect(getRes.json.mock.calls[0][0].file.downloadUrl).toBe("https://s3.example.com/signed");
  });
});
