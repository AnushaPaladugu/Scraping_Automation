import React, { useEffect, useState } from "react";
import { BulkScrapingTask } from "../types";
import { apiService } from "../services/api";
import { ProgressBar } from "../components/ProgressBar";
import { StatusBadge } from "../components/StatusBadge";
import {
  Loader2,
  StopCircle,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Building2,
  ArrowRight,
} from "lucide-react";
import { NavTab } from "../components/Navbar";
import { JobScope } from "../types";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useApp } from "../context/AppContext";

interface ScrapingProgressPageProps {
  taskId?: string | null;
  onNavigate?: (tab: NavTab) => void;
  onSelectTask?: (id: string) => void;
  onViewJobs?: (scope: JobScope) => void;
}

export const ScrapingProgressPage: React.FC<ScrapingProgressPageProps> = ({
  taskId: propTaskId,
  onSelectTask,
  onViewJobs,
}) => {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { taskId?: string };
  const { activeTaskId, setActiveTaskId, setJobScope } = useApp();
  const taskId = propTaskId ?? search?.taskId ?? activeTaskId;

  const [task, setTask] = useState<BulkScrapingTask | null>(null);
  const [allTasks, setAllTasks] = useState<BulkScrapingTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);

  // Load all tasks for task switcher
  const fetchAllTasks = async () => {
    try {
      const res = await apiService.listTasks();
      setAllTasks(res.tasks || []);
    } catch {}
  };

  useEffect(() => {
    fetchAllTasks();
  }, [taskId]);

  // Poll current task status
  useEffect(() => {
    if (!taskId) return;

    let isMounted = true;
    let pollTimer: any = null;

    const fetchStatus = async () => {
      try {
        const res = await apiService.getScrapeStatus(taskId);
        if (isMounted) {
          setTask(res);
          // Continue polling if still running
          if (res.status === "queued" || res.status === "processing") {
            pollTimer = setTimeout(fetchStatus, 1500);
          }
        }
      } catch (err) {
        console.error("Failed to poll task status", err);
      }
    };

    setLoading(true);
    fetchStatus().finally(() => setLoading(false));

    return () => {
      isMounted = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [taskId]);

  const handleStopTask = async () => {
    if (!taskId) return;
    setStopping(true);
    try {
      await apiService.cancelScrapeTask(taskId);
      const updated = await apiService.getScrapeStatus(taskId);
      setTask(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Scraping Execution & Progress
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time pipeline monitoring with concurrency control, strategy tracking, and company isolation.
          </p>
        </div>

        {/* Task selector / switcher */}
        <div className="flex items-center gap-3">
          {allTasks.length > 0 && (
            <select
              value={taskId || ""}
              onChange={(e) => {
                const newId = e.target.value;
                setActiveTaskId(newId);
                onSelectTask?.(newId);
                navigate({ to: "/scraping", search: { taskId: newId } });
              }}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="" disabled>
                Select Task Run...
              </option>
              {allTasks.map((t) => (
                <option key={t.taskId} value={t.taskId}>
                  Task {t.taskId.slice(0, 8)} ({t.totalCompanies} companies - {t.status})
                </option>
              ))}
            </select>
          )}

          {task && (task.status === "processing" || task.status === "queued") && (
            <button
              onClick={handleStopTask}
              disabled={stopping}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-semibold text-xs rounded-xl transition"
            >
              {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
              <span>Cancel Run</span>
            </button>
          )}

          {task && (
            <Link
              to="/jobs"
              search={{ taskId: task.taskId }}
              onClick={() => {
                const scope: JobScope = {
                  source: "bulk_scrape",
                  taskId: task.taskId,
                };
                setJobScope(scope);
                onViewJobs?.(scope);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition shadow-lg shadow-emerald-600/20"
            >
              <Briefcase className="w-4 h-4" />
              <span>View Results ({task.totalJobsExtracted} Jobs)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {!taskId && (
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-900 mx-auto flex items-center justify-center text-slate-500">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-200">No Scraping Task Selected</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Start a scraping run from the Single Discovery or Bulk Upload tabs, or pick a previous run above.
            </p>
          </div>
          <Link
            to="/upload"
            className="inline-block px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl transition"
          >
            Go to Bulk Upload
          </Link>
        </div>
      )}

      {task && (
        <>
          {/* Progress Bar Component */}
          <ProgressBar
            current={task.processedCompanies}
            total={task.totalCompanies}
            successful={task.successfulCompanies}
            noJobs={task.noJobsCompanies}
            failed={task.failedCompanies}
          />

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-xl">
              <span className="text-xs text-slate-400 block">Total Jobs Extracted</span>
              <span className="text-xl font-bold text-emerald-400 font-mono">
                {task.totalJobsExtracted}
              </span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-xl">
              <span className="text-xs text-slate-400 block">Valid Jobs</span>
              <span className="text-xl font-bold text-slate-100 font-mono">
                {task.totalValidJobs}
              </span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-xl">
              <span className="text-xs text-slate-400 block">Rejected / Invalid</span>
              <span className="text-xl font-bold text-rose-400 font-mono">
                {task.totalInvalidJobs}
              </span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-xl">
              <span className="text-xs text-slate-400 block">Run Status</span>
              <div className="mt-1">
                <StatusBadge status={task.status} />
              </div>
            </div>
          </div>

          {/* Company Execution Breakdown */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-700/80 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200">
                Company Execution Live Breakdown ({task.companies.length})
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                Task ID: {task.taskId.slice(0, 8)}...
              </span>
            </div>

            <div className="divide-y divide-slate-700/50 max-h-[600px] overflow-y-auto">
              {task.companies.map((comp, idx) => (
                <div
                  key={idx}
                  className="p-4 hover:bg-slate-700/30 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100 text-sm flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        {comp.companyName}
                      </span>
                      {comp.ats && (
                        <span className="text-[10px] bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded border border-purple-500/20">
                          {comp.ats}
                        </span>
                      )}
                      {comp.method && <StatusBadge status={comp.method} type="method" />}
                    </div>

                    {/* Step Timeline Indicator */}
                    <div className="text-slate-400 text-xs flex items-center gap-2">
                      <span>{comp.companyName}</span>
                      <span>→</span>
                      <span>{comp.ats ? `${comp.ats} detected` : "Portal detected"}</span>
                      <span>→</span>
                      <span>{comp.method ? `${comp.method} scraping` : "Strategy selection"}</span>
                      <span>→</span>
                      <span className="font-semibold text-slate-200 font-mono">
                        {comp.jobsFound} jobs found
                      </span>
                    </div>

                    {comp.error && (
                      <div className="text-rose-400 text-xs flex items-center gap-1 mt-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{comp.error}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={comp.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
