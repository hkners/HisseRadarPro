"""
Price Service
Background worker for fetching BIST stock prices via yfinance.
Thread-safe price cache with periodic refresh.
"""
import math
import threading
import time
from datetime import datetime
from typing import Optional

import yfinance as yf


class PriceService:
    """Thread-safe price cache with background yfinance fetcher."""

    def __init__(self, bist_tickers: list, refresh_interval: int = 900, report_repo=None):
        self._lock = threading.Lock()
        self.bist_tickers = bist_tickers
        self.refresh_interval = refresh_interval
        self._prices: dict = {}
        self._last_updated: Optional[str] = None
        self._status: str = "INITIALIZING"
        
        if report_repo:
            print("Preloading historical prices into PriceService cache...")
            for ticker in self.bist_tickers:
                hist = report_repo.get_historical_prices(ticker)
                if hist and len(hist) > 0:
                    last_day = hist[-1]
                    prev_day = hist[-2] if len(hist) > 1 else last_day
                    chg = ((last_day["close"] - prev_day["close"]) / prev_day["close"] * 100) if prev_day["close"] > 0 else 0
                    self._prices[ticker] = {
                        "price": self._safe_float(last_day["close"]),
                        "change_pct": self._safe_float(chg),
                        "volume": self._safe_float(last_day.get("volume", 0))
                    }
            if self._prices:
                self._last_updated = "Preloaded (DB)"
                self._status = "READY"
                print(f"Preloaded {len(self._prices)} prices from database.")

    @property
    def status(self) -> str:
        with self._lock:
            return self._status

    @property
    def last_updated(self) -> Optional[str]:
        with self._lock:
            return self._last_updated

    @property
    def prices(self) -> dict:
        with self._lock:
            return dict(self._prices)

    def get_price(self, ticker: str) -> dict:
        with self._lock:
            return self._prices.get(ticker, {})

    def get_snapshot(self) -> dict:
        """Return full cache snapshot for API responses."""
        with self._lock:
            return {
                "status": self._status,
                "last_updated": self._last_updated,
                "prices": dict(self._prices),
            }

    @staticmethod
    def _safe_float(v) -> Optional[float]:
        try:
            f = float(v)
            if math.isnan(f) or math.isinf(f):
                return None
            return f
        except (TypeError, ValueError):
            return None

    def start_background_worker(self):
        """Start the background price update thread."""
        t = threading.Thread(target=self._update_loop, daemon=True)
        t.start()

    def _update_loop(self):
        while True:
            try:
                print("Fetching bulk prices from yfinance in background thread...")
                print(f"BIST_TICKERS length inside PriceService: {len(self.bist_tickers)}")
                with self._lock:
                    self._status = "FETCHING"

                yf_tickers = [f"{t}.IS" for t in self.bist_tickers]

                if len(yf_tickers) == 0:
                    print("No tickers to fetch, waiting...")
                    with self._lock:
                        self._status = "READY"
                    time.sleep(self.refresh_interval)
                    continue

                try:
                    # Daily data to get previous close and today's total volume
                    data_daily = yf.download(yf_tickers, period="5d", group_by="ticker", progress=False, threads=False)
                    # Hourly data to get the real live price (since daily close is often NaN for active day on BIST)
                    data_live = yf.download(yf_tickers, period="1d", interval="1h", group_by="ticker", progress=False, threads=False)
                except Exception as e:
                    print("Error downloading prices (rate limit?):", e)
                    time.sleep(self.refresh_interval)
                    continue

                if data_daily.empty or data_live.empty:
                    print("Received empty data from yfinance (rate limit).")
                    time.sleep(self.refresh_interval)
                    continue

                new_prices = {}
                if len(yf_tickers) == 1:
                    t = self.bist_tickers[0]
                    fallback = self._prices.get(t, {"price": None, "change_pct": None, "volume": None})
                    df_d = data_daily
                    df_l = data_live
                    
                    df_d_close = df_d["Close"].dropna()
                    df_l_close = df_l["Close"].dropna()
                    
                    if not df_d_close.empty and not df_l_close.empty:
                        p_close = df_d_close.iloc[-1] # previous day close (since today is NaN in daily)
                        # if today's daily close miraculously populated, we might need to handle it, but p_close being yesterday is safer.
                        # Actually, to be perfectly safe, if len is > 1 we just take iloc[-1] from daily.
                        # wait, if today IS populated, iloc[-1] is today. Then p_close becomes today!
                        # Safest:
                        if len(df_d_close) > 1 and df_d_close.index[-1].date() == datetime.now().date():
                            p_close = df_d_close.iloc[-2]
                        else:
                            p_close = df_d_close.iloc[-1]
                            
                        c_close = df_l_close.iloc[-1]
                        vol = df_d["Volume"].iloc[-1] if not df_d["Volume"].isna().all() else 0
                        chg = ((c_close - p_close) / p_close * 100) if p_close and p_close > 0 else 0
                        new_prices[t] = {
                            "price": self._safe_float(c_close),
                            "change_pct": self._safe_float(chg),
                            "volume": self._safe_float(vol),
                        }
                    else:
                        new_prices[t] = fallback
                else:
                    for ticker in self.bist_tickers:
                        yf_ticker = f"{ticker}.IS"
                        fallback = self._prices.get(ticker, {"price": None, "change_pct": None, "volume": None})
                        try:
                            if yf_ticker not in data_daily or yf_ticker not in data_live:
                                new_prices[ticker] = fallback
                                continue
                                
                            df_d = data_daily[yf_ticker]
                            df_l = data_live[yf_ticker]
                            
                            df_d_close = df_d["Close"].dropna()
                            df_l_close = df_l["Close"].dropna()
                            
                            if not df_d_close.empty and not df_l_close.empty:
                                if len(df_d_close) > 1 and df_d_close.index[-1].date() == datetime.now().date():
                                    p_close = df_d_close.iloc[-2]
                                else:
                                    p_close = df_d_close.iloc[-1]
                                    
                                c_close = df_l_close.iloc[-1]
                                vol = df_d["Volume"].iloc[-1] if not df_d["Volume"].isna().all() else 0
                                chg = ((c_close - p_close) / p_close * 100) if p_close and p_close > 0 else 0
                                new_prices[ticker] = {
                                    "price": self._safe_float(c_close),
                                    "change_pct": self._safe_float(chg),
                                    "volume": self._safe_float(vol),
                                }
                            else:
                                new_prices[ticker] = fallback
                        except Exception as e:
                            print(f"Error extracting data for {yf_ticker}: {e}")
                            new_prices[ticker] = fallback

                with self._lock:
                    self._prices = new_prices
                    self._last_updated = datetime.now().strftime("%H:%M:%S")
                    self._status = "READY"
                print(f"Prices updated at {self._last_updated}")

            except Exception as e:
                print(f"Background task error: {e}")
                with self._lock:
                    self._status = "ERROR"

            time.sleep(self.refresh_interval)
