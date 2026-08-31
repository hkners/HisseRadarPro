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
