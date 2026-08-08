import hashlib
import json
import os
import shutil
import sys
import tempfile
import unittest

# Ensure backend/scrapers directory is on sys.path
scrapers_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if scrapers_dir not in sys.path:
    sys.path.insert(0, scrapers_dir)

from base_scraper import BaseScraper
from garanti_scraper import GarantiScraper
from deniz_scraper import DenizScraper
from cache_manager import CacheManager
from llm_parser import LLMParser
from scraper_network import run_scraper_network


class TestScrapersAndLLM(unittest.TestCase):

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_scrapers_")
        self.downloads_dir = os.path.join(self.test_dir, "downloads")
        self.cache_file = os.path.join(self.test_dir, "cache", "llm_cache.json")
        self.log_file = os.path.join(self.test_dir, "logs", "llm_audit.log")

    def tearDown(self):
        import gc
        gc.collect()
        if os.path.exists(self.test_dir):
            try:
                shutil.rmtree(self.test_dir)
            except Exception:
                pass


    def test_1_base_scraper_download_and_sha256(self):
        """Test BaseScraper atomic download to .tmp and SHA-256 computation."""
        scraper = BaseScraper(download_dir=self.downloads_dir)
        
        # Create dummy file to simulate download source
        src_file = os.path.join(self.test_dir, "sample.pdf")
        test_content = b"%PDF-1.4 test pdf content for sha256"
        with open(src_file, "wb") as f:
            f.write(test_content)
        
        expected_hash = "sha256:" + hashlib.sha256(test_content).hexdigest()
        
        output_path, file_hash = scraper.download_pdf(f"file://{src_file}", output_path="downloaded_sample.pdf")
        
        self.assertTrue(os.path.exists(output_path))
        self.assertFalse(os.path.exists(output_path + ".tmp"))
        self.assertEqual(file_hash, expected_hash)

    def test_2_garanti_and_deniz_scrapers(self):
        """Test Garanti and Deniz scrapers return valid structure and PDFs."""
        garanti = GarantiScraper(download_dir=self.downloads_dir)
        garanti_reports = garanti.scrape_reports(limit=2)
        
        self.assertGreaterEqual(len(garanti_reports), 1)
        g_report = garanti_reports[0]
        self.assertEqual(g_report["broker"], "Garanti BBVA")
        self.assertTrue(g_report["report_title"])
        self.assertTrue(g_report["report_date"])
        self.assertTrue(os.path.exists(g_report["pdf_path"]))
        self.assertTrue(g_report["file_hash"].startswith("sha256:"))

        deniz = DenizScraper(download_dir=self.downloads_dir)
        deniz_reports = deniz.scrape_reports(limit=2)
        
        self.assertGreaterEqual(len(deniz_reports), 1)
        d_report = deniz_reports[0]
        self.assertEqual(d_report["broker"], "Deniz Yatırım")
        self.assertTrue(d_report["report_title"])
        self.assertTrue(d_report["report_date"])
        self.assertTrue(os.path.exists(d_report["pdf_path"]))
        self.assertTrue(d_report["file_hash"].startswith("sha256:"))

    def test_3_cache_manager(self):
        """Test CacheManager set, get, key normalization, and persistence."""
        cache_mgr = CacheManager(cache_file=self.cache_file)
        test_hash = "sha256:112233445566778899aabbccddeeff00"
        sample_data = {
            "id": "report_123",
            "ticker": "THYAO",
            "rating": "AL",
            "target_price": 450.0,
            "current_price": 315.5,
            "potansiyel": 42.6,
        }

        # Cache miss initially
        self.assertIsNone(cache_mgr.get(test_hash))

        # Save to cache
        cache_mgr.set(test_hash, sample_data)

        # Cache hit on retrieval
        hit = cache_mgr.get(test_hash)
        self.assertIsNotNone(hit)
        self.assertTrue(hit.get("cached"))
        self.assertEqual(hit["ticker"], "THYAO")
        self.assertEqual(hit["target_price"], 450.0)

        # Test key normalization (without sha256: prefix)
        raw_hash = "112233445566778899aabbccddeeff00"
        hit_raw = cache_mgr.get(raw_hash)
        self.assertIsNotNone(hit_raw)
        self.assertTrue(hit_raw.get("cached"))

    def test_4_llm_parser_extraction_and_caching_flow(self):
        """Test LLMParser text extraction, structured parsing, mandatory caching, and audit logging."""
        cache_mgr = CacheManager(cache_file=self.cache_file)
        parser = LLMParser(cache_manager=cache_mgr, log_path=self.log_file)

        garanti = GarantiScraper(download_dir=self.downloads_dir)
        reports = garanti.scrape_reports(limit=1)
        rep = reports[0]

        pdf_path = rep["pdf_path"]
        file_hash = rep["file_hash"]

        # 1st run: Cache MISS
        parsed_1 = parser.parse_report(pdf_path, file_hash, metadata=rep)
        self.assertFalse(parsed_1["cached"])
        self.assertEqual(parsed_1["broker"], "Garanti BBVA")
        self.assertTrue(parsed_1["ticker"])
        self.assertGreater(parsed_1["target_price"], 0)
        self.assertEqual(parsed_1["prompt_id"], "v1_research_extractor")

        # 2nd run: Mandatory Cache HIT
        parsed_2 = parser.parse_report(pdf_path, file_hash, metadata=rep)
        self.assertTrue(parsed_2["cached"])
        self.assertEqual(parsed_2["ticker"], parsed_1["ticker"])
        self.assertEqual(parsed_2["target_price"], parsed_1["target_price"])

        # Check Audit Log entries created
        self.assertTrue(os.path.exists(self.log_file))
        with open(self.log_file, "r", encoding="utf-8") as f:
            logs = f.readlines()
        self.assertGreaterEqual(len(logs), 2)
        self.assertIn("v1_research_extractor", logs[0])
        self.assertIn("CACHED=False", logs[0])
        self.assertIn("CACHED=True", logs[1])

    def test_5_scraper_network_orchestrator(self):
        """Test run_scraper_network end-to-end execution and scraped_reports.json output."""
        output_file = os.path.join(self.test_dir, "scraped_reports.json")
        results = run_scraper_network(output_path=output_file, limit_per_broker=2)

        self.assertTrue(os.path.exists(output_file))
        self.assertGreaterEqual(len(results), 2)

        with open(output_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertEqual(len(data), len(results))
        for item in data:
            self.assertIn("ticker", item)
            self.assertIn("broker", item)
            self.assertIn("rating", item)
            self.assertIn("target_price", item)
            self.assertIn("current_price", item)
            self.assertIn("potansiyel", item)
            self.assertIn("report_date", item)
            self.assertIn("summary", item)
            self.assertIn("catalysts", item)
            self.assertIn("file_hash", item)


if __name__ == "__main__":
    unittest.main()
