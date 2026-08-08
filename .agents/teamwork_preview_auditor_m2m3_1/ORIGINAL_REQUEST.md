## 2026-08-03T01:10:59Z
You are teamwork_preview_auditor_m2m3_1.
Your working directory is: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\teamwork_preview_auditor_m2m3_1`

Task: Forensic integrity audit of Milestones 2 & 3 implementation in `backend/scrapers`.
1. Conduct static analysis and code tracing on `base_scraper.py`, `garanti_scraper.py`, `deniz_scraper.py`, `cache_manager.py`, `llm_parser.py`, and `scraper_network.py`.
2. Verify that there are NO cheated implementations, NO hardcoded mock outputs that bypass logic, NO fake test assertions, and that SHA-256 caching genuinely checks content hash and prevents duplicate LLM calls.
3. Run `python backend/scrapers/tests/test_scrapers_and_llm.py`.
4. Write your forensic audit report to `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\teamwork_preview_auditor_m2m3_1\audit_report.md` and `handoff.md`.
5. Notify orchestrator via send_message with verdict: CLEAN or INTEGRITY VIOLATION.
