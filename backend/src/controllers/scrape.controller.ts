import { Request, Response } from "express";
import { ScrapingStrategyEngine } from "../scrapers/strategyEngine";
import { taskManager } from "../tasks/taskManager";
import { BulkScrapingRunner } from "../tasks/bulkScrapingRunner";
import { storageService } from "../storage/fileStorage.service";
import { logger } from "../utils/logger";

const strategyEngine = new ScrapingStrategyEngine();

export class ScrapeController {
  public static async scrapeSingleCompany(req: Request, res: Response) {
    try {
      const { companyInfo, filters } = req.body;
      if (!companyInfo || !companyInfo.companyName) {
        return res.status(400).json({ error: "companyInfo with companyName is required" });
      }

      logger.info(`Single company scrape requested for ${companyInfo.companyName}`);
      const result = await strategyEngine.execute(companyInfo, filters);

      if (result.jobs.length > 0) {
        await storageService.saveJobs(result.jobs);
      }
      if (result.invalidJobs.length > 0) {
        await storageService.saveRejectedJobs(result.invalidJobs);
      }

      return res.status(200).json(result);
    } catch (err: any) {
      logger.error(`Error in scrapeSingleCompany: ${err.message}`);
      return res.status(500).json({ error: err.message || "Scraping failed" });
    }
  }

  public static async startBulkScrape(req: Request, res: Response) {
    try {
      const { companies, filters, sourceUploadId, sourceFilename } = req.body;
      if (!Array.isArray(companies) || companies.length === 0) {
        return res.status(400).json({ error: "companies array is required" });
      }

      const task = taskManager.createTask(companies, {
        sourceUploadId: typeof sourceUploadId === "string" ? sourceUploadId : undefined,
        sourceFilename: typeof sourceFilename === "string" ? sourceFilename : undefined,
      });
      logger.info(`Created bulk scraping task ${task.taskId} with ${companies.length} companies`);

      // Fire and run asynchronously (does not block HTTP response)
      BulkScrapingRunner.run(task.taskId, companies, filters).catch((err) => {
        logger.error(`Error in bulk scraping execution ${task.taskId}: ${err.message}`);
      });

      return res.status(202).json({
        taskId: task.taskId,
        status: task.status,
        totalCompanies: task.totalCompanies,
        message: "Bulk scraping task queued successfully",
      });
    } catch (err: any) {
      logger.error(`Error in startBulkScrape: ${err.message}`);
      return res.status(500).json({ error: err.message || "Failed to start bulk scrape" });
    }
  }

  public static async getScrapeStatus(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      const task = taskManager.getTask(jobId);

      if (!task) {
        const stored = await storageService.getScrapingTask(jobId);
        if (stored) {
          return res.status(200).json(stored);
        }
        return res.status(404).json({ error: `Task not found with ID: ${jobId}` });
      }

      return res.status(200).json(task);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  public static async cancelScrape(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      const stopped = taskManager.stopTask(jobId);
      if (!stopped) {
        return res.status(404).json({ error: "Task not found or already completed" });
      }
      return res.status(200).json({ message: "Task stopped successfully", taskId: jobId });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  public static async listTasks(req: Request, res: Response) {
    try {
      const tasks = await taskManager.getAllTasks();
      return res.status(200).json({ total: tasks.length, tasks });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
}
