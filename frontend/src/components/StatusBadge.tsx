import React from "react";

interface StatusBadgeProps {
  status: string;
  type?: "scraping" | "detection" | "method";
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type = "scraping" }) => {
  const norm = (status || "").toUpperCase();

  if (type === "detection") {
    if (norm === "CONFIRMED") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Confirmed
        </span>
      );
    }
    if (norm === "INFERRED") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Inferred
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Failed
      </span>
    );
  }

  if (type === "method") {
    const methodColors: Record<string, string> = {
      API: "bg-indigo-50 text-indigo-700 border-indigo-200",
      JSONLD: "bg-sky-50 text-sky-700 border-sky-200",
      STATIC: "bg-emerald-50 text-emerald-700 border-emerald-200",
      PLAYWRIGHT: "bg-purple-50 text-purple-700 border-purple-200",
    };
    const methodLabels: Record<string, string> = {
      API: "API (GET/POST)",
      JSONLD: "Dynamic (JSON-LD)",
      STATIC: "Static (HTML)",
      PLAYWRIGHT: "Dynamic (Playwright)",
    };
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border uppercase tracking-wider ${
          methodColors[norm] || "bg-slate-100 text-slate-700 border-slate-200"
        }`}
      >
        {methodLabels[norm] || status}
      </span>
    );
  }

  // Scraping statuses
  switch (norm) {
    case "SUCCESS":
    case "COMPLETED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 🟢 Success
        </span>
      );
    case "PROCESSING":
    case "DISCOVERING":
    case "SCRAPING":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> 🟡 Processing
        </span>
      );
    case "QUEUED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span> 🔵 Queued
        </span>
      );
    case "NO_JOBS":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> ⚪ No Jobs
        </span>
      );
    case "PARTIAL_SUCCESS":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span> 🟡 Partial
        </span>
      );
    case "FAILED":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> 🔴 Failed
        </span>
      );
  }
};
