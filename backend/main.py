"""
HisseRadarPro — FastAPI Application Server
============================================
Refactored main.py: App initialization, lifespan, static file mounts.
All API endpoints are delegated to routers/ package.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import json
import logging
import os
import sys
import threading
from datetime import datetime

logger = logging.getLogger(__name__)

# Suppress noisy yfinance ERROR logs for delisted/invalid tickers
logging.getLogger("yfinance").setLevel(logging.CRITICAL)

# --- Path setup ---
base_dir = os.path.dirname(os.path.abspath(__file__))
scrapers_dir = os.path.join(base_dir, "scrapers")
ALL_BIST_FILE = os.path.join(base_dir, "all_bist.txt")
if scrapers_dir not in sys.path:
    sys.path.insert(0, scrapers_dir)

# Add backend dir to path for routers/services imports
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from db_manager import ReportRepository
from services.ticker_resolver import load_bist_tickers
from services.price_service import PriceService

from globals import (
    base_dir, ALL_BIST_FILE, report_repo, BIST_TICKERS, price_service,
    _static_json_cache, _static_json_lock
)


def load_static_json_cache():
    """Load legacy crawler JSON files (tavsiyeler.json, modeller.json) into memory cache."""
    global _static_json_cache
    with _static_json_lock:
        # Load tavsiyeler.json if it exists
        tavsiyeler_path = os.path.join(base_dir, "tavsiyeler.json")
        if os.path.exists(tavsiyeler_path):
            try:
                with open(tavsiyeler_path, "r", encoding="utf-8") as f:
                    _static_json_cache["recommendations"] = json.load(f)
            except Exception as e:
                logger.warning(f"Could not load tavsiyeler.json: {e}")

        # Load modeller.json if it exists
        modeller_path = os.path.join(base_dir, "modeller.json")
        if os.path.exists(modeller_path):
            try:
                with open(modeller_path, "r", encoding="utf-8") as f:
                    _static_json_cache["models"] = json.load(f)
            except Exception as e:
                logger.warning(f"Could not load modeller.json: {e}")


def get_cached_recommendations():
    """Fetches scraped reports from DB and merges with legacy JSON recommendations."""
    scraped_recs = []
    try:
        db_reports = report_repo.get_reports(limit=1000)
        for r in db_reports:
            scraped_recs.append({
                "tarih": str(r.get("report_date", "")),
                "hisse": str(r.get("ticker", "")),
                "kurum": str(r.get("broker", "")),
                "tavsiye": str(r.get("rating", "")),
                "oneri": str(r.get("rating", "")),
                "hedefFiyat": r.get("target_price") if r.get("target_price") is not None else "N/A",
                "mevcutFiyat": r.get("current_price") if r.get("current_price") is not None else "N/A",
                "potansiyel": r.get("potansiyel") if r.get("potansiyel") is not None else "N/A",
                "metin": r.get("full_text") or "Metin bulunamadı.",
                "full_text": r.get("full_text") or "Metin bulunamadı."
            })
    except Exception as e:
        logger.error(f"Error fetching DB reports for UI merge: {e}")

    # Merge legacy static JSON recommendations
    with _static_json_lock:
        scraped_recs.extend(_static_json_cache.get("recommendations", []))

    return scraped_recs


def get_cached_models():
    """Returns model portfolio data from static JSON cache."""
    with _static_json_lock:
        return _static_json_cache.get("models", [])


# --- Lifespan ---
@asynccontextmanager
async def lifespan(app):
    """Modern FastAPI lifespan handler."""
    load_static_json_cache()
    price_service.start_background_worker()
    yield
    # Shutdown cleanup (if needed)


# --- App creation ---
app = FastAPI(
    title="HisseRadarPro API",
    description="BIST Stock Research Report Aggregation Platform",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Static file mounts ---
logos_dir = os.path.join(base_dir, "logos")
os.makedirs(logos_dir, exist_ok=True)
app.mount("/logos", StaticFiles(directory=logos_dir), name="logos")

downloads_dir = os.path.join(base_dir, "scrapers", "downloads")
os.makedirs(downloads_dir, exist_ok=True)
app.mount("/downloads", StaticFiles(directory=downloads_dir), name="downloads")

# --- Register routers ---
from routers.stocks import router as stocks_router
from routers.recommendations import router as recommendations_router
from routers.scraped_reports import router as scraped_reports_router

app.include_router(stocks_router)
app.include_router(recommendations_router)
app.include_router(scraped_reports_router)


# --- Health check (stays in main) ---
@app.get("/api/health")
def get_health():
    """Health check endpoint returning API status and DB status."""
    return {
        "status": "ok",
        "service": "HisseRadarPro API",
        "timestamp": datetime.now().isoformat(),
        "scraped_reports_count": len(report_repo.get_reports()),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8015)
