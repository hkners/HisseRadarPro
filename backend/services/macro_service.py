"""
HisseRadarPro — Macro / Market Regime Snapshot
==============================================
"Today's regime, the indicators that matter and a written brief", computed from one
snapshot (live prices + the screener universe) so every number on the page agrees:
- regime label and exposure advice (market_regime_service),
- XU100 trend, returns and volatility,
- breadth: advancers/decliners, share above SMA200, near 52w highs vs deep drawdowns, oversold share,
- broker sentiment: median upside and fresh report count,
- sector moves today and over one month (market-cap weighted), biggest movers among the 100 largest.
The brief is written by Gemini from these numbers only, cached for 30 minutes, with a rule-based fallback.
"""

import datetime
import logging
import math
import statistics
import threading
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_BRIEF_TTL = 1800
SECTOR_TR = {
    "Industrials": "Sanayi", "Consumer Cyclical": "Döngüsel Tüketim", "Financial Services": "Finansal Hizmetler",
    "Basic Materials": "Temel Malzeme", "Consumer Defensive": "Temel Tüketim", "Real Estate": "Gayrimenkul",
    "Technology": "Teknoloji", "Utilities": "Enerji Dağıtım & Kamu Hizmetleri", "Healthcare": "Sağlık",
    "Communication Services": "İletişim Hizmetleri", "Energy": "Enerji",
}
_brief_cache: Dict[str, Any] = {"time": 0.0, "data": None}
_brief_lock = threading.Lock()


def _f(v) -> Optional[float]:
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def _cap_weighted(rows: List[Dict[str, Any]], key: str) -> Optional[float]:
    num = den = 0.0
    for r in rows:
        v, cap = _f(r.get(key)), _f(r.get("market_cap"))
        if v is not None and cap:
            num += v * cap
            den += cap
    return num / den if den else None


def _index_stats(report_repo) -> Dict[str, Any]:
    with report_repo._get_connection() as conn:
        rows = conn.execute(
            "SELECT date, close FROM historical_prices WHERE ticker = 'XU100' ORDER BY date DESC LIMIT 260"
        ).fetchall()
    closes = [r[1] for r in reversed(rows) if r[1]]
    if len(closes) < 30:
        return {}
    last = closes[-1]

    def ret(n):
        return (last / closes[-1 - n] - 1.0) * 100.0 if len(closes) > n else None

    ma50 = sum(closes[-50:]) / 50 if len(closes) >= 50 else None
    ma200 = sum(closes[-200:]) / 200 if len(closes) >= 200 else None
    logs = [math.log(closes[i] / closes[i - 1]) for i in range(len(closes) - 30, len(closes))]
    mean = sum(logs) / len(logs)
    vol30 = math.sqrt(sum((x - mean) ** 2 for x in logs) / (len(logs) - 1)) * math.sqrt(252) * 100.0
    return {
        "date": str(rows[0][0]),
        "close": round(last, 2),
        "ma50_dist": round((last / ma50 - 1) * 100, 2) if ma50 else None,
        "ma200_dist": round((last / ma200 - 1) * 100, 2) if ma200 else None,
        "r1m": round(ret(21), 2) if ret(21) is not None else None,
        "r3m": round(ret(63), 2) if ret(63) is not None else None,
        "r1y": round(ret(252), 2) if ret(252) is not None else None,
        "vol30": round(vol30, 1),
    }


def build_snapshot() -> Dict[str, Any]:
    from globals import price_service, report_repo
    from services.market_regime_service import get_current_regime
    from services.screener_universe import get_universe

    regime = get_current_regime(all_prices=price_service.prices or {})
    rows = get_universe()["rows"]

    priced = [r for r in rows if _f(r.get("change_pct")) is not None]
    up = sum(1 for r in priced if r["change_pct"] > 0.05)
    down = sum(1 for r in priced if r["change_pct"] < -0.05)
    with_sma = [r for r in rows if _f(r.get("sma200_dist")) is not None]
    with_high = [r for r in rows if _f(r.get("dist_52w_high")) is not None]
    with_rsi = [r for r in rows if _f(r.get("rsi14")) is not None]
    covered = [r["upside"] for r in rows if _f(r.get("upside")) is not None]
    today = datetime.date.today()
    fresh = sum(
        1 for r in rows
        if r.get("last_report") and (today - datetime.date.fromisoformat(str(r["last_report"])[:10])).days <= 30
    )

    breadth = {
        "total": len(priced),
        "up": up,
        "down": down,
        "flat": len(priced) - up - down,
        "above_sma200_pct": round(100.0 * sum(1 for r in with_sma if r["sma200_dist"] > 0) / len(with_sma), 1) if with_sma else None,
        "near_high_count": sum(1 for r in with_high if r["dist_52w_high"] >= -5),
        "deep_drawdown_count": sum(1 for r in with_high if r["dist_52w_high"] <= -30),
        "oversold_pct": round(100.0 * sum(1 for r in with_rsi if r["rsi14"] <= 30) / len(with_rsi), 1) if with_rsi else None,
        "median_rsi": round(statistics.median(r["rsi14"] for r in with_rsi), 1) if with_rsi else None,
    }
    sentiment = {
        "median_upside": round(statistics.median(covered), 1) if covered else None,
        "covered": len(covered),
        "fresh_reports_30d": fresh,
    }

    by_sector: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        if r.get("sector"):
            by_sector.setdefault(r["sector"], []).append(r)
    sectors = sorted(
        (
            {"sector": s, "count": len(lst), "today": _cap_weighted(lst, "change_pct"), "r1m": _cap_weighted(lst, "r1m")}
            for s, lst in by_sector.items()
        ),
        key=lambda x: -(x["today"] or -999),
    )
    for s in sectors:
        s["today"] = round(s["today"], 2) if s["today"] is not None else None
        s["r1m"] = round(s["r1m"], 2) if s["r1m"] is not None else None

    largest = sorted((r for r in priced if _f(r.get("market_cap"))), key=lambda r: -r["market_cap"])[:100]
    movers = sorted(largest, key=lambda r: r["change_pct"])
    pick = lambda r: {"ticker": r["ticker"], "name": r.get("name"), "change_pct": round(r["change_pct"], 2), "price": r.get("price")}

    return {
        "as_of": datetime.datetime.now().isoformat(timespec="minutes"),
        "regime": {
            "status": regime.get("status"),
            "title": regime.get("badge_title"),
            "advice": regime.get("description"),
            "exposure_multiplier": regime.get("exposure_multiplier"),
        },
        "index": _index_stats(report_repo),
        "breadth": breadth,
        "sentiment": sentiment,
        "sectors": sectors,
        "gainers": [pick(r) for r in reversed(movers[-5:])],
        "losers": [pick(r) for r in movers[:5]],
    }


def _tr(v, digits: int = 1) -> str:
    """Turkish number formatting: thousands '.', decimals ','."""
    if v is None:
        return "—"
    txt = f"{v:,.{digits}f}"
    return txt.replace(",", "X").replace(".", ",").replace("X", ".")


def _pct(v, digits: int = 1, sign: bool = False) -> str:
    """Turkish percent: '-%4,8', '+%2,1' (sign before the percent symbol)."""
    if v is None:
        return "—"
    prefix = "-" if v < 0 else ("+" if sign and v > 0 else "")
    return f"{prefix}%{_tr(abs(v), digits)}"


def _rule_based_brief(s: Dict[str, Any]) -> str:
    # Sentences are built so that no Turkish case suffix has to follow a number.
    i, b, se = s.get("index") or {}, s["breadth"], s["sentiment"]
    lead = SECTOR_TR.get(s["sectors"][0]["sector"], s["sectors"][0]["sector"]) if s["sectors"] else None
    lag = SECTOR_TR.get(s["sectors"][-1]["sector"], s["sectors"][-1]["sector"]) if s["sectors"] else None
    parts = [
        f"XU100 {_tr(i.get('close'))} puanda; 200 günlük ortalamaya uzaklık {_pct(i.get('ma200_dist'), sign=True)}, "
        f"son bir ayın getirisi {_pct(i.get('r1m'), sign=True)}.",
        f"Bugün yükselen hisse sayısı {b['up']}, düşen {b['down']}. Uzun vadeli ortalamasının üzerinde kalan hisse oranı {_pct(b['above_sma200_pct'])}, "
        f"aşırı satım bölgesindekiler {_pct(b['oversold_pct'])}.",
    ]
    if lead and lag:
        parts.append(f"Günün en güçlü sektörü {lead}, en zayıfı {lag}.")
    if se.get("median_upside") is not None:
        parts.append(f"Kurum raporu olan {se['covered']} hissede medyan hedef potansiyeli {_pct(se['median_upside'], sign=True)}.")
    return " ".join(parts)


def get_brief(snapshot: Dict[str, Any], force: bool = False) -> Dict[str, Any]:
    with _brief_lock:
        if not force and _brief_cache["data"] and time.time() - _brief_cache["time"] < _BRIEF_TTL:
            return {**_brief_cache["data"], "cached": True}

        from services.ai_service import configure_ai, _generate_content_with_fallback, strip_emoji, genai

        fallback = {"text": _rule_based_brief(snapshot), "source": "rule_based"}
        if not configure_ai():
            return fallback

        facts = {k: snapshot[k] for k in ("regime", "index", "breadth", "sentiment")}
        facts["sectors"] = [{**x, "sector": SECTOR_TR.get(x["sector"], x["sector"])} for x in snapshot["sectors"]]
        facts["gainers"] = [g["ticker"] for g in snapshot["gainers"]]
        facts["losers"] = [g["ticker"] for g in snapshot["losers"]]
        try:
            from services.macro_data import summary as _rates
            facts["tcmb_ve_kur"] = {k: v for k, v in _rates().items() if k != "history"}
        except Exception:
            pass
        prompt = f"""Sen Borsa İstanbul'u izleyen kıdemli bir piyasa stratejistisin.
Aşağıdaki verilere DAYANARAK, yalnızca bu sayıları kullanarak Türkçe kısa bir günlük brif yaz.
Kurallar: 3 kısa paragraf, toplam en fazla 120 kelime. 1) Rejim ve endeks trendi. 2) Piyasa genişliği ve sektörler.
3) Enflasyon, reel faiz ve kur tablosuyla birlikte nelere dikkat edilmeli. Verilerde olmayan rakam, haber veya makro gelişme uydurma.
Yatırım tavsiyesi verme, "al/sat" deme. Sektör adlarını Türkçe yaz.

Veriler (JSON): {facts}"""
        try:
            res = _generate_content_with_fallback(
                prompt,
                generation_config=genai.types.GenerationConfig(temperature=0.3, max_output_tokens=700),
            )
            text = strip_emoji(res.text).strip()
            data = {"text": text, "source": "ai"} if text else fallback
        except Exception as e:
            logger.warning(f"Macro brief generation failed: {e}")
            data = fallback
        _brief_cache["data"] = data
        _brief_cache["time"] = time.time()
        return data
