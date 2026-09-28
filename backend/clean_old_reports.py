import sqlite3
import os

db_path = r'c:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\backend\scraped_reports.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM scraped_reports WHERE report_date < '2026-01-01'")
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    print(f'Deleted {deleted} old reports from database.')
else:
    print('Database not found.')
