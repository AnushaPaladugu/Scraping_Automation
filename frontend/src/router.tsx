import React from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Navigate,
} from "@tanstack/react-router";
import { Navbar } from "./components/Navbar";
import { DashboardPage } from "./pages/DashboardPage";
import { CompanyDiscoveryPage } from "./pages/CompanyDiscoveryPage";
import { BulkUploadPage } from "./pages/BulkUploadPage";
import { ScrapingProgressPage } from "./pages/ScrapingProgressPage";
import { JobsResultsPage } from "./pages/JobsResultsPage";
import { ExportsPage } from "./pages/ExportsPage";
import { LogsPage } from "./pages/LogsPage";

// Root Layout Route
const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        Job Scraping Automation Platform • Production Ready Modular Engine • Storage & Database Ready Architecture
      </footer>
    </div>
  ),
});

// Route Definitions
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: () => <Navigate to="/" replace />,
});

const discoveryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discovery",
  component: CompanyDiscoveryPage,
});

const uploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/upload",
  component: BulkUploadPage,
});

export interface ScrapingSearch {
  taskId?: string;
}

export interface JobsSearch {
  company?: string;
  taskId?: string;
}

const scrapingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/scraping",
  validateSearch: (search: Record<string, unknown>): ScrapingSearch => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
  component: ScrapingProgressPage,
});

const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/jobs",
  validateSearch: (search: Record<string, unknown>): JobsSearch => ({
    company: typeof search.company === "string" ? search.company : undefined,
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
  component: JobsResultsPage,
});

const exportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/exports",
  component: ExportsPage,
});

const logsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/logs",
  component: LogsPage,
});

// Route Tree Assembly
const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  discoveryRoute,
  uploadRoute,
  scrapingRoute,
  jobsRoute,
  exportsRoute,
  logsRoute,
]);

// Router Instance
export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

// Module Augmentation for Type Safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
