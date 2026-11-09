import React from "react";
import { apiService } from "../services/api";
import {
  FileSpreadsheet,
  FileCode,
  Download,
  Building2,
  Briefcase,
  ScrollText,
} from "lucide-react";

export const ExportsPage: React.FC = () => {
  const exportCards = [
    {
      title: "Normalized Jobs (Excel)",
      description: "Complete dataset of all validated, deduplicated jobs formatted in Microsoft Excel format (.xlsx) with styled headers.",
      icon: <FileSpreadsheet className="w-8 h-8 text-emerald-400" />,
      url: apiService.getJobsExcelExportUrl(),
      filename: "normalized_jobs.xlsx",
      format: "XLSX",
      badge: "Recommended for Spreadsheets",
    },
    {
      title: "Normalized Jobs (JSON)",
      description: "Structured array of normalized job objects, including deterministic fingerprints, timestamps, and full descriptions.",
      icon: <FileCode className="w-8 h-8 text-blue-400" />,
      url: apiService.getJobsJsonExportUrl(),
      filename: "normalized_jobs.json",
      format: "JSON",
      badge: "API / Ingestion Ready",
    },
    {
      title: "Discovered Companies (Excel)",
      description: "List of all discovered companies, official URLs, careers pages, ATS detection status, confidence scores, and API endpoints.",
      icon: <Building2 className="w-8 h-8 text-purple-400" />,
      url: apiService.getCompaniesExcelExportUrl(),
      filename: "discovered_companies.xlsx",
      format: "XLSX",
      badge: "Company Directory",
    },
    {
      title: "Discovered Companies (JSON)",
      description: "Structured JSON objects for all verified company profiles, detection methods, and ATS mappings.",
      icon: <FileCode className="w-8 h-8 text-indigo-400" />,
      url: apiService.getCompaniesJsonExportUrl(),
      filename: "discovered_companies.json",
      format: "JSON",
      badge: "Directory JSON",
    },
    {
      title: "Scraping Logs & Diagnostics (JSON)",
      description: "Structured execution logs for debugging pipeline stages, timeouts, strategy selections, and errors.",
      icon: <ScrollText className="w-8 h-8 text-amber-400" />,
      url: apiService.getLogsJsonExportUrl(),
      filename: "scraping_logs.json",
      format: "JSON",
      badge: "Audit / Debugging",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Data Export Center</h1>
        <p className="text-sm text-slate-400 mt-1">
          Download cleaned and normalized data files in standard formats anytime without re-scraping.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {exportCards.map((card, idx) => (
          <div
            key={idx}
            className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-600 transition shadow-sm space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-700/60">
                  {card.icon}
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-700 text-slate-300 font-medium">
                  {card.format}
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">{card.title}</h3>
                <span className="text-[11px] text-emerald-400 font-medium block mt-0.5">
                  {card.badge}
                </span>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  {card.description}
                </p>
              </div>
            </div>

            <div className="pt-2">
              <a
                href={card.url}
                download={card.filename}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition shadow-lg shadow-emerald-600/20"
              >
                <Download className="w-4 h-4" />
                <span>Download {card.filename}</span>
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
