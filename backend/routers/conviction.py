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
    try:
        from services.alpha_engine import alpha_engine
        screener = alpha_engine.get_alpha_screener()
        clean_t = ticker.replace(".IS", "").upper().strip()
        a_row = next((x for x in screener if x["ticker"] == clean_t), None)
        if a_row:
            a_score = a_row.get("alpha_score", 50.0)
            a_sig = a_row.get("signal", "NÖTR")
            c_dec = setup.get("decision", "NÖTR")
            c_score = setup.get("score", 50.0)

            is_al_c = any(k in c_dec.upper() for k in ["AL", "GÜÇLÜ AL", "BUY"])
            is_sat_c = any(k in c_dec.upper() for k in ["SAT", "SELL"])
            is_al_a = any(k in a_sig.upper() for k in ["AL", "GÜÇLÜ AL", "BUY"])
            is_sat_a = any(k in a_sig.upper() for k in ["SAT", "SELL"])

            is_disagreeing = False
            reason = ""
            if (is_al_c and (is_sat_a or "NÖTR" in a_sig.upper())) or (is_al_a and (is_sat_c or "NÖTR" in c_dec.upper() or "BEKLE" in c_dec.upper())):
                is_disagreeing = True
                reason = f"Alpha Motoru ({a_score:.0f}p, {a_sig}) ile Karar Skoru ({c_score:.0f}p, {c_dec}) zıt yönlü sinyal üretiyor."

            setup["alpha_score"] = round(a_score, 1)
            setup["alpha_signal"] = a_sig
            setup["is_disagreeing"] = is_disagreeing
            setup["disagreement_badge"] = "⚠ Ayrışma" if is_disagreeing else None
            setup["disagreement_reason"] = reason
    except Exception:
        pass
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
        "color": "#ffab00",
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
    """Returns all scored stocks with decision badges, scores, and Alpha Engine disagreement indicators."""
    stocks = conviction_engine.get_all_scored_stocks()
    try:
        from services.alpha_engine import alpha_engine
        screener = alpha_engine.get_alpha_screener()
        a_map = {s["ticker"]: s for s in screener}
        enriched = []
        for s in stocks:
            item = dict(s)
            t = item.get("ticker")
            a_item = a_map.get(t)
            if a_item:
                a_score = round(float(a_item.get("alpha_score", 0.0)), 1)
                a_signal = a_item.get("signal", "NÖTR")
                item["alpha_score"] = a_score
                item["alpha_signal"] = a_signal

                c_dec = (item.get("decision") or "").upper()
                c_cat = "AL" if ("AL" in c_dec and "SAT" not in c_dec) else ("SAT" if ("SAT" in c_dec or "RİSKLİ" in c_dec or "RISKLI" in c_dec) else "NOTR")
                a_sig = (a_signal or "").upper()
                a_cat = "AL" if ("AL" in a_sig and "SAT" not in a_sig) else ("SAT" if "SAT" in a_sig else "NOTR")

                if (c_cat == "AL" and a_cat in ("NOTR", "SAT")) or (a_cat == "AL" and c_cat in ("NOTR", "SAT")):
                    item["is_disagreeing"] = True
                    item["disagreement_badge"] = "⚠ İki motor farklı görüşte"
                    item["disagreement_reason"] = f"Karar Motoru: {item.get('score')}p ({item.get('decision')}) vs Alpha Motoru: {a_score}p ({a_signal})"
                else:
                    item["is_disagreeing"] = False
                    item["disagreement_badge"] = None
                    item["disagreement_reason"] = None
            else:
                item["alpha_score"] = None
                item["alpha_signal"] = None
                item["is_disagreeing"] = False
                item["disagreement_badge"] = None
                item["disagreement_reason"] = None
            enriched.append(item)
        return enriched
    except Exception:
        return stocks


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
