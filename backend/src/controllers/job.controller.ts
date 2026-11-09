import { Request, Response } from "express";
import { storageService } from "../storage/fileStorage.service";
import { ExcelExporter } from "../exporters/excelExporter";
import { JsonExporter } from "../exporters/jsonExporter";

export class JobController {
  public static async listJobs(req: Request, res: Response) {
    try {
      const { company, ats, method, search, remote, limit, offset, taskId } = req.query;

      const result = await storageService.getJobs({
        company: company ? String(company) : undefined,
        ats: ats ? String(ats) : undefined,
        method: method ? String(method) : undefined,
        search: search ? String(search) : undefined,
        remote: remote ? String(remote) : undefined,
        taskId: taskId ? String(taskId) : undefined,
        limit: limit ? parseInt(String(limit), 10) : 50,
        offset: offset ? parseInt(String(offset), 10) : 0,
      });

      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  public static async exportExcel(req: Request, res: Response) {
    try {
      let targetJobs: any[] = [];
      const { company, ats, method, search, remote, filename, taskId } = {
        ...req.query,
        ...req.body,
      };

      if (Array.isArray(req.body?.jobs) && req.body.jobs.length > 0) {
        targetJobs = req.body.jobs;
      } else {
        const { jobs } = await storageService.getJobs({
          company: company ? String(company) : undefined,
          ats: ats ? String(ats) : undefined,
          method: method ? String(method) : undefined,
          search: search ? String(search) : undefined,
          remote: remote ? String(remote) : undefined,
          taskId: taskId ? String(taskId) : undefined,
          limit: 50000,
        });
        targetJobs = jobs;
      }

      const buffer = await ExcelExporter.exportJobsToBuffer(targetJobs);

      const downloadName = filename
        ? `${filename.replace(/\.xlsx$/i, "")}.xlsx`
        : company
        ? `${String(company).toLowerCase().replace(/[^a-z0-9_-]+/g, "_")}_jobs.xlsx`
        : taskId
        ? `task_${taskId}_jobs.xlsx`
        : "normalized_jobs.xlsx";

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
      return res.send(buffer);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  public static async exportJson(req: Request, res: Response) {
    try {
      let targetJobs: any[] = [];
      const { company, ats, method, search, remote, filename, taskId } = {
        ...req.query,
        ...req.body,
      };

      if (Array.isArray(req.body?.jobs) && req.body.jobs.length > 0) {
        targetJobs = req.body.jobs;
      } else {
        const { jobs } = await storageService.getJobs({
          company: company ? String(company) : undefined,
          ats: ats ? String(ats) : undefined,
          method: method ? String(method) : undefined,
          search: search ? String(search) : undefined,
          remote: remote ? String(remote) : undefined,
          taskId: taskId ? String(taskId) : undefined,
          limit: 50000,
        });
        targetJobs = jobs;
      }

      const jsonStr = JsonExporter.exportJobsToJsonString(targetJobs);

      const downloadName = filename
        ? `${filename.replace(/\.json$/i, "")}.json`
        : company
        ? `${String(company).toLowerCase().replace(/[^a-z0-9_-]+/g, "_")}_jobs.json`
        : taskId
        ? `task_${taskId}_jobs.json`
        : "normalized_jobs.json";

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
      return res.send(jsonStr);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  public static async getMetrics(req: Request, res: Response) {
    try {
      const { jobs, total } = await storageService.getJobs({ limit: 100000 });
      const companies = await storageService.getCompanies();
      const rejected = await storageService.getRejectedJobs();

      const methodCounts = {
        api: 0,
        jsonld: 0,
        static: 0,
        playwright: 0,
      };

      const atsCounts: Record<string, number> = {};
      const remoteCounts: Record<string, number> = {
        Remote: 0,
        Hybrid: 0,
        Onsite: 0,
        Unspecified: 0,
      };

      jobs.forEach((j) => {
        if (j.source_type && methodCounts[j.source_type] !== undefined) {
          methodCounts[j.source_type]++;
        }
        const a = j.ats || "None";
        atsCounts[a] = (atsCounts[a] || 0) + 1;

        if (j.remote_type) {
          remoteCounts[j.remote_type] = (remoteCounts[j.remote_type] || 0) + 1;
        } else {
          remoteCounts.Unspecified++;
        }
      });

      return res.status(200).json({
        totalJobs: total,
        totalCompanies: companies.length,
        totalRejectedJobs: rejected.length,
        methodCounts,
        atsCounts,
        remoteCounts,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  public static async getRejected(req: Request, res: Response) {
    try {
      const rejected = await storageService.getRejectedJobs();
      return res.status(200).json({ total: rejected.length, rejected });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
}
