import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";

const mockSend = vi.fn();
const mockGetSignedUrl = vi.fn();

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: any[]) => mockGetSignedUrl(...args),
}));

vi.mock("../src/config", () => ({
  config: {
    S3: {
      enabled: true,
      region: "us-east-1",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      bucket: "test-bucket",
      uploadPrefix: "bulk-uploads/",
      endpoint: undefined,
      forcePathStyle: false,
      presignedUrlExpiresIn: 3600,
    },
  },
  isS3Configured: () => true,
}));

import { S3Service } from "../src/storage/s3.service";

describe("S3Service", () => {
  let service: S3Service;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new S3Service({ send: mockSend } as any);
  });

  it("should build sanitized date-namespaced S3 keys", () => {
    const key = service.buildObjectKey("../../my messy file (1).xlsx", "bulk-uploads/");
    expect(key).toMatch(/^bulk-uploads\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]+-my_messy_file_1_.xlsx$/);
    expect(key).not.toContain("..");
  });

  it("should upload a buffer with PutObjectCommand and return metadata", async () => {
    mockSend.mockResolvedValueOnce({ ETag: '"abc123etag"' });

    const buffer = Buffer.from("company_name\nAcme\n", "utf-8");
    const result = await service.uploadBuffer({
      buffer,
      originalFilename: "companies.csv",
      mimeType: "text/csv",
      key: "bulk-uploads/test.csv",
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Bucket).toBe("test-bucket");
    expect(cmd.input.Key).toBe("bulk-uploads/test.csv");
    expect(cmd.input.ContentType).toBe("text/csv");
    expect(cmd.input.Body).toEqual(buffer);

    expect(result.bucket).toBe("test-bucket");
    expect(result.key).toBe("bulk-uploads/test.csv");
    expect(result.etag).toBe("abc123etag");
    expect(result.size).toBe(buffer.length);
  });

  it("should read object stream into a Buffer via getFileBuffer", async () => {
    const stream = Readable.from([Buffer.from("hello "), Buffer.from("world")]);
    mockSend.mockResolvedValueOnce({ Body: stream });

    const buf = await service.getFileBuffer("bulk-uploads/test.csv");
    expect(buf.toString("utf-8")).toBe("hello world");
  });

  it("should generate presigned download URLs with attachment disposition", async () => {
    mockGetSignedUrl.mockResolvedValueOnce("https://s3.example.com/signed-url");

    const url = await service.getPresignedDownloadUrl("bulk-uploads/test.csv", "companies.csv", 900);
    expect(url).toBe("https://s3.example.com/signed-url");
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    const [, command, options] = mockGetSignedUrl.mock.calls[0];
    expect(command.input.Bucket).toBe("test-bucket");
    expect(command.input.Key).toBe("bulk-uploads/test.csv");
    expect(command.input.ResponseContentDisposition).toBe('attachment; filename="companies.csv"');
    expect(options).toEqual({ expiresIn: 900 });
  });

  it("should delete objects via DeleteObjectCommand", async () => {
    mockSend.mockResolvedValueOnce({});

    await service.deleteFile("bulk-uploads/test.csv");
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].input).toEqual({
      Bucket: "test-bucket",
      Key: "bulk-uploads/test.csv",
    });
  });

  it("should list objects via ListObjectsV2Command", async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [
        {
          Key: "bulk-uploads/a.csv",
          Size: 120,
          ETag: '"e1"',
          LastModified: new Date("2026-11-10T00:00:00Z"),
        },
      ],
    });

    const items = await service.listObjects("bulk-uploads/");
    expect(items).toEqual([
      {
        key: "bulk-uploads/a.csv",
        size: 120,
        etag: "e1",
        lastModified: "2026-11-10T00:00:00.000Z",
      },
    ]);
  });
});
