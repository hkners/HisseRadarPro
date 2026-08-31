import sys
import os
import json
import logging

# Ensure backend directory is in sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Add scrapers to path
scrapers_dir = os.path.join(backend_dir, "scrapers")
if scrapers_dir not in sys.path:
    sys.path.insert(0, scrapers_dir)

import sys
import os
import time
import logging

# Ensure backend directory is in sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Add engine to path
engine_dir = os.path.join(backend_dir, "engine")
if engine_dir not in sys.path:
    sys.path.insert(0, engine_dir)

from engine.deniz_scraper import DenizScraper
from client import BackendClient

logger = logging.getLogger(__name__)

def run_deniz_sync(limit=5):
    logger.info("Initializing Deniz Yatırım scraper...")
    deniz_scraper = DenizScraper()

    logger.info("Executing Deniz Yatırım scraper...")
    deniz_reports = deniz_scraper.scrape_reports(limit=limit)
    
    logger.info(f"Skipping LLM parsing per user request. Preparing {len(deniz_reports)} raw metadata reports for ingest API...")
    
    client = BackendClient()
    parsed_reports = []
    import uuid
    
    for raw_item in deniz_reports:
        # Convert raw_item into IngestReport schema
        # Without LLM, we just have basic metadata
        report_id = f"deniz_{uuid.uuid5(uuid.NAMESPACE_URL, raw_item.get('pdf_url', ''))}"
        parsed_reports.append({
            "id": report_id,
            "ticker": "Bilinmiyor", # Requires LLM to parse from PDF usually
            "broker": raw_item.get("broker", "Deniz Yatırım"),
            "rating": "Bilinmiyor",
            "target_price": 0.0,
            "current_price": 0.0,
            "potansiyel": 0.0,
            "report_date": raw_item.get("report_date", ""),
            "report_title": raw_item.get("report_title", ""),
            "pdf_url": raw_item.get("pdf_url", ""),
            "summary": "LLM analizi devre dışı bırakıldı.",
            "full_text": "PDF metni. Çıkarım yapılmadı.",
            "file_hash": raw_item.get("file_hash", "")
        })

    if parsed_reports:
        success = client.push_reports_bulk(parsed_reports)
        logger.info(f"Successfully posted {success} Deniz Yatırım reports to the Ingest API.")
    else:
        logger.info("No new Deniz Yatırım reports scraped.")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    run_deniz_sync(limit=10)
