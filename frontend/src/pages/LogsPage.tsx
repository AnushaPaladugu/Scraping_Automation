import React, { useEffect, useState } from "react";
import { LogEntry } from "../types";
import { apiService } from "../services/api";
import {
  ScrollText,
  RefreshCw,
  Download,
  Search,
  Filter,
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
} from "lucide-react";

export const LogsPage: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await apiService.getLogs(500);
      setLogs(res.logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (statusFilter !== "all" && log.status !== statusFilter) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return (
        log.message.toLowerCase().includes(s) ||
        (log.company || "").toLowerCase().includes(s) ||
        log.stage.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "error":
        return <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />;
      case "warning":
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />;
      case "success":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
      default:
        return <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Structured System Logs</h1>
          <p className="text-sm text-slate-600 mt-1">
            Real-time audit log of discovery checks, ATS detection, scraping decisions, and errors.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs rounded-xl transition shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <a
            href={apiService.getLogsJsonExportUrl()}
            download="scraping_logs.json"
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-semibold text-xs rounded-xl transition shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </a>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search logs by message, company, or stage..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-300 text-slate-800 rounded-xl px-3 py-2 focus:outline-none shadow-xs"
          >
            <option value="all">All Statuses</option>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      {/* Logs Table / List */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden font-mono text-xs shadow-xs">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-slate-600 font-sans font-medium">
          <span>Showing {filteredLogs.length} events</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">Live Log Stream</span>
        </div>

        <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 font-sans">No matching log records found.</div>
          ) : (
            filteredLogs.map((log, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg hover:bg-slate-50 transition flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
              >
                <div className="flex items-center gap-2 shrink-0">
                  {getStatusIcon(log.status)}
                  <span className="text-slate-400 text-[10px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {log.stage}
                  </span>
                  {log.company && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {log.company}
                    </span>
                  )}
                </div>

                <div className="text-slate-700 font-sans text-xs break-all flex-1">
                  {log.message}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
