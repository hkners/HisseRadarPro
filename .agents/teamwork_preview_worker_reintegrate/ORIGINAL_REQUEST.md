## 2026-08-03T01:23:42Z
The parent restored `backend/main.py` and updated port to 8015. The previously added scraped report endpoints were wiped during the main.py restoration.

Please perform the following re-integration steps:
1. Inspect the updated `backend/main.py`. Note the new port (8015) and existing yfinance/route setup.
2. Re-apply the scraped research report endpoints to `backend/main.py`:
   - `GET /api/scraped-reports` (with filtering by ticker, broker, rating, search, min_upside, limit) using `ReportDBManager` / `ReportRepository` from `backend/scrapers/db_manager.py`.
   - `GET /api/scraped-reports/stats` (broker breakdown, top recommended stock).
   - `POST /api/scraped-reports/trigger-scrape` (triggers `run_scraper_network()` in background task).
   - Ensure imports `from scrapers.db_manager import report_db` or similar are cleanly added.
   - Retain port 8015 and all existing routes in `main.py`.
3. Update port reference to 8015 in:
   - `frontend/src/pages/ResearchReports.jsx` (and any other frontend files referencing port 8012 -> update to 8015 or fallback `window.location.hostname:8015`).
   - `backend/scrapers/verify_scraping.py` (ensure API test hits port 8015).
   - `backend/scrapers/tests/test_backend_api.py`.
4. Run tests:
   - Run `python backend/scrapers/verify_scraping.py`
   - Run `python -m pytest backend/scrapers/tests/`
5. Report results in `changes.md` and `handoff.md` in your directory.
6. Send message to orchestrator when done.
