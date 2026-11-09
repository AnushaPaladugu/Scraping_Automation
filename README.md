# Job Scraping Automation Platform

A modern, production-ready, full-stack platform designed to automate company discovery, official website & careers page verification, ATS detection, dynamic scraping strategy selection, job field normalization, validation, deduplication, and multi-format export (Excel & JSON).

---

## 🚀 Key Features & Architectural Highlights

### 1. Single & Bulk Company Discovery
- **Verified Discovery**: Verifies company domain, page titles, OpenGraph metadata, and career links without fabricating URLs.
- **ATS Detection**: Automatically detects 15+ major ATS providers (Greenhouse, Lever, Ashby, BambooHR, SmartRecruiters, Workable, Rippling, Workday, iCIMS, Taleo, SAP SuccessFactors, Jobvite, Eightfold, and custom portals).
- **Endpoint & Slug Extraction**: Extracts company board slugs and REST/RSS endpoints.
- **Bulk Upload**: Supports CSV and Excel (.xlsx, .xls) uploads with automatic column detection, previewing, and validation.

### 2. Scraping Strategy Engine
Dynamically determines the optimal scraping strategy for each company:
1. **API / ATS Strategy**: Directly extracts structured jobs from verified ATS REST APIs (Greenhouse, Lever, Ashby, SmartRecruiters, BambooHR, Workable, Rippling).
2. **JSON-LD Schema Strategy**: Extracts `schema.org/JobPosting` structured schemas directly from HTML.
3. **Static HTML Strategy**: Parses job cards, vacancy links, and tables using Cheerio.
4. **Playwright Dynamic Strategy**: Headless browser fallback for SPAs (React/Vue/Angular) with hydration waits and dynamic DOM extraction.

### 3. Modular Field Processors (Refactored from Existing Scripts)
Raw scraped job fields are passed through 8 dedicated, reusable processing modules:
- `titleProcessor`: Decodes HTML entities with `he`, removes noise tags (`(m/w/d)`, `[Remote]`, requisition IDs).
- `locationProcessor`: Parses city, state, country, handles 2-letter US state lookups, and classifies remote type (`Remote`, `Hybrid`, `Onsite`).
- `descriptionProcessor`: Refactored from `cleanText.ts` with tag stripping, `<br>/<p>/<li>` normalization, CSS pattern removal, and entity decoding.
- `salaryProcessor`: Parses JSON-LD `baseSalary` objects, salary ranges, and text compensation into standardized formats.
- `employmentTypeProcessor`: Normalizes to `Full-time`, `Part-time`, `Contract`, `Internship`, `Temporary`.
- `companyProcessor`: Standardizes company names and strips legal entity suffixes.
- `jobUrlProcessor`: Strips tracking query parameters (`utm_*`, `ref`, `tracking`) and extracts stable job IDs.
- `dateProcessor`: Standardizes dates to UTC ISO strings.

### 4. Job Validation & Deduplication
- **Validation**: Enforces minimum required fields (`company_name`, `job_title`, `job_url`). Rejection reasons are recorded in `rejected_jobs.json`.
- **Deduplication**: Multi-level indexing with stable `job_id`, normalized URL keys, and SHA-256 composite fingerprints (`company|title|location|url`).

### 5. Task & Queue Architecture
- Asynchronous background runner with concurrency control (`p-limit`).
- Real-time polling via `GET /api/scrape/status/:taskId`.
- Per-company isolation ensures failures on individual targets do not halt bulk processing.
- Multi-status handling: `SUCCESS`, `NO_JOBS`, `PARTIAL_SUCCESS`, `FAILED`.

### 6. Storage Layer & Future Database Readiness
- Designed around the `IStorageService` interface.
- Initial implementation uses `FileStorageService` (JSON & Excel).
- Clean separation allows plugging in `DatabaseStorageService` (PostgreSQL / MySQL / Prisma / Drizzle) without rewriting any scraping or processing logic.

---

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite, Lucide Icons, Axios.
- **Backend**: Node.js, Express, TypeScript, Playwright, Cheerio, ExcelJS, csv-parser, he, p-limit, vitest.
- **Storage**: Excel (.xlsx) and JSON files under `./data` and `./exports`.

---

## 📂 Project Structure

```
Scraping_Automation/
├── backend/
│   ├── src/
│   │   ├── config/index.ts
│   │   ├── types/
│   │   │   ├── company.ts
│   │   │   ├── job.ts
│   │   │   ├── scraper.ts
│   │   │   ├── task.ts
│   │   │   └── storage.ts
│   │   ├── discovery/
│   │   │   ├── atsDetector.service.ts
│   │   │   ├── websiteVerifier.service.ts
│   │   │   └── companyDiscovery.service.ts
│   │   ├── scrapers/
│   │   │   ├── scraper.interface.ts
│   │   │   ├── strategyEngine.ts
│   │   │   ├── api/
│   │   │   │   ├── apiScraper.ts
│   │   │   │   └── adapters/ (greenhouse, lever, ashby, bamboohr, smartrecruiters, workable, rippling)
│   │   │   ├── jsonld/jsonLdScraper.ts
│   │   │   ├── static/staticScraper.ts
│   │   │   └── playwright/playwrightScraper.ts
│   │   ├── processors/
│   │   │   ├── titleProcessor.ts
│   │   │   ├── locationProcessor.ts
│   │   │   ├── descriptionProcessor.ts
│   │   │   ├── salaryProcessor.ts
│   │   │   ├── employmentTypeProcessor.ts
│   │   │   ├── companyProcessor.ts
│   │   │   ├── jobUrlProcessor.ts
│   │   │   ├── dateProcessor.ts
│   │   │   └── index.ts
│   │   ├── validators/jobValidator.ts
│   │   ├── deduplication/deduplicator.ts
│   │   ├── storage/
│   │   │   ├── storage.interface.ts
│   │   │   └── fileStorage.service.ts
│   │   ├── exporters/
│   │   │   ├── excelExporter.ts
│   │   │   └── jsonExporter.ts
│   │   ├── tasks/
│   │   │   ├── taskManager.ts
│   │   │   └── bulkScrapingRunner.ts
│   │   ├── controllers/
│   │   │   ├── company.controller.ts
│   │   │   ├── scrape.controller.ts
│   │   │   ├── job.controller.ts
│   │   │   └── log.controller.ts
│   │   ├── routes/
│   │   ├── utils/
│   │   ├── app.ts
│   │   └── server.ts
│   └── tests/
│       ├── atsDetector.test.ts
│       ├── processors.test.ts
│       ├── deduplicator.test.ts
│       ├── validator.test.ts
│       ├── scrapers.test.ts
│       └── discovery.test.ts
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── MetricCard.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   └── JobDetailModal.tsx
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── CompanyDiscoveryPage.tsx
│   │   │   ├── BulkUploadPage.tsx
│   │   │   ├── ScrapingProgressPage.tsx
│   │   │   ├── JobsResultsPage.tsx
│   │   │   ├── ExportsPage.tsx
│   │   │   └── LogsPage.tsx
│   │   ├── services/api.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
└── README.md
```

---

## 🏃 Getting Started

### 1. Backend Setup
```bash
cd backend
npm install
npx playwright install chromium
npm run test     # Runs vitest test suite
npm run dev      # Starts server on http://localhost:5000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev      # Starts dashboard on http://localhost:3000
```

---

## 🌐 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/company/discover` | Discover official website, career URL, and ATS for a single company |
| `POST` | `/api/companies/upload` | Upload CSV or Excel file of companies with column detection |
| `POST` | `/api/companies/discover` | Batch discovery for multiple companies |
| `GET` | `/api/companies` | List all discovered companies |
| `POST` | `/api/scrape/company` | Scrape jobs for a single company using the strategy engine |
| `POST` | `/api/scrape/bulk` | Start background asynchronous bulk scraping task (returns `taskId`) |
| `GET` | `/api/scrape/status/:jobId` | Poll task progress and company-by-company status |
| `POST` | `/api/scrape/cancel/:jobId` | Cancel a running bulk scrape task |
| `GET` | `/api/jobs` | Query normalized jobs with filters, search, and pagination |
| `GET` | `/api/jobs/metrics` | Summary metrics for dashboard |
| `GET` | `/api/jobs/rejected` | List rejected job records with reasons |
| `GET` | `/api/jobs/export/excel` | Download all normalized jobs as `.xlsx` |
| `GET` | `/api/jobs/export/json` | Download all normalized jobs as `.json` |
| `GET` | `/api/companies/export/excel`| Download discovered companies as `.xlsx` |
| `GET` | `/api/logs` | Fetch structured system logs |
