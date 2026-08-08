# Handoff Report — HisseRadarPro Backend Codebase & Scraper Integration Exploration

## 1. Observation
- **Backend Entrypoint & Config**: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\backend\main.py`:
  - Line 9: `app = FastAPI()`
  - Line 11-17: `app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)`
  - Line 19: `RECOMMENDATIONS_FILE = r"C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\frontend\src\data\hisseData.json"`
  - Line 272: `MODELS_FILE = r"C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\frontend\src\data\modelData.json"`
  - Line 333: `uvicorn.run(app, host="127.0.0.1", port=8012)`
- **Existing Endpoints in `main.py`**:
  - `/api/stocks` (line 103)
  - `/api/stocks/{ticker}` (line 112)
  - `/api/recommendations` (line 123)
  - `/api/recommendations/{ticker}` (line 131)
  - `/api/kurum-stats` (line 141)
  - `/api/kurum/{kurum_name}` (line 169)
  - `/api/history/{ticker}` (line 179)
  - `/api/financials/{ticker}` (line 207)
  - `/api/models` (line 274)
  - `/api/screener` (line 283)
- **Crawler Scripts & Data Utilities**:
  - `backend/crawler_2026.py` (lines 148-150): Writes crawled html data directly to `frontend/src/data/hisseData.json`.
  - `backend/scrape_models.py` (lines 92-95): Writes model portfolios to `frontend/src/data/modelData.json`.
  - `backend/scrape_tickers.py` & `get_bist.py`: Output to `bist_tickers.json`.
- **Project Specifications (`PROJECT.md`)**:
  - `backend/scrapers/` folder target path.
  - Required scrapers: `garanti_scraper.py`, `deniz_scraper.py`, `llm_parser.py`, `cache_manager.py`, `verify_scraping.py`.
  - Data contracts: Scraper -> Parser contract and Parser -> Backend/UI contract.

## 2. Logic Chain
1. **Observation**: `main.py` loads data directly from `frontend/src/data/hisseData.json` and `modelData.json` via file read `open(RECOMMENDATIONS_FILE)` and `open(MODELS_FILE)`.
   **Inference**: Currently there is no database engine (SQLite/PostgreSQL) in `backend/`.
2. **Observation**: Scrapers in `crawler_2026.py` and `scrape_models.py` directly format and overwrite JSON files in `frontend/src/data/`.
   **Inference**: This direct file overwrite is fragile and lacks audit history, LLM response caching, SHA256 PDF hash verification, or structured querying.
3. **Observation**: `PROJECT.md` mandates SHA256 caching and prompt auditing under `backend/scrapers/cache/`, `backend/scrapers/logs/`, and `backend/scrapers/prompts/`.
   **Inference**: Introducing a dedicated SQLite database (`backend/hisse_radar.db`) with tables `research_reports` and `llm_cache` allows `backend/scrapers` to store parsed research reports reliably and provide fast SQL query capabilities for FastAPI endpoints.
4. **Observation**: `main.py` endpoints like `/api/screener` aggregate targets from `hisseData.json`.
   **Inference**: Exposing endpoints `/api/scraped-reports` and updating `/api/screener` to read from the SQLite database will integrate newly scraped PDF reports into consensus stock scores seamlessly.

## 3. Caveats
- `yfinance` network calls require internet access at runtime; during CODE_ONLY mode, background yfinance price updates will throw network exceptions and rely on default/cached prices.
- Existing `hisseData.json` has ~314 legacy entries scraped from HTML; migrating them to SQLite or unifying them via a fallback reader will ensure backwards compatibility.

## 4. Conclusion
The backend is a FastAPI application running on port 8012 using static JSON files and `yfinance` live pricing. `backend/scrapers` should integrate via:
1. SQLite database (`backend/hisse_radar.db`) containing `research_reports` and `llm_cache` tables.
2. Direct adherence to Parser -> Backend contract specified in `PROJECT.md`.
3. New FastAPI routes `/api/scraped-reports` and `/api/scrapers/status` in `main.py`.
4. Detailed analysis report written to `analysis.md`.

## 5. Verification Method
- Inspect file `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\teamwork_preview_explorer_m1_1\analysis.md`.
- Inspect file `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\backend\main.py`.
- Verify FastAPI endpoint declarations at lines 103, 112, 123, 131, 141, 169, 179, 207, 274, 283 in `backend/main.py`.
