"""
HisseRadarPro — Score card
==========================
Answers "does the score work?" with three pieces of evidence:

1. Out of sample (walk-forward, services/ta_lab.py): deciles, yearly top/bottom results, rank IC and
   the monthly-rebalanced top/bottom decile curves since 2019.
2. Live record: the daily score snapshots written by the decision engine (score_history,
   model_version 'v3'). Once a snapshot is 20 sessions old, its deciles are compared with what the
   stocks actually did. Snapshots of earlier models are excluded.
3. Analyst information test: whether consensus upside, coverage, target revisions or fresh reports
   explain the next 20 sessions beyond the technical model (rank IC with the model's residual, per
   date, month-clustered t). A feature that clears |t| >= 2 is flagged as a candidate for the score.
"""

import logging
import math
import threading
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

H = 20
MODEL_VERSION = "v3"
_cache: Dict[str, Any] = {"key": None, "data": None}
_lock = threading.Lock()


def _closes(tickers: List[str], start: str) -> pd.DataFrame:
    from globals import report_repo
    marks = ",".join("?" * len(tickers))
    with report_repo._get_connection() as conn:
        rows = conn.execute(f"SELECT ticker, date, close FROM historical_prices WHERE date >= ? AND ticker IN ({marks})",
                            [start, *tickers]).fetchall()
    df = pd.DataFrame([tuple(r) for r in rows], columns=["ticker", "date", "close"])
    if df.empty:
        return pd.DataFrame()
    df["date"] = pd.to_datetime(df["date"].str.slice(0, 10))
    wide = df.pivot_table(index="date", columns="ticker", values="close").sort_index()
    if "XU100" in wide:
        wide = wide[wide["XU100"].notna()]
    return wide.ffill(limit=5)


def _live_record() -> Dict[str, Any]:
    from globals import report_repo
    with report_repo._get_connection() as conn:
        rows = conn.execute(
            "SELECT snapshot_date, ticker, conviction_score FROM score_history WHERE model_version = ? AND conviction_score IS NOT NULL",
            (MODEL_VERSION,),
        ).fetchall()
    snaps = pd.DataFrame([tuple(r) for r in rows], columns=["date", "ticker", "score"])
    if snaps.empty:
        return {"snapshots": 0, "evaluated": 0, "first_snapshot": None}
    first = snaps["date"].min()
    closes = _closes(sorted(set(snaps["ticker"]) | {"XU100"}), first)
    sessions = closes.index
    evaluated = []
    for d, g in snaps.groupby("date"):
        pos = sessions.searchsorted(pd.Timestamp(d))
        if pos + H + 1 >= len(sessions):
            continue
        p0, p1 = closes.iloc[pos + 1], closes.iloc[pos + 1 + H]
        fwd = (p1 / p0 - 1)
        g = g[g["ticker"].isin(fwd.index)].copy()
        g["fwd"] = g["ticker"].map(fwd)
        g = g.dropna(subset=["fwd"])
        if len(g) < 50:
            continue
        g["excess"] = g["fwd"] - g["fwd"].mean()
        g["decile"] = np.minimum(10, (g["score"] // 10).astype(int) + 1)
        evaluated.append(g.assign(date=d))
    out = {"snapshots": int(snaps["date"].nunique()), "first_snapshot": str(first), "evaluated": len(evaluated),
           "next_evaluable": None}
    pending = sorted(set(snaps["date"]) - {e["date"].iloc[0] for e in evaluated})
    if pending:
        pos = sessions.searchsorted(pd.Timestamp(pending[0]))
        out["sessions_until_first"] = int(max(0, pos + H + 1 - (len(sessions) - 1)))
    if evaluated:
        allg = pd.concat(evaluated)
        out["deciles"] = [{"decile": int(k), "mean": float(v)} for k, v in allg.groupby("decile")["excess"].mean().items()]
        ic = allg.groupby("date").apply(lambda x: x["score"].corr(x["excess"], method="spearman"))
        out["ic_mean"] = float(ic.mean())
        out["top_minus_bottom"] = float(allg[allg.decile == 10]["excess"].mean() - allg[allg.decile == 1]["excess"].mean())
    return out


def _analyst_test(lab: Dict[str, Any]) -> Dict[str, Any]:
    from globals import report_repo
    model = lab.get("model") or {}
    oos, fwd = model.get("oos_pred"), model.get("fwd20_sampled")
    if oos is None or fwd is None:
        return {"available": False}
    with report_repo._get_connection() as conn:
        rows = conn.execute(
            """SELECT UPPER(ticker), broker, substr(report_date, 1, 10), target_price FROM scraped_reports
               WHERE target_price > 0 AND ticker IS NOT NULL AND is_stale_due_to_split = 0""").fetchall()
    rep = pd.DataFrame([tuple(r) for r in rows], columns=["t", "broker", "d", "tp"])
    rep["d"] = pd.to_datetime(rep["d"], errors="coerce")
    rep = rep.dropna(subset=["d"])
    if rep.empty:
        return {"available": False}
    closes = _closes(sorted(set(rep["t"]) & set(oos.columns)), rep["d"].min().strftime("%Y-%m-%d"))
    dates = [d for d in oos.index if d >= rep["d"].min() + pd.Timedelta(days=30) and fwd.loc[d].notna().sum() > 50]
    recs = []
    for dt in dates:
        win = rep[(rep.d <= dt) & (rep.d > dt - pd.Timedelta(days=180))]
        for t, g in win.groupby("t"):
            if t not in oos.columns or t not in closes.columns or pd.isna(oos.at[dt, t]) or pd.isna(fwd.at[dt, t]):
                continue
            price = closes[t].asof(dt)
            if not price or not np.isfinite(price):
                continue
            latest = g.sort_values("d").groupby("broker").tail(1)
            g90 = g[g.d > dt - pd.Timedelta(days=90)]
            up = dn = 0
            for _, gb in g90.groupby("broker"):
                if len(gb) >= 2:
                    gb = gb.sort_values("d")
                    up += gb.tp.iloc[-1] > gb.tp.iloc[0] * 1.001
                    dn += gb.tp.iloc[-1] < gb.tp.iloc[0] * 0.999
            recs.append({"date": dt, "y": float(fwd.at[dt, t]), "model": float(oos.at[dt, t]),
                         "upside": latest.tp.mean() / price - 1, "n_brokers": latest.broker.nunique(),
                         "revision": (up - dn) / (up + dn) if up + dn else 0.0,
                         "fresh30": int((g.d > dt - pd.Timedelta(days=30)).sum())})
    df = pd.DataFrame(recs)
    if df.empty or df["date"].nunique() < 6:
        return {"available": False, "reason": "Yeterli rapor geçmişi yok."}
    df = df[(df.upside > -0.6) & (df.upside < 3)]

    def resid(g: pd.DataFrame) -> pd.Series:
        if g["model"].std() == 0:
            return g["y"] - g["y"].mean()
        b = np.polyfit(g["model"], g["y"], 1)
        return g["y"] - (b[0] * g["model"] + b[1])

    df["res"] = df.groupby("date", group_keys=False).apply(resid)
    labels = {"upside": "Konsensüs hedef potansiyeli", "n_brokers": "Kapsayan kurum sayısı",
              "revision": "Hedef revizyon yönü (90 gün)", "fresh30": "Son 30 günde rapor sayısı"}
    features = []
    for col, label in labels.items():
        res = {}
        for tgt in ("y", "res"):
            ic = df.groupby("date").apply(lambda g: g[col].corr(g[tgt], method="spearman") if g[col].std() > 0 else np.nan).dropna()
            t = ic.mean() / (ic.std(ddof=1) / math.sqrt(len(ic))) if len(ic) > 2 and ic.std() > 0 else None
            res[tgt] = {"ic": float(ic.mean()) if len(ic) else None, "t": float(t) if t is not None else None, "dates": int(len(ic))}
        candidate = res["res"]["t"] is not None and abs(res["res"]["t"]) >= 2 and res["res"]["dates"] >= 12
        features.append({"key": col, "label": label, "raw": res["y"], "beyond_model": res["res"], "candidate": bool(candidate)})
    q = df.groupby("date")["upside"].transform(lambda x: pd.qcut(x.rank(method="first"), 5, labels=False))
    quint = (df.groupby(q)["y"].mean() * 100).round(2).to_dict()
    return {"available": True, "period": f"{min(dates).date().isoformat()} – {max(dates).date().isoformat()}",
            "observations": int(len(df)), "dates": int(df["date"].nunique()), "features": features,
            "upside_quintiles": [{"quintile": int(k) + 1, "mean_pct": float(v)} for k, v in quint.items()]}


def build() -> Dict[str, Any]:
    from services import ta_lab
    lab = ta_lab.get_lab()
    if lab is None:
        return {"ready": False, "status": ta_lab.status()}
    key = lab.get("as_of"), lab.get("built_at")
    with _lock:
        if _cache["key"] == key and _cache["data"] is not None:
            live = _live_record()
            return {**_cache["data"], "live": live}
    m = lab["model"]
    data = {
        "ready": True, "as_of": lab["as_of"],
        "model": {k: m.get(k) for k in ("oos_start", "oos_end", "deciles", "yearly", "ic_mean", "ic_t",
                                         "ic_positive_months", "curve", "cagr_top", "cagr_bottom", "cagr_universe", "cost",
                                         "importance", "train_rows")},
        "analyst": _analyst_test(lab),
    }
    with _lock:
        _cache["key"], _cache["data"] = key, data
    return {**data, "live": _live_record()}
