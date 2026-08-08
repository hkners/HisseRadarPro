# Backend Codebase Audit & Refactoring Analysis (`analysis_be.md`)

**Project**: HisseRadarPro  
**Target Path**: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\backend`  
**Date**: 2026-08-06  
**Auditor**: Explorer Subagent (`explorer_be`)  

---

## Executive Summary

A comprehensive read-only audit of the HisseRadarPro Backend codebase (`backend/`) was conducted. While the application successfully provides functioning APIs for stock prices, recommendations, model portfolios, screener, and scraped research reports, several critical performance bottlenecks, structural anti-patterns, data persistence bugs, and error handling deficiencies were identified.

### Key Audit Findings
1. **Monolithic Architecture**: `backend/main.py` (613 lines) mixes routing, static asset serving, CORS middleware, background pricing tasks (`yfinance`), ticker mapping, file I/O, regex string processing, and business calculations in a single file.
2. **100% SQLite Database Bypass & Missing Indexes**: `ReportDBManager` in `backend/scrapers/db_manager.py` creates a SQLite table `scraped_reports`, but `get_reports()` completely bypasses SQL queries, loading a **56.4 MB JSON file** into memory on every startup and performing linear Python list filtering. SQLite table has **zero indexes** on frequently queried columns (`ticker`, `broker`, `rating`, `report_date`, `potansiyel`).
3. **Data Loss Bug in Background Scraper**: In `backend/scrapers/scraper_network.py`, `run_scraper_network()` overwrites `scraped_reports.json` with only the newly scraped batch (e.g. 5-10 reports), destroying historical report data.
4. **FastAPI Thread Pool & Event Loop Blocking**: Synchronous endpoints (`def get_all_stocks()`, `def get_kurum_stats()`, `def get_screener_data()`) perform heavy file read operations (`hisseData.json`, ~2MB) and complex regex filtering on **every single HTTP request**, causing thread pool starvation under concurrent load.
5. **Insecure Error Leaks & Silent Exception Swallowing**: `GET /api/scraped-reports` returns raw Python stack traces inside HTTP 200 responses when exceptions occur (`return {"error_debug": traceback.format_exc()}`). Other endpoints contain bare `except:` blocks that silently swallow errors without logging.
6. **Missing Endpoints**: Missing single-report detail view (`/api/scraped-reports/{id}`), PDF stream endpoint (`/api/scraped-reports/{id}/pdf`), and health check endpoint (`/api/health`).

---

## 1. Inspection of `main.py`, `db_manager.py`, and Database Schemas

### 1.1 `main.py` Analysis
- **Location**: `backend/main.py` (613 lines, 23,090 bytes)
- **Role**: Main FastAPI application server.
- **Code Issues**:
  - Contains hardcoded static dictionary `TICKER_MAP` (lines 41–145) with 145+ manual mappings.
  - Contains inline ticker matching logic (`match_ticker()` lines 234–256) used repeatedly across endpoints.
  - Direct file I/O operations (`open(RECOMMENDATIONS_FILE)`, `open(MODELS_FILE)`) inside endpoint functions.
  - Mixes scraped report endpoints (`/api/scraped-reports`) with live stock quote endpoints (`/api/stocks`).

### 1.2 `db_manager.py` & `repository.py` Analysis
- **Location**: `backend/scrapers/db_manager.py` (298 lines) & `backend/scrapers/repository.py` (8 lines)
- **Role**: Persistence and repository manager for scraped research reports.
- **Critical Flaws**:
  - **In-Memory JSON Scanning**: Lines 199–202 in `db_manager.py`:
    ```python
    reports = self.load_json_reports()
    if not reports:
        reports = self._get_all_reports_db()
    ```
    The repository reads from `scraped_reports.json` (56.4 MB) into `self._cached_reports` and filters items using Python `for` loops in memory. The SQLite database is never queried during `get_reports()`.
  - **Text Search Bug on `full_text`**: In `load_json_reports()` (line 77), `full_text` is stripped from returned report dicts to save memory:
    ```python
    return [{k: v for k, v in r.items() if k != "full_text"} for r in self._cached_reports]
    ```
    However, `get_reports()` attempts to search `full_text` in line 242:
    ```python
    searchable = (f"{r.get('report_title', '')} {r.get('summary', '')} "
                  f"{r.get('catalysts', '')} {r.get('full_text', '')} ...").lower()
    ```
    Because `full_text` was already removed, searching body text always evaluates against an empty string, rendering full-text search ineffective for report body content.

### 1.3 Database Schema & Indexing Inspection
- **SQLite Database Path**: `backend/scrapers/scraped_reports.db`
- **Table Definition**:
  ```sql
  CREATE TABLE IF NOT EXISTS scraped_reports (
      id TEXT PRIMARY KEY,
      ticker TEXT,
      broker TEXT,
      rating TEXT,
      target_price REAL,
      current_price REAL,
      potansiyel REAL,
      report_date TEXT,
      summary TEXT,
      catalysts TEXT,
      full_text TEXT,
      cached INTEGER,
      prompt_id TEXT,
      file_hash TEXT,
      pdf_url TEXT,
      report_title TEXT
  );
  ```
- **Missing Indexes**:
  - `CREATE INDEX idx_scraped_reports_ticker ON scraped_reports(ticker);`
  - `CREATE INDEX idx_scraped_reports_broker ON scraped_reports(broker);`
  - `CREATE INDEX idx_scraped_reports_rating ON scraped_reports(rating);`
  - `CREATE INDEX idx_scraped_reports_date ON scraped_reports(report_date DESC);`
  - `CREATE INDEX idx_scraped_reports_hash ON scraped_reports(file_hash);`
- **Concurrency & WAL Mode**: Connection helper `_get_connection()` does not configure Write-Ahead Logging (`PRAGMA journal_mode=WAL;`) or connection pooling. Concurrent background scraping writes can lock the database file during API GET operations.

---

## 2. Port Binding, Event Loop Blocking & Missing Endpoints

### 2.1 Port Binding Audit
- **Requirement**: Must run on port **8015**.
- **Verification**:
  - `backend/main.py` (line 612): `uvicorn.run(app, host="127.0.0.1", port=8015)`
  - `PROJECT.md`: Specifies backend runs on port `8015`.
  - `fix_ports.py`: Script confirms frontend API base URL targets `http://localhost:8015`.
  - *Note*: Legacy root file `main_recovered.py` contains `port=8000` (should be archived or removed).

### 2.2 Event Loop & Thread Blocking Analysis
- **yfinance Background Task**: `update_prices_task()` in `main.py` uses `loop.run_in_executor(None, lambda: yf.download(...))` to run blocking `yfinance` network requests off the main event loop.
- **FastAPI Sync Handler Thread Exhaustion**:
  - Synchronous route declarations (`def get_all_stocks()`, `def get_kurum_stats()`, `def get_screener_data()`) run inside FastAPI's default worker thread pool.
  - Inside `/api/kurum-stats` (lines 363–443), every request opens `hisseData.json`, parses JSON, and runs regular expressions (`re.sub`) and potential math over all entries.
  - Under concurrent user traffic, this creates CPU and I/O bottlenecks that exhaust FastAPI worker threads.

### 2.3 Endpoint Audit & Missing Routes
- **Existing Routes**:
  - `GET /api/stocks`
  - `GET /api/stocks/{ticker}`
  - `GET /api/recommendations`
  - `GET /api/recommendations/latest`
  - `GET /api/recommendations/{ticker}`
  - `GET /api/models`
  - `GET /api/kurum-stats`
  - `GET /api/kurum/{kurumName}`
  - `GET /api/screener`
  - `GET /api/scraped-reports`
  - `GET /api/scraped-reports/stats`
  - `POST /api/scraped-reports/trigger-scrape`
- **Missing / Broken Routes**:
  - `GET /api/scraped-reports/{id}`: Missing single report details query.
  - `GET /api/scraped-reports/{id}/pdf`: Missing direct PDF streaming or download route.
  - `GET /api/health`: Missing health check / liveness endpoint.
  - **CRITICAL DATA LOSS BUG in `POST /api/scraped-reports/trigger-scrape`**:
    In `backend/scrapers/scraper_network.py` (lines 102–104):
    ```python
    with open(tmp_output, "w", encoding="utf-8") as f:
        json.dump(parsed_reports, f, ensure_ascii=False, indent=2)
    ```
    When `trigger-scrape` is called, `run_scraper_network()` dumps ONLY the freshly scraped batch (`parsed_reports`) into `scraped_reports.json`, completely overwriting and wiping out historical scraped reports!

---

## 3. Database Read Performance & Query Bottlenecks

### 3.1 Read Performance Deficiencies
- **Zero SQL Querying**: All reads go through memory-cached JSON iteration.
- **Memory Footprint**: Loading `scraped_reports.json` (56.4 MB) parses thousands of report objects into RAM (~200MB+ Python object overhead).
- **Linear Filter Overhead**: Every request filtering by `ticker`, `broker`, or `min_upside` iterates through all elements in Python memory rather than utilizing database index lookups ($O(N)$ scan vs $O(\log N)$ index lookup).
- **Pagination Missing**: Endpoints return raw unbounded arrays without `page`, `page_size`, or `total_count` metadata, leading to large JSON payloads over HTTP.

### 3.2 Database Optimization Plan
1. **Enable SQLite WAL Mode**: Execute `PRAGMA journal_mode=WAL;` and `PRAGMA synchronous=NORMAL;` at connection startup.
2. **Add Missing Indexes**: Create composite and single-column indexes on `ticker`, `broker`, `rating`, `report_date`.
3. **SQLite FTS5 Full-Text Search**: Create a virtual table `scraped_reports_fts` for title and summary searching.
4. **SQL-Based Filtering**: Refactor `ReportDBManager.get_reports()` to construct parameterized SQL queries:
   ```sql
   SELECT id, ticker, broker, rating, target_price, current_price, potansiyel, report_date, summary, catalysts, pdf_url, report_title
   FROM scraped_reports
   WHERE (? IS NULL OR UPPER(ticker) = UPPER(?))
     AND (? IS NULL OR LOWER(broker) LIKE '%' || LOWER(?) || '%')
     AND (? IS NULL OR UPPER(rating) LIKE '%' || UPPER(?) || '%')
     AND (? IS NULL OR potansiyel >= ?)
   ORDER BY report_date DESC
   LIMIT ? OFFSET ?;
   ```

---

## 4. 500 Error Handling, Unhandled Exceptions & API Response Structures

### 4.1 Vulnerable Error Payload Leaks
- Line 573 in `backend/main.py`:
  ```python
  except Exception as e:
      import traceback
      return {"error_debug": traceback.format_exc()}
  ```
  Returning full tracebacks in HTTP 200 responses is an information disclosure vulnerability and breaks JSON response type contracts.

### 4.2 Bare `except:` Blocks
- Found in `/api/recommendations`, `/api/kurum-stats`, `/api/kurum/{kurumName}`:
  ```python
  except:
      return []
  ```
  Swallowing exceptions silently obscures runtime failures (such as missing data files, corrupted JSON, or disk read failures) and prevents logging.

### 4.3 Inconsistent API Response Structures
- Response formats vary between endpoints (arrays vs dict wrappers):
  - `/api/stocks` -> `{"status": "READY", "last_updated": "...", "stocks": [...]}`
  - `/api/recommendations` -> `[...]`
  - `/api/scraped-reports` -> `[...]` or `{"error_debug": "..."}`
- Lack of standard error format (e.g. `{"detail": "...", "error_code": "..."}`).

---

## 5. Proposed Modular Refactoring Architecture

To transform `backend/main.py` into a modular, maintainable, and high-performance application, the following directory layout and module distribution is recommended:

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                     # App instance, middleware, lifecycle events
│   ├── config.py                   # Settings, file paths, port configs
│   ├── database.py                 # SQLite connection pool, WAL mode, migrations
│   ├── api/
│   │   ├── __init__.py
│   │   ├── router.py               # Combined API router (v1)
│   │   └── v1/
│   │       ├── stocks.py           # /api/stocks routes
│   │       ├── recommendations.py  # /api/recommendations routes
│   │       ├── kurum.py            # /api/kurum routes
│   │       ├── screener.py         # /api/screener routes
│   │       └── scraped_reports.py  # /api/scraped-reports routes
│   ├── core/
│   │   ├── ticker_map.py           # TICKER_MAP dictionary & matcher service
│   │   └── exceptions.py           # Custom exceptions & HTTP 500 handlers
│   ├── schemas/                    # Pydantic schemas for response/request validation
│   │   ├── stock_schema.py
│   │   ├── report_schema.py
│   │   └── kurum_schema.py
│   └── services/                   # Business logic & data repositories
│       ├── price_service.py        # yfinance price cache manager
│       ├── recommendation_service.py # In-memory cached recommendation service
│       └── report_service.py       # SQL-based report repository (db_manager)
└── scrapers/                       # Crawler scripts & broker scrapers
```

---

## Conclusion & Actionable Recommendations

1. **Fix `scraper_network.py` Data Overwrite Bug**: Update `run_scraper_network()` to upsert new reports into SQLite DB and merge with existing JSON instead of overwriting the file.
2. **Migrate `ReportDBManager` to Pure SQLite Queries**: Replace in-memory JSON iteration with SQL queries utilizing indexes and FTS5 text search.
3. **Cache Static Data Files in Memory**: Parse `hisseData.json` once on startup or file modification, avoiding disk reads on every API hit.
4. **Refactor `main.py` into Modular Routes & Services**: Separate routes into `app/api/v1/` modules and business logic into `app/services/`.
5. **Implement Standard Exception Handling & Pydantic Schemas**: Add global error handlers returning HTTP 500/400 JSON payloads instead of raw traceback strings or silent `except:` blocks.
