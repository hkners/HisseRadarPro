import logging
import sqlite3
import os
import json
import time
from datetime import datetime
import yfinance as yf

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

class YFCacher:
    def __init__(self, db_path: str = None):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.db_path = db_path or os.path.join(base_dir, "scraped_reports.db")
    
    def _get_connection(self):
        return sqlite3.connect(self.db_path)

    def get_unique_tickers(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT ticker FROM scraped_reports WHERE ticker IS NOT NULL AND ticker != ''")
            return [row[0] for row in cursor.fetchall()]

    def sync_all_tickers(self, delay_ms=1000):
        tickers = self.get_unique_tickers()
        logger.info(f"Found {len(tickers)} unique tickers in the database.")
        
        for i, ticker in enumerate(tickers):
            logger.info(f"[{i+1}/{len(tickers)}] Syncing data for {ticker}...")
            self.sync_ticker(ticker)
            time.sleep(delay_ms / 1000.0)

    def sync_ticker(self, ticker: str):
        # We query Yahoo finance using the .IS suffix for Borsa Istanbul
        yf_ticker = f"{ticker}.IS"
        stock = yf.Ticker(yf_ticker)
        
        # 1. Fetch Fundamentals
        try:
            info = stock.info
            if info:
                sector = info.get("sector", "N/A")
                last_updated = datetime.now().isoformat()
                fundamentals_json = json.dumps(info, ensure_ascii=False)
                
                with self._get_connection() as conn:
                    conn.execute("""
                        INSERT INTO company_info (ticker, sector, fundamentals_json, last_updated)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(ticker) DO UPDATE SET 
                            sector = excluded.sector,
                            fundamentals_json = excluded.fundamentals_json,
                            last_updated = excluded.last_updated
                    """, (ticker, sector, fundamentals_json, last_updated))
        except Exception as e:
            logger.error(f"Failed to fetch info for {ticker}: {e}")

        # 2. Fetch Historical Prices (1 Year)
        try:
            hist = stock.history(period="1y")
            if not hist.empty:
                with self._get_connection() as conn:
                    for date, row in hist.iterrows():
                        date_str = date.strftime("%Y-%m-%d")
                        conn.execute("""
                            INSERT INTO historical_prices (ticker, date, open, high, low, close, volume)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(ticker, date) DO UPDATE SET
                                open = excluded.open,
                                high = excluded.high,
                                low = excluded.low,
                                close = excluded.close,
                                volume = excluded.volume
                        """, (
                            ticker,
                            date_str,
                            float(row['Open']),
                            float(row['High']),
                            float(row['Low']),
                            float(row['Close']),
                            int(row['Volume'])
                        ))
        except Exception as e:
            logger.error(f"Failed to fetch history for {ticker}: {e}")

if __name__ == "__main__":
    cacher = YFCacher()
    cacher.sync_all_tickers(delay_ms=500)
