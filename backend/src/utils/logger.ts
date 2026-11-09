import fs from "fs";
import path from "path";
import { config } from "../config";
import { LogEntry } from "../types/storage";

class Logger {
  private logFile: string;
  private memoryLogs: LogEntry[] = [];
  private maxMemoryLogs: number = 2000;

  constructor() {
    this.logFile = path.join(config.LOGS_DIR, "system.log");
  }

  public log(entry: Omit<LogEntry, "timestamp">) {
    const fullEntry: LogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    this.memoryLogs.unshift(fullEntry);
    if (this.memoryLogs.length > this.maxMemoryLogs) {
      this.memoryLogs.pop();
    }

    const consolePrefix = `[${fullEntry.timestamp}] [${fullEntry.stage.toUpperCase()}] [${fullEntry.status.toUpperCase()}]`;
    const companyTag = fullEntry.company ? ` [${fullEntry.company}]` : "";
    const logLine = `${consolePrefix}${companyTag} ${fullEntry.message}`;

    if (fullEntry.status === "error") {
      console.error(logLine, fullEntry.details || "");
    } else if (fullEntry.status === "warning") {
      console.warn(logLine);
    } else {
      console.log(logLine);
    }

    try {
      fs.appendFileSync(this.logFile, JSON.stringify(fullEntry) + "\n", "utf8");
    } catch (e) {
      // ignore file write failure during tests
    }
  }

  public info(message: string, company?: string, details?: any) {
    this.log({ stage: "scraping", status: "info", message, company, details });
  }

  public warn(message: string, company?: string, details?: any) {
    this.log({ stage: "scraping", status: "warning", message, company, details });
  }

  public error(message: string, company?: string, details?: any) {
    this.log({ stage: "scraping", status: "error", message, company, details });
  }

  public success(message: string, company?: string, details?: any) {
    this.log({ stage: "scraping", status: "success", message, company, details });
  }

  public getRecentLogs(limit: number = 200): LogEntry[] {
    return this.memoryLogs.slice(0, limit);
  }
}

export const logger = new Logger();
