import app from "./app";
import { config, isS3Configured } from "./config";
import { checkDbConnection, closeDb } from "./db";
import { logger } from "./utils/logger";

const server = app.listen(config.PORT, async () => {
  logger.info(`🚀 Job Scraping Automation Server running on port ${config.PORT} [${config.NODE_ENV}]`);
  console.log(`📡 API available at http://localhost:${config.PORT}/api`);

  const dbOk = await checkDbConnection();
  logger.info(`MySQL connection (${config.DB.host}:${config.DB.port}/${config.DB.database}): ${dbOk ? "connected" : "unavailable"}`);
  logger.info(`S3 storage: ${isS3Configured() ? `enabled (bucket: ${config.S3.bucket})` : "disabled / unconfigured (DB-only fallback)"}`);
});

const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully...`);
  server.close(async () => {
    try {
      await closeDb();
    } catch {}
    logger.info("Process terminated.");
  });
};

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});
