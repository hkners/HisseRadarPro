import os
import sys
import json
import shutil
import tempfile
import hashlib
import unittest
import threading
from concurrent.futures import ThreadPoolExecutor

# Ensure backend/scrapers is on sys.path
scrapers_dir = r"C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\backend\scrapers"
if scrapers_dir not in sys.path:
    sys.path.insert(0, scrapers_dir)

from cache_manager import CacheManager
from base_scraper import BaseScraper
from llm_parser import LLMParser

class TestCachingAndScraperDurability(unittest.TestCase):

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="stress_test_scrapers_")
        self.cache_dir = os.path.join(self.test_dir, "cache")
        os.makedirs(self.cache_dir, exist_ok=True)
        self.log_file = os.path.join(self.test_dir, "logs", "llm_audit.log")

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_missing_cache_file_and_nested_dirs(self):
        """Scenario 1: Missing cache file in non-existent nested directory."""
        nested_cache = os.path.join(self.test_dir, "deep", "nested", "path", "llm_cache.json")
        self.assertFalse(os.path.exists(os.path.dirname(nested_cache)))
        
        # Instantiate CacheManager with deeply nested missing directory
        mgr = CacheManager(cache_file=nested_cache)
        
        # get() on missing file should return None without error
        res = mgr.get("sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef")
        self.assertIsNone(res)
        
        # set() should create all parent directories and file atomically
        sample_data = {"ticker": "THYAO", "target_price": 450.0}
        test_hash = "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
        mgr.set(test_hash, sample_data)
        
        self.assertTrue(os.path.exists(nested_cache))
        hit = mgr.get(test_hash)
        self.assertIsNotNone(hit)
        self.assertTrue(hit.get("cached"))
        self.assertEqual(hit["ticker"], "THYAO")

    def test_corrupted_json_cache_file_variations(self):
        """Scenario 2: Corrupted JSON cache file variations (malformed, empty, non-dict)."""
        corrupted_cache = os.path.join(self.cache_dir, "corrupted_cache.json")
        
        # 2a: Malformed JSON string
        with open(corrupted_cache, "w", encoding="utf-8") as f:
            f.write("{invalid_json: true, missing_quotes: ")
            
        mgr1 = CacheManager(cache_file=corrupted_cache)
        self.assertEqual(mgr1._cache, {})
        self.assertIsNone(mgr1.get("sha256:abcd"))
        
        # 2b: Completely empty cache file
        with open(corrupted_cache, "w", encoding="utf-8") as f:
            f.write("")
            
        mgr2 = CacheManager(cache_file=corrupted_cache)
        self.assertEqual(mgr2._cache, {})
        self.assertIsNone(mgr2.get("sha256:abcd"))
        
        # 2c: Non-dict JSON (array root)
        with open(corrupted_cache, "w", encoding="utf-8") as f:
            f.write('[{"item": 1}, {"item": 2}]')
            
        mgr3 = CacheManager(cache_file=corrupted_cache)
        self.assertEqual(mgr3._cache, {})
        self.assertIsNone(mgr3.get("sha256:abcd"))
        
        # Self-recovery on set() after corruption
        mgr3.set("sha256:abcd", {"status": "recovered"})
        hit = mgr3.get("sha256:abcd")
        self.assertIsNotNone(hit)
        self.assertEqual(hit["status"], "recovered")

    def test_duplicate_pdf_hashing_and_key_normalization(self):
        """Scenario 3: Duplicate PDF hashing, SHA-256 computation, and key normalization."""
        pdf1_path = os.path.join(self.test_dir, "doc1.pdf")
        pdf2_path = os.path.join(self.test_dir, "doc2_copy.pdf")
        
        identical_content = b"%PDF-1.4\n1 0 obj\n<< /Title (Identical Report) >>\nendobj\n"
        with open(pdf1_path, "wb") as f:
            f.write(identical_content)
        with open(pdf2_path, "wb") as f:
            f.write(identical_content)
            
        scraper = BaseScraper(download_dir=self.test_dir)
        _, hash1 = scraper.download_pdf(f"file://{pdf1_path}", output_path="out1.pdf")
        _, hash2 = scraper.download_pdf(f"file://{pdf2_path}", output_path="out2.pdf")
        
        self.assertEqual(hash1, hash2)
        expected_sha = "sha256:" + hashlib.sha256(identical_content).hexdigest()
        self.assertEqual(hash1, expected_sha)
        
        cache_file = os.path.join(self.cache_dir, "dedup_cache.json")
        cache_mgr = CacheManager(cache_file=cache_file)
        parser = LLMParser(cache_manager=cache_mgr, log_path=self.log_file)
        
        # First parse -> Cache MISS
        result1 = parser.parse_report(pdf1_path, hash1, metadata={"broker": "Garanti BBVA"})
        self.assertFalse(result1["cached"])
        
        # Second parse with duplicate PDF content hash -> Cache HIT
        result2 = parser.parse_report(pdf2_path, hash2, metadata={"broker": "Garanti BBVA"})
        self.assertTrue(result2["cached"])
        self.assertEqual(result1["ticker"], result2["ticker"])
        
        # Check retrieval without 'sha256:' prefix
        raw_hash = hash1.replace("sha256:", "")
        hit_raw = cache_mgr.get(raw_hash)
        self.assertIsNotNone(hit_raw)
        self.assertTrue(hit_raw["cached"])

    def test_zero_byte_pdf_handling(self):
        """Scenario 4: Zero-byte PDF handling in scraper downloader, hasher, text extractor, and cache."""
        zero_pdf = os.path.join(self.test_dir, "zero_bytes.pdf")
        open(zero_pdf, "wb").close()
        self.assertEqual(os.path.getsize(zero_pdf), 0)
        
        scraper = BaseScraper(download_dir=self.test_dir)
        out_path, file_hash = scraper.download_pdf(f"file://{zero_pdf}", output_path="out_zero.pdf")
        
        expected_empty_sha = "sha256:" + hashlib.sha256(b"").hexdigest()
        self.assertEqual(file_hash, expected_empty_sha)
        self.assertEqual(file_hash, "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
        
        cache_file = os.path.join(self.cache_dir, "zero_cache.json")
        cache_mgr = CacheManager(cache_file=cache_file)
        parser = LLMParser(cache_manager=cache_mgr, log_path=self.log_file)
        
        text = parser.extract_pdf_text(out_path)
        self.assertIn("Empty report text.", text)
        
        parsed = parser.parse_report(out_path, file_hash, metadata={"broker": "Test Broker"})
        self.assertFalse(parsed["cached"])
        self.assertEqual(parsed["file_hash"], expected_empty_sha)
        
        parsed2 = parser.parse_report(out_path, file_hash, metadata={"broker": "Test Broker"})
        self.assertTrue(parsed2["cached"])

    def test_null_empty_key_edge_cases(self):
        """Scenario 5: Null / empty string file hash queries in CacheManager."""
        mgr = CacheManager(cache_file=os.path.join(self.cache_dir, "null_key_cache.json"))
        
        self.assertIsNone(mgr.get(""))
        self.assertIsNone(mgr.get(None))
        
        # Setting with empty string key should be safely ignored
        mgr.set("", {"test": 123})
        mgr.set(None, {"test": 456})
        self.assertEqual(mgr._cache, {})

    def test_thread_safety_stress(self):
        """Scenario 6: High concurrency multi-threaded stress test on CacheManager."""
        cache_file = os.path.join(self.cache_dir, "thread_stress.json")
        mgr = CacheManager(cache_file=cache_file)
        
        def worker(i):
            key = f"sha256:hash_{i % 20}"
            mgr.set(key, {"thread_id": threading.get_ident(), "value": i})
            res = mgr.get(key)
            if res:
                self.assertIn("value", res)
            if i % 10 == 0:
                _ = mgr.get("sha256:nonexistent")
                
        with ThreadPoolExecutor(max_workers=16) as executor:
            futures = [executor.submit(worker, i) for i in range(200)]
            for f in futures:
                f.result()
                
        self.assertTrue(os.path.exists(cache_file))

if __name__ == "__main__":
    unittest.main()
