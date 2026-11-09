import app from "./app";
import { config } from "./config";
import { logger } from "./utils/logger";

const server = app.listen(config.PORT, () => {
  logger.info(`🚀 Job Scraping Automation Server running on port ${config.PORT} [${config.NODE_ENV}]`);
  console.log(`📡 API available at http://localhost:${config.PORT}/api`);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully...");
  server.close(() => {
    logger.info("Process terminated.");
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down...");
  server.close(() => {
    logger.info("Process terminated.");
  });
});
