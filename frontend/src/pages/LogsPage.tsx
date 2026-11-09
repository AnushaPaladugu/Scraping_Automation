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
        return <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      case "warning":
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case "success":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      default:
        return <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Structured System Logs</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time audit log of discovery checks, ATS detection, scraping decisions, and errors.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <a
            href={apiService.getLogsJsonExportUrl()}
            download="scraping_logs.json"
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-semibold text-xs rounded-xl transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </a>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search logs by message, company, or stage..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 focus:outline-none"
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
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden font-mono text-xs shadow-inner">
        <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-slate-400">
          <span>Showing {filteredLogs.length} events</span>
          <span className="text-[10px] uppercase tracking-wider">Live Log Stream</span>
        </div>

        <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-850 p-2 space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-600 font-sans">No matching log records found.</div>
          ) : (
            filteredLogs.map((log, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg hover:bg-slate-900/60 transition flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
              >
                <div className="flex items-center gap-2 shrink-0">
                  {getStatusIcon(log.status)}
                  <span className="text-slate-500 text-[10px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-800 text-slate-300">
                    {log.stage}
                  </span>
                  {log.company && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                      {log.company}
                    </span>
                  )}
                </div>

                <div className="text-slate-300 font-sans text-xs break-all flex-1">
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
