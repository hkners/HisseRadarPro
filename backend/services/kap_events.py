"""
HisseRadarPro — KAP event studies
=================================
What did a stock do, relative to the liquid equal-weight market, after a given kind of disclosure?

- Entry: a disclosure published on a session day before 17:45 is traded at that day's close; later
  (or on a non-session day) at the next session's close. "Day-0 reaction" is the excess return from
  the previous close to the entry close, i.e. the move an investor reading the disclosure at once
  would partly have missed; the drift windows (1/5/20/60 sessions) start after the entry close.
- Episodes: repeated filings of the same kind by the same stock within 20 sessions (buybacks are
  filed almost daily) count once, at the first filing.
- Sub-types: circuit breakers split by the day's direction; capital increases by bedelsiz / bedelli
  wording; liquid stocks only (20-day turnover >= 2M TL before the event).
- Statistics: mean and median excess, share beating the market, month-clustered t (the same rules as
  the technical signal report cards). History is as long as the stored KAP feed (kap.py backfill).
"""

import datetime
import logging
import math
import threading
import time
from typing import Any, Dict

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

HORIZONS = (1, 5, 20, 60)
EPISODE_GAP = 20
CUTOFF = datetime.time(17, 45)
MIN_TURNOVER = 2_000_000
_cache: Dict[str, Any] = {"key": None, "data": None}
_lock = threading.Lock()


def invalidate() -> None:
    _cache["key"] = None


def _events() -> pd.DataFrame:
    from services.kap import CATEGORIES, _conn, _ensure_tables
    _ensure_tables()
    role_of = {c["key"]: c["role"] for c in CATEGORIES}
    with _conn() as conn:
        rows = conn.execute("""SELECT d.idx, d.publish_ts, d.category, d.summary, d.subject, t.ticker, t.role
                               FROM kap_disclosures d JOIN kap_disclosure_tickers t ON t.idx = d.idx
                               WHERE d.category IS NOT NULL""").fetchall()
    df = pd.DataFrame([tuple(r) for r in rows], columns=["idx", "ts", "category", "summary", "subject", "ticker", "role"])
    if df.empty:
        return df
    df = df[df.apply(lambda r: r["role"] == role_of.get(r["category"], "filer"), axis=1)]
    df["ts"] = pd.to_datetime(df["ts"])
    s = df["summary"].fillna("").str.lower() + " " + df["subject"].fillna("").str.lower()
    df["sub"] = ""
    cap = df["category"] == "capital"
    # A capital increase is filed in steps; the board decision is the news, the regulator's approval
    # comes months later. Each step is studied separately.
    board = s.str.contains("yönetim kurulu") | s.str.contains("yk karar")
    approval = s.str.contains("spk onay")
    for kind in ("bedelsiz", "bedelli"):
        k = cap & s.str.contains(kind) & (~s.str.contains("bedelsiz") if kind == "bedelli" else True)
        df.loc[k, "sub"] = f"{kind}, diğer adım"
        df.loc[k & board, "sub"] = f"{kind}, yönetim kurulu kararı"
        df.loc[k & approval, "sub"] = f"{kind}, SPK onayı"
    df.loc[cap & s.str.contains("tahsisli"), "sub"] = "tahsisli"
    return df


def _entry_positions(ts: pd.Series, sessions: pd.DatetimeIndex) -> np.ndarray:
    day = ts.dt.normalize()
    pos = sessions.searchsorted(day.values)  # first session on/after the publish day
    same_day = (pos < len(sessions)) & (sessions[np.minimum(pos, len(sessions) - 1)] == day.values)
    late = ts.dt.time.apply(lambda t: t >= CUTOFF).values
    return np.where(same_day & ~late, pos, pos + (same_day & late)).astype(int)


def _stats(values: pd.Series, dates: pd.Series) -> Dict[str, Any]:
    v = values.dropna()
    if len(v) < 15:
        return {"n": int(len(v)), "mean": None}
    d = pd.to_datetime(dates.loc[v.index])
    monthly = v.groupby(d.dt.to_period("M")).mean()
    t = monthly.mean() / (monthly.std(ddof=1) / math.sqrt(len(monthly))) if len(monthly) > 2 and monthly.std() > 0 else None
    return {"n": int(len(v)), "mean": float(v.mean()), "median": float(v.median()), "hit": float((v > 0).mean()),
            "t": float(t) if t is not None and np.isfinite(t) else None}


def _verdict(st: Dict[str, Any]) -> str:
    t, m = st.get("t"), st.get("mean")
    if t is None or m is None:
        return "veri_yok"
    if t >= 3:
        return "guclu_pozitif"
    if t >= 2:
        return "pozitif"
    if t <= -3:
        return "guclu_negatif"
    if t <= -2:
        return "negatif"
    return "notr"


def build() -> Dict[str, Any]:
    from services.backtest_engine import _load_frames
    from services.kap import CATEGORIES, backfill_status
    ev = _events()
    status = backfill_status()
    if ev.empty:
        return {"ready": False, "status": status, "categories": []}
    key = (int(ev["idx"].max()), len(ev))
    with _lock:
        if _cache["key"] == key:
            return _cache["data"]

    data = _load_frames()
    adj, turn = data["adj"], data["factors"]["turnover20"]
    sessions = adj.index
    names = [c for c in adj.columns if not c.startswith("XU")]
    ret = adj[names].pct_change(fill_method=None)
    liquid = turn[names] >= MIN_TURNOVER
    uni = ret.where(liquid.shift(1, fill_value=False)).mean(axis=1)

    ev = ev[ev["ticker"].isin(names)].copy()
    ev["pos"] = _entry_positions(ev["ts"], sessions)
    ev = ev[(ev["pos"] > 0) & (ev["pos"] < len(sessions))]
    ev = ev.sort_values("ts")
    # Episodes: first filing of a kind per stock, then quiet for EPISODE_GAP sessions.
    keep, last = [], {}
    for i, r in ev.iterrows():
        k = (r["ticker"], r["category"], r["sub"])
        if k in last and r["pos"] - last[k] < EPISODE_GAP:
            last[k] = r["pos"]
            continue
        last[k] = r["pos"]
        keep.append(i)
    ev = ev.loc[keep]

    cum = np.log1p(ret.fillna(0.0)).cumsum()
    ucum = np.log1p(uni.fillna(0.0)).cumsum()
    col_of = {t: j for j, t in enumerate(names)}
    C, U = cum.to_numpy(), ucum.to_numpy()
    L = liquid.to_numpy()

    def excess(p0: int, p1: int, j: int) -> float:
        if p1 >= len(sessions) or p0 < 0:
            return np.nan
        return float(np.expm1(C[p1, j] - C[p0, j]) - np.expm1(U[p1] - U[p0]))

    recs = []
    for _, r in ev.iterrows():
        j, p = col_of[r["ticker"]], int(r["pos"])
        if not L[p - 1, j]:
            continue
        rec = {"idx": r["idx"], "ticker": r["ticker"], "category": r["category"], "sub": r["sub"],
               "date": sessions[p].date().isoformat(), "day0": excess(p - 1, p, j)}
        for h in HORIZONS:
            rec[f"h{h}"] = excess(p, p + h, j)
        recs.append(rec)
    df = pd.DataFrame(recs)
    if df.empty:
        return {"ready": False, "status": status, "categories": []}
    cb = df["category"] == "circuit_breaker"
    df.loc[cb & (df["day0"] > 0), "sub"] = "yukarı"
    df.loc[cb & (df["day0"] <= 0), "sub"] = "aşağı"

    labels = {c["key"]: c["label"] for c in CATEGORIES}
    groups = []
    for (cat, sub), g in df.groupby(["category", "sub"]):
        entry = {"category": cat, "sub": sub or None, "label": labels.get(cat, cat) + (f" ({sub})" if sub else ""),
                 "events": int(len(g)), "first": g["date"].min(), "last": g["date"].max(),
                 "day0": _stats(g["day0"], g["date"]), "horizons": {h: _stats(g[f"h{h}"], g["date"]) for h in HORIZONS}}
        entry["verdict"] = _verdict(entry["horizons"][20])
        groups.append(entry)
    groups.sort(key=lambda x: -x["events"])
    out = {"ready": True, "status": status, "categories": groups, "events_total": int(len(df)),
           "period": f"{df['date'].min()} – {df['date'].max()}", "built_at": time.time(),
           "rules": {"cutoff": CUTOFF.strftime("%H:%M"), "episode_gap": EPISODE_GAP, "min_turnover": MIN_TURNOVER}}
    with _lock:
        _cache["key"], _cache["data"] = key, out
    return out
