import copy
import json
import logging
import os
import threading
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class CacheManager:
    """
    Manages LLM extraction caching based on PDF SHA-256 content hashes.
    Stores and retrieves parsed report data from backend/scrapers/cache/llm_cache.json.
    """

    def __init__(self, cache_file: Optional[str] = None):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.cache_dir = os.path.join(base_dir, "cache")
        self.cache_file = cache_file or os.path.join(self.cache_dir, "llm_cache.json")
        os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)
        self._lock = threading.Lock()
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._load_cache()

    def _normalize_key(self, key: str) -> str:
        if not key:
            return ""
        return key.strip().lower()

    def _load_cache(self) -> None:
        with self._lock:
            if os.path.exists(self.cache_file):
                try:
                    with open(self.cache_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, dict):
                            self._cache = {self._normalize_key(k): v for k, v in data.items()}
                        else:
                            self._cache = {}
                except Exception as e:
                    logger.warning(f"Failed to load cache file {self.cache_file}: {e}")
                    self._cache = {}
            else:
                self._cache = {}

    def _save_cache(self) -> None:
        """Atomic write to cache file using temporary file."""
        os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)
        tmp_file = self.cache_file + ".tmp"
        try:
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(self._cache, f, ensure_ascii=False, indent=2)
            os.replace(tmp_file, self.cache_file)
        except Exception as e:
            logger.error(f"Error saving cache to {self.cache_file}: {e}")
            if os.path.exists(tmp_file):
                try:
                    os.remove(tmp_file)
                except OSError:
                    pass

    def get(self, file_hash: str) -> Optional[Dict[str, Any]]:
        """
        Check if file_hash exists in cache.
        If found, returns cached dict with "cached": True.
        """
        if not file_hash:
            return None

        normalized = self._normalize_key(file_hash)
        alt_key = normalized.replace("sha256:", "") if normalized.startswith("sha256:") else f"sha256:{normalized}"

        with self._lock:
            cached_item = self._cache.get(normalized) or self._cache.get(alt_key)
            if cached_item:
                result = copy.deepcopy(cached_item)
                result["cached"] = True
                return result
        return None

    def set(self, file_hash: str, parsed_result: Dict[str, Any]) -> None:
        """
        Save parsed result for file_hash in cache.
        Removes temporary 'cached' flag before persisting.
        """
        if not file_hash:
            return

        normalized = self._normalize_key(file_hash)
        data_to_store = copy.deepcopy(parsed_result)
        # Ensure we don't persist cached: True inside the stored record itself
        data_to_store["cached"] = False

        with self._lock:
            self._cache[normalized] = data_to_store
            self._save_cache()

    def clear(self) -> None:
        """Clear cache contents completely."""
        with self._lock:
            self._cache = {}
            self._save_cache()
