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
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Confirmed
        </span>
      );
    }
    if (norm === "INFERRED") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Inferred
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> Failed
      </span>
    );
  }

  if (type === "method") {
    const methodColors: Record<string, string> = {
      API: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
      JSONLD: "bg-sky-500/10 text-sky-400 border-sky-500/30",
      STATIC: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      PLAYWRIGHT: "bg-purple-500/10 text-purple-400 border-purple-500/30",
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
          methodColors[norm] || "bg-slate-700 text-slate-300 border-slate-600"
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
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> 🟢 Success
        </span>
      );
    case "PROCESSING":
    case "DISCOVERING":
    case "SCRAPING":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> 🟡 Processing
        </span>
      );
    case "QUEUED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span> 🔵 Queued
        </span>
      );
    case "NO_JOBS":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-300 border border-slate-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> ⚪ No Jobs
        </span>
      );
    case "PARTIAL_SUCCESS":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span> 🟡 Partial
        </span>
      );
    case "FAILED":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> 🔴 Failed
        </span>
      );
  }
};
