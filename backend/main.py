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
    # Start TradingView TA background sync worker (refreshes every 15 min)
    try:
        from services.ta_sync import start_ta_sync_worker
        start_ta_sync_worker()
    except Exception as e:
        logger.warning(f"Could not start TA sync worker: {e}")
    # Keep historical_prices current (bulk download of missing closed sessions)
    try:
        from services.price_history_sync import start_price_history_worker
        start_price_history_worker()
    except Exception as e:
        logger.warning(f"Could not start price history worker: {e}")
    # Pre-warm the recommendations cache
    get_cached_recommendations()
    # Pre-warm company info cache
    report_repo.get_all_company_info()
    # Pre-warm conviction engine
    try:
        from services.conviction_engine import conviction_engine
        threading.Thread(target=conviction_engine.recompute, daemon=True).start()
    except Exception as e:
        logger.warning(f"Could not pre-warm conviction engine: {e}")
    yield


# --- App creation ---
app = FastAPI(
    title="HisseRadarPro API",
    description="BIST Stock Research Report Aggregation Platform",
    version="2.0.0",
    lifespan=lifespan,
)

# Only the local frontend may call the API from a browser. With "*", any website open in the
# browser could read or delete the portfolio, inject reports or spend the Gemini quota.
_cors_env = os.environ.get("HR_CORS_ORIGINS", "")
CORS_ORIGINS = [o.strip() for o in _cors_env.split(",") if o.strip()] or [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:4173", "http://127.0.0.1:4173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
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
from routers.viop import router as viop_router
from routers.alpha import router as alpha_router

app.include_router(stocks_router)
app.include_router(recommendations_router)
app.include_router(scraped_reports_router)
app.include_router(ingest_router)
app.include_router(portfolio_router)
app.include_router(admin_router)
app.include_router(technical_screener_router)
app.include_router(viop_router)
app.include_router(alpha_router)
from routers.conviction import router as conviction_router
app.include_router(conviction_router)
from routers.backtest import router as backtest_router
app.include_router(backtest_router)
from routers.universe import router as universe_router
app.include_router(universe_router)
from routers.compare import router as compare_router
app.include_router(compare_router)
from routers.macro import router as macro_router
app.include_router(macro_router)
from routers.strategy_backtest import router as strategy_backtest_router
app.include_router(strategy_backtest_router)
from routers.copilot import router as copilot_router
app.include_router(copilot_router)
from routers.studio import router as studio_router
app.include_router(studio_router)
from routers.export import router as export_router
app.include_router(export_router)
from routers.baskets import router as baskets_router
app.include_router(baskets_router)


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
_dashboard_cache = {"timestamp": 0, "data": None}

@app.get("/api/dashboard")
def get_dashboard():
    """Returns all data needed by the Home dashboard in a single response.
    Eliminates 5 separate API calls and their redundant DB queries.
    """
    global _dashboard_cache
    now = time.time()
    if _dashboard_cache["data"] and (now - _dashboard_cache["timestamp"] < 30):
        return _dashboard_cache["data"]

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
        

    
    kurum_stats = []
    for k, v in stats_map.items():
        # Average over reports that actually state a potential, not over every report.
        avg = v["sum_potential"] / v["pot_count"] if v["pot_count"] > 0 else None
        kurum_stats.append({
            "kurum": k, "count": v["count"],
            "avg_potential": avg,
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
    
    try:
        from services.conviction_engine import conviction_engine
        from services.ai_service import get_ai_market_pulse_summary
        conv_summary = conviction_engine.get_dashboard_summary()
        conv_summary["ai_market_pulse"] = get_ai_market_pulse_summary().get("summary", "")
    except Exception as e:
        conv_summary = {"error": str(e), "top_buys": []}

    market_regime_data = {}
    try:
        from services.market_regime_service import market_regime_service
        market_regime_data = market_regime_service.get_current_regime(all_prices=all_prices)
    except Exception as e:
        market_regime_data = {"regime": "NEUTRAL", "exposure_multiplier": 1.0, "color": "#C9883A"}

    result = {
        "kurum_stats": kurum_stats,
        "top_stocks": top_stocks[:5],
        "models": models[:3],
        "latest_recommendations": latest,
        "market_pulse": {"up": up, "down": down, "flat": flat, "total": len(all_prices)},
        "market_regime": market_regime_data,
        "conviction": conv_summary,
        "stocks": {
            "status": price_service.status,
            "last_updated": price_service.last_updated,
            "stocks": stocks_list,
        }
    }
    _dashboard_cache = {"timestamp": now, "data": result}
    return result


@app.get("/api/market-regime")
def api_get_market_regime():
    try:
        from services.market_regime_service import market_regime_service
        all_prices = price_service.prices if price_service else {}
        return market_regime_service.get_current_regime(all_prices=all_prices)
    except Exception as e:
        return {"error": str(e), "regime": "NEUTRAL", "exposure_multiplier": 1.0, "color": "#C9883A"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8015)


