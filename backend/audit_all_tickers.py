"""
Full BIST Ticker Audit Script
=============================
Audits every ticker in all_bist.txt against Yahoo Finance (.IS suffix).
Detects 404s, delisted symbols, invalid symbols, or missing prices.
"""

import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import yfinance as yf

base_dir = os.path.dirname(os.path.abspath(__file__))
all_bist_file = os.path.join(base_dir, "all_bist.txt")

with open(all_bist_file, "r", encoding="utf-8") as f:
    tickers = [line.strip().upper() for line in f if line.strip()]

print(f"Loaded {len(tickers)} tickers from {all_bist_file} to audit.")

def audit_ticker(sym: str):
    yf_sym = f"{sym}.IS"
    try:
        t = yf.Ticker(yf_sym)
        fi = t.fast_info
        lp = getattr(fi, "last_price", None)
        pc = getattr(fi, "previous_close", None)
        vol = getattr(fi, "last_volume", None)
        
        if lp is not None and lp > 0:
            return {"ticker": sym, "status": "VALID", "price": lp, "error": None}
        elif pc is not None and pc > 0:
            return {"ticker": sym, "status": "VALID", "price": pc, "error": None}
        else:
            # Fallback to 5d history check
            hist = t.history(period="5d")
            if not hist.empty and "Close" in hist:
                valid_close = hist["Close"].dropna()
                if not valid_close.empty:
                    return {"ticker": sym, "status": "VALID", "price": float(valid_close.iloc[-1]), "error": None}
            return {"ticker": sym, "status": "NO_PRICE", "price": None, "error": "No price or history data returned"}
    except Exception as e:
        err_msg = str(e)
        return {"ticker": sym, "status": "ERROR", "price": None, "error": err_msg}

results = []
start_time = time.time()
print("Starting concurrent audit of all 623 tickers (ThreadPoolExecutor, 20 workers)...")

with ThreadPoolExecutor(max_workers=20) as executor:
    future_to_sym = {executor.submit(audit_ticker, sym): sym for sym in tickers}
    completed = 0
    for future in as_completed(future_to_sym):
        res = future.result()
        results.append(res)
        completed += 1
        if completed % 100 == 0 or completed == len(tickers):
            print(f"Audited {completed}/{len(tickers)} tickers...")

elapsed = time.time() - start_time
print(f"Audit completed in {elapsed:.1f} seconds.")

valid = [r for r in results if r["status"] == "VALID"]
invalid = [r for r in results if r["status"] != "VALID"]

print(f"\n=======================================================")
print(f"BIST AUDIT RESULTS ({len(tickers)} TICKERS)")
print(f"=======================================================")
print(f"Valid Tickers: {len(valid)} / {len(tickers)} ({len(valid)/len(tickers)*100:.1f}%)")
print(f"Invalid / Problematic Tickers: {len(invalid)} / {len(tickers)}")

if invalid:
    print("\nListing Problematic Tickers:")
    for r in sorted(invalid, key=lambda x: x["ticker"]):
        print(f"  - {r['ticker']:7s} | Status: {r['status']:8s} | Error: {r['error']}")
else:
    print("\nPERFECT: Zero problematic tickers found! Every single ticker resolves on Yahoo Finance!")
