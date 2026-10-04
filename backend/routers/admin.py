from fastapi import APIRouter, BackgroundTasks
import subprocess
import os
import sys
from datetime import datetime

router = APIRouter(prefix="/api/admin", tags=["admin"])

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
log_file_path = os.path.join(base_dir, "scraper_run.log")

def run_scrapers_task():
    try:
        script_path = os.path.join(base_dir, "run_all_scrapers.py")
        if not os.path.exists(script_path):
            with open(log_file_path, "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now().isoformat()}] ERROR: run_all_scrapers.py not found.\n")
            return
            
        with open(log_file_path, "a", encoding="utf-8") as f:
            f.write(f"\n[{datetime.now().isoformat()}] --- STARTING SCRAPER JOB ---\n")
            
        process = subprocess.Popen(
            [sys.executable, "-u", script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            cwd=base_dir
        )
        
        with open(log_file_path, "a", encoding="utf-8") as f:
            for line in process.stdout:
                f.write(line)
                
        process.wait()
        with open(log_file_path, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().isoformat()}] --- SCRAPER JOB FINISHED WITH CODE {process.returncode} ---\n")
            
    except Exception as e:
        with open(log_file_path, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().isoformat()}] FATAL ERROR: {str(e)}\n")


@router.get("/price-history")
def get_price_history_status():
    from services.price_history_sync import status
    return status()


@router.post("/price-history/sync")
def trigger_price_history_sync(background_tasks: BackgroundTasks):
    from services.price_history_sync import sync_missing_days
    background_tasks.add_task(sync_missing_days)
    return {"message": "Fiyat geçmişi güncellemesi başlatıldı."}


@router.post("/scrapers/run")
def trigger_scrapers(background_tasks: BackgroundTasks):
    background_tasks.add_task(run_scrapers_task)
    return {"message": "Scraper job started in the background."}


@router.get("/scrapers/status")
def get_scraper_status():
    if not os.path.exists(log_file_path):
        return {"status": "idle", "logs": "No logs found. Scrapers haven't run yet."}
        
    try:
        # Read the last 50 lines of the log
        with open(log_file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            logs = "".join(lines[-50:])
            
        # Determine status by looking at the last few lines
        is_running = True
        if lines and ("--- SCRAPER JOB FINISHED" in lines[-1] or "FATAL ERROR" in lines[-1]):
            is_running = False
            
        return {
            "status": "running" if is_running else "idle",
            "logs": logs
        }
    except Exception as e:
        return {"status": "error", "logs": str(e)}


@router.get("/stale-tickers")
def get_stale_tickers(max_stale_days: int = 7, refresh: bool = False):
    """
    Scans BIST_TICKERS for symbols with missing or outdated historical price data.
    Provides early warning for exchange symbol changes (renames), typos, or delistings.
    """
    from services.ticker_health_service import ticker_health_service
    if refresh:
        results = ticker_health_service.check_stale_tickers(max_stale_days=max_stale_days)
    else:
        results = ticker_health_service.get_status()
        if results.get("status") == "INITIALIZING":
            results = ticker_health_service.check_stale_tickers(max_stale_days=max_stale_days)
    return results


@router.post("/stale-tickers/check")
def trigger_stale_tickers_check(background_tasks: BackgroundTasks, max_stale_days: int = 7):
    """
    Triggers an asynchronous background health check for all tickers.
    """
    from services.ticker_health_service import ticker_health_service
    background_tasks.add_task(ticker_health_service.check_stale_tickers, max_stale_days)
    return {"message": "Ticker health check started in background."}


@router.get("/scheduler-health")
def get_scheduler_health():
    import json
    heartbeat_path = os.path.join(base_dir, "scheduler_heartbeat.json")
    if not os.path.exists(heartbeat_path):
        return {"status": "CRITICAL", "message": "CRITICAL - NEVER_RUN: No heartbeat file found. Scheduler might not have run yet."}
    
    try:
        with open(heartbeat_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        last_run_iso = data.get("last_run_time")
        if not last_run_iso:
            return {"status": "WARNING", "message": "Heartbeat file missing timestamp."}
            
        last_run = datetime.fromisoformat(last_run_iso)
        # Using UTC for comparison since scheduler writes in UTC
        now_utc = datetime.utcnow() 
        diff = (now_utc - last_run.replace(tzinfo=None)).total_seconds()
        
        if diff > 86400:  # 24 hours
            return {
                "status": "CRITICAL", 
                "message": f"Scheduler has not run in {diff/3600:.1f} hours. Last job: {data.get('last_job')}",
                "last_run": last_run_iso
            }
            
        return {
            "status": "OK",
            "message": "Scheduler is running normally.",
            "last_job": data.get("last_job"),
            "last_run": last_run_iso,
            "hours_since_last_run": round(diff / 3600, 1)
        }
    except Exception as e:
        return {"status": "ERROR", "message": f"Could not read heartbeat: {str(e)}"}
