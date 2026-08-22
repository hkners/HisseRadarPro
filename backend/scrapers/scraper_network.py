import json
import logging
import os
from typing import List, Dict, Optional
import PyPDF2

logger = logging.getLogger(__name__)

try:
    from garanti_scraper import GarantiScraper
except ImportError:
    GarantiScraper = None
    logger.warning("garanti_scraper module not found. Garanti scraper will be unavailable.")

from deniz_scraper import DenizScraper
from llm_parser import LLMParser


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extracts text from a local PDF using PyPDF2."""
    try:
        text = ""
        with open(pdf_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                text += page.extract_text() + "\n"
        return text.strip()
    except Exception as e:
        logger.error(f"Failed to extract text from {pdf_path}: {e}")
        return ""


def run_scraper_network(
    output_path: Optional[str] = None,
    limit_per_broker: int = 5,
) -> List[Dict]:
    """
    Scraper Network Orchestrator:
    1. Instantiates multi-broker scrapers (Garanti BBVA + Deniz Yatırım).
    2. Fetches research report listings and downloads PDFs via Playwright.
    3. Extracts raw text using PyPDF2 (LLM skipped to save tokens).
    4. Saves to scraped_reports.json.
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    if not output_path:
        output_path = os.path.join(base_dir, "scraped_reports.json")
    else:
        if not os.path.isabs(output_path):
            output_path = os.path.join(base_dir, output_path)

    logger.info("Initializing Scraper Network...")
    garanti_scraper = GarantiScraper()
    deniz_scraper = DenizScraper()

    all_raw_reports = []

    # logger.info("Executing Garanti BBVA scraper...")
    # garanti_reports = garanti_scraper.scrape_reports(limit=limit_per_broker)
    # all_raw_reports.extend(garanti_reports)

    logger.info("Executing Deniz Yatırım scraper...")
    deniz_reports = deniz_scraper.scrape_reports(limit=limit_per_broker)
    all_raw_reports.extend(deniz_reports)

    logger.info(f"Processing {len(all_raw_reports)} total reports using LLMParser with strict SHA-256 caching...")
    parsed_reports = []
    
    # Initialize parser
    parser = LLMParser()

    for raw_item in all_raw_reports:
        pdf_path = raw_item.get("pdf_path")
        file_hash = raw_item.get("file_hash", "")
        
        if not pdf_path or not os.path.exists(pdf_path):
            logger.warning(f"PDF path missing or invalid for report: {raw_item.get('report_title')}")
            continue

        # Parse report via LLMParser (handles text extraction, SHA-256 caching & audit logging)
        parsed_report = parser.parse_report(pdf_path, file_hash, metadata=raw_item)
        parsed_reports.append(parsed_report)

    # Save output by merging newly scraped reports into DB and JSON repository
    from db_manager import ReportDBManager
    try:
        db_mgr = ReportDBManager(json_path=output_path)
        if parsed_reports:
            db_mgr.save_reports(parsed_reports)
            logger.info(f"Successfully merged and saved {len(parsed_reports)} newly scraped reports into {output_path}")
        else:
            logger.info("No new reports scraped; preserving existing historical DB and JSON records.")
    except Exception as save_err:
        logger.error(f"Failed saving scraped reports output to {output_path}: {save_err}")
        # Atomic fallback write if db_mgr call fails
        if not os.path.exists(output_path):
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            tmp_output = output_path + ".tmp"
            try:
                with open(tmp_output, "w", encoding="utf-8") as f:
                    json.dump(parsed_reports, f, ensure_ascii=False, indent=2)
                os.replace(tmp_output, output_path)
            except Exception:
                pass

    return parsed_reports


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    reports = run_scraper_network(limit_per_broker=5)
    print(f"Scraper Network complete. Output {len(reports)} reports.")
