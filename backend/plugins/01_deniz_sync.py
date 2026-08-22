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

from scrapers.deniz_scraper import DenizScraper
from scrapers.llm_parser import LLMParser
from scrapers.db_manager import ReportDBManager

logger = logging.getLogger(__name__)

def run_deniz_sync(limit=5):
    output_path = os.path.join(scrapers_dir, "scraped_reports.json")
    
    logger.info("Initializing Deniz Yatırım scraper...")
    deniz_scraper = DenizScraper()

    logger.info("Executing Deniz Yatırım scraper...")
    deniz_reports = deniz_scraper.scrape_reports(limit=limit)

    logger.info(f"Processing {len(deniz_reports)} total reports using LLMParser with strict SHA-256 caching...")
    parsed_reports = []
    
    parser = LLMParser()

    for raw_item in deniz_reports:
        pdf_path = raw_item.get("pdf_path")
        file_hash = raw_item.get("file_hash", "")
        
        if not pdf_path or not os.path.exists(pdf_path):
            logger.warning(f"PDF path missing or invalid for report: {raw_item.get('report_title')}")
            continue

        parsed_report = parser.parse_report(pdf_path, file_hash, metadata=raw_item)
        parsed_reports.append(parsed_report)

    try:
        db_mgr = ReportDBManager(json_path=output_path)
        if parsed_reports:
            db_mgr.save_reports(parsed_reports)
            logger.info(f"Successfully merged and saved {len(parsed_reports)} newly scraped reports into {output_path}")
        else:
            logger.info("No new reports scraped; preserving existing historical DB and JSON records.")
    except Exception as save_err:
        logger.error(f"Failed saving scraped reports output to {output_path}: {save_err}")
        if not os.path.exists(output_path):
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            tmp_output = output_path + ".tmp"
            try:
                with open(tmp_output, "w", encoding="utf-8") as f:
                    json.dump(parsed_reports, f, ensure_ascii=False, indent=2)
                os.replace(tmp_output, output_path)
            except Exception:
                pass

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    run_deniz_sync(limit=5)
