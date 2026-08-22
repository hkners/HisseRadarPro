"""
Stocks Router
Handles /api/stocks, /api/stocks/{ticker}, /api/stocks/{ticker}/fundamentals, /api/stocks/{ticker}/history
"""
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api", tags=["stocks"])


def _get_deps():
    """Lazy import to avoid circular dependencies at module load time."""
    from main import get_cached_recommendations
    from globals import price_service, BIST_TICKERS, report_repo
    from services.ticker_resolver import match_ticker
    return get_cached_recommendations, price_service, BIST_TICKERS, match_ticker, report_repo


@router.get("/stocks")
def get_all_stocks():
    get_cached_recommendations, price_service, BIST_TICKERS, match_ticker, report_repo = _get_deps()

    recs_grouped = {}
    recs_data = get_cached_recommendations()
    for r in recs_data:
        ticker = match_ticker(r.get("hisse", ""), BIST_TICKERS)
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

    all_prices = price_service.prices
    stocks = []
    for t, p_data in all_prices.items():
        if p_data:
            rec_data = recs_grouped.get(t, {"targets": [], "brokers": set()})
            avg_target = sum(rec_data["targets"]) / len(rec_data["targets"]) if rec_data["targets"] else 0.0
            live_price = p_data.get("price")
            upside = 0.0
            if live_price and live_price > 0 and avg_target > 0:
                upside = ((avg_target - live_price) / live_price) * 100

            stocks.append({
                "ticker": t,
                "name": f"{t} A.Ş.",
                "price": live_price,
                "change_pct": p_data.get("change_pct"),
                "volume": p_data.get("volume"),
                "rec_count": len(rec_data["brokers"]),
                "avg_potential": upside,
                "brokerages": list(rec_data["brokers"]),
            })
    return {
        "status": price_service.status,
        "last_updated": price_service.last_updated,
        "stocks": stocks,
    }


@router.get("/stocks/{ticker}")
def get_stock_detail(ticker: str):
    _, price_service, _, _, _ = _get_deps()
    ticker = ticker.replace(".IS", "").upper()
    p_data = price_service.get_price(ticker)
    return {
        "ticker": ticker,
        "price": p_data.get("price") if isinstance(p_data, dict) else None,
        "change_pct": p_data.get("change_pct") if isinstance(p_data, dict) else None,
        "currency": "TRY",
        "last_updated": price_service.last_updated,
    }


@router.get("/stocks/{ticker}/fundamentals")
def get_stock_fundamentals(ticker: str):
    """Returns company info and fundamental indicators for a ticker."""
    get_cached_recommendations, price_service, BIST_TICKERS, match_ticker, report_repo = _get_deps()
    info = report_repo.get_company_info(ticker)
    if not info:
        raise HTTPException(status_code=404, detail=f"Fundamentals for {ticker} not found in cache. Run yf_cacher.")
    return info


@router.get("/stocks/{ticker}/history")
def get_stock_history(ticker: str):
    """Returns 1-year historical prices for a ticker."""
    get_cached_recommendations, price_service, BIST_TICKERS, match_ticker, report_repo = _get_deps()
    history = report_repo.get_historical_prices(ticker)
    if not history:
        raise HTTPException(status_code=404, detail=f"Historical prices for {ticker} not found in cache. Run yf_cacher.")
    return history
