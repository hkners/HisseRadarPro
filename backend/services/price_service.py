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
        self.report_repo = report_repo
        self._prices: dict = {}
        self._last_updated: Optional[str] = None
        self._status: str = "INITIALIZING"
        self._fast_info_time: dict = {}
        
        if report_repo:
            # Last two closes per ticker in one query (reading every ticker's full history took ~8s).
            try:
                with report_repo._get_connection() as conn:
                    rows = conn.execute(
                        """SELECT ticker, close, volume, rn FROM (
                               SELECT ticker, close, volume,
                                      ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY date DESC) AS rn
                               FROM historical_prices) WHERE rn <= 2"""
                    ).fetchall()
            except Exception as e:
                rows = []
                print(f"Price preload failed: {e}")
            last: dict = {}
            prev: dict = {}
            for t, close, volume, rn in rows:
                (last if rn == 1 else prev)[t] = (close, volume)
            wanted = set(self.bist_tickers)
            for ticker, (close, volume) in last.items():
                if ticker not in wanted:
                    continue
                prev_close = prev.get(ticker, (close, None))[0]
                chg = ((close - prev_close) / prev_close * 100) if prev_close and prev_close > 0 else 0
                self._prices[ticker] = {
                    "price": self._safe_float(close),
                    "change_pct": self._safe_float(chg),
                    "volume": self._safe_float(volume or 0),
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
            return dict(self._prices.get(ticker, {}))  # a copy: callers must not mutate the shared cache

    def get_priority_tickers(self) -> list:
        """Returns high-priority tickers (BIST 30 + stocks with research reports)."""
        bist_30 = [
            'AKBNK', 'ALARK', 'ARCLK', 'ASELS', 'ASTOR', 'BIMAS', 'BRSAN', 'EKGYO',
            'ENKAI', 'EREGL', 'FROTO', 'GARAN', 'GUBRF', 'HEKTS', 'ISCTR', 'KCHOL',
            'KONTR', 'TRALT', 'KRDMD', 'OYAKC', 'PETKM', 'PGSUS', 'SAHOL', 'SASA',
            'SISE', 'TCELL', 'THYAO', 'TOASO', 'TUPRS', 'YKBNK'
        ]
        priority = set(bist_30)
        if self.report_repo:
            try:
                from services.ticker_resolver import match_ticker
                reports = self.report_repo.load_json_reports(include_full_text=False)
                for r in reports:
                    m = match_ticker(r.get("ticker") or r.get("hisse") or "", self.bist_tickers)
                    if m:
                        priority.add(m)
            except Exception as e:
                print(f"Error resolving priority report tickers: {e}")
        return [t for t in self.bist_tickers if t in priority]

    def update_ticker_from_fast_info(self, ticker: str) -> dict:
        """
        Fetches the authoritative live/closing-auction price directly from fast_info.
        Updates self._prices[clean_ticker] and returns the updated price dict.
        """
        clean_ticker = ticker.replace(".IS", "").upper()
        # One network call per ticker per minute: every stock page opened this (~1-3 s) synchronously.
        now = time.time()
        with self._lock:
            last = self._fast_info_time.get(clean_ticker, 0.0)
            if now - last < 60 and clean_ticker in self._prices:
                return dict(self._prices[clean_ticker])
            self._fast_info_time[clean_ticker] = now
        try:
            fi = yf.Ticker(f"{clean_ticker}.IS").fast_info
            last_price = getattr(fi, 'last_price', None)
            prev_close = getattr(fi, 'previous_close', None)
            volume = getattr(fi, 'last_volume', None)
            
            if last_price is not None:
                p_val = self._safe_float(last_price)
                pc_val = self._safe_float(prev_close)
                v_val = self._safe_float(volume)
                
                chg = None
                if pc_val and pc_val > 0:
                    chg = ((p_val - pc_val) / pc_val) * 100
                else:
                    with self._lock:
                        chg = self._prices.get(clean_ticker, {}).get("change_pct")
                
                entry = {
                    "price": p_val,
                    "change_pct": self._safe_float(chg),
                    "volume": v_val
                }
                with self._lock:
                    self._prices[clean_ticker] = entry
                return entry
        except Exception as e:
            print(f"Fast_info update failed for {clean_ticker}: {e}")
            
        with self._lock:
            return self._prices.get(clean_ticker, {"price": None, "change_pct": None, "volume": None})

    def fetch_priority_fast_info(self, priority_tickers: Optional[list] = None):
        """
        Concurrently fetches fast_info for priority tickers to capture the authoritative
        closing-auction settlement price (e.g. AKBNK 70.70) across the entire platform.
        """
        from concurrent.futures import ThreadPoolExecutor
        tickers = priority_tickers or self.get_priority_tickers()
        if not tickers:
            return

        def _fetch_one(t):
            try:
                fi = yf.Ticker(f"{t}.IS").fast_info
                last_price = getattr(fi, 'last_price', None)
                prev_close = getattr(fi, 'previous_close', None)
                volume = getattr(fi, 'last_volume', None)
                if last_price is not None:
                    p = self._safe_float(last_price)
                    pc = self._safe_float(prev_close)
                    v = self._safe_float(volume)
                    chg = ((p - pc) / pc * 100) if pc and pc > 0 else None
                    return t, p, chg, v
            except Exception:
                pass
            return t, None, None, None

        with ThreadPoolExecutor(max_workers=20) as executor:
            results = list(executor.map(_fetch_one, tickers))

        updated_count = 0
        with self._lock:
            for t, p, chg, v in results:
                if p is not None:
                    existing = self._prices.get(t, {})
                    self._prices[t] = {
                        "price": p,
                        "change_pct": chg if chg is not None else existing.get("change_pct"),
                        "volume": v if v is not None else existing.get("volume", 0)
                    }
                    updated_count += 1
            if updated_count > 0:
                self._last_updated = datetime.now().strftime("%H:%M:%S")
                self._status = "READY"
        print(f"Updated {updated_count} priority tickers via fast_info at {self._last_updated}")

    def get_snapshot(self) -> dict:
        """Return full cache snapshot for API responses."""
        with self._lock:
            return {
                "status": self._status,
                "last_updated": self._last_updated,
                "prices": dict(self._prices),
            }

    @staticmethod
    def _last_and_prev_close(df_d_close, df_l_close):
        """Latest price and the close of the session BEFORE the latest one.
        Comparing against the calendar date broke on weekends and holidays: the last daily bar and the
        last hourly bar were the same session, so every change came out as 0."""
        c_close = df_l_close.iloc[-1]
        live_day = df_l_close.index[-1].date()
        prior = df_d_close[[d.date() < live_day for d in df_d_close.index]]
        p_close = prior.iloc[-1] if len(prior) else df_d_close.iloc[-1]
        return c_close, p_close

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
        """Start the background price update thread and immediate priority fast_info sync."""
        t_priority = threading.Thread(target=self.fetch_priority_fast_info, daemon=True)
        t_priority.start()

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
                        c_close, p_close = self._last_and_prev_close(df_d_close, df_l_close)
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
                                c_close, p_close = self._last_and_prev_close(df_d_close, df_l_close)
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

                # Enrich priority tickers with authoritative fast_info (closing auction)
                try:
                    self.fetch_priority_fast_info()
                except Exception as e:
                    print(f"Error enriching priority tickers: {e}")

            except Exception as e:
                print(f"Background task error: {e}")
                with self._lock:
                    self._status = "ERROR"

            time.sleep(self.refresh_interval)
