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

    def __init__(self, bist_tickers: list, refresh_interval: int = 900):
        self._lock = threading.Lock()
        self.bist_tickers = bist_tickers
        self.refresh_interval = refresh_interval
        self._prices: dict = {}
        self._last_updated: Optional[str] = None
        self._status: str = "INITIALIZING"

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

                data = yf.download(yf_tickers, period="5d", group_by="ticker", progress=False)

                new_prices = {}
                if len(yf_tickers) == 1:
                    t = self.bist_tickers[0]
                    df_clean = data.dropna(subset=["Close"])
                    if not df_clean.empty:
                        c_close = df_clean["Close"].iloc[-1]
                        p_close = df_clean["Close"].iloc[-2] if len(df_clean) > 1 else c_close
                        vol = df_clean["Volume"].iloc[-1]
                        chg = ((c_close - p_close) / p_close * 100) if p_close and p_close > 0 else 0
                        new_prices[t] = {
                            "price": self._safe_float(c_close),
                            "change_pct": self._safe_float(chg),
                            "volume": self._safe_float(vol),
                        }
                    else:
                        new_prices[t] = {"price": None, "change_pct": None, "volume": None}
                else:
                    for ticker in self.bist_tickers:
                        yf_ticker = f"{ticker}.IS"
                        try:
                            df = data[yf_ticker]
                            df_clean = df.dropna(subset=["Close"])
                            if not df_clean.empty:
                                c_close = df_clean["Close"].iloc[-1]
                                p_close = df_clean["Close"].iloc[-2] if len(df_clean) > 1 else c_close
                                vol = df_clean["Volume"].iloc[-1]
                                chg = ((c_close - p_close) / p_close * 100) if p_close and p_close > 0 else 0
                                new_prices[ticker] = {
                                    "price": self._safe_float(c_close),
                                    "change_pct": self._safe_float(chg),
                                    "volume": self._safe_float(vol),
                                }
                            else:
                                new_prices[ticker] = {"price": None, "change_pct": None, "volume": None}
                        except Exception as e:
                            print(f"Error extracting data for {yf_ticker}: {e}")
                            new_prices[ticker] = {"price": None, "change_pct": None, "volume": None}

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
