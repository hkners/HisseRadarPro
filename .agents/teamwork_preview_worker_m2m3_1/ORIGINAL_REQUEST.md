## 2026-08-03T01:06:00Z
You are teamwork_preview_worker_m2m3_1.
Your working directory is: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\teamwork_preview_worker_m2m3_1`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task: Implement Milestones 2 & 3 (Multi-Broker Scrapers + LLM Parser + Mandatory Caching + Prompt Audit Logging) in `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\backend\scrapers`.

Target Architecture & Files to Create in `backend/scrapers/`:
1. `backend/scrapers/base_scraper.py`:
   - `BaseScraper` class with `requests.Session`, standard User-Agent headers, retry logic, rate limiting, and atomic streaming PDF downloader (`download_pdf`) saving to `backend/scrapers/downloads/` with SHA-256 computation.
2. `backend/scrapers/garanti_scraper.py`:
   - `GarantiScraper` inheriting from `BaseScraper`. Scrapes Garanti BBVA Araştırma reports (HTML listing / PDF downloads).
3. `backend/scrapers/deniz_scraper.py`:
   - `DenizScraper` inheriting from `BaseScraper`. Scrapes Deniz Yatırım Araştırma reports.
4. `backend/scrapers/cache_manager.py`:
   - `CacheManager` class. Manages `backend/scrapers/cache/llm_cache.json`. Checks SHA-256 content hash of PDF. If present, returns cached result with `"cached": true`. Otherwise saves LLM result upon successful parsing.
5. `backend/scrapers/prompts/v1_research_extractor.txt`:
   - Standardized LLM system prompt and format specification for research report extraction.
6. `backend/scrapers/llm_parser.py`:
   - `LLMParser` class. Loads prompt template, extracts text from PDF (using `fitz`, `pdfplumber`, or `pypdf` with robust text extraction fallback). Calls LLM (OpenAI/Gemini/OpenAI-compatible, or heuristic fallback if API key is omitted) to return structured dict (`ticker`, `broker`, `rating`, `target_price`, `current_price`, `potansiyel`, `report_date`, `summary`, `catalysts`). Uses `CacheManager` for mandatory caching. Logs prompt usage and token metrics to `backend/scrapers/logs/llm_audit.log`.
7. `backend/scrapers/scraper_network.py`:
   - Orchestrator function `run_scraper_network()` that executes scrapers, processes reports with `LLMParser`, saves aggregated output to `backend/scrapers/scraped_reports.json`.

Verification & Test:
- Create unit/integration tests in `backend/scrapers/tests/test_scrapers_and_llm.py` or run script to verify:
  1) Scraping & PDF downloading from Garanti and Deniz Yatırım.
  2) LLM parsing & extraction accuracy.
  3) Cache hits on second run (`cached: true`).
  4) Prompt audit log entries created.
- Execute python test script and document passing build/test results in `handoff.md` and `changes.md` in your directory.
- Notify orchestrator via send_message when complete.
