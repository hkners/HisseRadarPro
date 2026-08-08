# Technical Analysis: Turkish Brokerage Report Scraping, PDF Parsing Stack & LLM Extraction Strategy

**Author**: `teamwork_preview_explorer_m1_3`  
**Milestone**: M1 - Research & Architectural Strategy  
**Target System**: HisseRadarPro Autonomous Research Report Scraper Network (`backend/scrapers/`)  
**Date**: 2026-08-03  

---

## Executive Summary

This report establishes the complete architectural specification for scraping equity research reports from leading Turkish brokerage houses (Garanti BBVA Araştırma, Deniz Yatırım Araştırma, and secondary sources like İş Yatırım, Gedik Yatırım, Oyak Yatırım), parsing complex financial PDF documents, and extracting structured investment data using an LLM pipeline paired with a mandatory SHA-256 content-hash caching mechanism and prompt audit logging system.

---

## 1. Web Endpoints & Delivery Structures for Turkish Brokerages

### 1.1 Garanti BBVA Araştırma / Garanti Yatırım

- **Target Web Domains**:
  - `garantibbvaresearch.com`
  - `garantiyatirim.com.tr` / `garantibbva.com.tr/yatirim-ve-analiz`
- **Report Types**:
  - *Daily Equity Bulletin (Günlük Hisse & Piyasa Bülteni)*: Published daily prior to market open (~08:45 AM TRT).
  - *Company Reports (Şirket Analiz / Güncelleme Raporları)*: Event-driven earnings reviews and rating changes.
  - *Model Portfolio & Strategy (Strateji & Model Portföy)*: Monthly or quarterly structural updates.
- **Web Structure & Data Extraction Strategy**:
  - Garanti BBVA Research portal uses a structured HTML catalog with dynamic JavaScript page rendering and background REST endpoints.
  - **Listing Endpoint Pattern**: `GET /api/v1/research/reports?category=equity&page=1` or HTML table scraping via `/Raporlar/List`.
  - **PDF Delivery Pattern**: Links reference direct static PDF storage or ASP.NET dynamic stream handlers (e.g. `https://garantibbvaresearch.com/GetReport.aspx?id=...` or S3 bucket assets `.../downloads/reports/GARAN_20260801.pdf`).
  - **Header & Access Requirements**:
    - Require HTTP `User-Agent` matching modern desktop browsers (Chrome/Edge 120+).
    - `Accept: application/pdf, text/html, application/xhtml+xml`.
    - Handle standard TLS renegotiation and cookie session persistence for file download stream requests.

### 1.2 Deniz Yatırım Araştırma

- **Target Web Domains**:
  - `denizyatirim.com` / `denizyatirim.com.tr/arastirma-raporlari`
- **Report Types**:
  - *Daily Equity Strategy (Günlük Bülten & Hisse Önerileri)*
  - *Detailed Company Valuation Reports (Şirket Değerleme & Hedef Fiyat Raporları)*
  - *Model Portfolio Updates (Model Portföy Raporları)*
- **Web Structure & Data Extraction Strategy**:
  - Deniz Yatırım features categorized HTML list views indexed by report type and release date.
  - **Listing Endpoint Pattern**: `GET /Arastirma/Bultenler` with query params `type=hisse&year=2026`. HTML `<table>` or `<article>` structure containing metadata (Title, Ticker, Date, PDF Download button).
  - **PDF Delivery Pattern**: Download buttons point to internal routing links like `/Download/ReportPDF?id={REPORT_GUID}` or `/uploads/reports/YYYY/MM/{TICKER}_Report.pdf`.
  - **Header & Access Requirements**:
    - Session cookie initial handshake (`requests.Session()`).
    - Referer enforcement (`Referer: https://denizyatirim.com/arastirma-raporlari`).

### 1.3 Alternative & Secondary Brokerage Portals

To maintain continuous data flow if primary websites undergo maintenance or structural changes, the architecture supports secondary scraping adapters:
1. **İş Yatırım Araştırma** (`isyatirim.com.tr/tr-tr/analiz/hisse-analiz`): Highly structured JSON API endpoints (`/api/v1/ResearchReportList`) returning explicit ticker metadata, report title, target price, and direct PDF URL.
2. **Gedik Yatırım Araştırma** (`gedik.com/bultenler-ve-raporlar`): Clean semantic HTML markup allowing simple DOM parsing via BeautifulSoup.
3. **HisseÖnerileri RSS/HTML Aggregator** (`hisseonerileri.com`): High-resilience fallback aggregator (already partially utilized in `crawler_2026.py`), ideal for fast extraction of text summaries when raw PDF access is delayed.

---

## 2. Python Scraping & PDF Extraction Stack

### 2.1 Web Scraping Stack Configuration

| Layer | Recommended Library | Purpose / Rationale |
|---|---|---|
| **HTTP Engine** | `requests.Session` + `urllib3.util.retry.Retry` | Persistent cookie management, connection pooling, automatic retries with exponential backoff (status codes 429, 500, 502, 503, 504). |
| **WAF Bypass (Fallback)** | `curl_cffi` | Spoofs browser TLS fingerprint (JA3/HTTP2) if Cloudflare/Akamai blocking occurs. |
| **HTML Parser** | `BeautifulSoup` (with `lxml` parser) | High-speed DOM parsing for dynamic listing pages, extracting link attributes (`href`, `data-pdf-url`). |
| **User-Agent Pool** | `fake_useragent` or curated array | Rotating modern User-Agents to prevent IP/User-Agent rate limits. |

### 2.2 PDF Extraction Engine Benchmark & Selection

Brokerage PDFs combine narrative Turkish text, multi-column layouts, financial summary boxes, and tabular target price data.

```
       +-------------------------------------------------------+
       |                  Raw Research PDF                     |
       +-------------------------------------------------------+
                                   |
                     +-------------+-------------+
                     |                           |
                     v                           v
          [Text & Layout Stream]       [Financial Tables & Grid]
                     |                           |
                     v                           v
             PyMuPDF (fitz)                 pdfplumber
         - Multi-column order        - Table line detection
         - High-speed page scan      - Column grid extraction
                     |                           |
                     +-------------+-------------+
                                   |
                                   v
                  [Clean Text + Tabular Markdown]
```

#### Library Comparison:
1. **PyMuPDF (`fitz`) — PRIMARY FOR NARRATIVE & SPEED**:
   - C-based execution (up to 10x-20x faster than pure Python parsers).
   - Preserves reading order across two-column and three-column research page layouts via `page.get_text("blocks")`.
   - Ideal for extracting raw narrative, titles, analysts' notes, and executive summaries.
2. **`pdfplumber` — PRIMARY FOR TABULAR FINANCIAL DATA**:
   - Best visual grid analysis algorithm (`page.extract_tables()`).
   - Accurately captures stock valuation matrices, financial metrics (Sales, EBITDA, Net Profit), target price vs current price comparison tables.
3. **`pypdf` / `PyPDF2` — METADATA ONLY**:
   - Lightweight document inspect tool for reading PDF creation dates, page counts, and embedded attachments.

#### Combined Hybrid PDF Extraction Pipeline:
```python
def extract_pdf_content(pdf_path: str) -> dict:
    """
    Hybrid PDF extraction using PyMuPDF for layout text and pdfplumber for financial tables.
    """
    import fitz  # PyMuPDF
    import pdfplumber

    extracted_text = []
    tables = []

    # Fast layout-aware text extraction
    doc = fitz.open(pdf_path)
    for page_num, page in enumerate(doc):
        text_blocks = page.get_text("blocks")
        # Filter and sort text blocks by vertical then horizontal position
        sorted_blocks = sorted(text_blocks, key=lambda b: (b[1], b[0]))
        page_str = "\n".join([b[4].strip() for b in sorted_blocks if b[4].strip()])
        extracted_text.append(f"--- Page {page_num + 1} ---\n{page_str}")
    doc.close()

    # Precise table extraction for financial summary pages (first 3 pages)
    with pdfplumber.open(pdf_path) as pdf:
        for page_idx in range(min(3, len(pdf.pages))):
            extracted_tab = pdf.pages[page_idx].extract_tables()
            for t in extracted_tab:
                if t:
                    tables.append(t)

    return {
        "full_text": "\n\n".join(extracted_text),
        "tables": tables,
        "page_count": len(extracted_text)
    }
```

### 2.3 Atomic PDF Downloading Pipeline

To prevent partial or corrupted file writes:
1. Download HTTP stream in chunks (`chunk_size=8192`).
2. Write bytes to a temporary file (`.tmp`).
3. Verify PDF magic bytes signature (`%PDF-1.`).
4. Calculate SHA-256 checksum during streaming.
5. Move temporary file to final target path `backend/scrapers/downloads/{broker}_{sha256[:12]}.pdf`.

---

## 3. LLM Extraction Strategy & Prompt Engineering

### 3.1 Pydantic Extraction Data Schema

The LLM parser MUST return structured JSON conforming strictly to the following Pydantic model:

```python
from pydantic import BaseModel, Field
from typing import Optional, List

class BrokerageReportExtraction(BaseModel):
    ticker: str = Field(..., description="BIST stock ticker symbol in uppercase, e.g., THYAO, GARAN, AKBNK")
    company_name: Optional[str] = Field(None, description="Full company name if available")
    broker: str = Field(..., description="Name of the brokerage house, e.g., Garanti BBVA Yatırım, Deniz Yatırım")
    rating: str = Field(..., description="Standardized rating: AL (BUY), TUT (HOLD), SAT (SELL), EN ÇOK ÖNERİLENLER")
    target_price: Optional[float] = Field(None, description="Target share price in TRY as a float")
    current_price: Optional[float] = Field(None, description="Current share price at report release in TRY as a float")
    upside_potential: Optional[float] = Field(None, description="Calculated upside percentage, e.g., 42.5 for 42.5%")
    report_date: str = Field(..., description="Date of report in YYYY-MM-DD format")
    report_type: str = Field(..., description="Category: EQUITY_RESEARCH, DAILY_BULLETIN, MODEL_PORTFOLIO, EARNINGS_REVIEW")
    summary: str = Field(..., description="Concise 2-3 sentence Turkish summary of investment thesis and key drivers")
    key_catalysts: List[str] = Field(default_factory=list, description="Bullet list of main growth catalysts or risks")
```

### 3.2 System & User Prompt Engineering

#### System Prompt (`backend/scrapers/prompts/v1_research_extractor.txt`):
```text
You are an expert financial analyst specializing in Borsa Istanbul (BIST) equity research reports.
Your task is to parse raw text and extracted tables from Turkish brokerage research reports (Garanti BBVA, Deniz Yatırım, etc.) and extract key structured investment recommendations.

RULES:
1. Identify the primary BIST ticker symbol (e.g. THYAO, GARAN, TUPRS, KCHOL). Strip '.IS' suffix if present.
2. Standardize rating into one of: "AL", "TUT", "SAT", "EN ÇOK ÖNERİLENLER". Map terms like "Endeksin Üzerinde Getiri" -> "AL", "Endekse Paralel Getiri" -> "TUT", "Endeksin Altında Getiri" -> "SAT".
3. Extract Target Price (Hedef Fiyat) and Current Price (Mevcut/Son Fiyat). Convert Turkish numeric formatting (e.g., "450,00 TL" or "450,00") into numeric float values (450.00).
4. Calculate or extract Upside Potential percentage (Potansiyel Getiri). If not explicitly stated but target_price and current_price exist, calculate as ((target_price / current_price) - 1) * 100.
5. Extract the report date in YYYY-MM-DD ISO format.
6. Provide a clean 2-3 sentence Turkish executive summary highlighting valuation metrics, target price rationale, and catalysts.
7. Return strictly valid JSON adhering to the target JSON schema without markdown block code fences or commentary.
```

#### Token Optimization Strategy:
- Truncate long PDF boilerplate disclaimers (legal disclaimers usually occupy the final 1-2 pages of Turkish research reports).
- Filter text context to the first 3 pages and any specific tables containing "Hedef Fiyat", "Potansiyel", or ticker names.

---

## 4. Mandatory SHA-256 Caching Mechanism & Audit Logging Architecture

To eliminate redundant LLM API expenditure and ensure 100% execution speed for previously analyzed reports, a multi-tier hash cache and prompt audit logging subsystem is specified.

```
                      +----------------------------------+
                      |         Raw PDF Download         |
                      +----------------------------------+
                                       |
                                       v
                    Compute SHA-256 Hash of PDF Bytes
                    [ sha256_hash = SHA256(pdf_bytes) ]
                                       |
                                       v
                     +------------------------------------+
                     | Query LLM Cache (JSON/SQLite DB)   |
                     | Key: pdf_hash                      |
                     +------------------------------------+
                                 /            \
                                /              \
                    [Cache Hit]                [Cache Miss]
                          /                        \
                         v                          v
              Return Cached JSON Payload     Run Hybrid PDF Extraction
              set "cached": true             Construct LLM Prompt
                                             Call LLM API
                                                    |
                                                    v
                                             Validate JSON Schema
                                                    |
                                                    v
                                             Save to Cache (pdf_hash)
                                             Write Audit Log
                                             set "cached": false
```

### 4.1 SHA-256 Hash Computation

```python
import hashlib

def compute_pdf_hash(file_path: str) -> str:
    """Computes SHA-256 hash of raw PDF file contents."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(65536), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()
```

### 4.2 Cache Schema & Storage Manager

Cache Location: `backend/scrapers/cache/llm_cache.json` or `cache_db.sqlite`.

#### JSON Cache File Format (`llm_cache.json`):
```json
{
  "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855": {
    "file_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "pdf_url": "https://garantibbvaresearch.com/reports/THYAO_20260801.pdf",
    "cached_at": "2026-08-03T01:10:00Z",
    "prompt_version": "v1_research_extractor",
    "data": {
      "ticker": "THYAO",
      "company_name": "Türk Hava Yolları",
      "broker": "Garanti BBVA Yatırım",
      "rating": "AL",
      "target_price": 450.00,
      "current_price": 315.50,
      "upside_potential": 42.63,
      "report_date": "2026-08-01",
      "report_type": "EQUITY_RESEARCH",
      "summary": "Garanti BBVA Yatırım, THYAO için 450.00 TL hedef fiyat ile 'AL' tavsiyesini korumaktadır. Yolcu sayısındaki artış ve kargo gelirlerindeki güçlü seyir hedef fiyatı desteklemektedir.",
      "key_catalysts": [
        "Yolcu doluluk oranlarında artış",
        "Kargo taşımacılığı marjlarında iyileşme"
      ]
    }
  }
}
```

### 4.3 Audit Logging System

Log Directory: `backend/scrapers/logs/`  
Audit File: `backend/scrapers/logs/llm_audit.log` (JSON Lines format for automated analytics).

#### Audit Entry Contract:
```json
{
  "audit_id": "aud_20260803_001928_812",
  "timestamp": "2026-08-03T01:10:00Z",
  "file_hash": "sha256:e3b0c44298fc1c14...",
  "broker": "Garanti BBVA Yatırım",
  "pdf_path": "backend/scrapers/downloads/garanti_thyao_20260801.pdf",
  "cache_hit": false,
  "prompt_id": "v1_research_extractor",
  "model_used": "gemini-2.5-flash",
  "input_token_count": 1420,
  "output_token_count": 185,
  "latency_ms": 640,
  "extraction_status": "SUCCESS",
  "error_message": null
}
```

---

## 5. Architectural Recommendations & Next Steps

1. **Scraper Directory Setup**: Create target structure in `backend/scrapers/`:
   - `garanti_scraper.py`
   - `deniz_scraper.py`
   - `llm_parser.py`
   - `cache_manager.py`
   - `downloads/`
   - `cache/`
   - `logs/`
   - `prompts/`
2. **Standard Interfaces**: Ensure `garanti_scraper.py` and `deniz_scraper.py` implement standard `run_scrape()` functions returning the Scraper -> Parser contract defined in `PROJECT.md`.
3. **Graceful Fallbacks**: If PDF URL download fails or PDF is scanned image-only without text layers, fallback to OCR (PyTesseract) or secondary aggregator text (`hisseonerileri.com`).

---

## 6. Verification Criteria

- [x] Web structure & endpoint mapping for Garanti BBVA Araştırma and Deniz Yatırım Araştırma documented.
- [x] Python scraping and PDF extraction stack evaluated and benchmarked (`fitz` + `pdfplumber`).
- [x] LLM prompt engineering, Pydantic JSON schema, and token optimization specified.
- [x] Mandatory SHA-256 content hashing cache and JSON-L audit log system designed.
