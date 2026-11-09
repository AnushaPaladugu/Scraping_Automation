import React from "react";

interface ProgressBarProps {
  current: number;
  total: number;
  successful?: number;
  noJobs?: number;
  failed?: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  total,
  successful = 0,
  noJobs = 0,
  failed = 0,
}) => {
  const percentage = total > 0 ? Math.min(100, Math.round((successful / total) * 100)) : 0;

  return (
    <div className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl p-5">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">Overall Progress</span>
          <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300 font-mono">
            {current} / {total} Companies
          </span>
        </div>
        <span className="text-base font-bold text-emerald-400 font-mono">{percentage}%</span>
      </div>

      <div className="w-full h-3 bg-slate-700/70 rounded-full overflow-hidden flex">
        <div
          className="h-full bg-emerald-500 transition-all duration-300 ease-out"
          style={{ width: `${total > 0 ? (successful / total) * 100 : 0}%` }}
          title={`Successful: ${successful}`}
        />
        <div
          className="h-full bg-slate-400 transition-all duration-300 ease-out"
          style={{ width: `${total > 0 ? (noJobs / total) * 100 : 0}%` }}
          title={`No Jobs: ${noJobs}`}
        />
        <div
          className="h-full bg-rose-500 transition-all duration-300 ease-out"
          style={{ width: `${total > 0 ? (failed / total) * 100 : 0}%` }}
          title={`Failed: ${failed}`}
        />
      </div>

      <div className="flex gap-4 mt-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="text-slate-400">Success:</span>
          <span className="font-semibold text-slate-200">{successful}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-400"></span>
          <span className="text-slate-400">No Jobs:</span>
          <span className="font-semibold text-slate-200">{noJobs}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          <span className="text-slate-400">Failed:</span>
          <span className="font-semibold text-slate-200">{failed}</span>
        </div>
      </div>
    </div>
  );
};
