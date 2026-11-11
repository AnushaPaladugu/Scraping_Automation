import { v4 as uuidv4 } from "uuid";
import { BulkScrapingTask, CompanyTaskProgress } from "../types/task";
import { CompanyInput } from "../types/company";
import { storageService } from "../storage/fileStorage.service";

class TaskManager {
  private activeTasks: Map<string, BulkScrapingTask> = new Map();
  private cancelFlags: Map<string, boolean> = new Map();

  public createTask(
    companies: CompanyInput[],
    sourceInfo?: { sourceUploadId?: string; sourceFilename?: string }
  ): BulkScrapingTask {
    const taskId = uuidv4();
    const taskCompanies: CompanyTaskProgress[] = companies.map((c) => ({
      companyName: c.companyName,
      status: "queued",
      jobsFound: 0,
      validJobsCount: 0,
      invalidJobsCount: 0,
    }));

    const task: BulkScrapingTask = {
      taskId,
      status: "queued",
      ...(sourceInfo?.sourceUploadId ? { sourceUploadId: sourceInfo.sourceUploadId } : {}),
      ...(sourceInfo?.sourceFilename ? { sourceFilename: sourceInfo.sourceFilename } : {}),
      totalCompanies: companies.length,
      processedCompanies: 0,
      successfulCompanies: 0,
      noJobsCompanies: 0,
      failedCompanies: 0,
      totalJobsExtracted: 0,
      totalValidJobs: 0,
      totalInvalidJobs: 0,
      breakdownByMethod: {
        api: 0,
        jsonld: 0,
        static: 0,
        playwright: 0,
      },
      companies: taskCompanies,
      createdAt: new Date().toISOString(),
    };

    this.activeTasks.set(taskId, task);
    this.cancelFlags.set(taskId, false);
    storageService.saveScrapingRun(task);

    return task;
  }

  public getTask(taskId: string): BulkScrapingTask | null {
    return this.activeTasks.get(taskId) || null;
  }

  public async updateTask(taskId: string, updater: (task: BulkScrapingTask) => void): Promise<void> {
    const task = this.activeTasks.get(taskId);
    if (!task) return;

    updater(task);
    await storageService.saveScrapingRun(task);
  }

  public stopTask(taskId: string): boolean {
    if (this.activeTasks.has(taskId)) {
      this.cancelFlags.set(taskId, true);
      const task = this.activeTasks.get(taskId)!;
      task.status = "stopped";
      storageService.saveScrapingRun(task);
      return true;
    }
    return false;
  }

  public isCancelled(taskId: string): boolean {
    return this.cancelFlags.get(taskId) === true;
  }

  public async getAllTasks(): Promise<BulkScrapingTask[]> {
    return Array.from(this.activeTasks.values());
  }
}

export const taskManager = new TaskManager();
