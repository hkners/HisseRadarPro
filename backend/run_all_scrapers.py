import sys
import os
import subprocess

base_dir = os.path.dirname(os.path.abspath(__file__))

print(">>> Starting web crawler for hisseonerileri.com...")
crawler_path = os.path.join(base_dir, "crawler_2026.py")
if os.path.exists(crawler_path):
    subprocess.run([sys.executable, "-u", crawler_path], check=False)

print("\n>>> Starting Brokerage PDF Scrapers (Garanti & Deniz)...")
scrapers_dir = os.path.join(base_dir, "scrapers")
sys.path.insert(0, scrapers_dir)

# Configure logging to print to stdout so Popen can capture it
import logging
logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)

from scraper_network import run_scraper_network
try:
    run_scraper_network(limit_per_broker=5)
    print(">>> PDF Scraping completed.")
except Exception as e:
    print(f"Error during PDF scraping: {e}")
