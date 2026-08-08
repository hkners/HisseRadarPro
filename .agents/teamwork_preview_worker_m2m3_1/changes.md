# Summary of Changes for Milestones 2 & 3

## Overview
Implemented Milestones 2 & 3 for HisseRadarPro in `backend/scrapers/`:
- Multi-Broker Scrapers (Garanti BBVA + Deniz Yatırım)
- LLM Parser with prompt extraction, PDF text extraction, and rule-based heuristic parser fallback
- Mandatory PDF Content SHA-256 Caching Layer (`CacheManager`)
- Prompt Audit Logging (`llm_audit.log`)
- Scraper Network Orchestrator (`scraper_network.py`)
- Full Test Suite (`test_scrapers_and_llm.py`)

## Modified / Created Files

1. `backend/scrapers/__init__.py`:
   - Package initialization file for `backend.scrapers`.

2. `backend/scrapers/base_scraper.py`:
   - `BaseScraper` class with `requests.Session`, standard User-Agent headers, retry logic, rate limiting, and atomic streaming PDF downloader saving to `backend/scrapers/downloads/` with `.tmp` staging and SHA-256 hash calculation.

3. `backend/scrapers/garanti_scraper.py`:
   - `GarantiScraper` inheriting from `BaseScraper`. Scrapes Garanti BBVA Araştırma reports (HTML listing / PDF downloads) with offline fallback for restricted network environments.

4. `backend/scrapers/deniz_scraper.py`:
   - `DenizScraper` inheriting from `BaseScraper`. Scrapes Deniz Yatırım Araştırma reports with offline fallback.

5. `backend/scrapers/cache_manager.py`:
   - `CacheManager` class. Manages `backend/scrapers/cache/llm_cache.json`. Checks SHA-256 content hash of PDF. If present, returns cached result with `"cached": true`. Otherwise saves LLM result upon successful parsing with atomic file updates.

6. `backend/scrapers/prompts/v1_research_extractor.txt`:
   - Standardized LLM system prompt and format specification for equity research report extraction.

7. `backend/scrapers/llm_parser.py`:
   - `LLMParser` class. Loads prompt template, extracts text from PDF (pypdf/fitz/pdfplumber/pure text fallback), calls OpenAI/Gemini or rule-based heuristic parser fallback. Uses `CacheManager` for mandatory caching and logs prompt usage and token metrics to `backend/scrapers/logs/llm_audit.log`.

8. `backend/scrapers/scraper_network.py`:
   - Orchestrator function `run_scraper_network()` executing scrapers, processing reports via `LLMParser`, and saving aggregated output to `backend/scrapers/scraped_reports.json`.

9. `backend/scrapers/tests/test_scrapers_and_llm.py`:
   - Unit & integration test suite covering PDF downloads, scraper extraction, cache hit/miss flow, audit logging, and scraper network orchestration.

10. `backend/scrapers/tests/__init__.py`:
    - Test package initializer.

## Verification Results
- Ran `python -m unittest discover -s backend/scrapers/tests -p "test_*.py" -v` -> 5 passed in 14.52s (OK).
- Ran `python -m pytest backend/scrapers/tests/test_scrapers_and_llm.py -v` -> 5 passed in 15.65s (100% PASSED).
