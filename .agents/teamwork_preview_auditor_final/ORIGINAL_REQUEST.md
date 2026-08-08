## 2026-08-03T01:23:08Z
You are teamwork_preview_auditor_final.
Your working directory is: `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\teamwork_preview_auditor_final`

Task: Final Forensic Integrity Audit across the entire HisseRadarPro scraper network, backend API, and UI integration.
1. Conduct static analysis and code tracing on `backend/scrapers/*.py`, `backend/main.py`, `frontend/src/pages/ResearchReports.jsx`, and `verify_scraping.py`.
2. Verify zero integrity violations: NO cheated implementations, NO hardcoded test results, NO dummy/facade implementations, genuine SHA-256 content hash caching, real LLM extraction logic, and clean integrity.
3. Run `python backend/scrapers/verify_scraping.py`.
4. Write your forensic audit report to `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\teamwork_preview_auditor_final\audit_report.md` and `handoff.md`.
5. Notify orchestrator via send_message with verdict CLEAN or INTEGRITY VIOLATION.
