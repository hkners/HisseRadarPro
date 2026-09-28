import os
import sys
import json
import logging
import time
import requests
import threading
from typing import List, Dict, Any, Optional

# Ensure we can import from backend root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from globals import BIST_TICKERS, report_repo

logger = logging.getLogger("TA_Sync")

TV_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Origin": "https://www.tradingview.com",
    "Referer": "https://www.tradingview.com/"
}

TV_COLUMNS = [
    "Recommend.Other","Recommend.All","Recommend.MA","RSI","RSI[1]","Stoch.K","Stoch.D",
    "Stoch.K[1]","Stoch.D[1]","CCI20","CCI20[1]","ADX","ADX+DI","ADX-DI","ADX+DI[1]",
    "ADX-DI[1]","AO","AO[1]","Mom","Mom[1]","MACD.macd","MACD.signal","Rec.Stoch.RSI",
    "Stoch.RSI.K","Rec.WR","W.R","Rec.BBPower","BBPower","Rec.UO","UO","close","EMA5",
    "SMA5","EMA10","SMA10","EMA20","SMA20","EMA30","SMA30","EMA50","SMA50","EMA100",
    "SMA100","EMA200","SMA200","Rec.Ichimoku","Ichimoku.BLine","Rec.VWMA","VWMA",
    "Rec.HullMA9","HullMA9","Pivot.M.Classic.S3","Pivot.M.Classic.S2","Pivot.M.Classic.S1",
    "Pivot.M.Classic.Middle","Pivot.M.Classic.R1","Pivot.M.Classic.R2","Pivot.M.Classic.R3",
    "Pivot.M.Fibonacci.S3","Pivot.M.Fibonacci.S2","Pivot.M.Fibonacci.S1",
    "Pivot.M.Fibonacci.Middle","Pivot.M.Fibonacci.R1","Pivot.M.Fibonacci.R2",
    "Pivot.M.Fibonacci.R3","Pivot.M.Camarilla.S3","Pivot.M.Camarilla.S2",
    "Pivot.M.Camarilla.S1","Pivot.M.Camarilla.Middle","Pivot.M.Camarilla.R1",
    "Pivot.M.Camarilla.R2","Pivot.M.Camarilla.R3","Pivot.M.Woodie.S3","Pivot.M.Woodie.S2",
    "Pivot.M.Woodie.S1","Pivot.M.Woodie.Middle","Pivot.M.Woodie.R1","Pivot.M.Woodie.R2",
    "Pivot.M.Woodie.R3","Pivot.M.Demark.S1","Pivot.M.Demark.Middle","Pivot.M.Demark.R1",
    "open","P.SAR","BB.lower","BB.upper","AO[2]","volume","change","low","high"
]

def map_tv_signal(value: Optional[float]) -> str:
    if value is None: return "NEUTRAL"
    if value < -0.5: return "STRONG_SELL"
    if value < -0.1: return "SELL"
    if value > 0.5: return "STRONG_BUY"
    if value > 0.1: return "BUY"
    return "NEUTRAL"

def map_indicator_signal(value: Optional[int]) -> str:
    if value == 1: return "BUY"
    if value == -1: return "SELL"
    return "NEUTRAL"

def compute_oscillator_signals(raw_data: Dict[str, Any]) -> Dict[str, str]:
    """Calculate exact TradingView action recommendation per oscillator."""
    # 1. RSI (14)
    rsi = raw_data.get("RSI")
    rsi_1 = raw_data.get("RSI[1]")
    if rsi is not None and rsi_1 is not None:
        if rsi < 30 and rsi > rsi_1:
            rsi_sig = "BUY"
        elif rsi > 70 and rsi < rsi_1:
            rsi_sig = "SELL"
        else:
            rsi_sig = "NEUTRAL"
    elif rsi is not None:
        if rsi < 30: rsi_sig = "BUY"
        elif rsi > 70: rsi_sig = "SELL"
        else: rsi_sig = "NEUTRAL"
    else:
        rsi_sig = "NEUTRAL"

    # 2. Stochastic %K (14, 3, 3)
    stoch_k = raw_data.get("Stoch.K")
    stoch_d = raw_data.get("Stoch.D")
    if stoch_k is not None and stoch_d is not None:
        if stoch_k < 20 and stoch_k > stoch_d:
            stoch_sig = "BUY"
        elif stoch_k > 80 and stoch_k < stoch_d:
            stoch_sig = "SELL"
        else:
            stoch_sig = "NEUTRAL"
    else:
        stoch_sig = "NEUTRAL"

    # 3. CCI (20)
    cci = raw_data.get("CCI20")
    cci_1 = raw_data.get("CCI20[1]")
    if cci is not None and cci_1 is not None:
        if cci < -100 and cci > cci_1:
            cci_sig = "BUY"
        elif cci > 100 and cci < cci_1:
            cci_sig = "SELL"
        else:
            cci_sig = "NEUTRAL"
    else:
        cci_sig = "NEUTRAL"

    # 4. MACD (12, 26)
    macd = raw_data.get("MACD.macd")
    macd_sig = raw_data.get("MACD.signal")
    if macd is not None and macd_sig is not None:
        if macd > macd_sig:
            macd_signal = "BUY"
        elif macd < macd_sig:
            macd_signal = "SELL"
        else:
            macd_signal = "NEUTRAL"
    else:
        macd_signal = "NEUTRAL"

    # 5. ADX (14)
    adx = raw_data.get("ADX")
    plus_di = raw_data.get("ADX+DI")
    minus_di = raw_data.get("ADX-DI")
    if adx is not None and plus_di is not None and minus_di is not None:
        if adx > 20 and plus_di > minus_di:
            adx_sig = "BUY"
        elif adx > 20 and plus_di < minus_di:
            adx_sig = "SELL"
        else:
            adx_sig = "NEUTRAL"
    else:
        adx_sig = "NEUTRAL"

    return {
        "RSI": rsi_sig,
        "STOCH.K": stoch_sig,
        "CCI": cci_sig,
        "MACD": macd_signal,
        "ADX": adx_sig,
        "W.R": map_indicator_signal(raw_data.get("Rec.WR")),
        "BBPower": map_indicator_signal(raw_data.get("Rec.BBPower")),
        "UO": map_indicator_signal(raw_data.get("Rec.UO")),
    }

def format_ta_payload(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """Transform raw TV scanner dictionary into frontend widget schema."""
    return {
        "summary": {
            "RECOMMENDATION": map_tv_signal(raw_data.get("Recommend.All")),
            "RECOMMENDATION_SCORE": raw_data.get("Recommend.All")
        },
        "indicators": raw_data,
        "oscillators": {
            "RECOMMENDATION": map_tv_signal(raw_data.get("Recommend.Other")),
            "RECOMMENDATION_SCORE": raw_data.get("Recommend.Other"),
            "COMPUTE": compute_oscillator_signals(raw_data)
        },
        "moving_averages": {
            "RECOMMENDATION": map_tv_signal(raw_data.get("Recommend.MA")),
            "RECOMMENDATION_SCORE": raw_data.get("Recommend.MA")
        }
    }

# In-memory fast cache with TTL
_mem_ta_cache: Dict[str, Dict[str, Any]] = {}
_mem_ta_time: Dict[str, float] = {}
_mem_ta_lock = threading.Lock()
TA_CACHE_TTL = 300  # 5 minutes in-memory TTL

def fetch_live_ta(ticker: str) -> Optional[Dict[str, Any]]:
    """Fetch live TradingView technical indicators for a single stock."""
    ticker_clean = ticker.replace(".IS", "").replace("BIST:", "").upper()
    now = time.time()
    
    with _mem_ta_lock:
        if ticker_clean in _mem_ta_cache and (now - _mem_ta_time.get(ticker_clean, 0)) < TA_CACHE_TTL:
            return _mem_ta_cache[ticker_clean]

    payload = {
        "symbols": {"tickers": [f"BIST:{ticker_clean}"]},
        "columns": TV_COLUMNS
    }

    try:
        r = requests.post(
            "https://scanner.tradingview.com/turkey/scan",
            json=payload,
            headers=TV_HEADERS,
            timeout=8
        )
        r.raise_for_status()
        data = r.json().get("data", [])
        if not data:
            return None

        d = data[0]["d"]
        raw_data = {TV_COLUMNS[i]: d[i] for i in range(len(TV_COLUMNS))}
        ta_data = format_ta_payload(raw_data)

        # Store in cache & db
        with _mem_ta_lock:
            _mem_ta_cache[ticker_clean] = ta_data
            _mem_ta_time[ticker_clean] = now

        try:
            report_repo.update_technical_analysis(ticker_clean, json.dumps(ta_data))
        except Exception as e:
            logger.warning(f"Could not update DB TA for {ticker_clean}: {e}")

        return ta_data
    except Exception as e:
        logger.error(f"Error fetching live TA for {ticker_clean} from TV Scanner: {e}")
        return None

def sync_all_ta(tickers: Optional[List[str]] = None) -> int:
    """Sync all BIST tickers from TradingView scanner into local DB."""
    target_tickers = tickers or BIST_TICKERS
    logger.info(f"Starting TA sync for {len(target_tickers)} tickers via TV Scanner...")
    tv_symbols = [f"BIST:{t}" for t in target_tickers]
    
    payload = {
        "symbols": {"tickers": tv_symbols},
        "columns": TV_COLUMNS
    }
    
    try:
        r = requests.post(
            "https://scanner.tradingview.com/turkey/scan",
            json=payload,
            headers=TV_HEADERS,
            timeout=25
        )
        r.raise_for_status()
        data = r.json().get("data", [])
        
        now = time.time()
        synced_count = 0
        for item in data:
            symbol = item["s"].replace("BIST:", "")
            d = item["d"]
            raw_data = {TV_COLUMNS[i]: d[i] for i in range(len(TV_COLUMNS))}
            ta_data = format_ta_payload(raw_data)
            
            with _mem_ta_lock:
                _mem_ta_cache[symbol] = ta_data
                _mem_ta_time[symbol] = now
                
            report_repo.update_technical_analysis(symbol, json.dumps(ta_data))
            synced_count += 1
            
        logger.info(f"Successfully synced fresh TA for {synced_count} tickers from TradingView.")
        return synced_count
    except Exception as e:
        logger.error(f"Error syncing TA via Scanner API: {e}")
        return 0

_worker_thread = None
def start_ta_sync_worker():
    """Start background worker that refreshes TradingView TA every 15 minutes."""
    global _worker_thread
    if _worker_thread is not None and _worker_thread.is_alive():
        return

    def _worker():
        # First sync on boot after short delay
        time.sleep(3)
        logger.info("TA Background Worker: Running initial TradingView sync...")
        sync_all_ta()

        while True:
            time.sleep(900)  # Every 15 minutes
            try:
                sync_all_ta()
            except Exception as e:
                logger.error(f"TA Background Worker error: {e}")

    _worker_thread = threading.Thread(target=_worker, daemon=True, name="TradingViewSyncWorker")
    _worker_thread.start()
    logger.info("TradingView TA Background Worker started.")

if __name__ == "__main__":
    count = sync_all_ta()
    print(f"Synced {count} tickers from TradingView.")
