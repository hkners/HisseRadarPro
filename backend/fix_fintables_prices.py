import sqlite3
import os
import sys
import yfinance as yf
from datetime import datetime, timedelta
import pandas as pd

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scraped_reports.db")
_PRICE_CACHE = {}

def get_historical_close(ticker, date_str):
    cache_key = f"{ticker}_{date_str}"
    if cache_key in _PRICE_CACHE:
        return _PRICE_CACHE[cache_key]
        
    try:
        start_date = datetime.strptime(date_str, "%Y-%m-%d")
        end_date = start_date + timedelta(days=7) # Look ahead to find first trading day
        data = yf.download(f"{ticker}.IS", start=start_date.strftime("%Y-%m-%d"), end=end_date.strftime("%Y-%m-%d"), progress=False)
        if not data.empty:
            close_prices = data['Close']
            if isinstance(close_prices, pd.DataFrame):
                 price = float(close_prices.iloc[0, 0])
            else:
                 price = float(close_prices.iloc[0])
            if pd.isna(price): price = 0.0
            _PRICE_CACHE[cache_key] = price
            return price
    except Exception as e:
        print(f"Error fetching historical price for {ticker} on {date_str}: {e}")
    
    _PRICE_CACHE[cache_key] = 0.0
    return 0.0

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Select ALL reports that have a target_price (since Fintables might have saved live price)
    cursor.execute("""
        SELECT id, ticker, report_date, target_price, current_price, potansiyel 
        FROM scraped_reports 
        WHERE target_price > 0 
    """)
    rows = cursor.fetchall()
    
    print(f"Found {len(rows)} Fintables reports missing current_price.")
    
    updated_count = 0
    for row in rows:
        row_id, ticker, report_date, target_price, current_price, potansiyel = row
        if not report_date:
            continue
            
        print(f"Processing ID {row_id} | {ticker} | Date: {report_date}")
        hist_price = get_historical_close(ticker, report_date)
        
        if hist_price > 0:
            new_current = round(hist_price, 2)
            new_pot = round(((target_price - new_current) / new_current) * 100, 2)
            
            cursor.execute("""
                UPDATE scraped_reports 
                SET current_price = ?, potansiyel = ?
                WHERE id = ?
            """, (new_current, new_pot, row_id))
            updated_count += 1
            print(f"  -> Updated {ticker} on {report_date}: Price = {new_current}, Potential = {new_pot}%")
    
    conn.commit()
    conn.close()
    print(f"Successfully updated {updated_count} reports.")

if __name__ == "__main__":
    main()
