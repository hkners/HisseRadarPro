import os
import sys
import json
import logging
from datetime import datetime
import yfinance as yf
from typing import List, Dict, Any

# Ensure we can import from backend root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from globals import BIST_TICKERS, report_repo

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("YF_Sync")

import numpy as np

def extract_df(df, max_cols=12):
    if df is None or df.empty:
        return {}
    cols = df.columns[:max_cols]
    result = {"dates": [col.strftime('%Y-%m') for col in cols][::-1]}
    for index in df.index:
        values = []
        for col in cols:
            val = df.loc[index, col]
            if isinstance(val, (int, float)) and (np.isnan(val) or np.isinf(val)):
                values.append(None)
            else:
                try:
                    values.append(float(val))
                except:
                    values.append(None)
        result[str(index)] = values[::-1]
    return result

def extract_series(series):
    if series is None or series.empty:
        return {}
    dates = []
    values = []
    for date, val in series.items():
        dates.append(date.strftime('%Y-%m-%d'))
        values.append(float(val))
    return {"dates": dates, "values": values}


def sync_stock(ticker: str):
    """Fetches history and fundamentals for a single ticker and saves to DB."""
    yf_ticker = f"{ticker}.IS"
    logger.info(f"Syncing {ticker} ({yf_ticker})...")
    
    try:
        stock = yf.Ticker(yf_ticker)
        
        # 1. Fetch Fundamentals
        info = stock.info
        sector = info.get("sector", "Bilinmiyor")
        
        # 1.5 Fetch Full Financials
        try:
            balance_sheet = extract_df(stock.quarterly_balance_sheet)
        except Exception as e:
            logger.warning(f"Failed to fetch balance sheet for {ticker}: {e}")
            balance_sheet = {}
            
        try:
            income_stmt = extract_df(stock.quarterly_financials)
        except Exception as e:
            logger.warning(f"Failed to fetch income statement for {ticker}: {e}")
            income_stmt = {}
            
        try:
            cash_flow = extract_df(stock.quarterly_cashflow)
        except Exception as e:
            logger.warning(f"Failed to fetch cash flow for {ticker}: {e}")
            cash_flow = {}
            
        try:
            dividends = extract_series(stock.dividends)
        except Exception as e:
            logger.warning(f"Failed to fetch dividends for {ticker}: {e}")
            dividends = {}
            
        try:
            splits = extract_series(stock.splits)
        except Exception as e:
            logger.warning(f"Failed to fetch splits for {ticker}: {e}")
            splits = {}


        fundamentals = {
            "marketCap": info.get("marketCap"),
            "trailingPE": info.get("trailingPE"),
            "forwardPE": info.get("forwardPE"),
            "priceToBook": info.get("priceToBook"),
            "dividendYield": info.get("dividendYield"),
            "trailingEps": info.get("trailingEps"),
            "forwardEps": info.get("forwardEps"),
            "ebitdaMargins": info.get("ebitdaMargins"),
            "profitMargins": info.get("profitMargins"),
            "revenueGrowth": info.get("revenueGrowth"),
            "debtToEquity": info.get("debtToEquity"),
            "returnOnEquity": info.get("returnOnEquity"),
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
            "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
            "industry": info.get("industry"),
            "balance_sheet": balance_sheet,
            "income_statement": income_stmt,
            "cash_flow": cash_flow,
            "dividends": dividends,
            "splits": splits
        }
        
        now_str = datetime.now().isoformat()
        report_repo.upsert_company_info(
            ticker=ticker,
            sector=sector,
            fundamentals_json=json.dumps(fundamentals),
            last_updated=now_str
        )
        
        # 2. Fetch Historical Prices (1 Year)
        hist = stock.history(period="max")
        if not hist.empty:
            hist = hist.dropna(subset=['Open', 'High', 'Low', 'Close'])
            records = []
            for date, row in hist.iterrows():
                date_str = date.strftime("%Y-%m-%d")
                records.append((
                    ticker,
                    date_str,
                    float(row["Open"]),
                    float(row["High"]),
                    float(row["Low"]),
                    float(row["Close"]),
                    int(row["Volume"])
                ))
            
            report_repo.upsert_historical_prices(records)
            logger.info(f"Successfully synced {ticker} (Fundamentals + {len(records)} days of history)")
        else:
            logger.warning(f"No history data found for {ticker}")
            
    except Exception as e:
        logger.error(f"Failed to sync {ticker}: {e}")

def run_sync_all():
    """Syncs all BIST tickers defined in globals (FULL sync)."""
    logger.info(f"Starting full Yahoo Finance sync for {len(BIST_TICKERS)} tickers...")
    for idx, ticker in enumerate(BIST_TICKERS):
        sync_stock(ticker)
        logger.info(f"Progress: {idx+1}/{len(BIST_TICKERS)}")
    logger.info("Full sync completed!")


def sync_stock_incremental(ticker: str):
    """Fetches only the missing recent price data for a ticker. Much faster than full sync."""
    yf_ticker = f"{ticker}.IS"
    
    try:
        # Check latest date in DB
        latest_date_str = report_repo.get_latest_price_date(ticker)
        
        if not latest_date_str:
            # No data at all — do a full sync for this ticker
            logger.info(f"{ticker}: No history in DB, doing full sync...")
            sync_stock(ticker)
            return
        
        latest_date = datetime.strptime(latest_date_str, "%Y-%m-%d").date()
        today = datetime.now().date()
        days_missing = (today - latest_date).days
        
        if days_missing <= 1:
            # Already up to date (or just 1 day which may not be closed yet)
            return
        
        # Pick the smallest yfinance period that covers the gap
        if days_missing <= 7:
            period = "5d"
        elif days_missing <= 30:
            period = "1mo"
        elif days_missing <= 90:
            period = "3mo"
        else:
            period = "6mo"
        
        stock = yf.Ticker(yf_ticker)
        hist = stock.history(period=period)
        
        if hist.empty:
            return
        
        hist = hist.dropna(subset=['Open', 'High', 'Low', 'Close'])
        
        # Only keep dates after latest_date in DB
        records = []
        for date, row in hist.iterrows():
            date_obj = date.date() if hasattr(date, 'date') else date
            date_str = date.strftime("%Y-%m-%d")
            if date_str > latest_date_str:
                records.append((
                    ticker,
                    date_str,
                    float(row["Open"]),
                    float(row["High"]),
                    float(row["Low"]),
                    float(row["Close"]),
                    int(row["Volume"])
                ))
        
        if records:
            report_repo.upsert_historical_prices(records)
            logger.info(f"{ticker}: +{len(records)} new days (was {latest_date_str})")
        
    except Exception as e:
        logger.error(f"{ticker} incremental sync failed: {e}")


def run_incremental_sync():
    """Fast incremental sync — only fetches missing recent days for all tickers."""
    import time
    start = time.time()
    logger.info(f"Starting incremental sync for {len(BIST_TICKERS)} tickers...")
    
    updated = 0
    skipped = 0
    for idx, ticker in enumerate(BIST_TICKERS):
        latest = report_repo.get_latest_price_date(ticker)
        if latest:
            today = datetime.now().date()
            days_missing = (today - datetime.strptime(latest, "%Y-%m-%d").date()).days
            if days_missing <= 1:
                skipped += 1
                continue
        
        sync_stock_incremental(ticker)
        updated += 1
        
        if (idx + 1) % 20 == 0:
            logger.info(f"Progress: {idx+1}/{len(BIST_TICKERS)}")
    
    elapsed = time.time() - start
    logger.info(f"Incremental sync done in {elapsed:.1f}s — Updated: {updated}, Already current: {skipped}")


if __name__ == "__main__":
    run_sync_all()
