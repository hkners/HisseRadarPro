"""
Technical Analysis Router
Handles /api/ta — the evidence-based technical analysis lab (services/ta_lab.py).
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/ta", tags=["technical-analysis"])


def _lab_or_202() -> Dict[str, Any]:
    from services import ta_lab
    lab = ta_lab.get_lab()
    if lab is None:
        st = ta_lab.status()
        raise HTTPException(status_code=503, detail={"message": "Teknik analiz modeli hazırlanıyor.", **st})
    return lab


def _signal_meta(lab: Dict[str, Any]) -> Dict[str, Any]:
    from services.ta_lab import SIGNALS
    out = {}
    for s in SIGNALS:
        ev = lab["evidence"].get(s["key"], {})
        h20 = ev.get("horizons", {}).get(20, {})
        out[s["key"]] = {
            "label": s["label"], "group": s["group"], "kind": s["kind"], "classic": s["classic"],
            "verdict": ev.get("verdict"), "verdict_label": ev.get("verdict_label"),
            "mean20": h20.get("mean"), "t20": h20.get("t"),
        }
    return out


@router.get("/status")
def get_status():
    from services import ta_lab
    return ta_lab.status()


@router.get("/overview")
def get_overview():
    lab = _lab_or_202()
    model = lab["model"]
    return {
        "as_of": lab["as_of"], "study": lab["study"], "overview": lab["overview"], "sectors": lab["sectors"],
        "model": {k: model.get(k) for k in (
            "method", "oos_start", "oos_end", "train_rows", "deciles", "ic_mean", "ic_t", "ic_positive_months",
            "yearly", "curve", "cagr_top", "cagr_bottom", "cagr_universe", "cost", "importance", "signal_directions")},
    }


@router.get("/screener")
def get_screener(include_illiquid: bool = False):
    lab = _lab_or_202()
    keep = ("ticker", "price", "liquid", "score", "decile", "expected_excess_20d", "stage", "template", "rs_rating",
            "adx", "plus_di", "minus_di", "rsi14", "atr_pct", "dist_hi52", "ext50", "price_sma200", "vol_ratio",
            "updown_vol", "atr_ratio", "squeeze", "ret_1m", "ret_3m", "ret_12m", "turnover20", "signals", "stop_pct")
    from globals import report_repo
    info = report_repo.get_all_company_info() or {}
    rows = []
    for r in lab["rows"]:
        if not include_illiquid and not r["liquid"]:
            continue
        row = {k: r.get(k) for k in keep}
        ci = info.get(r["ticker"]) or {}
        row["sector"] = ci.get("sector")
        sup = (r.get("levels") or {}).get("supports") or []
        res = (r.get("levels") or {}).get("resistances") or []
        row["support_pct"] = sup[0]["dist_pct"] if sup else None
        row["resistance_pct"] = res[0]["dist_pct"] if res else None
        rows.append(row)
    return {"as_of": lab["as_of"], "rows": rows, "signals": _signal_meta(lab)}


@router.get("/signals")
def get_signals():
    from services.ta_lab import SIGNALS
    lab = _lab_or_202()
    out = []
    for s in SIGNALS:
        ev = lab["evidence"].get(s["key"], {})
        active = [r["ticker"] for r in lab["rows"] if r["liquid"] and s["key"] in r["signals"]]
        out.append({**s, **ev, "active_count": len(active), "active": active[:60]})
    return {"as_of": lab["as_of"], "study": lab["study"], "signals": out,
            "directions": lab["model"].get("signal_directions", {})}


@router.get("/stock/{ticker}")
def get_stock(ticker: str, days: int = 260):
    lab = _lab_or_202()
    t = ticker.upper().replace(".IS", "").strip()
    row = next((r for r in lab["rows"] if r["ticker"] == t), None)
    if row is None:
        raise HTTPException(status_code=404, detail=f"{t} için teknik analiz yok (yetersiz fiyat geçmişi).")
    from globals import report_repo
    hist = report_repo.get_historical_prices(t, limit=max(60, min(days, 1500)) + 200)
    import pandas as pd
    df = pd.DataFrame(hist)
    candles = []
    if not df.empty:
        df["date"] = df["date"].astype(str).str.slice(0, 10)
        close = df["close"].astype(float)
        for n in (50, 150, 200):
            df[f"sma{n}"] = close.rolling(n, min_periods=n).mean()
        df = df.tail(days)
        for rec in df.itertuples(index=False):
            candles.append({
                "time": rec.date, "open": float(rec.open), "high": float(rec.high), "low": float(rec.low),
                "close": float(rec.close), "volume": float(rec.volume or 0),
                "sma50": None if pd.isna(rec.sma50) else float(rec.sma50),
                "sma150": None if pd.isna(rec.sma150) else float(rec.sma150),
                "sma200": None if pd.isna(rec.sma200) else float(rec.sma200),
            })
    from services.ta_lab import SIGNAL_BY_KEY
    meta = _signal_meta(lab)
    signals = [{"key": k, **meta[k], "desc": SIGNAL_BY_KEY[k]["desc"]} for k in row["signals"]]
    return {"as_of": lab["as_of"], "row": row, "signals": signals, "candles": candles,
            "deciles": lab["model"].get("deciles"), "regime_up": lab["overview"].get("regime_up")}


@router.post("/rebuild")
def rebuild():
    from services import ta_lab
    with ta_lab._lock:
        if ta_lab._state["building"]:
            return {"status": "already_building"}
        ta_lab._state["building"] = True
        import time
        ta_lab._state["started"] = time.time()
    import threading
    threading.Thread(target=ta_lab._run_build, daemon=True).start()
    return {"status": "started"}


@router.get("/scorecard")
def get_scorecard():
    """Score card: out-of-sample results, live record of daily snapshots and the analyst information test."""
    from services.score_evidence import build
    data = build()
    if not data.get("ready"):
        raise HTTPException(status_code=503, detail={"message": "Teknik analiz modeli hazırlanıyor.", **(data.get("status") or {})})
    return data
