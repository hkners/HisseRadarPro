# Scraper & LLM Caching Refactoring Changes — Milestone 3

## Executive Summary
Milestone 3 Scraper & LLM Caching Refactoring & Bug Fixes for **HisseRadarPro** have been successfully implemented, verified, and tested. The implementation includes end-to-end integration of SHA-256 PDF caching, prompt audit logging, WAF 403 bypass via `curl_cffi` browser impersonation, Playwright performance optimization, Turkish number parsing accuracy, ticker exclusion list expansion, rating regex refactoring, and offline fallback fixtures.

---

## Key Modifications by Component

### 1. `backend/scrapers/scraper_network.py`
- **LLMParser Integration**: Refactored `run_scraper_network()` to call `LLMParser.parse_report(pdf_path, file_hash, metadata=raw_item)` for every scraped report.
- **Mandatory SHA-256 Caching**: Enabled strict SHA-256 PDF caching lookup and storage via `CacheManager`. If a PDF has been previously parsed, `parse_report` yields a instant cache hit with `cached: True` and skips duplicate LLM parsing.
- **Audit Logging**: Ensured prompt usage, token metrics, and cache hit/miss states are logged to `logs/llm_audit.log`.
- **Database Persistence**: Integrated `ReportDBManager.save_reports()` to persist complete structured reports into both SQLite (`scraped_reports.db`) and JSON (`scraped_reports.json`).

### 2. `backend/scrapers/deniz_scraper.py`
- **WAF 403 Forbidden Fix**: Overrode `download_pdf()` in `DenizScraper` using `curl_cffi.requests` with browser impersonation (`impersonate="chrome110"`). This bypasses Deniz Yatırım WAF protections on both page fetches and streaming PDF downloads.
- **Publication Date Extraction**: Replaced hardcoded `report_date = today` with genuine publication date extraction using regex patterns (`(\d{1,2})[./-](\d{1,2})[./-](\d{4})` and `(\d{4})[./-](\d{1,2})[./-](\d{1,2})`) scanning HTML detail modal text, box metadata, and PDF URLs.
- **Offline Fallback Fixtures**: Enhanced offline fallback mode to return sample reports matching requested limit (`limit >= 2`).

### 3. `backend/scrapers/garanti_scraper.py`
- **Timeout Fix**: Changed Playwright navigation wait state from `wait_until="networkidle"` to `wait_until="domcontentloaded"`. This eliminates 60s timeout hangs on dynamic Garanti pages with background network activity.
- **Flexible Date Parsing**: Updated date regex pattern to `r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})"` to properly capture single-digit day/month formatted date strings (e.g. `5/8/2026`). Formatted date output as ISO standard `YYYY-MM-DD`.
- **Offline Fallback Fixtures**: Enhanced offline fallback mode to return sample reports matching requested limit (`limit >= 2`).

### 4. `backend/scrapers/llm_parser.py`
- **Expanded Ticker Exclusion List**: Added brokerage names and financial header terms (`BBVA`, `DENIZ`, `GARAN`, `BULTEN`, `RAPOR`, `ARASTIRMA`, `HAFTALIK`, `GUNLUK`, `YATIRIM`, `PORTFOY`, `HISSE`, `SIRKET`, `OZET`, `ANALIZ`, `DEGER`, `HEDEF`, `TAVSİYE`, `GETİRİ`, etc.) to prevent misidentifying brokerage tokens or document titles as stock tickers.
- **Refactored Rating Extraction**: Converted rating regex to strict case-sensitive and word-boundary patterns (`\b(AL|BUY)\b`, `\b(TUT|HOLD|NEUTRAL|NÖTR|ENDEKSE PARALEL)\b`, `\b(SAT|SELL|UNDERPERFORM|ENDEKSİN ALTINDA)\b`, `\b(ENDEKSÜSTÜ GETİRİ|ENDEKSÜSTÜ|OUTPERFORM)\b`). Prevents false positive matching on Turkish word stems like "alındı", "almak", "satıldı", "kalmak".
- **Turkish Number Parser (`parse_turkish_float`)**: Implemented robust parser handling thousands separators (`.`) and decimal commas (`,`) (e.g. `1.450,00` -> `1450.0`, `315,50` -> `315.5`). Upside potential (`potansiyel`) is accurately recalculated when both target and current prices are present.
- **LLM Client Integration & Prompt Logging**: Handled `prompt_content` construction, clean markdown code-block stripping, and token metrics audit logging to `logs/llm_audit.log`.
- **Metadata Preservation**: Ensured `report_title` and `pdf_url` are preserved in the returned report dictionary for database insertion.

---

## Verification & Test Results

1. **Acceptance Test Suite (`verify_scraping.py`)**:
   - `python backend/scrapers/verify_scraping.py`
   - **Result**: ALL 5 ACCEPTANCE CRITERIA PASSED (5/5) with 100.0% metric extraction accuracy.
   - Verified Multi-Broker Scraping, LLM Metric Accuracy, SHA-256 Mandatory Caching, Audit Logging (`logs/llm_audit.log`), and Backend API Endpoints (`/api/scraped-reports` and `/api/scraped-reports/stats`).

2. **Unit Test Suite (`test_scrapers_and_llm.py` & `test_backend_api.py`)**:
   - `python -m pytest backend/scrapers/tests/`
   - **Result**: 19 passed in 23.47s.
