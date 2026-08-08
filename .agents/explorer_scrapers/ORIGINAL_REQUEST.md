## 2026-08-06T18:12:01Z
You are an Explorer subagent for HisseRadarPro.
Your working directory is: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\explorer_scrapers`
Project root: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro`

Task:
Conduct a comprehensive audit of Scraper & LLM modules (`C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\backend\scrapers` or related directories).
1. Inspect Garanti, Deniz Yatırım, and any other brokerage scrapers.
2. Check LLM integration, PDF text extraction, regex parsing bugs, and fallback mechanisms.
3. Inspect the LLM caching mechanism: ensure processed report hashes/PDF IDs are cached in DB/JSON so identical reports are never sent to LLM twice. Check `verify_scraping.py` or equivalent cache verification script.
4. Inspect prompt logging & configuration storage (storing LLM prompts and extraction schemas).
5. Identify bugs, fragile selectors, network error handling, and clean code refactoring needs.
6. Write a detailed report `analysis_scrapers.md` in your working directory `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\explorer_scrapers\analysis_scrapers.md`.
7. Create a `handoff.md` in your working directory and notify the parent orchestrator via `send_message`.
