# HisseRadarPro — Scrapers & LLM Extraction Engine Documentation

## 1. Overview & Architecture

The **HisseRadarPro Research Scraper & LLM Extraction Engine** is an automated pipeline designed to discover, download, parse, and analyze equity research reports published by Borsa İstanbul (BIST) brokerage firms (such as Garanti BBVA Yatırım and Deniz Yatırım).

```
   ┌────────────────────────────────┐       ┌────────────────────────────────┐
   │    Garanti BBVA Scraper        │       │     Deniz Yatırım Scraper      │
   └───────────────┬────────────────┘       └───────────────┬────────────────┘
                   │                                        │
                   ▼                                        ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │          BaseScraper (Atomic PDF Download & SHA-256 Hashing)            │
   └───────────────────────────────────┬─────────────────────────────────────┘
                                       │
                                       ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │               LLM Parser (PDF Extraction & Metric Parser)                │
   │  ┌───────────────────────┐ ┌────────────────────┐ ┌─────────────────┐  │
   │  │ Prompt Template (v1)  │ │ CacheManager (v1)  │ │ Audit Logger    │  │
   │  └───────────────────────┘ └────────────────────┘ └─────────────────┘  │
   └───────────────────────────────────┬─────────────────────────────────────┘
                                       │
                                       ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │           ReportDBManager / Repository (SQLite DB & JSON)               │
   └───────────────────────────────────┬─────────────────────────────────────┘
                                       │
                                       ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │          FastAPI REST Endpoints (/api/scraped-reports)                  │
   └───────────────────────────────────┬─────────────────────────────────────┘
                                       │
                                       ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │        React Terminal Frontend (ResearchReports.jsx & Dark Theme)       │
   └─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. File Layout

```
backend/scrapers/
├── base_scraper.py               # Base class with atomic download & SHA-256 calculation
├── garanti_scraper.py            # Garanti BBVA equity research scraper
├── deniz_scraper.py              # Deniz Yatırım equity research scraper
├── llm_parser.py                 # LLM parsing, text extraction, fallback heuristics & audit logging
├── cache_manager.py              # Thread-safe SHA-256 caching manager
├── db_manager.py                 # SQLite DB & JSON persistence repository
├── repository.py                 # High-level data accessor interface
├── scraper_network.py            # Scraper network orchestrator
├── verify_scraping.py            # Milestone 5 acceptance test suite
├── SCRAPERS_README.md            # Comprehensive system documentation
├── scraped_reports.db            # SQLite database storage
├── scraped_reports.json          # JSON format reports dump
├── cache/
│   └── llm_cache.json            # SHA-256 cached LLM extraction results
├── downloads/                    # Downloaded PDF research reports
│   ├── deniz_akbnk_20260725.pdf
│   ├── deniz_asels_20260730.pdf
│   ├── garanti_garan_20260728.pdf
│   └── garanti_thyao_20260801.pdf
├── logs/
│   └── llm_audit.log             # JSON-L format prompt & audit logs
├── prompts/
│   └── v1_research_extractor.txt # LLM structured output extraction prompt template
└── tests/
    ├── test_scrapers_and_llm.py  # Unit tests for scrapers, cache, and LLM parser
    └── test_backend_api.py       # API integration tests for FastAPI endpoints
```

---

## 3. Broker Scraper Engine

Each broker scraper inherits from `BaseScraper` (`base_scraper.py`) which enforces:
- **Atomic PDF Downloads**: Saves incoming PDF data to a temporary file (`.tmp`) before moving to the target path upon completion.
- **SHA-256 Hashing**: Calculates file content digest prefixed with `sha256:` to guarantee uniqueness.

### Supported Brokers:
1. **Garanti BBVA (`garanti_scraper.py`)**: Fetches equity research and stock recommendation PDFs from Garanti BBVA Yatırım.
2. **Deniz Yatırım (`deniz_scraper.py`)**: Scrapes stock analysis PDFs from Deniz Yatırım.

---

## 4. LLM PDF Parser & Metric Extraction (`llm_parser.py`)

`LLMParser` processes PDF research reports into structured JSON data.

### Features:
- **PDF Extraction**: Uses available text extraction libraries (`pypdf`, `PyMuPDF`, `pdfplumber`, or stream regex parser) to extract raw text content.
- **LLM Integration**: Calls OpenAI / Gemini API when keys are configured in environment (`OPENAI_API_KEY`, `GEMINI_API_KEY`).
- **Heuristic Fallback**: Built-in regex rule parser guarantees reliable metric extraction even when API keys are absent or network requests fail offline.

---

## 5. Prompt Configuration (`prompts/v1_research_extractor.txt`)

The extraction prompt (`v1_research_extractor`) forces the LLM to output raw JSON matching this schema:

```json
{
  "ticker": "THYAO",
  "broker": "Garanti BBVA",
  "rating": "AL",
  "target_price": 450.0,
  "current_price": 315.5,
  "potansiyel": 42.6,
  "report_date": "2026-08-01",
  "summary": "Report summary text...",
  "catalysts": "Key upside drivers..."
}
```

---

## 6. SHA-256 Mandatory Caching Engine (`cache_manager.py`)

- **Non-Duplication Guarantee**: Every PDF report is hashed (`sha256:<digest>`).
- Before sending text to LLM API, `CacheManager` checks `cache/llm_cache.json`.
- On **Cache HIT**: Returns cached report instantly (`cached: True`), making **0 duplicate LLM API calls** and saving tokens.
- On **Cache MISS**: Executes parser, stores result in cache file, and logs audit line (`cached: False`).

---

## 7. Audit Logging (`logs/llm_audit.log`)

Every parsing request writes an audit line to `logs/llm_audit.log`:

```log
[2026-08-03T01:20:00Z] PROMPT_ID=v1_research_extractor FILE_HASH=sha256:2245741ac3d0... INPUT_TOKENS=291 OUTPUT_TOKENS=36 CACHED=False STATUS=SUCCESS
[2026-08-03T01:20:01Z] PROMPT_ID=v1_research_extractor FILE_HASH=sha256:2245741ac3d0... INPUT_TOKENS=0 OUTPUT_TOKENS=0 CACHED=True STATUS=CACHE_HIT
```

---

## 8. Database & Persistence Layer (`db_manager.py`)

Thread-safe dual persistence engine synchronized across:
- **SQLite Database**: `scraped_reports.db` (table `scraped_reports`)
- **JSON File**: `scraped_reports.json`

---

## 9. Backend API Routes

The FastAPI backend (`backend/main.py`) exposes these endpoints:

| Endpoint | Method | Description | Parameters |
|---|---|---|---|
| `/api/scraped-reports` | `GET` | Returns filtered research reports | `ticker`, `broker`, `rating`, `search`, `min_upside`, `limit` |
| `/api/scraped-reports/stats` | `GET` | Returns aggregated metrics & stats | None |
| `/api/scraped-reports/trigger-scrape` | `POST` | Triggers background or sync scraper run | `limit_per_broker`, `run_sync` |

---

## 10. Frontend UI Integration

The frontend features a dedicated terminal page **Araştırma Raporları** (`/reports`) strictly styled with Bloomberg dark aesthetic tokens (`.panel`, `.data-table`, `.search-box`, `.btn-read`, `--color-up`, `--color-down`, `--text-highlight`, `Roboto Mono`).

### Features:
- **Filter Bar**: Search by keyword/ticker, Broker dropdown, Rating dropdown (`AL`, `TUT`, `SAT`), min upside potential %, date/upside sort.
- **Summary Stats**: Total report count, unique brokerage count, top recommended stock card.
- **Terminal Table**: Recommendation badges (`AL`: `#00ff00`, `TUT`: `#ffcc00`, `SAT`: `#ff3333`), current price, target price, upside %, report date, expand accordion for summary & catalysts, view PDF link.

---

## 11. How to Run Services

### 1. Start Backend API Server
```bash
python backend/main.py
```
Backend will start on `http://localhost:8015` (or configured port).

### 2. Start Frontend Development Server
```bash
cd frontend
npm install
npm run dev
```
Frontend terminal app will open on `http://localhost:5173`. Navigate to `/reports` for Araştırma Raporları.

---

## 12. Verification & Testing Guide

Run the full Milestone 5 Acceptance Test Suite:

```bash
python backend/scrapers/verify_scraping.py
```

Runs all 5 core criteria:
1. `[x] Multi-Broker Scraping` (Garanti BBVA + Deniz Yatırım)
2. `[x] LLM PDF Parsing & Metric Extraction accuracy (>=90%)`
3. `[x] Mandatory Caching non-duplication`
4. `[x] Prompt Configuration & Audit Logging`
5. `[x] Backend API Endpoint Verification`

To run unit & API test suites:
```bash
pytest backend/scrapers/tests/
```
