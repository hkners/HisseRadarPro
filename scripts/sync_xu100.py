"""
Sync XU100 Index historical prices into scraped_reports.db.
Downloads daily OHLCV for XU100.IS via yfinance and inserts into historical_prices.
"""
import sqlite3
import os
import yfinance as yf
import pandas as pd

def sync_xu100():
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", "scraped_reports.db")
    print(f"Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    print("Fetching XU100.IS from yfinance...")
    df = yf.download("XU100.IS", period="5y", interval="1d", progress=False)
    if df.empty:
        print("Failed to download XU100.IS data.")
        conn.close()
        return False

    records = []
    # If MultiIndex columns (Ticker, Price), flatten
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [col[0] for col in df.columns]

    for date_idx, row in df.iterrows():
        date_str = date_idx.strftime("%Y-%m-%d")
        o = float(row.get("Open", 0.0))
        h = float(row.get("High", 0.0))
        l = float(row.get("Low", 0.0))
        cl = float(row.get("Close", 0.0))
        v = int(row.get("Volume", 0)) if not pd.isna(row.get("Volume")) else 0
        if cl > 0:
            records.append(('XU100', date_str, o, h, l, cl, v))

    print(f"Prepared {len(records)} daily records for XU100.")
    c.executemany("""
        INSERT OR REPLACE INTO historical_prices (ticker, date, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, records)
    conn.commit()
    conn.close()
    print("XU100 historical prices synced successfully!")
    return True

if __name__ == "__main__":
    sync_xu100()
