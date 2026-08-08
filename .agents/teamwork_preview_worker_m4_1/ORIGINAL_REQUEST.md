## 2026-08-03T01:14:28Z
You are teamwork_preview_worker_m4_1.
Your working directory is: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\teamwork_preview_worker_m4_1`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task: Implement Milestone 4 (Backend Integration & API Endpoints for Scraped Research Reports) in `backend/main.py` and `backend/scrapers/`.

1. Inspect `backend/main.py` and `backend/scrapers/scraped_reports.json`.
2. Add a report repository / database manager in `backend/scrapers/db_manager.py` or `backend/scrapers/repository.py` that reads, stores, and filters research reports from `scraped_reports.json` (and/or SQLite DB).
3. Expose REST endpoints in `backend/main.py`:
   - `GET /api/scraped-reports`: Lists scraped research reports with query parameter filtering (`ticker`, `broker`, `rating`, `search`, `min_upside`, `limit`).
   - `GET /api/scraped-reports/stats`: Returns aggregated stats (total reports, broker counts, top recommendations).
   - `POST /api/scraped-reports/trigger-scrape`: Triggers background scraping run via `run_scraper_network()`.
4. Ensure all existing routes (`/api/kurum-stats`, `/api/stocks`, `/api/screener`, `/api/models`, etc.) continue working without breaking.
5. Create a test script `backend/scrapers/tests/test_backend_api.py` using `fastapi.testclient.TestClient` or `httpx` to test all new endpoints and verify HTTP 200 responses, correct JSON filtering, and stability.
6. Run the test script and record results in `changes.md` and `handoff.md` in your working directory.
7. Notify orchestrator via send_message when complete.
