# Handoff Report: Scraper & LLM Module Audit (HisseRadarPro)

**Agent**: Explorer Subagent (`explorer_scrapers`)  
**Target Directory**: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\explorer_scrapers\`  
**Analysis Report**: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\explorer_scrapers\analysis_scrapers.md`  

---

## 1. Observation

Direct observations from codebase inspection, line-by-line code review, and test executions:

1. **Scraper Orchestrator Cache Bypass (`backend/scrapers/scraper_network.py`:77-94)**:
   `run_scraper_network()` calls `parser._heuristic_parse(raw_text, metadata=metadata)` directly, bypassing `LLMParser.parse_report()`. Consequently, `CacheManager.get()` and `CacheManager.set()` are never called, zero lines are written to `logs/llm_audit.log`, and `ReportDBManager.save_reports()` is not invoked. Line 94 hardcodes `"cached": True` for all returned reports.
2. **Deniz Scraper WAF PDF Download Failure (`backend/scrapers/deniz_scraper.py`:61 vs `base_scraper.py`:117)**:
   `DenizScraper` fetches HTML using `curl_cffi.requests.get(..., impersonate="chrome110")` but calls `self.download_pdf()` which uses standard `requests.Session()`. WAF protection blocks standard `requests`, resulting in HTTP 403 Forbidden on PDF downloads.
3. **Hardcoded Report Date (`backend/scrapers/deniz_scraper.py`:58)**:
   Line 58 sets `report_date = now.strftime("%Y-%m-%d")` for all scraped Deniz Yatırım reports, overwriting historical publication dates.
4. **Garanti Scraper Link & Timeout Fragility (`backend/scrapers/garanti_scraper.py`:29, 37, 54)**:
   - Line 29 uses `wait_until="networkidle"`, risking 60s Playwright timeout hangs.
   - Line 37 uses `a.href.toLowerCase().includes('.pdf')`, missing links with query parameters or non-anchor download triggers.
   - Line 54 date regex `(\d{2})[./-](\d{2})[./-](\d{4})` requires exactly 2 digits for day/month, failing on single-digit dates like `1.8.2026`.
5. **Regex Extraction Bugs (`backend/scrapers/llm_parser.py`:136, 161, 170)**:
   - Line 136: `exclude_words` is missing `BBVA`, `DENIZ`, `GARAN`, `BULTEN`, etc. For `"Garanti BBVA THYAO Raporu"`, `BBVA` is extracted as the ticker.
   - Line 161: `re.search(r"\bAL\b|\bBUY\b", text, re.IGNORECASE)` matches any lower-case Turkish word containing `"al"`, setting rating to `"AL"` for almost all reports.
   - Line 170: `(\d+(?:[.,]\d+)?)` truncates numbers with thousands separators (`1.450,00` -> `1.45`), driving upside potential calculations to `-99.54%`.
6. **LLM API Unused Variable & Input Truncation (`backend/scrapers/llm_parser.py`:270, 276)**:
   Line 270 constructs `prompt_content` but fails to pass it to `client.chat.completions.create()`. Line 276 truncates text input to `text[:4000]` characters.
7. **Test Suite Results**:
   - `python backend/scrapers/verify_scraping.py` failed with `AssertionError: Garanti scraper failed to return reports.`
   - `python -m unittest discover -s backend/scrapers/tests` completed with 5 failures and 1 error (e.g. `AssertionError: 'EBEBK' != ''`, `IndexError: list index out of range`).

---

## 2. Logic Chain

1. **From Observation 1**: Because `scraper_network.py` calls `parser._heuristic_parse()` directly instead of `parser.parse_report()`, the entire caching layer (`CacheManager`), audit logger (`log_audit`), LLM API pipeline (`_call_llm_api`), and DB manager (`ReportDBManager`) are bypassed during live scraper network runs. Hardcoding `"cached": True` conceals this architectural bypass.
2. **From Observation 2**: Because `DenizScraper` uses `curl_cffi` for HTML but standard `requests` for PDF downloads, any PDF protected by Cloudflare WAF will fail during `download_pdf()`.
3. **From Observation 3 & 4**: Weak date extraction regex in Garanti and hardcoded dates in Deniz lead to corrupted date metadata across research report records.
4. **From Observation 5**: Deficiencies in `exclude_words`, case-insensitive rating regex, and number regex cause widespread inaccuracies in ticker identification, recommendation ratings, target prices, and upside potential calculations.
5. **From Observation 6**: Constructing `prompt_content` without passing it wastes code, while `text[:4000]` truncation discards financial tables located beyond page 1 of PDFs.
6. **From Observation 7**: Lack of offline fallback fixtures in scrapers causes test suites (`verify_scraping.py` and unit tests) to fail whenever live brokerage websites cannot be reached.

---

## 3. Caveats

- **Live WAF Behavior**: Network behavior of Garanti BBVA and Deniz Yatırım websites was evaluated based on code structure and local sandbox test execution (`CODE_ONLY` mode). Live web scraping behavior may vary if anti-bot protections change.
- **OCR Capability**: PDF text extraction depends on text layers inside PDFs. Scanned/image PDFs were not tested with Tesseract OCR as OCR libraries are currently not integrated.

---

## 4. Conclusion

The Scraper & LLM module architecture in `backend/scrapers/` possesses a solid foundational design, but requires critical refactoring to fix:
1. Orchestrator integration in `scraper_network.py` (wiring `LLMParser.parse_report()` and `ReportDBManager.save_reports()`).
2. WAF session consistency in `DenizScraper`.
3. Metric regex parsers (ticker exclusion list, case-sensitive rating, thousands separators).
4. Date parsing resilience and URL formatting.
5. Offline fallback fixtures for test stability.

A detailed audit report has been written to `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\explorer_scrapers\analysis_scrapers.md`.

---

## 5. Verification Method

To verify these findings independently:

1. **Inspect Analysis Report**: View `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\explorer_scrapers\analysis_scrapers.md`.
2. **Code Inspection**:
   - Inspect `backend/scrapers/scraper_network.py` lines 66-96 to verify direct call to `_heuristic_parse()` and absence of `CacheManager` / `save_reports()`.
   - Inspect `backend/scrapers/llm_parser.py` lines 136, 161, 170 to verify regex bugs.
   - Inspect `backend/scrapers/deniz_scraper.py` line 58 (`report_date = now...`) and line 61 (`self.download_pdf()`).
3. **Run Verification Commands**:
   - Run acceptance test suite: `python backend/scrapers/verify_scraping.py`
   - Run unit test suite: `python -m unittest discover -s backend/scrapers/tests`
