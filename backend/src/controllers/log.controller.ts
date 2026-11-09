import { Request, Response } from "express";
import { storageService } from "../storage/fileStorage.service";
import { JsonExporter } from "../exporters/jsonExporter";

export class LogController {
  public static async getLogs(req: Request, res: Response) {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 200;
      const logs = await storageService.getLogs(limit);
      return res.status(200).json({ total: logs.length, logs });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  public static async exportLogs(req: Request, res: Response) {
    try {
      const logs = await storageService.getLogs(5000);
      const jsonStr = JsonExporter.exportLogsToJsonString(logs);

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", "attachment; filename=scraping_logs.json");
      return res.send(jsonStr);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
}
