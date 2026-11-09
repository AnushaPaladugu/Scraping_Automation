import React, { useEffect, useState, useMemo } from "react";
import { NormalizedJob, JobScope } from "../types";
import { apiService } from "../services/api";
import { StatusBadge } from "../components/StatusBadge";
import { JobDetailModal } from "../components/JobDetailModal";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useApp } from "../context/AppContext";
import {
  Search,
  Download,
  Filter,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Eye,
  RotateCcw,
  Sparkles,
} from "lucide-react";

export interface JobsResultsPageProps {
  jobScope?: JobScope | null;
  onClearScope?: () => void;
}

export const JobsResultsPage: React.FC<JobsResultsPageProps> = ({
  jobScope: propJobScope,
  onClearScope,
}) => {
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as { company?: string; taskId?: string };
  const { jobScope: contextJobScope, setJobScope } = useApp();
  const jobScope = propJobScope ?? contextJobScope;

  const [jobs, setJobs] = useState<NormalizedJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"excel" | "json" | null>(null);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState(searchParams?.company || "");
  const [selectedMethod, setSelectedMethod] = useState("");
  const [selectedRemote, setSelectedRemote] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 20;

  // Selected job for detail modal
  const [selectedJob, setSelectedJob] = useState<NormalizedJob | null>(null);

  // Scoped jobs in-memory filtering (when jobScope.jobs is provided)
  const scopedFilteredJobs = useMemo(() => {
    if (!jobScope?.jobs) return [];
    let list = [...jobScope.jobs];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (j) =>
          j.job_title.toLowerCase().includes(q) ||
          j.company_name.toLowerCase().includes(q) ||
          (j.location || "").toLowerCase().includes(q) ||
          (j.description || "").toLowerCase().includes(q)
      );
    }
    if (selectedMethod) {
      list = list.filter((j) => j.source_type === selectedMethod);
    }
    if (selectedRemote) {
      list = list.filter(
        (j) => (j.remote_type || "").toLowerCase() === selectedRemote.toLowerCase()
      );
    }
    return list;
  }, [jobScope?.jobs, search, selectedMethod, selectedRemote]);

  // Load jobs with current filters
  const fetchJobs = async () => {
    if (jobScope?.jobs) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiService.getJobs({
        search: search || undefined,
        company: selectedCompany || jobScope?.companyName || undefined,
        method: selectedMethod || undefined,
        remote: selectedRemote || undefined,
        taskId: jobScope?.taskId || searchParams?.taskId || undefined,
        limit,
        offset: (page - 1) * limit,
      });
      setJobs(res.jobs);
      setTotal(res.total);
    } catch (err) {
      console.error("Failed to fetch jobs", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchParams?.company && searchParams.company !== selectedCompany) {
      setSelectedCompany(searchParams.company);
    }
  }, [searchParams?.company]);

  useEffect(() => {
    setPage(1);
    fetchJobs();
  }, [jobScope, selectedCompany, selectedMethod, selectedRemote, searchParams?.taskId]);

  useEffect(() => {
    if (!jobScope?.jobs) {
      fetchJobs();
    }
  }, [page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchJobs();
  };

  // Determine current display list and total
  const isScopedMemory = Boolean(jobScope?.jobs);
  const displayJobs = isScopedMemory
    ? scopedFilteredJobs.slice((page - 1) * limit, page * limit)
    : jobs;
  const displayTotal = isScopedMemory ? scopedFilteredJobs.length : total;
  const totalPages = Math.ceil(displayTotal / limit) || 1;

  const effectiveTaskId = jobScope?.taskId || searchParams?.taskId;

  const handleExportExcel = async () => {
    setExporting("excel");
    try {
      if (jobScope?.jobs) {
        await apiService.downloadJobsExcel({
          jobs: scopedFilteredJobs.length > 0 ? scopedFilteredJobs : jobScope.jobs,
          company: jobScope.companyName,
          filename: jobScope.companyName ? `${jobScope.companyName}_jobs.xlsx` : undefined,
        });
      } else if (effectiveTaskId) {
        const link = document.createElement("a");
        link.href = `/api/jobs/export/excel?taskId=${encodeURIComponent(effectiveTaskId)}`;
        link.download = `task_${effectiveTaskId}_jobs.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        const link = document.createElement("a");
        link.href = apiService.getJobsExcelExportUrl({ company: selectedCompany || undefined });
        link.download = "normalized_jobs.xlsx";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (err) {
      console.error("Export Excel error", err);
    } finally {
      setExporting(null);
    }
  };

  const handleExportJson = async () => {
    setExporting("json");
    try {
      if (jobScope?.jobs) {
        await apiService.downloadJobsJson({
          jobs: scopedFilteredJobs.length > 0 ? scopedFilteredJobs : jobScope.jobs,
          company: jobScope.companyName,
          filename: jobScope.companyName ? `${jobScope.companyName}_jobs.json` : undefined,
        });
      } else if (effectiveTaskId) {
        const link = document.createElement("a");
        link.href = `/api/jobs/export/json?taskId=${encodeURIComponent(effectiveTaskId)}`;
        link.download = `task_${effectiveTaskId}_jobs.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        const link = document.createElement("a");
        link.href = apiService.getJobsJsonExportUrl({ company: selectedCompany || undefined });
        link.download = "normalized_jobs.json";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (err) {
      console.error("Export JSON error", err);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Scoped View Notification Banner */}
      {jobScope && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-base border border-emerald-500/30">
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-emerald-200">
                  {jobScope.source === "single_discovery"
                    ? `Scoped Results: ${jobScope.companyName || "Recent Scrape"}`
                    : `Scoped Results: Bulk Scraping Task`}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {displayTotal} Jobs Scraped
                </span>
              </div>
              <p className="text-xs text-emerald-300/80 mt-0.5">
                Displaying and exporting only newly extracted jobs from this scrape session.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setJobScope(null);
              onClearScope?.();
              navigate({ to: "/jobs" });
            }}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs rounded-xl transition self-start sm:self-auto flex items-center gap-1.5 shadow"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Show All Historical Jobs</span>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            {jobScope ? "Extracted Jobs (Scoped View)" : "Normalized Jobs Results"}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {jobScope
              ? `Showing extracted jobs for ${jobScope.companyName || "selected task"}. You can preview or export below.`
              : "Browse, filter, and inspect verified, processed, deduplicated job postings."}
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-semibold text-xs rounded-xl transition disabled:opacity-50"
            title="Download formatted Excel workbook (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting === "excel" ? "Exporting..." : "Excel (.xlsx)"}</span>
          </button>
          <button
            onClick={handleExportJson}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition disabled:opacity-50"
            title="Download JSON data (.json)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting === "json" ? "Exporting..." : "JSON"}</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by title, company, location, keywords..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl transition"
          >
            Search
          </button>
        </form>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
          <div className="flex items-center gap-1 text-slate-400">
            <Filter className="w-3.5 h-3.5" /> Filter by:
          </div>

          <select
            value={selectedMethod}
            onChange={(e) => {
              setSelectedMethod(e.target.value);
              setPage(1);
            }}
            className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="">All Scraping Methods</option>
            <option value="api">API / ATS</option>
            <option value="jsonld">JSON-LD</option>
            <option value="static">Static HTML</option>
            <option value="playwright">Playwright</option>
          </select>

          <select
            value={selectedRemote}
            onChange={(e) => {
              setSelectedRemote(e.target.value);
              setPage(1);
            }}
            className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="">All Workplace Types</option>
            <option value="Remote">Remote</option>
            <option value="Hybrid">Hybrid</option>
            <option value="Onsite">Onsite</option>
          </select>

          {(search || selectedCompany || selectedMethod || selectedRemote) && (
            <button
              onClick={() => {
                setSearch("");
                setSelectedCompany("");
                setSelectedMethod("");
                setSelectedRemote("");
                setPage(1);
              }}
              className="text-emerald-400 hover:underline text-xs ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-700/80 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">
            Showing {displayJobs.length} of {displayTotal} Normalized Jobs
          </span>
          <button
            onClick={fetchJobs}
            className="p-1 hover:text-slate-100 text-slate-400 transition"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-700/80 uppercase font-semibold">
              <tr>
                <th className="p-3.5">Company</th>
                <th className="p-3.5">Job Title</th>
                <th className="p-3.5">Location</th>
                <th className="p-3.5">Workplace</th>
                <th className="p-3.5">Salary</th>
                <th className="p-3.5">ATS</th>
                <th className="p-3.5">Source Type</th>
                <th className="p-3.5">Posted</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    Loading jobs...
                  </td>
                </tr>
              ) : displayJobs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-500">
                    No jobs found matching the selected filters.
                  </td>
                </tr>
              ) : (
                displayJobs.map((job, idx) => (
                  <tr
                    key={idx}
                    onClick={() => setSelectedJob(job)}
                    className="hover:bg-slate-700/30 transition cursor-pointer"
                  >
                    <td className="p-3.5 font-bold text-slate-200">{job.company_name}</td>
                    <td className="p-3.5 font-medium text-slate-100 max-w-xs truncate">
                      {job.job_title}
                    </td>
                    <td className="p-3.5 text-slate-400">{job.location || "N/A"}</td>
                    <td className="p-3.5">
                      {job.remote_type ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-300">
                          {job.remote_type}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-300 font-mono">{job.salary || "—"}</td>
                    <td className="p-3.5">
                      <span className="text-purple-300">{job.ats || "General"}</span>
                    </td>
                    <td className="p-3.5">
                      <StatusBadge status={job.source_type} type="method" />
                    </td>
                    <td className="p-3.5 text-slate-400 font-mono">{job.posted_date || "—"}</td>
                    <td className="p-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedJob(job)}
                          className="p-1 hover:text-emerald-400 text-slate-400 transition"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={job.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 hover:text-blue-400 text-slate-400 transition"
                          title="Open Link"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-700/80 flex items-center justify-between text-xs text-slate-400">
          <div>
            Page {page} of {totalPages}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 disabled:opacity-40 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Job Details Modal */}
      <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
    </div>
  );
};
