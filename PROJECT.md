# Project: HisseRadarPro Autonomous Research Report Scraper Network

## Architecture
- **Backend Framework**: Python (FastAPI) server in `backend/main.py` (running on port 8015)
- **Target Scrapers Directory**: `backend/scrapers`
- **Frontend Framework**: React / Vite in `frontend/`
- **Scraper Modules**: `base_scraper.py`, `garanti_scraper.py`, `deniz_scraper.py`
- **LLM Pipeline**: `backend/scrapers/llm_parser.py`
- **Caching Layer**: `backend/scrapers/cache_manager.py` with `backend/scrapers/cache/llm_cache.json`
- **Prompt & Audit Repo**: `backend/scrapers/prompts/` and `backend/scrapers/logs/`
- **Backend Persistence & API**: `backend/scrapers/db_manager.py`, `backend/scrapers/repository.py`, exposing `/api/scraped-reports`, `/api/scraped-reports/stats`, `/api/scraped-reports/trigger-scrape` in `backend/main.py`
- **Frontend UI Component**: `frontend/src/pages/ResearchReports.jsx` and updated `frontend/src/components/Sidebar.jsx`

## Code Layout
- `backend/main.py` — FastAPI application server exposing `/api/scraped-reports` (port 8015)
- `backend/scrapers/base_scraper.py` — Abstract base scraper with HTTP session & atomic PDF downloader
- `backend/scrapers/garanti_scraper.py` — Garanti BBVA Research Scraper
- `backend/scrapers/deniz_scraper.py` — Deniz Yatırım Research Scraper
- `backend/scrapers/llm_parser.py` — LLM-based PDF text/table parser with structured JSON output
- `backend/scrapers/cache_manager.py` — SHA-256 content hashing & cache manager
- `backend/scrapers/db_manager.py` & `repository.py` — SQLite & JSON research report repository manager
- `backend/scrapers/scraper_network.py` — High-level scraper network orchestrator
- `backend/scrapers/verify_scraping.py` — Verification & acceptance test suite
- `backend/scrapers/SCRAPERS_README.md` — Scraper network documentation
- `frontend/src/pages/ResearchReports.jsx` — Research Reports UI page
- `frontend/src/components/Sidebar.jsx` — Updated Navigation with /reports

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration & Architecture | Codebase structure & target brokerage scraping strategy | none | DONE |
| 2 | Multi-Broker Scrapers | Garanti BBVA + Deniz Yatırım scrapers & PDF downloader | M1 | DONE |
| 3 | LLM Parser & Caching | LLM extraction with mandatory SHA256 caching & prompt records | M1 | DONE |
| 4 | Backend Integration | Data persistence schema & API endpoints for research reports | M2, M3 | DONE |
| 5 | UI & Verification Suite | UI integration, verify_scraping.py test suite & SCRAPERS_README.md | M4 | DONE |

## Interface Contracts
### Scraper -> Parser Contract
```json
{
  "broker": "Garanti BBVA",
  "report_title": "Garanti BBVA günlük bülten / rapor",
  "report_date": "2026-08-01",
  "pdf_path": "backend/scrapers/downloads/garanti_20260801.pdf",
  "pdf_url": "https://...",
  "file_hash": "sha256:..."
}
```

### Parser -> Backend/UI Contract
```json
{
  "id": "report_1",
  "ticker": "THYAO",
  "broker": "Garanti BBVA",
  "rating": "AL",
  "target_price": 450.00,
  "current_price": 315.50,
  "potansiyel": 42.6,
  "report_date": "2026-08-01",
  "summary": "...",
  "full_text": "...",
  "cached": true,
  "prompt_id": "v1_research_extractor",
  "file_hash": "a1b2c3d4..."
}
```
