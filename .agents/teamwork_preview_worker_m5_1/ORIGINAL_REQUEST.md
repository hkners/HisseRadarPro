## 2026-08-03T01:20:26Z

You are teamwork_preview_worker_m5_1.
Your working directory is: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\teamwork_preview_worker_m5_1`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task: Implement Milestone 5 (UI Entegrasyonu, `verify_scraping.py` Acceptance Test Suite, and `SCRAPERS_README.md`) for HisseRadarPro.

Requirements Breakdown:

1. **Frontend UI Integration**:
   - Inspect `frontend/src/index.css`, `frontend/src/App.jsx`, `frontend/src/components/Sidebar.jsx`.
   - Create `frontend/src/pages/ResearchReports.jsx` adhering strictly to the Bloomberg terminal dark aesthetic tokens (`.panel`, `.data-table`, `.search-box`, `.btn-read`, `--color-up`, `--color-down`, `--text-highlight`, `Roboto Mono` font).
   - Features of `ResearchReports.jsx`:
     - Filter Controls: Search by ticker/keyword, Brokerage dropdown filter, Rating dropdown filter (AL, TUT, SAT), minimum target upside %, sort by date / upside.
     - Summary Stats Bar: Total reports, brokerage count, top recommended ticker.
     - Terminal Data Table: Ticker badge, Broker name, Recommendation rating badge (AL=#00ff00, TUT=#ffcc00, SAT=#ff3333), Current Price (₺), Target Price (₺), Upside Potential (%), Report Date, Action buttons (Expand accordion for summary/full text, View/Download report link).
   - Update `frontend/src/components/Sidebar.jsx` to add "Araştırma Raporları" navigation link (`/reports`).
   - Update `frontend/src/App.jsx` to add route `/reports` pointing to `ResearchReports`.
   - Update API client or `fetch` functions to retrieve data from `http://localhost:8012/api/scraped-reports`.

2. **Acceptance Test Suite `backend/scrapers/verify_scraping.py`**:
   - Create `backend/scrapers/verify_scraping.py` executable script proving all user acceptance criteria:
     - [x] Multi-Broker Scraping (Garanti BBVA + Deniz Yatırım report detection & downloading).
     - [x] LLM PDF Parsing & Metric Extraction accuracy (>=90% accuracy on sample report data).
     - [x] Mandatory Caching non-duplication (runs parser twice on identical PDF hash -> 2nd run returns `cached: True` with 0 duplicate LLM API calls).
     - [x] Prompt Configuration & Audit Logging (verifies saved prompt template and JSON-L audit log entries).
     - [x] Backend API endpoint verification (`GET /api/scraped-reports` returns HTTP 200 and valid JSON data).

3. **Comprehensive Documentation `backend/scrapers/SCRAPERS_README.md`**:
   - Document scraper architecture, file layout, LLM prompt configuration, SHA-256 caching mechanism, API routes, how to run scrapers, how to start backend and frontend (`python main.py` & `npm run dev`), and verification guide.

Verification & Testing:
- Run `python backend/scrapers/verify_scraping.py` to execute the full verification suite.
- Ensure build/test pass cleanly and document pass results in `changes.md` and `handoff.md`.
- Notify orchestrator via send_message when complete.
