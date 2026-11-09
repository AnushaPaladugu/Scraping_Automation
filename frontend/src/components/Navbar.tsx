import React from "react";
import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Search,
  UploadCloud,
  PlayCircle,
  Briefcase,
  Download,
  ScrollText,
} from "lucide-react";
import { useApp } from "../context/AppContext";

export type NavTab =
  | "dashboard"
  | "discovery"
  | "upload"
  | "scraping"
  | "jobs"
  | "exports"
  | "logs";

interface NavbarProps {
  activeTab?: NavTab;
  setActiveTab?: (tab: NavTab) => void;
  activeTaskId?: string | null;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTaskId: propActiveTaskId }) => {
  const { activeTaskId: contextActiveTaskId } = useApp();
  const currentActiveTaskId = propActiveTaskId ?? contextActiveTaskId;

  const navItems: Array<{ to: string; label: string; icon: React.ReactNode; badge?: string }> = [
    { to: "/", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
    { to: "/discovery", label: "Single Discovery", icon: <Search className="w-4 h-4" /> },
    { to: "/upload", label: "Bulk Companies", icon: <UploadCloud className="w-4 h-4" /> },
    {
      to: "/scraping",
      label: "Scraping Run",
      icon: <PlayCircle className="w-4 h-4" />,
      badge: currentActiveTaskId ? "Active" : undefined,
    },
    { to: "/jobs", label: "Jobs Results", icon: <Briefcase className="w-4 h-4" /> },
    { to: "/exports", label: "Exports", icon: <Download className="w-4 h-4" /> },
    { to: "/logs", label: "System Logs", icon: <ScrollText className="w-4 h-4" /> },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo with Link */}
          <Link to="/" className="flex items-center gap-3 group transition-transform hover:opacity-95">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-bold text-lg group-hover:scale-105 transition-transform">
              J
            </div>
            <div>
              <span className="font-bold text-slate-100 tracking-tight text-base">
                JobScrape<span className="text-emerald-400">Auto</span>
              </span>
              <span className="text-[10px] text-slate-400 block -mt-1 font-mono uppercase tracking-widest">
                Automation Platform
              </span>
            </div>
          </Link>

          {/* Navigation items with TanStack Router Link */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{
                  className: "bg-slate-800 text-emerald-400 border-slate-700 shadow-sm",
                }}
                inactiveProps={{
                  className: "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent",
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all"
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500 text-slate-950 font-bold animate-pulse">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {/* Status Indicator */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/60">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              Backend Ready
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
