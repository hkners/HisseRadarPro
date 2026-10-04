"""
Stocks Router
Handles /api/stocks, /api/stocks/{ticker}, /api/stocks/{ticker}/fundamentals, /api/stocks/{ticker}/history
"""
from fastapi import APIRouter, HTTPException
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
    Returns granular pillar breakdown of the Conviction Engine score (institutional, valuation,
    technicals, mechanics, momentum) alongside score_history snapshot and Alpha Engine comparison.
    """
    clean_ticker = ticker.replace(".IS", "").upper().strip()

    # 1. Fetch live conviction setup
    from services.conviction_engine import conviction_engine
    setup = conviction_engine.get_stock_setup(clean_ticker)

    # If not in cache, fallback to evaluate on-demand
    if not setup:
        try:
            from globals import report_repo, price_service
            import datetime
            spot = price_service.get_price(clean_ticker)
            p = spot.get("price", 0.0) if isinstance(spot, dict) else 0.0
            if p > 0:
                recs = report_repo.get_reports(ticker=clean_ticker) or []
                info = report_repo.get_company_info(clean_ticker) or {}
                fund = info.get("fundamentals", {})
                ta = info.get("technical_analysis", {})
                hist = report_repo.get_historical_prices(clean_ticker, limit=60) or []
                setup = conviction_engine._evaluate_stock(
                    ticker=clean_ticker,
                    live_price=p,
                    change_pct=spot.get("change_pct", 0.0),
                    volume=spot.get("volume", 0),
                    recs=recs,
                    fundamentals=fund,
                    ta_data=ta,
                    history=hist,
                    today=datetime.date.today()
                )
        except Exception:
            pass

    # 2. Fetch latest record from score_history for comparison/fallback
    from globals import report_repo
    history_row = None
    try:
        with report_repo._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT snapshot_date, conviction_score, alpha_score, 
                       technical_component, fundamental_component, sentiment_component, 
                       consensus_component, revision_momentum, price_momentum_percentile
                FROM score_history 
                WHERE UPPER(TRIM(ticker)) = ? 
                ORDER BY snapshot_date DESC, id DESC LIMIT 1
            """, (clean_ticker,))
            r = cursor.fetchone()
            if r:
                history_row = {
                    "snapshot_date": r[0],
                    "conviction_score": r[1],
                    "alpha_score": r[2],
                    "technical_component": r[3],
                    "fundamental_component": r[4],
                    "sentiment_component": r[5],
                    "consensus_component": r[6],
                    "revision_momentum": r[7],
                    "price_momentum_percentile": r[8]
                }
    except Exception:
        pass

    # 3. Fetch Alpha Engine score & signal for comparison
    alpha_info = None
    try:
        from services.alpha_engine import alpha_engine
        screener = alpha_engine.get_alpha_screener()
        matched = next((s for s in screener if s.get("ticker") == clean_ticker), None)
        if matched:
            alpha_info = {
                "alpha_score": round(float(matched.get("alpha_score", 0.0)), 1),
                "signal": matched.get("signal"),
                "ta_score": round(float(matched.get("ta_score", 0.0)), 1),
                "fa_score": round(float(matched.get("fa_score", 0.0)), 1),
                "sentiment_score": round(float(matched.get("sentiment_score", 0.0)), 1)
            }
    except Exception:
        pass

    # If setup is still None, create default fallback
    if not setup:
        conv_score = history_row.get("conviction_score", 50) if history_row else 50
        setup = {
            "score": int(conv_score),
            "raw_score": float(conv_score),
            "decision": "BEKLE / İZLE",
            "decision_badge": "HOLD",
            "color": "#C9883A",
            "institutional_pillar": history_row.get("consensus_component", 0.0) if history_row else 0.0,
            "valuation_pillar": history_row.get("fundamental_component", 0.0) if history_row else 0.0,
            "technical_pillar": history_row.get("technical_component", 0.0) if history_row else 0.0,
            "mechanics_pillar": 0.0,
            "momentum_pillar": 0.0,
            "revision_momentum": history_row.get("revision_momentum", 0.0) if history_row else 0.0,
            "price_momentum_percentile": history_row.get("price_momentum_percentile", 50.0) if history_row else 50.0,
            "drivers": ["Veri yetersizliğinden dolayı temkinli yaklaşım."],
            "risk_statement": "Yeterli konsensüs bulunmuyor."
        }

    # Extract pillars
    inst_val = float(setup.get("institutional_pillar") or 0.0)
    val_val = float(setup.get("valuation_pillar") or 0.0)
    tech_val = float(setup.get("technical_pillar") or 0.0)
    mech_val = float(setup.get("mechanics_pillar") or 0.0)
    mom_val = float(setup.get("momentum_pillar") or 0.0)

    # Calculate normalized 0-100 percentage for UI progress bars (matching Alpha Insights style)
    # Institutional: 0 to 26 pt -> (val / 26) * 100
    inst_pct = max(0.0, min(100.0, (inst_val / 26.0) * 100.0))
    # Valuation: -20 to 32 pt (span 52) -> (val - (-20)) / 52 * 100
    val_pct = max(0.0, min(100.0, ((val_val + 20.0) / 52.0) * 100.0))
    # Technical: -30 to 20 pt (span 50) -> (val - (-30)) / 50 * 100
    tech_pct = max(0.0, min(100.0, ((tech_val + 30.0) / 50.0) * 100.0))
    # Mechanics: -5 to 12 pt (span 17) -> (val - (-5)) / 17 * 100
    mech_pct = max(0.0, min(100.0, ((mech_val + 5.0) / 17.0) * 100.0))
    # Momentum: -2.5 to 8.0 pt (span 10.5) -> (val - (-2.5)) / 10.5 * 100
    mom_pct = max(0.0, min(100.0, ((mom_val + 2.5) / 10.5) * 100.0))

    components = [
        {
            "key": "institutional",
            "name": "Kurumsal Konsensüs & Kapsam",
            "points": round(inst_val, 1),
            "max_points": 26.0,
            "min_points": 0.0,
            "percentage": round(inst_pct, 1),
            "details": f"{setup.get('broker_count', 0)} aracı kurum takibi, {setup.get('model_count', 0)} model portföy girişi"
        },
        {
            "key": "valuation",
            "name": "Değerleme & Reel Getiri Potansiyeli",
            "points": round(val_val, 1),
            "max_points": 32.0,
            "min_points": -20.0,
            "percentage": round(val_pct, 1),
            "details": f"Enflasyon üzeri potansiyel (%{setup.get('upside_pct', 0):.1f}) ve göreceli çarpanlar"
        },
        {
            "key": "technical",
            "name": "Teknik Trend & İndikatörler (TV)",
            "points": round(tech_val, 1),
            "max_points": 20.0,
            "min_points": -30.0,
            "percentage": round(tech_pct, 1),
            "details": f"TradingView skoru ({setup.get('ta_rec')}), SMA20/50 ve RSI ({setup.get('rsi')})"
        },
        {
            "key": "mechanics",
            "name": "İşlem Mekaniği & Rapor Tazeliği",
            "points": round(mech_val, 1),
            "max_points": 12.0,
            "min_points": -5.0,
            "percentage": round(mech_pct, 1),
            "details": f"Risk/Ödül 1:{setup.get('risk_reward', 1.0):.1f} ve son 100 gündeki {setup.get('recent_reports_count', 0)} güncel rapor"
        },
        {
            "key": "momentum",
            "name": "Fiyat Momentumu & Hedef Revizyonu",
            "points": round(mom_val, 1),
            "max_points": 8.0,
            "min_points": -2.5,
            "percentage": round(mom_pct, 1),
            "details": f"BIST kesitsel momentum (%{setup.get('price_momentum_percentile', 0):.1f}) ve kurum revizyonu (%{int(setup.get('revision_momentum', 0) * 100)})"
        }
    ]

    # Evaluate disagreement between Conviction and Alpha engines
    c_dec = (setup.get("decision") or "").upper()
    c_cat = "AL" if ("AL" in c_dec and "SAT" not in c_dec) else ("SAT" if ("SAT" in c_dec or "RİSKLİ" in c_dec or "RISKLI" in c_dec) else "NOTR")

    a_sig = ((alpha_info.get("signal") if alpha_info else None) or "").upper()
    a_cat = "AL" if ("AL" in a_sig and "SAT" not in a_sig) else ("SAT" if "SAT" in a_sig else "NOTR")

    is_disagreeing = False
    disagreement_level = "NONE"
    disagreement_badge = None
    disagreement_reason = None

    if (c_cat == "AL" and a_cat in ("NOTR", "SAT")) or (a_cat == "AL" and c_cat in ("NOTR", "SAT")):
        is_disagreeing = True
        alpha_scr = alpha_info.get("alpha_score", "-") if alpha_info else "-"
        alpha_sgn = alpha_info.get("signal", "-") if alpha_info else "-"
        if (c_cat == "AL" and a_cat == "SAT") or (c_cat == "SAT" and a_cat == "AL"):
            disagreement_level = "STRONG"
            disagreement_badge = "İki motor zıt görüşte"
            disagreement_reason = f"Karar Motoru: {setup.get('score')}p ({setup.get('decision')}) vs Alpha Motoru: {alpha_scr}p ({alpha_sgn})"
        else:
            disagreement_level = "MILD"
            disagreement_badge = "İki motor farklı görüşte"
            disagreement_reason = f"Karar Motoru: {setup.get('score')}p ({setup.get('decision')}) vs Alpha Motoru: {alpha_scr}p ({alpha_sgn})"

    return {
        "ticker": clean_ticker,
        "score": setup.get("score"),
        "raw_score": setup.get("raw_score"),
        "decision": setup.get("decision"),
        "decision_badge": setup.get("decision_badge"),
        "decision_color": setup.get("color"),
        "base_points": 2.0,
        "components": components,
        "drivers": setup.get("drivers", []),
        "risk_statement": setup.get("risk_statement"),
        "entry_zone": setup.get("entry_zone"),
        "stop_loss": setup.get("stop_loss"),
        "stop_loss_pct": setup.get("stop_loss_pct"),
        "risk_reward": setup.get("risk_reward"),
        "consensus_target": setup.get("consensus_target"),
        "upside_pct": setup.get("upside_pct"),
        "history_snapshot": history_row,
        "alpha_engine": alpha_info,
        "disagreement": {
            "is_disagreeing": is_disagreeing,
            "level": disagreement_level,
            "badge": disagreement_badge,
            "reason": disagreement_reason,
            "conviction_category": c_cat,
            "alpha_category": a_cat
        }
    }

