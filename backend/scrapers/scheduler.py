"""
Scheduler — Background Data Synchronization
============================================
Runs periodic jobs for:
  - Yahoo Finance price/fundamentals sync (after market close)
  - Fintables analyst recommendations sync (morning + midday)

Run standalone:
    cd backend
    python scrapers/scheduler.py
"""
import logging
import os
import subprocess
import sys
import time
import json
import datetime

import schedule

# Ensure backend dir is importable
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s - %(message)s",
)
logger = logging.getLogger("Scheduler")


def _run_script(script_path: str, label: str):
    """Execute a Python script and stream its stdout to the logger."""
    if not os.path.exists(script_path):
        logger.error(f"[{label}] Script not found: {script_path}")
        return
    logger.info(f"[{label}] Starting: {script_path}")
    try:
        process = subprocess.Popen(
            [sys.executable, "-u", script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=backend_dir,
        )
        for line in process.stdout:
            logger.info(f"[{label}] {line.rstrip()}")
        process.wait()
        logger.info(f"[{label}] Finished with exit code {process.returncode}")
    except Exception as e:
        logger.error(f"[{label}] Error: {e}")


def job_fintables_sync():
    """Scrape analyst recommendations from Fintables and persist to DB."""
    plugin_path = os.path.join(backend_dir, "plugins", "01_fintables_sync.py")
    _run_script(plugin_path, "FintablesSync")
    _write_heartbeat("FintablesSync")

def job_yf_sync():
    """Pull live prices + fundamentals from Yahoo Finance (incremental — only missing days)."""
    logger.info("Running incremental YF sync...")
    try:
        from services.yf_sync import run_incremental_sync
        run_incremental_sync()
    except Exception as e:
        logger.error(f"Incremental YF sync failed, falling back to script: {e}")
        yf_script = os.path.join(backend_dir, "services", "yf_sync.py")
        _run_script(yf_script, "YFSync")
    _write_heartbeat("YFSync")


def job_ta_sync():
    """Fetch exact Technical Analysis indicators from TradingView."""
    ta_script = os.path.join(backend_dir, "services", "ta_sync.py")
    _run_script(ta_script, "TASync")
    _write_heartbeat("TASync")

def job_stale_splits():
    """Check for splits and flag stale reports."""
    splits_script = os.path.join(backend_dir, "flag_stale_split_reports.py")
    _run_script(splits_script, "FlagSplits")
    _write_heartbeat("FlagSplits")

def _write_heartbeat(job_name: str):
    """Write heartbeat to file for health monitoring."""
    heartbeat_path = os.path.join(backend_dir, "scheduler_heartbeat.json")
    try:
        data = {}
        if os.path.exists(heartbeat_path):
            with open(heartbeat_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        
        data["last_run_time"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        data["last_job"] = job_name
        
        with open(heartbeat_path, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception as e:
        logger.error(f"Failed to write heartbeat: {e}")


def start_scheduler():
    # --- Schedule ---
    # Fintables sync: 08:30 (pre-market) and 12:30 (mid-session)
    schedule.every().day.at("08:30").do(job_fintables_sync)
    schedule.every().day.at("12:30").do(job_fintables_sync)

    # Yahoo Finance sync: 18:30 (after BIST market close at 18:00)
    schedule.every().day.at("18:30").do(job_yf_sync)
    
    # TradingView TA sync: 18:45 (after YF sync)
    schedule.every().day.at("18:45").do(job_ta_sync)
    
    # Stale splits flag sync: 03:00 (Nightly cleanup)
    schedule.every().day.at("03:00").do(job_stale_splits)

    logger.info("Scheduler started. Waiting for scheduled jobs...")
    logger.info("  Fintables sync: 08:30 and 12:30 daily")
    logger.info("  Yahoo Finance sync: 18:30 daily")
    logger.info("  TradingView TA sync: 18:45 daily")
    logger.info("  Stale Split Check: 03:00 daily")

    # Run stale splits once on boot
    logger.info("Running stale splits check on boot...")
    job_stale_splits()

    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == "__main__":
    start_scheduler()
