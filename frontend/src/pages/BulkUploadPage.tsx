import React, { useState, useMemo } from "react";
import { CompanyDiscoveryResult } from "../types";
import { apiService } from "../services/api";
import { StatusBadge } from "../components/StatusBadge";
import {
  UploadCloud,
  FileSpreadsheet,
  Search,
  Play,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Loader2,
  ExternalLink,
  Sparkles,
  Filter,
  CheckSquare,
  Square,
  Download,
  Building2,
  Briefcase,
} from "lucide-react";
import { NavTab } from "../components/Navbar";
import { useNavigate } from "@tanstack/react-router";
import { useApp } from "../context/AppContext";

interface BulkUploadPageProps {
  onNavigate?: (tab: NavTab) => void;
  onStartBulkScrape?: (taskId: string) => void;
}

export const BulkUploadPage: React.FC<BulkUploadPageProps> = ({ onStartBulkScrape }) => {
  const navigate = useNavigate();
  const { setActiveTaskId } = useApp();
  const [activeOption, setActiveOption] = useState<"details" | "jobs">("details");
  const [companies, setCompanies] = useState<Array<{ companyName: string; companyUrl?: string; careerUrl?: string; ats?: string; industry?: string; city?: string; state?: string; country?: string }>>([]);
  const [fileInfo, setFileInfo] = useState<{ filename: string; total: number; detectedColumn: string } | null>(null);
  const [invalidRows, setInvalidRows] = useState<Array<{ rowNumber: number; reason: string }>>([]);
  const [discoveredMap, setDiscoveredMap] = useState<Record<string, CompanyDiscoveryResult>>({});
  const [hasDiscovered, setHasDiscovered] = useState(false);

  // Pre-scraping filters
  const [filterCountry, setFilterCountry] = useState("");
  const [filterKeyword, setFilterKeyword] = useState("");
  const [filterDays, setFilterDays] = useState<number | undefined>(undefined);

  // Table filtering & selection
  const [tableSearch, setTableSearch] = useState("");
  const [tableAtsFilter, setTableAtsFilter] = useState("");
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const [uploading, setUploading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState<{ processed: number; total: number } | null>(null);
  const [startingScrape, setStartingScrape] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File Upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setDiscoveredMap({});
    setHasDiscovered(false);
    try {
      const res = await apiService.uploadCompanyFile(file);
      setCompanies(res.companies);
      setFileInfo({
        filename: res.filename,
        total: res.totalRows,
        detectedColumn: res.detectedColumn,
      });
      setInvalidRows(res.invalidRows || []);
      // Select all uploaded companies by default
      setSelectedIndices(new Set(res.companies.map((_, i) => i)));
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Failed to parse file");
    } finally {
      setUploading(false);
    }
  };

  // Preset Loaders
  const loadPreset = (preset: Array<{ companyName: string; companyUrl?: string }>) => {
    setCompanies(preset);
    setFileInfo({
      filename: "preset_companies.csv",
      total: preset.length,
      detectedColumn: "company_name",
    });
    setInvalidRows([]);
    setDiscoveredMap({});
    setHasDiscovered(false);
    setSelectedIndices(new Set(preset.map((_, i) => i)));
    setError(null);
  };

  // Helper for batch processing to prevent HTTP timeouts
  const runBatchDiscovery = async (
    targetCompanies: typeof companies,
    mapToUpdate: Record<string, CompanyDiscoveryResult>
  ) => {
    const BATCH_SIZE = 10;
    const total = targetCompanies.length;
    let processed = 0;
    setDiscoveryProgress({ processed: 0, total });

    const currentMap = { ...mapToUpdate };

    for (let i = 0; i < targetCompanies.length; i += BATCH_SIZE) {
      const chunk = targetCompanies.slice(i, i + BATCH_SIZE);
      const res = await apiService.discoverBulkCompanies(chunk);

      res.results.forEach((r) => {
        currentMap[r.companyName.toLowerCase()] = r;
      });

      processed += chunk.length;
      setDiscoveryProgress({ processed: Math.min(processed, total), total });
      setDiscoveredMap({ ...currentMap });
    }

    return currentMap;
  };

  // Step 1: Bulk Find & Discover Company Details
  const handleFindCompanies = async () => {
    if (companies.length === 0) return;
    setDiscovering(true);
    setError(null);

    const targetCompanies = selectedIndices.size > 0
      ? companies.filter((_, i) => selectedIndices.has(i))
      : companies;

    try {
      await runBatchDiscovery(targetCompanies, {});
      setHasDiscovered(true);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Bulk discovery failed");
    } finally {
      setDiscovering(false);
      setDiscoveryProgress(null);
    }
  };

  // Step 2: Download Company Details Excel (strictly exports discovered results without re-triggering discovery)
  const handleDownloadCompanyDetails = async () => {
    if (companies.length === 0) return;
    setDownloadingExcel(true);
    setError(null);
    try {
      const targetCompanies = selectedIndices.size > 0
        ? companies.filter((_, i) => selectedIndices.has(i))
        : companies;

      const results = targetCompanies.map((c, i) => {
        const disc = discoveredMap[c.companyName.toLowerCase()];
        const hasApi = disc ? !!disc.public_api : false;
        const apiData = disc ? disc.public_api_data || "" : "";

        return (
          disc || {
            id: (c as any).id || i + 1,
            companyName: c.companyName,
            company: c.companyName,
            companyUrl: c.companyUrl || null,
            careerUrl: c.careerUrl || null,
            ats: c.ats || "None",
            atsUrl: null,
            slug: "",
            detectionStatus: "failed" as const,
            confidence: 0,
            detectionMethod: "none",
            verified: false,
            industry: c.industry || "",
            city: c.city || "",
            state: c.state || "",
            country: c.country || "",
            public_api: hasApi,
            public_api_data: apiData,
          }
        );
      });

      await apiService.downloadCompanyDetailsExcel({
        companies: results,
        filename: fileInfo?.filename ? `company_details_${fileInfo.filename}` : "company_details.xlsx",
      });
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Failed to download company details Excel");
    } finally {
      setDownloadingExcel(false);
    }
  };

  // Start Bulk Scrape
  const handleStartBulkScrape = async () => {
    if (companies.length === 0) return;
    setStartingScrape(true);
    setError(null);

    const targetCompanies = (
      selectedIndices.size > 0
        ? companies.filter((_, i) => selectedIndices.has(i))
        : companies
    ).map((c) => {
      const disc = discoveredMap[c.companyName.toLowerCase()];
      return {
        ...c,
        companyUrl: disc?.companyUrl || c.companyUrl,
        careerUrl: disc?.careerUrl || c.careerUrl,
        ats: disc?.ats || c.ats,
        atsUrl: disc?.atsUrl,
        companySlug: disc?.companySlug,
        apiUrl: disc?.apiUrl,
        verified: disc?.verified ?? false,
      };
    });

    try {
      const filters = {
        country: filterCountry.trim() || undefined,
        keyword: filterKeyword.trim() || undefined,
        postedWithinDays: filterDays,
      };
      const res = await apiService.startBulkScrape(targetCompanies, filters);
      setActiveTaskId(res.taskId);
      onStartBulkScrape?.(res.taskId);
      navigate({ to: "/scraping", search: { taskId: res.taskId } });
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Failed to start bulk scraping");
      setStartingScrape(false);
    }
  };

  // Distinct ATS providers for table filtering
  const distinctAts = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => {
      const disc = discoveredMap[c.companyName.toLowerCase()];
      const atsName = disc?.ats || c.ats;
      if (atsName && atsName !== "None") set.add(atsName);
    });
    return Array.from(set).sort();
  }, [companies, discoveredMap]);

  // Filtered companies in preview table
  const filteredCompaniesWithIndices = useMemo(() => {
    return companies
      .map((comp, idx) => ({ comp, idx }))
      .filter(({ comp }) => {
        const disc = discoveredMap[comp.companyName.toLowerCase()];
        const atsName = disc?.ats || comp.ats || "";

        if (tableSearch) {
          const q = tableSearch.toLowerCase();
          const matchName = comp.companyName.toLowerCase().includes(q);
          const matchUrl = (comp.companyUrl || "").toLowerCase().includes(q) || (disc?.companyUrl || "").toLowerCase().includes(q);
          if (!matchName && !matchUrl) return false;
        }

        if (tableAtsFilter) {
          if (atsName.toLowerCase() !== tableAtsFilter.toLowerCase()) return false;
        }

        return true;
      });
  }, [companies, discoveredMap, tableSearch, tableAtsFilter]);

  const toggleSelectAll = () => {
    if (selectedIndices.size === companies.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(companies.map((_, i) => i)));
    }
  };

  const toggleSelectIndex = (idx: number) => {
    const next = new Set(selectedIndices);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelectedIndices(next);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* 2-Option Mode Switcher */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-700/80 pb-4">
        <button
          type="button"
          onClick={() => setActiveOption("details")}
          className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl font-bold text-sm transition ${
            activeOption === "details"
              ? "bg-sky-600 text-white shadow-lg shadow-sky-600/20 border border-sky-400/40"
              : "bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60"
          }`}
        >
          <Building2 className="w-4 h-4 text-sky-300" />
          <span>Option 1: Get Company Details</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveOption("jobs")}
          className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl font-bold text-sm transition ${
            activeOption === "jobs"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 border border-emerald-400/40"
              : "bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60"
          }`}
        >
          <Briefcase className="w-4 h-4 text-emerald-300" />
          <span>Option 2: Get Jobs from Companies</span>
        </button>
      </div>

      {/* Title & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
            {activeOption === "details" ? (
              <>
                <Building2 className="w-6 h-6 text-sky-400" /> Option 1: Get Company Details & Enrichment
              </>
            ) : (
              <>
                <Briefcase className="w-6 h-6 text-emerald-400" /> Option 2: Get Jobs from Companies
              </>
            )}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {activeOption === "details"
              ? "Upload CSV/Excel of companies to discover official URLs, career portals, ATS platforms, public API endpoints, industry, and location, then export as a 12-column Excel file."
              : "Upload CSV/Excel of companies, configure scraping filters (country, role, posted date), and extract live job postings directly into the database."}
          </p>
        </div>

        {companies.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {activeOption === "details" ? (
              <>
                <button
                  onClick={handleFindCompanies}
                  disabled={discovering || startingScrape || downloadingExcel}
                  className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition shadow-lg shadow-sky-600/20"
                  title="Discover official URLs, career portals, ATS, public API, industry, and location"
                >
                  {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>1. Discover Company Details ({selectedIndices.size || companies.length})</span>
                </button>

                <button
                  onClick={handleDownloadCompanyDetails}
                  disabled={!hasDiscovered || downloadingExcel || discovering || startingScrape}
                  className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-xs rounded-xl transition shadow-lg ${
                    hasDiscovered
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 ring-2 ring-emerald-400/40"
                      : "bg-slate-800 text-slate-500 border border-slate-700/80 cursor-not-allowed opacity-60"
                  }`}
                  title={
                    hasDiscovered
                      ? "Download the 12-column Excel sheet with all discovered company details"
                      : "Please click '1. Discover Company Details' first to run discovery"
                  }
                >
                  {downloadingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>2. Download Details Excel {hasDiscovered ? "(Ready)" : "(Locked)"}</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleStartBulkScrape}
                disabled={startingScrape || discovering || downloadingExcel}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition shadow-lg shadow-emerald-600/20"
              >
                {startingScrape ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                <span>Get Jobs Data ({selectedIndices.size || companies.length})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Live Batch Discovery Progress Banner */}
      {discoveryProgress && (
        <div className="bg-slate-800/90 border border-sky-500/40 rounded-2xl p-5 shadow-lg shadow-sky-950/20 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
            <span className="flex items-center gap-2 text-sky-400">
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              Discovering Company Details in Batches...
            </span>
            <span className="font-mono text-sky-300">
              {discoveryProgress.processed} / {discoveryProgress.total} Companies (
              {Math.round((discoveryProgress.processed / discoveryProgress.total) * 100)}%)
            </span>
          </div>

          <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-700/60">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  Math.round((discoveryProgress.processed / discoveryProgress.total) * 100)
                )}%`,
              }}
            />
          </div>

          <p className="text-[11px] text-slate-400">
            Extracting career URLs, official domains, ATS signatures, and public API data via live Google & DuckDuckGo search...
          </p>
        </div>
      )}

      {/* Upload Zone */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-800/80 border-2 border-dashed border-slate-700 rounded-2xl p-8 text-center hover:border-slate-500 transition relative">
          <input
            type="file"
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            onChange={handleFileUpload}
            disabled={uploading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
            <div className="p-4 rounded-full bg-slate-900/80 border border-slate-700 text-emerald-400">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-200">
                {uploading ? "Analyzing & validating file..." : "Drop your CSV or Excel file here"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Supports .csv and .xlsx with columns like <code className="text-emerald-400">company</code> or <code className="text-emerald-400">company_name</code>
              </p>
            </div>
          </div>
        </div>

        {/* Quick presets */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Quick Sample Batches
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Load ready-made company lists for instant testing without uploading files.
            </p>
          </div>

          <div className="space-y-2 mt-4">
            <button
              onClick={() =>
                loadPreset([
                  { companyName: "ServiceNow" },
                  { companyName: "GitLab" },
                  { companyName: "Microsoft" },
                  { companyName: "Adobe" },
                  { companyName: "Salesforce" },
                ])
              }
              className="w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-700/60 text-xs font-medium text-slate-300 transition flex items-center justify-between"
            >
              <span>Enterprise Tech (5 Companies)</span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">Load</span>
            </button>

            <button
              onClick={() =>
                loadPreset([
                  { companyName: "Rippling" },
                  { companyName: "Stripe" },
                  { companyName: "Airbnb" },
                  { companyName: "Figma" },
                ])
              }
              className="w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-700/60 text-xs font-medium text-slate-300 transition flex items-center justify-between"
            >
              <span>High Growth Tech (4 Companies)</span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">Load</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-300 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload Summary & Validation */}
      {fileInfo && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-800/80 border border-slate-700/70 p-4 rounded-xl flex items-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-emerald-400" />
            <div>
              <span className="text-xs text-slate-400 block">Loaded File</span>
              <span className="text-sm font-semibold text-slate-200">{fileInfo.filename}</span>
            </div>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/70 p-4 rounded-xl flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            <div>
              <span className="text-xs text-slate-400 block">Valid Companies</span>
              <span className="text-sm font-semibold text-slate-200">
                {companies.length} / {fileInfo.total} Rows
              </span>
            </div>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/70 p-4 rounded-xl flex items-center gap-3">
            <Search className="w-8 h-8 text-indigo-400" />
            <div>
              <span className="text-xs text-slate-400 block">Detected Column</span>
              <span className="text-sm font-semibold text-indigo-300 font-mono">
                {fileInfo.detectedColumn}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Scraping Filters Panel (Option 2 Only) */}
      {activeOption === "jobs" && companies.length > 0 && (
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-emerald-400" /> Bulk Scraping Filters (Optional)
            </span>
            <span className="text-[11px] text-slate-400">
              Filters applied across all selected companies during job extraction
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Country Filter</label>
              <input
                type="text"
                placeholder="e.g. United States, United Kingdom, India... (Leave blank for all)"
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Job Title / Role Keyword</label>
              <input
                type="text"
                placeholder="e.g. Developer, Manager, Nurse... (Leave blank for all)"
                value={filterKeyword}
                onChange={(e) => setFilterKeyword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Posted Date Filter</label>
              <select
                value={filterDays ?? ""}
                onChange={(e) => setFilterDays(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
      )}

      {/* Companies Preview Table with Filters & Selection */}
      {companies.length > 0 && (
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-sm space-y-0">
          <div className="p-4 border-b border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white transition"
              >
                {selectedIndices.size === companies.length ? (
                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500" />
                )}
                <span>Select All ({selectedIndices.size}/{companies.length})</span>
              </button>
            </div>

            {/* Table Inline Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search table..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-40"
              />

              {distinctAts.length > 0 && (
                <select
                  value={tableAtsFilter}
                  onChange={(e) => setTableAtsFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">All ATS ({distinctAts.length})</option>
                  {distinctAts.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              )}

              <button
                onClick={() => {
                  setCompanies([]);
                  setFileInfo(null);
                  setDiscoveredMap({});
                  setSelectedIndices(new Set());
                }}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 ml-2"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700/80 uppercase font-semibold sticky top-0 z-10 backdrop-blur">
                <tr>
                  <th className="p-3.5 w-10 text-center">Sel</th>
                  <th className="p-3.5">#</th>
                  <th className="p-3.5">Company Name</th>
                  <th className="p-3.5">Official URL</th>
                  <th className="p-3.5">Career URL</th>
                  <th className="p-3.5">ATS Provider</th>
                  <th className="p-3.5">Public API</th>
                  <th className="p-3.5">Detection Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredCompaniesWithIndices.map(({ comp, idx }) => {
                  const disc = discoveredMap[comp.companyName.toLowerCase()];
                  const isSelected = selectedIndices.has(idx);
                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-700/30 transition ${
                        isSelected ? "bg-slate-800/40" : "opacity-60"
                      }`}
                    >
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSelectIndex(idx)}
                          className="hover:scale-110 transition"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500" />
                          )}
                        </button>
                      </td>
                      <td className="p-3.5 text-slate-500 font-mono">{(comp as any).id || idx + 1}</td>
                      <td className="p-3.5 font-bold text-slate-200">{comp.companyName}</td>
                      <td className="p-3.5 font-mono text-slate-400">
                        {disc?.companyUrl ? (
                          <a
                            href={disc.companyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline flex items-center gap-1"
                          >
                            <span>{disc.companyUrl.replace(/^https?:\/\//, "")}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          comp.companyUrl || <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-slate-400">
                        {disc?.careerUrl ? (
                          <a
                            href={disc.careerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:underline flex items-center gap-1"
                          >
                            <span>{disc.careerUrl.replace(/^https?:\/\//, "")}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          comp.careerUrl || <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        {disc ? (
                          <span className="font-medium text-slate-300">{disc.ats}</span>
                        ) : comp.ats ? (
                          <span className="font-medium text-slate-400">{comp.ats}</span>
                        ) : (
                          <span className="text-slate-500">Unchecked</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        {disc ? (
                          disc.public_api ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono" title={disc.public_api_data}>
                              TRUE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700/50 text-slate-400 border border-slate-600/30 font-mono">
                              FALSE
                            </span>
                          )
                        ) : (
                          <span className="text-slate-500 font-mono">—</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        {disc ? (
                          <StatusBadge status={disc.detectionStatus} type="detection" />
                        ) : (
                          <span className="text-slate-500">Pending</span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => {
                            const newCompanies = companies.filter((_, i) => i !== idx);
                            setCompanies(newCompanies);
                            const nextSelected = new Set<number>();
                            newCompanies.forEach((_, i) => nextSelected.add(i));
                            setSelectedIndices(nextSelected);
                          }}
                          className="p-1 hover:text-rose-400 text-slate-500 transition"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
