# Comprehensive Audit Report: Scraper & LLM Modules (HisseRadarPro)

**Date**: 2026-08-06  
**Auditor**: Explorer Subagent  
**Target Directory**: `backend/scrapers/` & related backend modules  

---

## Executive Summary

A comprehensive, line-by-line audit of the **HisseRadarPro Scraper & LLM Pipeline** was conducted across all brokerage scrapers, PDF text extraction utilities, LLM integration routines, regex metric parsers, mandatory SHA-256 caching layers, prompt configuration stores, audit loggers, database managers, and test suites.

While the architecture is well-designed with clear interface contracts, atomic PDF downloads, and thread-safe caching, the investigation revealed **critical bugs, severe cache bypass flaws, fragile web selectors, and regex extraction errors** that compromise production reliability and accuracy:

1. **Scraper Network Cache & Audit Bypass**: `scraper_network.py` (triggered by `/api/scraped-reports/trigger-scrape`) calls `LLMParser._heuristic_parse()` directly, **completely bypassing `CacheManager` lookup/persistence, audit logging (`llm_audit.log`), and SQLite DB persistence (`scraped_reports.db`)**, while fake-flagging items with `"cached": True`.
2. **Deniz Scraper WAF / Session Discrepancy**: `DenizScraper` uses `curl_cffi` to fetch HTML modals to bypass Cloudflare/WAF, but delegates PDF download to `BaseScraper.download_pdf()`, which uses standard `requests`. This causes HTTP 403 Forbidden failures on WAF-protected PDFs.
3. **Regex Metric Parsing & Thousands Separator Bugs**:
   - **Ticker Extraction**: Exclude list lacks common title terms like `BBVA`, `DENIZ`, `BULTEN`, causing `BBVA` to be extracted as ticker instead of `THYAO` for title `"Garanti BBVA THYAO Raporu"`.
   - **Rating False Positives**: Case-insensitive matching `\bAL\b` matches any lower-case Turkish word containing `"al"` (e.g. *"alındı"*, *"dikkate alındığında"*), misclassifying almost all reports as `"AL"`.
   - **Number Formatting**: Regex `(\d+(?:[.,]\d+)?)` truncates numbers with thousands separators (`1.450,00 TL` -> `1.45`), causing upside potential calculations to evaluate to `-99.54%`.
4. **Scraper Link & Date Fragility**: `GarantiScraper` relies on `document.querySelectorAll("a")` with `.pdf` string matching and `networkidle` (causing 60s Playwright timeouts), while `DenizScraper` hardcodes `report_date = today` for all scraped historical reports.
5. **Acceptance Test Suite Failures**: Running `verify_scraping.py` and `unittest` confirmed test failures when scrapers attempt live network requests without offline fallback mocks.

---

## 1. Brokerage Scrapers Audit

### 1.1 Garanti BBVA Scraper (`garanti_scraper.py`)

| Aspect | Implementation | Audit Finding & Risk |
|---|---|---|
| **Tech Stack** | Playwright (`sync_playwright`) | Requires headless Chromium browser process. If Playwright binaries are missing or fail in container environments, scraper crashes. |
| **Page Navigation** | `page.goto(url, wait_until="networkidle", timeout=60000)` | **Fragile**: `networkidle` hangs on sites with continuous telemetry or WebSocket connections, causing 60s execution timeouts. |
| **PDF Discovery** | `document.querySelectorAll("a")` filtering `a.href.includes('.pdf')` | **Fragile**: Misses uppercase `.PDF`, links with query parameters (`/download?id=123`), `data-href` attributes, dynamic JS click handlers, or PDF view buttons. |
| **URL Formatting** | `href = "https://www.garantibbvayatirim.com.tr" + href` (Line 51) | **Bug**: Fails if `href` is a relative path without a leading slash (e.g., `reports/1.pdf` -> `https://www.garantibbvayatirim.com.trreports/1.pdf`). Should use `urllib.parse.urljoin`. |
| **Date Parsing** | `re.search(r"(\d{2})[./-](\d{2})[./-](\d{4})", title_text)` (Line 54) | **Bug**: `\d{2}` requires exactly 2 digits for day and month. Fails on single-digit dates like `1.8.2026`. Falls back to `today()`, corrupting report metadata. |
| **Offline Resilience** | Returns `[]` on failure | No mock or local fixture fallback when network/site is unreachable. |

### 1.2 Deniz Yatırım Scraper (`deniz_scraper.py`)

| Aspect | Implementation | Audit Finding & Risk |
|---|---|---|
| **Tech Stack** | `curl_cffi.requests` | Successfully bypasses WAF fingerprinting during HTML fetch (`impersonate="chrome110"`). |
| **PDF Downloader** | Calls `self.download_pdf(pdf_href)` in `BaseScraper` | **CRITICAL BUG**: `BaseScraper.download_pdf()` uses standard `requests.Session()`. When Cloudflare/WAF blocks standard Python requests, PDF download fails with `HTTP 403 Forbidden` despite successful HTML fetch! |
| **Report Date** | `report_date = now.strftime("%Y-%m-%d")` (Line 58) | **CRITICAL BUG**: Hardcodes today's date for all scraped reports, obliterating historical report publication dates. |
| **Modal Link Resolution** | `ajax_href.replace("..", "")` + string concat (Line 43) | **Fragile**: Improper URL resolution if `ajax_href` doesn't begin with `/`. Should use `urllib.parse.urljoin`. |
| **Scope** | Targets only `GunlukBulten` endpoint | Ignores 12 other research categories (`SirketRaporlari`, `StratejiNotlari`, `ModelPortfoy`, etc.) unless `scrape_2026.py` is run manually. |

### 1.3 Base Scraper (`base_scraper.py`)

- **Atomic Download**: Saves streaming bytes to `<file>.tmp` before atomic rename (`os.rename`).
- **SHA-256 Digest**: Computes `sha256:<hex>` digest during stream reading.
- **Flaws**:
  - `timeout=3.0` seconds is too short for downloading large research report PDFs over real networks.
  - Absence of `try...finally` block in `download_pdf()` leaves orphan `.tmp` files in `downloads/` if download raises an exception mid-stream.

---

## 2. LLM Integration, PDF Extraction & Regex Parsing Audit

### 2.1 PDF Text Extraction Engine (`llm_parser.py`)

`LLMParser.extract_pdf_text()` implements a 4-tier extraction cascade:
1. `pypdf` (`reader.pages[].extract_text()`)
2. `fitz` / PyMuPDF (`page.get_text()`)
3. `pdfplumber` (`page.extract_text()`)
4. Fallback Raw Stream Regex Parser (`\((.*?)\)\s*Tj` and word matching)

**Audit Findings**:
- Tier 4 stream parser extracts garbled or fragmented strings when PDFs use complex font encoding matrices (CMap).
- **No OCR Support**: If a PDF is image-based or scanned, all 4 tiers return `"Empty report text."` without OCR fallback (`tesseract` / `pdf2image`).
- **Module Discrepancy**: `scraper_network.py` imports deprecated `PyPDF2` directly instead of calling `LLMParser.extract_pdf_text()`.

### 2.2 LLM API Call Mechanism (`_call_llm_api`)

```python
# llm_parser.py Lines 268-283
prompt_content = f"{self.prompt_template}\n\nReport Text:\n{text[:4000]}" # Variable defined but unused!

response = client.chat.completions.create(
    model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
    messages=[
        {"role": "system", "content": self.prompt_template},
        {"role": "user", "content": f"Extract financial data from this report:\n{text[:4000]}"},
    ],
    response_format={"type": "json_object"},
    temperature=0.1,
)
```

**Audit Findings**:
1. **Unused Variable Bug**: `prompt_content` is constructed on line 270 but never passed into the API payload.
2. **Text Truncation Data Loss**: `text[:4000]` cuts input at 4,000 characters (~600 words). Multi-page reports with financial target tables or catalysts on pages 2–5 get truncated before reaching LLM context.
3. **Gemini SDK Incompatibility**: If `GEMINI_API_KEY` is provided without `OPENAI_API_KEY` or `OPENAI_BASE_URL`, calling `openai.OpenAI()` fails unless an OpenAI-compatible endpoint URL is explicitly configured.

### 2.3 Regex & Heuristic Parser Bugs (`_heuristic_parse`)

#### Bug 1: Ticker Extraction Exclude List Deficiency (`llm_parser.py:136`)
```python
raw_matches = re.findall(r"\b[A-Z]{4,5}\b", report_title)
exclude_words = {"TÜRK", "OCAK", "MART", "EKİM", "KASIM", "RAPOR", "TARİH", "Tarih", "FIYAT", "FİYAT", "TUTAR", "SATIŞ", "BIST", "ENDEK", "FON", "YENI"}
```
- **Root Cause**: `exclude_words` does NOT include `BBVA`, `DENIZ`, `GARAN`, `BULTEN`, `HAFTALIK`, `GUNLUK`, `AKSAM`, `SABAH`, `SIRKET`, `NOTLAR`, `DEĞER`, `PORTFÖY`.
- **Impact**: For a title like `"Garanti BBVA THYAO Raporu"`, `BBVA` matches `\b[A-Z]{4,5}\b` before `THYAO`! `BBVA` is assigned as the stock ticker!
- **Scope Defect**: Ignores 3-letter BIST tickers (e.g. `KAR`, `ALN`, `EGE`) and 6-letter BIST tickers.

#### Bug 2: Rating False Positive via Case-Insensitive `\bAL\b` (`llm_parser.py:161`)
```python
elif re.search(r"\bAL\b|\bBUY\b", text, re.IGNORECASE):
    rating = "AL"
```
- **Root Cause**: `re.IGNORECASE` matches `"al"` case-insensitively inside standard Turkish sentences (*"alındı"*, *"dikkate alındığında"*, *"alımlar kaleme alındı"*).
- **Impact**: Almost ALL equity research reports are misclassified as `"AL"`.

#### Bug 3: Thousands Separator Truncation (`llm_parser.py:170, 183`)
```python
tp_match = re.search(
    r"(?:Hedef Fiyat|Hedef|Target Price|TP)[^\d]*(\d+(?:[.,]\d+)?)",
    text,
    re.IGNORECASE,
)
```
- **Root Cause**: `(\d+(?:[.,]\d+)?)` matches digits up to the first delimiter. For Turkish formatted numbers with thousands dots like `1.450,00 TL`, regex extracts `1.45`!
- **Impact**: Target price of `1,450.00` becomes `1.45`. When combined with current price `315.50`, calculated upside potential evaluates to `-99.54%`!

---

## 3. LLM Caching Mechanism Audit

### 3.1 CacheManager Architecture (`cache_manager.py`)

- **Storage**: `backend/scrapers/cache/llm_cache.json`
- **Key Digest**: Normalizes `sha256:<hex>` and raw hex digests.
- **Thread Safety**: Uses `threading.Lock()` and atomic write (`os.replace` on `.tmp` file).
- **Cache Contract**:
  - `get(file_hash)` returns a deep copy with `"cached": True`.
  - `set(file_hash, data)` saves record with `"cached": False`.

### 3.2 CRITICAL ARCHITECTURE FLAW: Cache & Audit Bypass in `scraper_network.py`

`scraper_network.py` is the orchestrator invoked during production scraper runs (via `/api/scraped-reports/trigger-scrape` in `backend/main.py`).

```python
# scraper_network.py Lines 66-96
for raw_item in all_raw_reports:
    raw_text = extract_text_from_pdf(pdf_path)
    
    # Direct call to internal private method!
    metadata = {"broker": raw_item.get("broker", "")}
    parsed_data = parser._heuristic_parse(raw_text, metadata=metadata)
    
    parsed_report = {
        ...
        "cached": True # FAKE CACHED FLAG!
    }
```

**Systemic Failure Analysis**:
1. **Cache Bypass**: `scraper_network.py` calls private `parser._heuristic_parse()` directly. It **NEVER calls `parser.parse_report()`**, bypassing `CacheManager.get()` and `CacheManager.set()`.
2. **Fake Caching Flag**: It hardcodes `"cached": True` on line 94 for all returned items, hiding the cache bypass.
3. **Audit Log Bypass**: Zero lines are written to `logs/llm_audit.log` during scheduled/triggered scraping runs.
4. **Database Persistence Bypass**: It does NOT call `ReportDBManager.save_reports()`. Scraped reports are written directly to `scraped_reports.json`, leaving `scraped_reports.db` unsynchronized until manual backend reload.

---

## 4. Prompt Logging & Configuration Storage Audit

### 4.1 Prompt Configuration
- **File Path**: `backend/scrapers/prompts/v1_research_extractor.txt`
- **Fallback Template**: Hardcoded string in `llm_parser.py:_load_prompt_template()`.
- **Extraction Schema**: Prompts force raw JSON output containing:
  `ticker`, `broker`, `rating`, `target_price`, `current_price`, `potansiyel`, `report_date`, `summary`, `catalysts`, `stocks`.

### 4.2 Audit Logging (`logs/llm_audit.log`)
- **Format**: Structured JSON-L / key-value lines:
  `[<timestamp>] PROMPT_ID=v1_research_extractor FILE_HASH=sha256:... INPUT_TOKENS=... OUTPUT_TOKENS=... CACHED=... STATUS=...`
- **Status**: Functional when `LLMParser.parse_report()` is invoked directly. As noted above, calls via `scraper_network.py` bypass audit logging entirely.

---

## 5. Verification Suite & Test Execution Findings

Executing the acceptance test suites revealed 5 test failures in `unittest`:

```
======================================================================
1. FAIL: test_2_garanti_and_deniz_scrapers
   AssertionError: 0 not greater than or equal to 1
2. ERROR: test_4_llm_parser_extraction_and_caching_flow
   IndexError: list index out of range (due to empty scraper output)
3. FAIL: test_5_scraper_network_orchestrator
   AssertionError: 0 not greater than or equal to 2
4. FAIL: test_3_get_scraped_reports_broker_filter
   AssertionError: 0 not greater than 0
5. FAIL: test_11_repository_db_manager_unit
   AssertionError: 'EBEBK' != ''
======================================================================
```

**Root Causes**:
1. Live network scraping calls fail in sandbox/offline environments. Lack of fixture fallback causes scraper tests to fail.
2. Inconsistent ticker normalization stores empty string `""` in database records, causing `repo.get_reports(ticker=...)` comparison to fail.

---

## 6. Comprehensive Refactoring Plan & Recommendations

### 6.1 Priority 1 (Critical Fixes)
1. **Fix `scraper_network.py` Orchestrator**:
   - Replace `parser._heuristic_parse()` with `parser.parse_report(pdf_path, file_hash, metadata)`.
   - Call `ReportDBManager.save_reports(parsed_reports)` to ensure SQLite DB and JSON persistence stay in sync.
   - Replace deprecated `PyPDF2` import with `LLMParser.extract_pdf_text()`.
2. **Fix `DenizScraper` WAF PDF Download**:
   - Pass custom `curl_cffi` session or `impersonate="chrome110"` option to `BaseScraper.download_pdf()` so PDF downloads succeed against WAF blockades.
3. **Fix Regex Metric Extractor (`llm_parser.py`)**:
   - Expand `exclude_words` to include `BBVA`, `DENIZ`, `GARAN`, `BULTEN`, `HAFTALIK`, `GUNLUK`, `AKSAM`, `SABAH`, `SIRKET`, `NOTLAR`.
   - Cross-check candidate tickers against official BIST ticker list (`all_bist.txt`).
   - Fix `\bAL\b` rating regex to be case-sensitive or match explicit rating headers (`"Tavsiye: AL"`).
   - Fix number parser to handle Turkish format (`1.450,00` -> `1450.00`).

### 6.2 Priority 2 (Scraper & Link Robustness)
1. **Garanti & Deniz URL Resolution**: Replace manual string concatenation with `urllib.parse.urljoin(self.BASE_URL, href)`.
2. **Date Parsing**: Replace strict `\d{2}` regex with flexible date parser supporting `1.8.2026` format. Extract actual publication dates in `DenizScraper` instead of hardcoding today's date.
3. **Playwright Navigation**: Change `wait_until="networkidle"` to `wait_until="domcontentloaded"` in `GarantiScraper`.

### 6.3 Priority 3 (LLM & Performance Optimizations)
1. **LLM Input Truncation**: Increase context window slice from 4,000 characters to 16,000 characters or pass full report text for modern LLM models.
2. **Fallback Mock Fixtures**: Add offline fallback sample PDFs/data in scrapers so test suites (`verify_scraping.py`, unit tests) pass reliably without network access.

---
*Report compiled by Explorer Subagent for HisseRadarPro.*
