## 2026-08-06T18:26:14Z
<USER_REQUEST>
You are a Worker subagent for HisseRadarPro.
Your working directory is: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\worker_scrapers`
Project root: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task: Implement Milestone 3 - Scraper & LLM Caching Refactoring & Bug Fixes.

Requirements:
1. `backend/scrapers/scraper_network.py`:
   - Integrate `LLMParser.parse_report()` into `run_scraper_network()`, enabling strict SHA-256 PDF caching lookup/storage via `CacheManager` to prevent sending duplicate reports to LLM.
   - Ensure prompt logging writes entries to `logs/llm_audit.log`.
   - Ensure `ReportDBManager.save_reports()` is called with genuine parsed reports.
2. `backend/scrapers/deniz_scraper.py`:
   - Fix PDF downloads by using `curl_cffi` requests session (with browser impersonation) instead of standard `requests` session to avoid WAF 403 Forbidden errors.
   - Extract genuine report publication dates from HTML metadata/PDF instead of hardcoding `report_date = today`.
3. `backend/scrapers/garanti_scraper.py`:
   - Update Playwright wait state (`wait_until="domcontentloaded"`) to eliminate 60s timeout hangs.
   - Update date regex `(\d{1,2})[./-](\d{1,2})[./-](\d{4})` to handle single-digit day/month strings.
4. `backend/scrapers/llm_parser.py`:
   - Expand ticker exclusion list (`exclude_words`): add `BBVA`, `DENIZ`, `GARAN`, `BULTEN`, `RAPOR`, `ARASTIRMA`, `HAFTALIK`, `GUNLUK`, etc. to prevent misidentifying brokerage tokens as stock tickers.
   - Refactor rating extraction regex: use case-sensitive matching for `AL`/`BUY`/`TUT`/`HOLD`/`SAT`/`SELL` or word boundary patterns to prevent matching Turkish words like "alındı" or "almak".
   - Fix Turkish number parser: handle thousands separators (`.`) and decimal commas (`,`) (e.g. `1.450,00` -> `1450.0`) so upside potential is calculated accurately.
   - Fix LLM client integration: pass `prompt_content` to API client and handle chunking cleanly.
5. Offline Test Fixtures & Verification:
   - Update `verify_scraping.py` and unit tests to include offline fallback fixtures (mock HTML/PDF responses) so tests run cleanly without network dependency.
   - Run `python backend/scrapers/verify_scraping.py` and `python -m pytest backend/scrapers/tests/`.
   - Write `changes_scrapers.md` and `handoff.md` in your working directory.
   - Send a message to parent orchestrator upon completion.
</USER_REQUEST>
