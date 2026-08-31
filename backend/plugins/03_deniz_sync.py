"""
Plugin: 03_deniz_sync.py
------------------------
Runs the Deniz Yatirim scraper from scraper_service.
"""
import sys
import os
import subprocess

def main():
    print("[03_deniz_sync] Starting Deniz Yatirim Sync...")
    
    # Path to the scraper_service directory
    base_dir = os.path.dirname(os.path.abspath(__file__))
    scraper_dir = os.path.abspath(os.path.join(base_dir, "../../scraper_service"))
    deniz_script = os.path.join(scraper_dir, "sources", "01_deniz_sync.py")
    
    if os.path.exists(deniz_script):
        try:
            subprocess.run([sys.executable, "-u", deniz_script], check=False, cwd=scraper_dir)
        except Exception as e:
            print(f"[03_deniz_sync] Error running scraper: {e}")
    else:
        print(f"[03_deniz_sync] Scraper script not found: {deniz_script}")
        
    print("[03_deniz_sync] Deniz Yatirim Sync complete.")

if __name__ == "__main__":
    main()
