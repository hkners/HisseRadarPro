"""
Compare Router
Handles /api/compare — rebased performance of 2–4 tickers (stocks or XU100) on a common calendar,
with per-series risk stats and "who has been ahead since when" for each pair against the first ticker.
"""
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api", tags=["compare"])

ALLOWED_DAYS = {30, 91, 182, 365, 1095, 1825}
TRADING_DAYS = 252


def _round(x, n=4):
    return None if x is None or not np.isfinite(x) else round(float(x), n)


@router.get("/compare")
def compare(tickers: str = Query(..., description="Comma separated, 2–4 tickers; XU100 allowed"), days: int = 365):
    from globals import report_repo

    names: List[str] = []
    for t in tickers.split(","):
        t = t.strip().upper().replace(".IS", "")
        if t and t not in names:
            names.append(t)
    if not 2 <= len(names) <= 4:
        raise HTTPException(status_code=400, detail="2 ile 4 arasında varlık seçilmeli.")
    if days not in ALLOWED_DAYS:
        days = 365

    marks = ",".join("?" * len(names))
    with report_repo._get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT ticker, date, close FROM historical_prices
            WHERE ticker IN ({marks})
              AND date >= date((SELECT MAX(date) FROM historical_prices WHERE ticker IN ({marks})), ?)
            """,
            (*names, *names, f"-{days} days"),
        ).fetchall()
    df = pd.DataFrame([tuple(r) for r in rows], columns=["ticker", "date", "close"])
    missing = [n for n in names if n not in set(df["ticker"])]
    if missing:
        raise HTTPException(status_code=404, detail=f"Fiyat geçmişi bulunamadı: {', '.join(missing)}")

    wide = df.pivot_table(index="date", columns="ticker", values="close").sort_index()[names]
    wide = wide.ffill(limit=3).dropna()
    if len(wide) < 5:
        raise HTTPException(status_code=422, detail="Seçilen dönemde ortak işlem günü yetersiz.")

    rebased = wide / wide.iloc[0] * 100.0
    rets = wide.pct_change().iloc[1:]

    stats: List[Dict[str, Any]] = []
    for n in names:
        curve = rebased[n]
        stats.append({
            "ticker": n,
            "start_price": _round(wide[n].iloc[0], 2),
            "end_price": _round(wide[n].iloc[-1], 2),
            "total_return": _round(curve.iloc[-1] / 100.0 - 1.0),
            "volatility": _round(rets[n].std() * np.sqrt(TRADING_DAYS)),
            "max_drawdown": _round((curve / curve.cummax() - 1.0).min()),
        })

    base = names[0]
    pairs = []
    for other in names[1:]:
        diff = rebased[base] - rebased[other]
        sign = np.sign(diff.values)
        leader = base if sign[-1] >= 0 else other
        # Walk back to the last day the leadership was different.
        since_idx = 0
        for i in range(len(sign) - 1, -1, -1):
            if sign[i] != sign[-1] and sign[i] != 0:
                since_idx = i + 1
                break
        pairs.append({
            "a": base,
            "b": other,
            "leader": leader,
            "since": str(rebased.index[since_idx]),
            "led_whole_period": since_idx == 0,
            "gap_points": _round(abs(diff.iloc[-1]), 2),
            "correlation": _round(rets[base].corr(rets[other]), 3),
        })

    return {
        "tickers": names,
        "days": days,
        "start": str(rebased.index[0]),
        "end": str(rebased.index[-1]),
        "series": [
            {"date": str(d), **{n: _round(v, 2) for n, v in row.items()}}
            for d, row in rebased.iterrows()
        ],
        "stats": stats,
        "pairs": pairs,
    }
