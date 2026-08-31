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
import re
import sys
import threading
import time
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
from services.ticker_resolver import load_bist_tickers, match_ticker, parse_rating
from services.price_service import PriceService

from globals import (
    base_dir, ALL_BIST_FILE, report_repo, BIST_TICKERS, price_service,
    _static_json_cache, _static_json_lock
)


# --- TTL-based recommendations cache ---
_recs_cache = None
_recs_cache_time = 0
_recs_cache_lock = threading.Lock()
_RECS_CACHE_TTL = 60  # seconds


def load_static_json_cache():
    """Load legacy crawler JSON files (modeller.json) into memory cache."""
    global _static_json_cache
    with _static_json_lock:
        modeller_path = os.path.join(base_dir, "models.json")
        if os.path.exists(modeller_path):
            try:
                with open(modeller_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    _static_json_cache["models"] = data.get("models", [])
            except Exception as e:
                logger.warning(f"Could not load modeller.json: {e}")


def get_cached_recommendations():
    """Fetches scraped reports from DB with 60s TTL in-memory cache."""
    global _recs_cache, _recs_cache_time
    
    now = time.time()
    with _recs_cache_lock:
        if _recs_cache is not None and (now - _recs_cache_time) < _RECS_CACHE_TTL:
            return _recs_cache
    
    scraped_recs = []
    try:
        db_reports = report_repo.get_reports(limit=10000)
        for r in db_reports:
            r_id = r.get("id", "")
            pdf_url = r.get("pdf_url", "")
            
            # Temporary filter: Exclude Deniz Yatırım's own direct PDFs from Brokerages view
            if r.get("broker") == "Deniz Yatırım" and "hisseonerileri.com" not in pdf_url:
                continue
                
            scraped_recs.append({
                "id": r_id,
                "pdf_url": pdf_url,
                "report_title": r.get("report_title"),
                "tarih": str(r.get("report_date", "")),
                "hisse": str(r.get("ticker", "")),
                "kurum": str(r.get("broker", "")),
                "tavsiye": str(r.get("rating", "")),
                "oneri": str(r.get("rating", "")),
                "hedefFiyat": r.get("target_price") if r.get("target_price") is not None else "N/A",
                "mevcutFiyat": r.get("current_price") if r.get("current_price") is not None else "N/A",
                "potansiyel": r.get("potansiyel") if r.get("potansiyel") is not None else "N/A",
                "is_model": r.get("is_model", False),
                "metin": r.get("full_text") or "Metin bulunamadı.",
                "full_text": r.get("full_text") or "Metin bulunamadı."
            })
    except Exception as e:
        logger.error(f"Error fetching DB reports for UI merge: {e}")

    with _recs_cache_lock:
        _recs_cache = scraped_recs
        _recs_cache_time = time.time()
    
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
    # Pre-warm the recommendations cache
    get_cached_recommendations()
    # Pre-warm company info cache
    report_repo.get_all_company_info()
    yield


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
from routers.ingest import router as ingest_router
from routers.portfolio import router as portfolio_router
from routers.admin import router as admin_router
from routers.technical_screener import router as technical_screener_router

app.include_router(stocks_router)
app.include_router(recommendations_router)
app.include_router(scraped_reports_router)
app.include_router(ingest_router)
app.include_router(portfolio_router)
app.include_router(admin_router)
app.include_router(technical_screener_router)


# --- Health check (stays in main) ---
@app.get("/api/health")
def get_health():
    """Health check endpoint returning API status and DB status."""
    return {
        "status": "ok",
        "service": "HisseRadarPro API",
        "timestamp": datetime.now().isoformat(),
    }


# --- Unified Dashboard Endpoint (single request for all dashboard data) ---
@app.get("/api/dashboard")
def get_dashboard():
    """Returns all data needed by the Home dashboard in a single response.
    Eliminates 5 separate API calls and their redundant DB queries.
    """
    all_recs = get_cached_recommendations()
    all_prices = price_service.prices
    
    # --- Kurum Stats ---
    stats_map = {}
    latest_reports = {}
    for r in all_recs:
        ticker = match_ticker(r.get("hisse", ""), BIST_TICKERS)
        if not ticker:
            continue
        broker = r.get("kurum", "Bilinmiyor").strip()
        broker = re.sub(r'\s+', ' ', broker).strip()
        date_str = str(r.get("tarih", ""))
        key = (ticker, broker)
        if key not in latest_reports or date_str > str(latest_reports[key].get("tarih", "")):
            r_copy = {**r, "kurum_normalized": broker, "_ticker": ticker}
            latest_reports[key] = r_copy
    
    unique_reports = list(latest_reports.values())
    
    for r in unique_reports:
        k = r.get("kurum_normalized", "Bilinmiyor")
        if k not in stats_map:
            stats_map[k] = {
                "count": 0, "pot_count": 0, "sum_potential": 0.0,
                "sum_realized": 0.0, "realized_count": 0,
                "ratings": {"AL": 0, "TUT": 0, "SAT": 0, "OTHER": 0},
            }
        stats_map[k]["count"] += 1
        
        pot_val = r.get("potansiyel", 0)
        try:
            pot_num = float(pot_val)
            if pot_num != 0.0 and pot_num <= 500:
                stats_map[k]["sum_potential"] += pot_num
                stats_map[k]["pot_count"] += 1
        except (ValueError, TypeError):
            pass
        
        rating = parse_rating(str(r.get("tavsiye", "Bilinmiyor")))
        stats_map[k]["ratings"][rating] += 1
        
        ticker = r.get("_ticker")
        mevcut = r.get("mevcutFiyat", "0")
        hedef = r.get("hedefFiyat", "0")
        if ticker and mevcut and mevcut != "Bilinmiyor" and hedef and hedef != "Bilinmiyor":
            p_data = all_prices.get(ticker, {})
            live_price = p_data.get("price", 0.0) if isinstance(p_data, dict) else 0.0
            try:
                mevcut_num = float(str(mevcut).replace(",", "."))
                hedef_num = float(str(hedef).replace(",", "."))
                if live_price > 0 and mevcut_num > 0:
                    realized = ((live_price - mevcut_num) / mevcut_num) * 100
                    if -100 <= realized <= 500:
                        stats_map[k]["sum_realized"] += realized
                        stats_map[k]["realized_count"] += 1
            except (ValueError, TypeError):
                pass
    
    kurum_stats = []
    for k, v in stats_map.items():
        avg = v["sum_potential"] / v["count"] if v["count"] > 0 else 0
        avg_realized = v["sum_realized"] / v["realized_count"] if v["realized_count"] > 0 else None
        kurum_stats.append({
            "kurum": k, "count": v["count"],
            "avg_potential": avg, "avg_realized": avg_realized,
            "ratings": v["ratings"],
        })
    kurum_stats.sort(key=lambda x: x["count"], reverse=True)
    
    # --- Top Stocks ---
    grouped = {}
    for r in unique_reports:
        ticker = r.get("_ticker")
        if not ticker:
            continue
        if ticker not in grouped:
            grouped[ticker] = {"targets": [], "count": 0, "company": r.get("hisse", ""), "brokers": set()}
        grouped[ticker]["count"] += 1
        grouped[ticker]["brokers"].add(r.get("kurum_normalized", ""))
        target = r.get("hedefFiyat")
        try:
            target_val = float(str(target).replace(",", "."))
            if target_val > 0.0:
                grouped[ticker]["targets"].append(target_val)
        except (ValueError, TypeError):
            pass
    
    top_stocks = []
    for ticker, data in grouped.items():
        p_data = all_prices.get(ticker, {})
        live_price = p_data.get("price", 0.0) if isinstance(p_data, dict) else 0.0
        if not data["targets"]:
            avg_target = None
            upside = None
        else:
            avg_target = sum(data["targets"]) / len(data["targets"])
            upside = ((avg_target - live_price) / live_price * 100) if live_price and live_price > 0 else 0.0
        if upside is not None and upside > 500:
            continue
        top_stocks.append({
            "ticker": ticker, "company": data["company"],
            "avg_target": round(avg_target, 2) if avg_target else "N/A",
            "current_price": live_price if live_price else "N/A",
            "upside_potential": upside if upside is not None else "N/A",
            "count": data["count"],
        })
    top_stocks.sort(key=lambda x: x["count"], reverse=True)
    
    # --- Models ---
    dynamic_groups = {}
    for r in all_recs:
        if r.get("is_model"):
            kurum = r.get("kurum", "Bilinmeyen")
            if kurum not in dynamic_groups:
                dynamic_groups[kurum] = []
            dynamic_groups[kurum].append({
                k: v for k, v in r.items() if k not in ("metin", "full_text")
            })
    
    models = []
    for kurum, stocks in dynamic_groups.items():
        stocks.sort(key=lambda x: x.get("tarih", ""), reverse=True)
        models.append({
            "id": f"dynamic_{kurum.replace(' ', '_').lower()}",
            "kurum": kurum, "tarih": "Canlı Güncel",
            "title": f"{kurum} Model Portföyü (Fintables)",
            "is_dynamic": True, "stocks": stocks
        })
    
    # --- Latest Recommendations ---
    latest = []
    for r in all_recs[:20]:
        ticker = match_ticker(r.get("hisse", ""), BIST_TICKERS)
        if ticker:
            latest.append({
                k: v for k, v in r.items() if k not in ("metin", "full_text")
            } | {"ticker": ticker})
        if len(latest) >= 5:
            break
    
    # --- Market Pulse + Stocks ---
    up = down = flat = 0
    stocks_list = []
    recs_grouped = {}
    for r in unique_reports:
        ticker = r.get("_ticker")
        if not ticker:
            continue
        if ticker not in recs_grouped:
            recs_grouped[ticker] = {"targets": [], "brokers": set()}
        target = r.get("hedefFiyat")
        try:
            target_val = float(str(target).replace(",", "."))
            if target_val > 0:
                recs_grouped[ticker]["targets"].append(target_val)
        except (ValueError, TypeError):
            pass
        broker = r.get("kurum")
        if broker:
            recs_grouped[ticker]["brokers"].add(broker)
    
    for t, p_data in all_prices.items():
        if p_data:
            change = p_data.get("change_pct", 0) or 0
            if change > 0: up += 1
            elif change < 0: down += 1
            else: flat += 1
            
            rec_data = recs_grouped.get(t, {"targets": [], "brokers": set()})
            avg_target = sum(rec_data["targets"]) / len(rec_data["targets"]) if rec_data["targets"] else 0.0
            live_price = p_data.get("price")
            upside = 0.0
            if live_price and live_price > 0 and avg_target > 0:
                upside = ((avg_target - live_price) / live_price) * 100
            stocks_list.append({
                "ticker": t, "name": f"{t} A.Ş.",
                "price": live_price,
                "change_pct": p_data.get("change_pct"),
                "volume": p_data.get("volume"),
                "rec_count": len(rec_data["brokers"]),
                "avg_potential": upside,
                "brokerages": list(rec_data["brokers"]),
            })
    
    return {
        "kurum_stats": kurum_stats,
        "top_stocks": top_stocks[:5],
        "models": models[:3],
        "latest_recommendations": latest,
        "market_pulse": {"up": up, "down": down, "flat": flat, "total": len(all_prices)},
        "stocks": {
            "status": price_service.status,
            "last_updated": price_service.last_updated,
            "stocks": stocks_list,
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8015)
