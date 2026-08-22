"""
Recommendations Router
Handles /api/recommendations, /api/kurum-stats, /api/kurum/{name}, /api/screener, /api/models
"""
import re
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
    _, get_cached_models, *_ = _get_deps()
    return get_cached_models()


@router.get("/kurum-stats")
def get_kurum_stats():
    get_cached_recommendations, _, price_service, BIST_TICKERS, match_ticker = _get_deps()
    stats = {}
    data = get_cached_recommendations()
    for r in data:
        k = r.get("kurum", "Bilinmiyor")
        k = re.sub(r'\s+', ' ', k).strip()
        if k not in stats:
            stats[k] = {
                "count": 0,
                "sum_potential": 0.0,
                "sum_realized": 0.0,
                "realized_count": 0,
                "ratings": {"AL": 0, "TUT": 0, "SAT": 0, "OTHER": 0},
            }
        stats[k]["count"] += 1

        pot_val = r.get("potansiyel", "0")
        if pot_val and pot_val != "Bilinmiyor":
            try:
                pot_num = float(str(pot_val).replace(",", ".").replace("%", ""))
                if pot_num <= 500:
                    stats[k]["sum_potential"] += pot_num
            except (ValueError, TypeError):
                pass

        rating = parse_rating(str(pot_val))
        stats[k]["ratings"][rating] += 1

        ticker = match_ticker(r.get("hisse", ""), BIST_TICKERS)
        mevcut = r.get("mevcutFiyat", "0")
        if ticker and mevcut and mevcut != "Bilinmiyor":
            p_data = price_service.get_price(ticker)
            live_price = p_data.get("price", 0.0) if isinstance(p_data, dict) else 0.0
            try:
                mevcut_num = float(str(mevcut).replace(",", "."))
                if live_price > 0 and mevcut_num > 0:
                    realized = ((live_price - mevcut_num) / mevcut_num) * 100
                    if -100 <= realized <= 500:
                        stats[k]["sum_realized"] += realized
                        stats[k]["realized_count"] += 1
            except (ValueError, TypeError):
                pass

    result = []
    for k, v in stats.items():
        avg = v["sum_potential"] / v["count"] if v["count"] > 0 else 0
        avg_realized = v["sum_realized"] / v["realized_count"] if v["realized_count"] > 0 else None

        result.append({
            "kurum": k,
            "count": v["count"],
            "avg_potential": avg,
            "avg_realized": avg_realized,
            "ratings": v["ratings"],
        })

    return sorted(result, key=lambda x: x["count"], reverse=True)


@router.get("/kurum/{kurumName}")
def get_kurum_detail(kurumName: str):
    get_cached_recommendations, _, price_service, BIST_TICKERS, match_ticker = _get_deps()
    matched = []
    data = get_cached_recommendations()
    for r in data:
        k = r.get("kurum", "")
        k_normalized = re.sub(r'\s+', '-', k.strip()).lower()
        if k_normalized == kurumName.lower():
            ticker = match_ticker(r.get("hisse", ""), BIST_TICKERS)
            r["ticker"] = ticker
            if ticker:
                p_data = price_service.get_price(ticker)
                r["live_price"] = p_data.get("price") if isinstance(p_data, dict) else None
                r["live_change_pct"] = p_data.get("change_pct") if isinstance(p_data, dict) else None
            else:
                r["live_price"] = None
                r["live_change_pct"] = None
            matched.append(r)
    return matched


@router.get("/screener")
def get_screener_data():
    get_cached_recommendations, _, price_service, BIST_TICKERS, match_ticker = _get_deps()
    reports = get_cached_recommendations()

    grouped = {}
    for r in reports:
        ticker = match_ticker(r.get("hisse", ""), BIST_TICKERS)
        if not ticker:
            continue

        if ticker not in grouped:
            grouped[ticker] = {
                "targets": [],
                "count": 0,
                "company": r.get("hisse", ""),
                "ratings": {"AL": 0, "TUT": 0, "SAT": 0, "OTHER": 0},
            }

        grouped[ticker]["count"] += 1

        target = r.get("hedefFiyat")
        try:
            target_val = float(str(target).replace(",", "."))
            if target_val > 0.0:
                grouped[ticker]["targets"].append(target_val)
        except (ValueError, TypeError):
            pass

        rating = parse_rating(str(r.get("potansiyel", "")))
        grouped[ticker]["ratings"][rating] += 1

    results = []
    all_prices = price_service.prices
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

        results.append({
            "ticker": ticker,
            "company": data["company"],
            "avg_target": round(avg_target, 2) if avg_target is not None else "N/A",
            "current_price": live_price if live_price else "N/A",
            "live_change_pct": live_change_pct,
            "upside_potential": upside if upside is not None else "N/A",
            "count": data["count"],
            "ratings": data["ratings"],
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
