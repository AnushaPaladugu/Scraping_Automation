import React, { useEffect, useState } from "react";
import { MetricCard } from "../components/MetricCard";
import { SystemMetrics, BulkScrapingTask } from "../types";
import { apiService } from "../services/api";
import {
  Building2,
  Briefcase,
  Cpu,
  FileCode,
  Globe,
  MonitorCheck,
  AlertOctagon,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { NavTab } from "../components/Navbar";
import { Link } from "@tanstack/react-router";

interface DashboardPageProps {
  onNavigate?: (tab: NavTab) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = () => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [tasks, setTasks] = useState<BulkScrapingTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [m, t] = await Promise.all([apiService.getMetrics(), apiService.listTasks()]);
        setMetrics(m);
        setTasks(t.tasks || []);
      } catch (err) {
        console.error("Failed to load dashboard metrics", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-50/70 via-white to-sky-50/70 border border-slate-200 p-8 rounded-2xl shadow-xs">
        <div className="relative z-10 max-w-2xl">
          <span className="text-emerald-700 text-xs font-semibold uppercase tracking-widest bg-emerald-100/70 px-3 py-1 rounded-full border border-emerald-200">
            Intelligent Automation
          </span>
          <h1 className="text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">
            End-to-End Job Scraping Automation
          </h1>
          <p className="text-slate-600 text-sm mt-2 leading-relaxed">
            Automates company discovery, official website & careers page verification, ATS detection,
            smart scraper strategy selection, field processing, validation, deduplication, and multi-format export.
          </p>
          <div className="flex gap-3 mt-6">
            <Link
              to="/discovery"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition shadow-md shadow-emerald-600/20"
            >
              <span>Single Company</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              to="/upload"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs transition shadow-xs"
            >
              <span>Bulk Upload CSV/Excel</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Row 1: High Level Totals */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" /> Platform Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Discovered Companies"
            value={loading ? "..." : metrics?.totalCompanies ?? 0}
            subtext="Verified official portals"
            icon={<Building2 className="w-5 h-5 text-blue-600" />}
            color="blue"
          />
          <MetricCard
            title="Total Normalized Jobs"
            value={loading ? "..." : metrics?.totalJobs ?? 0}
            subtext="Validated & Deduplicated"
            icon={<Briefcase className="w-5 h-5 text-emerald-600" />}
            color="green"
          />
          <MetricCard
            title="Rejected Invalid Records"
            value={loading ? "..." : metrics?.totalRejectedJobs ?? 0}
            subtext="Preserved with rejection reasons"
            icon={<AlertOctagon className="w-5 h-5 text-rose-600" />}
            color="rose"
          />
          <MetricCard
            title="Active Scraping Tasks"
            value={loading ? "..." : tasks.filter((t) => t.status === "processing" || t.status === "queued").length}
            subtext={`${tasks.length} total tasks recorded`}
            icon={<Cpu className="w-5 h-5 text-purple-600" />}
            color="purple"
          />
        </div>
      </div>

      {/* Metrics Row 2: Breakdown by Scraping Method */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-indigo-600" /> Scraping Strategy Distribution
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="API / ATS Strategy"
            value={loading ? "..." : metrics?.methodCounts.api ?? 0}
            subtext="Greenhouse, Lever, SmartRecruiters, etc."
            icon={<Cpu className="w-5 h-5 text-indigo-600" />}
            color="indigo"
          />
          <MetricCard
            title="JSON-LD Strategy"
            value={loading ? "..." : metrics?.methodCounts.jsonld ?? 0}
            subtext="Structured schema.org JobPosting"
            icon={<FileCode className="w-5 h-5 text-blue-600" />}
            color="blue"
          />
          <MetricCard
            title="Static HTML Strategy"
            value={loading ? "..." : metrics?.methodCounts.static ?? 0}
            subtext="Cheerio DOM extraction"
            icon={<Globe className="w-5 h-5 text-emerald-600" />}
            color="green"
          />
          <MetricCard
            title="Playwright Dynamic"
            value={loading ? "..." : metrics?.methodCounts.playwright ?? 0}
            subtext="Headless browser SPA fallback"
            icon={<MonitorCheck className="w-5 h-5 text-purple-600" />}
            color="purple"
          />
        </div>
      </div>

      {/* Two Column Layout: ATS Breakdown & Recent Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ATS Breakdown */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center justify-between">
            <span>ATS Distribution</span>
            <span className="text-xs text-slate-500 font-normal">Identified Providers</span>
          </h3>
          {metrics && Object.keys(metrics.atsCounts).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(metrics.atsCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 7)
                .map(([ats, count]) => {
                  const pct = Math.round((count / (metrics.totalJobs || 1)) * 100);
                  return (
                    <div key={ats} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-slate-700">{ats}</span>
                        <span className="text-slate-500 font-mono">
                          {count} jobs ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(5, pct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-400 text-sm">
              No jobs scraped yet. Discover companies and extract jobs to view ATS distribution.
            </div>
          )}
        </div>

        {/* Remote Type Distribution */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center justify-between">
            <span>Workplace Type Breakdown</span>
            <span className="text-xs text-slate-500 font-normal">Normalized Remote Types</span>
          </h3>
          {metrics && metrics.totalJobs > 0 ? (
            <div className="space-y-3">
              {Object.entries(metrics.remoteCounts).map(([type, count]) => {
                const pct = Math.round((count / (metrics.totalJobs || 1)) * 100);
                return (
                  <div key={type} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700">{type}</span>
                      <span className="text-slate-500 font-mono">
                        {count} jobs ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(5, pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-400 text-sm">
              No jobs normalized yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
