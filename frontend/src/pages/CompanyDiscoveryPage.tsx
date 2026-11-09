import React, { useState } from "react";
import { CompanyDiscoveryResult, NormalizedJob } from "../types";
import { apiService } from "../services/api";
import { StatusBadge } from "../components/StatusBadge";
import {
  Search,
  Building2,
  Globe,
  ExternalLink,
  ShieldCheck,
  Cpu,
  Play,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Sparkles,
  Filter,
} from "lucide-react";
import { NavTab } from "../components/Navbar";
import { JobScope } from "../types";
import { Link } from "@tanstack/react-router";
import { useApp } from "../context/AppContext";

interface CompanyDiscoveryPageProps {
  onNavigate?: (tab: NavTab) => void;
  onJobSelect?: (job: NormalizedJob) => void;
  onViewJobs?: (scope: JobScope) => void;
}

export const getStrategyInfo = (res: CompanyDiscoveryResult) => {
  const ats = res.ats || "";
  const isApi = !!res.apiUrl || ["Greenhouse", "Lever", "Ashby", "SmartRecruiters", "Workable", "BambooHR", "Teamtailor", "Rippling"].includes(ats);
  if (isApi) {
    return {
      type: "API (GET or POST)",
      detail: `Direct ATS API (${ats})`,
      color: "text-emerald-400",
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    };
  }

  if (ats === "Tribepad" || res.careerUrl?.includes("dhuhealthcare")) {
    return {
      type: "Static (HTML)",
      detail: `Server-Rendered Pagination (${ats})`,
      color: "text-blue-400",
      badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    };
  }

  if (ats && ats !== "None" && ats !== "Custom" && ats !== "Custom / In-House Portal") {
    return {
      type: "Dynamic (JavaScript / Playwright)",
      detail: `SPA / Dynamic Portal (${ats})`,
      color: "text-cyan-300",
      badgeColor: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
    };
  }

  return {
    type: "Dynamic (SPA) / Static (HTML)",
    detail: "Adaptive Browser / HTML Extraction",
    color: "text-amber-300",
    badgeColor: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  };
};

export const formatScrapingMethod = (method?: string, strategyLabel?: string) => {
  if (strategyLabel) return strategyLabel;
  switch ((method || "").toLowerCase()) {
    case "api":
      return "API (GET or POST)";
    case "playwright":
      return "Dynamic (JavaScript / Playwright)";
    case "jsonld":
      return "Dynamic (JSON-LD Schema)";
    case "static":
      return "Static (HTML Parsing)";
    default:
      return method?.toUpperCase() || "UNKNOWN";
  }
};

export const CompanyDiscoveryPage: React.FC<CompanyDiscoveryPageProps> = ({ onViewJobs }) => {
  const { setJobScope } = useApp();
  const [companyName, setCompanyName] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<CompanyDiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Scraping state for "Get Jobs Data"
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<any | null>(null);

  // Pre-scraping filters
  const [filterCountry, setFilterCountry] = useState("");
  const [filterKeyword, setFilterKeyword] = useState("");
  const [filterDays, setFilterDays] = useState<number | undefined>(undefined);

  const handleDiscover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    setLoading(true);
    setError(null);
    setDiscoveryResult(null);
    setScrapeResult(null);

    try {
      const res = await apiService.discoverSingleCompany({
        companyName: companyName.trim(),
        companyUrl: companyUrl.trim() || undefined,
      });
      setDiscoveryResult(res);
      if (res.detectionStatus === "failed" && !res.careerUrl) {
        setError(res.error || "Company website could not be verified.");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Discovery failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGetJobsData = async () => {
    if (!discoveryResult) return;

    setScraping(true);
    setScrapeResult(null);

    try {
      const filters = {
        country: filterCountry.trim() || undefined,
        postedWithinDays: filterDays,
        keyword: filterKeyword.trim() || undefined,
      };
      const res = await apiService.scrapeSingleCompany(discoveryResult, filters);
      setScrapeResult(res);
    } catch (err: any) {
      alert(`Scraping failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setScraping(false);
    }
  };

  const quickSamples = ["ServiceNow", "Microsoft", "GitLab", "Adobe", "Salesforce", "Rippling", "Stripe"];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Single Company Discovery</h1>
        <p className="text-sm text-slate-400 mt-1">
          Enter a company name to automatically verify its official domain, discover career portals,
          and identify its ATS technology stack without guessing URLs.
        </p>
      </div>

      {/* Input Form */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 shadow-sm">
        <form onSubmit={handleDiscover} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Company Name <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="e.g. The Travel Village Group Limited, ServiceNow..."
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Company Website / Domain <span className="text-slate-500 font-normal lowercase">(optional)</span>
              </label>
              <div className="relative">
                <Globe className="w-5 h-5 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="e.g. travelvillagegroup.com (Leave blank to auto-discover)"
                  value={companyUrl}
                  onChange={(e) => setCompanyUrl(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            {/* Quick Select Chips */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Try sample:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {quickSamples.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => {
                      setCompanyName(sample);
                      setCompanyUrl("");
                    }}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-700/70 hover:bg-slate-700 text-slate-300 transition"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !companyName.trim()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-emerald-600/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Discovering & Verifying...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Find Company</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-300 text-sm">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Discovery Result Card */}
      {discoveryResult && (
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl overflow-hidden shadow-lg space-y-6 p-6">
          <div className="flex items-start justify-between border-b border-slate-700/70 pb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge status={discoveryResult.detectionStatus} type="detection" />
                <span className="text-xs text-slate-400">
                  Confidence: {Math.round(discoveryResult.confidence * 100)}%
                </span>
              </div>
              <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                <Building2 className="w-6 h-6 text-emerald-400" />
                {discoveryResult.companyName}
              </h2>
            </div>

            {/* Action button: Get Jobs Data */}
            <button
              onClick={handleGetJobsData}
              disabled={scraping || !discoveryResult.careerUrl}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition shadow-lg shadow-indigo-600/20"
            >
              {scraping ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Selecting Strategy & Scraping...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Get Jobs Data</span>
                </>
              )}
            </button>
          </div>

          {/* Pre-Scraping Filters Panel */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-emerald-400" /> Scraping Filters (Optional)
              </span>
              <span className="text-[11px] text-slate-400">
                Applied during extraction before normalization
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Country Filter</label>
                <input
                  type="text"
                  placeholder="e.g. United States, United Kingdom, India... (Leave blank for all)"
                  value={filterCountry}
                  onChange={(e) => setFilterCountry(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Job Title / Keyword</label>
                <input
                  type="text"
                  placeholder="e.g. Developer, Engineer, Sales... (Leave blank for all)"
                  value={filterKeyword}
                  onChange={(e) => setFilterKeyword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Posted Date Filter</label>
                <select
                  value={filterDays ?? ""}
                  onChange={(e) => setFilterDays(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">Anytime (All active jobs)</option>
                  <option value="1">Past 24 Hours</option>
                  <option value="7">Past 7 Days</option>
                  <option value="14">Past 14 Days</option>
                  <option value="30">Past 30 Days</option>
                  <option value="60">Past 60 Days (2 Months)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-blue-400" /> Official Website
              </span>
              {discoveryResult.companyUrl ? (
                <a
                  href={discoveryResult.companyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline flex items-center gap-1 font-mono text-xs break-all"
                >
                  <span>{discoveryResult.companyUrl}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              ) : (
                <span className="text-slate-500">Not verified</span>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-emerald-400" /> Career Website
              </span>
              {discoveryResult.careerUrl ? (
                <a
                  href={discoveryResult.careerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline flex items-center gap-1 font-mono text-xs break-all"
                >
                  <span>{discoveryResult.careerUrl}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              ) : (
                <span className="text-slate-500">Not detected</span>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-purple-400" /> ATS Provider
              </span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-200">{discoveryResult.ats}</span>
                {discoveryResult.ats !== "None" && (
                  <span className="text-xs bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded border border-purple-500/20">
                    Detected
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-400" /> Scraping Strategy
              </span>
              <div className="flex flex-col gap-0.5">
                <span className={`font-semibold text-xs ${getStrategyInfo(discoveryResult).color}`}>
                  {getStrategyInfo(discoveryResult).type}
                </span>
                <span className="text-[11px] text-slate-400">
                  {getStrategyInfo(discoveryResult).detail}
                </span>
              </div>
            </div>

            {discoveryResult.apiUrl && (
              <div className="md:col-span-2 p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Discovered API Endpoint
                </span>
                <div className="font-mono text-xs text-indigo-400 break-all bg-slate-950 p-2 rounded border border-slate-800">
                  {discoveryResult.apiUrl}
                </div>
              </div>
            )}
          </div>

          {/* Scrape Result Panel (When user clicked "Get Jobs Data") */}
          {scrapeResult && (
            <div className="mt-6 p-5 rounded-xl bg-slate-900/80 border border-emerald-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-slate-100">
                    Scraping Complete ({scrapeResult.status})
                  </span>
                </div>
                <StatusBadge status={scrapeResult.status} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block">Method Used</span>
                  <span className="font-bold text-emerald-400">
                    {formatScrapingMethod(scrapeResult.method, scrapeResult.strategyLabel || scrapeResult.metadata?.strategyLabel)}
                  </span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block">
                    {scrapeResult.metadata?.preFilterValidCount !== undefined ? "Scraped on Portal" : "Jobs Found"}
                  </span>
                  <span className="font-bold text-slate-100">
                    {scrapeResult.metadata?.preFilterValidCount ?? scrapeResult.totalJobs}
                  </span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block">Matching Filter</span>
                  <span className="font-bold text-emerald-400">{scrapeResult.jobs?.length || 0}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block">Filtered Out</span>
                  <span className="font-bold text-amber-400">{scrapeResult.metadata?.filteredOutCount ?? 0}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block">Invalid/Rejected</span>
                  <span className="font-bold text-rose-400">{scrapeResult.invalidJobs?.length || 0}</span>
                </div>
              </div>

              {scrapeResult.status === "NO_JOBS" && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs">
                  {scrapeResult.metadata?.message || "No active job vacancies currently published on this careers portal (or matching selected filters)."}
                </div>
              )}

              {scrapeResult.metadata?.strategyReason && (
                <div className="text-xs text-slate-400 italic">
                  Strategy: {scrapeResult.metadata.strategyReason}
                </div>
              )}

              <div className="pt-2 flex justify-end">
                {scrapeResult.jobs?.length > 0 ? (
                  <Link
                    to="/jobs"
                    search={{ company: discoveryResult?.companyName }}
                    onClick={() => {
                      if (discoveryResult) {
                        const scope: JobScope = {
                          source: "single_discovery",
                          companyName: discoveryResult.companyName,
                          jobs: scrapeResult.jobs,
                        };
                        setJobScope(scope);
                        onViewJobs?.(scope);
                      }
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition inline-block text-center shadow-lg shadow-emerald-600/20"
                  >
                    View Jobs in Results Table ({scrapeResult.jobs.length}) →
                  </Link>
                ) : (
                  <span className="text-xs text-slate-500 py-2">
                    0 jobs saved (no active vacancies on this portal)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
