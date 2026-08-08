## 2026-08-03T01:04:54Z
Task: Research brokerage report web pages & PDF extraction / LLM strategy.
1. Research web endpoints and structures for Garanti BBVA Araştırma (garantibbvareserach.com or garanti.com.tr / garanti yatırım) and Deniz Yatırım Araştırma (denizyatirim.com). Also check alternative/accessible brokerage report pages if needed.
2. Determine required Python scraping stack (requests, BeautifulSoup, pdfplumber/pypdf/fitz, headers/user-agents, PDF downloading).
3. Design LLM extraction strategy & mandatory hash-based caching mechanism (SHA256 of raw PDF content / URL -> skip LLM if hash exists; prompt audit logging).
4. Write your findings and recommendations to `C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\.agents\teamwork_preview_explorer_m1_3\analysis.md` and handoff summary to `handoff.md` in your directory.
5. Notify the orchestrator via send_message when done.
