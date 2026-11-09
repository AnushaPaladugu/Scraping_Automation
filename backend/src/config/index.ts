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
};
