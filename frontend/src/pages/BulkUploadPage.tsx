import React, { useState, useMemo, useEffect, useCallback } from "react";
import { BulkScrapingTask, CompanyDiscoveryResult, S3UploadInfo, UploadedFileRecord } from "../types";
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
  Database,
  Cloud,
  RefreshCw,
  FolderOpen,
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
  const { activeTaskId, setActiveTaskId } = useApp();
  const [activeOption, setActiveOption] = useState<"details" | "jobs">("details");
  const [companies, setCompanies] = useState<Array<{ companyName: string; companyUrl?: string; careerUrl?: string; ats?: string; industry?: string; city?: string; state?: string; country?: string }>>([]);
  const [fileInfo, setFileInfo] = useState<{ filename: string; total: number; detectedColumn: string } | null>(null);
  const [invalidRows, setInvalidRows] = useState<Array<{ rowNumber: number; reason: string }>>([]);
  const [discoveredMap, setDiscoveredMap] = useState<Record<string, CompanyDiscoveryResult>>({});
  const [hasDiscovered, setHasDiscovered] = useState(false);

  // S3 & DB Upload State
  const [currentUploadId, setCurrentUploadId] = useState<string | null>(null);
  const [s3Info, setS3Info] = useState<S3UploadInfo | null>(null);
  const [storageStatus, setStorageStatus] = useState<"stored" | "skipped" | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [savedUploads, setSavedUploads] = useState<UploadedFileRecord[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [loadingSavedId, setLoadingSavedId] = useState<string | null>(null);
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);

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
  const [downloadingJobs, setDownloadingJobs] = useState<"excel" | "json" | null>(null);
  const [lastScrapeTask, setLastScrapeTask] = useState<BulkScrapingTask | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSavedUploads = useCallback(async () => {
    setLoadingUploads(true);
    try {
      const res = await apiService.listUploadedFiles(15);
      setSavedUploads(res.uploads || []);
    } catch {
      // Silently ignore if backend/DB is temporarily unavailable on initial load
    } finally {
      setLoadingUploads(false);
    }
  }, []);

  useEffect(() => {
    fetchSavedUploads();
  }, [fetchSavedUploads]);

  useEffect(() => {
    if (!activeTaskId) {
      setLastScrapeTask(null);
      return;
    }

    let isMounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pollTask = async () => {
      try {
        const task = await apiService.getScrapeStatus(activeTaskId);
        if (!isMounted) return;
        setLastScrapeTask(task);
        if (task.status === "queued" || task.status === "processing") {
          timer = setTimeout(pollTask, 2000);
        }
      } catch {
        if (isMounted) setLastScrapeTask(null);
      }
    };

    pollTask();
    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [activeTaskId]);

  // File Upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setStorageNotice(null);
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
      setCurrentUploadId(res.uploadId || null);
      setS3Info(res.s3 || null);
      setStorageStatus(res.storageStatus || null);
      setStorageNotice(res.warning || null);
      // Select all uploaded companies by default
      setSelectedIndices(new Set(res.companies.map((_, i) => i)));
      await fetchSavedUploads();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Failed to parse file");
    } finally {
      setUploading(false);
    }
  };

  const handleLoadSavedUpload = async (uploadId: string) => {
    setLoadingSavedId(uploadId);
    setError(null);
    setStorageNotice(null);
    setDiscoveredMap({});
    setHasDiscovered(false);
    try {
      const res = await apiService.loadUploadedFile(uploadId);
      setCompanies(res.companies);
      setFileInfo({
        filename: res.filename,
        total: res.totalRows,
        detectedColumn: res.detectedColumn || "company_name",
      });
      setInvalidRows(res.invalidRows || []);
      setCurrentUploadId(res.uploadId);
      setStorageStatus(res.file.storageStatus === "stored" ? "stored" : "skipped");
      setS3Info(
        res.file.s3Key && res.file.s3Bucket
          ? {
              bucket: res.file.s3Bucket,
              key: res.file.s3Key,
              etag: res.file.s3Etag || undefined,
              size: res.file.fileSize,
              contentType: res.file.mimeType,
              uploadedAt: res.file.createdAt,
              downloadUrl: res.file.downloadUrl,
            }
          : null
      );
      setSelectedIndices(new Set(res.companies.map((_, i) => i)));
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Failed to load saved upload");
    } finally {
      setLoadingSavedId(null);
    }
  };

  const handleDeleteSavedUpload = async (uploadId: string) => {
    setDeletingUploadId(uploadId);
    setError(null);
    try {
      await apiService.deleteUploadedFile(uploadId);
      if (currentUploadId === uploadId) {
        setCurrentUploadId(null);
        setS3Info(null);
        setStorageStatus(null);
      }
      await fetchSavedUploads();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Failed to delete upload");
    } finally {
      setDeletingUploadId(null);
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
    setCurrentUploadId(null);
    setS3Info(null);
    setStorageStatus(null);
    setStorageNotice(null);
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
      const res = await apiService.startBulkScrape(targetCompanies, filters, {
        sourceUploadId: currentUploadId || undefined,
        sourceFilename: fileInfo?.filename,
      });
      setActiveTaskId(res.taskId);
      onStartBulkScrape?.(res.taskId);
      navigate({ to: "/scraping", search: { taskId: res.taskId } });
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Failed to start bulk scraping");
      setStartingScrape(false);
    }
  };

  const handleDownloadScrapedJobs = async (format: "excel" | "json") => {
    if (!lastScrapeTask) return;
    setDownloadingJobs(format);
    setError(null);
    try {
      const baseName = fileInfo?.filename
        ? `jobs_${fileInfo.filename.replace(/\.[^.]+$/, "")}`
        : `task_${lastScrapeTask.taskId.slice(0, 8)}_jobs`;
      if (format === "excel") {
        await apiService.downloadJobsExcel({
          taskId: lastScrapeTask.taskId,
          filename: baseName,
        });
      } else {
        await apiService.downloadJobsJson({
          taskId: lastScrapeTask.taskId,
          filename: baseName,
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || `Failed to download jobs ${format.toUpperCase()}`);
    } finally {
      setDownloadingJobs(null);
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
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-4">
        <button
          type="button"
          onClick={() => setActiveOption("details")}
          className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl font-bold text-sm transition ${
            activeOption === "details"
              ? "bg-sky-600 text-white shadow-md shadow-sky-600/20"
              : "bg-white text-slate-600 hover:text-slate-900 border border-slate-300 shadow-xs"
          }`}
        >
          <Building2 className="w-4 h-4 text-sky-200" />
          <span>Option 1: Get Company Details</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveOption("jobs")}
          className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl font-bold text-sm transition ${
            activeOption === "jobs"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
              : "bg-white text-slate-600 hover:text-slate-900 border border-slate-300 shadow-xs"
          }`}
        >
          <Briefcase className="w-4 h-4 text-emerald-200" />
          <span>Option 2: Get Jobs from Companies</span>
        </button>
      </div>

      {/* Title & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            {activeOption === "details" ? (
              <>
                <Building2 className="w-6 h-6 text-sky-600" /> Option 1: Get Company Details & Enrichment
              </>
            ) : (
              <>
                <Briefcase className="w-6 h-6 text-emerald-600" /> Option 2: Get Jobs from Companies
              </>
            )}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
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
                  className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition shadow-md shadow-sky-600/20"
                  title="Discover official URLs, career portals, ATS, public API, industry, and location"
                >
                  {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>1. Discover Company Details ({selectedIndices.size || companies.length})</span>
                </button>

                <button
                  onClick={handleDownloadCompanyDetails}
                  disabled={!hasDiscovered || downloadingExcel || discovering || startingScrape}
                  className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-xs rounded-xl transition shadow-md ${
                    hasDiscovered
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 ring-2 ring-emerald-400/40"
                      : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
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
              <>
                <button
                  onClick={handleStartBulkScrape}
                  disabled={startingScrape || discovering || downloadingExcel}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition shadow-md shadow-emerald-600/20"
                >
                  {startingScrape ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>1. Get Jobs Data ({selectedIndices.size || companies.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadScrapedJobs("excel")}
                  disabled={!lastScrapeTask || lastScrapeTask.totalValidJobs === 0 || downloadingJobs !== null}
                  className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-xs rounded-xl transition shadow-md ${
                    lastScrapeTask && lastScrapeTask.totalValidJobs > 0
                      ? "bg-sky-600 hover:bg-sky-500 text-white shadow-sky-600/20 ring-2 ring-sky-400/40"
                      : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
                  }`}
                  title={
                    lastScrapeTask && lastScrapeTask.totalValidJobs > 0
                      ? `Download ${lastScrapeTask.totalValidJobs} scraped jobs from task ${lastScrapeTask.taskId.slice(0, 8)} as Excel (.xlsx)`
                      : "Click '1. Get Jobs Data' first to scrape jobs"
                  }
                >
                  {downloadingJobs === "excel" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>
                    2. Download Jobs Excel{" "}
                    {lastScrapeTask && lastScrapeTask.totalValidJobs > 0
                      ? `(${lastScrapeTask.totalValidJobs} Ready)`
                      : "(Locked)"}
                  </span>
                </button>

                {lastScrapeTask && lastScrapeTask.totalValidJobs > 0 && (
                  <button
                    type="button"
                    onClick={() => handleDownloadScrapedJobs("json")}
                    disabled={downloadingJobs !== null}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs rounded-xl transition shadow-xs"
                    title="Download scraped jobs as JSON"
                  >
                    {downloadingJobs === "json" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span>JSON</span>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Live Batch Discovery Progress Banner */}
      {discoveryProgress && (
        <div className="bg-white border border-sky-300 rounded-2xl p-5 shadow-xs space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
            <span className="flex items-center gap-2 text-sky-700">
              <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
              Discovering Company Details in Batches...
            </span>
            <span className="font-mono text-sky-700">
              {discoveryProgress.processed} / {discoveryProgress.total} Companies (
              {Math.round((discoveryProgress.processed / discoveryProgress.total) * 100)}%)
            </span>
          </div>

          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
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

          <p className="text-[11px] text-slate-500">
            Extracting career URLs, official domains, ATS signatures, and public API data via live Google & DuckDuckGo search...
          </p>
        </div>
      )}

      {/* Upload Zone */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-emerald-500 transition relative shadow-xs">
          <input
            type="file"
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            onChange={handleFileUpload}
            disabled={uploading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
            <div className="p-4 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-800">
                {uploading ? "Analyzing & validating file..." : "Drop your CSV or Excel file here"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Supports .csv and .xlsx with columns like <code className="text-emerald-700 font-semibold">company</code> or <code className="text-emerald-700 font-semibold">company_name</code>
              </p>
            </div>
          </div>
        </div>

        {/* Quick presets */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between shadow-xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Quick Sample Batches
            </h3>
            <p className="text-xs text-slate-500 mt-1">
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
              className="w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700 transition flex items-center justify-between"
            >
              <span>Enterprise Tech (5 Companies)</span>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-semibold">Load</span>
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
              className="w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700 transition flex items-center justify-between"
            >
              <span>High Growth Tech (4 Companies)</span>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-semibold">Load</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Storage Notice (e.g. S3 pending setup while saved to MySQL) */}
      {storageNotice && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3 text-amber-800 text-xs">
          <Database className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{storageNotice}</span>
        </div>
      )}

      {/* Upload Summary & Validation */}
      {fileInfo && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center gap-3 shadow-xs">
            <FileSpreadsheet className="w-8 h-8 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs text-slate-500 block">Loaded File</span>
              <span className="text-sm font-semibold text-slate-800 block truncate">{fileInfo.filename}</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center gap-3 shadow-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
            <div>
              <span className="text-xs text-slate-500 block">Valid Companies</span>
              <span className="text-sm font-semibold text-slate-800">
                {companies.length} / {fileInfo.total} Rows
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center gap-3 shadow-xs">
            <Search className="w-8 h-8 text-indigo-600 shrink-0" />
            <div>
              <span className="text-xs text-slate-500 block">Detected Column</span>
              <span className="text-sm font-semibold text-indigo-700 font-mono">
                {fileInfo.detectedColumn}
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              {storageStatus === "stored" ? (
                <Cloud className="w-8 h-8 text-sky-600 shrink-0" />
              ) : (
                <Database className="w-8 h-8 text-slate-500 shrink-0" />
              )}
              <div className="min-w-0">
                <span className="text-xs text-slate-500 block">Persistence</span>
                <span className="text-sm font-semibold text-slate-800 block truncate">
                  {currentUploadId
                    ? storageStatus === "stored"
                      ? "MySQL + S3"
                      : "MySQL (S3 Pending)"
                    : "In-Memory Preset"}
                </span>
              </div>
            </div>
            {currentUploadId && storageStatus === "stored" && (
              <a
                href={s3Info?.downloadUrl || apiService.getUploadDownloadUrl(currentUploadId)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[11px] font-semibold shrink-0 flex items-center gap-1"
                title="Download original file from S3"
              >
                <Download className="w-3.5 h-3.5" />
                <span>S3</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Saved Uploads History (MySQL + S3) */}
      {(savedUploads.length > 0 || loadingUploads) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-900">Saved Bulk Uploads (MySQL & S3)</h3>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                {savedUploads.length}
              </span>
            </div>
            <button
              type="button"
              onClick={fetchSavedUploads}
              disabled={loadingUploads}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingUploads ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {savedUploads.map((item) => (
              <div key={item.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 truncate">{item.originalFilename}</div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                      <span>{item.validCount}/{item.totalRows} valid rows</span>
                      <span>•</span>
                      <span>
                        {item.storageStatus === "stored" ? "S3 + MySQL" : "MySQL only"}
                      </span>
                      <span>•</span>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleLoadSavedUpload(item.id)}
                    disabled={loadingSavedId === item.id}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1"
                  >
                    {loadingSavedId === item.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FolderOpen className="w-3.5 h-3.5" />
                    )}
                    <span>Load</span>
                  </button>

                  {item.canDownloadFromS3 && (
                    <a
                      href={apiService.getUploadDownloadUrl(item.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-semibold flex items-center gap-1"
                      title="Download original file from S3"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteSavedUpload(item.id)}
                    disabled={deletingUploadId === item.id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                    title="Delete saved upload"
                  >
                    {deletingUploadId === item.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pre-Scraping Filters Panel (Option 2 Only) */}
      {activeOption === "jobs" && companies.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-emerald-600" /> Bulk Scraping Filters (Optional)
            </span>
            <span className="text-[11px] text-slate-500">
              Filters applied across all selected companies during job extraction
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Country Filter</label>
              <input
                type="text"
                placeholder="e.g. United States, United Kingdom, India... (Leave blank for all)"
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Job Title / Role Keyword</label>
              <input
                type="text"
                placeholder="e.g. Developer, Manager, Nurse... (Leave blank for all)"
                value={filterKeyword}
                onChange={(e) => setFilterKeyword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Posted Date Filter</label>
              <select
                value={filterDays ?? ""}
                onChange={(e) => setFilterDays(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs space-y-0">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 transition"
              >
                {selectedIndices.size === companies.length ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
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
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-40"
              />

              {distinctAts.length > 0 && (
                <select
                  value={tableAtsFilter}
                  onChange={(e) => setTableAtsFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                  setInvalidRows([]);
                  setCurrentUploadId(null);
                  setS3Info(null);
                  setStorageStatus(null);
                  setStorageNotice(null);
                  setDiscoveredMap({});
                  setHasDiscovered(false);
                  setSelectedIndices(new Set());
                }}
                className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1 ml-2 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold sticky top-0 z-10 backdrop-blur">
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
              <tbody className="divide-y divide-slate-100">
                {filteredCompaniesWithIndices.map(({ comp, idx }) => {
                  const disc = discoveredMap[comp.companyName.toLowerCase()];
                  const isSelected = selectedIndices.has(idx);
                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50 transition ${
                        isSelected ? "bg-emerald-50/20" : "opacity-60"
                      }`}
                    >
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSelectIndex(idx)}
                          className="hover:scale-110 transition"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </td>
                      <td className="p-3.5 text-slate-400 font-mono">{(comp as any).id || idx + 1}</td>
                      <td className="p-3.5 font-bold text-slate-800">{comp.companyName}</td>
                      <td className="p-3.5 font-mono text-slate-600">
                        {disc?.companyUrl ? (
                          <a
                            href={disc.companyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <span>{disc.companyUrl.replace(/^https?:\/\//, "")}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          comp.companyUrl || <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-slate-600">
                        {disc?.careerUrl ? (
                          <a
                            href={disc.careerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:underline flex items-center gap-1"
                          >
                            <span>{disc.careerUrl.replace(/^https?:\/\//, "")}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          comp.careerUrl || <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        {disc ? (
                          <span className="font-medium text-slate-800">{disc.ats}</span>
                        ) : comp.ats ? (
                          <span className="font-medium text-slate-600">{comp.ats}</span>
                        ) : (
                          <span className="text-slate-400">Unchecked</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        {disc ? (
                          disc.public_api ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono" title={disc.public_api_data}>
                              TRUE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                              FALSE
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        {disc ? (
                          <StatusBadge status={disc.detectionStatus} type="detection" />
                        ) : (
                          <span className="text-slate-400">Pending</span>
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
                          className="p-1 hover:text-rose-600 text-slate-400 transition"
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
