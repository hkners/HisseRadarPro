"""
HisseRadarPro — Studio (thesis -> portfolio)
============================================
Turns a plain-Turkish investment thesis into a long-only BIST basket:

1. Gemini maps the thesis to macro drivers and scores how ~200 liquid BIST stocks are exposed to it
   (impact -3..+3, the transmission channel, confidence). These are model judgments, not valuations.
2. A quantitative layer builds the basket: names with a positive impact, weight ∝ impact / volatility,
   max 20% per name, at most 12 names, dropping a name whose returns are ~duplicates (corr > 0.85) of a
   heavier pick. Every candidate that does not make it is listed with the reason.
3. Risk of the final basket from one year of daily returns: expected volatility, average correlation,
   each name's share of risk and the correlation matrix.
"""

import json
import logging
import math
from typing import Any, Dict, List

import numpy as np

logger = logging.getLogger(__name__)

MAX_NAMES = 12
MIN_NAMES = 8
MAX_WEIGHT = 0.20
MIN_TURNOVER = 20_000_000
CANDIDATES = 220
DUPLICATE_CORR = 0.85

SECTOR_TR = {
    "Industrials": "Sanayi", "Consumer Cyclical": "Döngüsel Tüketim", "Financial Services": "Finansal Hizmetler",
    "Basic Materials": "Temel Malzeme", "Consumer Defensive": "Temel Tüketim", "Real Estate": "Gayrimenkul",
    "Technology": "Teknoloji", "Utilities": "Enerji Dağıtım & Kamu Hizmetleri", "Healthcare": "Sağlık",
    "Communication Services": "İletişim Hizmetleri", "Energy": "Enerji",
}


def _candidates() -> List[Dict[str, Any]]:
    from services.screener_universe import get_universe
    rows = [r for r in get_universe()["rows"]
            if r.get("price") and r.get("market_cap") and (r.get("turnover20") or 0) >= MIN_TURNOVER]
    rows.sort(key=lambda r: -(r.get("market_cap") or 0))
    return rows[:CANDIDATES]


def _ask_model(thesis: str, cands: List[Dict[str, Any]]) -> Dict[str, Any]:
    from services.ai_service import _generate_content_with_fallback, strip_emoji, genai

    listing = "\n".join(
        f"{r['ticker']}|{(r.get('name') or '')[:40]}|{SECTOR_TR.get(r.get('sector'), r.get('sector') or '')}|{r.get('industry') or ''}"
        for r in cands
    )
    prompt = f"""Sen Borsa İstanbul'u bilen bir buy-side stratejistisin. Kullanıcının yatırım tezini hisselere çevir.

Tez: \"\"\"{thesis}\"\"\"

Aday hisseler (KOD|Ad|Sektör|Alt sektör) — yalnızca bu listeden seç:
{listing}

Görevler:
1. Tezi 2-4 makro sürücüye çevir (ör. politika faizi düşer, TL reel değer kaybeder). Sayısal hedef tezde yazmıyorsa uydurma.
2. Tezden en çok etkilenecek 15-25 hisseyi seç. Her biri için etki puanı ver: +3 güçlü olumlu, +1 zayıf olumlu, 0 etkisiz,
   -1/-3 olumsuz. Olumsuz etkilenen birkaç önemli hisseyi de ekle ki kullanıcı neyin dışarıda kaldığını görsün.
3. Her hisse için tek cümlelik etki kanalını yaz (ör. "Fonlama maliyeti düşer, net faiz marjı genişler").
4. Tezin bozulacağı 2-3 koşulu yaz.
Tüm metinler Türkçe olsun. Yatırım tavsiyesi dili kullanma.

Yalnızca şu JSON'u döndür:
{{"title": "kısa başlık", "summary": "tezin 1-2 cümlelik yeniden ifadesi",
 "drivers": [{{"name": "sürücü", "direction": "yükselir|düşer|artar|azalır|değişmez", "note": "kısa açıklama"}}],
 "stocks": [{{"ticker": "KOD", "impact": -3..3, "channel": "tek cümle", "confidence": "yüksek|orta|düşük"}}],
 "risks": ["tezi bozan koşul"]}}"""
    res = _generate_content_with_fallback(
        prompt,
        generation_config=genai.types.GenerationConfig(temperature=0.2, max_output_tokens=3000, response_mime_type="application/json"),
    )
    return _normalize(json.loads(strip_emoji(res.text)))


def _normalize(data: Any) -> Dict[str, Any]:
    """The model sometimes wraps the object in a list or returns bare strings; coerce to the expected shape."""
    if isinstance(data, list):
        obj = next((x for x in data if isinstance(x, dict) and ("stocks" in x or "title" in x)), None)
        data = obj if obj is not None else {"stocks": [x for x in data if isinstance(x, dict)]}
    if not isinstance(data, dict):
        data = {}
    drivers = []
    for d in data.get("drivers") or []:
        if isinstance(d, dict):
            drivers.append({"name": str(d.get("name") or ""), "direction": str(d.get("direction") or ""), "note": str(d.get("note") or "")})
        elif d:
            drivers.append({"name": str(d), "direction": "", "note": ""})
    data["drivers"] = drivers
    data["stocks"] = [s for s in data.get("stocks") or [] if isinstance(s, dict)]
    data["risks"] = [str(r) for r in data.get("risks") or [] if r]
    return data


def run_thesis(thesis: str) -> Dict[str, Any]:
    from globals import report_repo
    from services.portfolio_analytics import _price_frame

    cands = _candidates()
    by_ticker = {r["ticker"]: r for r in cands}
    model = _ask_model(thesis, cands)

    scored = []
    seen = set()
    for s in model.get("stocks") or []:
        t = str(s.get("ticker", "")).upper().strip()
        if t not in by_ticker or t in seen:
            continue
        seen.add(t)
        try:
            impact = max(-3, min(3, int(round(float(s.get("impact", 0))))))
        except (TypeError, ValueError):
            impact = 0
        r = by_ticker[t]
        scored.append({
            "ticker": t, "name": r.get("name"), "sector": r.get("sector"), "price": r.get("price"),
            "impact": impact, "channel": str(s.get("channel") or ""), "confidence": str(s.get("confidence") or ""),
            "vol": (r.get("vol30") or 0) / 100.0 or None, "upside": r.get("upside"), "score": r.get("score"),
        })

    excluded: List[Dict[str, Any]] = []
    for s in scored:
        if s["impact"] <= 0:
            excluded.append({**s, "reason": "Tezden olumsuz etkilenir" if s["impact"] < 0 else "Teze göre etkisi yok"})
    positives = [s for s in scored if s["impact"] > 0]

    # Price history for risk and the duplicate check.
    tickers = [s["ticker"] for s in positives]
    prices = _price_frame(report_repo, tickers + ["XU100"]) if tickers else None
    rets = prices.pct_change().iloc[1:] if prices is not None and not prices.empty else None
    have_hist = [t for t in tickers if rets is not None and t in rets and rets[t].notna().sum() >= 120]
    for s in positives:
        if s["ticker"] not in have_hist:
            excluded.append({**s, "reason": "Yeterli fiyat geçmişi yok (en az 6 ay gerekir)"})
    pool = [s for s in positives if s["ticker"] in have_hist]
    for s in pool:
        if not s["vol"] and rets is not None:
            s["vol"] = float(rets[s["ticker"]].std() * math.sqrt(252))
        s["raw"] = s["impact"] / max(s["vol"] or 0.3, 0.1)
    # Strong exposures first (by impact, then risk-adjusted strength); weak ones only fill a thin basket.
    pool.sort(key=lambda s: (-(s["impact"] >= 2), -s["raw"]))

    picks: List[Dict[str, Any]] = []
    corr = rets[have_hist].corr() if rets is not None and have_hist else None
    for s in pool:
        if len(picks) >= MAX_NAMES:
            excluded.append({**s, "reason": f"Sepet {MAX_NAMES} hisseyle sınırlı; daha yüksek puanlılar seçildi"})
            continue
        if s["impact"] < 2 and len(picks) >= MIN_NAMES:
            excluded.append({**s, "reason": "Etkisi zayıf; yeterince güçlü aday olduğu için dışarıda kaldı"})
            continue
        dup = next((p for p in picks if corr is not None and corr.loc[s["ticker"], p["ticker"]] > DUPLICATE_CORR), None)
        if dup:
            c = corr.loc[s["ticker"], dup["ticker"]]
            excluded.append({**s, "reason": f"{dup['ticker']} ile çok yüksek korelasyon ({c:.2f}); aynı riski tekrarlar".replace(".", ",")})
            continue
        picks.append(s)

    # Weights: proportional to impact / volatility, capped per name, iteratively renormalised.
    if picks:
        w = np.array([p["raw"] for p in picks], dtype=float)
        w = w / w.sum()
        for _ in range(20):
            over = w > MAX_WEIGHT
            if not over.any():
                break
            excess = (w[over] - MAX_WEIGHT).sum()
            w[over] = MAX_WEIGHT
            under = ~over
            if not under.any():
                break
            w[under] += excess * w[under] / w[under].sum()
        for p, wi in zip(picks, w):
            p["weight"] = float(wi)

    stats: Dict[str, Any] = {"holdings": len(picks)}
    correlation = None
    if len(picks) >= 2 and rets is not None:
        names = [p["ticker"] for p in picks]
        sub = rets[names].dropna()
        cov = sub.cov().values * 252
        wv = np.array([p["weight"] for p in picks])
        var = float(wv @ cov @ wv)
        stats["expected_volatility"] = math.sqrt(var) if var > 0 else None
        contrib = (wv * (cov @ wv)) / var if var > 0 else np.zeros_like(wv)
        for p, c in zip(picks, contrib):
            p["risk_contribution"] = float(c)
        cm = sub.corr()
        off = cm.values[~np.eye(len(names), dtype=bool)]
        stats["average_correlation"] = float(off.mean()) if off.size else None
        if "XU100" in rets:
            port = sub.values @ wv
            bench = rets["XU100"].reindex(sub.index).fillna(0).values
            stats["beta"] = float(np.cov(port, bench)[0, 1] / bench.var()) if bench.var() > 0 else None
        correlation = {"tickers": names, "matrix": cm.round(3).values.tolist()}
    elif len(picks) == 1:
        stats["expected_volatility"] = picks[0]["vol"]

    def clean(d):
        return {k: v for k, v in d.items() if k != "raw"}

    return {
        "thesis": thesis,
        "title": model.get("title") or thesis[:60],
        "summary": model.get("summary") or "",
        "drivers": model.get("drivers") or [],
        "risks": model.get("risks") or [],
        "allocation": [clean(p) for p in picks],
        "excluded": [clean(e) for e in sorted(excluded, key=lambda e: -e["impact"])],
        "stats": stats,
        "correlation": correlation,
        "candidate_count": len(cands),
        "scored_count": len(scored),
    }
