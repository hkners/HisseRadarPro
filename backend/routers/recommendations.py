"""
Recommendations Router
Handles /api/recommendations, /api/kurum-stats, /api/kurum/{name}, /api/screener, /api/models
"""
import re
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter

from services.ticker_resolver import parse_rating

router = APIRouter(prefix="/api", tags=["recommendations"])


def _get_deps():
    """Lazy import to avoid circular dependencies."""
    from main import get_cached_recommendations, get_cached_models
    from globals import price_service, BIST_TICKERS
    from services.ticker_resolver import match_ticker
    return get_cached_recommendations, get_cached_models, price_service, BIST_TICKERS, match_ticker


@router.get("/recommendations")
def get_all_recommendations():
    get_cached_recommendations, *_ = _get_deps()
    return get_cached_recommendations()


@router.get("/recommendations/latest")
def get_latest_recommendations():
    get_cached_recommendations, _, price_service, BIST_TICKERS, match_ticker = _get_deps()
    all_recs = get_cached_recommendations()
    latest = []
    for r in all_recs[:20]:
        ticker = match_ticker(r.get("hisse", ""), BIST_TICKERS)
        if ticker:
            r["ticker"] = ticker
            latest.append(r)
        if len(latest) >= 5:
            break
    return latest


@router.get("/recommendations/{ticker}")
def get_stock_recommendations(ticker: str):
    get_cached_recommendations, _, _, BIST_TICKERS, match_ticker = _get_deps()
    matched = []
    target_ticker = ticker.upper()
    for r in get_cached_recommendations():
        mapped = match_ticker(r.get("hisse", ""), BIST_TICKERS)
        if mapped == target_ticker:
            matched.append(r)
    return matched


@router.get("/models")
def get_model_portfolios():
    get_cached_recommendations, get_cached_models, *_ = _get_deps()
    # ONLY return Fintables dynamic models, ignore static json models
    models = []
    
    recs = get_cached_recommendations()
    dynamic_groups = {}
    for r in recs:
        if r.get("is_model"):
            kurum = r.get("kurum", "Bilinmeyen")
            if kurum not in dynamic_groups:
                dynamic_groups[kurum] = []
            dynamic_groups[kurum].append(r)
            
    for kurum, stocks in dynamic_groups.items():
        # Sort stocks by date descending
        stocks.sort(key=lambda x: x.get("tarih", ""), reverse=True)
        models.append({
            "id": f"dynamic_{kurum.replace(' ', '_').lower()}",
            "kurum": kurum,
            "tarih": "Canlı Güncel",
            "title": f"{kurum} Model Portföyü (Fintables)",
            "is_dynamic": True,
            "stocks": stocks
        })
        
    return models


@router.get("/kurum-stats")
def get_kurum_stats():
    get_cached_recommendations, _, price_service, BIST_TICKERS, match_ticker = _get_deps()
    stats = {}
    data = get_cached_recommendations()
    all_prices = price_service.prices  # Single snapshot — one lock acquire

    latest_reports = {}
    for r in data:
        ticker = match_ticker(r.get("hisse", ""), BIST_TICKERS)
        if not ticker:
            continue
        broker = r.get("kurum", "Bilinmiyor").strip()
        broker = re.sub(r'\s+', ' ', broker).strip()
        date_str = str(r.get("tarih", ""))
        key = (ticker, broker)
        if key not in latest_reports or date_str > str(latest_reports[key].get("tarih", "")):
            # Ensure the normalized broker name is stored
            r["kurum_normalized"] = broker
            latest_reports[key] = r

    unique_reports = list(latest_reports.values())

    for r in unique_reports:
        k = r.get("kurum_normalized", "Bilinmiyor")
        if k not in stats:
            stats[k] = {
                "count": 0,
                "pot_count": 0,
                "sum_potential": 0.0,
                "sum_realized": 0.0,
                "realized_count": 0,
                "ratings": {"AL": 0, "TUT": 0, "SAT": 0, "OTHER": 0},
            }
        stats[k]["count"] += 1

        pot_val = r.get("potansiyel", 0)
        try:
            pot_num = float(pot_val)
            if pot_num != 0.0 and pot_num <= 500:
                stats[k]["sum_potential"] += pot_num
                stats[k]["pot_count"] += 1
        except (ValueError, TypeError):
            pass

        rating = parse_rating(str(r.get("tavsiye", "Bilinmiyor")))
        stats[k]["ratings"][rating] += 1

        ticker = match_ticker(r.get("hisse", ""), BIST_TICKERS)
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
                        stats[k]["sum_realized"] += realized
                        stats[k]["realized_count"] += 1
            except (ValueError, TypeError):
                pass

    kurum_stats = []
    for k, v in stats.items():
        avg = v["sum_potential"] / v["count"] if v["count"] > 0 else 0
        avg_realized = v["sum_realized"] / v["realized_count"] if v["realized_count"] > 0 else None
        
        kurum_stats.append({
            "kurum": k,
            "count": v["count"],
            "avg_potential": avg,
            "avg_realized": avg_realized,
            "ratings": v["ratings"],
        })

    return sorted(kurum_stats, key=lambda x: x["count"], reverse=True)


@router.get("/kurum/{kurumName}")
def get_kurum_detail(kurumName: str):
    get_cached_recommendations, _, price_service, BIST_TICKERS, match_ticker = _get_deps()
    matched = []
    data = get_cached_recommendations()
    all_prices = price_service.prices  # Single snapshot
    for r in data:
        k = r.get("kurum", "")
        k_normalized = re.sub(r'\s+', '-', k.strip()).lower()
        if k_normalized == kurumName.lower():
            ticker = match_ticker(r.get("hisse", ""), BIST_TICKERS)
            r["ticker"] = ticker
            if ticker:
                p_data = all_prices.get(ticker, {})
                r["live_price"] = p_data.get("price") if isinstance(p_data, dict) else None
                r["live_change_pct"] = p_data.get("change_pct") if isinstance(p_data, dict) else None
            else:
                r["live_price"] = None
                r["live_change_pct"] = None
            matched.append(r)
    return matched


@router.get("/screener")
def get_screener_data(days: Optional[int] = None):
    from globals import report_repo
    get_cached_recommendations, _, price_service, BIST_TICKERS, match_ticker = _get_deps()
    reports = get_cached_recommendations()

    latest_reports = {}
    for r in reports:
        ticker = match_ticker(r.get("hisse", ""), BIST_TICKERS)
        if not ticker:
            continue
        broker = r.get("kurum", "").strip()
        date_str = str(r.get("tarih", ""))
        key = (ticker, broker)
        if key not in latest_reports or date_str > str(latest_reports[key].get("tarih", "")):
            latest_reports[key] = r

    unique_reports = list(latest_reports.values())
    if days is not None and days > 0:
        cutoff_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        unique_reports = [r for r in unique_reports if str(r.get("tarih", "")) >= cutoff_date]

    grouped = {}
    for r in unique_reports:
        ticker = match_ticker(r.get("hisse", ""), BIST_TICKERS)
        if not ticker:
            continue

        if ticker not in grouped:
            grouped[ticker] = {
                "targets": [],
                "count": 0,
                "company": r.get("hisse", ""),
                "is_model": False,
                "ratings": {"AL": 0, "TUT": 0, "SAT": 0, "OTHER": 0},
            }

        grouped[ticker]["count"] += 1
        if r.get("is_model"):
            grouped[ticker]["is_model"] = True

        target = r.get("hedefFiyat")
        try:
            target_val = float(str(target).replace(",", "."))
            if target_val > 0.0:
                grouped[ticker]["targets"].append(target_val)
        except (ValueError, TypeError):
            pass

        rating = parse_rating(str(r.get("tavsiye", r.get("oneri", ""))))
        grouped[ticker]["ratings"][rating] += 1

    results = []
    # Single snapshot — one lock acquire instead of N
    all_prices = price_service.prices
    # Batch load all company info — one DB query instead of N
    all_company_info = report_repo.get_all_company_info()
    
    for ticker, data in grouped.items():
        p_data = all_prices.get(ticker, {})
        live_price = p_data.get("price", 0.0) if isinstance(p_data, dict) else 0.0
        live_change_pct = p_data.get("change_pct", 0.0) if isinstance(p_data, dict) else 0.0

        if not data["targets"]:
            avg_target = None
            upside = None
        else:
            avg_target = sum(data["targets"]) / len(data["targets"])
            if live_price and live_price > 0:
                upside = ((avg_target - live_price) / live_price) * 100
            else:
                upside = 0.0

        if upside is not None and upside > 500:
            continue

        # Use batch-loaded company info instead of per-ticker DB query
        info = all_company_info.get(ticker)
        fund = info.get("fundamentals", {}) if info else {}

        results.append({
            "ticker": ticker,
            "company": data["company"],
            "avg_target": round(avg_target, 2) if avg_target is not None else "N/A",
            "current_price": live_price if live_price else "N/A",
            "live_change_pct": live_change_pct,
            "upside_potential": upside if upside is not None else "N/A",
            "count": data["count"],
            "is_model": data["is_model"],
            "ratings": data["ratings"],
            "fundamentals": {
                "pe_ratio": fund.get("trailingPE", "N/A"),
                "pb_ratio": fund.get("priceToBook", "N/A"),
                "dividend_yield": fund.get("dividendYield", "N/A"),
                "market_cap": fund.get("marketCap", "N/A"),
                "sector": info.get("sector", "N/A") if info else "N/A"
            }
        })

    def safe_sort_key(item):
        val = item.get("upside_potential")
        if val == "N/A" or val is None:
            return -9999.0
        try:
            return float(val)
        except (ValueError, TypeError):
            return -9999.0

    return sorted(results, key=safe_sort_key, reverse=True)
