"""
HisseRadarPro — House strategies (Strateji Merkezi)
===================================================
A fixed set of rule-based strategies run through the backtest engine, so users can browse
their track records and current holdings and follow them. All records are backtests of rules,
not live trading; the page says so next to every number.
"""

import logging
import threading
import time
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

_TTL = 6 * 3600
_cache: Dict[str, Any] = {"time": 0.0, "data": None}
_lock = threading.Lock()

BASE = {"universe": "all", "rank_order": None, "filters": [], "weighting": "equal", "start": "2012-01-01",
        "cost_bps": 20, "min_turnover_tl": 5_000_000, "cash_rate": 0.0, "timing_asset": "XU100", "sma_window": 200}

HOUSE: List[Dict[str, Any]] = [
    {"id": "momentum-20", "tag": "MOMENTUM", "name": "Momentum 20",
     "summary": "Son 12 ayda (son ay hariç) en çok yükselen 20 hisse; her ay yenilenir.",
     "spec": {**BASE, "kind": "rank", "rank_factor": "mom_12_1", "top_n": 20, "rebalance": "monthly"}},
    {"id": "momentum-risk", "tag": "MOMENTUM", "name": "Risk dengeli momentum",
     "summary": "Momentum 20 ile aynı hisseler; oynaklığı yüksek olana daha az ağırlık verilir.",
     "spec": {**BASE, "kind": "rank", "rank_factor": "mom_12_1", "top_n": 20, "rebalance": "monthly", "weighting": "inverse_vol"}},
    {"id": "trend-bist100", "tag": "TREND", "name": "BIST 100 trend lideri",
     "summary": "BIST 100'de 200 günlük ortalamanın üzerindeki hisselerden son 6 ayda en çok yükselen 15'i; aylık.",
     "spec": {**BASE, "kind": "rank", "universe": "bist100", "rank_factor": "ret_6m", "top_n": 15, "rebalance": "monthly",
              "filters": [{"factor": "sma200_dist", "op": ">", "value": 0}]}},
    {"id": "breakout", "tag": "KIRILIM", "name": "Zirveye yakınlar",
     "summary": "52 haftalık zirvesine en yakın 20 hisse; aylık.",
     "spec": {**BASE, "kind": "rank", "rank_factor": "dist_52w_high", "top_n": 20, "rebalance": "monthly"}},
    {"id": "low-vol", "tag": "DÜŞÜK RİSK", "name": "Düşük volatilite 30",
     "summary": "Son 90 günde en az oynayan 30 hisse; çeyreklik.",
     "spec": {**BASE, "kind": "rank", "rank_factor": "vol_90", "rank_order": "asc", "top_n": 30, "rebalance": "quarterly"}},
    {"id": "bist30-lowvol", "tag": "DÜŞÜK RİSK", "name": "BIST 30 sakin 10",
     "summary": "BIST 30 içinde en az oynayan 10 hisse; çeyreklik.",
     "spec": {**BASE, "kind": "rank", "universe": "bist30", "rank_factor": "vol_90", "rank_order": "asc", "top_n": 10, "rebalance": "quarterly"}},
    {"id": "pullback", "tag": "GERİ DÖNÜŞ", "name": "Trendde geri çekilme",
     "summary": "200 günlük ortalamanın üzerindeki hisselerden RSI'ı en düşük 15'i; haftalık.",
     "spec": {**BASE, "kind": "rank", "rank_factor": "rsi14", "rank_order": "asc", "top_n": 15, "rebalance": "weekly",
              "filters": [{"factor": "sma200_dist", "op": ">", "value": 0}]}},
    {"id": "xu100-trend", "tag": "ZAMANLAMA", "name": "XU100 trend filtresi",
     "summary": "XU100, 200 günlük ortalamasının üzerindeyken endeks; altındayken nakit. Endeks verisi 2021'den başladığı için kısa geçmiş.",
     "spec": {**BASE, "kind": "timing", "rank_factor": "mom_12_1", "top_n": 20, "rebalance": "daily", "start": "2022-09-01"}},
]


def _build() -> List[Dict[str, Any]]:
    from services.backtest_engine import run_backtest
    out = []
    for h in HOUSE:
        try:
            r = run_backtest(dict(h["spec"]))
        except Exception as e:
            logger.warning(f"House strategy {h['id']} failed: {e}")
            continue
        m, b = r["metrics"], r["benchmark_metrics"]
        out.append({
            "id": h["id"], "tag": h["tag"], "name": h["name"], "summary": h["summary"], "spec": h["spec"],
            "start": r["start"], "end": r["end"], "benchmark_name": r["benchmark_name"],
            "cagr": m.get("cagr"), "benchmark_cagr": b.get("cagr"), "excess_cagr": r.get("excess_cagr"),
            "max_drawdown": m.get("max_drawdown"), "volatility": m.get("volatility"), "sharpe": m.get("sharpe"),
            "ytd": m.get("ytd"), "benchmark_ytd": b.get("ytd"),
            "rebalance": h["spec"]["rebalance"],
            "last_rebalance": (r.get("last_holdings") or {}).get("date"),
            "holdings": (r.get("last_holdings") or {}).get("holdings") or [],
            "series": r["series"][:: max(1, len(r["series"]) // 120)],
            "warnings": r["warnings"],
        })
    return out


def get_house_strategies(force: bool = False) -> Dict[str, Any]:
    with _lock:
        if force or _cache["data"] is None or time.time() - _cache["time"] > _TTL:
            t0 = time.time()
            _cache["data"] = _build()
            _cache["time"] = time.time()
            logger.info(f"House strategies built in {time.time() - t0:.1f}s")
        return {"built_at": _cache["time"], "strategies": _cache["data"]}
