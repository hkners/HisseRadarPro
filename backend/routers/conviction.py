"""
HisseRadarPro — Conviction & Action Decision Router
===================================================
Endpoints for:
- /api/conviction/dashboard (Market Regime, Top Conviction Buys, AI Snapshot)
- /api/conviction/stock/{ticker} (Trade Setup: Entry Zone, Target, Dynamic Stop, R:R)
- /api/conviction/all (All scored stocks with decision badges)
- /api/conviction/ai-thesis/{ticker} (3 Bull vs 2 Bear points)
- /api/conviction/portfolio-audit (AI Portfolio Doctor)
- /api/models/all-stars (Consensus All-Star Model Portfolio)
"""

from typing import Any, Dict, List
from fastapi import APIRouter, Body
from services.conviction_engine import conviction_engine
from services.ai_service import (
    get_ai_stock_thesis,
    get_ai_market_pulse_summary,
    get_ai_portfolio_audit,
)

router = APIRouter(prefix="/api", tags=["conviction"])


@router.get("/conviction/dashboard")
def get_conviction_dashboard():
    """Returns the market regime, top high-conviction buys, strategies, and AI market take."""
    summary = conviction_engine.get_dashboard_summary()
    ai_pulse = get_ai_market_pulse_summary()
    return {
        **summary,
        "ai_market_pulse": ai_pulse.get("summary", ""),
    }


@router.post("/conviction/recompute")
def trigger_conviction_recompute():
    """Trigger full recomputation of conviction engine setups."""
    conviction_engine.recompute()
    return {
        "status": "ok",
        "scored_count": len(conviction_engine._cached_results),
        "top_buys_count": len(conviction_engine._cached_top_buys),
        "last_updated": conviction_engine._last_updated.isoformat() if conviction_engine._last_updated else None
    }


def _enrich_setup_with_alpha(setup: Dict[str, Any], ticker: str) -> Dict[str, Any]:
    """Kept for callers: there is a single score now, so nothing to compare against."""
    return setup


@router.get("/conviction/stock/{ticker}")
def get_conviction_stock_setup(ticker: str):
    """Returns dynamic entry, target, stop-loss, R:R, and 3 key reasons for a stock."""
    setup = conviction_engine.get_stock_setup(ticker)
    if setup:
        return _enrich_setup_with_alpha(setup, ticker)

    # On-demand single stock evaluation if not already in cache
    try:
        from globals import report_repo, price_service
        import datetime
        clean_t = ticker.replace(".IS", "").upper().strip()
        spot = price_service.get_price(clean_t)
        p = spot.get("price", 0.0) if isinstance(spot, dict) else 0.0
        
        if p > 0:
            recs = report_repo.get_reports(ticker=clean_t) or []
            info = report_repo.get_company_info(clean_t) or {}
            fund = info.get("fundamentals", {})
            ta = info.get("technical_analysis", {})
            hist = report_repo.get_historical_prices(clean_t, limit=60) or []
            single_setup = conviction_engine._evaluate_stock(
                ticker=clean_t,
                live_price=p,
                change_pct=spot.get("change_pct", 0.0),
                volume=spot.get("volume", 0),
                recs=recs,
                fundamentals=fund,
                ta_data=ta,
                history=hist,
                today=datetime.date.today()
            )
            if single_setup:
                return _enrich_setup_with_alpha(single_setup, ticker)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"On-demand conviction eval error for {ticker}: {e}")

    # Fallback minimal response if ticker has no prices at all
    from globals import price_service
    spot = price_service.get_price(ticker)
    p = spot.get("price", 0.0) if isinstance(spot, dict) else 0.0
    fallback = {
        "ticker": ticker.upper(),
        "price": p,
        "decision": "BEKLE / İZLE",
        "decision_badge": "HOLD",
        "score": 50.0,
        "color": "#C9883A",
        "drivers": ["Yeterli aracı kurum konsensüsü bekleniyor."],
        "risk_statement": "Veri yetersizliğinden dolayı temkinli olunmalı.",
        "entry_zone": {"low": round(p * 0.98, 2), "high": round(p * 1.01, 2)},
        "stop_loss": round(p * 0.94, 2),
        "stop_loss_pct": 6.0,
        "risk_reward": 1.0,
    }
    return _enrich_setup_with_alpha(fallback, ticker)


@router.get("/conviction/all")
def get_all_conviction_stocks():
    """All stocks with the HisseRadar score and decision."""
    return conviction_engine.get_all_scored_stocks()


@router.get("/conviction/ai-thesis/{ticker}")
def get_stock_ai_thesis(ticker: str):
    """Returns token-optimized 3 Bull vs 2 Bear thesis bullets."""
    return get_ai_stock_thesis(ticker)


@router.post("/conviction/portfolio-audit")
def post_portfolio_audit(holdings: List[Dict[str, Any]] = Body(...)):
    """Provides actionable portfolio evaluation, weighted upside, and risk alerts."""
    return get_ai_portfolio_audit(holdings)


@router.get("/models/all-stars")
def get_all_star_models():
    """Returns stocks present in multiple institutional model portfolios."""
    all_scored = conviction_engine.get_all_scored_stocks()
    all_stars = [s for s in all_scored if s.get("model_count", 0) >= 2]
    all_stars.sort(key=lambda x: (x["model_count"], x["score"]), reverse=True)
    return all_stars
