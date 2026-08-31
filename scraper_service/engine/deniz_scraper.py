import os
import re
import time
import datetime
import hashlib
import logging
from typing import List, Dict, Optional, Tuple
from urllib.parse import urlparse
from curl_cffi import requests
from bs4 import BeautifulSoup

from base_scraper import BaseScraper

logger = logging.getLogger(__name__)


def extract_date_from_str(text_source: str) -> Optional[str]:
    if not text_source:
        return None
    m1 = re.search(r"\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b", text_source)
    if m1:
        y, m, d = m1.groups()
        return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    m2 = re.search(r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b", text_source)
    if m2:
        d, m, y = m2.groups()
        return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    return None


class DenizScraper(BaseScraper):
    """
    Deniz Yatırım Scraper using curl_cffi to bypass WAF protections.
    Targets GunlukBulten specifically based on user feedback.
    """
    
    def __init__(self, download_dir: Optional[str] = None, delay: float = 0.5):
        super().__init__(download_dir=download_dir, delay=delay)
        self.broker_name = "Deniz Yatırım"

    def download_pdf(
        self, url: str, output_path: Optional[str] = None
    ) -> Tuple[str, str]:
        """
        Streaming/atomic PDF downloader using curl_cffi requests with browser impersonation
        to bypass WAF 403 Forbidden protection.
        """
        self.rate_limit()

        if not output_path:
            filename = os.path.basename(urlparse(url).path)
            if not filename or not filename.endswith(".pdf"):
                filename = f"deniz_{int(time.time())}.pdf"
            output_path = os.path.join(self.download_dir, filename)
        else:
            if not os.path.isabs(output_path):
                output_path = os.path.join(self.download_dir, output_path)

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        tmp_path = output_path + ".tmp"
        sha256_hash = hashlib.sha256()

        logger.info(f"Downloading Deniz PDF via curl_cffi from {url} -> {output_path}")

        if url.startswith("file://") or os.path.exists(url):
            local_src = url.replace("file://", "")
            with open(local_src, "rb") as f_in, open(tmp_path, "wb") as f_out:
                while chunk := f_in.read(8192):
                    sha256_hash.update(chunk)
                    f_out.write(chunk)
        else:
            r = requests.get(url, impersonate="chrome110", timeout=self.timeout)
            r.raise_for_status()
            content = r.content
            sha256_hash.update(content)
            with open(tmp_path, "wb") as f_out:
                f_out.write(content)

        if os.path.exists(output_path):
            os.remove(output_path)
        os.rename(tmp_path, output_path)

        hash_hex = sha256_hash.hexdigest()
        formatted_hash = f"sha256:{hash_hex}"
        logger.info(f"Deniz PDF successfully downloaded: {output_path} (SHA-256: {formatted_hash})")
        return output_path, formatted_hash

    def scrape_reports(self, limit: int = 5) -> List[Dict]:
        logger.info(f"Starting Deniz Yatırım report scraping (limit={limit}) with curl_cffi...")
        reports = []
        
        now = datetime.datetime.now()
        base_url = f"https://www.denizyatirim.com/GunlukBulten?month={now.month}&year={now.year}"
        
        try:
            r = requests.get(base_url, impersonate="chrome110")
            soup = BeautifulSoup(r.text, "html.parser")
            
            buttons = soup.find_all("button", attrs={"data-ajax-href": True})
            
            for btn in buttons[:limit]:
                ajax_href = btn.get("data-ajax-href")  # e.g., ../Detail?id=12779
                parent_box = btn.find_parent("div", class_="box")
                title_tag = parent_box.find("h3", class_="title") if parent_box else None
                title_text = title_tag.text.strip() if title_tag else "Deniz Yatırım Günlük Bülten"
                
                # Fetch the modal content
                detail_url = "https://www.denizyatirim.com" + ajax_href.replace("..", "")
                detail_r = requests.get(detail_url, impersonate="chrome110")
                detail_soup = BeautifulSoup(detail_r.text, "html.parser")
                
                # Find the PDF link in the modal
                pdf_tag = detail_soup.find("a", href=lambda href: href and ".pdf" in href.lower())
                
                if pdf_tag:
                    pdf_href = pdf_tag.get("href")
                    if not pdf_href.startswith("http"):
                        if pdf_href.startswith("/"):
                            pdf_href = "https://www.denizyatirim.com" + pdf_href
                        else:
                            pdf_href = "https://www.denizyatirim.com/" + pdf_href
                    
                    # Extract genuine publication date from metadata/modal text/URL
                    search_text = f"{title_text} {parent_box.text if parent_box else ''} {detail_soup.text}"
                    report_date = extract_date_from_str(search_text) or extract_date_from_str(pdf_href) or now.strftime("%Y-%m-%d")
                    
                    try:
                        pdf_path, file_hash = self.download_pdf(pdf_href)
                        reports.append({
                            "broker": self.broker_name,
                            "report_title": title_text,
                            "report_date": report_date,
                            "pdf_path": pdf_path,
                            "pdf_url": pdf_href,
                            "file_hash": file_hash,
                        })
                    except Exception as dl_err:
                        logger.error(f"Failed downloading Deniz PDF from {pdf_href}: {dl_err}")
                        
        except Exception as e:
            logger.error(f"Deniz curl_cffi scraping failed: {e}")

        # Offline fallback removed to prevent fake data generation.
        return reports


