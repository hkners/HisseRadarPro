import hashlib
import logging
import os
import shutil
import time
from typing import Optional, Tuple
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BaseScraper:
    """
    Abstract base scraper class with requests.Session, retry logic,
    rate limiting, and atomic streaming PDF downloader with SHA-256 computation.
    """

    def __init__(
        self,
        download_dir: Optional[str] = None,
        headers: Optional[dict] = None,
        delay: float = 0.5,
        max_retries: int = 1,
        timeout: float = 3.0,
    ):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.download_dir = download_dir or os.path.join(base_dir, "downloads")
        os.makedirs(self.download_dir, exist_ok=True)

        self.delay = delay
        self.timeout = timeout
        self.session = requests.Session()

        default_headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
        }
        if headers:
            default_headers.update(headers)
        self.session.headers.update(default_headers)

        # Setup urllib3 Retry strategy
        retry_strategy = Retry(
            total=max_retries,
            backoff_factor=1.0,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST", "HEAD"],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def rate_limit(self) -> None:
        """Enforce rate limit delay between requests."""
        if self.delay > 0:
            time.sleep(self.delay)

    def fetch_html(self, url: str, params: Optional[dict] = None) -> str:
        """
        Fetch HTML content from URL with rate limiting and error handling.
        """
        self.rate_limit()
        logger.info(f"Fetching HTML from: {url}")
        try:
            response = self.session.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            return response.text
        except requests.RequestException as e:
            logger.error(f"Failed to fetch {url}: {e}")
            raise

    def download_pdf(
        self, url: str, output_path: Optional[str] = None
    ) -> Tuple[str, str]:
        """
        Streaming PDF downloader saving atomically to download_dir with SHA-256 computation.
        
        Returns:
            Tuple[str, str]: (absolute_output_path, sha256_hash_string)
        """
        self.rate_limit()

        if not output_path:
            filename = os.path.basename(urlparse(url).path)
            if not filename or not filename.endswith(".pdf"):
                filename = f"report_{int(time.time())}.pdf"
            output_path = os.path.join(self.download_dir, filename)
        else:
            if not os.path.isabs(output_path):
                output_path = os.path.join(self.download_dir, output_path)

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        tmp_path = output_path + ".tmp"
        sha256_hash = hashlib.sha256()

        logger.info(f"Downloading PDF from {url} -> {output_path}")

        # Handle local file / file:// URLs for test/offline execution
        if url.startswith("file://") or os.path.exists(url):
            local_src = url.replace("file://", "")
            with open(local_src, "rb") as f_in, open(tmp_path, "wb") as f_out:
                while chunk := f_in.read(8192):
                    sha256_hash.update(chunk)
                    f_out.write(chunk)
        else:
            # HTTP/HTTPS streaming download
            response = self.session.get(url, stream=True, timeout=self.timeout)
            response.raise_for_status()

            with open(tmp_path, "wb") as f_out:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        sha256_hash.update(chunk)
                        f_out.write(chunk)

        # Atomic rename after complete download and hash calculation
        if os.path.exists(output_path):
            os.remove(output_path)
        os.rename(tmp_path, output_path)

        hash_hex = sha256_hash.hexdigest()
        formatted_hash = f"sha256:{hash_hex}"
        logger.info(f"PDF successfully downloaded: {output_path} (SHA-256: {formatted_hash})")
        return output_path, formatted_hash
