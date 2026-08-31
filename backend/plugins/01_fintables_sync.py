"""
Plugin: 01_fintables_sync.py
----------------------------
Syncs analyst recommendations from Fintables.com for all BIST tickers.
Saves results to scraped_reports.db (SQLite) via ReportRepository.
"""
import sys
import os

# Ensure backend is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")

from globals import BIST_TICKERS
from scrapers.fintables_scraper import scrape_fintables_tickers
from db_manager import ReportRepository

def main():
    print(f"[01_fintables_sync] Starting Fintables Sync for {len(BIST_TICKERS)} tickers...")

    reports = scrape_fintables_tickers(BIST_TICKERS)
    print(f"[01_fintables_sync] Scraped {len(reports)} raw reports from Fintables.")

    if not reports:
        print("[01_fintables_sync] No reports scraped. Exiting.")
        return

    repo = ReportRepository()

    # Map fintables fields to canonical DB schema
    mapped = []
    for r in reports:
        mapped.append({
            "ticker":        r.get("ticker", ""),
            "broker":        r.get("broker", ""),
            "rating":        r.get("recommendation", ""),
            "target_price":  r.get("target_price"),
            "current_price": r.get("current_price"),
            "potansiyel":    r.get("potansiyel"),
            "report_date":   r.get("report_date", ""),
            "is_model":      r.get("is_model", False),
            "source":        r.get("source", "Fintables"),
        })

    saved = repo.save_reports(mapped)
    print(f"[01_fintables_sync] Saved/updated {saved} reports in DB.")
    print("[01_fintables_sync] Sync complete.")


if __name__ == "__main__":
    main()
