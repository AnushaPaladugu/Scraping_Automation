import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "path";
import { Readable } from "stream";
import { v4 as uuidv4 } from "uuid";
import { config, isS3Configured } from "../config";
import { S3UploadResult } from "../types/storage";

export interface UploadBufferParams {
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  key?: string;
  metadata?: Record<string, string>;
}

export interface S3ObjectSummary {
  key: string;
  size: number;
  lastModified?: string;
  etag?: string;
}

function sanitizeFilename(filename: string): string {
  const baseName = path.basename(filename || "upload");
  const cleaned = baseName.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "upload";
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    throw new Error("Empty S3 response body");
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof (body as any).transformToByteArray === "function") {
    const bytes = await (body as any).transformToByteArray();
    return Buffer.from(bytes);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Unsupported S3 body stream type");
}

export class S3Service {
  private client: S3Client | null;

  constructor(customClient?: S3Client) {
    this.client = customClient ?? null;
  }

  public isAvailable(): boolean {
    return isS3Configured();
  }

  private getClient(): S3Client {
    if (this.client) {
      return this.client;
    }

    if (!isS3Configured()) {
      throw new Error(
        "S3 is not configured. Set S3_ENABLED=true, AWS_REGION, S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY."
      );
    }

    const clientConfig: S3ClientConfig = {
      region: config.S3.region,
      credentials: {
        accessKeyId: config.S3.accessKeyId,
        secretAccessKey: config.S3.secretAccessKey,
      },
      forcePathStyle: config.S3.forcePathStyle,
    };

    if (config.S3.endpoint) {
      clientConfig.endpoint = config.S3.endpoint;
    }

    this.client = new S3Client(clientConfig);
    return this.client;
  }

  public buildObjectKey(originalFilename: string, prefix: string = config.S3.uploadPrefix): string {
    const dateFolder = new Date().toISOString().slice(0, 10);
    const safeName = sanitizeFilename(originalFilename);
    const normalizedPrefix = prefix
      ? prefix.replace(/^\/+/, "").replace(/\/?$/, "/")
      : "";
    return `${normalizedPrefix}${dateFolder}/${uuidv4()}-${safeName}`;
  }

  public async uploadBuffer(params: UploadBufferParams): Promise<S3UploadResult> {
    const client = this.getClient();
    const bucket = config.S3.bucket;
    const key = params.key || this.buildObjectKey(params.originalFilename);
    const contentType = params.mimeType || "application/octet-stream";

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: params.buffer,
      ContentType: contentType,
      Metadata: {
        "original-filename": sanitizeFilename(params.originalFilename),
        ...(params.metadata || {}),
      },
    });

    const response = await client.send(command);

    return {
      bucket,
      key,
      etag: response.ETag?.replace(/"/g, ""),
      size: params.buffer.length,
      contentType,
      uploadedAt: new Date().toISOString(),
    };
  }

  public async getFileBuffer(key: string): Promise<Buffer> {
    const client = this.getClient();
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.S3.bucket,
        Key: key,
      })
    );
    return streamToBuffer(response.Body);
  }

  public async getPresignedDownloadUrl(
    key: string,
    downloadFilename?: string,
    expiresIn: number = config.S3.presignedUrlExpiresIn
  ): Promise<string> {
    const client = this.getClient();
    const safeName = downloadFilename ? sanitizeFilename(downloadFilename) : undefined;
    const command = new GetObjectCommand({
      Bucket: config.S3.bucket,
      Key: key,
      ...(safeName ? { ResponseContentDisposition: `attachment; filename="${safeName}"` } : {}),
    });
    return getSignedUrl(client, command, { expiresIn });
  }

  public async getPresignedUploadUrl(
    originalFilename: string,
    mimeType: string,
    expiresIn: number = config.S3.presignedUrlExpiresIn
  ): Promise<{ uploadUrl: string; key: string; bucket: string }> {
    const client = this.getClient();
    const bucket = config.S3.bucket;
    const key = this.buildObjectKey(originalFilename);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: mimeType || "application/octet-stream",
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn });
    return { uploadUrl, key, bucket };
  }

  public async listObjects(
    prefix: string = config.S3.uploadPrefix,
    maxKeys: number = 100
  ): Promise<S3ObjectSummary[]> {
    const client = this.getClient();
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.S3.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      })
    );

    return (response.Contents || []).map((item) => ({
      key: item.Key || "",
      size: item.Size || 0,
      lastModified: item.LastModified?.toISOString(),
      etag: item.ETag?.replace(/"/g, ""),
    }));
  }

  public async deleteFile(key: string): Promise<void> {
    const client = this.getClient();
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.S3.bucket,
        Key: key,
      })
    );
  }

  public async verifyBucketAccess(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const client = this.getClient();
      await client.send(new HeadBucketCommand({ Bucket: config.S3.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}

export const s3Service = new S3Service();
