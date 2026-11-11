import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || "./data");
const OUTPUT_DIRECTORY = path.resolve(process.cwd(), process.env.OUTPUT_DIRECTORY || "./exports");
const LOGS_DIR = path.resolve(process.cwd(), "./logs");

// Ensure operational directories exist
[DATA_DIR, OUTPUT_DIRECTORY, LOGS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const rawUploadPrefix = (process.env.S3_UPLOAD_PREFIX || "bulk-uploads/").trim().replace(/^\/+/, "");
const normalizedUploadPrefix = rawUploadPrefix
  ? rawUploadPrefix.endsWith("/")
    ? rawUploadPrefix
    : `${rawUploadPrefix}/`
  : "";

export const config = {
  PORT: parseInt(process.env.PORT || "5000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  SCRAPER_TIMEOUT: parseInt(process.env.SCRAPER_TIMEOUT || "15000", 10),
  SCRAPER_CONCURRENCY: parseInt(process.env.SCRAPER_CONCURRENCY || "5", 10),
  PLAYWRIGHT_HEADLESS: process.env.PLAYWRIGHT_HEADLESS !== "false",
  DATA_DIR,
  OUTPUT_DIRECTORY,
  LOGS_DIR,
  USER_AGENT:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  DB: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "scraping_automation",
  },
  S3: {
    enabled: process.env.S3_ENABLED === "true",
    region: process.env.AWS_REGION || "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    bucket: process.env.S3_BUCKET_NAME || "",
    uploadPrefix: normalizedUploadPrefix,
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    presignedUrlExpiresIn: parseInt(process.env.S3_PRESIGNED_URL_EXPIRES_IN || "3600", 10),
  },
};

export function isDbConfigured(): boolean {
  return Boolean(config.DB.host && config.DB.user && config.DB.database);
}

export function isS3Configured(): boolean {
  return Boolean(
    config.S3.enabled &&
      config.S3.bucket &&
      config.S3.region &&
      config.S3.accessKeyId &&
      config.S3.secretAccessKey
  );
}
