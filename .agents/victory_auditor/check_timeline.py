import os
import time

files = [
    'PROJECT.md',
    'backend/main.py',
    'backend/scrapers/base_scraper.py',
    'backend/scrapers/garanti_scraper.py',
    'backend/scrapers/deniz_scraper.py',
    'backend/scrapers/llm_parser.py',
    'backend/scrapers/cache_manager.py',
    'backend/scrapers/db_manager.py',
    'backend/scrapers/scraper_network.py',
    'backend/scrapers/verify_scraping.py',
    'backend/scrapers/cache/llm_cache.json',
    'backend/scrapers/logs/llm_audit.log',
    'backend/scrapers/scraped_reports.db',
    'frontend/src/pages/ResearchReports.jsx',
    'frontend/src/pages/Screener.jsx',
    'frontend/src/components/ReportTable.jsx',
    'frontend/src/components/ReportRow.jsx',
    'frontend/src/components/ReportPagination.jsx',
    'frontend/src/components/ReportStats.jsx',
    'frontend/src/components/ReportFilters.jsx'
]

print(f"{'File':<50} | {'Modified Time':<25} | {'Size (bytes)'}")
print('-'*90)
for f in files:
    full_path = os.path.join(r"C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro", f)
    if os.path.exists(full_path):
        mtime = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(full_path)))
        size = os.path.getsize(full_path)
        print(f"{f:<50} | {mtime:<25} | {size}")
    else:
        print(f"{f:<50} | NOT FOUND")
