"""
Plugin: 02_yf_incremental_sync.py
---------------------------------
Runs incremental sync for Yahoo Finance data for all BIST tickers.
"""
import sys
import os

# Ensure backend is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")

from services.yf_sync import run_incremental_sync

def main():
    print("[02_yf_incremental_sync] Starting Incremental Yahoo Finance Sync...")
    run_incremental_sync()
    print("[02_yf_incremental_sync] Incremental YF Sync complete.")

if __name__ == "__main__":
    main()
