# Project: HisseRadarPro

## Architecture Overview
- **Frontend**: React (Vite / Tailwind / Lucide / Recharts), Terminal Aesthetic (black background `#000000`/`#0a0a0c`, neon accents `#00ff66`/`#00f0ff`/`#ff0055`/`#ffaa00`, monospace font `Roboto Mono`).
- **Backend**: FastAPI / Python, SQLite database (`scraped_reports.db` with indexes on `ticker`, `broker`, `rating`, `report_date`, `potansiyel`), async endpoints in `main.py` (Port 8015).
- **Scrapers & LLM**: Web scrapers (`GarantiScraper`, `DenizScraper`) using `curl_cffi` / Playwright, PDF parser, LLM integration with strict SHA-256 caching (`CacheManager`), prompt logging (`llm_audit.log`), and Turkish financial regex parsing.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: System Audit | Codebase inspection across FE, BE, scrapers, LLM | None | DONE |
| 2 | M2: Backend & DB Optimization | `main.py`, `db_manager.py`, async DB reads, SQL queries & indexes, API endpoints | M1 | DONE |
| 3 | M3: Scraper & LLM Caching | `backend/scrapers`, LLM caching, prompt logging, regex fixes, Deniz WAF fix | M1 | DONE |
| 4 | M4: Frontend Terminal UI & Virtualization | `ResearchReports.jsx`, `Screener.jsx` pagination/virtualization, terminal CSS variables | M1, M2, M3 | DONE |
| 5 | M5: E2E Verification & Forensic Audit | `npm run build`, backend API 200 OK verification, Forensic Auditor | M1-M4 | DONE |

## Interface Contracts
- Backend API listens on port 8015 (`http://127.0.0.1:8015`).
- Endpoints:
  - `GET /api/scraped-reports` (supports `limit`, `offset`, `ticker`, `broker`, `search`, `min_potential`, `rating`)
  - `POST /api/scraped-reports/trigger-scrape`
  - `GET /api/scraped-reports/{id}`
  - `GET /api/scraped-reports/{id}/pdf`
  - `GET /api/health`
  - `GET /api/stocks`, `/api/screener`, `/api/recommendations`, `/api/kurum-stats`
- Scraper outputs strictly cached report DB records + JSON backup without wiping history.

## Code Layout
- `frontend/src/`:
  - `components/`: Modular sub-components (`ReportStats`, `ReportFilters`, `ReportTable`, `ReportRow`, `ReportPagination`, `ImageWithFallback.jsx`, etc.)
  - `utils/`: Shared utilities (`slugify.js`, etc.)
  - `pages/`: Page views (`ResearchReports.jsx`, `Screener.jsx`, `Home.jsx`, `Stocks.jsx`, etc.)
- `backend/`:
  - `main.py`: FastAPI application entrypoint (port 8015)
  - `scrapers/`: Scrapers, `db_manager.py`, `llm_parser.py`, `cache_manager.py`, `scraper_network.py`
