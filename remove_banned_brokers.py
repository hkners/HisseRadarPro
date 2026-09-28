import os
import json
import sqlite3
import sys

sys.path.insert(0, os.path.abspath('backend'))
from db_manager import normalize_broker_name

BANNED_BROKERS_LOWER = {
    "pusula", "pusula yatırım", 
    "tera", "tera yatırım", 
    "a1", "a1 capital", "a1 capital yatırım", 
    "atlas", "atlas yatırım", 
    "info", "i̇nfo", "info yatırım", "i̇nfo yatırım", 
    "bulls", "bulls yatırım", 
    "trive", "trive yatırım", 
    "pardus", "pardus yatırım"
}

def is_banned(broker_name):
    if not broker_name: return False
    norm = normalize_broker_name(broker_name).lower()
    if norm in BANNED_BROKERS_LOWER: return True
    # Also check substring just in case
    for b in BANNED_BROKERS_LOWER:
        if b in norm:
            return True
    return False

json_path = "backend/scraped_reports.json"
db_path = "backend/scraped_reports.db"

# 1. Clean JSON
print("Cleaning JSON...")
with open(json_path, 'r', encoding='utf-8') as f:
    reports = json.load(f)

print(f"Original reports count: {len(reports)}")
cleaned_reports = []
removed = 0
for r in reports:
    broker = r.get("broker") or r.get("kurum") or ""
    if not is_banned(broker):
        cleaned_reports.append(r)
    else:
        removed += 1

print(f"Removed {removed} reports. New count: {len(cleaned_reports)}")
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(cleaned_reports, f, ensure_ascii=False, indent=2)

# 2. Clean DB
print("Cleaning DB...")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT id, broker FROM scraped_reports")
rows = cursor.fetchall()
ids_to_delete = []
for r_id, broker in rows:
    if is_banned(broker):
        ids_to_delete.append(r_id)

print(f"Found {len(ids_to_delete)} rows to delete in DB.")
if ids_to_delete:
    placeholders = ",".join("?" * len(ids_to_delete))
    cursor.execute(f"DELETE FROM scraped_reports WHERE id IN ({placeholders})", ids_to_delete)
    conn.commit()

print("Vacuuming DB...")
conn.execute("VACUUM")
conn.close()

print("Done!")
