import pLimit from "p-limit";
import { taskManager } from "./taskManager";
import { CompanyInput, CompanyDiscoveryResult } from "../types/company";
import { CompanyDiscoveryService } from "../discovery/companyDiscovery.service";
import { ScrapingStrategyEngine } from "../scrapers/strategyEngine";
import { storageService } from "../storage/fileStorage.service";
import { config } from "../config";
import { logger } from "../utils/logger";
import { withRetry } from "../utils/retry";
import { ScrapeFilters } from "../types/scraper";

export class BulkScrapingRunner {
  private static strategyEngine = new ScrapingStrategyEngine();

  public static async run(
    taskId: string,
    companyInputs: CompanyInput[],
    filters?: ScrapeFilters
  ): Promise<void> {
    const limit = pLimit(config.SCRAPER_CONCURRENCY);

    await taskManager.updateTask(taskId, (t) => {
      t.status = "processing";
      t.startedAt = new Date().toISOString();
    });

    logger.info(`Starting bulk scraping execution for Task ${taskId} with ${companyInputs.length} companies`);

    const promises = companyInputs.map((input, index) =>
      limit(async () => {
        if (taskManager.isCancelled(taskId)) {
          return;
        }

        const companyName = input.companyName;
        const progressStart = new Date().toISOString();

        // 1. Mark as discovering
        await taskManager.updateTask(taskId, (t) => {
          t.companies[index].status = "discovering";
          t.companies[index].startedAt = progressStart;
        });

        let discovery: CompanyDiscoveryResult;
        try {
          const alreadyVerified = (input as any).verified && (input.careerUrl || input.companyUrl);
          if (alreadyVerified && (input as any).ats) {
            discovery = {
              companyName: input.companyName,
              companyUrl: input.companyUrl || null,
              careerUrl: input.careerUrl || null,
              ats: (input as any).ats || "None",
              atsUrl: (input as any).atsUrl || null,
              companySlug: (input as any).companySlug,
              apiUrl: (input as any).apiUrl,
              detectionStatus: (input as any).detectionStatus || "confirmed",
              confidence: (input as any).confidence || 1.0,
              detectionMethod: (input as any).detectionMethod || "pre_discovered",
              verified: true,
              industry: input.industry,
              city: input.city,
              state: input.state,
              country: input.country,
            };
          } else {
            discovery = await withRetry(() => CompanyDiscoveryService.discover(input), {
              maxRetries: 1,
              initialDelayMs: 500,
            });
          }
          await storageService.saveCompanies([discovery]);
        } catch (err: any) {
          logger.error(`Company discovery failed: ${err.message}`, companyName);
          await taskManager.updateTask(taskId, (t) => {
            t.companies[index].status = "failed";
            t.companies[index].error = `Discovery failed: ${err.message}`;
            t.companies[index].completedAt = new Date().toISOString();
            t.processedCompanies++;
            t.failedCompanies++;
          });
          return;
        }

        // If company discovery failed to find anything
        if (discovery.detectionStatus === "failed" && !discovery.careerUrl && !discovery.companyUrl) {
          await taskManager.updateTask(taskId, (t) => {
            t.companies[index].status = "failed";
            t.companies[index].error = discovery.error || "Company or career website not found";
            t.companies[index].completedAt = new Date().toISOString();
            t.processedCompanies++;
            t.failedCompanies++;
          });
          return;
        }

        // 2. Mark as scraping
        await taskManager.updateTask(taskId, (t) => {
          t.companies[index].status = "scraping";
          t.companies[index].ats = discovery.ats;
          t.companies[index].careerUrl = discovery.careerUrl || discovery.companyUrl || undefined;
        });

        // 3. Execute Scraping Strategy
        try {
          const result = await this.strategyEngine.execute(discovery, filters);

          // Save extracted jobs
          if (result.jobs.length > 0) {
            result.jobs.forEach((j) => {
              j.taskId = taskId;
            });
            await storageService.saveTaskJobs(taskId, result.jobs);
            await storageService.saveJobs(result.jobs);
          }
          if (result.invalidJobs.length > 0) {
            await storageService.saveRejectedJobs(result.invalidJobs);
          }

          await taskManager.updateTask(taskId, (t) => {
            const comp = t.companies[index];
            comp.scrapingStatus = result.status;
            comp.method = result.method;
            comp.jobsFound = result.totalJobs;
            comp.validJobsCount = result.jobs.length;
            comp.invalidJobsCount = result.invalidJobs.length;
            comp.completedAt = new Date().toISOString();
            comp.error = result.error;

            t.processedCompanies++;
            t.totalJobsExtracted += result.totalJobs;
            t.totalValidJobs += result.jobs.length;
            t.totalInvalidJobs += result.invalidJobs.length;
            t.breakdownByMethod[result.method] += result.totalJobs;

            if (result.status === "SUCCESS" || result.status === "PARTIAL_SUCCESS") {
              comp.status = "completed";
              t.successfulCompanies++;
            } else if (result.status === "NO_JOBS") {
              comp.status = "no_jobs";
              t.noJobsCompanies++;
            } else {
              comp.status = "failed";
              t.failedCompanies++;
            }
          });
        } catch (err: any) {
          logger.error(`Scraping execution failed: ${err.message}`, companyName);
          await taskManager.updateTask(taskId, (t) => {
            t.companies[index].status = "failed";
            t.companies[index].error = `Scraping error: ${err.message}`;
            t.companies[index].completedAt = new Date().toISOString();
            t.processedCompanies++;
            t.failedCompanies++;
          });
        }
      })
    );

    await Promise.all(promises);

    await taskManager.updateTask(taskId, (t) => {
      if (t.status !== "stopped") {
        t.status = "completed";
      }
      t.completedAt = new Date().toISOString();
    });

    logger.info(`Task ${taskId} completed! Total companies processed: ${companyInputs.length}`);
  }
}
