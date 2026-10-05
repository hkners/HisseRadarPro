"""
Stocks Router
Handles /api/stocks, /api/stocks/{ticker}, /api/stocks/{ticker}/fundamentals, /api/stocks/{ticker}/history
"""
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
import logging
import time

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["stocks"])


def _get_deps():
    """Lazy import to avoid circular dependencies at module load time."""
    from main import get_cached_recommendations
    from globals import price_service, BIST_TICKERS, report_repo
    from services.ticker_resolver import match_ticker
    return get_cached_recommendations, price_service, BIST_TICKERS, match_ticker, report_repo

_stocks_cache = {"timestamp": 0, "data": None}
_company_names = None


def _get_company_names():
    """Ticker -> legal name map from company_names.json (loaded once)."""
    global _company_names
    if _company_names is None:
        import json
        import os
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "company_names.json")
        try:
            with open(path, encoding="utf-8") as fh:
                raw = json.load(fh)
            # Entries that only repeat the ticker carry no information.
            _company_names = {t: n for t, n in raw.items() if n and n != t}
        except Exception as e:
            logger.warning(f"company_names.json could not be loaded: {e}")
            _company_names = {}
    return _company_names


@router.get("/stocks")
def get_all_stocks():
    global _stocks_cache
    now = time.time()
    if _stocks_cache["data"] and (now - _stocks_cache["timestamp"] < 30):
        return _stocks_cache["data"]

    get_cached_recommendations, price_service, BIST_TICKERS, match_ticker, report_repo = _get_deps()

    recs_data = get_cached_recommendations()
    latest_reports = {}
    for r in recs_data:
        ticker = match_ticker(r.get("hisse", ""), BIST_TICKERS)
        if not ticker:
            continue
        broker = r.get("kurum", "").strip()
        date_str = str(r.get("tarih", ""))
        key = (ticker, broker)
        if key not in latest_reports or date_str > str(latest_reports[key].get("tarih", "")):
            latest_reports[key] = r

    unique_reports = list(latest_reports.values())

    recs_grouped = {}
    for r in unique_reports:
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
    names = _get_company_names()
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
                "name": names.get(t, f"{t} A.Ş."),
                "price": live_price,
                "change_pct": p_data.get("change_pct"),
                "volume": p_data.get("volume"),
                "rec_count": len(rec_data["brokers"]),
                "avg_potential": upside,
                "brokerages": list(rec_data["brokers"]),
            })
    res = {
        "status": price_service.status,
        "last_updated": price_service.last_updated,
        "stocks": stocks,
    }
    _stocks_cache = {"timestamp": now, "data": res}
    return res


@router.get("/stocks/prices")
def get_stock_prices():
    """Returns price service snapshot with all live prices."""
    _, price_service, _, _, _ = _get_deps()
    return price_service.get_snapshot()


@router.get("/stocks/{ticker}")
def get_stock_detail(ticker: str):
    global _stocks_cache
    _, price_service, _, _, _ = _get_deps()
    ticker = ticker.replace(".IS", "").upper()
    
    # On-demand authoritative fast_info update (ensures live/closing-auction accuracy)
    p_data = price_service.update_ticker_from_fast_info(ticker)
    
    # Invalidate stocks list cache so /stocks immediately matches this exact price
    _stocks_cache = {"timestamp": 0, "data": None}

    live_price = p_data.get("price")
    return {
        "ticker": ticker,
        "price": live_price,
        "change_pct": p_data.get("change_pct"),
        "volume": p_data.get("volume"),
        "currency": "TRY",
        "last_updated": "Live" if live_price else price_service.last_updated,
    }


@router.get("/stocks/{ticker}/fundamentals")
def get_stock_fundamentals(ticker: str):
    """Returns company info and fundamental indicators for a ticker."""
    get_cached_recommendations, price_service, BIST_TICKERS, match_ticker, report_repo = _get_deps()
    info = report_repo.get_company_info(ticker)
    if not info:
        raise HTTPException(status_code=404, detail=f"Fundamentals for {ticker} not found in cache. Run yf_cacher.")
    return info


@router.get("/stocks/{ticker}/valuation")
def get_stock_valuation(ticker: str):
    """
    Football-field inputs: sector-peer implied price ranges (P/E, P/B),
    the 52-week band and the composite valuation score. Broker targets come from /recommendations.
    """
    from services.valuation_service import compute_peer_implied_values, compute_valuation_score
    _, price_service, _, _, report_repo = _get_deps()
    clean = ticker.replace(".IS", "").upper()

    info = report_repo.get_company_info(clean)
    if not info:
        raise HTTPException(status_code=404, detail=f"Fundamentals for {clean} not found in cache.")

    price = (price_service.prices.get(clean) or {}).get("price")
    f = info.get("fundamentals") or {}

    # Close on the day fundamentals were fetched: the price yfinance's P/B was computed against.
    book_price = None
    fund_date = str(info.get("last_updated") or "")[:10]
    if fund_date:
        try:
            with report_repo._get_connection() as conn:
                row = conn.execute(
                    "SELECT close FROM historical_prices WHERE ticker = ? AND date <= ? ORDER BY date DESC LIMIT 1",
                    (clean, fund_date),
                ).fetchone()
                book_price = row[0] if row else None
        except Exception as e:
            logger.warning(f"Book-price lookup failed for {clean}: {e}")

    result = compute_peer_implied_values(clean, price, repo=report_repo, book_price=book_price)
    result["price"] = price
    result["fundamentals_updated"] = info.get("last_updated")

    low, high = f.get("fiftyTwoWeekLow"), f.get("fiftyTwoWeekHigh")
    result["week52"] = {"low": low, "high": high} if low and high else None

    try:
        result["score"] = compute_valuation_score(clean, repo=report_repo, return_details=True)
    except Exception as e:
        logger.warning(f"Valuation score failed for {clean}: {e}")
        result["score"] = None
    return result


@router.get("/stocks/{ticker}/history")
def get_stock_history(ticker: str):
    """Returns 1-year historical prices for a ticker."""
    get_cached_recommendations, price_service, BIST_TICKERS, match_ticker, report_repo = _get_deps()
    history = report_repo.get_historical_prices(ticker)
    if not history:
        raise HTTPException(status_code=404, detail=f"Historical prices for {ticker} not found in cache. Run yf_cacher.")
    return history


@router.get("/stocks/{ticker}/technical-analysis")
def get_technical_analysis(ticker: str):
    """Fetches exact, live TradingView technical indicators and recommendation for a ticker."""
    get_cached_recommendations, price_service, BIST_TICKERS, match_ticker, report_repo = _get_deps()
    clean_ticker = ticker.replace(".IS", "").upper()

    # 1. First try live TradingView scanner fetch (with memory cache)
    try:
        from services.ta_sync import fetch_live_ta
        live_data = fetch_live_ta(clean_ticker)
        if live_data:
            return live_data
    except Exception as e:
        logger.warning(f"Live TradingView fetch failed for {clean_ticker}: {e}")

    # 2. Fallback to cached company_info in local database
    try:
        info = report_repo.get_company_info(clean_ticker)
        if info and info.get("technical_analysis"):
            return info["technical_analysis"]
    except Exception as e:
        logger.warning(f"DB TA fallback failed for {clean_ticker}: {e}")

    # 3. Final fallback: local ta_engine
    history = report_repo.get_historical_prices(clean_ticker)
    if not history:
        raise HTTPException(status_code=404, detail=f"No technical data found for {ticker}.")

    from services.ta_engine import calculate_technical_indicators
    ta_data = calculate_technical_indicators(history)
    if "error" in ta_data:
        raise HTTPException(status_code=400, detail=ta_data["error"])
    return ta_data

@router.get("/stocks/{ticker}/ai-analysis")
def get_ai_analysis(ticker: str):
    """Returns AI generated financial analysis for a ticker."""
    from services.ai_service import get_ai_financial_analysis
    
    ticker = ticker.replace(".IS", "").upper()
    analysis = get_ai_financial_analysis(ticker)
    
    if "error" in analysis:
        # If API key is missing or data is missing, return 400 but don't crash
        raise HTTPException(status_code=400, detail=analysis["message"])
        
    return analysis


@router.get("/stocks/{ticker}/score-breakdown")
def get_stock_score_breakdown(ticker: str):
    """
    HisseRadar score of one stock: the technical model's percentile, what pushed it up or down
    (approximate contributions grouped by theme), the active signals with their BIST evidence,
    the trade plan and the analyst/valuation context that is deliberately left out of the score.
    """
    clean_ticker = ticker.replace(".IS", "").upper().strip()
    from services.conviction_engine import conviction_engine
    setup = conviction_engine.get_stock_setup(clean_ticker)
    if not setup:
        from globals import report_repo, price_service
        import datetime
        spot = price_service.get_price(clean_ticker)
        price = spot.get("price") if isinstance(spot, dict) else None
        if not price:
            raise HTTPException(status_code=404, detail=f"{clean_ticker} için fiyat yok.")
        setup = conviction_engine._evaluate_stock(
            ticker=clean_ticker, live_price=price, change_pct=spot.get("change_pct") or 0.0,
            volume=spot.get("volume") or 0, recs=report_repo.get_reports(ticker=clean_ticker) or [],
            fundamentals={}, ta_data={}, history=[], today=datetime.date.today(),
        )
    keys = ("ticker", "score", "raw_score", "decision", "decision_badge", "decile", "expected_excess_20d", "stage",
            "stage_label", "template", "rs_rating", "liquid", "has_model", "groups", "drivers_pos", "drivers_neg",
            "signal_details", "drivers", "risk_statement", "entry_zone", "stop_loss", "stop_loss_pct", "risk_reward",
            "consensus_target", "upside_pct", "broker_count", "model_count", "revision_momentum",
            "latest_report_date", "valuation_score", "is_falling_knife", "model_version")
    out = {k: setup.get(k) for k in keys}
    out["decision_color"] = setup.get("color")
    try:
        from services import ta_lab
        lab = ta_lab.get_lab()
        if lab:
            out["deciles"] = lab["model"].get("deciles")
            out["model_as_of"] = lab.get("as_of")
    except Exception:
        pass
    return out


class ModelOverrides(BaseModel):
    overrides: Dict[str, Optional[float]] = {}


@router.get("/stocks/{ticker}/model")
def get_valuation_model(ticker: str):
    """Intrinsic value model (DCF for non-financials, justified P/B for financials) with sources and reverse model."""
    from services.dcf_service import build_model
    return build_model(ticker.replace(".IS", "").upper())


@router.post("/stocks/{ticker}/model")
def run_valuation_model(ticker: str, body: ModelOverrides):
    """Same model with user overrides ("Senin tezin"); returns base and thesis side by side."""
    from services.dcf_service import build_model
    clean = {k: v for k, v in (body.overrides or {}).items() if v is not None}
    return build_model(ticker.replace(".IS", "").upper(), clean or None)


@router.post("/stocks/{ticker}/model.xlsx")
def export_valuation_model(ticker: str, body: ModelOverrides):
    """Live Excel workbook of the model; uses the thesis inputs when overrides are given."""
    from services.dcf_service import build_model
    from services.excel_export import build_model_workbook
    t = ticker.replace(".IS", "").upper()
    clean = {k: v for k, v in (body.overrides or {}).items() if v is not None}
    m = build_model(t, clean or None)
    if not m.get("model_ok"):
        raise HTTPException(status_code=422, detail=m.get("model_note") or "Model kurulamadı.")
    data = build_model_workbook(m, use_thesis=bool(clean))
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{t}-degerleme-modeli.xlsx"'},
    )
