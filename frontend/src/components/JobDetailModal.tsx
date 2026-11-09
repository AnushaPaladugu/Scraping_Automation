import React from "react";
import { NormalizedJob } from "../types";
import { X, ExternalLink, Building2, MapPin, DollarSign, Calendar, Briefcase } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

interface JobDetailModalProps {
  job: NormalizedJob | null;
  onClose: () => void;
}

export const JobDetailModal: React.FC<JobDetailModalProps> = ({ job, onClose }) => {
  if (!job) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-800 bg-slate-900/50">
          <div className="space-y-1 pr-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {job.ats || "General Portal"}
              </span>
              <StatusBadge status={job.source_type} type="method" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">{job.job_title}</h2>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Building2 className="w-4 h-4 text-slate-400" />
              <span>{job.company_name}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Key Facts */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-800/50 border border-slate-700/60 rounded-xl text-sm">
            <div>
              <span className="text-xs text-slate-400 block flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> Location
              </span>
              <span className="font-medium text-slate-200">{job.location || "Not specified"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5" /> Workplace Type
              </span>
              <span className="font-medium text-slate-200">
                {job.remote_type || "Onsite / Unspecified"}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" /> Salary
              </span>
              <span className="font-medium text-slate-200">{job.salary || "Not disclosed"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Posted Date
              </span>
              <span className="font-medium text-slate-200">{job.posted_date || "Recent"}</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-2">
              Job Description
            </h3>
            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line bg-slate-950/40 p-4 rounded-xl border border-slate-800/80 max-h-72 overflow-y-auto font-sans">
              {job.description || "No full description text was available on the page."}
            </div>
          </div>

          {/* Metadata / Fingerprint */}
          <div className="text-xs text-slate-500 font-mono space-y-1 p-3 bg-slate-950/60 rounded-lg border border-slate-800">
            <div>Job ID: {job.job_id || "N/A"}</div>
            <div>Fingerprint: {job.fingerprint}</div>
            <div>Scraped At: {job.scraped_at}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center">
          <a
            href={job.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition"
          >
            <span>Apply / View Posting</span>
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
