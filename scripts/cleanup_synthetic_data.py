"""
HisseRadarPro — remove synthetic test data from the live database
=================================================================
scripts/seed_backtest_data.py once wrote into backend/scraped_reports.db:
- 3,750 score_history rows dated 2026-02-17 .. 2026-06-01 (all created at 2026-09-27T22:27:36.307555),
  generated to correlate with future returns, so the score-quality analysis looked predictive;
- 159 random-walk price rows for IPEKE starting 2026-02-17 (IPEKE is not in the BIST list).

Usage (from the project root):
    python scripts/cleanup_synthetic_data.py          # shows what would be deleted
    python scripts/cleanup_synthetic_data.py --apply  # deletes it

A backup copy was taken first: backend/scraped_reports.backup-2026-10-05.db
"""

import os
import sqlite3
import sys

DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", "scraped_reports.db")
SEED_CREATED_AT = "2026-09-27T22:27:36.307555"

SCORE_WHERE = "created_at = ? AND snapshot_date < '2026-07-01'"
PRICE_WHERE = "ticker = 'IPEKE' AND date >= '2026-02-17'"


def main() -> None:
    apply = "--apply" in sys.argv
    conn = sqlite3.connect(DB, timeout=30)
    try:
        n_scores = conn.execute(f"SELECT COUNT(*) FROM score_history WHERE {SCORE_WHERE}", (SEED_CREATED_AT,)).fetchone()[0]
        n_prices = conn.execute(f"SELECT COUNT(*) FROM historical_prices WHERE {PRICE_WHERE}").fetchone()[0]
        print(f"Sentetik skor kaydı: {n_scores}")
        print(f"Sentetik IPEKE fiyat satırı: {n_prices}")
        if not apply:
            print("Silmek için: python scripts/cleanup_synthetic_data.py --apply")
            return
        conn.execute(f"DELETE FROM score_history WHERE {SCORE_WHERE}", (SEED_CREATED_AT,))
        conn.execute(f"DELETE FROM historical_prices WHERE {PRICE_WHERE}")
        conn.commit()
        print("Silindi. Backend'i yeniden başlatınca önbellekler de yenilenir.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
