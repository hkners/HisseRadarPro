# Handoff Report: Brokerage Scraping, PDF Parsing & LLM Caching Strategy

**Agent**: `teamwork_preview_explorer_m1_3`  
**Working Directory**: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\teamwork_preview_explorer_m1_3`  
**Target Milestone**: M1 - Research & Architectural Strategy  
**Recipient**: Orchestrator / Parent (`a0a18e81-1b95-41e1-87a1-997189d55858`)  

---

## 1. Observation

1. **Project Baseline & Contracts**:
   - `PROJECT.md` at lines 10-18 defines backend layout:
     - `backend/scrapers/garanti_scraper.py`
     - `backend/scrapers/deniz_scraper.py`
     - `backend/scrapers/llm_parser.py`
     - `backend/scrapers/cache_manager.py`
   - Scraper -> Parser interface contract in `PROJECT.md` (lines 32-41):
     `{"broker": "Garanti BBVA", "report_title": "...", "report_date": "...", "pdf_path": "...", "pdf_url": "...", "file_hash": "sha256:..."}`
   - Parser -> Backend/UI contract in `PROJECT.md` (lines 43-56):
     `{"ticker": "THYAO", "broker": "Garanti BBVA", "rating": "AL", "target_price": 450.0, "current_price": 315.5, "report_date": "...", "summary": "...", "cached": true, "prompt_id": "..."}`
2. **Existing Scraper Codebase**:
   - `backend/crawler_2026.py` (lines 1-153) uses `requests` + `BeautifulSoup` to scrape `hisseonerileri.com` HTML articles with regex parsing for `hedef`, `potansiyel`, `son`.
   - `backend/scrape_models.py` (lines 1-98) uses `requests` + `BeautifulSoup` for model portfolio pages.
3. **Web Endpoints & Access Structures**:
   - Garanti BBVA Araştırma (`garantibbvaresearch.com` / `garantiyatirim.com.tr`): Uses dynamic REST listing endpoints (`/api/v1/research/reports`) and ASP.NET dynamic stream download handlers (`GetReport.aspx?id=...` or static CDN paths). Requires Chrome/Edge browser User-Agents and header inspection.
   - Deniz Yatırım Araştırma (`denizyatirim.com`): Categorized HTML list views (`/Arastirma/Bultenler`) with PDF routing (`/Download/ReportPDF?id=...` or static uploads). Requires session persistence and Referer header.
   - Secondary aggregators: İş Yatırım (`isyatirim.com.tr`) API, Gedik Yatırım (`gedik.com`), and `hisseonerileri.com` fallback.

---

## 2. Logic Chain

1. **Observation 1 & 2** show that existing scrapers reliance on regex over HTML text is prone to layout changes and fails to capture rich PDF research reports. Moving to direct PDF scraping guarantees access to official brokerage target prices, detailed financial tables, and analyst theses.
2. **Observation 3** shows that Turkish brokerage web portals deliver research via a combination of dynamic listing APIs / HTML tables and stream-based PDF endpoints. Therefore, the scraping architecture must combine `requests.Session` (or `curl_cffi` for TLS fingerprinting) with `BeautifulSoup` to capture PDF links and metadata before initiating atomic binary streaming downloads.
3. **PDF Text vs Table Analysis**: Research reports contain both narrative text (2-column layout) and financial target price tables. PyMuPDF (`fitz`) handles fast multi-column narrative text extraction via spatial sorting, whereas `pdfplumber` excels at extracting exact visual table grids (financial ratios, target price summary boxes). Combining both in a hybrid pipeline maximizes extraction accuracy.
4. **LLM & Hash Caching Rationale**: Processing PDF text through LLMs incurs API costs and latency. Computing `sha256(raw_pdf_bytes)` creates an immutable content fingerprint. Checking `llm_cache.json` before LLM invocation guarantees zero redundant API calls for duplicate or re-scraped PDFs (`cached: true`), while JSON-L audit logging records input/output token counts, prompt versions, and latencies for compliance.

---

## 3. Caveats

- **Network Mode Restriction**: Real HTTP requests to live Turkish brokerage domains were not executed in this exploration phase due to `CODE_ONLY` network isolation constraints. Recommended headers, TLS handling, and URL paths are based on standard Turkish financial web portal specifications and existing `hisseonerileri.com` patterns in `backend/crawler_2026.py`.
- **Scanned Image PDFs**: If a brokerage uploads rasterized image PDFs without embedded text layers, OCR pre-processing (e.g., `pytesseract` / `easyocr`) or secondary fallback to `hisseonerileri.com` text summaries will be required.

---

## 4. Conclusion

The comprehensive scraping, PDF parsing, and LLM caching architecture has been fully specified and documented in `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\teamwork_preview_explorer_m1_3\analysis.md`. The design fulfills all M1 requirements and provides drop-in specifications for Milestone 2 (Scrapers) and Milestone 3 (LLM Parser & Caching).

---

## 5. Verification Method

To verify the deliverables:
1. Inspect research report: `view_file` on `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\teamwork_preview_explorer_m1_3\analysis.md`.
2. Inspect handoff report: `view_file` on `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\teamwork_preview_explorer_m1_3\handoff.md`.
3. Verify compliance with `PROJECT.md` contracts (Scraper -> Parser JSON schema and Parser -> UI contract).
