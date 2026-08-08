## 2026-08-06T18:14:55Z
You are a Worker subagent for HisseRadarPro.
Your working directory is: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\worker_be`
Project root: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task: Implement Milestone 2 - Backend & DB Optimization & Refactoring.

Requirements:
1. `backend/scrapers/db_manager.py`:
   - Refactor `ReportDBManager` to use genuine indexed SQLite SQL queries for filtering, pagination (`limit`, `offset`), searching, and sorting rather than loading 56.4MB JSON into memory and filtering in Python loops.
   - Automatically create indexes on `ticker`, `broker`, `rating`, `report_date`, and `potansiyel` in `scraped_reports.db`.
   - Ensure full_text searching is supported in SQL (via FTS5 or SQL `LIKE` queries).
2. `backend/scrapers/scraper_network.py`:
   - Fix historical data loss bug: when newly scraped reports are dumped/saved, merge them with existing DB / JSON records so historical reports are NOT overwritten or erased.
3. `backend/main.py`:
   - Cache static JSON files (`hisseData.json`, `modelData.json`, `recommendations.json`) in memory at app startup to avoid sync disk read I/O per HTTP hit.
   - Maintain port 8015 binding (`uvicorn.run(app, host="127.0.0.1", port=8015)`).
   - Fix error handling: replace raw python stack trace returns in HTTP 200 responses with clean FastAPI `HTTPException` / structured error JSON.
   - Add missing endpoints: `GET /api/health`, `GET /api/scraped-reports/{id}`, `GET /api/scraped-reports/{id}/pdf`.
4. Verification:
   - Run backend test suite or run a test script / pytest verifying backend endpoints return 200 OK.
   - Document commands, test results, and file diffs in `changes_be.md` and `handoff.md`.
5. Send a message to parent orchestrator upon completion.
