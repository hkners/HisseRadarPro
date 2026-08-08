# HisseRadarPro Backend & Scraper Integration Analysis Report

## Executive Summary
This report presents a thorough analysis of the existing backend codebase for **HisseRadarPro** located at `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\backend`. It examines the current server configuration, API endpoints, data flow, external dependencies, data storage mechanisms, and existing crawler scripts. Finally, it outlines concrete architecture, database schema, interface contracts, and API endpoint designs for integrating the upcoming autonomous research report scrapers (`backend/scrapers`).

---

## 1. Existing Backend Codebase Architecture & Structure

### 1.1 Backend Directory Layout
The backend directory (`C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\backend`) contains 10 files and 0 subdirectories:
- `main.py` (334 lines): Main FastAPI server entrypoint and API routing logic.
- `crawler_2026.py` (153 lines): Web scraper crawling `hisseonerileri.com` special recommendations up to 2025 cutoff and dumping output directly into frontend data file (`hisseData.json`).
- `scrape_models.py` (98 lines): HTML scraper fetching model portfolios (monthly/weekly) from `hisseonerileri.com` and writing to `modelData.json`.
- `scrape_tickers.py` (23 lines): Wikipedia scraper extracting BIST stock tickers and company names to `bist_tickers.json`.
- `get_bist.py` (14 lines): GitHub downloader fetching BIST ticker codes into `bist_tickers.json`.
- `bist_tickers.json` (2 bytes): JSON storage for stock tickers list.
- `temp.txt` (18 lines): Sample text excerpt from a Deniz Yatırım daily bülten report.
- `test_bist.py` (14 lines): Test script probing İş Yatırım public API for stock tickers.
- `test_crawler.py` (12 lines): Test script fetching single page HTML snippet from `hisseonerileri.com`.
- `test_screener.py` (72 lines): Offline test script evaluating recommendation consensus calculations.

---

## 2. Technical Stack & Server Configuration

### 2.1 Backend Framework & Server Execution
- **Framework**: FastAPI (`from fastapi import FastAPI`)
- **Server Runner**: Uvicorn (`uvicorn.run(app, host="127.0.0.1", port=8012)`)
- **CORS Setup**: Fully permissive CORS middleware enabled:
  ```python
  app.add_middleware(
      CORSMiddleware,
      allow_origins=["*"],
      allow_credentials=True,
      allow_methods=["*"],
      allow_headers=["*"],
  )
  ```
- **Port Assignment**: Port `8012` (explicitly aligned across backend and frontend scripts like `update_ports.py`).

### 2.2 Python Libraries in Use
1. `fastapi` & `uvicorn`: ASGI Web application framework and server.
2. `yfinance`: Live price and 1-year historical chart data retriever (`yf.download()`, `yf.Ticker()`).
3. `pandas`: Financial dataset manipulation for stock historical prices calculation.
4. `requests` & `beautifulsoup4` (`bs4`): Web page fetching and HTML parsing.
5. Standard Library Modules: `json`, `re`, `asyncio`, `time`, `os`, `glob`, `datetime`, `math`, `random`.

---

## 3. Data Persistence & Data Models

### 3.1 Current Data Storage Mechanism
Currently, **no relational or NoSQL database engine** (e.g., PostgreSQL, SQLite, MongoDB) is configured in `backend/main.py`.
Data persistence relies on static/scraped JSON files located in `frontend/src/data/`:
- `RECOMMENDATIONS_FILE` = `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\frontend\src\data\hisseData.json` (~1.15 MB, 300+ recommendation records)
- `MODELS_FILE` = `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\frontend\src\data\modelData.json` (~36 KB, model portfolios)

### 3.2 In-Memory Price Caching
An in-memory dictionary `cache` tracks live stock prices fetched asynchronously via background task `update_prices_task()`:
- Periodic refreshes every 15 minutes (`await asyncio.sleep(900)`).
- Batch downloads live prices for ~100 BIST tickers (`yf_tickers = [f"{t}.IS" for t in BIST_TICKERS]`).

### 3.3 Ticker Normalization (`TICKER_MAP` & `match_ticker`)
`main.py` maintains a `TICKER_MAP` dictionary (25 explicit Turkish company name to ticker mappings, e.g. `"Türk Hava Yolları": "THYAO"`) and a fallback matching function `match_ticker()` to resolve company names to BIST tickers.

---

## 4. Existing API Endpoints Overview

| Method | Endpoint | Description | Data Source |
|---|---|---|---|
| `GET` | `/api/stocks` | List of tracked BIST stocks with live prices | `cache["prices"]` (yfinance) |
| `GET` | `/api/stocks/{ticker}` | Single stock live price info | `cache["prices"]` |
| `GET` | `/api/recommendations` | All stock analyst recommendations | `hisseData.json` |
| `GET` | `/api/recommendations/{ticker}` | Analyst recommendations for specific stock | `hisseData.json` + `match_ticker` |
| `GET` | `/api/kurum-stats` | Brokerage stats (report count & avg potential) | Aggregated from `hisseData.json` |
| `GET` | `/api/kurum/{kurum_name}` | Recommendations issued by a specific broker | `hisseData.json` |
| `GET` | `/api/history/{ticker}` | 1-year daily historical closing prices | `yfinance.download(f"{ticker}.IS", period="1y")` |
| `GET` | `/api/financials/{ticker}` | Fundamental ratios & quarterly financials | Dynamically mocked |
| `GET` | `/api/models` | Model portfolio recommendations | `modelData.json` |
| `GET` | `/api/screener` | Consensus target prices & upside potentials | Calculated from `hisseData.json` + live price |

---

## 5. Scraper Integration Design (`backend/scrapers`)

### 5.1 Directory Layout Proposal
To satisfy Milestone 2-4 requirements, `backend/scrapers` should be structured as follows:
```
backend/scrapers/
├── garanti_scraper.py    # Garanti BBVA Research Scraper & PDF Downloader
├── deniz_scraper.py      # Deniz Yatırım Research Scraper & PDF Downloader
├── llm_parser.py         # LLM-based PDF text/table parser
├── cache_manager.py      # SHA256 PDF hash & LLM result caching
├── verify_scraping.py    # Acceptance and verification test suite
├── storage.py            # SQLite / JSON database repository layer
├── SCRAPERS_README.md    # Documentation for scrapers architecture
├── downloads/            # Local store for downloaded research PDF files
├── cache/                # SHA256 hash cache & LLM response cache
├── logs/                 # Scraper execution & audit log files
└── prompts/              # Versioned LLM prompts used for parsing
```

### 5.2 Storage Format & Database Schema Recommendation
To transition from loose JSON files to structured persistence without introducing heavy external infrastructure overhead:

**Recommendation: SQLite Database (`backend/hisse_radar.db`) via `sqlite3`**

#### Schema: `research_reports`
```sql
CREATE TABLE IF NOT EXISTS research_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_hash TEXT UNIQUE NOT NULL,       -- SHA256 hash of PDF file
    ticker TEXT NOT NULL,                -- e.g. THYAO
    broker TEXT NOT NULL,                -- e.g. Garanti BBVA, Deniz Yatırım
    report_title TEXT NOT NULL,
    report_date TEXT NOT NULL,           -- ISO format YYYY-MM-DD
    rating TEXT,                         -- AL, TUT, SAT, ENDEKS ÜZERİ GETİRİ
    target_price REAL,                   -- Target Price (TRY)
    current_price REAL,                  -- Stock price at release (TRY)
    potential REAL,                      -- Upside potential percentage
    summary TEXT,                        -- Summary extracted by LLM
    pdf_url TEXT,                        -- Source URL
    pdf_path TEXT,                       -- Cached local file path
    prompt_id TEXT,                      -- Reference to prompt version
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reports_ticker ON research_reports(ticker);
CREATE INDEX IF NOT EXISTS idx_reports_broker ON research_reports(broker);
```

#### Schema: `llm_cache`
```sql
CREATE TABLE IF NOT EXISTS llm_cache (
    file_hash TEXT PRIMARY KEY,
    prompt_id TEXT NOT NULL,
    raw_llm_response TEXT NOT NULL,
    parsed_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5.3 Interface Contracts Alignment
- **Scraper -> Parser**:
  ```json
  {
    "broker": "Garanti BBVA",
    "report_title": "Daily Equity Strategy",
    "report_date": "2026-08-01",
    "pdf_path": "backend/scrapers/downloads/garanti_20260801.pdf",
    "pdf_url": "https://...",
    "file_hash": "sha256:a1b2c3d4..."
  }
  ```
- **Parser -> Backend / UI**:
  ```json
  {
    "ticker": "THYAO",
    "broker": "Garanti BBVA",
    "rating": "AL",
    "target_price": 450.00,
    "current_price": 315.50,
    "report_date": "2026-08-01",
    "summary": "THYAO 2Q26 getiri beklentisi...",
    "cached": true,
    "prompt_id": "prompt_v1_thyao_20260801"
  }
  ```

### 5.4 Proposed API Endpoints to Expose Scraped Research Reports
To serve scraped research reports to the frontend UI:
1. `GET /api/scraped-reports`
   - Query Parameters: `ticker` (optional), `broker` (optional), `limit` (default 50), `offset` (default 0).
   - Returns paginated list of research reports from SQLite database.
2. `GET /api/scraped-reports/{id}`
   - Returns complete details of a single report including summary and prompt ID.
3. `POST /api/scrapers/trigger`
   - Background trigger endpoint to execute scrapers (`garanti_scraper.py` / `deniz_scraper.py`).
4. `GET /api/scrapers/status`
   - Returns scraper operational metrics: last run timestamp, total parsed reports, cache hit ratio.
5. **Integration with existing endpoints**:
   - Update `get_all_recommendations()` and `get_screener_data()` in `main.py` to seamlessly include or merge rows from `research_reports` with legacy recommendations.

---
*Report prepared by teamwork_preview_explorer_m1_1 on 2026-08-03.*
