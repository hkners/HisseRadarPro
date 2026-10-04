"""
HisseRadarPro — Screener Universe
=================================
One flat row per BIST ticker combining everything the unified screener filters on:
descriptive (sector, market cap, price, turnover), fundamental (P/E, P/B, dividend, ROE),
broker consensus (target, upside, broker count, model-portfolio membership),
technical (1/3/6/12-month returns, distance to 52w high, SMA200, RSI14, 30d volatility)
and the conviction engine's decision score. Built in one pass and cached for 5 minutes.
"""

import logging
import math
import re
import threading
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_CACHE_TTL = 300
_cache: Dict[str, Any] = {"time": 0.0, "rows": None}
_lock = threading.Lock()

# Trading-day offsets used for period returns.
_PERIODS = {"r1m": 21, "r3m": 63, "r6m": 126, "r1y": 252}


def _num(v) -> Optional[float]:
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def _rsi(closes: List[float], period: int = 14) -> Optional[float]:
    """Wilder's RSI on daily closes."""
    if len(closes) <= period:
        return None
    gains, losses = 0.0, 0.0
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        gains += max(d, 0.0)
        losses += max(-d, 0.0)
    avg_g, avg_l = gains / period, losses / period
    for i in range(period + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        avg_g = (avg_g * (period - 1) + max(d, 0.0)) / period
        avg_l = (avg_l * (period - 1) + max(-d, 0.0)) / period
    if avg_l == 0:
        return 100.0
    rs = avg_g / avg_l
    return 100.0 - 100.0 / (1.0 + rs)


def _price_stats(series: List[tuple], live_price: Optional[float]) -> Dict[str, Any]:
    """series: [(close, volume), ...] oldest → newest."""
    closes = [c for c, _ in series if c and c > 0]
    out: Dict[str, Any] = {k: None for k in (*_PERIODS, "dist_52w_high", "sma200_dist", "rsi14", "vol30", "turnover20")}
    if len(closes) < 2:
        return out
    last = live_price if live_price and live_price > 0 else closes[-1]

    for key, n in _PERIODS.items():
        if len(closes) > n:
            base = closes[-1 - n]
            out[key] = (last / base - 1.0) * 100.0 if base > 0 else None

    window = closes[-252:]
    hi = max(window + [last])
    out["dist_52w_high"] = (last / hi - 1.0) * 100.0 if hi > 0 else None

    if len(closes) >= 200:
        sma200 = sum(closes[-200:]) / 200.0
        out["sma200_dist"] = (last / sma200 - 1.0) * 100.0 if sma200 > 0 else None

    out["rsi14"] = _rsi(closes[-120:] + [last] if live_price else closes[-120:])

    if len(closes) >= 31:
        rets = [math.log(closes[i] / closes[i - 1]) for i in range(len(closes) - 30, len(closes)) if closes[i - 1] > 0]
        if len(rets) > 5:
            mean = sum(rets) / len(rets)
            var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
            out["vol30"] = math.sqrt(var) * math.sqrt(252) * 100.0

    tail = [(c, v) for c, v in series[-20:] if c and v]
    if tail:
        out["turnover20"] = sum(c * v for c, v in tail) / len(tail)
    return out


def _broker_consensus(recs: List[Dict[str, Any]], match_ticker, bist_tickers) -> Dict[str, Dict[str, Any]]:
    """Latest report per (ticker, broker) → target mean, broker count, model membership."""
    latest: Dict[tuple, Dict[str, Any]] = {}
    for r in recs:
        t = match_ticker(r.get("hisse", ""), bist_tickers)
        if not t:
            continue
        broker = re.sub(r"\s+", " ", str(r.get("kurum", ""))).strip()
        key = (t, broker)
        if key not in latest or str(r.get("tarih", "")) > str(latest[key].get("tarih", "")):
            latest[key] = r

    grouped: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"targets": [], "brokers": set(), "models": set(), "last_date": ""})
    for (t, broker), r in latest.items():
        g = grouped[t]
        g["brokers"].add(broker)
        if r.get("is_model"):
            g["models"].add(broker)
        tgt = _num(str(r.get("hedefFiyat", "")).replace(",", "."))
        if tgt and tgt > 0:
            g["targets"].append(tgt)
        g["last_date"] = max(g["last_date"], str(r.get("tarih", "")))
    return grouped


# Bounds beyond which a yfinance value is almost certainly bad data (e.g. thinly traded
# privileged share classes reporting multi-trillion market caps). Such values are blanked
# and flagged instead of silently topping sorted lists.
_SANITY_BOUNDS = {"market_cap": 4e12, "pb": 200.0, "pe": 2000.0}


def _sanitize(row: Dict[str, Any]) -> List[str]:
    flags = []
    for key, limit in _SANITY_BOUNDS.items():
        v = row.get(key)
        if v is not None and abs(v) > limit:
            row[key] = None
            flags.append(key)
    if row.get("price") is not None and row["price"] > 100000:
        flags.append("price")
    return flags


def build_universe() -> List[Dict[str, Any]]:
    from globals import price_service, BIST_TICKERS, report_repo
    from main import get_cached_recommendations
    from services.ticker_resolver import match_ticker

    t0 = time.time()
    companies = report_repo.get_all_company_info() or {}
    prices = price_service.prices or {}

    try:
        from routers.stocks import _get_company_names
        names = _get_company_names()
    except Exception:
        names = {}

    consensus = _broker_consensus(get_cached_recommendations(), match_ticker, BIST_TICKERS)

    conviction: Dict[str, Dict[str, Any]] = {}
    try:
        from services.conviction_engine import conviction_engine
        conviction = {s["ticker"]: s for s in conviction_engine.get_all_scored_stocks()}
    except Exception as e:
        logger.warning(f"Universe: conviction scores unavailable: {e}")

    history: Dict[str, List[tuple]] = defaultdict(list)
    with report_repo._get_connection() as conn:
        cur = conn.execute(
            """
            SELECT ticker, close, volume FROM historical_prices
            WHERE date >= date((SELECT MAX(date) FROM historical_prices), '-400 days')
            ORDER BY ticker, date
            """
        )
        for ticker, close, volume in cur.fetchall():
            history[ticker].append((close, volume))

    tickers = set(prices) | set(companies)
    rows: List[Dict[str, Any]] = []
    for t in sorted(tickers):
        p = prices.get(t) or {}
        info = companies.get(t) or {}
        f = info.get("fundamentals") or {}
        price = _num(p.get("price"))
        if price is None and not history.get(t):
            continue

        cons = consensus.get(t)
        avg_target = (sum(cons["targets"]) / len(cons["targets"])) if cons and cons["targets"] else None
        conv = conviction.get(t) or {}
        div = _num(f.get("dividendYield"))
        roe = _num(f.get("returnOnEquity"))

        row = {
            "ticker": t,
            "name": names.get(t) or conv.get("company_name") or t,
            "sector": info.get("sector") if info.get("sector") not in (None, "Unknown") else None,
            "industry": f.get("industry"),
            "price": price,
            "change_pct": _num(p.get("change_pct")),
            "market_cap": _num(f.get("marketCap")),
            "pe": _num(f.get("trailingPE")),
            "pb": _num(f.get("priceToBook")),
            "div_yield": div,
            "roe": roe * 100.0 if roe is not None else None,
            "broker_count": len(cons["brokers"]) if cons else 0,
            "model_count": len(cons["models"]) if cons else 0,
            "avg_target": avg_target,
            "upside": ((avg_target / price - 1.0) * 100.0) if avg_target and price else None,
            "last_report": cons["last_date"] if cons else None,
            "score": conv.get("score"),
            "decision": conv.get("decision"),
        }
        row.update(_price_stats(history.get(t, []), price))
        row["data_flags"] = _sanitize(row)
        rows.append(row)

    logger.info(f"Screener universe built: {len(rows)} rows in {time.time() - t0:.2f}s")
    return rows


def get_universe(force: bool = False) -> Dict[str, Any]:
    with _lock:
        rows = _cache["rows"]
        # Right after startup the conviction engine has not scored yet; rebuild soon instead of caching the gap.
        ttl = _CACHE_TTL if rows and any(r.get("score") is not None for r in rows) else 20
        fresh = rows is not None and (time.time() - _cache["time"]) < ttl
        if force or not fresh:
            _cache["rows"] = build_universe()
            _cache["time"] = time.time()
        return {"built_at": _cache["time"], "count": len(_cache["rows"]), "rows": _cache["rows"]}
